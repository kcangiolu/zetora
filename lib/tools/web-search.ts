import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';
import { serverEnv } from '@/env/server';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '../types';
import Parallel from 'parallel-web';
import FirecrawlApp, { SearchResultWeb, SearchResultNews, SearchResultImages, Document } from '@mendable/firecrawl-js';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { SearXNGSearchStrategy } from './searxng-search';
import { FastCrwWebSearchStrategy } from './fastcrw-web-search';
import { clampSearchInput, dedupeAndCapSearches, enrichBestQualityResults } from './web-search-limits';
import { SelfHostedContentStrategy } from './self-hosted-content';
import { EXA_SEARCH_TIMEOUT_MS, withTimeout } from '@/lib/timeouts';
import { resolveFallbackSearchProvider, resolveSearchProvider } from '@/lib/instance/capabilities';
import type { SearchProviderFor } from '@/lib/search/providers';

import { createLogger } from '@/lib/logger';
import { isConfigured } from '@/ai/catalog/env';

const log = createLogger('web-search');

// Singleton clients - initialized lazily and reused across requests
let _searchClients: {
  exa: Exa;
  parallel: Parallel;
  firecrawl: FirecrawlApp;
} | null = null;

function getSearchClients() {
  if (!_searchClients) {
    _searchClients = {
      exa: new Exa(serverEnv.EXA_API_KEY),
      parallel: new Parallel({ apiKey: serverEnv.PARALLEL_API_KEY }),
      firecrawl: new FirecrawlApp({ apiKey: serverEnv.FIRECRAWL_API_KEY }),
    };
  }
  return _searchClients;
}

const extractDomain = (url: string | null | undefined): string => {
  if (!url || typeof url !== 'string') return '';
  const urlPattern = /^https?:\/\/([^/?#]+)(?:[/?#]|$)/i;
  return url.match(urlPattern)?.[1] || url;
};

const cleanTitle = (title: string): string => {
  // Remove content within square brackets and parentheses, then trim whitespace
  return title
    .replace(/\[.*?\]/g, '') // Remove [content]
    .replace(/\(.*?\)/g, '') // Remove (content)
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim(); // Remove leading/trailing whitespace
};

const deduplicateByDomainAndUrl = <T extends { url: string }>(items: T[]): T[] => {
  const seenDomains = new Set<string>();
  const seenUrls = new Set<string>();

  return items.filter((item) => {
    const domain = extractDomain(item.url);
    const isNewUrl = !seenUrls.has(item.url);
    const isNewDomain = !seenDomains.has(domain);

    if (isNewUrl && isNewDomain) {
      seenUrls.add(item.url);
      seenDomains.add(domain);
      return true;
    }
    return false;
  });
};

// Helper function to check if an item is SearchResultWeb
const isSearchResultWeb = (item: SearchResultWeb | Document): item is SearchResultWeb => {
  return 'url' in item && typeof item.url === 'string';
};

// Helper function to check if an item is SearchResultNews with valid URL
const isSearchResultNewsWithUrl = (item: SearchResultNews | Document): item is SearchResultNews & { url: string } => {
  return 'url' in item && typeof item.url === 'string' && item.url.length > 0;
};

// Helper function to check if an item is SearchResultImages
const isSearchResultImages = (item: SearchResultImages | Document): item is SearchResultImages => {
  return ('url' in item && typeof item.url === 'string') || ('imageUrl' in item && typeof item.imageUrl === 'string');
};

// Helper function to get URL from SearchResultImages
const getImageUrl = (item: SearchResultImages): string | undefined => {
  return item.imageUrl || item.url;
};

// Image results from Firecrawl, used by the strategies whose provider
// returns none. Skipped without a Firecrawl key, so a query never goes to a
// service the instance did not set up. Images are an extra: a failure is
// logged and the search goes on without them.
async function searchFirecrawlImages(
  firecrawl: FirecrawlApp,
  query: string,
  limit: number,
): Promise<Array<{ url: string; description: string }>> {
  if (!isConfigured(serverEnv.FIRECRAWL_API_KEY)) return [];
  try {
    const response = await firecrawl.search(query, {
      sources: ['images'],
      limit,
      scrapeOptions: { storeInCache: true },
    });
    return (response.images ?? [])
      .filter(isSearchResultImages)
      .map((item) => ({ url: getImageUrl(item) || '', description: cleanTitle(item.title || '') }))
      .filter((item) => item.url);
  } catch (error) {
    log.error(`Firecrawl image search failed for query "${query}":`, error);
    return [];
  }
}

// Search provider strategy interface
export interface SearchStrategy {
  search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
      language?: string;
      dataStream?: UIMessageStreamWriter<ChatMessage>;
      abortSignal?: AbortSignal;
    },
  ): Promise<{ searches: Array<{ query: string; results: any[]; images: any[] }> }>;
}

// Helper function to format date for Firecrawl tbs parameter
const formatDateForFirecrawl = (dateStr: string): string => {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

// Parallel AI search strategy
class ParallelSearchStrategy implements SearchStrategy {
  constructor(
    private parallel: Parallel,
    private firecrawl: FirecrawlApp,
  ) {}

  async search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
      dataStream?: UIMessageStreamWriter<ChatMessage>;
    },
  ) {
    // Limit queries to first 5 for Parallel AI
    const limitedQueries = queries.slice(0, 5);
    log.debug('Using Parallel AI batch processing for queries:', limitedQueries);

    // Send start notifications for all queries
    limitedQueries.forEach((query, index) => {
      options.dataStream?.write({
        type: 'data-query_completion',
        data: {
          query,
          index,
          total: limitedQueries.length,
          status: 'started',
          resultsCount: 0,
          imagesCount: 0,
        },
      });
    });

    try {
      const perQueryPromises = limitedQueries.map(async (query, index) => {
        const currentMaxResults = options.maxResults[index] || options.maxResults[0] || 10;
        const currentStartDate = options.startDates?.[index] || options.startDates?.[0] || null;
        const parallel = this.parallel;
        const firecrawl = this.firecrawl;

        try {
          const { results, images } = await all(
            {
              singleResponse: async function () {
                return parallel.beta.search({
                  objective: query,
                  mode: 'fast',
                  max_results: Math.max(currentMaxResults, 10),
                  excerpts: {
                    max_chars_per_result: 5000,
                  },
                  fetch_policy: {
                    max_age_seconds: 3600,
                    timeout_seconds: 120,
                  },
                  ...(currentStartDate && {
                    source_policy: {
                      after_date: currentStartDate,
                    },
                  }),
                });
              },
              firecrawlImages: async function () {
                return searchFirecrawlImages(firecrawl, query, 3);
              },
              results: async function () {
                const singleResponse = await this.$.singleResponse;
                return (singleResponse?.results || []).map((result: any) => ({
                  url: result.url,
                  title: cleanTitle(result.title || ''),
                  content: Array.isArray(result.excerpts)
                    ? result.excerpts.join(' ').substring(0, 1000)
                    : (result.content || '').substring(0, 1000),
                  published_date: result.publish_date || undefined,
                  author: undefined,
                }));
              },
              images: async function () {
                return this.$.firecrawlImages;
              },
            },
            getBetterAllOptions(),
          );

          // Send completion notification
          options.dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index,
              total: limitedQueries.length,
              status: 'completed',
              resultsCount: results.length,
              imagesCount: images.length,
            },
          });

          return {
            query,
            results: deduplicateByDomainAndUrl(results),
            images: deduplicateByDomainAndUrl(images),
          };
        } catch (error) {
          log.error(`Parallel AI search error for query "${query}":`, error);

          options.dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index,
              total: limitedQueries.length,
              status: 'error',
              resultsCount: 0,
              imagesCount: 0,
            },
          });

          return { query, results: [], images: [] };
        }
      });

      const searchResults = await Promise.all(perQueryPromises);
      return { searches: searchResults };
    } catch (error) {
      log.error('Parallel AI batch orchestration error:', error);

      // Send error notifications for all queries
      limitedQueries.forEach((query, index) => {
        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: limitedQueries.length,
            status: 'error',
            resultsCount: 0,
            imagesCount: 0,
          },
        });
      });

      return {
        searches: limitedQueries.map((query) => ({ query, results: [], images: [] })),
      };
    }
  }
}

// Firecrawl search strategy
class FirecrawlSearchStrategy implements SearchStrategy {
  constructor(private firecrawl: FirecrawlApp) {}

  async search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
      dataStream?: UIMessageStreamWriter<ChatMessage>;
    },
  ) {
    const searchPromises = queries.map(async (query, index) => {
      const currentTopic = options.topics[index] || options.topics[0] || 'general';
      const currentMaxResults = options.maxResults[index] || options.maxResults[0] || 10;
      const currentStartDate = options.startDates?.[index] || options.startDates?.[0] || null;
      const firecrawl = this.firecrawl;

      // Build tbs parameter for date filtering
      const buildTbsParam = (startDate: string | null): string | undefined => {
        if (!startDate) return undefined;
        const startFormatted = formatDateForFirecrawl(startDate);
        const endFormatted = formatDateForFirecrawl(new Date().toISOString());
        return `cdr:1,cd_min:${startFormatted},cd_max:${endFormatted}`;
      };

      try {
        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: queries.length,
            status: 'started',
            resultsCount: 0,
            imagesCount: 0,
          },
        });

        const { results, images } = await all(
          {
            firecrawlData: async function () {
              const sources = [] as ('web' | 'news' | 'images')[];

              if (currentTopic === 'news') {
                sources.push('news', 'web');
              } else {
                sources.push('web');
              }
              sources.push('images');

              const tbsParam = buildTbsParam(currentStartDate);
              return firecrawl.search(query, {
                sources,
                limit: currentMaxResults,
                ...(tbsParam && { tbs: tbsParam }),
              });
            },
            results: async function () {
              const firecrawlData = await this.$.firecrawlData;
              let results: any[] = [];

              if (firecrawlData?.web && Array.isArray(firecrawlData.web)) {
                const webResults = firecrawlData.web.filter(isSearchResultWeb);
                results = deduplicateByDomainAndUrl(webResults).map((result) => ({
                  url: result.url,
                  title: cleanTitle(result.title || ''),
                  content: result.description || '',
                  published_date: undefined,
                  author: undefined,
                }));
              }

              if (firecrawlData?.news && Array.isArray(firecrawlData.news) && currentTopic === 'news') {
                const newsResults = firecrawlData.news.filter(isSearchResultNewsWithUrl);
                const processedNewsResults = deduplicateByDomainAndUrl(newsResults).map((result) => ({
                  url: result.url,
                  title: cleanTitle(result.title || ''),
                  content: result.snippet || '',
                  published_date: result.date || undefined,
                  author: undefined,
                }));

                results = [...processedNewsResults, ...results];
              }

              return results;
            },
            images: async function () {
              const firecrawlData = await this.$.firecrawlData;
              if (!firecrawlData?.images || !Array.isArray(firecrawlData.images)) return [];

              const imageResults = firecrawlData.images.filter(isSearchResultImages);
              const processedImages = imageResults
                .map((image) => ({
                  url: getImageUrl(image) || '',
                  description: cleanTitle(image.title || ''),
                }))
                .filter((img) => img.url);
              return deduplicateByDomainAndUrl(processedImages);
            },
          },
          getBetterAllOptions(),
        );

        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: queries.length,
            status: 'completed',
            resultsCount: results.length,
            imagesCount: images.length,
          },
        });

        return {
          query,
          results: deduplicateByDomainAndUrl(results),
          images: images.filter((img) => img.url && img.description),
        };
      } catch (error) {
        log.error(`Firecrawl search error for query "${query}":`, error);

        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: queries.length,
            status: 'error',
            resultsCount: 0,
            imagesCount: 0,
          },
        });

        return {
          query,
          results: [],
          images: [],
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    return { searches: searchResults };
  }
}

// Exa search strategy
class ExaSearchStrategy implements SearchStrategy {
  constructor(
    private exa: Exa,
    private firecrawl: FirecrawlApp,
  ) {}

  async search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
      include_domains?: string[];
      exclude_domains?: string[];
      dataStream?: UIMessageStreamWriter<ChatMessage>;
    },
  ) {
    const searchPromises = queries.map(async (query, index) => {
      const currentTopic = options.topics[index] || options.topics[0] || 'general';
      const currentMaxResults = options.maxResults[index] || options.maxResults[0] || 10;
      const currentQuality = options.quality[index] || options.quality[0] || 'default';
      const currentStartDate = options.startDates?.[index] || options.startDates?.[0] || null;
      const exa = this.exa;
      const firecrawl = this.firecrawl;

      // Convert date to ISO format for Exa
      const formatDateForExa = (dateStr: string): string => {
        const date = new Date(dateStr);
        return date.toISOString();
      };

      try {
        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: queries.length,
            status: 'started',
            resultsCount: 0,
            imagesCount: 0,
          },
        });

        const { results, images } = await all(
          {
            data: async function () {
              const startPublishedDate = currentStartDate ? formatDateForExa(currentStartDate) : undefined;
              const endPublishedDate = currentStartDate ? formatDateForExa(new Date().toISOString()) : undefined;
              return withTimeout(
                exa.search(query, {
                  type: currentQuality === 'best' ? 'deep' : 'instant',
                  numResults: currentMaxResults < 15 ? 15 : currentMaxResults,
                  category: currentTopic === 'news' ? 'news' : undefined,
                  ...(startPublishedDate && { startPublishedDate }),
                  ...(endPublishedDate && { endPublishedDate }),
                  contents: {
                    highlights: {
                      maxCharacters: 4000,
                    },
                  },
                }),
                EXA_SEARCH_TIMEOUT_MS,
                `Exa search timed out for query "${query}"`,
              );
            },
            firecrawlImages: async function () {
              return searchFirecrawlImages(firecrawl, query, 8);
            },
            results: async function () {
              const data = await this.$.data;
              return deduplicateByDomainAndUrl(
                data.results.map((result) => ({
                  url: result.url,
                  title: cleanTitle(result.title || ''),
                  content: (result.highlights?.join(' ') || '').substring(0, 1000),
                  published_date: result.publishedDate ? result.publishedDate : undefined,
                  author: result.author || undefined,
                })),
              );
            },
            images: async function () {
              return this.$.firecrawlImages;
            },
          },
          getBetterAllOptions(),
        );

        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: queries.length,
            status: 'completed',
            resultsCount: results.length,
            imagesCount: images.length,
          },
        });

        return {
          query,
          results: deduplicateByDomainAndUrl(results),
          images: deduplicateByDomainAndUrl(
            images.filter((img: { url: string; description: string }) => img.url && img.description),
          ),
        };
      } catch (error) {
        log.error(`Exa search error for query "${query}":`, error);

        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index,
            total: queries.length,
            status: 'error',
            resultsCount: 0,
            imagesCount: 0,
          },
        });

        return {
          query,
          results: [],
          images: [],
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    return { searches: searchResults };
  }
}

// Search provider factory
type WebSearchProvider = SearchProviderFor<'web'>;

const createSearchStrategy = (
  provider: WebSearchProvider,
  clients: {
    exa: Exa;
    parallel: Parallel;
    firecrawl: FirecrawlApp;
  },
  preferences?: Record<string, unknown>,
  userId?: string,
): SearchStrategy => {
  // Providers come from resolveSearchProvider, so their URL is configured.
  if (provider === 'searxng') return new SearXNGSearchStrategy(serverEnv.SEARXNG_URL!, preferences, userId);
  if (provider === 'fastcrw') return new FastCrwWebSearchStrategy(serverEnv.FASTCRW_URL!);

  const strategies = {
    parallel: () => new ParallelSearchStrategy(clients.parallel, clients.firecrawl),
    firecrawl: () => new FirecrawlSearchStrategy(clients.firecrawl),
    exa: () => new ExaSearchStrategy(clients.exa, clients.firecrawl),
  };

  return strategies[provider]();
};

// Only built when this instance has a web search provider (see
// lib/search/tool-loader.ts); preferredProvider is the user's choice.
export function webSearchTool(
  dataStream?: UIMessageStreamWriter<ChatMessage> | undefined,
  preferredProvider?: string,
  preferences?: Record<string, unknown>,
  userId?: string,
) {
  const searchProvider = resolveSearchProvider('web', preferredProvider);
  if (!searchProvider) throw new Error('No web search provider is configured on this instance');
  const fallbackProvider =
    preferences?.['zetora-fallback-search-firecrawl'] === true &&
    preferences?.['zetora-search-fallback-provider'] !== 'none'
      ? resolveFallbackSearchProvider('web', preferences?.['zetora-search-fallback-provider'], searchProvider)
      : null;

  return tool({
    description: `This is the default tool of the app to be used to search the web for information with multiple queries (2-4), max results (8 per query), topics, and quality.
    Very important Rules:
    ...${searchProvider === 'parallel' ? 'The First Query should be the objective and the rest of the queries should be related to the objective' : ''}...
    - The queries should always be in the same language as the user's message.
    - Set \`language\` to the ISO 639-1 code of the user's message language (e.g. "fr", "de") so the search engine doesn't silently search in English.
    - Use 2-4 queries covering DISTINCT angles of the question — never near-duplicate queries.
    - Keep max results at 8 per query (10 absolute maximum) — quality over quantity.
    - Call this tool once for the initial pass; a single targeted follow-up call is allowed ONLY to verify a critical fact when sources conflict — never to re-run the same query.
    - Use \`quality: 'best'\` whenever the answer depends on precise figures, prices, thresholds, regulations, or validity dates — the snippet alone is rarely enough to verify those.
    - ⚠️ CRITICAL: ALWAYS include date/time context in search queries:
      - For current events: "latest", "${new Date().getFullYear()}", "today", "current", "recent"
      - For historical info: specific years or date ranges
      - For time-sensitive topics: "newest", "updated", "${new Date().getFullYear()}"
      - **NO TEMPORAL ASSUMPTIONS**: Never assume time periods - always be explicit about dates/years
      - Examples: "latest AI news ${new Date().getFullYear()}", "current stock prices today", "recent developments in ${new Date().getFullYear()}"
    `,
    inputSchema: z.object({
      queries: z
        .array(z.string().describe('Array of 2-4 search queries to look up on the web. Default is 3. Minimum is 1.'))
        .min(1)
        .max(5),
      maxResults: z
        .array(
          z.number().describe('Array of maximum number of results to return per query. Default is 8. Maximum is 10.'),
        )
        .optional(),
      topics: z
        .array(
          z
            .enum(['general', 'news'])
            .describe(
              'Array of topic types to search for. Default is general. Other options are news and finance. No other options are available.',
            ),
        )
        .optional(),
      language: z
        .string()
        .optional()
        .describe(
          "ISO 639-1 code of the language to search in (e.g. 'fr', 'de', 'es'), matching the user's message. Omit only if the user's message is in English.",
        ),
      quality: z
        .array(
          z
            .enum(['default', 'best'])
            .describe(
              "Array of quality levels for the search. 'default' returns short snippets. 'best' fetches the full page content for the top results of that query — use it whenever the answer depends on precise figures, prices, thresholds, or regulations that a snippet can't verify.",
            ),
        )
        .optional(),
      startDates: z
        .array(
          z
            .string()
            .nullable()
            .optional()
            .describe(
              'Array of start dates for filtering search results. Use ISO date format (YYYY-MM-DD). Results will be filtered to show only content published after this date. Only set this for breaking/recent news queries. Leave unset (or empty string) for reference material such as regulations, pricing, thresholds, or anything where the authoritative page may be old — restricting by date there hides official sources and surfaces only recent blog churn.',
            ),
        )
        .optional(),
    }),
    execute: async (
      {
        queries,
        maxResults,
        topics,
        quality,
        startDates,
        language,
      }: {
        queries: string[];
        maxResults?: (number | undefined)[];
        topics?: ('general' | 'news' | undefined)[];
        quality?: ('default' | 'best' | undefined)[];
        startDates?: (string | null | undefined)[];
        language?: string;
      },
      { abortSignal }: { abortSignal?: AbortSignal },
    ) => {
      // Use singleton clients (initialized at module level for reuse)
      const clients = getSearchClients();

      // Hard clamp regardless of what the model asked for (local models
      // routinely ignore the prompt-level 2-4 × 8 limits).
      ({ queries, maxResults } = clampSearchInput({ queries, maxResults }));

      log.debug('Queries:', queries);
      log.debug('Max Results:', maxResults);
      log.debug('Topics:', topics);
      log.debug('Quality:', quality);
      log.debug('Start Dates:', startDates);
      log.debug('Search Provider:', searchProvider);

      // Create and use the appropriate search strategy
      const strategy = createSearchStrategy(searchProvider, clients, preferences, userId);
      if (!topics) {
        topics = new Array(queries.length).fill('general');
      }
      if (!quality) {
        quality = new Array(queries.length).fill('default');
      }
      const normalizedLanguage = language && /^[a-z]{2}(-[A-Z]{2})?$/.test(language) ? language : undefined;
      const searchOptions = {
        maxResults: maxResults as number[],
        topics: topics as ('general' | 'news')[],
        quality: quality as ('default' | 'best')[],
        startDates: startDates as (string | null)[] | undefined,
        language: normalizedLanguage,
        dataStream,
        abortSignal,
      };
      let result = await strategy.search(queries, searchOptions);
      const hasNoResults = result.searches.every((s) => s.results.length === 0);
      if (hasNoResults && fallbackProvider) {
        log.debug(`${searchProvider} returned no results, falling back to ${fallbackProvider}`);
        const fallbackStrategy = createSearchStrategy(fallbackProvider, clients, preferences, userId);
        result = await fallbackStrategy.search(queries, searchOptions);
      }
      // Bound what flows back into the model's context: dedupe across
      // queries, cap per domain and globally, truncate snippets.
      const cappedSearches = dedupeAndCapSearches(result.searches);

      // For queries flagged 'best', replace the truncated snippet with the
      // full page content so the model can actually verify a figure instead
      // of guessing from 400 characters.
      const notteEnabled = preferences?.['zetora-fallback-notte'] !== false;
      const metadataEnabled = preferences?.['zetora-fallback-metadata'] !== false;
      const enrichedSearches = await enrichBestQualityResults(
        cappedSearches,
        quality as ('default' | 'best')[],
        async (urls) => {
          const contentStrategy = new SelfHostedContentStrategy({ notteEnabled, metadataEnabled });
          const contents = await contentStrategy.getContents(urls, abortSignal);
          return contents.map((c) => ({ url: c.url, content: c.content }));
        },
      );

      return { ...result, searches: enrichedSearches };
    },
  });
}
