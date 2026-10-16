import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '../types';
import type { SearchStrategy } from './web-search';
import { searxngSearch, searxngTimeRange } from '@/lib/search/searxng-client';
import { mergeArchiveResults } from '@/lib/vector/archive-merge';

import { createLogger } from '@/lib/logger';
import { isHybridSearchAvailable } from '@/lib/instance/capabilities';
import type { UserPreferenceValues } from '@/lib/db/schema';

const log = createLogger('searxng-search');

export class SearXNGSearchStrategy implements SearchStrategy {
  private baseUrl: string;
  private preferences?: UserPreferenceValues;
  private userId?: string;

  constructor(baseUrl: string, preferences?: Record<string, unknown>, userId?: string) {
    this.baseUrl = baseUrl;
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
      abortSignal?: AbortSignal;
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
          const hits = await searxngSearch(
            this.baseUrl,
            {
              q: query,
              language: options.language ?? 'all',
              time_range: searxngTimeRange(topic, options.startDates?.[i]),
            },
            options.abortSignal,
          );

          const sortedResults = [...hits].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

          const results = sortedResults.slice(0, maxResults).map((r) => ({
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

    // Hybrid step: indexed (Qdrant) content comes back as a separate "[archive]"
    // entry, never mixed into the live results, or the model would treat stale
    // pages from past conversations as results of its own search.
    const allSearxngResults = searches.flatMap((s) => s.results);
    const hybridSearchAvailable = isHybridSearchAvailable();
    if (
      hybridSearchAvailable &&
      this.preferences?.['zetora-hybrid-search-enabled'] === true &&
      allSearxngResults.length > 0
    ) {
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
    if (hybridSearchAvailable && this.preferences?.['zetora-content-indexing-enabled'] === true) {
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
