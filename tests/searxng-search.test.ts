import { describe, it, expect, vi, afterEach } from 'vitest';
import { SearXNGSearchStrategy } from '@/lib/tools/searxng-search';

function mockFetchOnce(results: Array<{ url: string; title: string; content: string; score: number }>) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SearXNGSearchStrategy', () => {
  it('defaults to language=all when no language is given (was hard-coded to "en")', async () => {
    const fetchMock = mockFetchOnce([]);
    const strategy = new SearXNGSearchStrategy('http://searxng.local');

    await strategy.search(['bonjour'], { maxResults: [10], topics: ['general'], quality: ['default'] });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('language')).toBe('all');
  });

  it('passes through the requested language', async () => {
    const fetchMock = mockFetchOnce([]);
    const strategy = new SearXNGSearchStrategy('http://searxng.local');

    await strategy.search(['bonjour'], {
      maxResults: [10],
      topics: ['general'],
      quality: ['default'],
      language: 'fr',
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('language')).toBe('fr');
  });

  it('sorts results by score descending before applying maxResults', async () => {
    mockFetchOnce([
      { url: 'https://low.com', title: 'low', content: 'c', score: 0.2 },
      { url: 'https://high.com', title: 'high', content: 'c', score: 0.9 },
      { url: 'https://mid.com', title: 'mid', content: 'c', score: 0.5 },
    ]);
    const strategy = new SearXNGSearchStrategy('http://searxng.local');

    const { searches } = await strategy.search(['query'], {
      maxResults: [10],
      topics: ['general'],
      quality: ['default'],
    });

    expect(searches[0].results.map((r) => r.url)).toEqual(['https://high.com', 'https://mid.com', 'https://low.com']);
  });

  it('caps sorted results to maxResults', async () => {
    mockFetchOnce([
      { url: 'https://a.com', title: 'a', content: 'c', score: 0.9 },
      { url: 'https://b.com', title: 'b', content: 'c', score: 0.8 },
      { url: 'https://c.com', title: 'c', content: 'c', score: 0.7 },
    ]);
    const strategy = new SearXNGSearchStrategy('http://searxng.local');

    const { searches } = await strategy.search(['query'], {
      maxResults: [2],
      topics: ['general'],
      quality: ['default'],
    });

    expect(searches[0].results).toHaveLength(2);
    expect(searches[0].results.map((r) => r.url)).toEqual(['https://a.com', 'https://b.com']);
  });

  it('returns empty results and does not throw on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const strategy = new SearXNGSearchStrategy('http://searxng.local');

    const { searches } = await strategy.search(['query'], {
      maxResults: [10],
      topics: ['general'],
      quality: ['default'],
    });

    expect(searches[0].results).toEqual([]);
  });
});
