import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { uiMessageChunkSchema } from 'ai';
import { withSseKeepAlive } from '@/lib/search/sse-keep-alive';

const FRAME = ': keep-alive\n\n';

function controlledSource() {
  let controller!: ReadableStreamDefaultController<string>;
  let cancelled: unknown = undefined;
  const stream = new ReadableStream<string>({
    start(c) {
      controller = c;
    },
    cancel(reason) {
      cancelled = reason ?? 'cancelled';
    },
  });
  return { stream, controller, wasCancelled: () => cancelled !== undefined };
}

describe('withSseKeepAlive', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends a comment frame every interval while the source is silent', async () => {
    const source = controlledSource();
    const reader = withSseKeepAlive(source.stream, 1_000).getReader();

    source.controller.enqueue('data: {"type":"start"}\n\n');
    expect(await reader.read()).toEqual({ done: false, value: 'data: {"type":"start"}\n\n' });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(await reader.read()).toEqual({ done: false, value: FRAME });
    expect(await reader.read()).toEqual({ done: false, value: FRAME });
  });

  it('stops sending frames once the source ends', async () => {
    const source = controlledSource();
    const reader = withSseKeepAlive(source.stream, 1_000).getReader();

    source.controller.enqueue('data: [DONE]\n\n');
    source.controller.close();
    expect(await reader.read()).toEqual({ done: false, value: 'data: [DONE]\n\n' });
    expect(await reader.read()).toEqual({ done: true, value: undefined });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the source and stops sending frames when the client goes away', async () => {
    const source = controlledSource();
    const reader = withSseKeepAlive(source.stream, 1_000).getReader();

    await reader.cancel('client disconnected');

    expect(source.wasCancelled()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a source error on and stops sending frames', async () => {
    const source = controlledSource();
    const reader = withSseKeepAlive(source.stream, 1_000).getReader();

    source.controller.error(new Error('generation failed'));

    await expect(reader.read()).rejects.toThrow('generation failed');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('keep-alive frames on the client', () => {
  it('are skipped by the AI SDK stream parser', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: {"type":"start"}\n\n${FRAME}${FRAME}`));
        controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
        controller.close();
      },
    });

    const reader = parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema }).getReader();
    const types: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.success) throw value.error;
      types.push(value.value.type);
    }

    expect(types).toEqual(['start', 'finish']);
  });
});
