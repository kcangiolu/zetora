import { describe, it, expect } from 'vitest';
import { getCustomReasoningOverrides, getCustomProviderOptions, getReasoningCapability } from '@/lib/reasoning-effort';
import { shouldUseNativeCustomProvider, type CustomProviderConfig } from '@/lib/custom-providers';

const providers: CustomProviderConfig[] = [
  { id: 'llama', name: 'Llama', baseURL: 'https://llama.example/v1', backendKind: 'llamacpp' },
  { id: 'olla', name: 'Ollama', baseURL: 'https://olla.example/v1', backendKind: 'ollama' },
  { id: 'vllm', name: 'vLLM', baseURL: 'https://vllm.example/v1', backendKind: 'vllm' },
  { id: 'oai', name: 'OpenAI-compat', baseURL: 'https://oai.example/v1', backendKind: 'openai' },
  { id: 'mystery', name: 'Mystery', baseURL: 'https://mystery.example/v1', backendKind: 'unknown' },
];

describe('getCustomReasoningOverrides', () => {
  it('is a no-op for non-custom models regardless of effort', () => {
    expect(getCustomReasoningOverrides('zetora-default', 'high', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
    });
  });

  it('llama.cpp: sends enable_thinking + thinking_budget_tokens at the top level, always masks', () => {
    // /completion never separates <think> from the answer on its own (unlike
    // the OpenAI-compatible endpoint's --reasoning-format) — masking must run
    // whenever the model might reason, including at 'auto' where no
    // enable_thinking override is sent at all.
    expect(getCustomReasoningOverrides('custom-llama-qwen3', 'auto', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: true,
      backendKind: 'llamacpp',
      usingNative: true,
    });

    const result = getCustomReasoningOverrides('custom-llama-qwen3', 'high', providers);
    // Top level, not nested under chat_template_kwargs: /completion never
    // applies chat templates server-side (the prompt is already rendered
    // client-side), so enable_thinking only does anything read directly off
    // providerOptions — see ai/native-models/llamacpp-model.ts.
    expect(result).toEqual({
      providerOptions: {
        llama: { enable_thinking: true, thinking_budget_tokens: 4096 },
      },
      applyMaskMiddleware: true,
      backendKind: 'llamacpp',
      usingNative: true,
    });

    const off = getCustomReasoningOverrides('custom-llama-qwen3', 'off', providers);
    expect(off.providerOptions.llama).toMatchObject({ enable_thinking: false });
    expect(off.applyMaskMiddleware).toBe(true);
  });

  it('ollama: sends a real think boolean, never masks — even for off', () => {
    expect(getCustomReasoningOverrides('custom-olla-qwen3', 'medium', providers)).toEqual({
      providerOptions: { olla: { think: true } },
      applyMaskMiddleware: false,
      backendKind: 'ollama',
      usingNative: true,
    });
    expect(getCustomReasoningOverrides('custom-olla-qwen3', 'off', providers)).toEqual({
      providerOptions: { olla: { think: false } },
      applyMaskMiddleware: false,
      backendKind: 'ollama',
      usingNative: true,
    });
  });

  it('vllm/openai: sends reasoning_effort for on tiers, masks instead of guessing for off', () => {
    expect(getCustomReasoningOverrides('custom-vllm-qwen3', 'low', providers)).toEqual({
      providerOptions: { vllm: { reasoning_effort: 'low' } },
      applyMaskMiddleware: false,
      backendKind: 'vllm',
      usingNative: false,
    });
    expect(getCustomReasoningOverrides('custom-vllm-qwen3', 'off', providers)).toEqual({
      providerOptions: { vllm: { chat_template_kwargs: { enable_thinking: false } } },
      applyMaskMiddleware: true,
      backendKind: 'vllm',
      usingNative: false,
    });
    expect(getCustomReasoningOverrides('custom-oai-qwen3', 'high', providers)).toEqual({
      providerOptions: { oai: { reasoning_effort: 'high' } },
      applyMaskMiddleware: false,
      backendKind: 'openai',
      usingNative: false,
    });
  });

  it('unknown backend: no real control, only masks when off', () => {
    expect(getCustomReasoningOverrides('custom-mystery-qwen3', 'high', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
      backendKind: 'unknown',
      usingNative: false,
    });
    expect(getCustomReasoningOverrides('custom-mystery-qwen3', 'off', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: true,
      backendKind: 'unknown',
      usingNative: false,
    });
  });

  it('unresolvable provider id: falls back to mask-only for off', () => {
    expect(getCustomReasoningOverrides('custom-ghost-qwen3', 'off', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: true,
      usingNative: false,
    });
  });

  it('enrichedShim demotes llamacpp/ollama to the generic reasoning_effort shape, not the native one', () => {
    const enrichedProviders: CustomProviderConfig[] = [
      { id: 'llama', name: 'Llama', baseURL: 'https://llama.example/v1', backendKind: 'llamacpp', enrichedShim: true },
      { id: 'olla', name: 'Ollama', baseURL: 'https://olla.example/v1', backendKind: 'ollama', enrichedShim: true },
    ];
    expect(getCustomReasoningOverrides('custom-llama-qwen3', 'high', enrichedProviders)).toEqual({
      providerOptions: { llama: { reasoning_effort: 'high' } },
      applyMaskMiddleware: false,
      backendKind: 'llamacpp',
      usingNative: false,
    });
    expect(getCustomReasoningOverrides('custom-olla-qwen3', 'high', enrichedProviders)).toEqual({
      providerOptions: { olla: { reasoning_effort: 'high' } },
      applyMaskMiddleware: false,
      backendKind: 'ollama',
      usingNative: false,
    });
  });

  it('a turn with images demotes a native-eligible llamacpp provider the same way enrichedShim does', () => {
    expect(getCustomReasoningOverrides('custom-llama-qwen3', 'high', providers, true)).toEqual({
      providerOptions: { llama: { reasoning_effort: 'high' } },
      applyMaskMiddleware: false,
      backendKind: 'llamacpp',
      usingNative: false,
    });
  });
});

describe('shouldUseNativeCustomProvider', () => {
  it('is true only for llamacpp/ollama, with no enrichedShim and no images', () => {
    expect(shouldUseNativeCustomProvider('llamacpp', undefined, false)).toBe(true);
    expect(shouldUseNativeCustomProvider('ollama', undefined, false)).toBe(true);
    expect(shouldUseNativeCustomProvider('vllm', undefined, false)).toBe(false);
    expect(shouldUseNativeCustomProvider('openai', undefined, false)).toBe(false);
    expect(shouldUseNativeCustomProvider('unknown', undefined, false)).toBe(false);
    expect(shouldUseNativeCustomProvider(undefined, undefined, false)).toBe(false);
  });

  it('enrichedShim opts a llamacpp/ollama provider back out of native routing', () => {
    expect(shouldUseNativeCustomProvider('llamacpp', true, false)).toBe(false);
    expect(shouldUseNativeCustomProvider('ollama', true, false)).toBe(false);
  });

  it('an image-bearing turn always routes to the shim, regardless of enrichedShim', () => {
    expect(shouldUseNativeCustomProvider('llamacpp', false, true)).toBe(false);
    expect(shouldUseNativeCustomProvider('llamacpp', undefined, true)).toBe(false);
  });
});

describe('getCustomProviderOptions', () => {
  const providersWithNativeParams: CustomProviderConfig[] = [
    {
      id: 'vllm',
      name: 'vLLM',
      baseURL: 'https://vllm.example/v1',
      backendKind: 'vllm',
      nativeParams: { guided_json: true, top_k: 40 },
    },
  ];

  it('merges nativeParams into providerOptions even when effort is auto', () => {
    expect(getCustomProviderOptions('custom-vllm-qwen3', 'auto', providersWithNativeParams)).toEqual({
      providerOptions: { vllm: { guided_json: true, top_k: 40 } },
      applyMaskMiddleware: false,
      backendKind: 'vllm',
      usingNative: false,
    });
  });

  it('lets a reasoning-tier override win over a colliding nativeParams key', () => {
    const collidingProviders: CustomProviderConfig[] = [
      {
        id: 'vllm',
        name: 'vLLM',
        baseURL: 'https://vllm.example/v1',
        backendKind: 'vllm',
        nativeParams: { reasoning_effort: 'low', top_k: 40 },
      },
    ];
    expect(getCustomProviderOptions('custom-vllm-qwen3', 'high', collidingProviders)).toEqual({
      providerOptions: { vllm: { reasoning_effort: 'high', top_k: 40 } },
      applyMaskMiddleware: false,
      backendKind: 'vllm',
      usingNative: false,
    });
  });

  it('omits the provider key entirely when there is nothing to merge', () => {
    expect(getCustomProviderOptions('custom-mystery-qwen3', 'auto', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
      backendKind: 'unknown',
      usingNative: false,
    });
  });

  it('still masks off-tier reasoning for vLLM alongside nativeParams, on top of the real disable switch', () => {
    const result = getCustomProviderOptions('custom-vllm-qwen3', 'off', providersWithNativeParams);
    expect(result.applyMaskMiddleware).toBe(true);
    expect(result.providerOptions).toEqual({
      vllm: { guided_json: true, top_k: 40, chat_template_kwargs: { enable_thinking: false } },
    });
  });
});

describe('getReasoningCapability', () => {
  it('reports full control only for the openai backend kind', () => {
    expect(getReasoningCapability('custom-oai-qwen3', providers)).toBe('full');
  });

  it('reports binary-guaranteed for native llama.cpp/Ollama — real on/off, no real levels', () => {
    expect(getReasoningCapability('custom-llama-qwen3', providers)).toBe('binary-guaranteed');
    expect(getReasoningCapability('custom-olla-qwen3', providers)).toBe('binary-guaranteed');
  });

  it('reports best-effort for vLLM (always shim) and llama.cpp demoted to the shim', () => {
    expect(getReasoningCapability('custom-vllm-qwen3', providers)).toBe('best-effort');

    const shimmedProviders: CustomProviderConfig[] = providers.map((p) =>
      p.id === 'llama' ? { ...p, enrichedShim: true } : p,
    );
    expect(getReasoningCapability('custom-llama-qwen3', shimmedProviders)).toBe('best-effort');
  });

  it('reports mask-only for Ollama demoted to the shim and for unknown custom backends', () => {
    const shimmedProviders: CustomProviderConfig[] = providers.map((p) =>
      p.id === 'olla' ? { ...p, enrichedShim: true } : p,
    );
    expect(getReasoningCapability('custom-olla-qwen3', shimmedProviders)).toBe('mask-only');
    expect(getReasoningCapability('custom-mystery-qwen3', providers)).toBe('mask-only');
  });
});
