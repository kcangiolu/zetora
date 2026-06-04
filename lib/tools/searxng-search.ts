import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '../types';
import type { SearchStrategy } from './web-search';

interface SearXNGResult {
  url: string;
  title: string;
  content: string;
  engine: string;
  score: number;
  publishedDate?: string;
}

export class SearXNGSearchStrategy implements SearchStrategy {
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
          const params = new URLSearchParams({
            q: query,
            format: 'json',
            pageno: '1',
            language: 'en',
            time_range: topic === 'news' ? 'week' : '',
            safesearch: '1',
          });

          const response = await fetch(`${this.baseUrl}/search?${params.toString()}`);

          if (!response.ok) {
            throw new Error(`SearXNG returned ${response.status}`);
          }

          const data = await response.json();

          const results = (data.results || [])
            .slice(0, maxResults)
            .map((r: SearXNGResult) => ({
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
          console.error(`SearXNG search error for query "${query}":`, error);

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
