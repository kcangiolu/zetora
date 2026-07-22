import { describe, it, expect } from 'vitest';
import {
  models,
  PROVIDERS,
  getModelConfig,
  getModelProvider,
  hasVisionSupport,
  getMaxOutputTokens,
  getModelsByProvider,
  getFilteredModels,
} from '@/ai/models';

describe('model catalog', () => {
  it('holds 169 models with unique ids', () => {
    expect(models).toHaveLength(169);
    const ids = models.map((m) => m.value);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Order guards the data/helpers split: the 'all' view of the model
  // selector renders in array order, so it must never change silently.
  it('keeps the catalog display order stable', () => {
    expect(models.map((m) => m.value)).toMatchSnapshot('model-order');
  });

  it('every explicit provider is a known PROVIDERS key', () => {
    for (const model of models) {
      if (model.provider) expect(PROVIDERS[model.provider]).toBeDefined();
    }
  });

  it('accessors read from the catalog', () => {
    const vision = models.find((m) => m.vision);
    expect(vision && hasVisionSupport(vision.value)).toBe(true);
    expect(getModelConfig('definitely-not-a-model')).toBeUndefined();
    expect(getMaxOutputTokens(models[0].value)).toBe(models[0].maxOutputTokens);
  });

  it('getModelProvider derives custom and falls back to explicit fields', () => {
    expect(getModelProvider('custom-prov1-llama')).toBe('custom');
    const anthropic = models.find((m) => m.provider === 'anthropic')!;
    expect(getModelsByProvider('anthropic')).toContainEqual(anthropic);
  });

  it('getFilteredModels returns the full catalog outside restricted regions', () => {
    expect(getFilteredModels()).toBe(models);
    expect(getFilteredModels('FR')).toHaveLength(169);
  });
});
