import { describe, it, expect, vi, afterEach } from 'vitest';

const firecrawlSearchMock = vi.hoisted(() => vi.fn());

vi.mock('@mendable/firecrawl-js', () => ({
  default: class {
    search = firecrawlSearchMock;
  },
}));

vi.mock('@/env/server', () => ({
  serverEnv: {
    FIRECRAWL_API_KEY: 'test-key',
    SEARXNG_URL: 'http://searxng.local',
    FASTCRW_URL: 'http://fastcrw.local',
    GITHUB_TOKEN: undefined,
  },
}));

import { githubSearchTool } from '@/lib/tools/github-search';

// Any fetch call not matching a configured URL substring (e.g. the repo
// metadata enrichment call to api.github.com) gets a harmless empty object —
// enrichGithubResultsWithApi tolerates missing fields without throwing.
function stubFetch(responsesByUrlSubstring: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const match = Object.entries(responsesByUrlSubstring).find(([key]) => url.includes(key));
    return { ok: true, status: 200, json: async () => (match ? match[1] : {}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function runTool(tool: ReturnType<typeof githubSearchTool>, queries: string[]) {
  return (tool.execute as any)({ queries, maxResults: undefined, startDate: undefined, endDate: undefined }, {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  firecrawlSearchMock.mockReset();
});

describe('githubSearchTool provider selection', () => {
  it('uses firecrawl by default and never calls the SearXNG/fastCRW endpoints', async () => {
    firecrawlSearchMock.mockResolvedValue({
      web: [{ url: 'https://github.com/foo/bar', title: 'bar', description: 'desc' }],
    });
    const fetchMock = stubFetch({});

    const tool = githubSearchTool(undefined, undefined);
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('searxng'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw'))).toBe(false);
  });

  it('does not call the fallback when the primary provider returns results', async () => {
    const fetchMock = stubFetch({
      'searxng.local/search': {
        results: [{ url: 'https://github.com/foo/bar', title: 'bar', content: 'desc' }],
      },
    });

    const tool = githubSearchTool(undefined, {
      'zetora-github-search-provider': 'searxng',
      'zetora-github-search-fallback-provider': 'fastcrw',
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw.local/v1/search'))).toBe(false);
  });

  it('falls back to the configured provider when the primary returns no results', async () => {
    const fetchMock = stubFetch({
      'searxng.local/search': { results: [] },
      'fastcrw.local/v1/search': {
        success: true,
        data: {
          results: [
            { url: 'https://github.com/foo/bar', title: 'bar', snippet: 'desc', description: '', score: 1, category: '' },
          ],
        },
      },
    });

    const tool = githubSearchTool(undefined, {
      'zetora-github-search-provider': 'searxng',
      'zetora-github-search-fallback-provider': 'fastcrw',
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw.local/v1/search'))).toBe(true);
  });

  it('does not call any fallback when fallback is disabled', async () => {
    const fetchMock = stubFetch({ 'searxng.local/search': { results: [] } });

    const tool = githubSearchTool(undefined, {
      'zetora-github-search-provider': 'searxng',
      'zetora-github-search-fallback-enabled': false,
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw'))).toBe(false);
  });

  it('defaults the fallback to fastCRW (enabled) when no fallback preference is set', async () => {
    const fetchMock = stubFetch({
      'searxng.local/search': { results: [] },
      'fastcrw.local/v1/search': {
        success: true,
        data: { results: [{ url: 'https://github.com/foo/bar', title: 'bar', snippet: '', description: '', score: 1, category: '' }] },
      },
    });

    const tool = githubSearchTool(undefined, { 'zetora-github-search-provider': 'searxng' });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw.local/v1/search'))).toBe(true);
  });
});
