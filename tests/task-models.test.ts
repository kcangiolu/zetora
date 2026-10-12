import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

function entry(id: string, cost: number, extra: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id,
    lab: 'acme',
    label: id,
    description: '',
    vision: true,
    pdf: false,
    contextWindow: 256_000,
    structuredOutput: true,
    cost: { input: cost, output: cost },
    reasoning: null,
    routes: [{ host: 'direct', modelId: id }],
    ...extra,
  };
}

const ENTRIES = [
  entry('acme:big', 3),
  entry('acme:small', 0.5),
  entry('acme:blind', 0.1, { vision: false }),
  entry('acme:hosted', 0.2, { routes: [{ host: 'openrouter', modelId: 'acme/hosted' }] }),
];

vi.mock('@/ai/catalog/store', () => ({
  getCatalogEntries: () => ENTRIES,
  getCatalogEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));

import { getTaskModelId, getTaskModelIds } from '@/ai/catalog/task-models';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTaskModelId', () => {
  it("picks the cheapest capable model reached through a lab's own API by default", () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', '');
    expect(getTaskModelId('default')).toBe('acme:small');
  });

  it("uses each task's own variable", () => {
    vi.stubEnv('ZETORA_MODEL_CHAT_TITLE', 'acme:big');
    expect(getTaskModelId('chat-title')).toBe('acme:big');
  });

  it('falls back to the default model, then to the arch router for routing', () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'acme:big');
    expect(getTaskModelId('context-compaction')).toBe('acme:big');
    expect(getTaskModelId('auto-router')).toBe('zetora-arch-router');
  });

  it('never gives image translation a default model without vision', () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'acme:blind');
    expect(getTaskModelId('translate-text')).toBe('acme:blind');
    expect(getTaskModelId('translate-vision')).toBe('acme:small');
  });

  it('ignores a model that is not in the catalog', () => {
    vi.stubEnv('ZETORA_MODEL_DEFAULT', 'acme:retired');
    expect(getTaskModelId('default')).toBe('acme:small');
  });
});

describe('getTaskModelIds', () => {
  it('lists every task', () => {
    vi.stubEnv('ZETORA_MODEL_VOICE', 'acme:big');
    const ids = getTaskModelIds();
    expect(ids.voice).toBe('acme:big');
    expect(ids['lang-detect']).toBe(ids.default);
    expect(Object.keys(ids)).toHaveLength(14);
  });
});
