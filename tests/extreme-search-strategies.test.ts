import { describe, it, expect, vi, afterEach } from 'vitest';

const getLinkMetadataMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/link-metadata', () => ({ getLinkMetadata: getLinkMetadataMock }));

vi.mock('@/env/server', () => ({
  serverEnv: {
    EXA_API_KEY: 'test-key',
    FIRECRAWL_API_KEY: 'test-key',
    PARALLEL_API_KEY: 'test-key',
    SEARXNG_URL: 'http://searxng.local',
    FASTCRW_URL: 'http://fastcrw.local',
    NOTTE_API_KEY: 'placeholder',
  },
}));

import {
  ExaContentStrategy,
  FirecrawlContentStrategy,
  ParallelContentStrategy,
  FirecrawlSearchStrategy,
  runExtremeContentExtraction,
  runExtremeSearchProvider,
  type ExtremeProviderClients,
} from '@/lib/tools/extreme-search/providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExaContentStrategy', () => {
  it('returns only URLs with non-empty text', async () => {
    const exa = {
      getContents: vi.fn().mockResolvedValue({
        results: [
          { url: 'https://a.com', title: 'A', text: 'hello', publishedDate: '', favicon: '' },
          { url: 'https://b.com', title: 'B', text: '' },
        ],
      }),
    };
    const strategy = new ExaContentStrategy(exa as any, 3000);
    const results = await strategy.getContents(['https://a.com', 'https://b.com']);
    expect(results.map((r) => r.url)).toEqual(['https://a.com']);
  });

  it('returns an empty array on API error instead of throwing', async () => {
    const exa = { getContents: vi.fn().mockRejectedValue(new Error('boom')) };
    const strategy = new ExaContentStrategy(exa as any);
    const results = await strategy.getContents(['https://a.com']);
    expect(results).toEqual([]);
  });
});

describe('FirecrawlContentStrategy', () => {
  it('scrapes each link independently and skips failures', async () => {
    const firecrawl = {
      scrape: vi.fn(async (url: string) => {
        if (url === 'https://fails.com') throw new Error('scrape failed');
        return { markdown: `content for ${url}`, metadata: { title: 'T' } };
      }),
    };
    const strategy = new FirecrawlContentStrategy(firecrawl as any, 3000);
    const results = await strategy.getContents(['https://ok.com', 'https://fails.com']);
    expect(results.map((r) => r.url)).toEqual(['https://ok.com']);
  });
});

describe('ParallelContentStrategy', () => {
  it('maps full_content results and drops empty ones', async () => {
    const parallel = {
      beta: {
        extract: vi.fn().mockResolvedValue({
          results: [
            { url: 'https://a.com', title: 'A', full_content: 'full text' },
            { url: 'https://b.com', title: 'B', full_content: '' },
          ],
        }),
      },
    };
    const strategy = new ParallelContentStrategy(parallel as any, 3000);
    const results = await strategy.getContents(['https://a.com', 'https://b.com']);
    expect(results.map((r) => r.url)).toEqual(['https://a.com']);
  });
});

describe('FirecrawlSearchStrategy', () => {
  it('appends site: filters from include_domains and maps web results', async () => {
    const firecrawl = {
      search: vi.fn().mockResolvedValue({
        web: [{ url: 'https://a.com', title: 'A' }],
      }),
    };
    const strategy = new FirecrawlSearchStrategy(firecrawl as any);
    const results = await strategy.search('query', { includeDomains: ['example.com'] });
    expect(firecrawl.search).toHaveBeenCalledWith('query site:example.com', expect.anything());
    expect(results).toHaveLength(1);
  });
});

describe('runExtremeContentExtraction (per-URL fallback)', () => {
  const makeClients = (overrides: Partial<ExtremeProviderClients> = {}): ExtremeProviderClients => ({
    exa: { getContents: vi.fn() } as any,
    firecrawl: { scrape: vi.fn() } as any,
    parallel: { beta: { extract: vi.fn() } } as any,
    ...overrides,
  });

  it('only retries the URLs the primary provider failed on, not the whole batch', async () => {
    const exa = {
      getContents: vi.fn().mockResolvedValue({
        results: [
          { url: 'https://a.com', title: 'A', text: 'ok' },
          { url: 'https://b.com', title: 'B', text: '' },
        ],
      }),
    };
    const firecrawl = {
      scrape: vi.fn().mockResolvedValue({ markdown: 'fallback content', metadata: {} }),
    };
    const clients = makeClients({ exa: exa as any, firecrawl: firecrawl as any });

    const results = await runExtremeContentExtraction(
      ['https://a.com', 'https://b.com'],
      'exa',
      'firecrawl',
      false,
      clients,
    );

    expect(firecrawl.scrape).toHaveBeenCalledTimes(1);
    expect(firecrawl.scrape).toHaveBeenCalledWith('https://b.com', expect.anything());
    expect(results.map((r) => r.url).sort()).toEqual(['https://a.com', 'https://b.com']);
  });

  it('falls through to metadata for URLs still missing after primary and fallback', async () => {
    const exa = { getContents: vi.fn().mockResolvedValue({ results: [] }) };
    const clients = makeClients({ exa: exa as any });
    getLinkMetadataMock.mockResolvedValue({
      url: 'https://a.com',
      finalUrl: 'https://a.com/',
      title: 'Meta Title',
      description: 'desc',
    });

    const results = await runExtremeContentExtraction(['https://a.com'], 'exa', null, true, clients);

    expect(getLinkMetadataMock).toHaveBeenCalledWith('https://a.com');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Meta Title');
  });
});

describe('runExtremeSearchProvider', () => {
  it('rejects when SearXNG is selected but unreachable, so the failure is reported', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    const clients: ExtremeProviderClients = {
      exa: { search: vi.fn() } as any,
      firecrawl: { search: vi.fn() } as any,
      parallel: {} as any,
    };

    await expect(runExtremeSearchProvider('searxng', clients, 'query')).rejects.toThrow();
  });

  it('dispatches to Firecrawl when selected', async () => {
    const firecrawl = { search: vi.fn().mockResolvedValue({ web: [{ url: 'https://a.com', title: 'A' }] }) };
    const clients: ExtremeProviderClients = {
      exa: { search: vi.fn() } as any,
      firecrawl: firecrawl as any,
      parallel: {} as any,
    };

    const results = await runExtremeSearchProvider('firecrawl', clients, 'query');
    expect(firecrawl.search).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});

describe('runExtremeSearchProvider with SearXNG', () => {
  it('applies the site filter, the date range and the abort signal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results: [{ url: 'https://a.com/x', title: 'A', content: 'c' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const clients = { exa: {}, firecrawl: {}, parallel: {} } as unknown as ExtremeProviderClients;

    const results = await runExtremeSearchProvider('searxng', clients, 'query', {
      includeDomains: ['example.com'],
      startDate: '2026-10-12',
      abortSignal: controller.signal,
    });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('q')).toBe('query site:example.com');
    expect(url.searchParams.get('time_range')).toBe('week');
    controller.abort();
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    expect(results).toEqual([
      { title: 'A', url: 'https://a.com/x', content: '', publishedDate: '', favicon: expect.stringContaining('a.com') },
    ]);
    vi.useRealTimers();
  });
});
