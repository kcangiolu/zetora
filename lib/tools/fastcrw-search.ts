import { createLogger } from '@/lib/logger';
import { FASTCRW_SEARCH_TIMEOUT_MS } from '@/lib/timeouts';
import { getFaviconUrl } from '@/lib/url';

const log = createLogger('fastcrw-search');

/** @public */
export interface FastCrwSearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate: string;
  favicon: string;
}

interface FastCrwApiResponse {
  success: boolean;
  // fastCRW's `data` is `{ results: [...] }`, not the array itself, despite the
  // Firecrawl-compatible framing.
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

export enum SearchCategory {
  NEWS = 'news',
  COMPANY = 'company',
  RESEARCH_PAPER = 'research paper',
  FINANCIAL_REPORT = 'financial report',
}

export interface SearchProviderStrategy {
  search(
    query: string,
    category?: SearchCategory,
    include_domains?: string[],
    startDate?: string,
  ): Promise<FastCrwSearchResult[]>;
}

export class FastCrwSearchStrategy implements SearchProviderStrategy {
  constructor(private baseUrl: string) {}

  async search(
    query: string,
    category?: SearchCategory,
    include_domains?: string[],
    _startDate?: string,
  ): Promise<FastCrwSearchResult[]> {
    log.debug(`[FastCRW] search called with query: "${query}", category: ${category}`);

    try {
      const siteFilter = include_domains?.length
        ? ' ' + include_domains.map((domain) => `site:${domain}`).join(' OR ')
        : '';

      const body: Record<string, unknown> = {
        query: `${query}${siteFilter}`,
        limit: 8,
      };

      if (category === SearchCategory.NEWS) {
        body.category = 'news';
      }

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

      const mappedResults = (data.data?.results || []).map((r) => ({
        title: r.title || '',
        url: r.url,
        content: r.snippet || r.description || '',
        publishedDate: '',
        favicon: getFaviconUrl(r.url),
      })) as FastCrwSearchResult[];

      log.debug(`[FastCRW] search returning ${mappedResults.length} results`);
      return mappedResults;
    } catch (error) {
      log.error('[FastCRW] Error in search:', error);
      return [];
    }
  }
}
