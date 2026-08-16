import { tool } from 'ai';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '@/lib/types';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';

import Firecrawl, { SearchResultWeb } from '@mendable/firecrawl-js';

import { createLogger } from '@/lib/logger';
import { FASTCRW_SEARCH_TIMEOUT_MS } from '@/lib/timeouts';

const log = createLogger('academic-search');

const firecrawl = new Firecrawl({ apiKey: serverEnv.FIRECRAWL_API_KEY });

interface FastCrwSearchApiResponse {
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

type AcademicResult = { url: string; title: string; summary: string };

async function searchAcademicWithFastCrw(baseUrl: string, query: string, limit: number): Promise<AcademicResult[]> {
  const response = await fetch(`${baseUrl}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(FASTCRW_SEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`fastCRW returned ${response.status}`);
  }

  const data: FastCrwSearchApiResponse = await response.json();

  return (data.data || []).map((r) => ({
    url: r.url,
    title: r.title || '',
    summary: r.snippet || r.description || '',
  }));
}

export function academicSearchTool(dataStream?: UIMessageStreamWriter<ChatMessage>) {
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
              const firecrawlResults = await firecrawl.search(query, {
                categories: ['research', 'pdf'],
                limit: currentMaxResults,
                scrapeOptions: {
                  storeInCache: true,
                },
              });

              if (firecrawlResults.web && Array.isArray(firecrawlResults.web)) {
                processedResults = firecrawlResults.web.map((result) => ({
                  url: (result as SearchResultWeb).url || '',
                  title: (result as SearchResultWeb).title || '',
                  summary: (result as SearchResultWeb).description || '',
                }));
              }
            } catch (firecrawlError) {
              log.error(`Academic search Firecrawl error for query "${query}":`, firecrawlError);
            }

            if (processedResults.length === 0 && serverEnv.FASTCRW_URL) {
              try {
                processedResults = await searchAcademicWithFastCrw(serverEnv.FASTCRW_URL, query, currentMaxResults);
              } catch (fastcrwError) {
                log.error(`Academic search fastCRW fallback error for query "${query}":`, fastcrwError);
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
