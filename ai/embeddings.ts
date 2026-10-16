import 'server-only';
import { cohere } from '@ai-sdk/cohere';
import { createCustomProvider, getCustomProviders, parseCustomModelId } from '@/lib/custom-providers';
import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { isConfigured } from '@/ai/catalog/env';
import type { UserPreferenceValues } from '@/lib/db/schema';

// Shared by both consumers below: resolves a `zetora-embedding-provider`
// preference value (a "custom-{providerId}-{modelName}" id) to an AI SDK
// EmbeddingModel, or null if unset/unresolvable. Doesn't gate on any
// "enabled" preference itself — callers decide what that means for them.
async function resolveCustomEmbeddingModel(selectedId: string | undefined) {
  if (!selectedId) return null;

  const providers = await getCustomProviders();
  const parsed = parseCustomModelId(selectedId, providers);
  if (!parsed) return null;

  return createCustomProvider(parsed.provider).embeddingModel(parsed.modelName);
}

// Used by hybrid-search's Qdrant content indexing — opt-in, gated behind its
// own "Search Embedding" toggle in Settings > Search (only meaningful once
// Qdrant is enabled).
export async function getEmbeddingModel(preferences: Record<string, unknown>) {
  if (preferences['zetora-embedding-enabled'] !== true) return null;
  const model = await resolveCustomEmbeddingModel(preferences['zetora-embedding-provider'] as string | undefined);
  if (!model) {
    throw new ModelUnavailableError(
      'Search Embedding is on but its model is not available: pick one in Settings → Search.',
    );
  }
  return model;
}

// Used by file_query_search / extreme_search's document indexing, which
// always need an embedding model: the user's custom one when
// `zetora-file-embedding-provider` is 'custom', Cohere embed-v4.0 otherwise.
export async function getFileEmbeddingModel(preferences: UserPreferenceValues | null | undefined) {
  if (preferences?.['zetora-file-embedding-provider'] === 'custom') {
    const custom = await resolveCustomEmbeddingModel(preferences['zetora-embedding-provider'] as string | undefined);
    if (!custom) {
      throw new ModelUnavailableError(
        'File search is set to a custom embedding model that is not available: pick one in Settings → Search.',
      );
    }
    return custom;
  }
  if (!isConfigured(process.env.COHERE_API_KEY)) {
    throw new ModelUnavailableError(
      'Searching files needs an embedding model: set COHERE_API_KEY, or pick a custom embedding model in Settings → Search.',
    );
  }
  return cohere.embedding('embed-v4.0');
}
