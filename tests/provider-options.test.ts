import { describe, it, expect } from 'vitest';
import { getSearchProviderOptions, getStreamTextStaticSettings } from '@/lib/search/provider-options';
import { getMaxOutputTokens } from '@/ai/models';

describe('getStreamTextStaticSettings', () => {
  const base = {
    model: 'zetora-default',
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
          specialMode: 'connectors',
          model: 'custom-llamacpp:qwen3.6',
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

  it('sets maxOutputTokens only for the capped models', async () => {
    expect((await getStreamTextStaticSettings(base)).maxOutputTokens).toBe(getMaxOutputTokens('zetora-default'));
    expect((await getStreamTextStaticSettings({ ...base, model: 'zetora-glm-4.6' })).maxOutputTokens).toBe(
      getMaxOutputTokens('zetora-glm-4.6'),
    );
    expect((await getStreamTextStaticSettings({ ...base, model: 'zetora-gpt5' })).maxOutputTokens).toBeUndefined();
  });

  it('never caps output tokens in multi-agent mode', async () => {
    expect(
      (await getStreamTextStaticSettings({ ...base, shouldUseXaiMultiAgent: true })).maxOutputTokens,
    ).toBeUndefined();
  });

  it('adds the 1M-context beta header for anthropic models only', async () => {
    for (const model of [
      'zetora-anthropic',
      'zetora-anthropic-think',
      'zetora-anthropic-sonnet-4.6',
      'zetora-anthropic-sonnet-4.6-think',
      'zetora-anthropic-opus-4.6',
      'zetora-anthropic-opus-4.6-think',
    ]) {
      expect((await getStreamTextStaticSettings({ ...base, model })).headers).toEqual({
        'anthropic-beta': 'context-1m-2025-08-07',
      });
    }
    expect((await getStreamTextStaticSettings(base)).headers).toBeUndefined();
  });
});

describe('getSearchProviderOptions', () => {
  it('keeps the gateway provider allowlist stable', () => {
    const options = getSearchProviderOptions('zetora-default', false);
    expect(options.gateway.only).toEqual([
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
    ]);
    expect(options.gateway).not.toHaveProperty('order');
  });

  it('pins gateway order per model family', () => {
    expect(getSearchProviderOptions('zetora-kimi-k2-v2-thinking', false).gateway).toMatchObject({
      order: ['moonshotai'],
    });
    for (const model of ['zetora-qwen-coder', 'zetora-qwen-235']) {
      expect(getSearchProviderOptions(model, false).gateway).toMatchObject({ order: ['baseten'] });
    }
    expect(getSearchProviderOptions('zetora-nova-2-lite', false).gateway).toMatchObject({ order: ['bedrock'] });
    expect(getSearchProviderOptions('zetora-kat-coder', false).gateway).toMatchObject({ order: ['streamlake'] });
    expect(getSearchProviderOptions('zetora-glm-4.7', false).gateway).toMatchObject({ order: ['zai'] });
    expect(getSearchProviderOptions('zetora-kimi-k2.5', false).gateway).toMatchObject({ order: ['fireworks'] });
  });

  it('enables anthropic thinking budgets for the -think models', () => {
    expect(getSearchProviderOptions('zetora-anthropic-think', false).anthropic).toMatchObject({
      sendReasoning: true,
      thinking: { type: 'enabled', budgetTokens: 4000 },
      disableParallelToolUse: true,
    });
    expect(getSearchProviderOptions('zetora-anthropic-sonnet-4.6-think', false).anthropic).toMatchObject({
      thinking: { type: 'adaptive' },
      effort: 'medium',
    });
    expect(getSearchProviderOptions('zetora-anthropic', false).anthropic).toEqual({
      disableParallelToolUse: true,
    });
  });

  it('enables google thinkingConfig for the -think models', () => {
    expect(getSearchProviderOptions('zetora-gemini-3.8-flash-think', false).google).toMatchObject({
      thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
    });
    expect(getSearchProviderOptions('zetora-gemini-3.1-pro', false, 'high').google).toMatchObject({
      thinkingConfig: { thinkingLevel: 'high', includeThoughts: true },
    });
    expect(getSearchProviderOptions('zetora-gemini-3.8-flash', false).google).toEqual({ threshold: 'OFF' });
    expect(getSearchProviderOptions('zetora-default', false).google).toEqual({ threshold: 'OFF' });
  });

  it('enables vertex thinkingConfig for the Agent Platform -think models', () => {
    expect(getSearchProviderOptions('zetora-vertex-gemini-3.8-flash-think', false).vertex).toMatchObject({
      thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
    });
    expect(getSearchProviderOptions('zetora-vertex-gemini-3.5-flash-think', false, 'off').vertex).toMatchObject({
      thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false },
    });
    expect(getSearchProviderOptions('zetora-vertex-gemini-3.8-flash', false).vertex).toEqual({ threshold: 'OFF' });
  });

  it("maps 'off' to each Gemini model's lowest accepted thinking level", () => {
    expect(getSearchProviderOptions('zetora-gemini-3.5-flash-think', false, 'off').google).toMatchObject({
      thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false },
    });
    expect(getSearchProviderOptions('zetora-gemini-3.8-flash-think', false, 'off').google).toMatchObject({
      thinkingConfig: { thinkingLevel: 'low', includeThoughts: false },
    });
  });

  it('flips every xai parallel-call flag with multi-agent mode', () => {
    expect(getSearchProviderOptions('zetora-default', true).xai).toEqual({
      reasoningEffort: 'high',
      parallel_function_calling: true,
      parallel_tool_calls: true,
      parallelToolCalls: true,
      paralelFunctionCalling: true,
    });
    expect(getSearchProviderOptions('zetora-default', false).xai).toEqual({
      parallel_function_calling: false,
      parallel_tool_calls: false,
      parallelToolCalls: false,
      paralelFunctionCalling: false,
    });
  });

  it('keeps openai parallel tool calls off except for qwen-coder', () => {
    expect(getSearchProviderOptions('zetora-default', false).openai).toMatchObject({ parallelToolCalls: false });
    expect(getSearchProviderOptions('zetora-qwen-coder', false).openai).not.toHaveProperty('parallelToolCalls');
  });

  it('maps gpt-5 reasoning efforts per model tier', () => {
    expect(getSearchProviderOptions('zetora-gpt5-nano', false).openai).toMatchObject({ reasoningEffort: 'minimal' });
    expect(getSearchProviderOptions('zetora-gpt-5.4-thinking-xhigh', false).openai).toMatchObject({
      reasoningEffort: 'xhigh',
      parallelToolCalls: true,
    });
    expect(getSearchProviderOptions('zetora-gpt-5.4', false).openai).toMatchObject({ reasoningEffort: 'none' });
    expect(getSearchProviderOptions('zetora-gpt-5.1-thinking', false).openai).toMatchObject({
      reasoningEffort: 'medium',
    });
  });
});
