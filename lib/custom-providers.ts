import 'server-only';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { serverEnv } from '@/env/server';
import { getUser } from '@/lib/auth-utils';
import { getCachedUserPreferencesByUserId, clearUserPreferencesCache } from '@/lib/user-data-server';
import { upsertUserPreferences } from '@/lib/db/queries';

import { createLogger } from '@/lib/logger';

const log = createLogger('custom-providers');

export interface CustomProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  disableAutoDetect?: boolean;
  // Per-provider anonymization toggle: a custom provider can be a trusted
  // local endpoint (leave off) or a cloud service (turn on) — unlike
  // built-in providers, this can't be inferred, so the user sets it here.
  anonymize?: boolean;
  // Detected inference server kind — governs whether the reasoning-effort
  // toggle can send a real control parameter ('vllm'/'llamacpp') or can only
  // mask the <think> output ('ollama'/'unknown'). Set by detectBackendKind().
  backendKind?: CustomBackendKind;
}

export type CustomBackendKind = 'ollama' | 'vllm' | 'llamacpp' | 'openai' | 'unknown';

export interface CustomModelInfo {
  id: string;
  providerId: string;
  providerName: string;
  modelName: string;
  label: string;
  vision: boolean;
}

// In-memory cache for detected models keyed by baseURL
const modelsCache = new Map<string, { models: string[]; expiresAt: number }>();
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache for per-model vision capability, keyed by providerId::modelName
const visionCache = new Map<string, { vision: boolean; expiresAt: number }>();

// `userId` lets server-to-server callers (e.g. the voice s2s LLM stage, which
// authenticates via a Bearer token instead of a browser session cookie) pass
// the already-resolved user in directly — otherwise getUser() reads the
// request's cookies via next/headers and silently sees no one signed in.
export async function getCustomProviders(userId?: string): Promise<CustomProviderConfig[]> {
  const providers: CustomProviderConfig[] = [];

  // Env var source (shared across all users)
  if (serverEnv.CUSTOM_AI_PROVIDERS) {
    try {
      const parsed = JSON.parse(serverEnv.CUSTOM_AI_PROVIDERS);
      if (Array.isArray(parsed)) {
        providers.push(...(parsed as CustomProviderConfig[]));
      }
    } catch {
      log.warn('[custom-providers] Failed to parse CUSTOM_AI_PROVIDERS env var');
    }
  }

  // DB source (per-user)
  const resolvedUserId = userId ?? (await getUser())?.id;
  if (resolvedUserId) {
    const prefs = await getCachedUserPreferencesByUserId(resolvedUserId);
    const dbProviders = prefs?.preferences?.['zetora-custom-providers'];
    if (Array.isArray(dbProviders)) {
      providers.push(...dbProviders);
    }
  }

  return providers;
}

export type ClientSafeCustomProvider = Omit<CustomProviderConfig, 'apiKey'> & { hasApiKey: boolean };

// GET /api/custom-providers never sends stored API keys back to the browser
// (same principle as MCP server credentials) — just whether one is set.
export function toClientSafeProviders(providers: CustomProviderConfig[]): ClientSafeCustomProvider[] {
  return providers.map(({ apiKey, ...rest }) => ({ ...rest, hasApiKey: Boolean(apiKey) }));
}

// Accepts the client's raw JSON body, which may still carry the GET-only
// `hasApiKey` projection (e.g. an unrelated edit round-tripping the list
// fetched from GET /api/custom-providers) — stripped below before persisting.
export async function saveCustomProviders(
  configs: Array<CustomProviderConfig & { hasApiKey?: unknown }>,
): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  // The client only ever holds a real apiKey for a provider it just typed
  // one in for (add form). Editing/removing/toggling other providers round-trips
  // them with apiKey omitted, so preserve each one's existing stored key by id
  // instead of wiping it out.
  const prefs = await getCachedUserPreferencesByUserId(user.id);
  const existingById = new Map(
    ((prefs?.preferences?.['zetora-custom-providers'] ?? []) as CustomProviderConfig[]).map((p) => [p.id, p]),
  );
  const merged = configs.map(({ hasApiKey: _hasApiKey, ...config }) =>
    config.apiKey !== undefined ? config : { ...config, apiKey: existingById.get(config.id)?.apiKey },
  );

  await upsertUserPreferences({
    userId: user.id,
    preferences: { 'zetora-custom-providers': merged },
  });

  clearUserPreferencesCache(user.id);
}

export async function detectModels(baseURL: string, apiKey?: string): Promise<string[]> {
  const cacheKey = `${baseURL}::${apiKey ?? ''}`;
  const cached = modelsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.models;
  }

  const url = `${baseURL.replace(/\/$/, '')}/models`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey ?? 'not-needed'}` },
    // Unreachable LAN devices (asleep/off) don't always answer with an
    // immediate RST — without a bound this can hang for the OS's TCP
    // connect timeout (minutes), stalling every page that mounts the
    // model switcher. Mirrors probeBackendKind()'s per-probe timeout below.
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${url}: ${response.status}`);
  }

  const data = await response.json();
  const models: string[] = Array.isArray(data?.data) ? data.data.map((m: { id: string }) => m.id) : [];

  modelsCache.set(cacheKey, { models, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
  return models;
}

// In-memory cache for detected backend kinds, keyed by baseURL — same TTL
// and shape as the model-list cache above.
const backendKindCache = new Map<string, { kind: CustomBackendKind; expiresAt: number }>();

function deriveRootURL(baseURL: string): string {
  return baseURL.replace(/\/$/, '').replace(/\/v1$/, '');
}

// Probes an OpenAI-compatible endpoint's native (non-/v1) routes to guess
// which server implementation is behind it, so the reasoning-effort toggle
// knows whether it can send a real control parameter. Best-effort: an
// endpoint behind a reverse proxy that strips these routes just falls back
// to 'unknown' (mask-only), never breaks anything.
export async function detectBackendKind(baseURL: string): Promise<CustomBackendKind> {
  const cached = backendKindCache.get(baseURL);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.kind;
  }

  const root = deriveRootURL(baseURL);
  const kind = await probeBackendKind(root);
  backendKindCache.set(baseURL, { kind, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
  return kind;
}

async function probeBackendKind(root: string): Promise<CustomBackendKind> {
  const timeout = (ms: number) => AbortSignal.timeout(ms);

  try {
    const props = await fetch(`${root}/props`, { signal: timeout(1500) });
    if (props.ok) {
      const body = await props.json().catch(() => null);
      if (body && ('default_generation_settings' in body || 'total_slots' in body)) {
        return 'llamacpp';
      }
    }
  } catch {
    // not llama.cpp (or unreachable) — keep probing
  }

  try {
    const version = await fetch(`${root}/api/version`, { signal: timeout(1500) });
    if (version.ok) {
      const body = await version.json().catch(() => null);
      if (body && typeof body === 'object' && 'version' in body) {
        return 'ollama';
      }
    }
  } catch {
    // not Ollama — keep probing
  }

  try {
    const health = await fetch(`${root}/health`, { signal: timeout(1500) });
    const requestId = health.headers.get('x-request-id');
    if (requestId && /^[0-9a-f-]{36}$/i.test(requestId)) {
      return 'vllm';
    }
  } catch {
    // not vLLM (or unreachable)
  }

  return 'unknown';
}

// Best-effort per-model vision capability, using each backend's native
// (non-OpenAI-compatible) metadata route — the OpenAI-compatible /v1/models
// list has no capability fields at all. Never throws: any probe failure
// (unsupported backend, unreachable, malformed body) just means "unknown",
// reported as false rather than breaking the model list.
export async function detectModelVision(
  root: string,
  backendKind: CustomBackendKind | undefined,
  providerId: string,
  modelName: string,
): Promise<boolean> {
  const cacheKey = `${providerId}::${modelName}`;
  const cached = visionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.vision;
  }

  let vision = false;
  try {
    if (backendKind === 'ollama') {
      const res = await fetch(`${root}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        vision = Array.isArray(body?.capabilities) && body.capabilities.includes('vision');
      }
    } else if (backendKind === 'llamacpp') {
      const res = await fetch(`${root}/props`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        vision = body?.modalities?.vision === true;
      }
    }
  } catch {
    // Unreachable or unsupported — leave vision false.
  }

  visionCache.set(cacheKey, { vision, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
  return vision;
}

export async function getCustomModels(userId?: string): Promise<CustomModelInfo[]> {
  const providers = await getCustomProviders(userId);
  const results: CustomModelInfo[] = [];

  await Promise.allSettled(
    providers
      .filter((provider) => !provider.disableAutoDetect)
      .map(async (provider) => {
        try {
          const modelNames = await detectModels(provider.baseURL, provider.apiKey);
          const root = deriveRootURL(provider.baseURL);
          await Promise.allSettled(
            modelNames.map(async (modelName) => {
              const vision = await detectModelVision(root, provider.backendKind, provider.id, modelName);
              results.push({
                id: `custom-${provider.id}-${modelName}`,
                providerId: provider.id,
                providerName: provider.name,
                modelName,
                label: `${modelName} (${provider.name})`,
                vision,
              });
            }),
          );
        } catch (err) {
          log.warn(`[custom-providers] Could not detect models for provider ${provider.id}:`, err);
        }
      }),
  );

  return results;
}

export function createCustomProvider(config: CustomProviderConfig) {
  return createOpenAICompatible({
    name: config.id,
    baseURL: config.baseURL,
    apiKey: config.apiKey ?? 'not-needed',
  });
}

// modelId format: "custom-{providerId}-{modelName}"
export function parseCustomModelId(
  modelId: string,
  providers: CustomProviderConfig[],
): { provider: CustomProviderConfig; modelName: string } | null {
  if (!modelId.startsWith('custom-')) return null;

  const withoutPrefix = modelId.slice('custom-'.length);

  for (const provider of providers) {
    const providerPrefix = `${provider.id}-`;
    if (withoutPrefix.startsWith(providerPrefix)) {
      return { provider, modelName: withoutPrefix.slice(providerPrefix.length) };
    }
  }

  return null;
}
