import { describe, it, expect, vi, afterEach } from 'vitest';

import { fastCrwSearch } from '@/lib/search/fastcrw-client';
import { searxngSearch, searxngTimeRange } from '@/lib/search/searxng-client';

function stubFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    json: async () => response.body ?? {},
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('searxngSearch', () => {
  it('sends only the given parameters, with JSON format and safe search', async () => {
    const fetchMock = stubFetch({ ok: true, body: { results: [{ url: 'https://a.com', title: 'A', content: 'c' }] } });

    const hits = await searxngSearch('http://searxng.local/', { q: 'query', engines: 'github' });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'json',
      safesearch: '1',
      q: 'query',
      engines: 'github',
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(hits).toHaveLength(1);
  });

  it('throws on a non-2xx response', async () => {
    stubFetch({ ok: false, status: 502 });
    await expect(searxngSearch('http://searxng.local', { q: 'query' })).rejects.toThrow('SearXNG returned 502');
  });
});

describe('searxngSearch without results', () => {
  it('throws when no engine answered, naming each one and why', async () => {
    stubFetch({
      ok: true,
      body: {
        results: [],
        unresponsive_engines: [
          ['bing', 'timeout'],
          ['wikipedia', 'timeout'],
          ['bing', 'timeout'],
        ],
      },
    });
    await expect(searxngSearch('http://searxng.local', { q: 'query' })).rejects.toThrow(
      'no engine answered: bing (timeout), wikipedia (timeout)',
    );
  });

  it('returns an empty list when the engines answered with nothing', async () => {
    stubFetch({ ok: true, body: { results: [], unresponsive_engines: [] } });
    await expect(searxngSearch('http://searxng.local', { q: 'query' })).resolves.toEqual([]);
  });

  it('keeps the results of the engines that answered', async () => {
    stubFetch({
      ok: true,
      body: {
        results: [{ url: 'https://a.com', title: 'A', content: 'c' }],
        unresponsive_engines: [['bing', 'timeout']],
      },
    });
    await expect(searxngSearch('http://searxng.local', { q: 'query' })).resolves.toHaveLength(1);
  });
});

describe('searxngTimeRange', () => {
  it('picks the smallest range covering the start date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    expect(searxngTimeRange('general', '2026-10-12')).toBe('week');
    expect(searxngTimeRange('general', '2025-01-01')).toBe('year');
    expect(searxngTimeRange('news')).toBe('week');
    expect(searxngTimeRange('general')).toBe('');
  });
});

describe('fastCrwSearch', () => {
  it('posts the request and maps snippet or description to content', async () => {
    const fetchMock = stubFetch({
      ok: true,
      body: {
        data: {
          results: [
            { url: 'https://a.com', title: 'A', snippet: 'snippet' },
            { url: 'https://b.com', description: 'description' },
          ],
        },
      },
    });

    const hits = await fastCrwSearch('http://fastcrw.local/', { query: 'query', limit: 5, category: 'news' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://fastcrw.local/v1/search');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: 'query', limit: 5, category: 'news' });
    expect(hits).toEqual([
      { url: 'https://a.com', title: 'A', content: 'snippet' },
      { url: 'https://b.com', title: '', content: 'description' },
    ]);
  });

  it('throws on a non-2xx response', async () => {
    stubFetch({ ok: false, status: 500 });
    await expect(fastCrwSearch('http://fastcrw.local', { query: 'q', limit: 5 })).rejects.toThrow(
      'fastCRW returned 500',
    );
  });
});
