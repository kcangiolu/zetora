import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const kvStore = vi.hoisted(() => new Map<string, { value: unknown; ex?: number }>());
const kvGetMock = vi.hoisted(() => vi.fn(async (key: string) => kvStore.get(key)?.value ?? null));
const kvSetMock = vi.hoisted(() =>
  vi.fn(async (key: string, value: unknown, opts?: { ex?: number }) => {
    kvStore.set(key, { value, ex: opts?.ex });
  }),
);
vi.mock('@/lib/redis', () => ({ kvGet: kvGetMock, kvSet: kvSetMock }));

vi.mock('@/env/server', () => ({
  serverEnv: { FASTCRW_URL: 'http://fastcrw.local', NOTTE_API_KEY: 'placeholder' },
}));

import { FastCrwContentStrategy, scrapeWithFastCrwForBrowsePage } from '@/lib/tools/self-hosted-content';
import { FASTCRW_SCRAPE_DEADLINE_MS } from '@/lib/timeouts';

function stubScrape(bodiesByUrl: Record<string, unknown>) {
  const fetchMock = vi.fn(async (_endpoint: string, init: RequestInit) => {
    const { url } = JSON.parse(init.body as string);
    if (!(url in bodiesByUrl)) throw new Error('network down');
    return { ok: true, status: 200, json: async () => bodiesByUrl[url] };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function page(markdown: string, metadata: Record<string, unknown> = {}) {
  return { success: true, data: { markdown, metadata: { statusCode: 200, ...metadata } } };
}

const blocked = { success: false, data: { warning: 'Blocked by anti-bot protection', metadata: { statusCode: 403 } } };

beforeEach(() => {
  kvStore.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FastCrwContentStrategy', () => {
  it("passes the batch deadline to fastCRW so it stops a page's renderer ladder itself", async () => {
    const fetchMock = stubScrape({ 'https://a.com': page('# A') });

    await new FastCrwContentStrategy('http://fastcrw.local').getContents(['https://a.com']);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.deadlineMs).toBe(FASTCRW_SCRAPE_DEADLINE_MS);
  });

  it('serves a page it already read from the cache without scraping it again', async () => {
    const fetchMock = stubScrape({ 'https://a.com': page('# Alpha\n\nbody', { title: 'Alpha' }) });
    const strategy = new FastCrwContentStrategy('http://fastcrw.local');

    await strategy.getContents(['https://a.com']);
    const [second] = await strategy.getContents(['https://a.com']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ url: 'https://a.com', title: 'Alpha', content: '# Alpha\n\nbody' });
  });

  it('truncates a cached page to each caller’s own size', async () => {
    stubScrape({ 'https://a.com': page('x'.repeat(10_000)) });

    await new FastCrwContentStrategy('http://fastcrw.local', 10_000).getContents(['https://a.com']);
    const [short] = await new FastCrwContentStrategy('http://fastcrw.local', 100).getContents(['https://a.com']);

    expect(short.content).toHaveLength(100);
  });

  it('remembers a site that refused the scraper, for less time than a page', async () => {
    const fetchMock = stubScrape({ 'https://walled.com': blocked, 'https://a.com': page('# A') });
    const strategy = new FastCrwContentStrategy('http://fastcrw.local');

    expect(await strategy.getContents(['https://walled.com', 'https://a.com'])).toHaveLength(1);
    expect(await strategy.getContents(['https://walled.com'])).toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(kvStore.get('fastcrw-page:https://walled.com')!.ex).toBeLessThan(
      kvStore.get('fastcrw-page:https://a.com')!.ex!,
    );
  });

  it('retries a page that failed for a passing reason', async () => {
    const fetchMock = stubScrape({
      'https://slow.com': { success: false, data: { warning: 'Timeout after 8000ms', metadata: { statusCode: 200 } } },
    });
    const strategy = new FastCrwContentStrategy('http://fastcrw.local');

    await strategy.getContents(['https://slow.com', 'https://offline.com']);
    await strategy.getContents(['https://slow.com', 'https://offline.com']);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(kvStore.size).toBe(0);
  });

  it('keeps scraping when the cache is unreachable', async () => {
    kvGetMock.mockRejectedValueOnce(new Error('redis down'));
    kvSetMock.mockRejectedValueOnce(new Error('redis down'));
    stubScrape({ 'https://a.com': page('# A') });

    const results = await new FastCrwContentStrategy('http://fastcrw.local').getContents(['https://a.com']);

    expect(results).toHaveLength(1);
  });
});

describe('scrapeWithFastCrwForBrowsePage', () => {
  it("leaves a page the user asked for on fastCRW's own deadline", async () => {
    const fetchMock = stubScrape({ 'https://a.com': page('# A') });

    await scrapeWithFastCrwForBrowsePage('https://a.com');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty('deadlineMs');
  });
});
