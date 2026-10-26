import { describe, it, expect, vi, beforeEach } from 'vitest';

const getCustomProviders = vi.hoisted(() => vi.fn());
const embeddingModel = vi.hoisted(() => vi.fn());

vi.mock('@/lib/custom-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/custom-providers')>()),
  getCustomProviders,
  createCustomProvider: () => ({ embeddingModel }),
}));

import { getEmbeddingModel } from '@/ai/embeddings';

const provider = { id: 'ollama', name: 'Ollama', baseURL: 'http://192.0.2.10:11434/v1' };

beforeEach(() => {
  vi.clearAllMocks();
  embeddingModel.mockReturnValue('embedding-model');
});

describe('getEmbeddingModel', () => {
  it("resolves the model among the given user's providers, without relying on a session", async () => {
    getCustomProviders.mockResolvedValue([provider]);

    const model = await getEmbeddingModel(
      { 'zetora-embedding-enabled': true, 'zetora-embedding-provider': 'custom-ollama-bge-m3' },
      'user-1',
    );

    expect(getCustomProviders).toHaveBeenCalledWith('user-1');
    expect(embeddingModel).toHaveBeenCalledWith('bge-m3');
    expect(model).toBe('embedding-model');
  });

  it('fails visibly when the selected model belongs to no provider', async () => {
    getCustomProviders.mockResolvedValue([]);
    await expect(
      getEmbeddingModel(
        { 'zetora-embedding-enabled': true, 'zetora-embedding-provider': 'custom-ollama-bge-m3' },
        'user-1',
      ),
    ).rejects.toThrow('Search Embedding is on but its model is not available');
  });

  it('returns nothing while Search Embedding is off', async () => {
    expect(await getEmbeddingModel({ 'zetora-embedding-enabled': false }, 'user-1')).toBeNull();
    expect(getCustomProviders).not.toHaveBeenCalled();
  });
});
