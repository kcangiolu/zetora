import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '../types';
import type { SearchStrategy } from './web-search';
import { FASTCRW_SEARCH_TIMEOUT_MS } from '@/lib/timeouts';

interface FastCrwApiResult {
  url: string;
  title: string;
  snippet?: string;
  description?: string;
  score?: number;
  category?: string;
}

interface FastCrwApiResponse {
  success: boolean;
  data: FastCrwApiResult[];
}

export class FastCrwWebSearchStrategy implements SearchStrategy {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async search(
    queries: string[],
    options: {
      maxResults: number[];
      topics: ('general' | 'news')[];
      quality: ('default' | 'best')[];
      startDates?: (string | null)[];
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
          const body: Record<string, unknown> = { query, limit: maxResults };
          if (topic === 'news') body.category = 'news';

          const response = await fetch(`${this.baseUrl}/v1/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(FASTCRW_SEARCH_TIMEOUT_MS),
          });

          if (!response.ok) {
            throw new Error(`fastCRW returned ${response.status}`);
          }

          const data = (await response.json()) as FastCrwApiResponse;

          const results = (data.data || []).slice(0, maxResults).map((r) => ({
            url: r.url,
            title: r.title || '',
            content: r.snippet || r.description || '',
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
          console.error(`fastCRW search error for query "${query}":`, error);

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
