import 'server-only';
import { embed, generateText } from 'ai';
import { getQdrantClient } from './qdrant';
import { SEARCH_INDEX_COLLECTION } from './constants';
import { buildUserFilter } from './qdrant-filters';
import { getEmbeddingModel } from '@/ai/embeddings';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { RERANK_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

import { createLogger } from '@/lib/logger';

const log = createLogger('hybrid-search');

// Only 5 archive candidates per query — this is a hint of possibly-related
// past context, not a second source of "live" results.
const QDRANT_QUERY_LIMIT = 5;

// Below this cosine score a Qdrant hit is treated as noise (e.g. an
// unrelated topic from a past conversation) and dropped before it ever
// reaches the model. Tunable because embedding models differ in how tightly
// their scores cluster.
function resolveHybridMinScore(): number {
  const raw = process.env.ZETORA_HYBRID_MIN_SCORE;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.55;
}

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
 * where k is a constant (typically 60)
 */
function rrf(resultsArrays: { url: string; rank: number }[][], k: number = 60): Map<string, number> {
  const scores = new Map<string, number>();

  for (const results of resultsArrays) {
    for (const { url, rank } of results) {
      const current = scores.get(url) || 0;
      scores.set(url, current + 1 / (k + rank));
    }
  }

  return scores;
}

function searxngOnlyResults(searxngResults: { url: string; title: string; content: string }[]): HybridResult[] {
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
  preferences: Record<string, unknown>,
  userId: string | undefined,
  abortSignal: AbortSignal | undefined,
): Promise<HybridResult[]> {
  if (preferences['zetora-rerank-enabled'] !== true || candidates.length === 0) {
    return candidates.slice(0, topK);
  }

  try {
    // A reasoning model thinks for thousands of tokens before a list of scores,
    // over a minute that every search answer would wait for.
    const model = await resolveTertiaryModel('default', preferences, userId, 'off');

    const documentsBlock = candidates
      .map((c, i) => `Document ${i}: ${c.title}\n${c.content.slice(0, 1000)}\n---`)
      .join('\n');

    const { text } = await generateText({
      model,
      abortSignal: withAbort(abortSignal, RERANK_TIMEOUT_MS),
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
    log.warn('Reranking failed, falling back to RRF order:', error);
    return candidates.slice(0, topK);
  }
}

export async function hybridSearch(
  query: string,
  searxngResults: { url: string; title: string; content: string }[],
  preferences: Record<string, unknown>,
  userId?: string,
  abortSignal?: AbortSignal,
): Promise<HybridResult[]> {
  if (preferences['zetora-hybrid-search-enabled'] !== true) {
    return searxngOnlyResults(searxngResults);
  }

  const embeddingModel = await getEmbeddingModel(preferences, userId);

  // Without an embedding model, return the SearXNG results as-is
  if (!embeddingModel) {
    return searxngOnlyResults(searxngResults);
  }

  try {
    // 1. Generate the query embedding
    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    // 2. Search Qdrant (across previously indexed content), scoped to this
    // user and filtered to a minimum similarity score so an unrelated topic
    // from a past conversation can't surface as a "found" result here.
    const client = getQdrantClient();
    const qdrantResults = await client.search(
      SEARCH_INDEX_COLLECTION,
      embedding,
      QDRANT_QUERY_LIMIT,
      resolveHybridMinScore(),
      buildUserFilter(userId),
    );

    if (qdrantResults.length > 0) {
      const scores = qdrantResults.map((r) => r.score);
      log.debug(
        `[HYBRID-SEARCH] Qdrant candidates: ${qdrantResults.length}, score range [${Math.min(...scores).toFixed(3)}, ${Math.max(...scores).toFixed(3)}]`,
      );
    }

    // 3. Prepare ranks for RRF
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

    // 4. RRF fusion
    const fusedScores = rrf([searxngRanks, qdrantRanks]);

    // 5. Build the fused result set
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

    // 6. Sort by descending RRF score, then optionally rerank. Keep every
    // fused candidate by default (topK = fused.length) — live SearXNG
    // results are never dropped here, only reordered/annotated.
    const fused = Array.from(allResults.values()).sort((a, b) => b.score - a.score);
    const reranked = await rerankResults(query, fused, fused.length, preferences, userId, abortSignal);

    log.debug(`[HYBRID-SEARCH] RRF fusion applied, ${fused.length} candidates → ${reranked.length} after reranking`);

    return reranked;
  } catch (error) {
    log.warn('Hybrid search failed, falling back to SearXNG:', error);
    return searxngOnlyResults(searxngResults);
  }
}
