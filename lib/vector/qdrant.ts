import 'server-only';
import type { QdrantFilter } from './qdrant-filters';
import { INTERNAL_SERVICE_TIMEOUT_MS } from '@/lib/timeouts';

interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, any>;
}

// Qdrant fixes a collection's vector size when it is created: after a change of
// Search Embedding model, every write and search fails with a bare "Vector
// dimension error". Say what happened and how to rebuild the index instead.
export function describeQdrantError(action: string, collection: string, error: unknown): string {
  const text = JSON.stringify(error);
  const mismatch = /Vector dimension error: expected dim: (\d+), got (\d+)/.exec(text);
  if (mismatch) {
    return (
      `Qdrant collection ${collection} holds ${mismatch[1]}-dimension vectors but the Search Embedding model ` +
      `gives ${mismatch[2]}: it was built with another model. Delete the collection to rebuild it ` +
      `(DELETE /collections/${collection} on Qdrant).`
    );
  }
  return `Failed to ${action}: ${text}`;
}

// Only called when isHybridSearchAvailable() (lib/instance/capabilities.ts).
export function getQdrantClient() {
  if (!process.env.QDRANT_URL) throw new Error('QDRANT_URL is not set');
  const QDRANT_URL = process.env.QDRANT_URL.replace(/\/$/, '');

  return {
    async createCollection(name: string, vectorSize: number) {
      const exists = await fetch(`${QDRANT_URL}/collections/${name}`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
      });
      if (exists.ok) return;

      const res = await fetch(`${QDRANT_URL}/collections/${name}`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed to create collection: ${JSON.stringify(err)}`);
      }
    },

    async upsert(
      collectionName: string,
      points: { id: string | number; vector: number[]; payload?: Record<string, any> }[],
    ) {
      const res = await fetch(`${QDRANT_URL}/collections/${collectionName}/points?wait=true`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });

      if (!res.ok) {
        throw new Error(describeQdrantError('upsert', collectionName, await res.json()));
      }
    },

    async search(
      collectionName: string,
      vector: number[],
      limit: number = 10,
      scoreThreshold?: number,
      filter?: QdrantFilter,
    ): Promise<SearchResult[]> {
      const body: Record<string, any> = {
        vector,
        limit,
        with_payload: true,
      };

      if (scoreThreshold !== undefined) {
        body.score_threshold = scoreThreshold;
      }
      if (filter !== undefined) {
        body.filter = filter;
      }

      const res = await fetch(`${QDRANT_URL}/collections/${collectionName}/points/search`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(describeQdrantError('search', collectionName, await res.json()));
      }

      const data = await res.json();
      return (data.result || []).map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload || {},
      }));
    },

    async deleteCollection(name: string) {
      await fetch(`${QDRANT_URL}/collections/${name}`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
        method: 'DELETE',
      });
    },

    async collectionExists(name: string): Promise<boolean> {
      const res = await fetch(`${QDRANT_URL}/collections/${name}`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
      });
      return res.ok;
    },

    async count(collectionName: string): Promise<number> {
      const res = await fetch(`${QDRANT_URL}/collections/${collectionName}`, {
        signal: AbortSignal.timeout(INTERNAL_SERVICE_TIMEOUT_MS),
      });
      if (!res.ok) return 0;
      const data = await res.json();
      return data.result?.points_count ?? 0;
    },
  };
}
