import 'server-only';
import type { LanguageModelMiddleware } from 'ai';
import type { LanguageModelV3Content, LanguageModelV3StreamPart } from '@ai-sdk/provider';

// Converts arbitrary (possibly multi-character, asymmetric) open/close
// delimiter spans in a model's raw text output into reasoning-start/delta/end
// chunks vs text-start/delta/end for everything else. extractReasoningMiddleware
// (the `ai` package's own tool) only supports <tagName>/</tagName>-shaped
// pairs — a template's real delimiters (e.g. this Gemma-based merge's
// `<|channel>thought\n` / `\n<channel|>`, derived by
// ai/native-models/llamacpp-prompt.ts's deriveReasoningDelimiters) don't fit
// that shape at all, hence this bespoke middleware.
export function createReasoningDelimiterMiddleware(
  open: string,
  close: string,
  startsInReasoning: boolean,
): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      return { stream: transformStream(stream, open, close, startsInReasoning), ...rest };
    },
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return { ...result, content: splitGenerateContent(result.content, open, close, startsInReasoning) };
    },
  };
}

type Mode = 'text' | 'reasoning';

function startType(mode: Mode): 'text-start' | 'reasoning-start' {
  return mode === 'reasoning' ? 'reasoning-start' : 'text-start';
}
function deltaType(mode: Mode): 'text-delta' | 'reasoning-delta' {
  return mode === 'reasoning' ? 'reasoning-delta' : 'text-delta';
}
function endType(mode: Mode): 'text-end' | 'reasoning-end' {
  return mode === 'reasoning' ? 'reasoning-end' : 'text-end';
}

// New logic, not adapted from xml-tool-middleware.ts's normalizeTextBoundaries
// (which only re-homes ids on already-segmented text/reasoning parts and does
// no substring scanning of its own — this middleware's job is fundamentally
// different: content-based mode-switching with cross-chunk delimiter
// detection). The "one canonical open id per run" discipline is carried over
// deliberately, since this stacks with dynamicXmlToolMiddleware's parser
// chain (native llamacpp always forces XML tool parsing), so the same
// multi-id-drift failure mode normalizeTextBoundaries was built to fix is
// still in play here, one layer up.
function transformStream(
  stream: ReadableStream<LanguageModelV3StreamPart>,
  open: string,
  close: string,
  startsInReasoning: boolean,
): ReadableStream<LanguageModelV3StreamPart> {
  let mode: Mode = startsInReasoning ? 'reasoning' : 'text';
  let pending = '';
  let openId: string | null = null;
  let idCounter = 0;
  const maxDelimLen = Math.max(open.length, close.length);

  return new ReadableStream<LanguageModelV3StreamPart>({
    async start(controller) {
      const reader = stream.getReader();

      const emit = (text: string) => {
        if (text.length === 0) return;
        if (openId === null) {
          openId = `reasoning-delim-${idCounter++}`;
          controller.enqueue({ type: startType(mode), id: openId });
        }
        controller.enqueue({ type: deltaType(mode), id: openId, delta: text });
      };

      const closeCurrent = () => {
        if (openId === null) return;
        controller.enqueue({ type: endType(mode), id: openId });
        openId = null;
      };

      // Drains every complete delimiter occurrence already buffered, then
      // emits everything except a small trailing window that could still be
      // the start of a delimiter split across this chunk and the next.
      const drain = (final: boolean) => {
        for (;;) {
          const delim = mode === 'text' ? open : close;
          const idx = pending.indexOf(delim);
          if (idx === -1) break;
          emit(pending.slice(0, idx));
          closeCurrent();
          mode = mode === 'text' ? 'reasoning' : 'text';
          pending = pending.slice(idx + delim.length);
        }
        const holdBack = final ? 0 : Math.max(0, maxDelimLen - 1);
        if (pending.length > holdBack) {
          emit(pending.slice(0, pending.length - holdBack));
          pending = pending.slice(pending.length - holdBack);
        }
        if (final) closeCurrent();
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            drain(true);
            controller.close();
            return;
          }

          if (value.type === 'text-delta') {
            pending += value.delta;
            drain(false);
            continue;
          }
          if (value.type === 'text-start' || value.type === 'text-end') {
            // Swallowed — this middleware synthesizes its own start/end pairs
            // (see emit/closeCurrent) rather than forwarding upstream's,
            // since upstream's ids don't correspond to our reasoning/text split.
            continue;
          }

          // Any other chunk type (tool-call, finish, error, source, ...)
          // can't sensibly happen "inside" an open text/reasoning run —
          // flush whatever's pending, close the current part, then forward
          // the chunk unchanged.
          drain(true);
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// Pure — used by wrapGenerate, where the full text is already buffered so no
// cross-chunk hold-back is needed.
function splitReasoning(
  text: string,
  open: string,
  close: string,
  startsInReasoning: boolean,
): Array<{ type: Mode; content: string }> {
  const segments: Array<{ type: Mode; content: string }> = [];
  let mode: Mode = startsInReasoning ? 'reasoning' : 'text';
  let rest = text;
  for (;;) {
    const delim = mode === 'text' ? open : close;
    const idx = rest.indexOf(delim);
    if (idx === -1) {
      if (rest.length > 0) segments.push({ type: mode, content: rest });
      break;
    }
    if (idx > 0) segments.push({ type: mode, content: rest.slice(0, idx) });
    mode = mode === 'text' ? 'reasoning' : 'text';
    rest = rest.slice(idx + delim.length);
  }
  return segments;
}

function splitGenerateContent(
  content: LanguageModelV3Content[],
  open: string,
  close: string,
  startsInReasoning: boolean,
): LanguageModelV3Content[] {
  const result: LanguageModelV3Content[] = [];
  let firstText = true;
  for (const part of content) {
    if (part.type !== 'text') {
      result.push(part);
      continue;
    }
    const segments = splitReasoning(part.text, open, close, firstText && startsInReasoning);
    firstText = false;
    for (const segment of segments) {
      result.push(
        segment.type === 'reasoning'
          ? { type: 'reasoning', text: segment.content }
          : { type: 'text', text: segment.content },
      );
    }
  }
  return result;
}
