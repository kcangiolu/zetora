import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '../types';
import type { SearchStrategy } from './web-search';
import { fastCrwSearch } from '@/lib/search/fastcrw-client';

import { createLogger } from '@/lib/logger';

const log = createLogger('fastcrw-web-search');

export class FastCrwWebSearchStrategy implements SearchStrategy {
  constructor(private baseUrl: string) {}

  async search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
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
          const hits = await fastCrwSearch(
            this.baseUrl,
            { query, limit: maxResults, ...(topic === 'news' && { category: 'news' as const }) },
            options.abortSignal,
          );

          const results = hits.slice(0, maxResults).map((r) => ({
            url: r.url,
            title: r.title,
            content: r.content,
            published_date: undefined,
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
          log.error(`fastCRW search error for query "${query}":`, error);

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

    return { searches };
  }
}
