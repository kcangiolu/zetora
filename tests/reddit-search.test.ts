import { describe, it, expect, vi, afterEach } from 'vitest';

const parallelSearchMock = vi.hoisted(() => vi.fn());
const firecrawlSearchMock = vi.hoisted(() => vi.fn());

vi.mock('parallel-web', () => ({
  default: class {
    beta = { search: parallelSearchMock };
  },
}));

vi.mock('@mendable/firecrawl-js', () => ({
  default: class {
    search = firecrawlSearchMock;
  },
}));

vi.mock('@/env/server', () => ({
  serverEnv: {
    PARALLEL_API_KEY: 'test-key',
    FIRECRAWL_API_KEY: 'test-key',
    SEARXNG_URL: 'http://searxng.local',
    FASTCRW_URL: 'http://fastcrw.local',
  },
}));

import { redditSearchTool } from '@/lib/tools/reddit-search';

function stubFetch(responsesByUrlSubstring: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const match = Object.entries(responsesByUrlSubstring).find(([key]) => url.includes(key));
    return { ok: true, status: 200, json: async () => (match ? match[1] : {}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function runTool(tool: ReturnType<typeof redditSearchTool>, queries: string[]) {
  return (tool.execute as any)({ queries, maxResults: undefined, timeRange: undefined }, {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  parallelSearchMock.mockReset();
  firecrawlSearchMock.mockReset();
});

describe('redditSearchTool provider selection', () => {
  it('defaults to the first available provider in order (SearXNG here) and calls nothing else', async () => {
    const fetchMock = stubFetch({
      'searxng.local/search': {
        results: [{ url: 'https://www.reddit.com/r/test/comments/abc/foo', title: 'foo', content: 'hello' }],
      },
    });

    const tool = redditSearchTool(undefined, undefined);
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('searxng.local/search'))).toBe(true);
    expect(firecrawlSearchMock).not.toHaveBeenCalled();
    expect(parallelSearchMock).not.toHaveBeenCalled();
  });

  it('does not call the fallback when the primary provider returns results', async () => {
    firecrawlSearchMock.mockResolvedValue({
      web: [{ url: 'https://www.reddit.com/r/test/comments/abc/foo', title: 'foo', description: 'hello' }],
    });
    const fetchMock = stubFetch({ 'searxng.local/search': { results: [] } });

    const tool = redditSearchTool(undefined, {
      'zetora-reddit-search-provider': 'firecrawl',
      'zetora-reddit-search-fallback-enabled': true,
      'zetora-reddit-search-fallback-provider': 'searxng',
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('searxng.local/search'))).toBe(false);
  });

  it('falls back to the configured provider when the primary returns no results', async () => {
    firecrawlSearchMock.mockResolvedValue({ web: [] });
    const fetchMock = stubFetch({
      'searxng.local/search': {
        results: [{ url: 'https://www.reddit.com/r/test/comments/abc/foo', title: 'foo', content: 'hello' }],
      },
    });

    const tool = redditSearchTool(undefined, {
      'zetora-reddit-search-provider': 'firecrawl',
      'zetora-reddit-search-fallback-enabled': true,
      'zetora-reddit-search-fallback-provider': 'searxng',
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('searxng.local/search'))).toBe(true);
  });

  it('does not call any fallback when fallback is disabled', async () => {
    firecrawlSearchMock.mockResolvedValue({ web: [] });
    const fetchMock = stubFetch({});

    const tool = redditSearchTool(undefined, {
      'zetora-reddit-search-provider': 'firecrawl',
      'zetora-reddit-search-fallback-enabled': false,
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(0);
    expect(fetchMock.mock.calls.length).toBe(0);
  });

  it('leaves the fallback off when no fallback preference is set', async () => {
    firecrawlSearchMock.mockResolvedValue({ web: [] });
    const fetchMock = stubFetch({});

    const tool = redditSearchTool(undefined, { 'zetora-reddit-search-provider': 'firecrawl' });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(0);
    expect(fetchMock.mock.calls.length).toBe(0);
    expect(parallelSearchMock).not.toHaveBeenCalled();
  });
});
