import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { xai } from '@ai-sdk/xai';
import { UIMessageStreamWriter } from 'ai';
import { ChatMessage } from '@/lib/types';

import { createLogger } from '@/lib/logger';
import { dedupeCitations, hydrateXPosts, resolveXSearchDateRange, sanitizeXHandles } from '@/lib/tools/x-citations';

// xAI's X search tool only runs on xAI's own models; the model here only
// drives the tool, so a fast non-reasoning one is enough.
export const X_SEARCH_MODEL_ID = 'grok-4-1-fast-non-reasoning';

const log = createLogger('x-search');

export function xSearchTool(dataStream?: UIMessageStreamWriter<ChatMessage>) {
  return tool({
    description:
      'Search X (formerly Twitter) posts using X API with multiple queries for the past 15 days by default otherwise user can specify a date range. If the user gives you a link to a post then put it as the first query.',
    inputSchema: z
      .object({
        queries: z
          .array(z.string())
          .describe(
            'Array of search queries for X posts. Minimum 1, recommended 3-5. If the user gives you a link to a post then put it as the first query.',
          )
          .min(1)
          .max(5),
        startDate: z
          .string()
          .optional()
          .describe(
            'The start date of the search in the format YYYY-MM-DD (always default to 15 days ago if not specified)',
          ),
        endDate: z
          .string()
          .optional()
          .describe('The end date of the search in the format YYYY-MM-DD (default to today if not specified)'),
        includeXHandles: z
          .array(z.string())
          .max(10)
          .optional()
          .describe('The X handles to include in the search (max 10). Cannot be used with excludeXHandles.'),
        excludeXHandles: z
          .array(z.string())
          .max(10)
          .optional()
          .describe('The X handles to exclude in the search (max 10). Cannot be used with includeXHandles.'),
      })
      .refine(
        (data) => {
          // Ensure includeXHandles and excludeXHandles are not both specified with non-empty arrays
          const hasInclude = data.includeXHandles && data.includeXHandles.length > 0;
          const hasExclude = data.excludeXHandles && data.excludeXHandles.length > 0;
          return !(hasInclude && hasExclude);
        },
        {
          message: 'Cannot specify both includeXHandles and excludeXHandles - use one or the other',
          path: ['includeXHandles', 'excludeXHandles'],
        },
      ),
    execute: async ({ queries, startDate, endDate, includeXHandles, excludeXHandles }) => {
      try {
        const normalizedInclude = sanitizeXHandles(includeXHandles);
        const normalizedExclude = sanitizeXHandles(excludeXHandles);
        const { start: effectiveStart, end: effectiveEnd } = resolveXSearchDateRange(startDate, endDate);

        log.debug('[X search - queries]:', queries);
        log.debug('[X search - includeHandles]:', normalizedInclude, '[excludeHandles]:', normalizedExclude);

        const searchPromises = queries.map(async (query, index) => {
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

            const xSearchToolConfig: Parameters<typeof xai.tools.xSearch>[0] = {
              fromDate: effectiveStart,
              toDate: effectiveEnd,
            };

            // Add allowedXHandles if includeXHandles is provided
            if (normalizedInclude?.length) {
              xSearchToolConfig.allowedXHandles = normalizedInclude;
            }

            // Note: excludedXHandles, postFavoritesCount, postViewCount, and maxSearchResults
            // are not directly supported in the new xai.tools.xSearch API.

            const { text, sources } = await generateText({
              model: xai.responses(X_SEARCH_MODEL_ID),
              system: `You are a helpful assistant that searches for X content with all the tools available to you. Do not use user search tool. Max limit of results is 30. You can search for the thread or the content of the post. You can also search for the content of the post using thread fetch tool. Go deep to find the latest information on the topic. NO NEED TO WRITE A SINGLE WORD AFTER RUNNING THE TOOLs AT ALL COSTS!!`,
              messages: [
                {
                  role: 'user',
                  content: query,
                },
              ],
              maxOutputTokens: 5,
              stopWhen: stepCountIs(2),
              tools: {
                x_search: xai.tools.xSearch(xSearchToolConfig),
              },
              onStepFinish: (step) => {
                log.debug(`[X search step for "${query}"]: `, step);
              },
            });

            log.debug(`[X search data for "${query}"]: `, text);

            const allSources = await hydrateXPosts(sources);
            const uniqueCitationsForReturn = dedupeCitations(sources);

            const sourcesCount = allSources.length;

            // Send completion notification
            dataStream?.write({
              type: 'data-query_completion',
              data: {
                query,
                index,
                total: queries.length,
                status: 'completed',
                resultsCount: sourcesCount,
                imagesCount: 0,
              },
            });

            return {
              content: text,
              citations: uniqueCitationsForReturn,
              sources: allSources,
              query,
              dateRange: `${effectiveStart} to ${effectiveEnd}`,
              handles: normalizedInclude || normalizedExclude || [],
            };
          } catch (error) {
            log.error(`X search error for query "${query}":`, error);

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
              content: '',
              citations: [],
              sources: [],
              query,
              dateRange: `${effectiveStart} to ${effectiveEnd}`,
              handles: normalizedInclude || normalizedExclude || [],
            };
          }
        });

        const searches = await Promise.all(searchPromises);

        // Deduplicate posts across all queries based on tweet URL
        const seenUrls = new Set<string>();
        const deduplicatedSearches = searches.map((search) => {
          const uniqueSources = search.sources.filter((source) => {
            const key = source?.link || source?.id;
            if (source && key && !seenUrls.has(key)) {
              seenUrls.add(key);
              return true;
            }
            return false;
          });

          return {
            ...search,
            sources: uniqueSources,
          };
        });

        return {
          searches: deduplicatedSearches,
          dateRange: `${effectiveStart} to ${effectiveEnd}`,
          handles: normalizedInclude || normalizedExclude || [],
        };
      } catch (error) {
        log.error('X search error:', error);
        throw error;
      }
    },
  });
}
