import { describe, it, expect } from 'vitest';
import { getReasoningCapabilityFor, getReasoningProviderOptions } from '@/ai/catalog/reasoning';
import type { CatalogEntry, CatalogRoute, ReasoningSpec } from '@/ai/catalog/types';

function entry(
  lab: string,
  reasoning: ReasoningSpec | null,
  routes: CatalogRoute[],
  extra: Partial<CatalogEntry> = {},
) {
  return {
    id: `${lab}:m`,
    lab,
    label: 'M',
    description: '',
    vision: false,
    pdf: false,
    structuredOutput: true,
    reasoning,
    routes,
    ...extra,
  } satisfies CatalogEntry;
}

const direct: CatalogRoute = { host: 'direct', modelId: 'm' };

describe('getReasoningProviderOptions', () => {
  it('leaves the provider default alone on auto, but asks OpenAI for summaries', () => {
    const gpt = entry('openai', { toggle: false, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] }, [
      direct,
    ]);
    expect(getReasoningProviderOptions(gpt, 'auto')).toEqual({
      openai: { reasoningSummary: 'detailed', include: ['reasoning.encrypted_content'] },
    });
  });

  it("turns OpenAI reasoning off with 'none' when the model accepts it", () => {
    const gpt = entry('openai', { toggle: false, efforts: ['none', 'low', 'medium', 'high'] }, [direct]);
    expect(getReasoningProviderOptions(gpt, 'off')).toEqual({ openai: { reasoningEffort: 'none' } });
  });

  it('falls back to the lowest accepted effort when reasoning cannot be turned off', () => {
    const gpt5 = entry('openai', { toggle: false, efforts: ['minimal', 'low', 'medium', 'high'] }, [direct]);
    expect(getReasoningProviderOptions(gpt5, 'off')).toEqual({
      openai: { reasoningEffort: 'minimal', reasoningSummary: 'detailed', include: ['reasoning.encrypted_content'] },
    });
  });

  it('picks the nearest effort the model and the SDK both accept', () => {
    const grok = entry('xai', { toggle: false, efforts: ['low', 'medium', 'high', 'xhigh'] }, [direct]);
    expect(getReasoningProviderOptions(grok, 'medium')).toEqual({ xai: { reasoningEffort: 'high' } });
    const deepseek = entry('deepseek', { toggle: true, efforts: ['low', 'high', 'max'] }, [direct]);
    expect(getReasoningProviderOptions(deepseek, 'medium')).toEqual({
      deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
    });
    expect(getReasoningProviderOptions(deepseek, 'off')).toEqual({ deepseek: { thinking: { type: 'disabled' } } });
  });

  it('drives effort-based Claude adaptively and budget-based Claude with a budget', () => {
    const opus = entry('anthropic', { toggle: false, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }, [direct]);
    expect(getReasoningProviderOptions(opus, 'low')).toEqual({
      anthropic: { sendReasoning: true, thinking: { type: 'adaptive', display: 'summarized' }, effort: 'low' },
    });
    expect(getReasoningProviderOptions(opus, 'off')).toEqual({ anthropic: { thinking: { type: 'disabled' } } });
    const sonnet45 = entry('anthropic', { toggle: false, efforts: [], budget: { min: 1024 } }, [direct]);
    expect(getReasoningProviderOptions(sonnet45, 'high')).toEqual({
      anthropic: { sendReasoning: true, thinking: { type: 'enabled', budgetTokens: 16000 } },
    });
  });

  it("hides Gemini's thoughts at its lowest level when thinking cannot be disabled", () => {
    const gemini = entry('vertex', { toggle: false, efforts: ['low', 'medium', 'high'] }, [
      direct,
      { host: 'gateway', modelId: 'google/m' },
    ]);
    expect(getReasoningProviderOptions(gemini, 'off')).toEqual({
      vertex: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: false } },
      google: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: false } },
    });
  });

  it('speaks each route its own dialect', () => {
    const glm = entry('zhipu', { toggle: true, efforts: [] }, [
      { host: 'novita', modelId: 'zai-org/m' },
      { host: 'gateway', modelId: 'zai/m' },
      { host: 'openrouter', modelId: 'z-ai/m' },
    ]);
    expect(getReasoningProviderOptions(glm, 'off')).toEqual({
      novita: { enable_thinking: false },
      zai: { thinking: { type: 'disabled' } },
      openrouter: { reasoning: { enabled: false } },
    });
  });

  it('asks Groq for medium effort on auto, since its default does not think', () => {
    const qwen = entry('alibaba', { toggle: false, efforts: ['none', 'low', 'medium', 'high'] }, [
      { host: 'groq', modelId: 'qwen/m' },
    ]);
    expect(getReasoningProviderOptions(qwen, 'auto')).toEqual({
      groq: { reasoningEffort: 'medium', reasoningFormat: 'parsed' },
    });
  });

  it('sends no thinking switch to a thinking/instant pair turned off', () => {
    const pair = entry('xai', { toggle: true, efforts: [] }, [direct], {
      instantRoutes: [{ host: 'direct', modelId: 'i' }],
    });
    expect(getReasoningProviderOptions(pair, 'off')).toEqual({});
  });

  it('is empty for a model that does not reason', () => {
    expect(getReasoningProviderOptions(entry('openai', null, [direct]), 'high')).toEqual({});
  });
});

describe('getReasoningCapabilityFor', () => {
  it('classifies the toggle shown for a model', () => {
    const capability = (reasoning: ReasoningSpec | null) => getReasoningCapabilityFor(entry('x', reasoning, [direct]));
    expect(capability(null)).toBeNull();
    expect(capability({ toggle: false, efforts: ['low', 'high'] })).toBe('full');
    expect(capability({ toggle: false, efforts: [], budget: { min: 1024 } })).toBe('full');
    expect(capability({ toggle: true, efforts: [] })).toBe('binary-guaranteed');
    expect(capability({ toggle: false, efforts: ['none', 'high'] })).toBe('binary-guaranteed');
    expect(capability({ toggle: false, efforts: [] })).toBeNull();
  });
});
