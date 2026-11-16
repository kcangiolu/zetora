import { tool, UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { ChatMessage } from '@/lib/types';
import { getFileEmbeddingModel, getRerankModel } from '@/lib/egress/models';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { deanonymizeText, type AnonymizeContext } from '@/lib/anonymizer/pseudonymize';

import { createLogger } from '@/lib/logger';
import {
  buildFileRetrievers,
  getFileDisplayName,
  isSearchableFile,
  searchFiles,
  type FileContext,
  type FileQueryResult,
} from '@/lib/tools/file-retrieval';

const log = createLogger('file-query-search');

interface QuerySearchResult {
  query: string;
  results: FileQueryResult[];
}

export function createFileQuerySearchTool(
  files: FileContext[],
  dataStream?: UIMessageStreamWriter<ChatMessage>,
  userPreferences?: UserPreferenceValues,
  userId?: string,
  anonymizeContext?: AnonymizeContext | null,
) {
  // Filter to only supported files
  const supportedFiles = files.filter(isSearchableFile);

  if (supportedFiles.length === 0) {
    // Return a dummy tool that explains no files are available
    return tool({
      description: 'Query uploaded files to find relevant information. No supported files are currently available.',
      inputSchema: z.object({
        queries: z.array(z.string()).describe('Array of search queries to find information in the uploaded files'),
      }),
      execute: async () => {
        return {
          success: false,
          error: 'No supported files available. Supported file types: PDF, CSV, DOCX, XLSX and text files',
          searches: [],
          filesSearched: [],
        };
      },
    });
  }

  return tool({
    description: `Query uploaded files to find relevant information. Use this tool to search through the content of uploaded documents (${supportedFiles.map(getFileDisplayName).join(', ')}). Supports multiple queries for comprehensive search. This tool uses semantic search to find the most relevant content based on your queries.`,
    inputSchema: z.object({
      queries: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe(
          'Array of search queries (1-5) to find information in the uploaded files. Use multiple queries to search for different aspects or topics.',
        ),
      maxResults: z.number().min(1).max(20).optional().default(10).describe('Maximum results per query (default: 10)'),
      rerank: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to rerank results for improved relevance (adds ~100-300ms latency)'),
    }),
    execute: async ({ queries, maxResults = 10, rerank: shouldRerank = false }, { abortSignal }) => {
      try {
        log.debug('🔍 [FileQuerySearch] Reranking:', shouldRerank);
        // Index first (independent step), then search and return results.
        const embeddingModel = await getFileEmbeddingModel(userPreferences, userId);
        const retrievers = await buildFileRetrievers(supportedFiles, embeddingModel);
        const rerankModel = shouldRerank
          ? getRerankModel({ userContent: { preferences: userPreferences, userId } })
          : null;

        // With anonymization on, the model writes its queries in pseudonyms
        // while the files hold real names. Embedding and reranking are then
        // local (getFileEmbeddingModel and getRerankModel see to it), so the
        // queries can go back to cleartext and still match.
        const searchQueries = anonymizeContext
          ? await Promise.all(queries.map((query) => deanonymizeText(query, anonymizeContext)))
          : queries;

        const searchPromises = searchQueries.map(async (query, index) => {
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

            const results = await searchFiles({
              query,
              files: supportedFiles,
              retrievers,
              maxResults,
              rerankModel,
              abortSignal,
            });

            // Send completion notification
            dataStream?.write({
              type: 'data-query_completion',
              data: {
                query,
                index,
                total: queries.length,
                status: 'completed',
                resultsCount: results.length,
                imagesCount: 0,
              },
            });

            return { query, results } satisfies QuerySearchResult;
          } catch (error) {
            log.error(`File query search error for query "${query}":`, error);

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

            return { query, results: [] } satisfies QuerySearchResult;
          }
        });

        const searches = await Promise.all(searchPromises);

        // Calculate total results
        const totalResults = searches.reduce((sum, s) => sum + s.results.length, 0);

        return {
          success: true,
          searches,
          totalResults,
          filesSearched: supportedFiles.map(getFileDisplayName),
          reranked: rerankModel !== null,
        };
      } catch (error) {
        log.error('File query search error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          searches: [],
          filesSearched: [],
        };
      }
    },
  });
}
