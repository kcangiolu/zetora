// dynamicXmlToolMiddleware's 3-layer parser chain (ai/xml-tool-middleware.ts)
// re-emits redundant text-start/text-end pairs per step. extractReasoningMiddleware
// (lib/reasoning-effort.ts's mask middlewares) only tracks a single pending
// text-start at a time, so a second text-start overwrites the first before it
// is ever forwarded — the text-end that was meant to close it then arrives
// for an id that was never opened. Both streamText's own internal content
// tracker (activeTextContent/activeReasoningContent in the 'ai' package,
// confirmed by reading node_modules/ai/dist/index.mjs) and text-part-only
// mismatches surface this as `{ type: 'error', error/errorText: '<text|reasoning>
// part <id> not found' }` — confirmed live on both variants, not just text.
// It's harmless — every real content chunk still arrives correctly on either
// side of it — but useChat's internal stream consumption rethrows on ANY
// inbound error chunk and abandons reading the rest of the stream (confirmed
// against the 'ai' package's ChatStore source), while the server keeps
// generating in the background via streamText's result.consumeStream(). That
// leaves the client stuck showing "No response generated" while the model is
// still actively working. Drop this one known-benign error before it reaches
// the client rather than trying to fix either third-party package.
const BENIGN_PART_NOT_FOUND = /^(?:text|reasoning) part .+ not found$/;

export function dropBenignTextPartErrors<T extends { type: string }>(stream: ReadableStream<T>): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        const errorText = (chunk as { errorText?: unknown }).errorText;
        if (chunk.type === 'error' && typeof errorText === 'string' && BENIGN_PART_NOT_FOUND.test(errorText)) {
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
