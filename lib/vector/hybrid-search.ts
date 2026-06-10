import 'server-only';
import { embed } from 'ai';
import { getQdrantClient, resolveQdrantUrl } from './qdrant';
import { getEmbeddingModel } from '@/ai/embeddings';

interface HybridResult {
  url: string;
  title: string;
  content: string;
  score: number;
  source: 'searxng' | 'qdrant';
}

/**
 * Reciprocal Rank Fusion
 * score(d) = Σ 1 / (k + rank_i(d))
 * où k est une constante (généralement 60)
 */
function rrf(
  resultsArrays: { url: string; rank: number }[][],
  k: number = 60
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const results of resultsArrays) {
    for (const { url, rank } of results) {
      const current = scores.get(url) || 0;
      scores.set(url, current + 1 / (k + rank));
    }
  }

  return scores;
}

export async function hybridSearch(
  query: string,
  searxngResults: { url: string; title: string; content: string }[],
  preferences: Record<string, unknown>,
  topK: number = 10
): Promise<HybridResult[]> {
  const embeddingModel = await getEmbeddingModel(preferences);

  // Si pas d'embedding model, retourne juste SearXNG
  if (!embeddingModel) {
    return searxngResults.map((r, i) => ({
      ...r,
      score: 1 - i / searxngResults.length,
      source: 'searxng' as const,
    }));
  }

  try {
    // 1. Générer l'embedding de la requête
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    // 2. Chercher dans Qdrant (parmi les résultats précédemment indexés)
    const client = getQdrantClient(resolveQdrantUrl(preferences));
    const qdrantResults = await client.search(
      'zetora_search_cache',
      embedding,
      topK
    );

    // 3. Préparer les rangs pour RRF
    const searxngRanks = searxngResults.map((r, i) => ({
      url: r.url,
      rank: i + 1,
    }));

    const qdrantRanks = qdrantResults
      .filter((r) => r.payload?.url)
      .map((r, i) => ({
        url: r.payload.url as string,
        rank: i + 1,
      }));

    // 4. Fusion RRF
    const fusedScores = rrf([searxngRanks, qdrantRanks]);

    // 5. Construire les résultats fusionnés
    const allResults = new Map<string, HybridResult>();

    for (const r of searxngResults) {
      allResults.set(r.url, {
        ...r,
        score: fusedScores.get(r.url) || 0,
        source: 'searxng',
      });
    }

    for (const r of qdrantResults) {
      if (!r.payload?.url) continue;
      const url = r.payload.url as string;
      if (!allResults.has(url)) {
        allResults.set(url, {
          url,
          title: (r.payload.title as string) || url,
          content: (r.payload.content as string) || '',
          score: fusedScores.get(url) || 0,
          source: 'qdrant',
        });
      }
    }

    // 6. Trier par score RRF décroissant
    return Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (error) {
    console.warn('Hybrid search failed, falling back to SearXNG:', error);
    return searxngResults.map((r, i) => ({
      ...r,
      score: 1 - i / searxngResults.length,
      source: 'searxng' as const,
    }));
  }
}
