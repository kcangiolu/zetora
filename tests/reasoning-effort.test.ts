import { describe, it, expect } from 'vitest';
import { getCustomReasoningOverrides, getCustomProviderOptions, getReasoningCapability } from '@/lib/reasoning-effort';
import type { CustomProviderConfig } from '@/lib/custom-providers';

const providers: CustomProviderConfig[] = [
  { id: 'llama', name: 'Llama', baseURL: 'https://llama.example/v1', backendKind: 'llamacpp' },
  { id: 'olla', name: 'Ollama', baseURL: 'https://olla.example/v1', backendKind: 'ollama' },
  { id: 'vllm', name: 'vLLM', baseURL: 'https://vllm.example/v1', backendKind: 'vllm' },
  { id: 'oai', name: 'OpenAI-compat', baseURL: 'https://oai.example/v1', backendKind: 'openai' },
  { id: 'mystery', name: 'Mystery', baseURL: 'https://mystery.example/v1', backendKind: 'unknown' },
];

describe('getCustomReasoningOverrides', () => {
  it('is a no-op for auto effort or non-custom models', () => {
    expect(getCustomReasoningOverrides('custom-llama-qwen3', 'auto', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
    });
    expect(getCustomReasoningOverrides('zetora-default', 'high', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
    });
  });

  it('llama.cpp: sends chat_template_kwargs + thinking_budget_tokens, never masks', () => {
    const result = getCustomReasoningOverrides('custom-llama-qwen3', 'high', providers);
    expect(result).toEqual({
      providerOptions: {
        llama: { chat_template_kwargs: { enable_thinking: true }, thinking_budget_tokens: 4096 },
      },
      applyMaskMiddleware: false,
    });

    const off = getCustomReasoningOverrides('custom-llama-qwen3', 'off', providers);
    expect(off.providerOptions.llama).toMatchObject({ chat_template_kwargs: { enable_thinking: false } });
    expect(off.applyMaskMiddleware).toBe(false);
  });

  it('ollama: sends a real think boolean, never masks — even for off', () => {
    expect(getCustomReasoningOverrides('custom-olla-qwen3', 'medium', providers)).toEqual({
      providerOptions: { olla: { think: true } },
      applyMaskMiddleware: false,
    });
    expect(getCustomReasoningOverrides('custom-olla-qwen3', 'off', providers)).toEqual({
      providerOptions: { olla: { think: false } },
      applyMaskMiddleware: false,
    });
  });

  it('vllm/openai: sends reasoning_effort for on tiers, masks instead of guessing for off', () => {
    expect(getCustomReasoningOverrides('custom-vllm-qwen3', 'low', providers)).toEqual({
      providerOptions: { vllm: { reasoning_effort: 'low' } },
      applyMaskMiddleware: false,
    });
    expect(getCustomReasoningOverrides('custom-vllm-qwen3', 'off', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: true,
    });
    expect(getCustomReasoningOverrides('custom-oai-qwen3', 'high', providers)).toEqual({
      providerOptions: { oai: { reasoning_effort: 'high' } },
      applyMaskMiddleware: false,
    });
  });

  it('unknown backend: no real control, only masks when off', () => {
    expect(getCustomReasoningOverrides('custom-mystery-qwen3', 'high', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
    });
    expect(getCustomReasoningOverrides('custom-mystery-qwen3', 'off', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: true,
    });
  });

  it('unresolvable provider id: falls back to mask-only for off', () => {
    expect(getCustomReasoningOverrides('custom-ghost-qwen3', 'off', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: true,
    });
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
    });
  });

  it('omits the provider key entirely when there is nothing to merge', () => {
    expect(getCustomProviderOptions('custom-mystery-qwen3', 'auto', providers)).toEqual({
      providerOptions: {},
      applyMaskMiddleware: false,
    });
  });

  it('still masks off-tier reasoning for backends with no real control, alongside nativeParams', () => {
    const result = getCustomProviderOptions('custom-vllm-qwen3', 'off', providersWithNativeParams);
    expect(result.applyMaskMiddleware).toBe(true);
    expect(result.providerOptions).toEqual({ vllm: { guided_json: true, top_k: 40 } });
  });
});

describe('getReasoningCapability', () => {
  it('reports full control for llamacpp/ollama/vllm/openai custom backends', () => {
    for (const id of ['custom-llama-qwen3', 'custom-olla-qwen3', 'custom-vllm-qwen3', 'custom-oai-qwen3']) {
      expect(getReasoningCapability(id, providers)).toBe('full');
    }
  });

  it('reports mask-only for unknown custom backends', () => {
    expect(getReasoningCapability('custom-mystery-qwen3', providers)).toBe('mask-only');
  });
});
