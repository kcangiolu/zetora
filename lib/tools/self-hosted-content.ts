import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { serverEnv } from '@/env/server';
import { scrapeWebpageWithNotte } from '@/lib/notte';
import { kvGet, kvSet } from '@/lib/redis';
import { FASTCRW_SCRAPE_DEADLINE_MS, FASTCRW_SCRAPE_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

import { createLogger } from '@/lib/logger';
import { getLinkMetadata } from '@/lib/link-metadata';
import { getHostFaviconUrl } from '@/lib/url';

const log = createLogger('selfhosted-content');

// Regular search results are capped low to keep multi-source context bounded.
// browsePage is an explicit "give me the full page" request (max 5 URLs), so it gets a much
// higher cap instead of reusing the search cap.
const SEARCH_CONTENT_MAX_CHARS = 3000;
export const BROWSE_PAGE_CONTENT_MAX_CHARS = 20000;

export interface ContentExtractionStrategy {
  getContents(links: string[], abortSignal?: AbortSignal): Promise<SearchResult[]>;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate: string;
  favicon: string;
  description?: string;
  canonical?: string;
  ogUrl?: string;
  finalUrl?: string;
  siteName?: string | null;
  image?: string;
  fullContent?: boolean;
}

function isHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getHostnameForUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function inferTitleFromMarkdown(markdown: string, fallback: string) {
  const lines = markdown
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  const title = lines.find((line) => line.length > 3 && line.length <= 140);
  return title || fallback;
}

// A page fastCRW read, or the record that the site refused it. Cached by URL so
// a page read for one search costs nothing to the next; the markdown is kept at
// the largest size any caller asks for.
type FastCrwPage = { title: string; markdown: string; publishedDate: string } | { refused: true };

const FASTCRW_PAGE_CACHE_TTL_S = 6 * 60 * 60;
// A site that refused the scraper (anti-bot wall, 4xx) is not asked again for
// an hour: each retry would spend the whole deadline only to fail again.
const FASTCRW_REFUSED_CACHE_TTL_S = 60 * 60;

function fastCrwPageCacheKey(url: string) {
  return `fastcrw-page:${url}`;
}

// The cache only saves time: when Redis is unreachable, scraping goes on
// without it.
async function readCachedFastCrwPage(url: string): Promise<FastCrwPage | null> {
  try {
    return await kvGet<FastCrwPage>(fastCrwPageCacheKey(url));
  } catch (error) {
    log.warn(`fastCRW page cache read failed for ${url}:`, error);
    return null;
  }
}

async function cacheFastCrwPage(url: string, page: FastCrwPage): Promise<void> {
  try {
    await kvSet(fastCrwPageCacheKey(url), page, {
      ex: 'refused' in page ? FASTCRW_REFUSED_CACHE_TTL_S : FASTCRW_PAGE_CACHE_TTL_S,
    });
  } catch (error) {
    log.warn(`fastCRW page cache write failed for ${url}:`, error);
  }
}

// `deadlineMs` makes fastCRW itself stop climbing its renderer ladder (HTTP,
// LightPanda, Chrome) once the budget is spent; without it, a page behind an
// anti-bot wall takes ~30s to fail. Returns null when the outcome is worth
// retrying later (timeout, network error, empty page).
async function fetchFastCrwPage(
  url: string,
  fastcrwUrl: string,
  deadlineMs: number | undefined,
  abortSignal: AbortSignal | undefined,
): Promise<FastCrwPage | null> {
  const response = await fetch(`${fastcrwUrl.replace(/\/$/, '')}/v1/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      ...(deadlineMs !== undefined && { deadlineMs }),
    }),
    signal: withAbort(abortSignal, FASTCRW_SCRAPE_TIMEOUT_MS),
  });

  if (!response.ok) return null;

  const data = await response.json();
  const markdown: string = data?.data?.markdown || data?.markdown || '';
  const metadata = data?.data?.metadata ?? data?.metadata ?? {};

  if (markdown.trim()) {
    return {
      title: metadata.title || '',
      markdown: markdown.slice(0, BROWSE_PAGE_CONTENT_MAX_CHARS),
      publishedDate: metadata.publishedDate || '',
    };
  }
  // fastCRW answers 200 with the origin's own status in the metadata.
  const originStatus = metadata.statusCode;
  if (typeof originStatus === 'number' && originStatus >= 400 && originStatus < 500) return { refused: true };
  return null;
}

async function scrapeWithFastCrw(
  url: string,
  fastcrwUrl: string,
  maxContentChars: number = SEARCH_CONTENT_MAX_CHARS,
  abortSignal?: AbortSignal,
  deadlineMs?: number,
): Promise<SearchResult | null> {
  try {
    let page = await readCachedFastCrwPage(url);
    if (!page) {
      page = await fetchFastCrwPage(url, fastcrwUrl, deadlineMs, abortSignal);
      if (page) await cacheFastCrwPage(url, page);
    }
    if (!page || 'refused' in page) return null;

    const hostname = getHostnameForUrl(url);
    const title = page.title || inferTitleFromMarkdown(page.markdown, hostname);

    return {
      title: title.slice(0, 200),
      url,
      content: page.markdown.slice(0, maxContentChars),
      publishedDate: page.publishedDate,
      favicon: getHostFaviconUrl(hostname),
    };
  } catch (error) {
    log.error(`[SelfHostedContent] fastCRW scrape error for ${url}:`, error);
    return null;
  }
}

async function scrapeWithNotte(
  url: string,
  maxContentChars: number = SEARCH_CONTENT_MAX_CHARS,
): Promise<SearchResult | null> {
  try {
    const result = await scrapeWebpageWithNotte({
      url,
      headless: true,
      maxDurationMinutes: 2,
      idleTimeoutMinutes: 2,
      browserType: 'chromium',
      scrapeLinks: false,
      scrapeImages: false,
      onlyMainContent: true,
    });

    if (!result.markdown?.trim()) return null;

    const hostname = getHostnameForUrl(url);
    const title = inferTitleFromMarkdown(result.markdown, hostname);

    return {
      title,
      url,
      content: result.markdown.slice(0, maxContentChars),
      publishedDate: '',
      favicon: getHostFaviconUrl(hostname),
    };
  } catch (error) {
    log.error(`[SelfHostedContent] Notte error for ${url}:`, error);
    return null;
  }
}

// Bounded by getLinkMetadata's own timeout, and cached.
async function scrapeWithMetadata(url: string): Promise<SearchResult | null> {
  const data = await getLinkMetadata(url);
  if (!data) return null;
  const hostname = getHostnameForUrl(url);
  const title = data.title || hostname;
  const content = [title, data.description].filter(Boolean).join('\n\n').slice(0, SEARCH_CONTENT_MAX_CHARS);

  return {
    title,
    url,
    content: content || title,
    publishedDate: '',
    favicon: data.favicon || getHostFaviconUrl(hostname),
    description: data.description,
    canonical: data.canonical,
    ogUrl: data.ogUrl,
    finalUrl: data.finalUrl,
    siteName: data.siteName,
    image: data.image,
  };
}

interface SelfHostedContentOptions {
  fastcrwUrl?: string;
  notteEnabled?: boolean;
  metadataEnabled?: boolean;
}

// Used by web_search's "quality: best" content enrichment (lib/tools/web-search.ts)
// — a separate feature from Extreme Search's content extraction, kept as its
// original chained fastCRW -> Notte -> metadata strategy since that's still
// the correct behavior there.
export class SelfHostedContentStrategy implements ContentExtractionStrategy {
  private fastcrwUrl: string;
  private notteEnabled: boolean;
  private metadataEnabled: boolean;

  constructor(options: SelfHostedContentOptions = {}) {
    this.fastcrwUrl = options.fastcrwUrl ?? serverEnv.FASTCRW_URL ?? '';
    this.notteEnabled = options.notteEnabled ?? true;
    this.metadataEnabled = options.metadataEnabled ?? true;
  }

  async getContents(links: string[], abortSignal?: AbortSignal): Promise<SearchResult[]> {
    const uniqueUrls = Array.from(new Set(links)).filter(isHttpUrl);
    if (uniqueUrls.length === 0) return [];

    const results: SearchResult[] = [];
    let remaining = [...uniqueUrls];

    if (this.fastcrwUrl) {
      const fastcrwResults = await all(
        Object.fromEntries(
          uniqueUrls.map((url, i) => [
            `fc:${i}`,
            async () =>
              scrapeWithFastCrw(
                url,
                this.fastcrwUrl,
                SEARCH_CONTENT_MAX_CHARS,
                abortSignal,
                FASTCRW_SCRAPE_DEADLINE_MS,
              ),
          ]),
        ),
        getBetterAllOptions(),
      );

      const failed: string[] = [];
      for (const key of Object.keys(fastcrwResults)) {
        const result = fastcrwResults[key];
        if (result) {
          results.push(result);
        } else {
          const idx = parseInt(key.split(':')[1]);
          failed.push(uniqueUrls[idx]);
        }
      }
      remaining = failed;
    }

    if (
      remaining.length > 0 &&
      this.notteEnabled &&
      serverEnv.NOTTE_API_KEY &&
      serverEnv.NOTTE_API_KEY !== 'placeholder'
    ) {
      const notteResults = await all(
        Object.fromEntries(remaining.map((url, i) => [`nt:${i}`, async () => scrapeWithNotte(url)])),
        getBetterAllOptions(),
      );

      const stillRemaining: string[] = [];
      for (const key of Object.keys(notteResults)) {
        const result = notteResults[key];
        if (result) {
          results.push(result);
        } else {
          const idx = parseInt(key.split(':')[1]);
          stillRemaining.push(remaining[idx]);
        }
      }
      remaining = stillRemaining;
    }

    if (remaining.length > 0 && this.metadataEnabled) {
      const metaResults = await all(
        Object.fromEntries(remaining.map((url, i) => [`md:${i}`, async () => scrapeWithMetadata(url)])),
        getBetterAllOptions(),
      );

      for (const key of Object.keys(metaResults)) {
        const result = metaResults[key];
        if (result) results.push(result);
      }
    }

    return results;
  }
}

// Single-provider content strategies — each returns only what it actually
// extracted, no internal chaining to another provider. Fallback and metadata
// fallback are orchestrated by the caller (runExtremeContentExtraction in
// extreme-search.ts) so the same two strategies serve both webSearch's
// content step and browsePage.
export class FastCrwContentStrategy implements ContentExtractionStrategy {
  constructor(
    private fastcrwUrl: string,
    private maxContentChars: number = SEARCH_CONTENT_MAX_CHARS,
  ) {}

  async getContents(links: string[], abortSignal?: AbortSignal): Promise<SearchResult[]> {
    const uniqueUrls = Array.from(new Set(links)).filter(isHttpUrl);
    if (uniqueUrls.length === 0 || !this.fastcrwUrl) return [];

    const fastcrwResults = await all(
      Object.fromEntries(
        uniqueUrls.map((url, i) => [
          `fc:${i}`,
          async () =>
            scrapeWithFastCrw(url, this.fastcrwUrl, this.maxContentChars, abortSignal, FASTCRW_SCRAPE_DEADLINE_MS),
        ]),
      ),
      getBetterAllOptions(),
    );

    const results: SearchResult[] = [];
    for (const key of Object.keys(fastcrwResults)) {
      const result = fastcrwResults[key];
      if (result) results.push(result);
    }
    return results;
  }
}

export class NotteContentStrategy implements ContentExtractionStrategy {
  constructor(private maxContentChars: number = SEARCH_CONTENT_MAX_CHARS) {}

  async getContents(links: string[]): Promise<SearchResult[]> {
    const uniqueUrls = Array.from(new Set(links)).filter(isHttpUrl);
    if (uniqueUrls.length === 0 || !serverEnv.NOTTE_API_KEY || serverEnv.NOTTE_API_KEY === 'placeholder') return [];

    const notteResults = await all(
      Object.fromEntries(
        uniqueUrls.map((url, i) => [`nt:${i}`, async () => scrapeWithNotte(url, this.maxContentChars)]),
      ),
      getBetterAllOptions(),
    );

    const results: SearchResult[] = [];
    for (const key of Object.keys(notteResults)) {
      const result = notteResults[key];
      if (result) results.push(result);
    }
    return results;
  }
}

export async function scrapeWithFastCrwForBrowsePage(
  url: string,
  fastcrwUrl?: string,
): Promise<{ title: string; content: string; favicon: string } | null> {
  const baseUrl = fastcrwUrl || serverEnv.FASTCRW_URL || '';
  if (!baseUrl) return null;
  return scrapeWithFastCrw(url, baseUrl, BROWSE_PAGE_CONTENT_MAX_CHARS);
}
