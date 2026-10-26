import { describe, it, expect } from 'vitest';

import { voiceToolHistoryFromParts, voiceToolPreview, voiceToolStatus } from '@/lib/voice-tool-steps';

describe('voiceToolPreview', () => {
  it('joins the queries of a search', () => {
    expect(voiceToolPreview({ queries: ['first', 'second'], maxResults: [5] })).toBe('first · second');
  });

  it('falls back to the URL, query or place the tool was called with', () => {
    expect(voiceToolPreview({ url: 'https://example.com/page' })).toBe('https://example.com/page');
    expect(voiceToolPreview({ location: 'Paris' })).toBe('Paris');
  });

  it('has nothing to show for a tool without a subject', () => {
    expect(voiceToolPreview({})).toBeNull();
    expect(voiceToolPreview(undefined)).toBeNull();
  });

  it('shortens a long subject', () => {
    expect(voiceToolPreview({ queries: ['x'.repeat(200)] })).toHaveLength(120);
  });
});

describe('voiceToolStatus', () => {
  it('is ok for a tool without failed searches', () => {
    expect(voiceToolStatus({ searches: [{ query: 'q', results: [] }] })).toBe('ok');
    expect(voiceToolStatus({ temperature: 12 })).toBe('ok');
  });

  it('says in plain words how many searches failed and what the reply rests on', () => {
    expect(
      voiceToolStatus({
        searches: [
          { query: 'a', results: [], error: 'SearXNG failed: no engine answered' },
          { query: 'b', results: [], error: 'SearXNG failed: no engine answered' },
          { query: 'c', results: [{ url: 'https://example.com' }] },
        ],
      }),
    ).toBe('2 of 3 searches failed. The reply uses the results of the other searches.');
  });
});

describe('voiceToolHistoryFromParts', () => {
  it('keeps only finished steps of the Voice model tools', () => {
    const history = voiceToolHistoryFromParts([
      { type: 'text', text: 'hello' },
      { type: 'tool-code_interpreter', toolCallId: 'a', state: 'output-available', input: {}, output: 'x' },
      { type: 'tool-web_search', toolCallId: 'b', state: 'input-available', input: {} },
      { type: 'tool-datetime', toolCallId: 'c', state: 'output-available', input: {}, output: '2026-10-26' },
    ]);
    expect(history).toEqual([
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c', toolName: 'datetime', input: {} }] },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c',
            toolName: 'datetime',
            output: { type: 'text', value: '2026-10-26' },
          },
        ],
      },
    ]);
  });
});
