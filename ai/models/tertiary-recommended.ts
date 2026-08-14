// Fast/cheap models recommended for specific background (tertiary) tasks —
// deliberately kept out of the main catalog (data.ts) since they're not
// meant to be offered as general chat models, only surfaced via
// `additionalModels` on the relevant TertiaryModelRow in Settings.
import type { Model } from './types';

const llama31_8b: Model = {
  value: 'zetora-llama-3.1-8b',
  label: 'Llama 3.1 8B (Groq)',
  description: "Meta's smallest Llama, served on Groq for near-instant responses",
  vision: false,
  reasoning: false,
  experimental: false,
  pdf: false,
  requiresAuth: false,
  freeUnlimited: false,
  maxOutputTokens: 8000,
  fast: true,
  provider: 'groq',
};

const llama33_70b: Model = {
  value: 'zetora-llama-3.3-70b',
  label: 'Llama 3.3 70B (Groq)',
  description: "Meta's versatile Llama, served on Groq for near-instant responses",
  vision: false,
  reasoning: false,
  experimental: false,
  pdf: false,
  requiresAuth: false,
  freeUnlimited: false,
  maxOutputTokens: 8000,
  fast: true,
  provider: 'groq',
};

const gptOss120Groq: Model = {
  value: 'zetora-gpt-oss-120-groq',
  label: 'GPT OSS 120B (Groq)',
  description: "OpenAI's open-weight LLM, served on Groq for near-instant responses",
  vision: false,
  reasoning: false,
  experimental: false,
  pdf: false,
  requiresAuth: false,
  freeUnlimited: false,
  maxOutputTokens: 16000,
  fast: true,
  provider: 'groq',
};

// zetora-qwen-3.6-27b (recommended for translate-text/translate-vision) is
// already in the main catalog (data.ts), so it's already selectable in every
// picker via the base model list — no synthetic entry needed here for it.
export const TERTIARY_RECOMMENDED_MODELS: Record<'chat-title' | 'followup' | 'tool-repair' | 'lang-detect', Model[]> =
  {
    'chat-title': [llama31_8b],
    followup: [llama33_70b],
    'tool-repair': [gptOss120Groq],
    'lang-detect': [llama31_8b],
  };
