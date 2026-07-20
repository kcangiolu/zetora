import 'server-only';
import { cohere } from '@ai-sdk/cohere';
import { createCustomProvider, getCustomProviders, parseCustomModelId } from '@/lib/custom-providers';

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
  return resolveCustomEmbeddingModel(preferences['zetora-embedding-provider'] as string | undefined);
}

// Used by file_query_search / extreme_search's document indexing — these
// always need *some* embedding model (there's no "skip embedding" fallback
// like hybrid-search has), so this always returns one: the user's custom
// provider when `zetora-file-embedding-provider` is 'custom' and one is
// configured, Cohere embed-v4.0 otherwise (the original, still-default
// behavior — requires COHERE_API_KEY).
export async function getFileEmbeddingModel(preferences: Record<string, unknown> | null | undefined) {
  if (preferences?.['zetora-file-embedding-provider'] === 'custom') {
    const custom = await resolveCustomEmbeddingModel(preferences['zetora-embedding-provider'] as string | undefined);
    if (custom) return custom;
  }
  return cohere.embedding('embed-v4.0');
}
