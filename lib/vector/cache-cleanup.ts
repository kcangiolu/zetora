import 'server-only';

const CACHE_COLLECTION = 'zetora_search_cache';

export async function cleanupExpiredCache(ttlMs: number = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - ttlMs;

  // Qdrant permet de filtrer par payload
  // Use scroll to iterate and delete
  const res = await fetch(
    `${process.env.QDRANT_URL || 'http://localhost:6333'}/collections/${CACHE_COLLECTION}/points/scroll`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'timestamp',
              range: { lt: cutoff },
            },
          ],
        },
        with_vector: false,
        with_payload: false,
        limit: 1000,
      }),
    }
  );

  const data = await res.json();
  const expiredIds = (data.result?.points || []).map((p: any) => p.id);

  if (expiredIds.length > 0) {
    await fetch(
      `${process.env.QDRANT_URL || 'http://localhost:6333'}/collections/${CACHE_COLLECTION}/points/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: expiredIds }),
      }
    );
    console.log(`Cleaned up ${expiredIds.length} expired cache entries`);
  }
}
