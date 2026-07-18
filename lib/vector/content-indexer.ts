import 'server-only';
import { embed } from 'ai';
import { getQdrantClient } from './qdrant';
import { SEARCH_INDEX_COLLECTION } from './constants';
import { getEmbeddingModel } from '@/ai/embeddings';

import { createLogger } from '@/lib/logger';

const log = createLogger('content-indexer');

const FETCH_TIMEOUT_MS = 8000;
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;
const UPSERT_BATCH_SIZE = 64;
const MAX_RESULTS_TO_INDEX = 15;
const MAX_CHUNKS_PER_RESULT = 3;

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (entity) => HTML_ENTITIES[entity])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractMainText(html: string): string {
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();
    return extractMainText(html);
  } catch {
    return null;
  }
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return text ? [text] : [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

export async function indexSearchResults(
  results: { url: string; title: string; content: string }[],
  query: string,
  preferences: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  try {
    const embeddingModel = await getEmbeddingModel(preferences);
    if (!embeddingModel) return;

    if (preferences['zetora-content-indexing-enabled'] !== true) return;

    const points: { id: string; vector: number[]; payload: Record<string, unknown> }[] = [];
    const resultsToIndex = results.slice(0, MAX_RESULTS_TO_INDEX);

    for (const result of resultsToIndex) {
      const pageText = await fetchPageContent(result.url);
      const text = pageText || result.content;
      if (!text) continue;

      const chunks = chunkText(text).slice(0, MAX_CHUNKS_PER_RESULT);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];

        try {
          const { embedding } = await embed({ model: embeddingModel, value: chunk });

          points.push({
            id: crypto.randomUUID(),
            vector: embedding,
            payload: {
              url: result.url,
              title: result.title,
              chunk_text: chunk,
              chunk_index: chunkIndex,
              source_query: query,
              indexed_at: Date.now(),
              ...(userId ? { user_id: userId } : {}),
            },
          });
        } catch (error) {
          log.warn('[CONTENT-INDEX] Failed to embed chunk:', error);
        }
      }
    }

    if (points.length === 0) return;

    const client = getQdrantClient();
    await client.createCollection(SEARCH_INDEX_COLLECTION, points[0].vector.length);

    for (let i = 0; i < points.length; i += UPSERT_BATCH_SIZE) {
      await client.upsert(SEARCH_INDEX_COLLECTION, points.slice(i, i + UPSERT_BATCH_SIZE));
    }

    log.debug(
      `[CONTENT-INDEX] Background content indexing: ${points.length} chunks indexed (from ${resultsToIndex.length} result(s))`,
    );
  } catch (error) {
    log.warn('[CONTENT-INDEX] Indexing failed:', error);
  }
}
