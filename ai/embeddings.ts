import 'server-only';
import { createCustomProvider, getCustomProviders, parseCustomModelId } from '@/lib/custom-providers';

export async function getEmbeddingModel(preferences: Record<string, unknown>) {
  if (preferences['zetora-embedding-enabled'] !== true) return null;

  const selectedId = preferences['zetora-embedding-provider'] as string | undefined;
  if (!selectedId) return null;

  const providers = await getCustomProviders();
  const parsed = parseCustomModelId(selectedId, providers);
  if (!parsed) return null;

  return createCustomProvider(parsed.provider).embeddingModel(parsed.modelName);
}
