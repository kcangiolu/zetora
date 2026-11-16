import 'server-only';

import { cohere } from '@ai-sdk/cohere';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModelV3, RerankingModelV3 } from '@ai-sdk/provider';
import { serverEnv } from '@/env/server';
import { isConfigured } from '@/ai/catalog/env';
import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { createCustomProvider, getCustomProviders, parseCustomModelId } from '@/lib/custom-providers';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';
import { assertCleartextAllowed, getUserAnonymizeContext } from './anonymization';
import { createTeiRerankingModel } from './tei-reranking-model';
import type { TrustClass } from './trust';

// Every embedding and reranking model Zetora calls is resolved here, so each
// one is checked against what it is allowed to read. Embedding and reranking
// work on cleartext (pseudonyms would wreck the vectors and scores), so with
// anonymization on, the user's own content only goes to local models.

const log = createLogger('egress-models');

function instanceEmbeddingModel(): EmbeddingModelV3 {
  if (!serverEnv.EMBEDDINGS_URL) {
    throw new ModelUnavailableError(
      "File search is set to this instance's embedding model, but EMBEDDINGS_URL is not set (see the embeddings profile in docker-compose.yml).",
    );
  }
  if (!serverEnv.EMBEDDINGS_MODEL) {
    throw new ModelUnavailableError(
      'EMBEDDINGS_URL is set but EMBEDDINGS_MODEL is not: set it to the model the embedding server runs.',
    );
  }
  return createOpenAICompatible({ name: 'instance-embeddings', baseURL: serverEnv.EMBEDDINGS_URL }).embeddingModel(
    serverEnv.EMBEDDINGS_MODEL,
  );
}

// A "custom-{providerId}-{modelName}" preference value as an embedding model,
// with its provider's trust class; null if unset or unresolvable. Without a
// userId, the user's own providers come from the session cookie, which a
// request authenticated otherwise (the voice service) does not carry.
async function resolveCustomEmbeddingModel(
  selectedId: string | undefined,
  userId: string | undefined,
): Promise<{ model: EmbeddingModelV3; trust: TrustClass } | null> {
  if (!selectedId) return null;

  const providers = await getCustomProviders(userId);
  const parsed = parseCustomModelId(selectedId, providers);
  if (!parsed) return null;

  return {
    model: createCustomProvider(parsed.provider).embeddingModel(parsed.modelName),
    trust: parsed.provider.trust,
  };
}

// Hybrid search's Qdrant indexing of web pages: opt-in, behind its own
// "Search Embedding" toggle in Settings > Search (only meaningful once Qdrant
// is enabled). It embeds public pages and the model's search queries, which
// the tool layer has already pseudonymized, so any provider may serve it.
export async function getEmbeddingModel(preferences: Record<string, unknown>, userId: string | undefined) {
  if (preferences['zetora-embedding-enabled'] !== true) return null;
  const selected = preferences['zetora-embedding-provider'];
  const resolved = await resolveCustomEmbeddingModel(typeof selected === 'string' ? selected : undefined, userId);
  if (!resolved) {
    throw new ModelUnavailableError(
      'Search Embedding is on but its model is not available: pick one in Settings → Search.',
    );
  }
  return resolved.model;
}

const FILE_EMBEDDING_FIX =
  'In Settings → Search → File Search Embedding, pick This instance, or a custom model whose provider is marked Local.';

// file_query_search and extreme_search's document indexing, which embed the
// full text of the user's uploads. Unset, the source is this instance's
// embedding server when it runs one, Cohere otherwise.
export async function getFileEmbeddingModel(
  preferences: UserPreferenceValues | null | undefined,
  userId: string | undefined,
): Promise<EmbeddingModelV3> {
  const source = preferences?.['zetora-file-embedding-provider'] || (serverEnv.EMBEDDINGS_URL ? 'instance' : 'cohere');
  const what = 'the text of uploaded files';

  switch (source) {
    case 'instance':
      return instanceEmbeddingModel();
    case 'custom': {
      const resolved = await resolveCustomEmbeddingModel(preferences?.['zetora-file-embedding-model'], userId);
      if (!resolved) {
        throw new ModelUnavailableError(
          'File search is set to a custom embedding model that is not available: pick one in Settings → Search.',
        );
      }
      assertCleartextAllowed({ preferences, userId, trust: resolved.trust, what, fix: FILE_EMBEDDING_FIX });
      return resolved.model;
    }
    case 'cohere':
      assertCleartextAllowed({ preferences, userId, trust: 'external', what, fix: FILE_EMBEDDING_FIX });
      if (!isConfigured(process.env.COHERE_API_KEY)) {
        throw new ModelUnavailableError(
          'Searching files needs an embedding model: set COHERE_API_KEY or EMBEDDINGS_URL, or pick a custom embedding model in Settings → Search.',
        );
      }
      return cohere.embedding('embed-v4.0');
  }
}

interface RerankOptions {
  // Cohere model, when Cohere serves the call: the fast one where latency
  // matters more than order.
  cohereModel?: 'rerank-v4.0-pro' | 'rerank-v4.0-fast';
  // Set when the documents are the user's own content (file excerpts) rather
  // than public results.
  userContent?: { preferences: UserPreferenceValues | null | undefined; userId: string | undefined };
}

// The user's own content goes to this instance's reranker when it runs one,
// and to Cohere only while anonymization is off. Public results go to Cohere
// first: the local reranker runs on CPU and takes seconds where Cohere takes
// a fraction of one. Null when nothing may serve the call; reranking only
// reorders results, so callers then keep their own order instead of failing.
export function getRerankModel({
  cohereModel = 'rerank-v4.0-pro',
  userContent,
}: RerankOptions = {}): RerankingModelV3 | null {
  const local = serverEnv.RERANKER_URL ? createTeiRerankingModel(serverEnv.RERANKER_URL) : null;
  const cloud = isConfigured(process.env.COHERE_API_KEY) ? cohere.reranking(cohereModel) : null;
  if (!userContent) return cloud ?? local;
  if (local) return local;
  if (cloud && getUserAnonymizeContext(userContent.preferences, userContent.userId)) {
    log.info('Anonymization is on and no local reranker runs (RERANKER_URL): file excerpts keep their search order.');
    return null;
  }
  return cloud;
}
