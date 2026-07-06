import { describe, it, expect } from 'vitest';
import {
  clampSearchInput,
  dedupeAndCapSearches,
  formatSnippet,
  normalizeUrl,
  MAX_QUERIES,
  MAX_RESULTS_PER_QUERY,
  MIN_RESULTS_PER_QUERY,
  DEFAULT_RESULTS_PER_QUERY,
  type SearchEntry,
} from '@/lib/tools/web-search-limits';

function entry(query: string, urls: string[], content = 'x'.repeat(50)): SearchEntry {
  return {
    query,
    results: urls.map((url, i) => ({ url, title: `t${i}`, content })),
    images: [],
  };
}

describe('clampSearchInput', () => {
  it('truncates the query list to MAX_QUERIES', () => {
    const input = clampSearchInput({ queries: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(input.queries).toHaveLength(MAX_QUERIES);
  });

  it('clamps maxResults into [MIN, MAX] and fills missing entries with the default', () => {
    const input = clampSearchInput({ queries: ['a', 'b', 'c'], maxResults: [20, 1, undefined] });
    expect(input.maxResults).toEqual([MAX_RESULTS_PER_QUERY, MIN_RESULTS_PER_QUERY, DEFAULT_RESULTS_PER_QUERY]);
  });

  it('keeps maxResults aligned with the truncated queries', () => {
    const input = clampSearchInput({ queries: ['a', 'b', 'c', 'd', 'e', 'f'], maxResults: [8, 8, 8, 8, 8, 8] });
    expect(input.maxResults).toHaveLength(MAX_QUERIES);
  });
});

describe('normalizeUrl', () => {
  it('strips utm params, fbclid, hash and trailing slash', () => {
    expect(normalizeUrl('https://Example.com/page/?utm_source=x&fbclid=1#section')).toBe('https://example.com/page');
  });

  it('keeps meaningful query params', () => {
    expect(normalizeUrl('https://example.com/search?q=tesla')).toBe('https://example.com/search?q=tesla');
  });

  it('does not throw on invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('formatSnippet', () => {
  it('truncates at a word boundary and appends an ellipsis', () => {
    const snippet = formatSnippet({ url: 'u', title: 't', content: 'word '.repeat(200) }, 100);
    expect(snippet.length).toBeLessThanOrEqual(100);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).not.toMatch(/wor…$/);
  });

  it('prefixes the publication date when present', () => {
    const snippet = formatSnippet({ url: 'u', title: 't', content: 'short', published_date: '2026-07-01T10:00:00Z' });
    expect(snippet).toBe('(2026-07-01) short');
  });

  it('leaves short content untouched', () => {
    expect(formatSnippet({ url: 'u', title: 't', content: 'short' })).toBe('short');
  });
});

describe('dedupeAndCapSearches', () => {
  it('deduplicates the same URL across queries (normalized)', () => {
    const searches = [
      entry('q1', ['https://a.com/x?utm_source=1']),
      entry('q2', ['https://a.com/x', 'https://b.com/y']),
    ];
    const capped = dedupeAndCapSearches(searches);
    const urls = capped.flatMap((s) => s.results.map((r) => r.url));
    expect(urls).toEqual(['https://a.com/x?utm_source=1', 'https://b.com/y']);
  });

  it('caps results per domain', () => {
    const searches = [entry('q1', [1, 2, 3, 4, 5].map((i) => `https://same.com/p${i}`))];
    const capped = dedupeAndCapSearches(searches, { perDomainCap: 3 });
    expect(capped[0].results).toHaveLength(3);
  });

  it('applies the global cap round-robin so every query keeps its best hits', () => {
    const searches = [
      entry('q1', [1, 2, 3, 4].map((i) => `https://a${i}.com/`)),
      entry('q2', [1, 2, 3, 4].map((i) => `https://b${i}.com/`)),
    ];
    const capped = dedupeAndCapSearches(searches, { globalCap: 4 });
    expect(capped[0].results).toHaveLength(2);
    expect(capped[1].results).toHaveLength(2);
    expect(capped[0].results[0].url).toBe('https://a1.com/');
    expect(capped[1].results[0].url).toBe('https://b1.com/');
  });

  it('truncates snippet content', () => {
    const searches = [entry('q1', ['https://a.com/'], 'z'.repeat(2000))];
    const capped = dedupeAndCapSearches(searches, { snippetMaxChars: 400 });
    expect(capped[0].results[0].content.length).toBeLessThanOrEqual(400);
  });

  it('preserves the per-query structure and other fields', () => {
    const searches = [entry('q1', ['https://a.com/']), entry('q2', [])];
    const capped = dedupeAndCapSearches(searches);
    expect(capped).toHaveLength(2);
    expect(capped[0].query).toBe('q1');
    expect(capped[1].results).toEqual([]);
  });
});
