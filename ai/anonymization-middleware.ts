import 'server-only';
import type { LanguageModelMiddleware } from 'ai';
import { anonymizeModelMessages, deanonymizeText, type AnonymizeContext } from '@/lib/anonymizer/pseudonymize';

type TransformParamsArgs = Parameters<NonNullable<LanguageModelMiddleware['transformParams']>>[0];
type WrapStreamArgs = Parameters<NonNullable<LanguageModelMiddleware['wrapStream']>>[0];
type WrapGenerateArgs = Parameters<NonNullable<LanguageModelMiddleware['wrapGenerate']>>[0];

// A token (e.g. "⟦PERSON_ab12cd34ef⟧") can land split across two stream
// deltas. Buffer text per stream id and only de-anonymize/emit the portion
// before the last unmatched "⟦", holding the rest back until it either
// completes or the id's stream ends (text-end/reasoning-end/flush).
class StreamTokenBuffer {
  private buffer = '';
  constructor(private ctx: Pick<AnonymizeContext, 'userId'>) {}

  async push(delta: string): Promise<string> {
    this.buffer += delta;
    const lastOpen = this.buffer.lastIndexOf('⟦');
    const lastClose = this.buffer.lastIndexOf('⟧');

    let emitNow: string;
    if (lastOpen > lastClose) {
      emitNow = this.buffer.slice(0, lastOpen);
      this.buffer = this.buffer.slice(lastOpen);
    } else {
      emitNow = this.buffer;
      this.buffer = '';
    }

    if (!emitNow) return '';
    return deanonymizeText(emitNow, this.ctx);
  }

  async flush(): Promise<string> {
    const remaining = this.buffer;
    this.buffer = '';
    if (!remaining) return '';
    return deanonymizeText(remaining, this.ctx);
  }
}

// Built by resolveModel/resolveTertiaryModel with the concrete per-request
// context (userId, deny terms, fail-open) — unlike dynamicXmlToolMiddleware
// this can't be a static singleton since the vault/token scope is per-user.
export function createAnonymizationMiddleware(ctx: AnonymizeContext): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',

    // Prompt (system/user/assistant/tool history) is tokenized here, right
    // before it leaves this process for the provider.
    transformParams: async (args: TransformParamsArgs) => {
      const { params } = args;
      return {
        ...params,
        prompt: (await anonymizeModelMessages(params.prompt, ctx)) as typeof params.prompt,
      };
    },

    // Non-streaming generation: de-anonymize the visible text/reasoning so
    // the user reads real values. Tool-call inputs are intentionally left
    // as-is (still tokenized) — the model only ever saw pseudonyms, so its
    // tool calls are already in token space; tools that need egress
    // protection re-mask defensively at the tool-loader boundary instead of
    // this being un-done here (see lib/search/tool-loader.ts).
    wrapGenerate: async (args: WrapGenerateArgs) => {
      const result = await args.doGenerate();
      const content = await Promise.all(
        result.content.map(async (part: any) => {
          if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string') {
            return { ...part, text: await deanonymizeText(part.text, ctx) };
          }
          return part;
        }),
      );
      return { ...result, content: content as typeof result.content };
    },

    // Streaming generation: de-anonymize deltas as they arrive, buffering
    // across chunk boundaries so a token is never split mid-emit.
    wrapStream: async (args: WrapStreamArgs) => {
      const { stream, ...rest } = await args.doStream();
      const textBuffers = new Map<string, StreamTokenBuffer>();
      const reasoningBuffers = new Map<string, StreamTokenBuffer>();

      const getBuffer = (map: Map<string, StreamTokenBuffer>, id: string) => {
        let buf = map.get(id);
        if (!buf) {
          buf = new StreamTokenBuffer(ctx);
          map.set(id, buf);
        }
        return buf;
      };

      const transformed = stream.pipeThrough(
        new TransformStream<any, any>({
          async transform(chunk, controller) {
            switch (chunk.type) {
              case 'text-delta': {
                const delta = await getBuffer(textBuffers, chunk.id).push(chunk.delta);
                if (delta) controller.enqueue({ ...chunk, delta });
                return;
              }
              case 'reasoning-delta': {
                const delta = await getBuffer(reasoningBuffers, chunk.id).push(chunk.delta);
                if (delta) controller.enqueue({ ...chunk, delta });
                return;
              }
              case 'text-end': {
                const buf = textBuffers.get(chunk.id);
                textBuffers.delete(chunk.id);
                const remaining = await buf?.flush();
                if (remaining) controller.enqueue({ type: 'text-delta', id: chunk.id, delta: remaining });
                controller.enqueue(chunk);
                return;
              }
              case 'reasoning-end': {
                const buf = reasoningBuffers.get(chunk.id);
                reasoningBuffers.delete(chunk.id);
                const remaining = await buf?.flush();
                if (remaining) controller.enqueue({ type: 'reasoning-delta', id: chunk.id, delta: remaining });
                controller.enqueue(chunk);
                return;
              }
              default:
                controller.enqueue(chunk);
            }
          },
          async flush(controller) {
            for (const [id, buf] of textBuffers) {
              const remaining = await buf.flush();
              if (remaining) controller.enqueue({ type: 'text-delta', id, delta: remaining });
            }
            for (const [id, buf] of reasoningBuffers) {
              const remaining = await buf.flush();
              if (remaining) controller.enqueue({ type: 'reasoning-delta', id, delta: remaining });
            }
          },
        }),
      );

      return { stream: transformed, ...rest };
    },
  };
}
