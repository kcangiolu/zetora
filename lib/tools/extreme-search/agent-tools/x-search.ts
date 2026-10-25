import { xai } from '@ai-sdk/xai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '@/lib/logger';
import { describeSearchError } from '@/lib/tools/search-errors';
import { hydrateXPosts, resolveXSearchDateRange, sanitizeXHandles } from '@/lib/tools/x-citations';
import { X_SEARCH_MODEL_ID } from '@/lib/tools/x-search';
import { getFaviconUrl } from '@/lib/url';

import type { AgentToolContext } from './context';

const log = createLogger('extreme-search');

export function createXSearchTool({ emit, collectSources }: AgentToolContext) {
  return tool({
    description:
      'Search X (formerly Twitter) posts using X API for the past 15 days by default otherwise user can specify a date range.',
    inputSchema: z.object({
      queries: z
        .array(
          z
            .string()
            .describe(
              'Search queries for X posts. If the user gives you a link to a post then use that link directly.',
            ),
        )
        .min(1)
        .max(5),
      startDate: z
        .string()
        .describe(
          'The start date of the search in the format YYYY-MM-DD (always default to 15 days ago if not specified)',
        )
        .optional(),
      endDate: z
        .string()
        .describe('The end date of the search in the format YYYY-MM-DD (default to today if not specified)')
        .optional(),
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
    }),
    execute: async ({ queries, startDate, endDate, includeXHandles, excludeXHandles }, { toolCallId, abortSignal }) => {
      log.debug('X search queries:', { queries, startDate, endDate, includeXHandles, excludeXHandles });

      const normalizedInclude = sanitizeXHandles(includeXHandles);
      const normalizedExclude = sanitizeXHandles(excludeXHandles);
      const { start, end } = resolveXSearchDateRange(startDate, endDate);
      const handles = normalizedInclude || normalizedExclude || [];
      const dateRange = `${start} to ${end}`;
      const total = queries.length;

      const searches = await Promise.all(
        queries.map(async (query, index) => {
          const event = {
            kind: 'x_search' as const,
            xSearchId: `${toolCallId}-${index}`,
            query,
            index,
            total,
            startDate: start,
            endDate: end,
            handles,
          };
          emit({ ...event, status: 'started' });

          try {
            const xSearchToolConfig: Parameters<typeof xai.tools.xSearch>[0] = { fromDate: start, toDate: end };
            if (normalizedInclude?.length) xSearchToolConfig.allowedXHandles = normalizedInclude;

            const { text, sources } = await generateText({
              model: xai.responses(X_SEARCH_MODEL_ID),
              abortSignal,
              system: `You are a helpful assistant that searches for X content with all the tools available to you. Do not use user search tool. Max limit of results is 30. You can search for the thread or the content of the post. You can also search for the content of the post using thread fetch tool. NO NEED TO WRITE A SINGLE WORD AFTER RUNNING THE TOOLs AT ALL COSTS!!`,
              messages: [{ role: 'user', content: query }],
              maxOutputTokens: 1,
              stopWhen: stepCountIs(1),
              tools: { x_search: xai.tools.xSearch(xSearchToolConfig) },
              onStepFinish: (step) => {
                log.debug(`[X search step for "${query}"]:`, step);
              },
            });
            log.debug(`[X search data for "${query}"]:`, text);

            const xSources = await hydrateXPosts(sources);
            collectSources(
              ...xSources.map((source) => ({
                title: source.title,
                url: source.link,
                content: source.text,
                publishedDate: source.publishedDate,
                favicon: getFaviconUrl(source.link),
              })),
            );

            const result = {
              content: text,
              citations: xSources.map((source) => ({
                url: source.link,
                title: source.title,
                description: source.text,
                tweet_id: source.id,
                author: source.author,
                created_at: source.publishedDate,
              })),
              sources: xSources,
              dateRange,
              handles,
            };

            emit({ ...event, status: 'completed', result });
            log.info(`[X search via xAI] Found ${xSources.length} results for query "${query}"`);
            return { query, result };
          } catch (error) {
            log.error('X search error:', error);
            const message = describeSearchError('xAI', error);
            emit({ ...event, status: 'error', error: message });
            return { query, result: { content: '', citations: [], sources: [], dateRange, handles }, error: message };
          }
        }),
      );

      return { searches, dateRange, handles };
    },
  });
}
