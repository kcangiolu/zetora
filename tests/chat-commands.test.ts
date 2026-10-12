import { describe, it, expect, vi } from 'vitest';
import { parseStartWithCommand } from '@/lib/chat-commands';
import { getStartWithStrategy } from '@/lib/chat-commands-server';
import type { CustomProviderConfig } from '@/lib/custom-providers';

// ai/providers.ts instantiates every provider SDK at import time (gated by
// env keys) — mock it rather than pull that whole graph into a unit test for
// chat-commands-server.ts. Only DeepSeek models reached through DeepSeek's
// own API resolve.
const DIRECT_DEEPSEEK = ['deepseek:deepseek-flash', 'deepseek:deepseek-v4-pro'];
vi.mock('@/ai/providers', () => ({
  getDeepSeekStartWithModel: (modelId: string) => (DIRECT_DEEPSEEK.includes(modelId) ? { mocked: modelId } : null),
}));
vi.mock('@/ai/catalog/models', () => ({
  getModelEntry: (modelId: string) =>
    modelId.includes(':') ? { lab: modelId.slice(0, modelId.indexOf(':')) } : undefined,
}));

describe('parseStartWithCommand', () => {
  it('leaves plain input untouched', () => {
    expect(parseStartWithCommand('hello there')).toEqual({ text: 'hello there' });
  });

  it('strips a leading /startwith "..." and returns the prefix', () => {
    expect(parseStartWithCommand('/startwith "Je voudrais" write a poem')).toEqual({
      text: 'write a poem',
      startWith: 'Je voudrais',
    });
  });

  it('requires quotes and a leading position — ignores it mid-message', () => {
    expect(parseStartWithCommand('/startwith no quotes here')).toEqual({ text: '/startwith no quotes here' });
    expect(parseStartWithCommand('please /startwith "x" this')).toEqual({
      text: 'please /startwith "x" this',
    });
  });
});

describe('getStartWithStrategy', () => {
  const providers: CustomProviderConfig[] = [
    { id: 'llama', name: 'Llama', baseURL: 'https://llama.example/v1', backendKind: 'llamacpp' },
    { id: 'olla', name: 'Ollama', baseURL: 'https://olla.example/v1', backendKind: 'ollama' },
    { id: 'vllm', name: 'vLLM', baseURL: 'https://vllm.example/v1', backendKind: 'vllm' },
  ];

  it('llama.cpp native: supported, forces enable_thinking off', () => {
    expect(getStartWithStrategy('custom-llama-qwen3', providers)).toEqual({
      supported: true,
      providerOptions: { llama: { enable_thinking: false } },
    });
  });

  it('ollama native: supported, forces think off', () => {
    expect(getStartWithStrategy('custom-olla-qwen3', providers)).toEqual({
      supported: true,
      providerOptions: { olla: { think: false } },
    });
  });

  it('anthropic catalog model: supported, disables extended thinking', () => {
    expect(getStartWithStrategy('anthropic:claude-opus-4-6', providers)).toEqual({
      supported: true,
      providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
    });
  });

  it('deepseek direct models: supported, swaps to the beta model, no call-level providerOptions', () => {
    for (const modelId of DIRECT_DEEPSEEK) {
      expect(getStartWithStrategy(modelId, providers)).toEqual({
        supported: true,
        modelOverride: { mocked: modelId },
        assistantMessageProviderOptions: { openaiCompatible: { prefix: true } },
      });
    }
  });

  it('unsupported: vLLM custom backend, unresolvable custom model, gateway-routed deepseek, and other non-anthropic catalog models', () => {
    expect(getStartWithStrategy('custom-vllm-qwen3', providers)).toEqual({ supported: false });
    expect(getStartWithStrategy('custom-ghost-qwen3', providers)).toEqual({ supported: false });
    expect(getStartWithStrategy('deepseek:deepseek-v3.2', providers)).toEqual({ supported: false });
    expect(getStartWithStrategy('xai:grok-4.5', providers)).toEqual({ supported: false });
  });
});
