import 'server-only';
import { embed, generateText } from 'ai';
import { getQdrantClient, resolveQdrantUrl } from './qdrant';
import { getEmbeddingModel } from '@/ai/embeddings';
import { resolveTertiaryModel } from '@/ai/tertiary';

const SEARCH_INDEX_COLLECTION = 'zetora_search_index';

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

function searxngOnlyResults(
  searxngResults: { url: string; title: string; content: string }[]
): HybridResult[] {
  return searxngResults.map((r, i) => ({
    ...r,
    score: 1 - i / searxngResults.length,
    source: 'searxng' as const,
  }));
}

async function rerankResults(
  query: string,
  candidates: HybridResult[],
  topK: number,
  preferences: Record<string, unknown>
): Promise<HybridResult[]> {
  if (preferences['zetora-rerank-enabled'] !== true || candidates.length === 0) {
    return candidates.slice(0, topK);
  }

  try {
    const model = await resolveTertiaryModel('default', preferences as Record<string, string>);

    const documentsBlock = candidates
      .map((c, i) => `Document ${i}: ${c.title}\n${c.content.slice(0, 1000)}\n---`)
      .join('\n');

    const { text } = await generateText({
      model,
      prompt:
        `Query: ${query}\n\n` +
        `For each document below, rate how well it answers the query on a scale of 1-10. ` +
        `Return a JSON array of {index: number, score: number}.\n\n${documentsBlock}`,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return candidates.slice(0, topK);

    const ratings = JSON.parse(jsonMatch[0]) as { index: number; score: number }[];
    const scoreByIndex = new Map(ratings.map((r) => [r.index, r.score]));

    return candidates
      .map((candidate, index) => ({ candidate, index }))
      .sort((a, b) => (scoreByIndex.get(b.index) ?? 0) - (scoreByIndex.get(a.index) ?? 0))
      .slice(0, topK)
      .map(({ candidate }) => candidate);
  } catch (error) {
    console.warn('Reranking failed, falling back to RRF order:', error);
    return candidates.slice(0, topK);
  }
}

export async function hybridSearch(
  query: string,
  searxngResults: { url: string; title: string; content: string }[],
  preferences: Record<string, unknown>,
  topK: number = 10
): Promise<HybridResult[]> {
  if (preferences['zetora-hybrid-search-enabled'] !== true) {
    return searxngOnlyResults(searxngResults);
  }

  const embeddingModel = await getEmbeddingModel(preferences);

  // Si pas d'embedding model, retourne juste SearXNG
  if (!embeddingModel) {
    return searxngOnlyResults(searxngResults);
  }

  try {
    // 1. Générer l'embedding de la requête
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    // 2. Chercher dans Qdrant (parmi le contenu indexé précédemment)
    const client = getQdrantClient(resolveQdrantUrl(preferences));
    const qdrantResults = await client.search(
      SEARCH_INDEX_COLLECTION,
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
          content: (r.payload.chunk_text as string) || '',
          score: fusedScores.get(url) || 0,
          source: 'qdrant',
        });
      }
    }

    // 6. Trier par score RRF décroissant, puis reranking optionnel
    const fused = Array.from(allResults.values()).sort((a, b) => b.score - a.score);
    const reranked = await rerankResults(query, fused, topK, preferences);

    console.log(
      `[HYBRID-SEARCH] RRF fusion applied, ${fused.length} candidates → ${reranked.length} after reranking`,
    );

    return reranked;
  } catch (error) {
    console.warn('Hybrid search failed, falling back to SearXNG:', error);
    return searxngOnlyResults(searxngResults);
  }
}
