import Exa from 'exa-js';
import FirecrawlApp, { type SearchResultWeb } from '@mendable/firecrawl-js';
import Parallel from 'parallel-web';
import { all } from 'better-all';

import { serverEnv } from '@/env/server';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { resolveFallbackSearchProvider, resolveSearchProvider } from '@/lib/instance/capabilities';
import { getLinkMetadata } from '@/lib/link-metadata';
import { createLogger } from '@/lib/logger';
import { fastCrwSearch } from '@/lib/search/fastcrw-client';
import type { SearchProviderFor } from '@/lib/search/providers';
import { searxngSearch, searxngTimeRange } from '@/lib/search/searxng-client';
import { EXA_SEARCH_TIMEOUT_MS, withTimeout } from '@/lib/timeouts';
import { getBetterAllOptions } from '@/lib/better-all';
import { getFaviconUrl, getHostFaviconUrl } from '@/lib/url';
import {
  FastCrwContentStrategy,
  NotteContentStrategy,
  type ContentExtractionStrategy,
  type SearchResult,
} from '@/lib/tools/self-hosted-content';

const log = createLogger('extreme-search');

function isHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildMetadataFallbackContent(params: {
  title: string;
  description?: string;
  canonical?: string;
  finalUrl?: string;
}) {
  const description = (params.description || '').trim();
  const parts = [params.title.trim(), description].filter(Boolean);

  if (params.canonical && params.canonical !== params.finalUrl) parts.push(`Canonical: ${params.canonical}`);
  if (params.finalUrl) parts.push(`Final URL: ${params.finalUrl}`);

  const content = parts.join('\n\n').trim();
  return content || params.title.trim();
}

export function getHostnameForUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function getMetadataFallbackResults(urls: string[], logPrefix: string): Promise<SearchResult[]> {
  const uniqueUrls = Array.from(new Set(urls)).filter(isHttpUrl);
  if (uniqueUrls.length === 0) return [];

  log.debug(`[${logPrefix}] Using the metadata fallback for ${uniqueUrls.length} URLs:`, uniqueUrls);

  const metadataResults = await all(
    Object.fromEntries(
      uniqueUrls.map((url, index) => [
        `md:${index}`,
        async () => {
          const data = await getLinkMetadata(url);
          if (!data) return null;
          const parsedUrl = new URL(url);

          const title = data.title || parsedUrl.hostname || url.split('/').pop() || 'Retrieved Content';
          const content = buildMetadataFallbackContent({
            title,
            description: data.description,
            canonical: data.canonical,
            finalUrl: data.finalUrl,
          }).slice(0, 3000);

          return {
            title,
            url,
            content,
            publishedDate: '',
            favicon: data.favicon || getHostFaviconUrl(parsedUrl.hostname),
            description: data.description,
            canonical: data.canonical,
            ogUrl: data.ogUrl,
            finalUrl: data.finalUrl,
            siteName: data.siteName,
            image: data.image,
          } satisfies SearchResult;
        },
      ]),
    ),
    getBetterAllOptions(),
  );

  const results: SearchResult[] = [];
  for (const key of Object.keys(metadataResults)) {
    const result = metadataResults[key];
    if (result) results.push(result);
  }

  return results;
}

// Single-provider content strategies — each returns only what it actually
// extracted for the given links, no internal chaining to another provider.
// Fallback and metadata fallback are orchestrated by runExtremeContentExtraction
// below, so the same set of strategies serves both webSearch's content step
// and browsePage.
export class ExaContentStrategy implements ContentExtractionStrategy {
  constructor(
    private exa: Exa,
    private maxContentChars = 3000,
  ) {}

  async getContents(links: string[]): Promise<SearchResult[]> {
    try {
      const result = await this.exa.getContents(links, {
        text: { maxCharacters: this.maxContentChars, includeHtmlTags: false },
        livecrawl: 'preferred',
      });

      return result.results
        .filter((r) => r.text && r.text.trim())
        .map((r) => ({
          title: r.title || r.url.split('/').pop() || 'Retrieved Content',
          url: r.url,
          content: r.text!,
          publishedDate: r.publishedDate || '',
          favicon: r.favicon || getFaviconUrl(r.url),
        }));
    } catch (error) {
      log.error('[Exa] getContents error:', error);
      return [];
    }
  }
}

export class FirecrawlContentStrategy implements ContentExtractionStrategy {
  constructor(
    private firecrawl: FirecrawlApp,
    private maxContentChars = 3000,
  ) {}

  async getContents(links: string[]): Promise<SearchResult[]> {
    const firecrawlResults = await all(
      Object.fromEntries(
        links.map((url, index) => [
          `fc:${index}`,
          async () => {
            try {
              const scrapeResponse = await this.firecrawl.scrape(url, {
                formats: ['markdown'],
                proxy: 'auto',
                storeInCache: true,
                parsers: ['pdf'],
              });

              if (scrapeResponse.markdown) {
                return {
                  title: scrapeResponse.metadata?.title || url.split('/').pop() || 'Retrieved Content',
                  url,
                  content: scrapeResponse.markdown.slice(0, this.maxContentChars),
                  publishedDate: (scrapeResponse.metadata?.publishedDate as string) || '',
                  favicon: getFaviconUrl(url),
                };
              }
              return null;
            } catch (firecrawlError) {
              log.error(`[Firecrawl] getContents error for ${url}:`, firecrawlError);
              return null;
            }
          },
        ]),
      ),
      getBetterAllOptions(),
    );

    const results: SearchResult[] = [];
    for (const key of Object.keys(firecrawlResults)) {
      const result = firecrawlResults[key];
      if (result) results.push(result);
    }
    return results;
  }
}

export class ParallelContentStrategy implements ContentExtractionStrategy {
  constructor(
    private parallel: Parallel,
    private maxContentChars = 3000,
  ) {}

  async getContents(links: string[]): Promise<SearchResult[]> {
    try {
      const response = await this.parallel.beta.extract({
        urls: links,
        excerpts: false,
        full_content: true,
        betas: ['search-extract-2025-10-10'],
      });

      return (response.results || [])
        .filter((r: any) => r.full_content)
        .map((r: any) => ({
          title: r.title || r.url.split('/').pop() || 'Retrieved Content',
          url: r.url,
          content: String(r.full_content).slice(0, this.maxContentChars),
          publishedDate: r.publish_date || '',
          favicon: getFaviconUrl(r.url),
        }));
    } catch (error) {
      log.error('[Parallel] getContents error:', error);
      return [];
    }
  }
}

export const SEARCH_CATEGORIES = ['news', 'company', 'research paper', 'financial report'] as const;
type SearchCategory = (typeof SEARCH_CATEGORIES)[number];

export interface ExtremeSearchOptions {
  category?: SearchCategory;
  includeDomains?: string[];
  startDate?: string;
  abortSignal?: AbortSignal;
}

// Deep research fetches page content in a second step, so its searches only
// return links (content is empty) and never throw: a failed provider gives
// no results, which lets the caller try the fallback provider.
interface SearchProviderStrategy {
  search(query: string, options: ExtremeSearchOptions): Promise<SearchResult[]>;
}

const EXTREME_SEARCH_RESULT_LIMIT = 8;

function withSiteFilter(query: string, includeDomains?: string[]): string {
  if (!includeDomains?.length) return query;
  return `${query} ${includeDomains.map((domain) => `site:${domain}`).join(' OR ')}`;
}

function linkResult(r: { url: string; title?: string; publishedDate?: string; favicon?: string }): SearchResult {
  return {
    title: r.title || '',
    url: r.url,
    content: '',
    publishedDate: r.publishedDate || '',
    favicon: r.favicon || getFaviconUrl(r.url),
  };
}

class ExaSearchStrategy implements SearchProviderStrategy {
  constructor(private exa: Exa) {}

  async search(query: string, { category, includeDomains, startDate }: ExtremeSearchOptions): Promise<SearchResult[]> {
    try {
      // exa-js takes no abort signal: the timeout only stops the wait.
      const { results } = await withTimeout(
        this.exa.search(query, {
          numResults: EXTREME_SEARCH_RESULT_LIMIT,
          type: 'auto',
          ...(category && { category }),
          ...(includeDomains && { includeDomains }),
          ...(startDate && {
            startPublishedDate: new Date(startDate).toISOString(),
            endPublishedDate: new Date().toISOString(),
          }),
        }),
        EXA_SEARCH_TIMEOUT_MS,
        `Exa search timed out for query "${query}"`,
      );
      return results.map((r) => linkResult({ ...r, title: r.title ?? undefined }));
    } catch (error) {
      log.error('[Exa] search error:', error);
      return [];
    }
  }
}

class SearXNGSearchStrategy implements SearchProviderStrategy {
  constructor(private baseUrl: string) {}

  async search(
    query: string,
    { category, includeDomains, startDate, abortSignal }: ExtremeSearchOptions,
  ): Promise<SearchResult[]> {
    try {
      const hits = await searxngSearch(
        this.baseUrl,
        {
          q: withSiteFilter(query, includeDomains),
          language: 'all',
          time_range: searxngTimeRange(category === 'news' ? 'news' : 'general', startDate),
        },
        abortSignal,
      );
      return hits.slice(0, EXTREME_SEARCH_RESULT_LIMIT).map(linkResult);
    } catch (error) {
      log.error('[SearXNG] search error:', error);
      return [];
    }
  }
}

class FastCrwSearchStrategy implements SearchProviderStrategy {
  constructor(private baseUrl: string) {}

  async search(
    query: string,
    { category, includeDomains, abortSignal }: ExtremeSearchOptions,
  ): Promise<SearchResult[]> {
    try {
      const hits = await fastCrwSearch(
        this.baseUrl,
        {
          query: withSiteFilter(query, includeDomains),
          limit: EXTREME_SEARCH_RESULT_LIMIT,
          ...(category === 'news' && { category: 'news' as const }),
        },
        abortSignal,
      );
      return hits.map(linkResult);
    } catch (error) {
      log.error('[fastCRW] search error:', error);
      return [];
    }
  }
}

export class FirecrawlSearchStrategy implements SearchProviderStrategy {
  constructor(private firecrawl: FirecrawlApp) {}

  async search(query: string, { includeDomains }: ExtremeSearchOptions): Promise<SearchResult[]> {
    try {
      const firecrawlResults = await this.firecrawl.search(withSiteFilter(query, includeDomains), {
        limit: EXTREME_SEARCH_RESULT_LIMIT,
        scrapeOptions: { storeInCache: true },
      });

      return (firecrawlResults.web ?? [])
        .filter((r): r is SearchResultWeb => 'url' in r && typeof r.url === 'string')
        .map((r) => linkResult({ url: r.url, title: r.title || r.url }));
    } catch (error) {
      log.error('[Firecrawl] search error:', error);
      return [];
    }
  }
}

export type ExtremeSearchProvider = SearchProviderFor<'extremeSearch'>;
export type ExtremeContentProvider = SearchProviderFor<'extremeContent'>;

export interface ExtremeProviderClients {
  exa: Exa;
  firecrawl: FirecrawlApp;
  parallel: Parallel;
}

function buildExtremeSearchStrategy(
  provider: ExtremeSearchProvider,
  clients: ExtremeProviderClients,
): SearchProviderStrategy {
  // Providers come from resolveSearchProvider, so their URL is configured.
  if (provider === 'firecrawl') return new FirecrawlSearchStrategy(clients.firecrawl);
  if (provider === 'searxng') return new SearXNGSearchStrategy(serverEnv.SEARXNG_URL!);
  if (provider === 'fastcrw') return new FastCrwSearchStrategy(serverEnv.FASTCRW_URL!);
  return new ExaSearchStrategy(clients.exa);
}

export async function runExtremeSearchProvider(
  provider: ExtremeSearchProvider,
  clients: ExtremeProviderClients,
  query: string,
  options: ExtremeSearchOptions = {},
): Promise<SearchResult[]> {
  return buildExtremeSearchStrategy(provider, clients).search(query, options);
}

function buildExtremeContentStrategy(
  provider: ExtremeContentProvider,
  clients: ExtremeProviderClients,
  maxContentChars: number,
): ContentExtractionStrategy {
  if (provider === 'firecrawl') return new FirecrawlContentStrategy(clients.firecrawl, maxContentChars);
  if (provider === 'parallel') return new ParallelContentStrategy(clients.parallel, maxContentChars);
  if (provider === 'fastcrw') return new FastCrwContentStrategy(serverEnv.FASTCRW_URL!, maxContentChars);
  if (provider === 'notte') return new NotteContentStrategy(maxContentChars);
  return new ExaContentStrategy(clients.exa, maxContentChars);
}

// Content extraction fallback is per-URL, not per-batch: the primary strategy
// is tried for every link, only the links it couldn't resolve move on to the
// fallback strategy, and whatever's still missing gets the metadata-only
// fallback. This preserves the original ExaContentStrategy's per-URL
// behavior instead of re-fetching links that already succeeded.
export async function runExtremeContentExtraction(
  links: string[],
  // Null when this instance has no content provider: metadata only.
  provider: ExtremeContentProvider | null,
  fallbackProvider: ExtremeContentProvider | null,
  metadataEnabled: boolean,
  clients: ExtremeProviderClients,
  { maxContentChars = 3000, abortSignal }: { maxContentChars?: number; abortSignal?: AbortSignal } = {},
): Promise<SearchResult[]> {
  if (links.length === 0) return [];

  const results: SearchResult[] = [];
  let remaining = Array.from(new Set(links));

  if (provider) {
    try {
      const primaryResults = await buildExtremeContentStrategy(provider, clients, maxContentChars).getContents(
        remaining,
        abortSignal,
      );
      results.push(...primaryResults);
      const resolved = new Set(primaryResults.map((r) => r.url));
      remaining = remaining.filter((url) => !resolved.has(url));
    } catch (error) {
      log.error(`[ExtremeContent] ${provider} error:`, error);
    }
  }

  if (remaining.length > 0 && fallbackProvider) {
    try {
      const fallbackResults = await buildExtremeContentStrategy(fallbackProvider, clients, maxContentChars).getContents(
        remaining,
        abortSignal,
      );
      results.push(...fallbackResults);
      const resolved = new Set(fallbackResults.map((r) => r.url));
      remaining = remaining.filter((url) => !resolved.has(url));
    } catch (error) {
      log.error(`[ExtremeContent] ${fallbackProvider} fallback error:`, error);
    }
  }

  if (remaining.length > 0 && metadataEnabled) {
    const metadataResults = await getMetadataFallbackResults(remaining, provider ?? 'ExtremeContent');
    results.push(...metadataResults);
  }

  return results;
}

// The providers one research run uses, resolved once from the instance and the user's preferences.
export interface ExtremeProviderStack {
  searchProvider: ExtremeSearchProvider;
  searchFallbackProvider: ExtremeSearchProvider | null;
  contentProvider: ExtremeContentProvider | null;
  contentFallbackProvider: ExtremeContentProvider | null;
  metadataEnabled: boolean;
  clients: ExtremeProviderClients;
}

export function resolveExtremeProviderStack(preferences: UserPreferenceValues | null): ExtremeProviderStack {
  const searchProvider = resolveSearchProvider('extremeSearch', preferences?.['zetora-extreme-search-provider']);
  if (!searchProvider) throw new Error('No Extreme Search provider is configured on this instance');
  const searchFallbackProvider =
    preferences?.['zetora-extreme-search-fallback-enabled'] === true
      ? resolveFallbackSearchProvider(
          'extremeSearch',
          preferences?.['zetora-extreme-search-fallback-provider'],
          searchProvider,
        )
      : null;

  const contentProvider = resolveSearchProvider('extremeContent', preferences?.['zetora-extreme-content-provider']);
  const contentFallbackProvider =
    contentProvider && preferences?.['zetora-extreme-content-fallback-enabled'] === true
      ? resolveFallbackSearchProvider(
          'extremeContent',
          preferences?.['zetora-extreme-content-fallback-provider'],
          contentProvider,
        )
      : null;

  return {
    searchProvider,
    searchFallbackProvider,
    contentProvider,
    contentFallbackProvider,
    metadataEnabled: preferences?.['zetora-fallback-metadata'] !== false,
    clients: {
      exa: new Exa(serverEnv.EXA_API_KEY),
      firecrawl: new FirecrawlApp({ apiKey: serverEnv.FIRECRAWL_API_KEY }),
      parallel: new Parallel({ apiKey: serverEnv.PARALLEL_API_KEY }),
    },
  };
}
