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

  constructor(baseUrl: string, preferences?: Record<string, unknown>) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.preferences = preferences;
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
            time_range: resolveTimeRange(topic, options.startDates?.[i]),
            safesearch: '1',
          });

          const response = await fetch(`${this.baseUrl}/search?${params.toString()}`);

          if (!response.ok) {
            throw new Error(`SearXNG returned ${response.status}`);
          }

          const data = await response.json();

          const results = (data.results || []).slice(0, maxResults).map((r: SearXNGResult) => ({
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

    // Hybrid step: fuse with Qdrant results when enabled
    const allSearxngResults = searches.flatMap((s) => s.results);
    if (this.preferences?.['zetora-hybrid-search-enabled'] === true && allSearxngResults.length > 0) {
      try {
        const { hybridSearch } = await import('@/lib/vector/hybrid-search');
        const fusedResults = await hybridSearch(
          queries[0], // use the first query as the primary query
          allSearxngResults.map((r) => ({ url: r.url, title: r.title, content: r.content })),
          this.preferences,
          allSearxngResults.length,
        );
        // Replace the first search's results with the fused results
        // Fused results are already deduplicated and reranked
        searches[0].results = fusedResults.map((r) => ({
          url: r.url,
          title: r.title,
          content: r.content,
          published_date: undefined,
          author: undefined,
        }));
      } catch (error) {
        console.warn('Hybrid search fusion failed, using raw SearXNG results:', error);
      }
    }

    // Background content indexing (fire-and-forget)
    if (this.preferences?.['zetora-content-indexing-enabled'] === true) {
      const { indexSearchResults } = await import('@/lib/vector/content-indexer');
      indexSearchResults(
        allSearxngResults.map((r) => ({ url: r.url, title: r.title, content: r.content })),
        queries[0],
        this.preferences,
      ).catch((err) => console.warn('Background content indexing failed:', err));
    }

    return { searches };
  }
}
