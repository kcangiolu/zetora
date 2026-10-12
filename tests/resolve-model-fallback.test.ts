import { describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

// Direct clients are built at import time from the env.
vi.hoisted(() => {
  process.env.XAI_API_KEY = 'test-xai-key';
  delete process.env.ZETORA_MODEL_DEFAULT;
});

function entry(id: string, cost: number): CatalogEntry {
  return {
    id,
    lab: 'xai',
    label: id,
    description: '',
    vision: true,
    pdf: false,
    contextWindow: 256_000,
    structuredOutput: true,
    cost: { input: cost, output: cost },
    reasoning: null,
    routes: [{ host: 'direct', modelId: id.slice('xai:'.length) }],
  };
}

const ENTRIES = [entry('xai:grok-big', 3), entry('xai:grok-small', 0.2)];

vi.mock('@/ai/catalog/store', () => ({
  loadModelCatalog: async () => {},
  getCatalogEntries: () => ENTRIES,
  getCatalogEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));

import { resolveModel } from '@/ai/providers';

describe('resolveModel', () => {
  it('routes a catalog model to its upstream id', async () => {
    expect((await resolveModel('xai:grok-big')).modelId).toBe('grok-big');
  });

  it('resolves the default alias to the cheapest capable model', async () => {
    expect((await resolveModel('zetora-default')).modelId).toBe('grok-small');
  });

  it('falls back to the default model for a model that left the catalog', async () => {
    expect((await resolveModel('xai:grok-retired')).modelId).toBe('grok-small');
  });

  it('falls back to the instance default when the default-model preference left the catalog too', async () => {
    const resolved = await resolveModel('xai:grok-retired', { 'zetora-default-model': 'xai:grok-also-retired' });
    expect(resolved.modelId).toBe('grok-small');
  });

  it('honors a default-model preference that is still in the catalog', async () => {
    const resolved = await resolveModel('xai:grok-retired', { 'zetora-default-model': 'xai:grok-big' });
    expect(resolved.modelId).toBe('grok-big');
  });
});
