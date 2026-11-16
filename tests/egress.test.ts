import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPreferenceValues } from '@/lib/db/schema';

// With anonymization on, every way out of the instance either carries
// pseudonyms or is refused with an error that names the setting to change.

const serverEnv = vi.hoisted((): { EMBEDDINGS_URL?: string; EMBEDDINGS_MODEL?: string; RERANKER_URL?: string } => ({}));
const getCustomProviders = vi.hoisted(() => vi.fn());
const getCustomModels = vi.hoisted(() => vi.fn());

vi.mock('@/env/server', () => ({ serverEnv }));
vi.mock('@/lib/instance/capabilities', () => ({ isAnonymizationAvailable: () => true }));
vi.mock('@/lib/custom-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/custom-providers')>()),
  getCustomProviders,
  getCustomModels,
}));

import { getFileEmbeddingModel, getRerankModel } from '@/lib/egress/models';
import { assertCleartextAllowed } from '@/lib/egress/anonymization';
import { EgressBlockedError } from '@/lib/egress/errors';
import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { getAnonymizeContext } from '@/ai/providers';

const ANONYMIZED: UserPreferenceValues = { 'zetora-anonymization-enabled': true };
const CLEAR: UserPreferenceValues = {};

const localProvider = { id: 'ollama', name: 'Ollama', baseURL: 'http://192.0.2.10:11434/v1', trust: 'local' as const };
const cloudProvider = { id: 'cloud', name: 'Cloud', baseURL: 'https://api.example.com/v1', trust: 'external' as const };

beforeEach(() => {
  for (const key of Object.keys(serverEnv) as Array<keyof typeof serverEnv>) delete serverEnv[key];
  getCustomProviders.mockResolvedValue([localProvider, cloudProvider]);
  vi.stubEnv('COHERE_API_KEY', 'cohere-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('getFileEmbeddingModel', () => {
  it('refuses Cohere for file text while anonymization is on', async () => {
    const preferences = { ...ANONYMIZED, 'zetora-file-embedding-provider': 'cohere' as const };
    await expect(getFileEmbeddingModel(preferences, 'user-1')).rejects.toThrow(EgressBlockedError);
    await expect(getFileEmbeddingModel(preferences, 'user-1')).rejects.toThrow('File Search Embedding');
  });

  it('refuses a custom model whose provider is not local while anonymization is on', async () => {
    const preferences: UserPreferenceValues = {
      ...ANONYMIZED,
      'zetora-file-embedding-provider': 'custom',
      'zetora-file-embedding-model': 'custom-cloud-embed-1',
    };
    await expect(getFileEmbeddingModel(preferences, 'user-1')).rejects.toThrow(EgressBlockedError);
  });

  it('accepts a custom model of a local provider while anonymization is on', async () => {
    const preferences: UserPreferenceValues = {
      ...ANONYMIZED,
      'zetora-file-embedding-provider': 'custom',
      'zetora-file-embedding-model': 'custom-ollama-bge-m3',
    };
    const model = await getFileEmbeddingModel(preferences, 'user-1');
    expect(model.modelId).toBe('bge-m3');
    expect(getCustomProviders).toHaveBeenCalledWith('user-1');
  });

  it('keeps Cohere while anonymization is off', async () => {
    const model = await getFileEmbeddingModel({ 'zetora-file-embedding-provider': 'cohere' }, 'user-1');
    expect(model.provider).toContain('cohere');
  });

  it("defaults to this instance's embedding server when it runs one", async () => {
    serverEnv.EMBEDDINGS_URL = 'http://embeddings/v1';
    serverEnv.EMBEDDINGS_MODEL = 'BAAI/bge-m3';
    const model = await getFileEmbeddingModel(ANONYMIZED, 'user-1');
    expect(model.modelId).toBe('BAAI/bge-m3');
  });

  it('names the variable when this instance is picked but runs no embedding server', async () => {
    await expect(getFileEmbeddingModel({ 'zetora-file-embedding-provider': 'instance' }, 'user-1')).rejects.toThrow(
      ModelUnavailableError,
    );
    await expect(getFileEmbeddingModel({ 'zetora-file-embedding-provider': 'instance' }, 'user-1')).rejects.toThrow(
      'EMBEDDINGS_URL',
    );
  });
});

describe('getRerankModel', () => {
  it("uses this instance's reranker when it runs one, even for file excerpts", () => {
    serverEnv.RERANKER_URL = 'http://reranker';
    const model = getRerankModel({ userContent: { preferences: ANONYMIZED, userId: 'user-1' } });
    expect(model?.provider).toBe('tei');
  });

  it('does not send file excerpts to Cohere while anonymization is on', () => {
    expect(getRerankModel({ userContent: { preferences: ANONYMIZED, userId: 'user-1' } })).toBeNull();
  });

  it('keeps Cohere for public results, which it reranks faster', () => {
    serverEnv.RERANKER_URL = 'http://reranker';
    expect(getRerankModel()?.provider).toContain('cohere');
  });

  it("falls to this instance's reranker for public results when there is no Cohere key", () => {
    vi.stubEnv('COHERE_API_KEY', '');
    serverEnv.RERANKER_URL = 'http://reranker';
    expect(getRerankModel()?.provider).toBe('tei');
  });

  it('keeps Cohere for file excerpts while anonymization is off', () => {
    expect(getRerankModel({ userContent: { preferences: CLEAR, userId: 'user-1' } })?.provider).toContain('cohere');
  });
});

describe('assertCleartextAllowed', () => {
  const egress = { what: 'your voice', fix: 'Pick a local server.' };

  it('lets anything reach a local provider', () => {
    expect(() =>
      assertCleartextAllowed({ ...egress, preferences: ANONYMIZED, userId: 'user-1', trust: 'local' }),
    ).not.toThrow();
  });

  it('refuses a provider that is not local while anonymization is on, and says what to change', () => {
    for (const trust of ['contracted', 'external'] as const) {
      expect(() => assertCleartextAllowed({ ...egress, preferences: ANONYMIZED, userId: 'user-1', trust })).toThrow(
        'Anonymization is on, so your voice cannot go to a provider that is not local. Pick a local server.',
      );
    }
  });

  it('lets anything through while anonymization is off', () => {
    expect(() =>
      assertCleartextAllowed({ ...egress, preferences: CLEAR, userId: 'user-1', trust: 'external' }),
    ).not.toThrow();
  });
});

describe('getAnonymizeContext', () => {
  beforeEach(() => {
    getCustomModels.mockResolvedValue([
      { id: 'custom-ollama-qwen3', providerId: 'ollama', providerName: 'Ollama', modelName: 'qwen3' },
      { id: 'custom-cloud-big', providerId: 'cloud', providerName: 'Cloud', modelName: 'big' },
    ]);
  });

  it('gives a local custom model cleartext', async () => {
    expect(await getAnonymizeContext('custom-ollama-qwen3', ANONYMIZED, 'user-1')).toBeNull();
  });

  it('pseudonymizes for a custom model whose provider is not local', async () => {
    expect(await getAnonymizeContext('custom-cloud-big', ANONYMIZED, 'user-1')).toMatchObject({ userId: 'user-1' });
  });

  it('pseudonymizes for every built-in provider', async () => {
    expect(await getAnonymizeContext('anthropic:claude-test', ANONYMIZED, 'user-1')).toMatchObject({
      userId: 'user-1',
    });
  });

  it('does nothing while anonymization is off', async () => {
    expect(await getAnonymizeContext('anthropic:claude-test', CLEAR, 'user-1')).toBeNull();
  });
});
