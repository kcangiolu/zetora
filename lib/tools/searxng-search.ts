import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '../types';
import type { SearchStrategy } from './web-search';
import { SEARXNG_TIMEOUT_MS } from '@/lib/timeouts';
import { mergeArchiveResults } from '@/lib/vector/archive-merge';

import { createLogger } from '@/lib/logger';

const log = createLogger('searxng-search');

interface SearXNGResult {
  url: string;
  title: string;
  content: string;
  engine: string;
  score: number;
  publishedDate?: string;
}

// SearXNG only supports coarse time ranges — pick the smallest one that
// still covers the requested start date (other strategies filter exactly).
function resolveTimeRange(topic: 'general' | 'news', startDate?: string | null): string {
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) {
      const ageDays = (Date.now() - start.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays <= 1) return 'day';
      if (ageDays <= 7) return 'week';
      if (ageDays <= 31) return 'month';
      return 'year';
    }
  }
  return topic === 'news' ? 'week' : '';
}

export class SearXNGSearchStrategy implements SearchStrategy {
  private baseUrl: string;
  private preferences?: Record<string, unknown>;
  private userId?: string;

  constructor(baseUrl: string, preferences?: Record<string, unknown>, userId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.preferences = preferences;
    this.userId = userId;
  }

  async search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
      language?: string;
      dataStream?: UIMessageStreamWriter<ChatMessage>;
    },
  ): Promise<{ searches: Array<{ query: string; results: any[]; images: any[] }> }> {
    const searches = await Promise.all(
      queries.map(async (query, i) => {
        const maxResults = options.maxResults[i] ?? 10;
        const topic = options.topics[i] ?? 'general';

        options.dataStream?.write({
          type: 'data-query_completion',
          data: {
            query,
            index: i,
            total: queries.length,
            status: 'started',
            resultsCount: 0,
            imagesCount: 0,
          },
        });

        try {
          const params = new URLSearchParams({
            q: query,
            format: 'json',
            pageno: '1',
            // 'all' disables SearXNG's language filter — hard-coding 'en' here
            // used to force English-language results for non-English queries.
            language: options.language ?? 'all',
            time_range: resolveTimeRange(topic, options.startDates?.[i]),
            safesearch: '1',
          });

          const response = await fetch(`${this.baseUrl}/search?${params.toString()}`, {
            signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
          });

          if (!response.ok) {
            throw new Error(`SearXNG returned ${response.status}`);
          }

          const data = await response.json();

          const sortedResults = [...(data.results || [])].sort(
            (a: SearXNGResult, b: SearXNGResult) => (b.score ?? 0) - (a.score ?? 0),
          );

          const results = sortedResults.slice(0, maxResults).map((r: SearXNGResult) => ({
            url: r.url,
            title: r.title,
            content: r.content || '',
            published_date: r.publishedDate || undefined,
            author: undefined,
          }));

          options.dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index: i,
              total: queries.length,
              status: 'completed',
              resultsCount: results.length,
              imagesCount: 0,
            },
          });

          return { query, results, images: [] };
        } catch (error) {
          log.error(`SearXNG search error for query "${query}":`, error);

          options.dataStream?.write({
            type: 'data-query_completion',
            data: {
              query,
              index: i,
              total: queries.length,
              status: 'error',
              resultsCount: 0,
              imagesCount: 0,
            },
          });

          return { query, results: [], images: [] };
        }
      }),
    );

    // Hybrid step: surface previously indexed (Qdrant) content as a
    // separate, clearly labeled "[archive]" entry. It never replaces or
    // blends into the live SearXNG results for the query the model asked —
    // otherwise the model treats stale/unrelated indexed pages as if its own
    // search had found them (this is how a topic from a past conversation
    // used to leak into an unrelated one).
    const allSearxngResults = searches.flatMap((s) => s.results);
    if (this.preferences?.['zetora-hybrid-search-enabled'] === true && allSearxngResults.length > 0) {
      try {
        const { hybridSearch } = await import('@/lib/vector/hybrid-search');
        const fusedResults = await hybridSearch(
          queries[0], // use the first query as the primary query
          allSearxngResults.map((r) => ({ url: r.url, title: r.title, content: r.content })),
          this.preferences,
          this.userId,
        );
        const archiveResults = mergeArchiveResults(fusedResults);
        if (archiveResults.length > 0) {
          searches.push({ query: `[archive] ${queries[0]}`, results: archiveResults, images: [] });
        }
      } catch (error) {
        log.warn('Hybrid search fusion failed, using raw SearXNG results:', error);
      }
    }

    // Background content indexing (fire-and-forget)
    if (this.preferences?.['zetora-content-indexing-enabled'] === true) {
      const { indexSearchResults } = await import('@/lib/vector/content-indexer');
      indexSearchResults(
        allSearxngResults.map((r) => ({ url: r.url, title: r.title, content: r.content })),
        queries[0],
        this.preferences,
        this.userId,
      ).catch((err) => log.warn('Background content indexing failed:', err));
    }

    return { searches };
  }
}
