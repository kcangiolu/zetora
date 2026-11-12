import { afterEach, describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';

vi.hoisted(() => {
  process.env.XAI_API_KEY = 'test-xai-key';
});

function entry(id: string, provider: CatalogEntry['provider'], modelId: string): CatalogEntry {
  return {
    id,
    provider,
    modelId,
    lab: 'xai',
    label: id,
    description: '',
    vision: false,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
  };
}

const ENTRIES = [
  entry('xai:grok-fast', 'xai', 'grok-fast'),
  { ...entry('xai:grok-pair', 'xai', 'grok-pair-reasoning'), instantModelId: 'grok-pair-non-reasoning' },
  entry('openrouter:x-ai/grok-fast', 'openrouter', 'x-ai/grok-fast'),
];

vi.mock('@/ai/catalog/models', () => ({
  getModelEntry: (id: string) => ENTRIES.find((e) => e.id === id),
}));

import { ModelUnavailableError } from '@/ai/catalog/task-models';
import { getXSearchModel } from '@/lib/tools/x-search';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getXSearchModel', () => {
  it('runs on the xAI model ZETORA_MODEL_X_SEARCH names', () => {
    vi.stubEnv('ZETORA_MODEL_X_SEARCH', 'xai:grok-fast');
    expect(getXSearchModel().modelId).toBe('grok-fast');
  });

  it('runs a thinking/instant pair as its instant model', () => {
    vi.stubEnv('ZETORA_MODEL_X_SEARCH', 'xai:grok-pair');
    expect(getXSearchModel().modelId).toBe('grok-pair-non-reasoning');
  });

  it('names the variable to set when it is empty', () => {
    vi.stubEnv('ZETORA_MODEL_X_SEARCH', '');
    expect(() => getXSearchModel()).toThrow(ModelUnavailableError);
    expect(() => getXSearchModel()).toThrow('ZETORA_MODEL_X_SEARCH');
  });

  it('refuses a model served by another provider, which has no X search tool', () => {
    vi.stubEnv('ZETORA_MODEL_X_SEARCH', 'openrouter:x-ai/grok-fast');
    expect(() => getXSearchModel()).toThrow('not an xAI model');
  });
});
