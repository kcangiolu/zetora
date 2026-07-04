import { describe, it, expect } from 'vitest';
import { markdownJoinerTransform } from '@/lib/parser';
import type { TextStreamPart, ToolSet } from 'ai';

// Drive the transform stream chunk-by-chunk and collect the emitted text.
async function runJoiner(chunks: string[]): Promise<string> {
  const transform = markdownJoinerTransform<ToolSet>()();
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const collected: string[] = [];
  const readAll = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === 'text-delta') collected.push((value as { text: string }).text);
    }
  })();

  for (const text of chunks) {
    await writer.write({ type: 'text-delta', text } as TextStreamPart<ToolSet>);
  }
  await writer.close();
  await readAll;
  return collected.join('');
}

describe('markdownJoinerTransform', () => {
  it('passes plain text through unchanged', async () => {
    expect(await runJoiner(['Hello ', 'world'])).toBe('Hello world');
  });

  it('reassembles a link split across chunks', async () => {
    expect(await runJoiner(['[te', 'xt](htt', 'p://x)'])).toBe('[text](http://x)');
  });

  it('keeps bold markers intact when split', async () => {
    expect(await runJoiner(['**bo', 'ld**'])).toBe('**bold**');
  });

  it('forwards non-text chunks untouched', async () => {
    const transform = markdownJoinerTransform<ToolSet>()();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();
    const types: string[] = [];
    const readAll = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        types.push(value.type);
      }
    })();
    await writer.write({ type: 'text-delta', text: 'hi' } as TextStreamPart<ToolSet>);
    await writer.write({ type: 'finish' } as unknown as TextStreamPart<ToolSet>);
    await writer.close();
    await readAll;
    expect(types).toContain('finish');
  });

  it('preserves a full markdown table', async () => {
    const table = '| a | b |\n| --- | --- |\n| 1 | 2 |\n';
    expect(await runJoiner([table])).toBe(table);
  });

  it('flushes a dangling incomplete marker on close', async () => {
    // An unterminated bold marker should still be emitted, not swallowed.
    expect(await runJoiner(['text **bold'])).toBe('text **bold');
  });
});
