import 'server-only';
import { embed } from 'ai';
import { qdrant } from './qdrant';
import { getEmbeddingModel } from '@/ai/embeddings';

const CACHE_COLLECTION = 'zetora_search_cache';
const SIMILARITY_THRESHOLD = 0.92;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

interface CacheEntry {
  query: string;
  response: string;
  sources: string[];
  timestamp: number;
}

export async function initSearchCache(vectorSize: number = 768) {
  await qdrant.createCollection(CACHE_COLLECTION, vectorSize);
}

export async function lookupCache(
  query: string,
  preferences: Record<string, string>
): Promise<CacheEntry | null> {
  const embeddingModel = getEmbeddingModel(preferences);
  if (!embeddingModel) return null;

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    const results = await qdrant.search(
      CACHE_COLLECTION,
      embedding,
      1,
      SIMILARITY_THRESHOLD
    );

    if (results.length === 0) return null;

    const entry = results[0].payload as CacheEntry;

    // Vérifier l'âge du cache
    if (Date.now() - entry.timestamp > MAX_CACHE_AGE_MS) {
      return null;
    }

    return entry;
  } catch (error) {
    console.warn('Cache lookup failed:', error);
    return null;
  }
}

export async function storeInCache(
  query: string,
  response: string,
  sources: string[],
  preferences: Record<string, string>
) {
  const embeddingModel = getEmbeddingModel(preferences);
  if (!embeddingModel) return;

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    await qdrant.upsert(CACHE_COLLECTION, [
      {
        id: crypto.randomUUID(),
        vector: embedding,
        payload: {
          query,
          response,
          sources,
          timestamp: Date.now(),
        },
      },
    ]);
  } catch (error) {
    console.warn('Cache store failed:', error);
  }
}

export async function getCacheStats(): Promise<{
  exists: boolean;
  count: number;
}> {
  const exists = await qdrant.collectionExists(CACHE_COLLECTION);
  const count = exists ? await qdrant.count(CACHE_COLLECTION) : 0;
  return { exists, count };
}
