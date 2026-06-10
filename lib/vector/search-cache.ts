import 'server-only';
import { embed } from 'ai';
import { getQdrantClient, resolveQdrantUrl } from './qdrant';
import { getEmbeddingModel } from '@/ai/embeddings';

const CACHE_COLLECTION = 'zetora_search_cache';
const SIMILARITY_THRESHOLD = 0.95;
const DEFAULT_CACHE_TTL_DAYS = 7;

function hasSameEntities(cachedQuery: string, newQuery: string): boolean {
  const STOP_WORDS = new Set(['quelle', 'quels', 'quelles', 'quel', 'est', 'sont', 'que', 'pour', 'avec', 'dans', 'sur', 'sous', 'plus', 'moins', 'très', 'fait', 'peut', 'être', 'avoir', 'faire', 'leur', 'leurs', 'cette', 'celles', 'ceux']);
  const extractKeywords = (q: string) =>
    q.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));

  const cached = new Set(extractKeywords(cachedQuery));
  const incoming = extractKeywords(newQuery);

  if (incoming.length === 0) return true;
  const matches = incoming.filter(w => cached.has(w)).length;
  return matches / incoming.length >= 0.8;
}

interface CacheEntry {
  query: string;
  response: string;
  sources: string[];
  timestamp: number;
}

function isCacheEnabled(preferences: Record<string, unknown>): boolean {
  return preferences['zetora-qdrant-enabled'] === true && preferences['zetora-search-cache-enabled'] === true;
}

function getCacheTtlMs(preferences: Record<string, unknown>): number {
  const ttlDays = Number(preferences['zetora-search-cache-ttl-days']) || DEFAULT_CACHE_TTL_DAYS;
  return ttlDays * 24 * 60 * 60 * 1000;
}

export async function lookupCache(
  query: string,
  preferences: Record<string, unknown>
): Promise<CacheEntry | null> {
  if (!isCacheEnabled(preferences)) return null;

  const embeddingModel = await getEmbeddingModel(preferences);
  if (!embeddingModel) return null;

  const client = getQdrantClient(resolveQdrantUrl(preferences));

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    const results = await client.search(
      CACHE_COLLECTION,
      embedding,
      1,
      SIMILARITY_THRESHOLD
    );

    if (results.length === 0) {
      console.log('[CACHE] Miss: similarity too low');
      return null;
    }

    const entry = results[0].payload as CacheEntry;

    if (!hasSameEntities(entry.query, query)) {
      console.log('[CACHE] Miss: entity mismatch');
      return null;
    }

    // Vérifier l'âge du cache
    if (Date.now() - entry.timestamp > getCacheTtlMs(preferences)) {
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
  preferences: Record<string, unknown>
) {
  if (!isCacheEnabled(preferences)) return;

  const embeddingModel = await getEmbeddingModel(preferences);
  if (!embeddingModel) return;

  const client = getQdrantClient(resolveQdrantUrl(preferences));

  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    await client.createCollection(CACHE_COLLECTION, embedding.length);

    await client.upsert(CACHE_COLLECTION, [
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

export async function getCacheStats(preferences: Record<string, unknown> = {}): Promise<{
  exists: boolean;
  count: number;
}> {
  const client = getQdrantClient(resolveQdrantUrl(preferences));
  const exists = await client.collectionExists(CACHE_COLLECTION);
  const count = exists ? await client.count(CACHE_COLLECTION) : 0;
  return { exists, count };
}
