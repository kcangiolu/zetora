import 'server-only';

import type { RerankingModelV3, RerankingModelV3CallOptions } from '@ai-sdk/provider';
import { z } from 'zod';

// Text Embeddings Inference's POST /rerank answer: one score per text, best
// first. Shared by the bundled reranker (the `embeddings` profile) and any
// server that speaks the same API.
const TeiRerankResponseSchema = z.array(z.object({ index: z.number().int(), score: z.number() }));

export function createTeiRerankingModel(baseURL: string): RerankingModelV3 {
  const endpoint = `${baseURL.replace(/\/+$/, '')}/rerank`;

  return {
    specificationVersion: 'v3',
    provider: 'tei',
    // TEI serves the one model it was started with and ignores any name.
    modelId: 'reranker',
    async doRerank({ documents, query, topN, abortSignal, headers }: RerankingModelV3CallOptions) {
      const texts =
        documents.type === 'text' ? documents.values : documents.values.map((value) => JSON.stringify(value));
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        // truncate: a document longer than the model's window is cut instead
        // of failing the whole call.
        body: JSON.stringify({ query, texts, truncate: true }),
        signal: abortSignal,
      });
      if (!response.ok) {
        throw new Error(`Reranker at ${endpoint} answered ${response.status}: ${await response.text()}`);
      }
      const ranking = TeiRerankResponseSchema.parse(await response.json())
        .sort((a, b) => b.score - a.score)
        .slice(0, topN ?? texts.length)
        .map(({ index, score }) => ({ index, relevanceScore: score }));
      return { ranking };
    },
  };
}
