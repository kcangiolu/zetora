// ai/xml-tool-middleware.ts re-emits text-start/text-end pairs that the reasoning mask
// middleware (one pending text-start at a time) drops, so streamText reports
// '<text|reasoning> part <id> not found'. The content is intact, but useChat stops
// reading the stream on any error chunk while the server keeps generating, leaving the
// client on "No response generated". This drops that one benign error.
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
