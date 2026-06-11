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

    // Étape hybride : fusionner avec Qdrant si activé
    const allSearxngResults = searches.flatMap((s) => s.results);
    if (this.preferences?.['zetora-hybrid-search-enabled'] === true && allSearxngResults.length > 0) {
      try {
        const { hybridSearch } = await import('@/lib/vector/hybrid-search');
        const fusedResults = await hybridSearch(
          queries[0], // utiliser la première query comme query principale
          allSearxngResults.map((r) => ({ url: r.url, title: r.title, content: r.content })),
          this.preferences,
          allSearxngResults.length,
        );
        // Remplacer les résultats de la première search par les résultats fusionnés
        // Les résultats fusionnés sont déjà dédupliqués et rerankés
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

    // Indexation du contenu en arrière-plan (fire-and-forget)
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
