import 'server-only';
import { extractReasoningMiddleware, type LanguageModelMiddleware } from 'ai';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { getModelEntry } from '@/ai/catalog/models';
import { getReasoningCapabilityFor, getReasoningProviderOptions } from '@/ai/catalog/reasoning';
import { withReasoningSwitch } from '@/ai/reasoning-switch-model';
import {
  parseCustomModelId,
  shouldUseNativeCustomProvider,
  type CustomProviderConfig,
  type CustomBackendKind,
} from '@/lib/custom-providers';
import type { ReasoningEffort, ReasoningCapability } from '@/lib/reasoning-effort-types';

export type { ReasoningEffort, ReasoningCapability };

type EffortTier = Exclude<ReasoningEffort, 'auto'>;

// OpenAI-style low/medium/high/none strings, as vLLM's and other
// OpenAI-compatible servers' reasoning_effort expects them.
const OPENAI_STYLE_EFFORT_MAP: Record<EffortTier, 'low' | 'medium' | 'high' | 'none'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  off: 'none',
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

// With enable_thinking on, llama.cpp's chat template (ai/native-models/llamacpp-prompt.ts)
// puts the opening <think> in the prompt, so the stream only ever emits </think>. This
// variant starts inside reasoning, like ai/providers.ts's middlewareWithStartWithReasoning;
// the default one would wait for an opening tag and leak </think> as text.
export const llamaCppReasoningMaskMiddleware = extractReasoningMiddleware({
  tagName: 'think',
  startWithReasoning: true,
});

// For OpenAI-compatible backends that return reasoning in a structured field
// (reasoning_content: llama.cpp --reasoning-format, vLLM --reasoning-parser). The
// provider turns it into reasoning parts, which extractReasoningMiddleware never
// sees (it only reads text deltas), so this drops them. Only for an explicit 'off'.
export const dropReasoningPartsMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  wrapGenerate: async ({ doGenerate }) => {
    const { content, ...rest } = await doGenerate();
    return { content: content.filter((part) => part.type !== 'reasoning'), ...rest };
  },
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();
    return {
      stream: stream.pipeThrough(
        new TransformStream<LanguageModelV3StreamPart, LanguageModelV3StreamPart>({
          transform(chunk, controller) {
            if (
              chunk.type === 'reasoning-start' ||
              chunk.type === 'reasoning-delta' ||
              chunk.type === 'reasoning-end'
            ) {
              return;
            }
            controller.enqueue(chunk);
          },
        }),
      ),
      ...rest,
    };
  },
};

function resolveCustomBackend(modelId: string, customProviders: CustomProviderConfig[]) {
  const parsed = parseCustomModelId(modelId, customProviders);
  if (!parsed) return null;
  return {
    providerId: parsed.provider.id,
    backendKind: parsed.provider.backendKind,
    enrichedShim: parsed.provider.enrichedShim,
  };
}

export function getReasoningCapability(
  modelId: string,
  customProviders: CustomProviderConfig[] = [],
): ReasoningCapability {
  if (modelId.startsWith('custom-')) {
    const backend = resolveCustomBackend(modelId, customProviders);
    if (!backend) return 'mask-only';

    // 'openai' is the one backend kind whose whole premise is following the
    // OpenAI reasoning_effort convention, low/medium/high included — a
    // compliant server is expected to honor it, so it keeps 'full'. The
    // other three backend kinds have each been checked against their actual
    // wire behavior (see getCustomReasoningOverrides) and none of them give
    // low/medium/high any real, distinct effect, so they never report 'full'.
    if (backend.backendKind === 'openai') return 'full';

    // No per-turn hasImages signal is available here (this drives a static
    // per-provider badge, not a per-message one) — computed as if this turn
    // has no image, i.e. the best case. An image attached to a specific turn
    // still silently demotes llamacpp/ollama to the shim server-side
    // (shouldUseNativeCustomProvider), which this badge won't reflect.
    const usingNative = shouldUseNativeCustomProvider(backend.backendKind, backend.enrichedShim, false);

    if (backend.backendKind === 'llamacpp') {
      // Native: enable_thinking is really injected into the rendered prompt.
      // Shim: chat_template_kwargs.enable_thinking is sent, but only works if
      // the model's own template reads that variable. Either way,
      // thinking_budget_tokens/reasoning_effort levels are decorative (see
      // getCustomReasoningOverrides) — only on/off is ever exposed.
      return usingNative ? 'binary-guaranteed' : 'best-effort';
    }

    if (backend.backendKind === 'vllm') {
      // Always shim (no native path exists for vLLM) — same
      // chat_template_kwargs.enable_thinking caveat as llama.cpp's shim.
      return 'best-effort';
    }

    if (backend.backendKind === 'ollama') {
      // Native: `think` is a real, model-agnostic boolean — guaranteed, but
      // Ollama's native API has no graduated effort levels at all. Shim: no
      // disable parameter is sent at all (Ollama's OpenAI-compat surface
      // isn't Jinja-based the same way), so it's mask-only, same as an
      // unknown backend.
      return usingNative ? 'binary-guaranteed' : 'mask-only';
    }

    return 'mask-only';
  }
  const entry = getModelEntry(modelId);
  return entry ? getReasoningCapabilityFor(entry) : null;
}

// Overrides for custom (OpenAI-compatible) providers only — catalog models
// get theirs from ai/catalog/reasoning.ts.
export function getCustomReasoningOverrides(
  modelId: string,
  effort: ReasoningEffort,
  customProviders: CustomProviderConfig[],
  hasImages = false,
): {
  providerOptions: Record<string, unknown>;
  applyMaskMiddleware: boolean;
  backendKind?: CustomBackendKind;
  // Whether this request actually routes through the native llama.cpp/Ollama
  // provider (see shouldUseNativeCustomProvider) — an enrichedShim opt-out or
  // an image-bearing turn demotes a llamacpp/ollama provider to the shim, in
  // which case it must NOT get the native-only providerOptions/mask shape
  // below, even though backendKind itself still reports 'llamacpp'/'ollama'.
  usingNative?: boolean;
} {
  if (!modelId.startsWith('custom-')) {
    return { providerOptions: {}, applyMaskMiddleware: false };
  }

  const backend = resolveCustomBackend(modelId, customProviders);
  const usingNative = shouldUseNativeCustomProvider(backend?.backendKind, backend?.enrichedShim, hasImages);

  // llama.cpp's native /completion endpoint streams <think> output as plain text,
  // whatever enable_thinking says, so it is always masked, 'auto' included (the
  // mask is a passthrough when no tag appears). enrichedShim/hasImages turns take
  // the generic shim branch below instead.
  if (usingNative && backend?.backendKind === 'llamacpp') {
    if (effort === 'auto') {
      return { providerOptions: {}, applyMaskMiddleware: true, backendKind: backend.backendKind, usingNative };
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
      usingNative,
    };
  }

  if (effort === 'auto') {
    return { providerOptions: {}, applyMaskMiddleware: false, backendKind: backend?.backendKind, usingNative };
  }
  const tier = effort as EffortTier;

  if (!backend) {
    return { providerOptions: {}, applyMaskMiddleware: tier === 'off', usingNative };
  }

  if (usingNative && backend.backendKind === 'ollama') {
    // Ollama's native /api/chat `think` boolean is a real, model-agnostic
    // on/off switch — unlike reasoning_effort strings, it never gets
    // rejected by a model that doesn't recognize the value (ollama/ollama#12004
    // was specifically about guessing an unsupported reasoning_effort string).
    // Only applies when the native path is actually in use — before native
    // providers existed, an ollama-classified provider always went through
    // the generic reasoning_effort branch below; enrichedShim reproduces that.
    return {
      providerOptions: { [backend.providerId]: { think: tier !== 'off' } },
      applyMaskMiddleware: false,
      backendKind: backend.backendKind,
      usingNative,
    };
  }

  // vllm/openai always land here. A llamacpp/ollama provider also lands here
  // whenever usingNative is false (enrichedShim opt-out, or an image turn
  // bounced this request to the shim) — the same generic reasoning_effort
  // string shape those backends have always used, matching the exact
  // pre-native behavior for llamacpp/ollama providers.
  const demotedToShim = (backend.backendKind === 'llamacpp' || backend.backendKind === 'ollama') && !usingNative;
  if (backend.backendKind === 'vllm' || backend.backendKind === 'openai' || demotedToShim) {
    if (tier === 'off') {
      // An unknown 'openai'-kind API may reject unrecognized fields, so 'off'
      // relies on masking (and dropReasoningPartsMiddleware). vLLM and llama.cpp
      // pass chat_template_kwargs to their Jinja template, where unknown keys are
      // ignored, so they also get the real enable_thinking switch.
      const supportsTemplateKwargs =
        backend.backendKind === 'vllm' || (demotedToShim && backend.backendKind === 'llamacpp');
      return {
        providerOptions: supportsTemplateKwargs
          ? { [backend.providerId]: { chat_template_kwargs: { enable_thinking: false } } }
          : {},
        applyMaskMiddleware: true,
        backendKind: backend.backendKind,
        usingNative,
      };
    }
    return {
      providerOptions: { [backend.providerId]: { reasoning_effort: OPENAI_STYLE_EFFORT_MAP[tier] } },
      applyMaskMiddleware: false,
      backendKind: backend.backendKind,
      usingNative,
    };
  }

  // unknown: no real control available, only hide the output.
  return { providerOptions: {}, applyMaskMiddleware: tier === 'off', backendKind: backend.backendKind, usingNative };
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
  hasImages = false,
): {
  providerOptions: Record<string, unknown>;
  applyMaskMiddleware: boolean;
  backendKind?: CustomBackendKind;
  usingNative?: boolean;
} {
  const parsed = parseCustomModelId(modelId, customProviders);
  if (!parsed) {
    return getCustomReasoningOverrides(modelId, effort, customProviders, hasImages);
  }

  const reasoning = getCustomReasoningOverrides(modelId, effort, customProviders, hasImages);
  const merged = {
    ...parsed.provider.nativeParams,
    ...(reasoning.providerOptions[parsed.provider.id] as Record<string, unknown> | undefined),
  };

  return {
    providerOptions: Object.keys(merged).length > 0 ? { [parsed.provider.id]: merged } : {},
    applyMaskMiddleware: reasoning.applyMaskMiddleware,
    backendKind: reasoning.backendKind,
    usingNative: reasoning.usingNative,
  };
}

// Reasoning overrides for a catalog model, used by tertiary tasks
// (chat-title, follow-up, memory-curator...).
export function getCatalogReasoningOverrides(
  modelId: string,
  effort: ReasoningEffort,
): { providerOptions: Record<string, unknown> } {
  const entry = getModelEntry(modelId);
  if (effort === 'auto' || !entry?.reasoning) {
    return { providerOptions: {} };
  }
  // Models that pair two upstream models pick one from this flag (see
  // ai/reasoning-switch-model.ts); every other provider ignores it.
  return {
    providerOptions: { ...withReasoningSwitch(effort !== 'off'), ...getReasoningProviderOptions(entry, effort) },
  };
}
