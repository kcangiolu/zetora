import { tool } from 'ai';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '@/lib/types';

import Firecrawl, { SearchResultWeb } from '@mendable/firecrawl-js';
import Exa from 'exa-js';

import { createLogger } from '@/lib/logger';
import { fastCrwSearch } from '@/lib/search/fastcrw-client';
import { searxngSearch } from '@/lib/search/searxng-client';
import { resolveFallbackSearchProvider, resolveSearchProvider } from '@/lib/instance/capabilities';
import { SEARCH_PROVIDER_LABELS, type SearchProviderFor } from '@/lib/search/providers';
import { describeSearchError, joinSearchErrors } from './search-errors';

const log = createLogger('academic-search');

const firecrawl = new Firecrawl({ apiKey: serverEnv.FIRECRAWL_API_KEY });
const exa = new Exa(serverEnv.EXA_API_KEY);

type AcademicResult = { url: string; title: string; summary: string };

// fastCRW's own backend isn't in this repo (external ghcr.io/us/crw image) and
// its /v1/search doesn't expose an academic/PDF category, so the only lever
// we have is enriching the query itself — the same trick already used for
// GitHub (`site:github.com`) — steering results toward known paper hosts.
const ACADEMIC_QUERY_HINT = '(site:arxiv.org OR site:ncbi.nlm.nih.gov OR site:scholar.google.com OR filetype:pdf)';

async function searchAcademicWithFastCrw(
  baseUrl: string,
  query: string,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<AcademicResult[]> {
  const hits = await fastCrwSearch(baseUrl, { query: `${query} ${ACADEMIC_QUERY_HINT}`, limit }, abortSignal);
  return hits.map((r) => ({ url: r.url, title: r.title, summary: r.content }));
}

async function searchAcademicWithSearxng(
  baseUrl: string,
  query: string,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<AcademicResult[]> {
  const hits = await searxngSearch(baseUrl, { q: query, categories: 'science' }, abortSignal);

  return hits.slice(0, limit).map((r) => ({
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

type AcademicSearchProvider = SearchProviderFor<'academic'>;

async function runAcademicProvider(
  provider: AcademicSearchProvider,
  query: string,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<AcademicResult[]> {
  if (provider === 'exa') {
    return searchAcademicWithExa(query, limit);
  }

  // Providers come from resolveSearchProvider, so their URL is configured.
  if (provider === 'searxng') return searchAcademicWithSearxng(serverEnv.SEARXNG_URL!, query, limit, abortSignal);
  if (provider === 'fastcrw') return searchAcademicWithFastCrw(serverEnv.FASTCRW_URL!, query, limit, abortSignal);

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

// Only built when this instance has an academic search provider (see
// lib/search/tool-loader.ts).
export function academicSearchTool(
  dataStream?: UIMessageStreamWriter<ChatMessage>,
  preferences?: Record<string, unknown>,
) {
  const provider = resolveSearchProvider('academic', preferences?.['zetora-academic-search-provider']);
  if (!provider) throw new Error('No academic search provider is configured on this instance');
  const fallbackProvider =
    preferences?.['zetora-academic-search-fallback-enabled'] === true
      ? resolveFallbackSearchProvider('academic', preferences?.['zetora-academic-search-fallback-provider'], provider)
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
    execute: async (
      { queries, maxResults }: { queries: string[]; maxResults?: number[] },
      { abortSignal }: { abortSignal?: AbortSignal },
    ) => {
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
            let searchError: string | undefined;
            try {
              processedResults = await runAcademicProvider(provider, query, currentMaxResults, abortSignal);
            } catch (primaryError) {
              log.error(`Academic search ${provider} error for query "${query}":`, primaryError);
              searchError = describeSearchError(SEARCH_PROVIDER_LABELS[provider], primaryError);
            }

            if (processedResults.length === 0 && fallbackProvider) {
              try {
                log.debug(`Academic search: ${provider} returned no results, falling back to ${fallbackProvider}`);
                processedResults = await runAcademicProvider(fallbackProvider, query, currentMaxResults, abortSignal);
                if (processedResults.length > 0) searchError = undefined;
              } catch (fallbackError) {
                log.error(`Academic search ${fallbackProvider} fallback error for query "${query}":`, fallbackError);
                searchError = joinSearchErrors(
                  searchError,
                  describeSearchError(SEARCH_PROVIDER_LABELS[fallbackProvider], fallbackError),
                );
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
                status: searchError ? 'error' : 'completed',
                resultsCount: resultsCount,
                imagesCount: 0,
              },
            });

            return {
              query,
              results: processedResults,
              ...(searchError && { error: searchError }),
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
              error: describeSearchError('Academic search', error),
            };
          }
        });

        const searches = await Promise.all(searchPromises);

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
