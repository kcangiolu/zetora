import { tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '@/lib/logger';
import {
  getFileDisplayName,
  searchFiles,
  type FileContext,
  type FileQueryResult,
  type FileRetrievers,
} from '@/lib/tools/file-retrieval';

import type { AgentToolContext } from './context';

const log = createLogger('extreme-search');

export function createFileQueryTool(
  { emit, collectSources }: AgentToolContext,
  { files, retrievers }: { files: FileContext[]; retrievers: FileRetrievers },
) {
  const fileNames = files.map(getFileDisplayName);

  return tool({
    description: `Search through uploaded files (${fileNames.join(', ')}) to find relevant information using semantic search.`,
    inputSchema: z.object({
      queries: z
        .array(z.string())
        .min(1)
        .max(3)
        .describe('Array of search queries (1-3) to find information in the uploaded files'),
    }),
    execute: async ({ queries }, { toolCallId, abortSignal }) => {
      log.debug('File query search:', queries);

      const total = queries.length;
      const searches = await Promise.all(
        queries.map(async (query, index): Promise<{ query: string; results: FileQueryResult[] }> => {
          const fileQueryId = `${toolCallId}-${index}`;
          emit({ kind: 'file_query', fileQueryId, query, index, total, status: 'started' });

          try {
            const results = await searchFiles({ query, files, retrievers, maxResults: 5, rerank: false, abortSignal });
            emit({ kind: 'file_query', fileQueryId, query, index, total, status: 'completed', results });
            return { query, results };
          } catch (error) {
            log.error(`File query error for "${query}":`, error);
            emit({ kind: 'file_query', fileQueryId, query, index, total, status: 'error', results: [] });
            return { query, results: [] };
          }
        }),
      );

      collectSources(
        ...searches.flatMap(({ results }) =>
          results.map((result) => ({
            title: result.fileName,
            url: result.fileUrl,
            content: result.content,
            publishedDate: '',
            favicon: '',
          })),
        ),
      );

      return { success: true, searches, filesSearched: fileNames };
    },
  });
}
