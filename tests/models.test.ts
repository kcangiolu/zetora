import { describe, it, expect } from 'vitest';
import {
  AUTO_MODEL_ID,
  canonicalModelId,
  findModel,
  getAcceptedFileTypes,
  getFilteredModels,
  getProviderName,
  getReasoningControl,
  isModelRestrictedInRegion,
  supportsCanvasMode,
  type Model,
} from '@/ai/models';

function model(value: string, provider: string, overrides: Partial<Model> = {}): Model {
  return {
    value,
    label: value,
    description: '',
    provider,
    vision: false,
    pdf: false,
    reasoning: false,
    structuredOutput: true,
    maxOutputTokens: 8000,
    experimental: false,
    ...overrides,
  };
}

const sonnet = model('anthropic:claude-sonnet-4-6', 'anthropic');
const gpt = model('openai:gpt-5.4', 'openai');
const kimi = model('moonshot:kimi-k2.6', 'moonshot');

describe('findModel', () => {
  const models = [sonnet, gpt, kimi];

  it('finds a model by its catalog id', () => {
    expect(findModel(models, 'openai:gpt-5.4')).toBe(gpt);
  });

  it('resolves an id stored before the models.dev catalog', () => {
    expect(canonicalModelId('zetora-anthropic-sonnet-4.6')).toBe('anthropic:claude-sonnet-4-6');
    expect(findModel(models, 'zetora-anthropic-sonnet-4.6-think')).toBe(sonnet);
  });

  it('matches an id spelled the way another host spells it', () => {
    expect(findModel(models, 'anthropic:claude-sonnet-4.6')).toBe(sonnet);
  });

  it('finds nothing for an unknown or missing id', () => {
    expect(findModel(models, 'openai:gpt-1')).toBeUndefined();
    expect(findModel(models, undefined)).toBeUndefined();
  });
});

describe('region restrictions', () => {
  it('hides OpenAI and Anthropic models in restricted regions only', () => {
    expect(isModelRestrictedInRegion(gpt, 'cn')).toBe(true);
    expect(isModelRestrictedInRegion(kimi, 'CN')).toBe(false);
    expect(isModelRestrictedInRegion(gpt, 'FR')).toBe(false);
    expect(getFilteredModels([sonnet, gpt, kimi], 'RU')).toEqual([kimi]);
    expect(getFilteredModels([sonnet, gpt, kimi])).toHaveLength(3);
  });
});

describe('model accessors', () => {
  it('names labs from the catalog config', () => {
    expect(getProviderName('vertex')).toBe('Google Agent Platform');
    expect(getProviderName('custom')).toBe('Custom');
    expect(getProviderName('unknown-lab')).toBe('unknown-lab');
  });

  it('accepts PDFs only for models that read them', () => {
    expect(getAcceptedFileTypes(model('a:b', 'a', { pdf: true }))).toContain('.pdf');
    expect(getAcceptedFileTypes(gpt)).not.toContain('.pdf');
  });

  it('allows canvas mode for structured-output models, never for Auto', () => {
    expect(supportsCanvasMode(gpt)).toBe(true);
    expect(supportsCanvasMode(model('a:b', 'a', { structuredOutput: false }))).toBe(false);
    expect(supportsCanvasMode(model(AUTO_MODEL_ID, 'zetora'))).toBe(false);
  });

  it('shows the reasoning toggle only for steerable reasoning models', () => {
    expect(getReasoningControl(gpt)).toBeNull();
    expect(getReasoningControl(model('a:b', 'a', { reasoning: true, reasoningControl: 'full' }))).toBe('full');
    expect(getReasoningControl(model('a:b', 'a', { reasoning: true }))).toBeNull();
  });
});
