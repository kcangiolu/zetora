// Pure model catalog types — client-safe, no server imports.
import type { ReasoningCapability } from '@/lib/reasoning-effort-types';

export interface ModelParameters {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxOutputTokens?: number;
}

// Provider definitions for model categorization
export type ModelProvider =
  | 'zetora'
  | 'xai'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'vertex'
  | 'alibaba'
  | 'mistral'
  | 'deepseek'
  | 'groq'
  | 'zhipu'
  | 'cohere'
  | 'moonshot'
  | 'minimax'
  | 'bytedance'
  | 'arcee'
  | 'vercel'
  | 'amazon'
  | 'xiaomi'
  | 'kwaipilot'
  | 'stepfun'
  | 'sarvam'
  | 'inception'
  | 'nvidia'
  | 'custom';

export interface ProviderInfo {
  id: ModelProvider;
  name: string;
  icon: string; // SVG path or icon identifier
  hasNew?: boolean;
}

export const PROVIDERS: Record<ModelProvider, ProviderInfo> = {
  zetora: { id: 'zetora', name: 'Zetora', icon: 'zetora' },
  xai: { id: 'xai', name: 'xAI', icon: 'xai', hasNew: true },
  openai: { id: 'openai', name: 'OpenAI', icon: 'openai', hasNew: true },
  anthropic: { id: 'anthropic', name: 'Anthropic', icon: 'anthropic', hasNew: true },
  google: { id: 'google', name: 'Google AI Studio', icon: 'google', hasNew: true },
  vertex: { id: 'vertex', name: 'Google Agent Platform', icon: 'google', hasNew: true },
  alibaba: { id: 'alibaba', name: 'Alibaba', icon: 'alibaba', hasNew: true },
  zhipu: { id: 'zhipu', name: 'Zhipu AI', icon: 'zhipu' },
  minimax: { id: 'minimax', name: 'Minimax', icon: 'minimax', hasNew: true },
  deepseek: { id: 'deepseek', name: 'DeepSeek', icon: 'deepseek', hasNew: true },
  groq: { id: 'groq', name: 'Groq', icon: 'groq', hasNew: true },
  moonshot: { id: 'moonshot', name: 'MoonShot', icon: 'moonshot' },
  cohere: { id: 'cohere', name: 'Cohere', icon: 'cohere' },
  bytedance: { id: 'bytedance', name: 'ByteDance', icon: 'bytedance', hasNew: true },
  mistral: { id: 'mistral', name: 'Mistral', icon: 'mistral', hasNew: true },
  arcee: { id: 'arcee', name: 'Arcee', icon: 'arcee' },
  vercel: { id: 'vercel', name: 'Vercel', icon: 'vercel' },
  amazon: { id: 'amazon', name: 'Amazon', icon: 'amazon' },
  xiaomi: { id: 'xiaomi', name: 'Xiaomi', icon: 'xiaomi' },
  kwaipilot: { id: 'kwaipilot', name: 'Kwaipilot', icon: 'kwaipilot' },
  stepfun: { id: 'stepfun', name: 'StepFun', icon: 'stepfun' },
  sarvam: { id: 'sarvam', name: 'Sarvam', icon: 'sarvam', hasNew: true },
  inception: { id: 'inception', name: 'Inception', icon: 'inception', hasNew: true },
  nvidia: { id: 'nvidia', name: 'NVIDIA', icon: 'nvidia', hasNew: true },
  custom: { id: 'custom', name: 'Custom', icon: 'custom' },
};

export interface Model {
  value: string;
  label: string;
  description: string;
  vision: boolean;
  reasoning: boolean;
  experimental: boolean;
  pdf: boolean;
  requiresAuth: boolean;
  freeUnlimited: boolean;
  maxOutputTokens: number;
  // Real input+output context window, when known. Falls back to
  // DEFAULT_CONTEXT_WINDOW via getContextWindow() when absent — most hosted
  // providers in 2026 sit at 128k+, so leaving this unset is a safe default
  // rather than an error.
  contextWindow?: number;
  extreme?: boolean;
  fast?: boolean;
  isNew?: boolean;
  parameters?: ModelParameters;
  provider?: ModelProvider; // Optional - will be derived if not specified
  customProviderId?: string; // Identifies which custom provider this model came from
  customProviderName?: string;
  // Whether the reasoning-effort toggle can send this model a real control
  // parameter ('full'), can only hide its <think> output ('mask-only'), or
  // should be hidden entirely (undefined/null — model doesn't reason).
  // Built-in models rely on the static `reasoning` flag above instead;
  // this is populated for custom provider models (see
  // app/api/custom-providers/models/route.ts).
  reasoningControl?: ReasoningCapability;
}
