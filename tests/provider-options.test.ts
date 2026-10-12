import { describe, it, expect, vi } from 'vitest';
import type { CatalogEntry } from '@/ai/catalog/types';
import { getSearchProviderOptions, getStreamTextStaticSettings } from '@/lib/search/provider-options';

describe('getStreamTextStaticSettings', () => {
  const base = {
    specialMode: undefined,
    shouldUseXaiMultiAgent: false,
    isXmlParsedCustomModel: false,
  };

  it('uses 5 steps in multi-agent mode', async () => {
    expect((await getStreamTextStaticSettings({ ...base, shouldUseXaiMultiAgent: true })).stopWhenStepCount).toBe(5);
  });

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

function entry(id: string, overrides: Partial<CatalogEntry>): CatalogEntry {
  return {
    id,
    lab: id.slice(0, id.indexOf(':')),
    label: id,
    description: '',
    vision: false,
    pdf: false,
    structuredOutput: true,
    reasoning: null,
    routes: [{ host: 'direct', modelId: id.slice(id.indexOf(':') + 1) }],
    ...overrides,
  };
}

catalog.set(
  'openai:gpt-5.4',
  entry('openai:gpt-5.4', { reasoning: { toggle: false, efforts: ['none', 'low', 'medium', 'high'] } }),
);
catalog.set(
  'xai:grok-4.20',
  entry('xai:grok-4.20', {
    reasoning: { toggle: true, efforts: [] },
    instantRoutes: [{ host: 'direct', modelId: 'grok-4.20-non-reasoning' }],
  }),
);

describe('getSearchProviderOptions', () => {
  it('keeps the gateway provider allowlist stable', () => {
    expect(getSearchProviderOptions('openai:gpt-5.4', false).gateway).toEqual({
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
    expect(getSearchProviderOptions('openai:gpt-5.4', false, 'off').openai).toEqual({
      parallelToolCalls: false,
      store: false,
      promptCacheKey: 'zetora-oai',
      reasoningEffort: 'none',
    });
    expect(getSearchProviderOptions('openai:gpt-5.4', false, 'high').openai).toMatchObject({ reasoningEffort: 'high' });
  });

  it('keeps only the provider defaults for a model outside the catalog', () => {
    const options = getSearchProviderOptions('custom-llamacpp:qwen', false, 'high');
    expect(options.openai).toEqual({ parallelToolCalls: false, store: false, promptCacheKey: 'zetora-oai' });
    expect(options.anthropic).toEqual({ disableParallelToolUse: true });
  });

  it('tells a thinking/instant pair which upstream model to use', () => {
    expect(getSearchProviderOptions('xai:grok-4.20', false).zetora).toEqual({ thinking: true });
    expect(getSearchProviderOptions('xai:grok-4.20', false, 'off').zetora).toEqual({ thinking: false });
  });

  it('lets multi-agent xAI call tools in parallel, never otherwise', () => {
    expect(getSearchProviderOptions('xai:grok-4.20', true).xai).toMatchObject({
      parallelToolCalls: true,
      reasoningEffort: 'high',
    });
    expect(getSearchProviderOptions('xai:grok-4.20', false).xai).toMatchObject({ parallelToolCalls: false });
  });
});
