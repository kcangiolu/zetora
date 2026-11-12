import { describe, it, expect } from 'vitest';
import { getReasoningCapabilityFor, getReasoningProviderOptions } from '@/ai/catalog/reasoning';
import type { ProviderId } from '@/ai/catalog/config';
import type { CatalogEntry, ReasoningSpec } from '@/ai/catalog/types';

function entry(
  provider: ProviderId,
  reasoning: ReasoningSpec | null,
  modelId = 'm',
  extra: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    id: `${provider}:${modelId}`,
    provider,
    modelId,
    lab: provider,
    label: 'M',
    description: '',
    vision: false,
    pdf: false,
    structuredOutput: true,
    reasoning,
    ...extra,
  };
}

describe('getReasoningProviderOptions', () => {
  it('leaves the provider default alone on auto, but asks OpenAI for summaries', () => {
    const gpt = entry('openai', { toggle: false, efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'] });
    expect(getReasoningProviderOptions(gpt, 'auto')).toEqual({
      openai: { reasoningSummary: 'detailed', include: ['reasoning.encrypted_content'] },
    });
  });

  it("turns OpenAI reasoning off with 'none' when the model accepts it", () => {
    const gpt = entry('openai', { toggle: false, efforts: ['none', 'low', 'medium', 'high'] });
    expect(getReasoningProviderOptions(gpt, 'off')).toEqual({ openai: { reasoningEffort: 'none' } });
  });

  it('falls back to the lowest accepted effort when reasoning cannot be turned off', () => {
    const gpt5 = entry('openai', { toggle: false, efforts: ['minimal', 'low', 'medium', 'high'] });
    expect(getReasoningProviderOptions(gpt5, 'off')).toEqual({
      openai: { reasoningEffort: 'minimal', reasoningSummary: 'detailed', include: ['reasoning.encrypted_content'] },
    });
  });

  it('picks the nearest effort the model and the SDK both accept', () => {
    const grok = entry('xai', { toggle: false, efforts: ['low', 'medium', 'high', 'xhigh'] });
    expect(getReasoningProviderOptions(grok, 'medium')).toEqual({ xai: { reasoningEffort: 'high' } });
    const deepseek = entry('deepseek', { toggle: true, efforts: ['low', 'high', 'max'] });
    expect(getReasoningProviderOptions(deepseek, 'medium')).toEqual({
      deepseek: { thinking: { type: 'enabled' }, reasoningEffort: 'high' },
    });
    expect(getReasoningProviderOptions(deepseek, 'off')).toEqual({ deepseek: { thinking: { type: 'disabled' } } });
  });

  it('drives effort-based Claude adaptively and budget-based Claude with a budget', () => {
    const opus = entry('anthropic', { toggle: false, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] });
    expect(getReasoningProviderOptions(opus, 'low')).toEqual({
      anthropic: { sendReasoning: true, thinking: { type: 'adaptive', display: 'summarized' }, effort: 'low' },
    });
    expect(getReasoningProviderOptions(opus, 'off')).toEqual({ anthropic: { thinking: { type: 'disabled' } } });
    const sonnet45 = entry('anthropic', { toggle: false, efforts: [], budget: { min: 1024 } });
    expect(getReasoningProviderOptions(sonnet45, 'high')).toEqual({
      anthropic: { sendReasoning: true, thinking: { type: 'enabled', budgetTokens: 16000 } },
    });
  });

  it("hides Gemini's thoughts at its lowest level when thinking cannot be disabled", () => {
    const gemini = entry('vertex', { toggle: false, efforts: ['low', 'medium', 'high'] });
    expect(getReasoningProviderOptions(gemini, 'off')).toEqual({
      vertex: { thinkingConfig: { thinkingLevel: 'low', includeThoughts: false } },
    });
  });

  it("speaks each provider's own dialect for the same model", () => {
    const glm = { toggle: true, efforts: [] };
    expect(getReasoningProviderOptions(entry('zhipu', glm), 'off')).toEqual({
      zai: { thinking: { type: 'disabled' } },
    });
    expect(getReasoningProviderOptions(entry('novita', glm, 'zai-org/m'), 'off')).toEqual({
      novita: { enable_thinking: false },
    });
    expect(getReasoningProviderOptions(entry('openrouter', glm, 'z-ai/m'), 'off')).toEqual({
      openrouter: { reasoning: { enabled: false } },
    });
  });

  it("keys the AI Gateway's options by the upstream vendor of the model", () => {
    expect(getReasoningProviderOptions(entry('gateway', { toggle: true, efforts: [] }, 'zai/m'), 'off')).toEqual({
      zai: { thinking: { type: 'disabled' } },
    });
  });

  it('asks Groq for medium effort on auto, since its default does not think', () => {
    const qwen = entry('groq', { toggle: false, efforts: ['none', 'low', 'medium', 'high'] }, 'qwen/m');
    expect(getReasoningProviderOptions(qwen, 'auto')).toEqual({
      groq: { reasoningEffort: 'medium', reasoningFormat: 'parsed' },
    });
  });

  it('sends no thinking switch to a thinking/instant pair turned off', () => {
    const pair = entry('xai', { toggle: true, efforts: [] }, 'm', { instantModelId: 'i' });
    expect(getReasoningProviderOptions(pair, 'off')).toEqual({});
  });

  it('is empty for a model that does not reason', () => {
    expect(getReasoningProviderOptions(entry('openai', null), 'high')).toEqual({});
  });
});

describe('getReasoningCapabilityFor', () => {
  it('classifies the toggle shown for a model', () => {
    const capability = (reasoning: ReasoningSpec | null) => getReasoningCapabilityFor(entry('openai', reasoning));
    expect(capability(null)).toBeNull();
    expect(capability({ toggle: false, efforts: ['low', 'high'] })).toBe('full');
    expect(capability({ toggle: false, efforts: [], budget: { min: 1024 } })).toBe('full');
    expect(capability({ toggle: true, efforts: [] })).toBe('binary-guaranteed');
    expect(capability({ toggle: false, efforts: ['none', 'high'] })).toBe('binary-guaranteed');
    expect(capability({ toggle: false, efforts: [] })).toBeNull();
  });
});
