import { tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '@/lib/logger';
import type { SearchResult } from '@/lib/tools/self-hosted-content';

import {
  runExtremeContentExtraction,
  runExtremeSearchProvider,
  SEARCH_CATEGORIES,
  type ExtremeProviderStack,
  type ExtremeSearchOptions,
} from '../providers';
import type { AgentToolContext } from './context';

const log = createLogger('extreme-search');

export function createWebSearchTool({ emit, collectSources }: AgentToolContext, stack: ExtremeProviderStack) {
  const { searchProvider, searchFallbackProvider, contentProvider, contentFallbackProvider, metadataEnabled, clients } =
    stack;

  // Searches one query, then replaces the snippets with the pages' content when it can be read.
  async function searchQuery(
    query: string,
    queryId: string,
    options: ExtremeSearchOptions,
    onReadingContent: () => void,
  ): Promise<SearchResult[]> {
    let results = await runExtremeSearchProvider(searchProvider, clients, query, options);
    if (results.length === 0 && searchFallbackProvider) {
      log.debug(`Extreme search: ${searchProvider} returned no results, falling back to ${searchFallbackProvider}`);
      results = await runExtremeSearchProvider(searchFallbackProvider, clients, query, options);
    }
    log.info(`Found ${results.length} results for query "${query}"`);

    collectSources(...results);
    for (const { title, url, favicon } of results) emit({ kind: 'source', queryId, source: { title, url, favicon } });
    if (results.length === 0) return results;

    try {
      onReadingContent();
      const contents = await runExtremeContentExtraction(
        results.map((r) => r.url),
        contentProvider,
        contentFallbackProvider,
        metadataEnabled,
        clients,
        { abortSignal: options.abortSignal },
      );
      if (contents.length === 0) {
        log.info('getContents returned no results, using original search results');
        return results;
      }

      for (const content of contents) {
        emit({
          kind: 'content',
          queryId,
          content: {
            title: content.title || '',
            url: content.url,
            text: (content.content || '').slice(0, 500) + '...',
            favicon: content.favicon || '',
          },
        });
      }

      return contents.map((content) => {
        const original = results.find((r) => r.url === content.url);
        return {
          title: content.title || original?.title || '',
          url: content.url,
          content: content.content || original?.content || '',
          publishedDate: content.publishedDate || original?.publishedDate || '',
          favicon: content.favicon || original?.favicon || '',
        };
      });
    } catch (error) {
      log.error('Error fetching content, using the original search results:', error);
      return results;
    }
  }

  return tool({
    description: 'Search the web for information on a topic',
    inputSchema: z.object({
      queries: z.array(z.string().describe('Search queries to achieve the todo').max(150)).min(1).max(5),
      category: z.enum(SEARCH_CATEGORIES).optional().describe('The category of the search if relevant'),
      includeDomains: z.array(z.string()).optional().describe('The domains to include in the search for results'),
      startDate: z
        .string()
        .optional()
        .describe(
          'The start date for filtering search results in YYYY-MM-DD format. Results will be filtered to show only content published after this date. Default to 3 days ago if not specified.',
        ),
    }),
    execute: async ({ queries, category, includeDomains, startDate }, { toolCallId, abortSignal }) => {
      log.debug('Web search queries:', { queries, category, startDate });
      const options: ExtremeSearchOptions = { category, includeDomains, startDate, abortSignal };
      const total = queries.length;

      const searches = await Promise.all(
        queries.map(async (query, index) => {
          const queryId = `${toolCallId}-${index}`;
          emit({ kind: 'query', queryId, query, index, total, status: 'started' });
          const results = await searchQuery(query, queryId, options, () =>
            emit({ kind: 'query', queryId, query, index, total, status: 'reading_content' }),
          );
          emit({ kind: 'query', queryId, query, index, total, status: 'completed' });
          return {
            query,
            results: results.map(({ title, url, content, publishedDate, favicon }) => ({
              title,
              url,
              content,
              publishedDate,
              favicon,
            })),
          };
        }),
      );

      return { searches };
    },
  });
}
