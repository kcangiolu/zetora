import { describe, it, expect, vi, afterEach } from 'vitest';

const firecrawlSearchMock = vi.hoisted(() => vi.fn());
const exaSearchMock = vi.hoisted(() => vi.fn());

vi.mock('@mendable/firecrawl-js', () => ({
  default: class {
    search = firecrawlSearchMock;
  },
}));

vi.mock('exa-js', () => ({
  default: class {
    search = exaSearchMock;
  },
}));

vi.mock('@/env/server', () => ({
  serverEnv: {
    FIRECRAWL_API_KEY: 'test-key',
    EXA_API_KEY: 'test-key',
    SEARXNG_URL: 'http://searxng.local',
    FASTCRW_URL: 'http://fastcrw.local',
  },
}));

import { academicSearchTool } from '@/lib/tools/academic-search';

function stubFetch(responsesByUrlSubstring: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const match = Object.entries(responsesByUrlSubstring).find(([key]) => url.includes(key));
    return { ok: true, status: 200, json: async () => (match ? match[1] : {}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function runTool(tool: ReturnType<typeof academicSearchTool>, queries: string[]) {
  return (tool.execute as any)({ queries, maxResults: undefined }, {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  firecrawlSearchMock.mockReset();
  exaSearchMock.mockReset();
});

describe('academicSearchTool provider selection', () => {
  it('defaults to the first available provider in order (SearXNG here) and calls nothing else', async () => {
    const fetchMock = stubFetch({
      'searxng.local/search': { results: [{ url: 'https://arxiv.org/abs/1234', title: 'paper', content: 'desc' }] },
    });

    const tool = academicSearchTool(undefined, undefined);
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('searxng.local/search'))).toBe(true);
    expect(exaSearchMock).not.toHaveBeenCalled();
    expect(firecrawlSearchMock).not.toHaveBeenCalled();
  });

  it('does not call the fallback when the primary provider (Exa) returns results', async () => {
    exaSearchMock.mockResolvedValue({ results: [{ url: 'https://arxiv.org/abs/1234', title: 'paper' }] });
    const fetchMock = stubFetch({ 'fastcrw.local/v1/search': { success: true, data: { results: [] } } });

    const tool = academicSearchTool(undefined, {
      'zetora-academic-search-provider': 'exa',
      'zetora-academic-search-fallback-enabled': true,
      'zetora-academic-search-fallback-provider': 'fastcrw',
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw.local/v1/search'))).toBe(false);
  });

  it('falls back to the configured provider when the primary (Exa) returns no results', async () => {
    exaSearchMock.mockResolvedValue({ results: [] });
    const fetchMock = stubFetch({
      'fastcrw.local/v1/search': {
        success: true,
        data: {
          results: [
            {
              url: 'https://arxiv.org/abs/1234',
              title: 'paper',
              snippet: 'desc',
              description: '',
              score: 1,
              category: '',
            },
          ],
        },
      },
    });

    const tool = academicSearchTool(undefined, {
      'zetora-academic-search-provider': 'exa',
      'zetora-academic-search-fallback-enabled': true,
      'zetora-academic-search-fallback-provider': 'fastcrw',
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('fastcrw.local/v1/search'))).toBe(true);
  });

  it('does not call any fallback when fallback is disabled', async () => {
    exaSearchMock.mockResolvedValue({ results: [] });
    const fetchMock = stubFetch({});

    const tool = academicSearchTool(undefined, {
      'zetora-academic-search-provider': 'exa',
      'zetora-academic-search-fallback-enabled': false,
    });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(0);
    expect(fetchMock.mock.calls.length).toBe(0);
  });

  it('leaves the fallback off when no fallback preference is set', async () => {
    exaSearchMock.mockResolvedValue({ results: [] });
    const fetchMock = stubFetch({});

    const tool = academicSearchTool(undefined, { 'zetora-academic-search-provider': 'exa' });
    const result = await runTool(tool, ['foo']);

    expect(result.searches[0].results).toHaveLength(0);
    expect(fetchMock.mock.calls.length).toBe(0);
    expect(firecrawlSearchMock).not.toHaveBeenCalled();
  });
});
