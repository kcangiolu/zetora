import 'server-only';
import type { LanguageModelMiddleware } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import {
  morphXmlToolMiddleware,
  morphXmlProtocol,
  qwen3CoderToolMiddleware,
  hermesToolMiddleware,
  wrapStream as parserWrapStream,
  wrapGenerate as parserWrapGenerate,
} from '@ai-sdk-tool/parser';

// The stock morphXmlToolMiddleware throws RXMLDuplicateStringTagError when a
// scalar (non-array) parameter tag appears more than once — which local
// models routinely do (e.g. repeating <language>fr</language> once per
// <queries> entry instead of once overall). That throw propagates out of the
// parser and, combined with emitRawToolCallTextOnError below, leaks the
// entire raw <web_search>...</web_search> block to the user instead of
// executing the tool. Build our own protocol instance with lenient parsing
// (keep the first occurrence) instead of the preconfigured singleton, whose
// parseOptions can't be overridden after construction. Only wrapStream/
// wrapGenerate need this — transformParams (system prompt + schema encoding)
// doesn't consume parseOptions, so morphXmlToolMiddleware.transformParams is
// still used unchanged below.
const lenientMorphXmlProtocol = morphXmlProtocol({
  parseOptions: { throwOnDuplicateStringTags: false },
});
const lenientMorphXmlToolMiddleware: Pick<LanguageModelMiddleware, 'wrapStream' | 'wrapGenerate'> = {
  wrapStream: ({ doStream, doGenerate, params }) =>
    parserWrapStream({ protocol: lenientMorphXmlProtocol, doStream, doGenerate, params }),
  wrapGenerate: ({ doGenerate, params }) => parserWrapGenerate({ protocol: lenientMorphXmlProtocol, doGenerate, params }),
};

// Models drift between tool-call syntaxes regardless of the format they were
// instructed to use (observed with Qwen3.6 via llama.cpp and DeepSeek via
// OpenRouter). Instead of making the user pick one protocol, instruct with
// Morph XML but parse the output through every known protocol in sequence:
// each layer converts its own format into tool-call chunks and passes
// everything else through to the next.
const parserChain = [lenientMorphXmlToolMiddleware, qwen3CoderToolMiddleware, hermesToolMiddleware];

type TransformParamsArgs = Parameters<NonNullable<LanguageModelMiddleware['transformParams']>>[0];
type WrapStreamArgs = Parameters<NonNullable<LanguageModelMiddleware['wrapStream']>>[0];
type WrapGenerateArgs = Parameters<NonNullable<LanguageModelMiddleware['wrapGenerate']>>[0];

type PromptMessage = { role: string; [key: string]: unknown };

// morphXmlToolMiddleware injects its tool-instruction system message at the
// END of the prompt when there is no leading system message. Many local chat
// templates (e.g. Qwen3 via llama.cpp) enforce "system message must be at the
// beginning" and hard-fail otherwise. Consolidate every system message into a
// single one at index 0, preserving order, so the transformed prompt stays
// compatible with those templates.
export function hoistSystemMessagesToFront(prompt: PromptMessage[]): PromptMessage[] {
  const systemMessages = prompt.filter((m) => m.role === 'system');
  if (systemMessages.length === 0) return prompt;

  const alreadyCorrect = systemMessages.length === 1 && prompt[0]?.role === 'system';
  if (alreadyCorrect) return prompt;

  const nonSystem = prompt.filter((m) => m.role !== 'system');
  return [...systemMessages, ...nonSystem];
}

// The 3-layer parserChain above re-wraps the same underlying text stream
// three times, and each layer independently re-emits its own text-start/
// text-end boundary around the content it passes through — so a single real
// text run can surface as several redundant text-start/text-delta/text-end
// triples with DIFFERENT random ids, all describing the same content.
// Consumers stacked on top that track "the current open text id" as a single
// slot (extractReasoningMiddleware's delayedTextStart, used by every
// reasoning-mask middleware in lib/reasoning-effort.ts) get a second
// text-start before the first was ever forwarded, silently drop the first
// one, and later choke on its now-orphaned text-end — surfacing downstream
// as `AI_UIMessageStreamError: Received text-end for missing text part`,
// which crashes the whole response (confirmed live: "failed to pipe
// response", 500). Force every text-start/text-delta/text-end through a
// single canonical id per open run, so at most one text part is ever open at
// a time and nothing downstream can lose track of it.
export function normalizeTextBoundaries(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): ReadableStream<LanguageModelV3StreamPart> {
  let openId: string | null = null;
  return stream.pipeThrough(
    new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
      transform(chunk, controller) {
        if (chunk.type === 'text-start') {
          // A text part is already open — this is a redundant boundary from
          // the parser chain; keep using the one already open instead of
          // starting a second, competing one.
          if (openId !== null) return;
          openId = chunk.id;
          controller.enqueue(chunk);
          return;
        }
        if (chunk.type === 'text-delta') {
          if (openId === null) {
            // Orphaned delta with no open text part — synthesize one instead
            // of dropping real model output.
            openId = chunk.id;
            controller.enqueue({ type: 'text-start', id: openId });
          }
          controller.enqueue(openId === chunk.id ? chunk : { ...chunk, id: openId });
          return;
        }
        if (chunk.type === 'text-end') {
          // Nothing open to close — the redundant end this whole function
          // exists to neutralize. Drop it.
          if (openId === null) return;
          controller.enqueue(openId === chunk.id ? chunk : { ...chunk, id: openId });
          openId = null;
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

export const dynamicXmlToolMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',

  transformParams: async (args: TransformParamsArgs) => {
    const params = await morphXmlToolMiddleware.transformParams!(args);
    const toolCallMiddleware = (params.providerOptions?.toolCallMiddleware ?? {}) as Record<string, unknown>;
    return {
      ...params,
      prompt: hoistSystemMessagesToFront(params.prompt as unknown as PromptMessage[]) as typeof params.prompt,
      providerOptions: {
        ...params.providerOptions,
        toolCallMiddleware: {
          ...toolCallMiddleware,
          // On parse failure, re-emit the raw text instead of swallowing it so
          // the next parser in the chain gets a chance to recognize the format
          // (qwen3-coder and hermes share the <tool_call> start marker).
          emitRawToolCallTextOnError: true,
        },
      },
    };
  },

  wrapStream: async (args: WrapStreamArgs) => {
    let next = args.doStream;
    for (const middleware of parserChain) {
      const doStream = next;
      next = () => middleware.wrapStream!({ ...args, doStream }) as ReturnType<WrapStreamArgs['doStream']>;
    }
    const result = await next();
    return { ...result, stream: normalizeTextBoundaries(result.stream) };
  },

  wrapGenerate: async (args: WrapGenerateArgs) => {
    let next = args.doGenerate;
    for (const middleware of parserChain) {
      const doGenerate = next;
      next = () => middleware.wrapGenerate!({ ...args, doGenerate }) as ReturnType<WrapGenerateArgs['doGenerate']>;
    }
    return next();
  },
};
