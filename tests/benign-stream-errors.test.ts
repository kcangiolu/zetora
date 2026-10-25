import { describe, it, expect } from 'vitest';
import { dropBenignTextPartErrors } from '@/lib/search/benign-stream-errors';

type Chunk = { type: string; errorText?: string };

function streamOf(chunks: Chunk[]): ReadableStream<Chunk> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Chunk>): Promise<Chunk[]> {
  const reader = stream.getReader();
  const out: Chunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

describe('dropBenignTextPartErrors', () => {
  it('drops "text part <id> not found" errors from the XML + reasoning-mask middleware ID mismatch', async () => {
    const out = await collect(
      dropBenignTextPartErrors(
        streamOf([
          { type: 'text-start' },
          { type: 'error', errorText: 'text part txt-0 not found' },
          { type: 'error', errorText: 'text part f99261206bbb4 not found' },
          { type: 'text-end' },
        ]),
      ),
    );
    expect(out).toEqual([{ type: 'text-start' }, { type: 'text-end' }]);
  });

  it('drops "reasoning part <id> not found" errors too — same ID-mismatch mechanism, the sibling part type', async () => {
    const out = await collect(
      dropBenignTextPartErrors(
        streamOf([
          { type: 'reasoning-start' },
          { type: 'error', errorText: 'reasoning part reasoning-0 not found' },
          { type: 'reasoning-end' },
        ]),
      ),
    );
    expect(out).toEqual([{ type: 'reasoning-start' }, { type: 'reasoning-end' }]);
  });

  it('keeps a genuine error untouched — never masks real failures', async () => {
    const genuineError = { type: 'error', errorText: 'Rate limit exceeded' };
    const out = await collect(dropBenignTextPartErrors(streamOf([genuineError])));
    expect(out).toEqual([genuineError]);
  });

  it('keeps an error chunk with no errorText untouched', async () => {
    const errorNoText = { type: 'error' };
    const out = await collect(dropBenignTextPartErrors(streamOf([errorNoText])));
    expect(out).toEqual([errorNoText]);
  });

  it('passes every other chunk type through unchanged', async () => {
    const chunks: Chunk[] = [{ type: 'start' }, { type: 'reasoning-delta' }, { type: 'tool-call' }, { type: 'finish' }];
    const out = await collect(dropBenignTextPartErrors(streamOf(chunks)));
    expect(out).toEqual(chunks);
  });
});
