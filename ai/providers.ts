import 'server-only';
import { isAnonymizationAvailable } from '@/lib/instance/capabilities';

import { wrapLanguageModel, extractReasoningMiddleware, gateway, type LanguageModel } from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { dynamicXmlToolMiddleware } from '@/ai/xml-tool-middleware';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createWebSocketFetch } from 'ai-sdk-openai-websocket-fetch';
import { xai } from '@ai-sdk/xai';
import { groq } from '@ai-sdk/groq';
import { mistral } from '@ai-sdk/mistral';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { anthropic } from '@ai-sdk/anthropic';
import { cohere } from '@ai-sdk/cohere';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createRetryable } from 'ai-retry';
import { reasoningSwitch } from '@/ai/reasoning-switch-model';
import { isConfigured } from '@/ai/catalog/env';
import { LABS, type DirectClient, type HostId } from '@/ai/catalog/config';
import { getModelEntry } from '@/ai/catalog/models';
import { ModelUnavailableError, getTaskModel } from '@/ai/catalog/task-models';
import { loadModelCatalog } from '@/ai/catalog/store';
import type { CatalogEntry, CatalogRoute } from '@/ai/catalog/types';
import { ARCH_ROUTER_MODEL, DEFAULT_MODEL_ALIAS, canonicalModelId } from '@/ai/models/helpers';

const openaiCompatible = (name: string, baseURL: string, apiKey: string | undefined) =>
  isConfigured(apiKey) ? createOpenAICompatible({ name, baseURL, apiKey }) : null;

const sarvam = openaiCompatible('sarvam', 'https://api.sarvam.ai/v1', process.env.SARVAM_API_KEY);
const zai = openaiCompatible('zai', 'https://api.z.ai/api/paas/v4', process.env.ZAI_API_KEY);
const minimax = openaiCompatible('minimax', 'https://api.minimax.io/v1', process.env.MINIMAX_API_KEY);
const novita = openaiCompatible('novita', 'https://api.novita.ai/openai', process.env.NOVITA_API_KEY);
const huggingface = openaiCompatible('huggingface', 'https://router.huggingface.co/v1', process.env.HF_TOKEN);

// Uses the real @ai-sdk/deepseek package rather than the generic
// openai-compatible wrapper — DeepSeek doesn't support structuredOutputs
// either way, but this package still injects the JSON schema into a system
// message and sets response_format: json_object, instead of silently
// dropping the schema (which made Output.object() calls like extreme-search's
// planner fail unpredictably with "response did not match schema").
const deepseekDirect = isConfigured(process.env.DEEPSEEK_API_KEY)
  ? createDeepSeek({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    })
  : null;

// Separate instance, used only by /startwith on direct DeepSeek models.
// DeepSeek's real prefill ("Chat Prefix Completion") needs the /beta
// endpoint plus a `prefix: true` field on the trailing assistant message —
// @ai-sdk/deepseek's hand-rolled message converter has no escape hatch for
// that field, but the generic openai-compatible shim spreads
// `message.providerOptions.openaiCompatible` verbatim onto the built message
// (verified against its source), so it's the one that can actually send
// `prefix`. Never used for normal chat — deepseekDirect above still handles
// that — so the shim's known structured-output weakness never applies:
// /startwith always forces tools:{} and a single plain-text step.
const deepseekBetaDirect = openaiCompatible(
  'deepseek-beta',
  'https://api.deepseek.com/beta',
  process.env.DEEPSEEK_API_KEY,
);

export function getDeepSeekStartWithModel(modelId: string): LanguageModelV3 | null {
  const route = getModelEntry(modelId)?.routes[0];
  if (!deepseekBetaDirect || getModelEntry(modelId)?.lab !== 'deepseek' || route?.host !== 'direct') return null;
  return deepseekBetaDirect.chatModel(route.modelId);
}

const openrouter = isConfigured(process.env.OPENROUTER_API_KEY)
  ? createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'Zetora',
      },
    })
  : null;

const wsFetch = createWebSocketFetch();

const openai = isConfigured(process.env.OPENAI_API_KEY) ? createOpenAI({ fetch: wsFetch }) : null;

// A second OpenAI key, tried when the first one fails (rate limits).
const openaiBackup = isConfigured(process.env.OPENAI_API_KEY_2)
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY_2, fetch: wsFetch })
  : null;

// Gemini has two endpoints, each with its own key and picker tab. Keys are
// passed explicitly: the SDKs' default env names (GOOGLE_GENERATIVE_AI_API_KEY,
// GOOGLE_VERTEX_API_KEY) are not the ones Zetora uses. An API key puts the
// Vertex SDK in express mode, so no project/location/credentials are needed.
const google = isConfigured(process.env.GOOGLE_AI_STUDIO_API_KEY)
  ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_STUDIO_API_KEY })
  : null;
const vertex = isConfigured(process.env.GOOGLE_AGENT_PLATFORM_API_KEY)
  ? createVertex({ apiKey: process.env.GOOGLE_AGENT_PLATFORM_API_KEY })
  : null;

type ModelFactory = (modelId: string) => LanguageModelV3;

function configured(envKey: string, factory: ModelFactory): ModelFactory | null {
  return isConfigured(process.env[envKey]) ? factory : null;
}

// Each lab's own API (see ai/catalog/config.ts), null when its key is unset.
const DIRECT_CLIENTS: Record<DirectClient, ModelFactory | null> = {
  openai:
    openai &&
    ((id) => (openaiBackup ? createRetryable({ model: openai(id), retries: [openaiBackup(id)] }) : openai(id))),
  anthropic: configured('ANTHROPIC_API_KEY', (id) => anthropic(id)),
  google: google && ((id) => google(id)),
  vertex: vertex && ((id) => vertex(id)),
  xai: configured('XAI_API_KEY', (id) => xai(id)),
  deepseek: deepseekDirect && ((id) => deepseekDirect(id)),
  mistral: configured('MISTRAL_API_KEY', (id) => mistral(id)),
  cohere: configured('COHERE_API_KEY', (id) => cohere(id)),
  zai: zai && ((id) => zai.chatModel(id)),
  minimax: minimax && ((id) => minimax.chatModel(id)),
  sarvam: sarvam && ((id) => sarvam.chatModel(id)),
};

const HOST_CLIENTS: Record<HostId, ModelFactory | null> = {
  groq: configured('GROQ_API_KEY', (id) => groq(id)),
  novita: novita && ((id) => novita.chatModel(id)),
  gateway: (id) => gateway(id),
  openrouter: openrouter && ((id) => openrouter(id)),
};

// Native SDKs return reasoning as its own parts; OpenAI-compatible shims and
// aggregators can stream it inline as <think> tags instead.
const NATIVE_REASONING_CLIENTS = new Set<DirectClient>([
  'openai',
  'anthropic',
  'google',
  'vertex',
  'xai',
  'deepseek',
  'mistral',
  'cohere',
]);

const thinkTagMiddleware = extractReasoningMiddleware({ tagName: 'think' });

function routeModel(
  entry: CatalogEntry,
  route: CatalogRoute,
  client: DirectClient | undefined,
): LanguageModelV3 | null {
  const factory = route.host === 'direct' ? client && DIRECT_CLIENTS[client] : HOST_CLIENTS[route.host];
  if (!factory) return null;
  const model = factory(route.modelId);
  const native = route.host === 'direct' && client && NATIVE_REASONING_CLIENTS.has(client);
  return entry.reasoning && !native ? wrapLanguageModel({ model, middleware: thinkTagMiddleware }) : model;
}

function routeChain(
  entry: CatalogEntry,
  routes: CatalogRoute[],
  client: DirectClient | undefined,
): LanguageModelV3 | null {
  const [first, ...rest] = routes.map((route) => routeModel(entry, route, client)).filter((model) => model !== null);
  if (!first) return null;
  return rest.length ? createRetryable({ model: first, retries: rest }) : first;
}

// The language model for a catalog entry: its routes in order, each later
// one tried when the previous fails.
function catalogLanguageModel(entry: CatalogEntry): LanguageModelV3 | null {
  const client = LABS.find((lab) => lab.id === entry.lab)?.direct?.client;
  const thinking = routeChain(entry, entry.routes, client);
  if (!thinking || !entry.instantRoutes) return thinking;
  const instant = routeChain(entry, entry.instantRoutes, client);
  return instant ? reasoningSwitch({ thinking, instant }) : thinking;
}

// Internal models that aren't chat models, so never part of the catalog.
const INTERNAL_MODELS: Record<string, () => LanguageModelV3 | null> = {
  [ARCH_ROUTER_MODEL.id]: () => huggingface?.chatModel('katanemo/Arch-Router-1.5B:hf-inference') ?? null,
};

import {
  customProviderFetch,
  getCustomProviders,
  getCustomModels,
  deriveRootURL,
  shouldUseNativeCustomProvider,
  type CustomProviderConfig,
} from '@/lib/custom-providers';
import { LlamaCppNativeLanguageModel } from './native-models/llamacpp-model';
import { OllamaNativeLanguageModel } from './native-models/ollama-model';

const customProviderInstances = new Map<string, ReturnType<typeof createOpenAICompatible>>();

async function getOrCreateProvider(providerId: string, userId?: string) {
  const providers = await getCustomProviders(userId);
  const config = providers.find((p) => p.id === providerId);
  if (!config) throw new Error(`Custom provider ${providerId} not found`);

  const cacheKey = `${providerId}::${config.baseURL}::${config.apiKey ?? ''}`;
  if (customProviderInstances.has(cacheKey)) {
    return customProviderInstances.get(cacheKey)!;
  }
  const provider = createOpenAICompatible({
    name: config.id,
    baseURL: config.baseURL,
    apiKey: config.apiKey ?? 'not-needed',
    // vLLM implements the OpenAI json_schema response format for real
    // (unlike most other self-hosted backends, which silently ignore the
    // schema and fall back to json_object) — only safe to advertise for it.
    supportsStructuredOutputs: config.backendKind === 'vllm',
    fetch: customProviderFetch(config.baseURL),
  });
  customProviderInstances.set(cacheKey, provider);
  return provider;
}

const llamaCppModelInstances = new Map<string, LlamaCppNativeLanguageModel>();

function getOrCreateLlamaCppModel(config: CustomProviderConfig, modelName: string) {
  const cacheKey = `${config.id}::${config.baseURL}::${config.apiKey ?? ''}::${modelName}`;
  const cached = llamaCppModelInstances.get(cacheKey);
  if (cached) return cached;

  const model = new LlamaCppNativeLanguageModel(modelName, {
    providerId: config.id,
    rootURL: deriveRootURL(config.baseURL),
    apiKey: config.apiKey,
    fetch: customProviderFetch(config.baseURL),
  });
  llamaCppModelInstances.set(cacheKey, model);
  return model;
}

const ollamaModelInstances = new Map<string, OllamaNativeLanguageModel>();

function getOrCreateOllamaModel(config: CustomProviderConfig, modelName: string) {
  const cacheKey = `${config.id}::${config.baseURL}::${config.apiKey ?? ''}::${modelName}`;
  const cached = ollamaModelInstances.get(cacheKey);
  if (cached) return cached;

  const model = new OllamaNativeLanguageModel(modelName, {
    providerId: config.id,
    rootURL: deriveRootURL(config.baseURL),
    apiKey: config.apiKey,
    fetch: customProviderFetch(config.baseURL),
  });
  ollamaModelInstances.set(cacheKey, model);
  return model;
}

// Returns the anonymization context for this (model, user) pair, or null if
// the layer shouldn't apply — master toggle gates everything; built-in
// providers are covered automatically once it's on, custom providers
// additionally need their own per-provider flag set (a custom provider can
// be a trusted local endpoint or a cloud one, so it can't be inferred).
// Shared by resolveModel and anything that needs to mask outgoing tool/egress
// data for the same request (see lib/search/tool-loader.ts).
export async function getAnonymizeContext(
  modelId: string,
  preferences?: Record<string, unknown> | null,
  userId?: string,
): Promise<import('@/lib/anonymizer/pseudonymize').AnonymizeContext | null> {
  if (!userId) return null;
  // Without a PII detector the instance doesn't offer anonymization at all
  // (Settings hides it), so a preference left over from before is moot.
  if (!isAnonymizationAvailable()) return null;
  if (preferences?.['zetora-anonymization-enabled'] !== true) return null;

  if (modelId.startsWith('custom-')) {
    const models = await getCustomModels(userId);
    const model = models.find((m) => m.id === modelId);
    if (!model) return null;
    const providers = await getCustomProviders(userId);
    if (providers.find((p) => p.id === model.providerId)?.anonymize !== true) return null;
  }

  return {
    userId,
    language: (preferences?.['zetora-anonymization-language'] as string | undefined) ?? 'en',
    nerEnabled: preferences?.['zetora-anonymization-ner-enabled'] !== false,
    denyTerms: (preferences?.['zetora-anonymization-custom-terms'] as string[] | undefined) ?? [],
    failOpen: preferences?.['zetora-anonymization-fail-open'] === true,
  };
}

export async function resolveModel(
  modelId: string,
  preferences?: Record<string, unknown> | null,
  userId?: string,
  hasImages = false,
): Promise<LanguageModelV3> {
  await loadModelCatalog();
  // The default model is the user's "Default Model" pick, else the instance's.
  if (canonicalModelId(modelId) === DEFAULT_MODEL_ALIAS) {
    return resolveModel(getTaskModel('default', preferences), preferences, userId, hasImages);
  }
  let resolved: LanguageModelV3;
  let backendKind: CustomProviderConfig['backendKind'] | undefined;
  let usingNativeModel = false;

  if (!modelId.startsWith('custom-')) {
    const entry = getModelEntry(modelId);
    const builtIn = INTERNAL_MODELS[modelId]?.() ?? (entry && catalogLanguageModel(entry));
    // A model that left the catalog can linger in a stored selection
    // (localStorage, saved auto-router routes, preferences).
    if (!builtIn) {
      throw new ModelUnavailableError(
        `${modelId} is not available. It is not in the model catalog, or its provider has no API key. Pick another model.`,
      );
    }
    resolved = builtIn;
  } else {
    const models = await getCustomModels(userId);
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      throw new ModelUnavailableError(`${modelId} no longer exists in your custom providers. Pick another model.`);
    } else {
      const providers = await getCustomProviders(userId);
      const providerConfig = providers.find((p) => p.id === model.providerId);
      backendKind = providerConfig?.backendKind;

      // The native llama.cpp (/completion) and Ollama (/api/chat) providers
      // are text-only for now (see ai/native-models/*-prompt.ts's
      // partsToText) — a vision-capable model still needs the
      // OpenAI-compatible route for any turn that actually attaches an
      // image, or the image silently vanishes even though detectModelVision
      // correctly told the UI this model supports it. shouldUseNativeCustomProvider
      // is the single shared decision — lib/reasoning-effort.ts and
      // lib/chat-commands-server.ts must reach the same conclusion for the
      // same provider/request, or the reasoning-override shape and
      // /startwith support end up disagreeing with what actually got called.
      if (providerConfig && shouldUseNativeCustomProvider(backendKind, providerConfig.enrichedShim, hasImages)) {
        if (backendKind === 'llamacpp') {
          resolved = getOrCreateLlamaCppModel(providerConfig, model.modelName);
        } else {
          resolved = getOrCreateOllamaModel(providerConfig, model.modelName);
        }
        usingNativeModel = true;
      } else {
        resolved = (await getOrCreateProvider(model.providerId, userId)).chatModel(model.modelName);
      }
    }
  }

  const xmlParsingEnabled = preferences?.['zetora-xml-tool-parsing-enabled'] === true;
  const isCustomModel = modelId.startsWith('custom-');
  // llama.cpp's native /completion endpoint has no tool-calling protocol at
  // all — without XML parsing forced on, tool calls would silently break
  // instead of erroring, so this backend can't honor the toggle being off.
  // Only applies when the native model is actually in use — the image
  // fallback above routes through the OpenAI-compatible provider instead,
  // which has its own real tool-calling protocol.
  const forceXmlForNativeLlamaCpp = backendKind === 'llamacpp' && usingNativeModel;

  if ((xmlParsingEnabled || forceXmlForNativeLlamaCpp) && isCustomModel) {
    resolved = wrapLanguageModel({
      model: resolved,
      middleware: dynamicXmlToolMiddleware,
    });
  }

  const anonymizeContext = await getAnonymizeContext(modelId, preferences, userId);
  if (anonymizeContext) {
    const { createAnonymizationMiddleware } = await import('./anonymization-middleware');
    resolved = wrapLanguageModel({
      model: resolved,
      middleware: createAnonymizationMiddleware(anonymizeContext),
    });
  }

  return resolved;
}
