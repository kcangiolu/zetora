import { describe, it, expect } from 'vitest';

import { voiceToolPreview, voiceToolStatus } from '@/lib/voice-tool-steps';

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

  it('gives the distinct reasons of the failed searches', () => {
    expect(
      voiceToolStatus({
        searches: [
          { query: 'a', results: [], error: 'SearXNG failed: no engine answered' },
          { query: 'b', results: [], error: 'SearXNG failed: no engine answered' },
          { query: 'c', results: [{ url: 'https://example.com' }] },
        ],
      }),
    ).toBe('SearXNG failed: no engine answered');
  });
});
