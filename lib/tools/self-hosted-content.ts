import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { serverEnv } from '@/env/server';
import { scrapeWebpageWithNotte } from '@/lib/notte';
import { FASTCRW_SCRAPE_TIMEOUT_MS, METADATA_TIMEOUT_MS } from '@/lib/timeouts';

import { createLogger } from '@/lib/logger';

const log = createLogger('selfhosted-content');

export interface ContentExtractionStrategy {
  getContents(links: string[]): Promise<SearchResult[]>;
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
}

interface MetadataResponse {
  title?: string;
  description?: string;
  canonical?: string;
  ogUrl?: string;
  favicon?: string;
  finalUrl?: string;
  siteName?: string | null;
  image?: string;
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

async function scrapeWithFastCrw(url: string, fastcrwUrl: string): Promise<SearchResult | null> {
  try {
    const response = await fetch(`${fastcrwUrl.replace(/\/$/, '')}/v1/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(FASTCRW_SCRAPE_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const markdown = data?.data?.markdown || data?.markdown || '';

    if (!markdown.trim()) return null;

    const hostname = getHostnameForUrl(url);
    const title = data?.data?.metadata?.title || data?.metadata?.title || inferTitleFromMarkdown(markdown, hostname);

    return {
      title: title.slice(0, 200),
      url,
      content: markdown.slice(0, 3000),
      publishedDate: data?.data?.metadata?.publishedDate || data?.metadata?.publishedDate || '',
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
    };
  } catch (error) {
    log.error(`[SelfHostedContent] fastCRW scrape error for ${url}:`, error);
    return null;
  }
}

async function scrapeWithNotte(url: string): Promise<SearchResult | null> {
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
      content: result.markdown.slice(0, 3000),
      publishedDate: '',
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
    };
  } catch (error) {
    log.error(`[SelfHostedContent] Notte error for ${url}:`, error);
    return null;
  }
}

async function scrapeWithMetadata(url: string): Promise<SearchResult | null> {
  try {
    const endpoint = new URL('https://metadata.zetora.app/');
    endpoint.searchParams.set('url', url);
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as MetadataResponse;
    const hostname = getHostnameForUrl(url);
    const title = (data.title || '').trim() || hostname;
    const content = [title, (data.description || '').trim()].filter(Boolean).join('\n\n').slice(0, 3000);

    return {
      title,
      url,
      content: content || title,
      publishedDate: '',
      favicon: data.favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`,
      description: data.description,
      canonical: data.canonical,
      ogUrl: data.ogUrl,
      finalUrl: data.finalUrl,
      siteName: data.siteName,
      image: data.image,
    };
  } catch {
    return null;
  }
}

interface SelfHostedContentOptions {
  fastcrwUrl?: string;
  notteEnabled?: boolean;
  metadataEnabled?: boolean;
}

export class SelfHostedContentStrategy implements ContentExtractionStrategy {
  private fastcrwUrl: string;
  private notteEnabled: boolean;
  private metadataEnabled: boolean;

  constructor(options: SelfHostedContentOptions = {}) {
    this.fastcrwUrl = options.fastcrwUrl || serverEnv.FASTCRW_URL || '';
    this.notteEnabled = options.notteEnabled ?? true;
    this.metadataEnabled = options.metadataEnabled ?? true;
  }

  async getContents(links: string[]): Promise<SearchResult[]> {
    const uniqueUrls = Array.from(new Set(links)).filter(isHttpUrl);
    if (uniqueUrls.length === 0) return [];

    log.debug(`[SelfHostedContent] getContents called with ${uniqueUrls.length} URLs`);

    const results: SearchResult[] = [];
    let remaining = [...uniqueUrls];

    // Phase 1: fastCRW (when configured)
    if (this.fastcrwUrl) {
      const fastcrwResults = await all(
        Object.fromEntries(
          uniqueUrls.map((url, i) => [`fc:${i}`, async () => scrapeWithFastCrw(url, this.fastcrwUrl)]),
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

    // Phase 2: Notte fallback (only if API key is configured and not disabled)
    if (
      remaining.length > 0 &&
      this.notteEnabled &&
      serverEnv.NOTTE_API_KEY &&
      serverEnv.NOTTE_API_KEY !== 'placeholder'
    ) {
      log.debug(`[SelfHostedContent] ${remaining.length} URLs remaining, trying Notte`);
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

    // Phase 3: Metadata fallback (only if not disabled)
    if (remaining.length > 0 && this.metadataEnabled) {
      log.debug(`[SelfHostedContent] ${remaining.length} URLs remaining, trying metadata fallback`);
      const metaResults = await all(
        Object.fromEntries(remaining.map((url, i) => [`md:${i}`, async () => scrapeWithMetadata(url)])),
        getBetterAllOptions(),
      );

      for (const key of Object.keys(metaResults)) {
        const result = metaResults[key];
        if (result) results.push(result);
      }
    }

    log.debug(`[SelfHostedContent] getContents returning ${results.length} total results`);
    return results;
  }
}

export async function scrapeWithFastCrwForBrowsePage(
  url: string,
  fastcrwUrl?: string,
): Promise<{ title: string; content: string; favicon: string } | null> {
  const baseUrl = fastcrwUrl || serverEnv.FASTCRW_URL || '';
  if (!baseUrl) return null;
  return scrapeWithFastCrw(url, baseUrl);
}
