import { tool } from 'ai';
import { z } from 'zod';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '@/lib/types';
import { serverEnv } from '@/env/server';
import Parallel from 'parallel-web';
import Firecrawl from '@mendable/firecrawl-js';
import { all } from 'better-all';

import { createLogger } from '@/lib/logger';
import { resolveFallbackSearchProvider, resolveSearchProvider } from '@/lib/instance/capabilities';
import type { SearchProviderFor } from '@/lib/search/providers';
import { FASTCRW_SEARCH_TIMEOUT_MS, SEARXNG_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

const log = createLogger('reddit-search');

const parallel = new Parallel({ apiKey: serverEnv.PARALLEL_API_KEY });
const firecrawl = new Firecrawl({ apiKey: serverEnv.FIRECRAWL_API_KEY });

interface ParallelSearchResult {
  url?: string;
  title?: string;
  excerpts?: unknown;
  publish_date?: string | null;
}

interface ParallelSearchResponse {
  results: ParallelSearchResult[];
}

type RedditResult = {
  url: string | undefined;
  title: string | undefined;
  content: string;
  published_date?: string;
  subreddit: string;
  isRedditPost: boolean;
  comments: string[];
};

// Shared across every provider — none of them return structured subreddit
// metadata except Parallel, so it's parsed from the URL itself.
function parseRedditUrl(url: string | undefined): { subreddit: string; isRedditPost: boolean } {
  const subredditMatch = typeof url === 'string' ? url.match(/reddit\.com\/r\/([^/]+)/i) : null;
  const subreddit = subredditMatch ? subredditMatch[1] : 'unknown';
  const isRedditPost = typeof url === 'string' ? /reddit\.com\/r\/[^/]+\/comments\//i.test(url) : false;
  return { subreddit, isRedditPost };
}

type TimeRange = 'day' | 'week' | 'month' | 'year';

function getAfterDateFromTimeRange(timeRange: TimeRange | undefined): string | undefined {
  if (!timeRange) return;

  const now = new Date();
  const daysBackByRange: Record<TimeRange, number> = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
  };

  const daysBack = daysBackByRange[timeRange];
  const after = new Date(now);
  after.setUTCDate(after.getUTCDate() - daysBack);
  return after.toISOString().slice(0, 10);
}

function getTimeRangeAtIndex(timeRanges: TimeRange[] | undefined, index: number): TimeRange | undefined {
  if (!timeRanges?.length) return;
  return timeRanges[index] ?? timeRanges[0];
}

async function searchRedditWithParallel(query: string, maxResults: number, afterDate?: string): Promise<RedditResult[]> {
  const response = (await parallel.beta.search({
    objective: query,
    search_queries: [query],
    mode: 'fast' as any,
    max_results: maxResults < 10 ? 10 : maxResults,
    source_policy: {
      include_domains: ['reddit.com'],
      ...(afterDate ? { after_date: afterDate } : {}),
    },
  })) as ParallelSearchResponse;

  return response.results.map((result) => {
    const { subreddit, isRedditPost } = parseRedditUrl(result.url);

    const rawExcerpts = result.excerpts as unknown;
    let excerptsArray: string[] = [];
    if (Array.isArray(rawExcerpts)) {
      excerptsArray = (rawExcerpts as unknown[]).filter(
        (excerpt): excerpt is string => typeof excerpt === 'string' && excerpt.length > 0,
      );
    } else if (typeof rawExcerpts === 'string' && rawExcerpts.length > 0) {
      excerptsArray = [rawExcerpts];
    }

    return {
      url: result.url,
      title: result.title ?? result.url,
      content: excerptsArray.join('\n\n'),
      published_date: result.publish_date ?? undefined,
      subreddit,
      isRedditPost,
      comments: excerptsArray,
    };
  });
}

async function searchRedditWithFirecrawl(query: string, maxResults: number): Promise<RedditResult[]> {
  const firecrawlResults = await firecrawl.search(`${query} site:reddit.com`, {
    limit: maxResults,
    scrapeOptions: { storeInCache: true },
  });

  if (!firecrawlResults.web || !Array.isArray(firecrawlResults.web)) return [];

  return firecrawlResults.web.map((result) => {
    const r = result as any;
    const url = typeof r?.url === 'string' ? r.url : undefined;
    const { subreddit, isRedditPost } = parseRedditUrl(url);
    const content = typeof r?.description === 'string' ? r.description : '';
    return {
      url,
      title: typeof r?.title === 'string' ? r.title : url,
      content,
      subreddit,
      isRedditPost,
      comments: content ? [content] : [],
    };
  });
}

interface SearxngResult {
  url: string;
  title: string;
  content: string;
}

async function searchRedditWithSearxng(
  baseUrl: string,
  query: string,
  maxResults: number,
  abortSignal?: AbortSignal,
): Promise<RedditResult[]> {
  const params = new URLSearchParams({
    q: `${query} site:reddit.com`,
    format: 'json',
    safesearch: '1',
  });

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`, {
    signal: withAbort(abortSignal, SEARXNG_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`SearXNG returned ${response.status}`);
  }

  const data: { results?: SearxngResult[] } = await response.json();

  return (data.results || []).slice(0, maxResults).map((r) => {
    const { subreddit, isRedditPost } = parseRedditUrl(r.url);
    return {
      url: r.url,
      title: r.title || r.url,
      content: r.content || '',
      subreddit,
      isRedditPost,
      comments: r.content ? [r.content] : [],
    };
  });
}

interface FastCrwSearchApiResponse {
  success: boolean;
  data: {
    results: Array<{
      url: string;
      title: string;
      snippet: string;
      description: string;
      score: number;
      category: string;
    }>;
  };
}

async function searchRedditWithFastCrw(
  baseUrl: string,
  query: string,
  maxResults: number,
  abortSignal?: AbortSignal,
): Promise<RedditResult[]> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `${query} site:reddit.com`, limit: maxResults }),
    signal: withAbort(abortSignal, FASTCRW_SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`fastCRW returned ${response.status}`);
  }

  const data: FastCrwSearchApiResponse = await response.json();

  return (data.data?.results || []).map((r) => {
    const { subreddit, isRedditPost } = parseRedditUrl(r.url);
    const content = r.snippet || r.description || '';
    return {
      url: r.url,
      title: r.title || r.url,
      content,
      subreddit,
      isRedditPost,
      comments: content ? [content] : [],
    };
  });
}

type RedditSearchProvider = SearchProviderFor<'reddit'>;

async function runRedditProvider(
  provider: RedditSearchProvider,
  query: string,
  maxResults: number,
  afterDate: string | undefined,
  abortSignal?: AbortSignal,
): Promise<RedditResult[]> {
  if (provider === 'firecrawl') return searchRedditWithFirecrawl(query, maxResults);

  // Providers come from resolveSearchProvider, so their URL is configured.
  if (provider === 'searxng') return searchRedditWithSearxng(serverEnv.SEARXNG_URL!, query, maxResults, abortSignal);
  if (provider === 'fastcrw') return searchRedditWithFastCrw(serverEnv.FASTCRW_URL!, query, maxResults, abortSignal);

  return searchRedditWithParallel(query, maxResults, afterDate);
}

// Only built when this instance has a Reddit search provider (see
// lib/search/tool-loader.ts).
export function redditSearchTool(
  dataStream?: UIMessageStreamWriter<ChatMessage>,
  preferences?: Record<string, unknown>,
) {
  const provider = resolveSearchProvider('reddit', preferences?.['zetora-reddit-search-provider']);
  if (!provider) throw new Error('No Reddit search provider is configured on this instance');
  const fallbackProvider =
    preferences?.['zetora-reddit-search-fallback-enabled'] === true
      ? resolveFallbackSearchProvider('reddit', preferences?.['zetora-reddit-search-fallback-provider'], provider)
      : null;

  return tool({
    description: 'Search Reddit content using the configured search provider, with multiple queries.',
    inputSchema: z.object({
      queries: z
        .array(z.string().max(200))
        .describe('Array of search queries to execute on Reddit. Minimum 1, recommended 3-5.')
        .min(1)
        .max(5),
      maxResults: z
        .array(z.number())
        .optional()
        .describe('Array of maximum results per query. Default is 20 per query.'),
      timeRange: z
        .array(z.enum(['day', 'week', 'month', 'year']))
        .optional()
        .describe('Optional per-query time range. Used to set source_policy.after_date in the Parallel API.'),
    }),
    execute: async (
      {
        queries,
        maxResults,
        timeRange,
      }: {
        queries: string[];
        maxResults?: number[];
        timeRange?: TimeRange[];
      },
      { abortSignal }: { abortSignal?: AbortSignal },
    ) => {
      log.debug('Reddit search queries:', queries);
      log.debug('Max results:', maxResults);
      log.debug('Time ranges:', timeRange);

      const searchPromises = queries.map(async (query, index) => {
        const currentMaxResults = maxResults?.[index] || maxResults?.[0] || 20;
        const currentTimeRange = getTimeRangeAtIndex(timeRange, index);
        const afterDate = getAfterDateFromTimeRange(currentTimeRange);

        try {
          // Send start notification
          dataStream?.write({
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

          let processedResults: RedditResult[] = [];
          try {
            processedResults = await runRedditProvider(provider, query, currentMaxResults, afterDate, abortSignal);
          } catch (primaryError) {
            log.error(`Reddit search ${provider} error for query "${query}":`, primaryError);
          }

          if (processedResults.length === 0 && fallbackProvider) {
            try {
              log.debug(`Reddit search: ${provider} returned no results, falling back to ${fallbackProvider}`);
              processedResults = await runRedditProvider(
                fallbackProvider,
                query,
                currentMaxResults,
                afterDate,
                abortSignal,
              );
            } catch (fallbackError) {
              log.error(`Reddit search ${fallbackProvider} fallback error for query "${query}":`, fallbackError);
            }
          }

          const resultsCount = processedResults.length;

          // Send completion notification
          dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index,
              total: queries.length,
              status: 'completed',
              resultsCount: resultsCount,
              imagesCount: 0,
            },
          });

          return {
            query,
            results: processedResults,
          };
        } catch (error) {
          log.error(`Reddit search error for query "${query}":`, error);

          // Send error notification
          dataStream?.write({
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
          };
        }
      });

      const searches = await Promise.all(searchPromises);

      return {
        searches,
      };
    },
  });
}
