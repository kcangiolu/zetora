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

export async function getCustomProviders(): Promise<CustomProviderConfig[]> {
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
  const user = await getUser();
  if (user) {
    const prefs = await getCachedUserPreferencesByUserId(user.id);
    const dbProviders = prefs?.preferences?.['zetora-custom-providers'];
    if (Array.isArray(dbProviders)) {
      providers.push(...dbProviders);
    }
  }

  return providers;
}

export async function saveCustomProviders(configs: CustomProviderConfig[]): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');

  await upsertUserPreferences({
    userId: user.id,
    preferences: { 'zetora-custom-providers': configs },
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
  const models: string[] = Array.isArray(data?.data)
    ? data.data.map((m: { id: string }) => m.id)
    : [];

  modelsCache.set(cacheKey, { models, expiresAt: Date.now() + MODELS_CACHE_TTL_MS });
  return models;
}

export async function getCustomModels(): Promise<CustomModelInfo[]> {
  const providers = await getCustomProviders();
  const results: CustomModelInfo[] = [];

  await Promise.allSettled(
    providers.map(async (provider) => {
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
