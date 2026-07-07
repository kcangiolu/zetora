import 'server-only';

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { serverEnv } from '@/env/server';
import { getUser } from '@/lib/auth-utils';
import { getCachedUserPreferencesByUserId, clearUserPreferencesCache } from '@/lib/user-data-server';
import { upsertUserPreferences } from '@/lib/db/queries';

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
}

export interface CustomModelInfo {
  id: string;
  providerId: string;
  providerName: string;
  modelName: string;
  label: string;
}

// In-memory cache for detected models keyed by baseURL
const modelsCache = new Map<string, { models: string[]; expiresAt: number }>();
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      console.warn('[custom-providers] Failed to parse CUSTOM_AI_PROVIDERS env var');
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
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models from ${url}: ${response.status}`);
  }

  const data = await response.json();
  const models: string[] = Array.isArray(data?.data) ? data.data.map((m: { id: string }) => m.id) : [];

  modelsCache.set(cacheKey, { models, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
  return models;
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
          for (const modelName of modelNames) {
            results.push({
              id: `custom-${provider.id}-${modelName}`,
              providerId: provider.id,
              providerName: provider.name,
              modelName,
              label: `${modelName} (${provider.name})`,
            });
          }
        } catch (err) {
          console.warn(`[custom-providers] Could not detect models for provider ${provider.id}:`, err);
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

export async function resolveCustomModel(modelId: string): Promise<LanguageModel | null> {
  const providers = await getCustomProviders();
  const parsed = parseCustomModelId(modelId, providers);
  if (!parsed) return null;

  return createCustomProvider(parsed.provider)(parsed.modelName) as LanguageModel;
}
