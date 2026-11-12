import { describe, it, expect, vi } from 'vitest';
import type { ProviderId } from '@/ai/catalog/config';
import type { CatalogEntry } from '@/ai/catalog/types';
import { getSearchProviderOptions, getStreamTextStaticSettings } from '@/lib/search/provider-options';

describe('getStreamTextStaticSettings', () => {
  const base = {
    specialMode: undefined,
    isXmlParsedCustomModel: false,
  };

  it('uses 50 steps for MCP mode', async () => {
    expect((await getStreamTextStaticSettings({ ...base, specialMode: 'mcp' })).stopWhenStepCount).toBe(50);
  });

  it('uses 15 steps when no special mode is active', async () => {
    expect((await getStreamTextStaticSettings(base)).stopWhenStepCount).toBe(15);
  });

  it('caps XML-parsed custom models at 3 steps in a special mode', async () => {
    expect(
      (
        await getStreamTextStaticSettings({
          ...base,
          specialMode: 'canvas',
          isXmlParsedCustomModel: true,
        })
      ).stopWhenStepCount,
    ).toBe(3);
  });

  it('uses 5 steps for other special modes', async () => {
    expect((await getStreamTextStaticSettings({ ...base, specialMode: 'canvas' })).stopWhenStepCount).toBe(5);
  });

  it('gives XML-parsed custom models a tight retry budget', async () => {
    expect((await getStreamTextStaticSettings({ ...base, isXmlParsedCustomModel: true })).maxRetries).toBe(2);
    expect((await getStreamTextStaticSettings(base)).maxRetries).toBe(10);
  });
});

const catalog = new Map<string, CatalogEntry>();
vi.mock('@/ai/catalog/models', () => ({ getModelEntry: (id: string) => catalog.get(id) }));

function addEntry(provider: ProviderId, modelId: string, overrides: Partial<CatalogEntry>) {
  const id = `${provider}:${modelId}`;
  catalog.set(id, {
    id,
    provider,
    modelId,
    lab: provider,
    label: modelId,
    description: '',
    vision: false,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
    ...overrides,
  });
}

addEntry('openai', 'gpt-5.4', { reasoning: { toggle: false, efforts: ['none', 'low', 'medium', 'high'] } });
addEntry('xai', 'grok-4.20', {
  reasoning: { toggle: true, efforts: [] },
  instantModelId: 'grok-4.20-non-reasoning',
});

describe('getSearchProviderOptions', () => {
  it('keeps the gateway provider allowlist stable', () => {
    expect(getSearchProviderOptions('openai:gpt-5.4').gateway).toEqual({
      only: [
        'openai',
        'google',
        'vertex',
        'zai',
        'arcee-ai',
        'deepseek',
        'alibaba',
        'baseten',
        'minimax',
        'streamlake',
        'fireworks',
        'bedrock',
        'vercel',
        'xai',
        'bytedance',
        'moonshotai',
        'novita',
        'togetherai',
        'inception',
      ],
    });
  });

  it("merges the model's reasoning options into the provider defaults", () => {
    expect(getSearchProviderOptions('openai:gpt-5.4', 'off').openai).toEqual({
      parallelToolCalls: false,
      store: false,
      promptCacheKey: 'zetora-oai',
      reasoningEffort: 'none',
    });
    expect(getSearchProviderOptions('openai:gpt-5.4', 'high').openai).toMatchObject({ reasoningEffort: 'high' });
  });

  it('keeps only the provider defaults for a model outside the catalog', () => {
    const options = getSearchProviderOptions('custom-llamacpp:qwen', 'high');
    expect(options.openai).toEqual({ parallelToolCalls: false, store: false, promptCacheKey: 'zetora-oai' });
    expect(options.anthropic).toEqual({ disableParallelToolUse: true });
  });

  it('tells a thinking/instant pair which upstream model to use', () => {
    expect(getSearchProviderOptions('xai:grok-4.20').zetora).toEqual({ thinking: true });
    expect(getSearchProviderOptions('xai:grok-4.20', 'off').zetora).toEqual({ thinking: false });
  });

  it('makes xAI call tools one at a time', () => {
    expect(getSearchProviderOptions('xai:grok-4.20').xai).toMatchObject({ parallelToolCalls: false });
  });
});
