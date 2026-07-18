import { createLogger } from '@/lib/logger';

const log = createLogger('fastcrw-search');

/** @public part of the fastCRW provider port — not yet selected by the search-provider resolution in ai/providers.ts */
export interface FastCrwSearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate: string;
  favicon: string;
}

interface FastCrwApiResponse {
  success: boolean;
  data: Array<{
    url: string;
    title: string;
    snippet: string;
    description: string;
    score: number;
    category: string;
  }>;
}

export enum SearchCategory {
  NEWS = 'news',
  COMPANY = 'company',
  RESEARCH_PAPER = 'research paper',
  GITHUB = 'github',
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

/** @public part of the fastCRW provider port — not yet selected by the search-provider resolution in ai/providers.ts */
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
      });

      if (!response.ok) {
        throw new Error(`fastCRW returned ${response.status}`);
      }

      const data = (await response.json()) as FastCrwApiResponse;

      const mappedResults = (data.data || []).map((r) => ({
        title: r.title || '',
        url: r.url,
        content: r.snippet || r.description || '',
        publishedDate: '',
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.url).hostname}&sz=128`,
      })) as FastCrwSearchResult[];

      log.debug(`[FastCRW] search returning ${mappedResults.length} results`);
      return mappedResults;
    } catch (error) {
      log.error('[FastCRW] Error in search:', error);
      return [];
    }
  }
}
