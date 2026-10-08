// Accessors over the model catalog — client-safe.
import { models, DEFAULT_CONTEXT_WINDOW } from './data';
import type { Model, ModelParameters, ModelProvider } from './types';
import type { ReasoningCapability, ReasoningEffort } from '@/lib/reasoning-effort-types';

// Helper functions for model access checks
export function getModelConfig(modelValue: string) {
  return models.find((model) => model.value === modelValue);
}

export function requiresAuthentication(modelValue: string): boolean {
  const model = getModelConfig(modelValue);
  return model?.requiresAuth || false;
}

export function hasVisionSupport(modelValue: string): boolean {
  const model = getModelConfig(modelValue);
  return model?.vision || false;
}

export function hasPdfSupport(modelValue: string): boolean {
  const model = getModelConfig(modelValue);
  // Models with vision support can also handle PDFs
  return model?.pdf || false;
}

export function getMaxOutputTokens(modelValue: string): number {
  const model = getModelConfig(modelValue);
  return model?.maxOutputTokens || 8000;
}

// Real input+output context window for a catalog model. Custom (llama.cpp/
// Ollama/vLLM) models don't go through this — see resolveContextWindow() in
// lib/context-window.ts, which probes their backend directly.
export function getContextWindow(modelValue: string): number {
  const model = getModelConfig(modelValue);
  return model?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function getModelParameters(modelValue: string, effort?: ReasoningEffort): ModelParameters {
  const model = getModelConfig(modelValue);
  if (model?.thinkingParameters && effort !== 'off') return model.thinkingParameters;
  return model?.parameters || {};
}

// Catalog ids that were replaced: separate "Thinking" entries folded into
// their base model (now driven by the reasoning-effort toggle), and models
// renamed after an upstream successor. Old ids can linger in stored
// selections (localStorage, preferences, auto-router routes), so they resolve
// to their replacement instead of falling back to the default model.
const REPLACED_MODEL_IDS: Record<string, string> = {
  'zetora-gemini-3.5-flash-lite-think': 'zetora-gemini-3.5-flash-lite',
  'zetora-gemini-3.5-flash-think': 'zetora-gemini-3.5-flash',
  'zetora-gemini-3.8-flash-think': 'zetora-gemini-3.8-flash',
  'zetora-vertex-gemini-3.5-flash-lite-think': 'zetora-vertex-gemini-3.5-flash-lite',
  'zetora-vertex-gemini-3.5-flash-think': 'zetora-vertex-gemini-3.5-flash',
  'zetora-vertex-gemini-3.8-flash-think': 'zetora-vertex-gemini-3.8-flash',
  'zetora-gpt-5.1-thinking': 'zetora-gpt-5.1',
  'zetora-gpt-5.2-thinking': 'zetora-gpt-5.2',
  'zetora-gpt-5.4-thinking': 'zetora-gpt-5.4',
  'zetora-gpt-5.5-thinking': 'zetora-gpt-5.5',
  'zetora-gpt-5.6-thinking': 'zetora-gpt-5.6',
  'zetora-anthropic-think': 'zetora-anthropic',
  'zetora-anthropic-sonnet-4.6-think': 'zetora-anthropic-sonnet-4.6',
  'zetora-anthropic-sonnet-5-think': 'zetora-anthropic-sonnet-5',
  'zetora-anthropic-opus-think': 'zetora-anthropic-opus',
  'zetora-anthropic-opus-4.6-think': 'zetora-anthropic-opus-4.6',
  'zetora-anthropic-opus-4.7-think': 'zetora-anthropic-opus-4.7',
  'zetora-anthropic-opus-4.8-think': 'zetora-anthropic-opus-4.8',
  'zetora-grok-4.20-experimental-beta-0304-thinking': 'zetora-grok-4.20-experimental-beta-0304',
  'zetora-grok-4-fast-think': 'zetora-grok-4-fast',
  'zetora-qwen-4b-thinking': 'zetora-qwen-4b',
  'zetora-mistral-small-think': 'zetora-mistral-small',
  'zetora-cmd-a-think': 'zetora-cmd-a',
  'zetora-deepseek-chat-think': 'zetora-deepseek-chat',
  'zetora-deepseek-chat-think-exp': 'zetora-deepseek-chat-exp',
  'zetora-qwen-3-vl-30b-thinking': 'zetora-qwen-3-vl-30b',
  'zetora-qwen-3-next-think': 'zetora-qwen-3-next',
  'zetora-qwen-3-max-preview-thinking': 'zetora-qwen-3-max-preview',
  'zetora-qwen-235-think': 'zetora-qwen-235',
  'zetora-qwen-3-vl-thinking': 'zetora-qwen-3-vl',
  'zetora-kimi-k2.5-thinking': 'zetora-kimi-k2.5',
  'zetora-kimi-k2-v2-thinking': 'zetora-kimi-k2-v2',
  'zetora-glm-5-thinking': 'zetora-glm-5',
  // Groq shut down qwen3.6-27b on 2026-09-14; qwen3.8-27b is its successor.
  'zetora-qwen-3.6-27b': 'zetora-qwen-3.8-27b',
};

export function canonicalModelId(modelValue: string): string {
  return REPLACED_MODEL_IDS[modelValue] ?? modelValue;
}

// The reasoning-effort toggle's mode for a model: see Model.reasoningControl.
export function getReasoningControl(modelValue: string): ReasoningCapability {
  const model = getModelConfig(modelValue);
  if (!model?.reasoning) return null;
  return model.reasoningControl ?? 'full';
}

// Helper to check if user should bypass rate limits
export function shouldBypassRateLimits(modelValue: string, user: any): boolean {
  const model = getModelConfig(modelValue);
  return Boolean(user && model?.freeUnlimited);
}

// Get acceptable file types for a model
export function getAcceptedFileTypes(modelValue: string): string {
  const model = getModelConfig(modelValue);
  // Document file types for file_query_search tool - available for ALL models
  const documentTypes = '.csv,.xlsx,.xls,.docx';
  // JSON and JSON-derived formats — accepted as plain text server-side (see
  // isTextLikeType in app/api/upload) but must be listed explicitly here or
  // the native OS file picker greys them out despite being supported.
  const jsonTypes = '.json,.jsonl,.ndjson,.geojson,.jsonc';

  // Images are always attachable — the in-chat Vision toggle governs whether
  // they're injected into the model's context or just hosted + handed to it
  // as a URL (see app/api/search/route.ts). A non-vision model can still act
  // on an image via tools like edit_image without ever "seeing" it.
  if (model?.pdf) {
    return `image/*,.pdf,${documentTypes},${jsonTypes}`;
  }
  return `image/*,${documentTypes},${jsonTypes}`;
}

// Check if a model supports extreme mode
export function supportsExtremeMode(modelValue: string): boolean {
  // Extreme mode restrictions removed: allow all models in extreme mode
  return true;
}

// Models that support canvas mode (spec generation)
const CANVAS_MODELS = new Set([
  'zetora-code',
  'zetora-gpt-5.2',
  'zetora-gpt-5.3-chat-latest',
  'zetora-gpt-5.4',
  'zetora-gpt-5.4-mini',
  'zetora-gpt-5.4-nano',
  'zetora-gpt-5.4-thinking-xhigh',
  'zetora-gpt-5.2-thinking-xhigh',
  'zetora-anthropic',
  'zetora-anthropic-sonnet-4.6',
  'zetora-anthropic-opus-4.6',
  'zetora-glm-5',
  'zetora-glm-4.7',
  'zetora-kimi-k2.5',
  'zetora-qwen-3.5',
  'zetora-qwen-3.5-plus',
  'zetora-seed-1.8',
  'zetora-deepseek-chat',
  'zetora-gpt-5.2-codex',
  'zetora-gpt-5.3-codex',
  'zetora-gemini-3.1-pro',
  'zetora-vertex-gemini-3.1-pro',
]);

export function supportsCanvasMode(modelValue: string): boolean {
  return CANVAS_MODELS.has(modelValue);
}

// Restricted regions for OpenAI and Anthropic models
const RESTRICTED_REGIONS = ['CN', 'KP', 'RU']; // China, North Korea, Russia

// Models that should be filtered in restricted regions
const OPENAI_MODELS = [
  'zetora-gpt-4.1',
  'zetora-gpt-4.1-mini',
  'zetora-gpt-4.1-nano',
  'zetora-gpt5',
  'zetora-gpt5-mini',
  'zetora-gpt5-nano',
  'zetora-gpt5-medium',
  'zetora-gpt5-codex',
  'zetora-gpt-5.1',
  'zetora-gpt-5.1-codex',
  'zetora-gpt-5.1-codex-mini',
  'zetora-gpt-5.1-codex-max',
  'zetora-gpt-5.2',
  'zetora-gpt-5.4',
  'zetora-gpt-5.4-mini',
  'zetora-gpt-5.4-nano',
  'zetora-gpt-5.4-thinking-xhigh',
  'zetora-gpt-5.2-thinking-xhigh',
  'zetora-gpt-5.2-codex',
  'zetora-gpt-5.3-codex',
  'zetora-o3',
  'zetora-o4-mini',
];

const ANTHROPIC_MODELS = [
  'zetora-haiku',
  'zetora-anthropic-small',
  'zetora-anthropic',
  'zetora-anthropic-opus',
  'zetora-anthropic-sonnet-4.6',
  'zetora-anthropic-opus-4.6',
];

// Check if a model should be filtered based on region
export function isModelRestrictedInRegion(modelValue: string, countryCode?: string): boolean {
  if (!countryCode) return false;

  const isRestricted = RESTRICTED_REGIONS.includes(countryCode.toUpperCase());
  if (!isRestricted) return false;

  const isOpenAI = OPENAI_MODELS.includes(modelValue);
  const isAnthropic = ANTHROPIC_MODELS.includes(modelValue);

  return isOpenAI || isAnthropic;
}

// Filter models based on user's region
export function getFilteredModels(countryCode?: string): Model[] {
  if (!countryCode || !RESTRICTED_REGIONS.includes(countryCode.toUpperCase())) {
    return models;
  }

  return models.filter((model) => !isModelRestrictedInRegion(model.value, countryCode));
}

// Helper function to derive provider from model value/label patterns
export function getModelProvider(modelValue: string, label?: string): ModelProvider {
  const value = modelValue.toLowerCase();
  const modelLabel = (label || '').toLowerCase();

  // Custom providers
  if (value.startsWith('custom-')) {
    return 'custom';
  }

  // xAI (Grok)
  if (
    value.includes('grok') ||
    value.includes('zetora-default') ||
    (value.includes('zetora-code') && !value.includes('codex'))
  ) {
    return 'xai';
  }

  // OpenAI (GPT, o3, o4)
  if (value.includes('gpt') || value.includes('zetora-o3') || value.includes('zetora-o4')) {
    return 'openai';
  }

  // Anthropic (Claude)
  if (value.includes('anthropic') || value.includes('haiku') || modelLabel.includes('claude')) {
    return 'anthropic';
  }

  // Google Agent Platform (Gemini served through ex-Vertex AI)
  if (value.includes('zetora-vertex-')) {
    return 'vertex';
  }

  // Google AI Studio (Gemini)
  if (value.includes('google') || value.includes('gemini')) {
    return 'google';
  }

  // Alibaba (Qwen)
  if (value.includes('qwen')) {
    return 'alibaba';
  }

  // Mistral (Mistral, Ministral, Magistral, Devstral, Leanstral)
  if (
    value.includes('mistral') ||
    value.includes('ministral') ||
    value.includes('magistral') ||
    value.includes('devstral') ||
    value.includes('leanstral')
  ) {
    return 'mistral';
  }

  // DeepSeek
  if (value.includes('deepseek')) {
    return 'deepseek';
  }

  // Zhipu (GLM)
  if (value.includes('glm')) {
    return 'zhipu';
  }

  // Cohere (Command)
  if (value.includes('cmd') || modelLabel.includes('command')) {
    return 'cohere';
  }

  // MoonShot (Kimi)
  if (value.includes('kimi')) {
    return 'moonshot';
  }

  // Minimax
  if (value.includes('minimax')) {
    return 'minimax';
  }

  // ByteDance (Seed)
  if (value.includes('seed')) {
    return 'bytedance';
  }

  // Arcee (Trinity)
  if (value.includes('trinity')) {
    return 'arcee';
  }

  // Vercel (v0)
  if (value.includes('v0')) {
    return 'vercel';
  }

  // Amazon (Nova)
  if (value.includes('nova')) {
    return 'amazon';
  }

  // Xiaomi (Mimo)
  if (value.includes('mimo')) {
    return 'xiaomi';
  }

  // Kwaipilot (KAT)
  if (value.includes('kat')) {
    return 'kwaipilot';
  }

  // StepFun (Step)
  if (value.includes('step')) {
    return 'stepfun';
  }

  // Sarvam
  if (value.includes('sarvam')) {
    return 'sarvam';
  }

  // Inception (Mercury)
  if (value.includes('mercury')) {
    return 'inception';
  }

  // Default fallback
  return 'openai';
}

// Get models by provider
export function getModelsByProvider(provider: ModelProvider): Model[] {
  return models.filter((m) => {
    const modelProvider = m.provider || getModelProvider(m.value, m.label);
    return modelProvider === provider;
  });
}
