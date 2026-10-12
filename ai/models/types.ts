// Pure model types — client-safe, no server imports.
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

// A lab id from ai/catalog/config.ts, 'zetora' for the virtual Auto model,
// or 'custom' for user-configured endpoints.
export type ModelProvider = string;

export interface Model {
  value: string;
  label: string;
  description: string;
  provider: ModelProvider;
  vision: boolean;
  pdf: boolean;
  reasoning: boolean;
  // Whether the reasoning-effort toggle can send this model a real control
  // parameter ('full'), only switch it on/off ('binary-guaranteed'), can only
  // hide its <think> output ('mask-only'), or should be hidden entirely
  // (undefined/null — model doesn't reason or can't be steered). Custom
  // provider models get it computed (see app/api/custom-providers/models/route.ts).
  reasoningControl?: ReasoningCapability;
  structuredOutput: boolean;
  maxOutputTokens: number;
  // Real input+output context window, when known.
  contextWindow?: number;
  releaseDate?: string;
  experimental: boolean;
  isNew?: boolean;
  customProviderId?: string; // Identifies which custom provider this model came from
  customProviderName?: string;
}
