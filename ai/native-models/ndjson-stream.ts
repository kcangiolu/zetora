import 'server-only';
import { safeParseJSON, type FlexibleSchema, type ParseResult } from '@ai-sdk/provider-utils';

// Ollama's /api/chat and /api/generate stream newline-delimited JSON, not SSE
// (no `data:` framing) — @ai-sdk/provider-utils only ships an SSE handler, so
// this is hand-rolled. Buffers across chunk boundaries since a single JSON
// line can be split across two TCP reads; blank lines are skipped.
export function parseNdjsonStream<T>({
  stream,
  schema,
}: {
  stream: ReadableStream<Uint8Array>;
  schema: FlexibleSchema<T>;
}): ReadableStream<ParseResult<T>> {
  const decoder = new TextDecoder();
  let buffer = '';

  return stream.pipeThrough(
    new TransformStream<Uint8Array, ParseResult<T>>({
      async transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          controller.enqueue(await safeParseJSON({ text: trimmed, schema }));
        }
      },

      async flush(controller) {
        const trimmed = buffer.trim();
        if (trimmed.length > 0) {
          controller.enqueue(await safeParseJSON({ text: trimmed, schema }));
        }
      },
    }),
  );
}
