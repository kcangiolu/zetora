import { describe, it, expect, vi, afterEach } from 'vitest';

const mockGetCustomProviders = vi.fn();

vi.mock('@/lib/custom-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/custom-providers')>();
  return {
    ...actual,
    getCustomProviders: (...args: unknown[]) => mockGetCustomProviders(...args),
  };
});

import { resolveContextWindow, DEFAULT_CUSTOM_CONTEXT_WINDOW } from '@/lib/context-window';
import { getContextWindow } from '@/ai/models';
import type { CustomProviderConfig } from '@/lib/custom-providers';

function stubFetchOnce(response: { ok: boolean; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const llamaProvider: CustomProviderConfig = {
  id: 'local-llama',
  name: 'Local llama.cpp',
  baseURL: 'http://localhost:8080/v1',
  backendKind: 'llamacpp',
};

const ollamaProvider: CustomProviderConfig = {
  id: 'local-ollama',
  name: 'Local Ollama',
  baseURL: 'http://localhost:11434/v1',
  backendKind: 'ollama',
};

afterEach(() => {
  vi.unstubAllGlobals();
  mockGetCustomProviders.mockReset();
});

describe('getContextWindow (catalog)', () => {
  it('falls back to DEFAULT_CONTEXT_WINDOW for a catalog model with no explicit contextWindow', () => {
    expect(getContextWindow('zetora-auto')).toBe(128_000);
  });

  it('falls back to DEFAULT_CONTEXT_WINDOW for an unknown model id', () => {
    expect(getContextWindow('does-not-exist')).toBe(128_000);
  });
});

describe('resolveContextWindow (custom providers)', () => {
  it('reads n_ctx from default_generation_settings for llama.cpp', async () => {
    mockGetCustomProviders.mockResolvedValue([llamaProvider]);
    stubFetchOnce({ ok: true, json: async () => ({ default_generation_settings: { n_ctx: 65536 } }) });

    const window = await resolveContextWindow('custom-local-llama-model-a', 'user-1');
    expect(window).toBe(65536);
  });

  it('falls back to a root-level n_ctx for older llama.cpp servers', async () => {
    mockGetCustomProviders.mockResolvedValue([llamaProvider]);
    stubFetchOnce({ ok: true, json: async () => ({ n_ctx: 4096 }) });

    const window = await resolveContextWindow('custom-local-llama-model-b', 'user-1');
    expect(window).toBe(4096);
  });

  it('finds the architecture-prefixed context_length key for Ollama', async () => {
    mockGetCustomProviders.mockResolvedValue([ollamaProvider]);
    stubFetchOnce({
      ok: true,
      json: async () => ({ model_info: { 'qwen2.context_length': 32768, 'qwen2.other_field': 1 } }),
    });

    const window = await resolveContextWindow('custom-local-ollama-model-c', 'user-1');
    expect(window).toBe(32768);
  });

  it('reads context_length from /models for OpenAI-compatible backends (e.g. OpenRouter)', async () => {
    mockGetCustomProviders.mockResolvedValue([
      { id: 'openrouter', name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', backendKind: 'openai' },
    ]);
    stubFetchOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 'other-model', context_length: 32_768 },
          { id: 'anthropic/claude-sonnet', context_length: 200_000, top_provider: { context_length: 200_000 } },
        ],
      }),
    });

    const window = await resolveContextWindow('custom-openrouter-anthropic/claude-sonnet', 'user-1');
    expect(window).toBe(200_000);
  });

  it('falls back to top_provider.context_length or max_model_len when the top-level field is absent', async () => {
    mockGetCustomProviders.mockResolvedValue([
      { id: 'vllm-box', name: 'vLLM box', baseURL: 'http://localhost:8000/v1', backendKind: 'vllm' },
    ]);
    stubFetchOnce({ ok: true, json: async () => ({ data: [{ id: 'mixtral-a', max_model_len: 32_768 }] }) });

    const window = await resolveContextWindow('custom-vllm-box-mixtral-a', 'user-1');
    expect(window).toBe(32_768);
  });

  it('falls back to the default for an unknown backend when /models has no context-length field', async () => {
    mockGetCustomProviders.mockResolvedValue([
      { id: 'vllm-box', name: 'vLLM box', baseURL: 'http://localhost:8000/v1', backendKind: 'vllm' },
    ]);
    const fetchMock = stubFetchOnce({ ok: true, json: async () => ({ data: [{ id: 'mixtral-b' }] }) });

    const window = await resolveContextWindow('custom-vllm-box-mixtral-b', 'user-1');
    expect(window).toBe(DEFAULT_CUSTOM_CONTEXT_WINDOW);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('falls back to the default for an unknown backend when the /models probe fails', async () => {
    mockGetCustomProviders.mockResolvedValue([
      { id: 'vllm-box', name: 'vLLM box', baseURL: 'http://localhost:8000/v1', backendKind: 'vllm' },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const window = await resolveContextWindow('custom-vllm-box-mixtral-c', 'user-1');
    expect(window).toBe(DEFAULT_CUSTOM_CONTEXT_WINDOW);
  });

  it('never throws when the probe fails, falling back to the default', async () => {
    mockGetCustomProviders.mockResolvedValue([llamaProvider]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const window = await resolveContextWindow('custom-local-llama-model-d', 'user-1');
    expect(window).toBe(DEFAULT_CUSTOM_CONTEXT_WINDOW);
  });

  it('falls back to the default when the model id does not match any known provider', async () => {
    mockGetCustomProviders.mockResolvedValue([llamaProvider]);
    const window = await resolveContextWindow('custom-unknown-provider-model', 'user-1');
    expect(window).toBe(DEFAULT_CUSTOM_CONTEXT_WINDOW);
  });

  it('caches the resolved value and only probes once within the TTL', async () => {
    mockGetCustomProviders.mockResolvedValue([llamaProvider]);
    const fetchMock = stubFetchOnce({
      ok: true,
      json: async () => ({ default_generation_settings: { n_ctx: 65536 } }),
    });

    await resolveContextWindow('custom-local-llama-model-e', 'user-1');
    await resolveContextWindow('custom-local-llama-model-e', 'user-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
