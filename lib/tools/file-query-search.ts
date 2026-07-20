import { rerank, tool, EmbeddingModel, UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { VectorStoreIndex, BaseRetriever } from '@vectorstores/core';
import { PDFReader } from '@vectorstores/readers/pdf';
import { CSVReader } from '@vectorstores/readers/csv';
import { DocxReader } from '@vectorstores/readers/docx';
import { TextFileReader } from '@vectorstores/readers/text';
import { ExcelReader } from '@/lib/tools/readers/excel-reader';
import { vercelEmbedding } from '@vectorstores/vercel';
import { cohere } from '@ai-sdk/cohere';
import { all, allSettled } from 'better-all';
import { ChatMessage } from '@/lib/types';
import { getBetterAllOptions } from '@/lib/better-all';
import { getFileEmbeddingModel } from '@/ai/embeddings';

import { createLogger } from '@/lib/logger';

const log = createLogger('file-query-search');

const FILE_READERS = {
  'application/pdf': () => new PDFReader(),
  'text/csv': () => new CSVReader(),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': () => new DocxReader(),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': () =>
    new ExcelReader({
      sheetSpecifier: 0,
      concatRows: true,
      fieldSeparator: ',',
      keyValueSeparator: ':',
    }),
  'application/vnd.ms-excel': () =>
    new ExcelReader({
      sheetSpecifier: 0,
      concatRows: true,
      fieldSeparator: ',',
      keyValueSeparator: ':',
    }),
} as const;

type SupportedMimeType = keyof typeof FILE_READERS;

function isKnownStructuredMimeType(mimeType: string): mimeType is SupportedMimeType {
  return mimeType in FILE_READERS;
}

// Generic text files (any extension, uploaded without a recognized document
// type) — covered by app/api/upload's isTextLikeType. Any of these decode
// with the plain TextFileReader rather than a format-specific one.
function isTextLikeMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/octet-stream' ||
    mimeType === ''
  );
}

function isSupportedMimeType(mimeType: string): boolean {
  return isKnownStructuredMimeType(mimeType) || isTextLikeMimeType(mimeType);
}

interface FileContext {
  url: string;
  contentType: string;
  name?: string;
}

interface FileQueryResult {
  fileName: string;
  content: string;
  score: number;
}

interface QuerySearchResult {
  query: string;
  results: FileQueryResult[];
}

async function createRetriever(file: FileContext, embeddingModel: EmbeddingModel): Promise<BaseRetriever> {
  const mimeType = file.contentType;

  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}. Supported types: ${Object.keys(FILE_READERS).join(', ')}`);
  }

  // Fetch the file content
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

  const content = new Uint8Array(await response.arrayBuffer());
  const reader = isKnownStructuredMimeType(mimeType) ? FILE_READERS[mimeType]() : new TextFileReader();
  const documents = await reader.loadDataAsContent(content);

  // Create vector store index
  const index = await VectorStoreIndex.fromDocuments(documents, {
    embedFunc: vercelEmbedding(embeddingModel),
  });

  // Create retriever with higher similarity top K for more results
  return index.asRetriever({ similarityTopK: 10 });
}

async function buildRetrieversByUrl(files: FileContext[], embeddingModel: EmbeddingModel) {
  const tasks = files.reduce(
    (acc, file, index) => {
      const fileKey = `${index}:${file.name || new URL(file.url).pathname.split('/').pop() || 'unknown'}`;
      acc[fileKey] = async function () {
        const retriever = await createRetriever(file, embeddingModel);
        return [file.url, retriever] as const;
      };
      return acc;
    },
    {} as Record<string, () => Promise<readonly [string, BaseRetriever]>>,
  );

  const settled = await allSettled(tasks, getBetterAllOptions());
  const retrieversByUrl = new Map<string, BaseRetriever>();

  for (const [fileKey, result] of Object.entries(settled)) {
    if (result.status === 'fulfilled') {
      const [url, retriever] = result.value;
      retrieversByUrl.set(url, retriever);
      continue;
    }
    log.error(`Error indexing file ${fileKey}:`, result.reason);
  }

  return retrieversByUrl;
}

async function searchFiles(
  query: string,
  supportedFiles: FileContext[],
  retrieversByUrl: Map<string, BaseRetriever>,
  maxResults: number = 5,
  shouldRerank: boolean = false,
): Promise<FileQueryResult[]> {
  const fileTasks = supportedFiles.reduce(
    (tasks, file, index) => {
      const retriever = retrieversByUrl.get(file.url);
      if (!retriever) return tasks;

      const fileKey = `${index}:${file.name || new URL(file.url).pathname.split('/').pop() || 'unknown'}`;
      tasks[fileKey] = async function () {
        const nodes = await retriever.retrieve({ query });

        return nodes.map((nodeWithScore) => {
          const node = nodeWithScore.node as any;
          return {
            fileName: file.name || new URL(file.url).pathname.split('/').pop() || 'unknown',
            content: node.text || node.getContent?.() || '',
            score: nodeWithScore.score || 0,
          };
        });
      };

      return tasks;
    },
    {} as Record<string, () => Promise<FileQueryResult[]>>,
  );

  const settledResultsByFile = await allSettled(fileTasks, getBetterAllOptions());
  const allResults = Object.entries(settledResultsByFile).flatMap(([fileKey, settled]) => {
    if (settled.status === 'fulfilled') return settled.value;
    log.error(`Error searching file ${fileKey}:`, settled.reason);
    return [];
  });

  // Rerank if enabled and we have results
  if (shouldRerank && allResults.length > 0) {
    const { ranking } = await rerank({
      model: cohere.reranking('rerank-v4.0-pro'),
      query,
      documents: allResults.map((r) => r.content),
      topN: maxResults,
    });

    return ranking.map((r) => ({
      ...allResults[r.originalIndex],
      score: r.score,
    }));
  }

  // Sort by score and take top results
  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, maxResults);
}

export function createFileQuerySearchTool(
  files: FileContext[],
  dataStream?: UIMessageStreamWriter<ChatMessage>,
  userPreferences?: Record<string, unknown>,
) {
  // Filter to only supported files
  const supportedFiles = files.filter((f) => isSupportedMimeType(f.contentType));

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
          error: 'No supported files available. Supported file types: PDF, CSV, DOCX, XLSX',
          searches: [],
          filesSearched: [],
        };
      },
    });
  }

  return tool({
    description: `Query uploaded files to find relevant information. Use this tool to search through the content of uploaded documents (${supportedFiles.map((f) => f.name || 'file').join(', ')}). Supports multiple queries for comprehensive search. This tool uses semantic search to find the most relevant content based on your queries.`,
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
        .describe(
          'Whether to rerank results using Cohere rerank-v3.5 for improved relevance (adds ~100-300ms latency)',
        ),
    }),
    execute: async ({ queries, maxResults = 10, rerank: shouldRerank = false }) => {
      try {
        log.debug('🔍 [FileQuerySearch] Reranking:', shouldRerank);
        // Index first (independent step), then search and return results.
        const embeddingModel = await getFileEmbeddingModel(userPreferences);
        const retrieversByUrl = await buildRetrieversByUrl(supportedFiles, embeddingModel);

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

            const results = await searchFiles(query, supportedFiles, retrieversByUrl, maxResults, shouldRerank);

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

        const searchMap = await all(
          Object.fromEntries(searchPromises.map((promise, index) => [`q:${index}`, async () => promise])),
          getBetterAllOptions(),
        );
        const searches = queries.map((_, index) => searchMap[`q:${index}`]);

        // Calculate total results
        const totalResults = searches.reduce((sum, s) => sum + s.results.length, 0);

        return {
          success: true,
          searches,
          totalResults,
          filesSearched: supportedFiles.map((f) => f.name || 'file'),
          reranked: shouldRerank,
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
