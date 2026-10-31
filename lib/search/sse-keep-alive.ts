// WebKit (Safari, iOS PWAs) can stop handing a fetch body to the page when the bytes
// arrive while the main thread is busy, as it is while a chat page loads and re-attaches
// to a reply: what already arrived stays undelivered until more bytes come in. A reply
// waiting on a slow tool sends nothing for minutes, so the chat showed an early point of
// the reply until the tool finished. A comment frame every second bounds that wait (SSE
// parsers skip comments), and keeps a proxy from closing a stream silent past its read
// timeout.
const SSE_KEEP_ALIVE_INTERVAL_MS = 1_000;
const KEEP_ALIVE_FRAME = ': keep-alive\n\n';

export function withSseKeepAlive(
  stream: ReadableStream<string>,
  intervalMs: number = SSE_KEEP_ALIVE_INTERVAL_MS,
): ReadableStream<string> {
  const reader = stream.getReader();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stopKeepAlive = () => clearInterval(timer);

  return new ReadableStream<string>({
    start(controller) {
      timer = setInterval(() => controller.enqueue(KEEP_ALIVE_FRAME), intervalMs);
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          stopKeepAlive();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        stopKeepAlive();
        controller.error(error);
      }
    },
    cancel(reason) {
      stopKeepAlive();
      return reader.cancel(reason);
    },
  });
}
