import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

type EmbeddingProvider = { id: string; name: string; baseURL: string; apiKey?: string };

export function getEmbeddingModel(preferences: Record<string, unknown>) {
  const selectedId = preferences['zetora-embedding-provider'] as string | undefined;
  const providers = preferences['zetora-embedding-providers'] as EmbeddingProvider[] | undefined;
  const modelName = (preferences['zetora-embedding-model'] as string | undefined) || 'nomic-embed-text';

  if (!selectedId || !providers?.length) return null;

  const provider = providers.find((p) => p.id === selectedId);
  if (!provider) return null;

  const embeddingProvider = createOpenAICompatible({
    name: provider.name,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey || 'not-needed',
  });

  return embeddingProvider.embeddingModel(modelName);
}
