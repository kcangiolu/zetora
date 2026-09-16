import { describe, it, expect, vi, afterEach } from 'vitest';

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
  normalizeExtremeSearchProvider,
  normalizeExtremeContentProvider,
  type ExtremeProviderClients,
} from '@/lib/tools/extreme-search';

function stubFetch(responsesByUrlSubstring: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const match = Object.entries(responsesByUrlSubstring).find(([key]) => url.includes(key));
    if (!match) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => match[1] };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeExtremeSearchProvider / normalizeExtremeContentProvider', () => {
  it('defaults to exa for invalid or missing values', () => {
    expect(normalizeExtremeSearchProvider(undefined)).toBe('exa');
    expect(normalizeExtremeSearchProvider('bogus')).toBe('exa');
    expect(normalizeExtremeSearchProvider('searxng')).toBe('searxng');
    expect(normalizeExtremeContentProvider(undefined)).toBe('exa');
    expect(normalizeExtremeContentProvider('notte')).toBe('notte');
  });
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
    const results = await strategy.search('query', undefined, ['example.com']);
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
    const fetchMock = stubFetch({
      'metadata.zetora.app': { title: 'Meta Title', description: 'desc' },
    });

    const results = await runExtremeContentExtraction(['https://a.com'], 'exa', null, true, clients);

    expect(fetchMock).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Meta Title');
  });

  it('skips the fallback entirely when it matches the primary provider', async () => {
    const exa = { getContents: vi.fn().mockResolvedValue({ results: [] }) };
    const clients = makeClients({ exa: exa as any });

    const results = await runExtremeContentExtraction(['https://a.com'], 'exa', 'exa', false, clients);

    expect(exa.getContents).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });
});

describe('runExtremeSearchProvider', () => {
  it('warns and returns empty results when SearXNG is selected but unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const clients: ExtremeProviderClients = {
      exa: { search: vi.fn() } as any,
      firecrawl: { search: vi.fn() } as any,
      parallel: {} as any,
    };

    const results = await runExtremeSearchProvider('searxng', clients, 'query');
    expect(results).toEqual([]);
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
