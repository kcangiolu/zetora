// Pure model catalog types — client-safe, no server imports.
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
  | 'alibaba'
  | 'mistral'
  | 'deepseek'
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
  google: { id: 'google', name: 'Google', icon: 'google', hasNew: true },
  alibaba: { id: 'alibaba', name: 'Alibaba', icon: 'alibaba', hasNew: true },
  zhipu: { id: 'zhipu', name: 'Zhipu AI', icon: 'zhipu' },
  minimax: { id: 'minimax', name: 'Minimax', icon: 'minimax', hasNew: true },
  deepseek: { id: 'deepseek', name: 'DeepSeek', icon: 'deepseek' },
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
  category: string;
  pdf: boolean;
  pro: boolean;
  max?: boolean; // Requires Max plan (superset of Pro)
  requiresAuth: boolean;
  freeUnlimited: boolean;
  maxOutputTokens: number;
  extreme?: boolean;
  fast?: boolean;
  isNew?: boolean;
  parameters?: ModelParameters;
  provider?: ModelProvider; // Optional - will be derived if not specified
  customProviderId?: string; // Identifies which custom provider this model came from
  customProviderName?: string;
}
