// Types shared by the catalog builder (pure) and its server-side users.
import type { HostId } from './config';

// The subset of models.dev's api.json the catalog reads.
type ModelsDevReasoningOption =
  | { type: 'toggle' }
  | { type: 'effort'; values: string[] }
  | { type: 'budget_tokens'; min?: number; max?: number };

export interface ModelsDevModel {
  id: string;
  name: string;
  description?: string;
  reasoning?: boolean;
  reasoning_options?: ModelsDevReasoningOption[] | null;
  tool_call?: boolean;
  structured_output?: boolean;
  open_weights?: boolean;
  release_date?: string;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  // USD per million tokens.
  cost?: { input?: number; output?: number };
  status?: 'alpha' | 'beta' | 'deprecated';
}

export type ModelsDevData = Record<string, { models: Record<string, ModelsDevModel> }>;

// Reasoning effort values a provider can accept, weakest first.
export const EFFORT_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export interface ReasoningSpec {
  // Thinking can be switched on and off explicitly.
  toggle: boolean;
  // Accepted effort values, weakest first; empty when there is no effort knob.
  efforts: EffortLevel[];
  // Thinking driven by a token budget instead of (or besides) an effort.
  budget?: { min?: number; max?: number };
}

export interface CatalogRoute {
  host: 'direct' | HostId;
  // The model id as that host expects it.
  modelId: string;
}

export interface CatalogEntry {
  // `${lab}:${model}`, e.g. 'anthropic:claude-sonnet-4-6'.
  id: string;
  lab: string;
  label: string;
  description: string;
  releaseDate?: string;
  status?: 'alpha' | 'beta';
  vision: boolean;
  pdf: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  structuredOutput: boolean;
  // USD per million input + output tokens, when known.
  cost?: { input: number; output: number };
  // null when the model doesn't reason.
  reasoning: ReasoningSpec | null;
  // Tried in order, the first one being the preferred route.
  routes: CatalogRoute[];
  // Set when thinking and instant answers are two separate upstream models:
  // `routes` then serves thinking and these serve instant answers.
  instantRoutes?: CatalogRoute[];
}
