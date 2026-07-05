import 'server-only';

const DEFAULT_QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, any>;
}

/**
 * Resolves the Qdrant base URL to use for a given user.
 * Falls back to QDRANT_URL (or localhost) unless the user enabled
 * the Vector Database integration and configured a custom instance.
 */
export function resolveQdrantUrl(preferences: Record<string, unknown>): string {
  const enabled = preferences['zetora-qdrant-enabled'] === true;
  const customUrl = (preferences['zetora-qdrant-url'] as string | undefined)?.trim();

  return enabled && customUrl ? customUrl.replace(/\/$/, '') : DEFAULT_QDRANT_URL;
}

export function getQdrantClient(baseUrl: string = DEFAULT_QDRANT_URL) {
  const QDRANT_URL = baseUrl.replace(/\/$/, '');

  return {
    async createCollection(name: string, vectorSize: number) {
      const exists = await fetch(`${QDRANT_URL}/collections/${name}`);
      if (exists.ok) return;

      const res = await fetch(`${QDRANT_URL}/collections/${name}`, {
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed to upsert: ${JSON.stringify(err)}`);
      }
    },

    async search(
      collectionName: string,
      vector: number[],
      limit: number = 10,
      scoreThreshold?: number,
    ): Promise<SearchResult[]> {
      const body: Record<string, any> = {
        vector,
        limit,
        with_payload: true,
      };

      if (scoreThreshold !== undefined) {
        body.score_threshold = scoreThreshold;
      }

      const res = await fetch(`${QDRANT_URL}/collections/${collectionName}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed to search: ${JSON.stringify(err)}`);
      }

      const data = await res.json();
      return (data.result || []).map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload || {},
      }));
    },

    async deleteCollection(name: string) {
      await fetch(`${QDRANT_URL}/collections/${name}`, { method: 'DELETE' });
    },

    async collectionExists(name: string): Promise<boolean> {
      const res = await fetch(`${QDRANT_URL}/collections/${name}`);
      return res.ok;
    },

    async count(collectionName: string): Promise<number> {
      const res = await fetch(`${QDRANT_URL}/collections/${collectionName}`);
      if (!res.ok) return 0;
      const data = await res.json();
      return data.result?.points_count ?? 0;
    },
  };
}
