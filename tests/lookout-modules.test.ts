import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ maindb: {} }));
vi.mock('@/lib/db/queries', () => ({}));
vi.mock('@/lib/email', () => ({}));
vi.mock('@/lib/search/chat-title', () => ({}));

import { getResponseText } from '@/lib/lookout/run-records';
import { truncateMarkdown } from '@/lib/lookout/truncate-markdown';

describe('truncateMarkdown', () => {
  it('keeps a short text whole', () => {
    expect(truncateMarkdown('Short.', 100)).toBe('Short.');
  });

  it('cuts at a paragraph boundary, not inside a link', () => {
    const text = `First paragraph.\n\nSecond with [a link](https://example.com/${'x'.repeat(40)}) inside.`;
    const cut = truncateMarkdown(text, 30);
    expect(cut).toBe('First paragraph.');
  });
});

describe('getResponseText', () => {
  it('prefers the final text', () => {
    expect(getResponseText('Answer', [])).toBe('Answer');
  });

  it('falls back to the assistant messages', () => {
    expect(
      getResponseText('', [
        { role: 'assistant', content: [{ type: 'text', text: 'Part one' }] },
        { role: 'tool', content: [] },
        { role: 'assistant', content: 'Part two' },
      ]),
    ).toBe('Part one\nPart two');
  });
});
