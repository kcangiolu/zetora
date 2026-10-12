import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

// Direct clients are built at import time from the env.
vi.hoisted(() => {
  process.env.XAI_API_KEY = 'test-xai-key';
});

function entry(id: string): CatalogEntry {
  return {
    id,
    lab: 'xai',
    label: id,
    description: '',
    vision: true,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
    routes: [{ host: 'direct', modelId: id.slice('xai:'.length) }],
  };
}

const ENTRIES = [entry('xai:grok-big'), entry('xai:grok-small')];

vi.mock('@/ai/catalog/store', () => ({
  loadModelCatalog: async () => {},
  getCatalogEntries: () => ENTRIES,
  getCatalogEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));

import { resolveModel } from '@/ai/providers';
import { ModelUnavailableError } from '@/ai/catalog/task-models';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveModel', () => {
  it('routes a catalog model to its upstream id', async () => {
    expect((await resolveModel('xai:grok-big')).modelId).toBe('grok-big');
  });

  it('fails for a model that left the catalog, without falling back', async () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'xai:grok-small');
    await expect(resolveModel('xai:grok-retired')).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it("resolves the default alias to the user's Default Model, else the instance's", async () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'xai:grok-small');
    expect((await resolveModel('zetora-default')).modelId).toBe('grok-small');
    const picked = await resolveModel('zetora-default', { 'zetora-default-model': 'xai:grok-big' });
    expect(picked.modelId).toBe('grok-big');
  });

  it('fails for the default alias when no default model is configured', async () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', '');
    await expect(resolveModel('zetora-default')).rejects.toThrow('no model is configured');
  });
});
