import { tool } from 'ai';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '@/lib/types';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

import Firecrawl, { SearchResultWeb } from '@mendable/firecrawl-js';
import Exa from 'exa-js';

import { createLogger } from '@/lib/logger';
import { FASTCRW_SEARCH_TIMEOUT_MS, SEARXNG_TIMEOUT_MS } from '@/lib/timeouts';

const log = createLogger('academic-search');

const firecrawl = new Firecrawl({ apiKey: serverEnv.FIRECRAWL_API_KEY });
const exa = new Exa(serverEnv.EXA_API_KEY);

interface FastCrwSearchApiResponse {
  success: boolean;
  // Verified live: fastCRW's top-level `data` field is `{ results: [...] }`,
  // not the array itself, despite the Firecrawl-compatible framing.
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

type AcademicResult = { url: string; title: string; summary: string };

// fastCRW's own backend isn't in this repo (external ghcr.io/us/crw image) and
// its /v1/search doesn't expose an academic/PDF category, so the only lever
// we have is enriching the query itself — the same trick already used for
// GitHub (`site:github.com`) — steering results toward known paper hosts.
const ACADEMIC_QUERY_HINT = '(site:arxiv.org OR site:ncbi.nlm.nih.gov OR site:scholar.google.com OR filetype:pdf)';

async function searchAcademicWithFastCrw(baseUrl: string, query: string, limit: number): Promise<AcademicResult[]> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `${query} ${ACADEMIC_QUERY_HINT}`, limit }),
    signal: AbortSignal.timeout(FASTCRW_SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`fastCRW returned ${response.status}`);
  }

  const data: FastCrwSearchApiResponse = await response.json();

  return (data.data?.results || []).map((r) => ({
    url: r.url,
    title: r.title || '',
    summary: r.snippet || r.description || '',
  }));
}

async function searchAcademicWithSearxng(baseUrl: string, query: string, limit: number): Promise<AcademicResult[]> {
  const params = new URLSearchParams({
    q: query,
    categories: 'science',
    format: 'json',
    safesearch: '1',
  });

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/search?${params.toString()}`, {
    signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`SearXNG returned ${response.status}`);
  }

  const data: { results?: Array<{ url: string; title: string; content: string }> } = await response.json();

  return (data.results || []).slice(0, limit).map((r) => ({
    url: r.url,
    title: r.title || '',
    summary: r.content || '',
  }));
}

async function searchAcademicWithExa(query: string, limit: number): Promise<AcademicResult[]> {
  const { results } = await exa.search(query, {
    numResults: limit,
    type: 'auto',
    category: 'research paper',
  });

  return results.map((r) => ({
    url: r.url,
    title: r.title || '',
    summary: '',
  }));
}

type AcademicSearchProvider = 'exa' | 'firecrawl' | 'searxng' | 'fastcrw';

function normalizeAcademicProvider(value: unknown): AcademicSearchProvider {
  if (value === 'exa' || value === 'firecrawl' || value === 'searxng' || value === 'fastcrw') return value;
  return 'firecrawl';
}

async function runAcademicProvider(
  provider: AcademicSearchProvider,
  query: string,
  limit: number,
): Promise<AcademicResult[]> {
  if (provider === 'exa') {
    return searchAcademicWithExa(query, limit);
  }

  if (provider === 'searxng') {
    if (!serverEnv.SEARXNG_URL) {
      log.warn('SearXNG provider selected for academic search but SEARXNG_URL is not configured');
      return [];
    }
    return searchAcademicWithSearxng(serverEnv.SEARXNG_URL, query, limit);
  }

  if (provider === 'fastcrw') {
    if (!serverEnv.FASTCRW_URL) {
      log.warn('fastCRW provider selected for academic search but FASTCRW_URL is not configured');
      return [];
    }
    return searchAcademicWithFastCrw(serverEnv.FASTCRW_URL, query, limit);
  }

  const firecrawlResults = await firecrawl.search(query, {
    categories: ['research', 'pdf'],
    limit,
    scrapeOptions: {
      storeInCache: true,
    },
  });

  if (!firecrawlResults.web || !Array.isArray(firecrawlResults.web)) return [];

  return firecrawlResults.web.map((result) => ({
    url: (result as SearchResultWeb).url || '',
    title: (result as SearchResultWeb).title || '',
    summary: (result as SearchResultWeb).description || '',
  }));
}

export function academicSearchTool(
  dataStream?: UIMessageStreamWriter<ChatMessage>,
  preferences?: Record<string, unknown>,
) {
  const provider = normalizeAcademicProvider(preferences?.['zetora-academic-search-provider']);
  const fallbackEnabled = preferences?.['zetora-academic-search-fallback-enabled'] !== false;
  const fallbackProvider = fallbackEnabled
    ? normalizeAcademicProvider(preferences?.['zetora-academic-search-fallback-provider'] ?? 'fastcrw')
    : null;

  return tool({
    description: 'Search academic papers and research with multiple queries.',
    inputSchema: z.object({
      queries: z
        .array(z.string())
        .describe('Array of search queries for academic papers. Minimum 1, recommended 3-5.')
        .min(1)
        .max(5),
      maxResults: z
        .array(z.number())
        .optional()
        .describe('Array of maximum results per query. Default is 20 per query.'),
    }),
    execute: async ({ queries, maxResults }: { queries: string[]; maxResults?: number[] }) => {
      try {
        log.debug('Academic search queries:', queries);
        log.debug('Max results:', maxResults);

        const searchPromises = queries.map(async (query, index) => {
          const currentMaxResults = maxResults?.[index] || maxResults?.[0] || 20;

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

            let processedResults: AcademicResult[] = [];
            try {
              processedResults = await runAcademicProvider(provider, query, currentMaxResults);
            } catch (primaryError) {
              log.error(`Academic search ${provider} error for query "${query}":`, primaryError);
            }

            if (processedResults.length === 0 && fallbackProvider && fallbackProvider !== provider) {
              try {
                log.debug(`Academic search: ${provider} returned no results, falling back to ${fallbackProvider}`);
                processedResults = await runAcademicProvider(fallbackProvider, query, currentMaxResults);
              } catch (fallbackError) {
                log.error(`Academic search ${fallbackProvider} fallback error for query "${query}":`, fallbackError);
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
            log.error(`Academic search error for query "${query}":`, error);

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

        const searchMap = await all(
          Object.fromEntries(searchPromises.map((promise, index) => [`q:${index}`, async () => promise])),
          getBetterAllOptions(),
        );
        const searches = queries.map((_, index) => searchMap[`q:${index}`]);

        return {
          searches,
        };
      } catch (error) {
        log.error('Academic search error:', error);
        throw error;
      }
    },
  });
}
