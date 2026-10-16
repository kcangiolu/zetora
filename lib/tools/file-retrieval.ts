import { rerank, type EmbeddingModel } from 'ai';
import { MetadataMode, VectorStoreIndex, type BaseRetriever } from '@vectorstores/core';
import { PDFReader } from '@vectorstores/readers/pdf';
import { CSVReader } from '@vectorstores/readers/csv';
import { DocxReader } from '@vectorstores/readers/docx';
import { TextFileReader } from '@vectorstores/readers/text';
import { vercelEmbedding } from '@vectorstores/vercel';
import { cohere } from '@ai-sdk/cohere';

import { ExcelReader } from '@/lib/tools/readers/excel-reader';
import { createLogger } from '@/lib/logger';
import { isRerankAvailable } from '@/lib/search/rerank';
import { fetchAttachment } from '@/lib/net/attachment-fetch';

// Semantic search over the files attached to a conversation, shared by the
// file query tool and deep research.

const log = createLogger('file-retrieval');

const SIMILARITY_TOP_K = 10;

const excelReader = () =>
  new ExcelReader({ sheetSpecifier: 0, concatRows: true, fieldSeparator: ',', keyValueSeparator: ':' });

const FILE_READERS = {
  'application/pdf': () => new PDFReader(),
  'text/csv': () => new CSVReader(),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': () => new DocxReader(),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': excelReader,
  'application/vnd.ms-excel': excelReader,
} as const;

type StructuredMimeType = keyof typeof FILE_READERS;

function isStructuredMimeType(mimeType: string): mimeType is StructuredMimeType {
  return mimeType in FILE_READERS;
}

// Generic text files (any extension, uploaded without a recognized document
// type), as accepted by app/api/upload's isTextLikeType.
function isTextLikeMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/octet-stream' ||
    mimeType === ''
  );
}

export function isSearchableFile(file: { contentType: string }): boolean {
  return isStructuredMimeType(file.contentType) || isTextLikeMimeType(file.contentType);
}

export interface FileContext {
  url: string;
  contentType: string;
  name?: string;
}

export interface FileQueryResult {
  fileName: string;
  fileUrl: string;
  content: string;
  score: number;
}

export type FileRetrievers = Map<string, BaseRetriever>;

export function getFileDisplayName(file: FileContext): string {
  if (file.name) return file.name;
  try {
    return new URL(file.url).pathname.split('/').pop() || 'file';
  } catch {
    return 'file';
  }
}

async function createRetriever(file: FileContext, embeddingModel: EmbeddingModel): Promise<BaseRetriever> {
  const mimeType = file.contentType;
  if (!isSearchableFile(file)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const { bytes } = await fetchAttachment(file.url);
  const reader = isStructuredMimeType(mimeType) ? FILE_READERS[mimeType]() : new TextFileReader();
  const documents = await reader.loadDataAsContent(bytes);

  const index = await VectorStoreIndex.fromDocuments(documents, {
    embedFunc: vercelEmbedding(embeddingModel),
  });
  return index.asRetriever({ similarityTopK: SIMILARITY_TOP_K });
}

/** Indexes every file; a file that fails to index is logged and left out. */
export async function buildFileRetrievers(
  files: FileContext[],
  embeddingModel: EmbeddingModel,
): Promise<FileRetrievers> {
  const settled = await Promise.allSettled(files.map((file) => createRetriever(file, embeddingModel)));

  const retrievers: FileRetrievers = new Map();
  settled.forEach((result, index) => {
    const file = files[index];
    if (result.status === 'fulfilled') {
      retrievers.set(file.url, result.value);
    } else {
      log.error(`Error indexing file ${getFileDisplayName(file)}:`, result.reason);
    }
  });
  return retrievers;
}

export async function searchFiles(params: {
  query: string;
  files: FileContext[];
  retrievers: FileRetrievers;
  maxResults: number;
  rerank: boolean;
  abortSignal?: AbortSignal;
}): Promise<FileQueryResult[]> {
  const { query, files, retrievers, maxResults, abortSignal } = params;

  const indexedFiles = files.filter((file) => retrievers.has(file.url));
  const settled = await Promise.allSettled(
    indexedFiles.map(async (file) => {
      const nodes = await retrievers.get(file.url)!.retrieve({ query });
      return nodes.map(
        (nodeWithScore): FileQueryResult => ({
          fileName: getFileDisplayName(file),
          fileUrl: file.url,
          content: nodeWithScore.node.getContent(MetadataMode.NONE),
          score: nodeWithScore.score ?? 0,
        }),
      );
    }),
  );

  const results = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    log.error(`Error searching file ${getFileDisplayName(indexedFiles[index])}:`, result.reason);
    return [];
  });

  if (params.rerank && isRerankAvailable() && results.length > 0) {
    const { ranking } = await rerank({
      model: cohere.reranking('rerank-v4.0-pro'),
      query,
      documents: results.map((r) => r.content),
      topN: maxResults,
      abortSignal,
    });
    return ranking.map((r) => ({ ...results[r.originalIndex], score: r.score }));
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}
