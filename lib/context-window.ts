import 'server-only';

import { getContextWindow as getCatalogContextWindow } from '@/ai/catalog/models';
import {
  fetchCustomProvider,
  deriveRootURL,
  getCustomProviders,
  parseCustomModelId,
  type CustomProviderConfig,
} from '@/lib/custom-providers';
import { createLogger } from '@/lib/logger';

const log = createLogger('context-window');

// Conservative fallback for custom backends we can't probe (vLLM, unknown,
// or a probe that failed/timed out) — smaller than most local defaults so a
// bad detection errs toward pruning too much rather than overflowing.
export const DEFAULT_CUSTOM_CONTEXT_WINDOW = 8_192;

const CONTEXT_WINDOW_CACHE_TTL_MS = 5 * 60 * 1000; // same TTL as the other custom-provider caches
const contextWindowCache = new Map<string, { value: number; expiresAt: number }>();

// Best-effort, never throws — same guarantee as detectModelVision() in
// lib/custom-providers.ts, which this mirrors.
async function probeCustomContextWindow(provider: CustomProviderConfig, modelName: string): Promise<number> {
  const { backendKind } = provider;
  try {
    if (backendKind === 'llamacpp') {
      const root = deriveRootURL(provider.baseURL);
      const res = await fetchCustomProvider(`${root}/props`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        // Recent llama-server nests this under default_generation_settings;
        // older builds exposed n_ctx at the root — check both.
        const n = body?.default_generation_settings?.n_ctx ?? body?.n_ctx;
        if (typeof n === 'number' && n > 0) return n;
      }
    } else if (backendKind === 'ollama') {
      const root = deriveRootURL(provider.baseURL);
      const res = await fetchCustomProvider(`${root}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        const modelInfo = body?.model_info;
        if (modelInfo && typeof modelInfo === 'object') {
          // The key is prefixed by the model's architecture
          // (llama.context_length, qwen2.context_length, ...) — no fixed name.
          const key = Object.keys(modelInfo).find((k) => /\.context_length$/i.test(k));
          const n = key ? modelInfo[key] : undefined;
          if (typeof n === 'number' && n > 0) return n;
        }
      }
    } else {
      // vllm/openai/unknown: no native metadata route to probe, but some
      // OpenAI-compatible servers (OpenRouter, some vLLM builds) enrich the
      // standard /models list with a context-length field — same endpoint
      // detectModels() already calls for the model picker.
      const url = `${provider.baseURL.replace(/\/$/, '')}/models`;
      const res = await fetchCustomProvider(url, {
        headers: { Authorization: `Bearer ${provider.apiKey ?? 'not-needed'}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        const entry = Array.isArray(body?.data) ? body.data.find((m: { id?: string }) => m.id === modelName) : null;
        const n = entry?.context_length ?? entry?.top_provider?.context_length ?? entry?.max_model_len;
        if (typeof n === 'number' && n > 0) return n;
      }
    }
  } catch (err) {
    log.warn(`[context-window] Probe failed for ${modelName} (${backendKind ?? 'unknown'}):`, err);
  }
  return DEFAULT_CUSTOM_CONTEXT_WINDOW;
}

async function getCustomContextWindowCached(provider: CustomProviderConfig, modelName: string): Promise<number> {
  const cacheKey = `${provider.id}::${modelName}`;
  const cached = contextWindowCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await probeCustomContextWindow(provider, modelName);
  contextWindowCache.set(cacheKey, { value, expiresAt: Date.now() + CONTEXT_WINDOW_CACHE_TTL_MS });
  return value;
}

// Resolves the real context window for any model id — catalog or custom
// (`custom-{providerId}-{modelName}`). Never throws: any failure (unknown
// model, unreachable backend, malformed response) falls back to a
// conservative default rather than blocking the request.
export async function resolveContextWindow(modelId: string, userId?: string): Promise<number> {
  if (!modelId.startsWith('custom-')) {
    return getCatalogContextWindow(modelId);
  }

  try {
    const providers = await getCustomProviders(userId);
    const parsed = parseCustomModelId(modelId, providers);
    if (!parsed) return DEFAULT_CUSTOM_CONTEXT_WINDOW;
    return await getCustomContextWindowCached(parsed.provider, parsed.modelName);
  } catch (err) {
    log.warn(`[context-window] Failed to resolve context window for ${modelId}:`, err);
    return DEFAULT_CUSTOM_CONTEXT_WINDOW;
  }
}
