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
  getModelParameters,
  getReasoningControl,
  canonicalModelId,
} from '@/ai/models';

describe('model catalog', () => {
  it('holds 132 models with unique ids', () => {
    expect(models).toHaveLength(132);
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

  it('mirrors every AI Studio Gemini model on Agent Platform', () => {
    const studio = models.filter((m) => m.provider === 'google');
    const agentPlatform = models.filter((m) => m.provider === 'vertex');
    expect(agentPlatform.map((m) => m.value)).toEqual(studio.map((m) => m.value.replace('zetora-', 'zetora-vertex-')));
    expect(getModelProvider('zetora-vertex-gemini-3.5-flash')).toBe('vertex');
    expect(getModelProvider('zetora-gemini-3.5-flash')).toBe('google');
  });

  it('resolves folded "Thinking" ids to a catalog model that reasons', () => {
    for (const legacy of [
      'zetora-anthropic-opus-4.8-think',
      'zetora-qwen-3-vl-thinking',
      'zetora-vertex-gemini-3.8-flash-think',
    ]) {
      const merged = canonicalModelId(legacy);
      expect(getModelConfig(legacy)).toBeUndefined();
      expect(getModelConfig(merged)?.reasoning).toBe(true);
    }
    expect(canonicalModelId('zetora-gpt-5.4-thinking-xhigh')).toBe('zetora-gpt-5.4-thinking-xhigh');
  });

  it('exposes a full or on/off reasoning toggle per model', () => {
    expect(getReasoningControl('zetora-anthropic-sonnet-5')).toBe('full');
    expect(getReasoningControl('zetora-grok-4-fast')).toBe('binary-guaranteed');
    expect(getReasoningControl('zetora-anthropic-small')).toBeNull();
  });

  it('switches sampling parameters with the reasoning effort', () => {
    expect(getModelParameters('zetora-qwen-235')).toMatchObject({ temperature: 0.6, topP: 0.95 });
    expect(getModelParameters('zetora-qwen-235', 'off')).toMatchObject({ temperature: 0.7, topP: 0.8 });
    expect(getModelParameters('zetora-deepseek-chat')).toEqual({});
    expect(getModelParameters('zetora-deepseek-chat', 'off')).toEqual({ temperature: 1, topP: 0.95 });
  });

  it('getFilteredModels returns the full catalog outside restricted regions', () => {
    expect(getFilteredModels()).toBe(models);
    expect(getFilteredModels('FR')).toHaveLength(132);
  });
});
