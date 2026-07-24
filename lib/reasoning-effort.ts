import 'server-only';
import { extractReasoningMiddleware } from 'ai';
import { getModelConfig, getModelProvider } from '@/ai/models';
import { parseCustomModelId, type CustomProviderConfig, type CustomBackendKind } from '@/lib/custom-providers';
import type { ReasoningEffort, ReasoningCapability } from '@/lib/reasoning-effort-types';

export type { ReasoningEffort, ReasoningCapability, CustomBackendKind };
export { REASONING_EFFORT_LEVELS } from '@/lib/reasoning-effort-types';

type EffortTier = Exclude<ReasoningEffort, 'auto'>;

// Shared by any provider whose reasoning param is an OpenAI-style
// low/medium/high/none string (OpenAI itself, Groq, vLLM's reasoning_effort).
export const OPENAI_STYLE_EFFORT_MAP: Record<EffortTier, 'low' | 'medium' | 'high' | 'none'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  off: 'none',
};

export const ANTHROPIC_BUDGET_TOKENS_MAP: Record<EffortTier, number> = {
  low: 1024,
  medium: 4000,
  high: 16000,
  off: 0,
};

export const GOOGLE_THINKING_BUDGET_MAP: Record<EffortTier, number> = {
  low: 200,
  medium: 400,
  high: 2000,
  off: 0,
};

const LLAMACPP_THINKING_BUDGET_MAP: Record<EffortTier, number> = {
  low: 256,
  medium: 1024,
  high: 4096,
  off: 0,
};

// The extractReasoningMiddleware wrapper used everywhere reasoning needs to
// be hidden from the response without the model itself being controllable
// (custom Ollama/unknown backends, and any task's "off" effort on them).
export const reasoningMaskMiddleware = extractReasoningMiddleware({ tagName: 'think' });

function resolveCustomBackend(modelId: string, customProviders: CustomProviderConfig[]) {
  const parsed = parseCustomModelId(modelId, customProviders);
  if (!parsed) return null;
  return { providerId: parsed.provider.id, backendKind: parsed.provider.backendKind };
}

export function getReasoningCapability(
  modelId: string,
  customProviders: CustomProviderConfig[] = [],
): ReasoningCapability {
  if (modelId.startsWith('custom-')) {
    const backend = resolveCustomBackend(modelId, customProviders);
    return backend?.backendKind === 'vllm' || backend?.backendKind === 'llamacpp' ? 'full' : 'mask-only';
  }
  return getModelConfig(modelId)?.reasoning ? 'full' : null;
}

// Overrides for custom (OpenAI-compatible) providers only — zetora-* models
// are handled inline in lib/search/provider-options.ts, which already knows
// exactly which provider-options branch each model falls into.
export function getCustomReasoningOverrides(
  modelId: string,
  effort: ReasoningEffort,
  customProviders: CustomProviderConfig[],
): { providerOptions: Record<string, unknown>; applyMaskMiddleware: boolean } {
  if (effort === 'auto' || !modelId.startsWith('custom-')) {
    return { providerOptions: {}, applyMaskMiddleware: false };
  }
  const tier = effort as EffortTier;

  const backend = resolveCustomBackend(modelId, customProviders);
  if (!backend) {
    return { providerOptions: {}, applyMaskMiddleware: tier === 'off' };
  }

  if (backend.backendKind === 'llamacpp') {
    return {
      providerOptions: {
        [backend.providerId]: {
          chat_template_kwargs: { enable_thinking: tier !== 'off' },
          thinking_budget_tokens: LLAMACPP_THINKING_BUDGET_MAP[tier],
        },
      },
      applyMaskMiddleware: false,
    };
  }

  if (backend.backendKind === 'vllm') {
    if (tier === 'off') {
      // No universal "disable" for vLLM's passthrough reasoning_effort —
      // fall back to masking the output instead of guessing a template kwarg.
      return { providerOptions: {}, applyMaskMiddleware: true };
    }
    return {
      providerOptions: { [backend.providerId]: { reasoning_effort: OPENAI_STYLE_EFFORT_MAP[tier] } },
      applyMaskMiddleware: false,
    };
  }

  // Ollama / unknown: no real control available, only hide the output.
  return { providerOptions: {}, applyMaskMiddleware: tier === 'off' };
}

// Generic per-provider-family reasoning overrides for zetora-* (first-party)
// models, used by tertiary tasks (chat-title, follow-up, memory-curator...).
// Main search has its own richer per-model logic already — see
// lib/search/provider-options.ts — this is intentionally simpler since
// tertiary tasks only need the reasoning knob, nothing else.
export function getZetoraReasoningOverrides(
  modelId: string,
  effort: ReasoningEffort,
): { providerOptions: Record<string, unknown> } {
  if (effort === 'auto' || !getModelConfig(modelId)?.reasoning) {
    return { providerOptions: {} };
  }
  const tier = effort as EffortTier;

  switch (getModelProvider(modelId)) {
    case 'openai':
      return { providerOptions: { openai: { reasoningEffort: OPENAI_STYLE_EFFORT_MAP[tier] } } };
    case 'anthropic':
      return {
        providerOptions: {
          anthropic:
            tier === 'off'
              ? { thinking: { type: 'disabled' } }
              : { sendReasoning: true, thinking: { type: 'enabled', budgetTokens: ANTHROPIC_BUDGET_TOKENS_MAP[tier] } },
        },
      };
    case 'google':
      return {
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: GOOGLE_THINKING_BUDGET_MAP[tier], includeThoughts: tier !== 'off' },
          },
          vertex: {
            thinkingConfig: { thinkingBudget: GOOGLE_THINKING_BUDGET_MAP[tier], includeThoughts: tier !== 'off' },
          },
        },
      };
    default:
      // Provider not mapped to a generic reasoning param (e.g. served via
      // Groq/gateway routing) — no-op rather than guessing a shape.
      return { providerOptions: {} };
  }
}
