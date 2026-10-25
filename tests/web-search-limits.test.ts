import { describe, it, expect, afterEach } from 'vitest';
import {
  clampSearchInput,
  dedupeAndCapSearches,
  enrichBestQualityResults,
  formatSnippet,
  normalizeUrl,
  MAX_QUERIES,
  MAX_RESULTS_PER_QUERY,
  MIN_RESULTS_PER_QUERY,
  DEFAULT_RESULTS_PER_QUERY,
  _envInt,
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
    const searches = [
      entry(
        'q1',
        [1, 2, 3, 4, 5].map((i) => `https://same.com/p${i}`),
      ),
    ];
    const capped = dedupeAndCapSearches(searches, { perDomainCap: 3 });
    expect(capped[0].results).toHaveLength(3);
  });

  it('applies the global cap round-robin so every query keeps its best hits', () => {
    const searches = [
      entry(
        'q1',
        [1, 2, 3, 4].map((i) => `https://a${i}.com/`),
      ),
      entry(
        'q2',
        [1, 2, 3, 4].map((i) => `https://b${i}.com/`),
      ),
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

describe('envInt', () => {
  const VAR = 'ZETORA_TEST_SEARCH_INT_VAR';

  afterEach(() => {
    delete process.env[VAR];
  });

  it('falls back when the env var is unset', () => {
    expect(_envInt(VAR, 32)).toBe(32);
  });

  it('parses a valid positive integer override', () => {
    process.env[VAR] = '64';
    expect(_envInt(VAR, 32)).toBe(64);
  });

  it('falls back on a non-integer or non-positive value', () => {
    process.env[VAR] = 'not-a-number';
    expect(_envInt(VAR, 32)).toBe(32);
    process.env[VAR] = '0';
    expect(_envInt(VAR, 32)).toBe(32);
    process.env[VAR] = '1.5';
    expect(_envInt(VAR, 32)).toBe(32);
  });
});

describe('enrichBestQualityResults', () => {
  it('leaves searches untouched when no query is best quality', async () => {
    const searches = [entry('q1', ['https://a.com/'])];
    const scrapeUrls = async () => [{ url: 'https://a.com/', content: 'x'.repeat(5000) }];
    const result = await enrichBestQualityResults(searches, ['default'], scrapeUrls);
    expect(result).toBe(searches);
  });

  it('replaces the snippet with scraped content for best-quality queries', async () => {
    const searches = [entry('q1', ['https://a.com/'], 'short snippet')];
    const fullContent = 'full page content '.repeat(50);
    const scrapeUrls = async (urls: string[]) => {
      expect(urls).toEqual(['https://a.com/']);
      return [{ url: 'https://a.com/', content: fullContent }];
    };
    const result = await enrichBestQualityResults(searches, ['best'], scrapeUrls);
    expect(result[0].results[0].content).toBe(fullContent);
  });

  it('keeps the snippet when the scrape returns shorter content', async () => {
    const longSnippet = 'y'.repeat(200);
    const searches = [entry('q1', ['https://a.com/'], longSnippet)];
    const scrapeUrls = async () => [{ url: 'https://a.com/', content: 'short' }];
    const result = await enrichBestQualityResults(searches, ['best'], scrapeUrls);
    expect(result[0].results[0].content).toBe(longSnippet);
  });

  it('keeps the snippet when the scrape fails', async () => {
    const searches = [entry('q1', ['https://a.com/'], 'short snippet')];
    const scrapeUrls = async () => {
      throw new Error('scrape failed');
    };
    const result = await enrichBestQualityResults(searches, ['best'], scrapeUrls);
    expect(result[0].results[0].content).toBe('short snippet');
  });

  it('only enriches the top N results of a best-quality query', async () => {
    const searches = [entry('q1', ['https://a.com/', 'https://b.com/', 'https://c.com/', 'https://d.com/'])];
    const scrapeUrls = async (urls: string[]) => {
      expect(urls).toHaveLength(3);
      return urls.map((url) => ({ url, content: 'x'.repeat(5000) }));
    };
    const result = await enrichBestQualityResults(searches, ['best'], scrapeUrls, 3);
    expect(result[0].results[3].content).toHaveLength(50);
  });
});
