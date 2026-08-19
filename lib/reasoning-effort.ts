import 'server-only';
import { extractReasoningMiddleware } from 'ai';
import { getModelConfig, getModelProvider } from '@/ai/models';
import { parseCustomModelId, type CustomProviderConfig, type CustomBackendKind } from '@/lib/custom-providers';
import type { ReasoningEffort, ReasoningCapability } from '@/lib/reasoning-effort-types';

export type { ReasoningEffort, ReasoningCapability };

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

// llama.cpp's chat template (ai/native-models/llamacpp-prompt.ts) injects the
// opening <think>\n tag into the rendered PROMPT itself when enable_thinking
// is on — that's how Qwen3-style templates force the model into thinking
// mode. The model's own completion stream therefore never emits a literal
// <think>, only the closing </think> — confirmed live. The default
// startWithReasoning:false variant above scans for the opening tag first and
// never finds it, so it stays in "plain text" mode and lets </think> leak
// straight through. This variant starts already inside reasoning, matching
// ai/providers.ts's middlewareWithStartWithReasoning for the same prefill
// shape on other providers.
export const llamaCppReasoningMaskMiddleware = extractReasoningMiddleware({ tagName: 'think', startWithReasoning: true });

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
    const kind = backend?.backendKind;
    return kind === 'vllm' || kind === 'llamacpp' || kind === 'ollama' || kind === 'openai' ? 'full' : 'mask-only';
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
): { providerOptions: Record<string, unknown>; applyMaskMiddleware: boolean; backendKind?: CustomBackendKind } {
  if (!modelId.startsWith('custom-')) {
    return { providerOptions: {}, applyMaskMiddleware: false };
  }

  const backend = resolveCustomBackend(modelId, customProviders);

  // llama.cpp's native /completion endpoint (ai/native-models/llamacpp-model.ts)
  // never separates <think> output into its own field the way its
  // OpenAI-compatible /v1/chat/completions endpoint can (--reasoning-format) —
  // whatever the model emits streams straight through as one plain-text blob.
  // enable_thinking only controls whether the model reasons at all, not
  // whether the tags get stripped, so this backend must always be masked —
  // including at the default 'auto' effort, where no enable_thinking override
  // is sent at all and the model's own chat-template default decides whether
  // it thinks. extractReasoningMiddleware is a no-op passthrough when the
  // text never contains the tag, so masking unconditionally costs nothing on
  // turns where the model doesn't actually reason.
  if (backend?.backendKind === 'llamacpp') {
    if (effort === 'auto') {
      return { providerOptions: {}, applyMaskMiddleware: true, backendKind: backend.backendKind };
    }
    const tier = effort as EffortTier;
    return {
      providerOptions: {
        // Top-level, not nested under chat_template_kwargs: /completion never
        // applies chat templates server-side (the prompt is already fully
        // rendered client-side by renderLlamaCppPrompt), so enable_thinking
        // only does anything by being read directly off providerOptions —
        // see ai/native-models/llamacpp-model.ts's nativeOptions.enable_thinking.
        [backend.providerId]: {
          enable_thinking: tier !== 'off',
          thinking_budget_tokens: LLAMACPP_THINKING_BUDGET_MAP[tier],
        },
      },
      applyMaskMiddleware: true,
      backendKind: backend.backendKind,
    };
  }

  if (effort === 'auto') {
    return { providerOptions: {}, applyMaskMiddleware: false, backendKind: backend?.backendKind };
  }
  const tier = effort as EffortTier;

  if (!backend) {
    return { providerOptions: {}, applyMaskMiddleware: tier === 'off' };
  }

  if (backend.backendKind === 'ollama') {
    // Ollama's native /api/chat `think` boolean is a real, model-agnostic
    // on/off switch — unlike reasoning_effort strings, it never gets
    // rejected by a model that doesn't recognize the value (ollama/ollama#12004
    // was specifically about guessing an unsupported reasoning_effort string).
    return {
      providerOptions: { [backend.providerId]: { think: tier !== 'off' } },
      applyMaskMiddleware: false,
      backendKind: backend.backendKind,
    };
  }

  if (backend.backendKind === 'vllm' || backend.backendKind === 'openai') {
    if (tier === 'off') {
      // No universal "disable" value is safe to send across these backends —
      // fall back to masking the output instead of guessing a value that
      // might get rejected.
      return { providerOptions: {}, applyMaskMiddleware: true, backendKind: backend.backendKind };
    }
    return {
      providerOptions: { [backend.providerId]: { reasoning_effort: OPENAI_STYLE_EFFORT_MAP[tier] } },
      applyMaskMiddleware: false,
    };
  }

  // unknown: no real control available, only hide the output.
  return { providerOptions: {}, applyMaskMiddleware: tier === 'off' };
}

// Combines the reasoning-tier override above with each provider's static
// nativeParams (mirostat/cache_prompt/guided-decoding field names...) into a
// single providerOptions bag for the resolved custom provider — the one spot
// app/api/search/route.ts needs to merge into streamText's providerOptions.
// Unlike getCustomReasoningOverrides, nativeParams apply regardless of the
// reasoning tier (including 'auto', where the reasoning half is a no-op).
export function getCustomProviderOptions(
  modelId: string,
  effort: ReasoningEffort,
  customProviders: CustomProviderConfig[],
): { providerOptions: Record<string, unknown>; applyMaskMiddleware: boolean; backendKind?: CustomBackendKind } {
  const parsed = parseCustomModelId(modelId, customProviders);
  if (!parsed) {
    return getCustomReasoningOverrides(modelId, effort, customProviders);
  }

  const reasoning = getCustomReasoningOverrides(modelId, effort, customProviders);
  const merged = {
    ...parsed.provider.nativeParams,
    ...(reasoning.providerOptions[parsed.provider.id] as Record<string, unknown> | undefined),
  };

  return {
    providerOptions: Object.keys(merged).length > 0 ? { [parsed.provider.id]: merged } : {},
    applyMaskMiddleware: reasoning.applyMaskMiddleware,
    backendKind: reasoning.backendKind,
  };
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
    case 'deepseek':
      return {
        providerOptions: {
          deepseek:
            tier === 'off'
              ? { thinking: { type: 'disabled' } }
              : { thinking: { type: 'enabled' }, reasoning_effort: tier },
        },
      };
    default:
      // Provider not mapped to a generic reasoning param (e.g. served via
      // Groq/gateway routing) — no-op rather than guessing a shape.
      return { providerOptions: {} };
  }
}
