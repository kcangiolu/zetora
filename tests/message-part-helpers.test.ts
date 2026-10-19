import { describe, it, expect } from 'vitest';

import { buildMarkdownExport } from '@/components/message-parts/export-menu';
import { buildSourceItems } from '@/components/message-parts/message-sources';
import {
  cleanModelText,
  getMcpTimelineRange,
  joinReasoningChunks,
  mergeReasoningStates,
} from '@/components/message-parts/part-helpers';
import type { ChatMessage } from '@/lib/types';

type Part = ChatMessage['parts'][number];

const text = (t: string): Part => ({ type: 'text', text: t });
const mcpTool = (id: string): Part =>
  ({
    type: 'dynamic-tool',
    toolName: 'mcp_github_search',
    toolCallId: id,
    state: 'input-available',
    input: {},
  }) as Part;

describe('cleanModelText', () => {
  it('drops the special tokens local models leave', () => {
    expect(cleanModelText('<|begin_of_box|>42<|end_of_box|><|im_end|>')).toBe('42');
  });
});

describe('reasoning chunks', () => {
  it('joins token streams as is and chunk streams by paragraph', () => {
    expect(joinReasoningChunks(['Think', 'ing ', 'hard'])).toBe('Thinking hard');
    const chunk = 'A whole sentence the provider sent at once.';
    expect(joinReasoningChunks([chunk, chunk])).toBe(`${chunk}\n\n${chunk}`);
  });

  it('is streaming while any chunk is', () => {
    expect(mergeReasoningStates(['done', 'streaming'])).toBe('streaming');
    expect(mergeReasoningStates(['done'])).toBe('done');
    expect(mergeReasoningStates([])).toBeUndefined();
  });
});

describe('getMcpTimelineRange', () => {
  it('is null without MCP calls', () => {
    expect(getMcpTimelineRange([text('hi')])).toBeNull();
  });

  it('spans the lead-in, the calls, and stops before the final answer', () => {
    const parts: Part[] = [
      { type: 'step-start' },
      text('Let me look.'),
      mcpTool('a'),
      text('Now the second one.'),
      mcpTool('b'),
      text('x'.repeat(60)),
    ];
    expect(getMcpTimelineRange(parts)).toEqual({ start: 0, end: 4, firstTool: 2, lastTool: 4 });
  });
});

describe('buildMarkdownExport', () => {
  it('lists the links of the answer once, without trailing punctuation', () => {
    const md = buildMarkdownExport('See [the docs](https://a.test/docs). Also https://b.test, and https://a.test/docs');
    expect(md).toBe(
      'See [the docs](https://a.test/docs). Also https://b.test, and https://a.test/docs\n\n## References\n\n- [the docs](https://a.test/docs)\n- [https://b.test](https://b.test)',
    );
  });

  it('leaves an answer without links alone', () => {
    expect(buildMarkdownExport('No links here.')).toBe('No links here.');
  });
});

describe('buildSourceItems', () => {
  it('keeps one item per URL and names untitled sources after their host', () => {
    const items = buildSourceItems(
      [
        { type: 'source-url', sourceId: 's1', url: 'https://blog.rust-lang.org/post', title: '3' },
        { type: 'source-url', sourceId: 's2', url: 'https://blog.rust-lang.org/post' },
        text('answer'),
      ],
      0,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 's1',
      hostname: 'blog.rust-lang.org',
      displayTitle: 'Blog · Rust-lang · Org',
    });
  });
});
