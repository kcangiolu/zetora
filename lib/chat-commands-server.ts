import 'server-only';
import type { LanguageModelV3, SharedV3ProviderOptions } from '@ai-sdk/provider';
import { parseCustomModelId, shouldUseNativeCustomProvider, type CustomProviderConfig } from '@/lib/custom-providers';
import { getModelEntry } from '@/ai/catalog/models';
import { getDeepSeekStartWithModel } from '@/ai/providers';

export interface StartWithStrategy {
  supported: boolean;
  // Call-level, merged into streamText's providerOptions (llama.cpp/Ollama/
  // Anthropic: forces reasoning off so the prefix doesn't land in a hidden
  // thinking block instead of the visible answer).
  providerOptions?: Record<string, unknown>;
  // Message-level, attached only to the pushed prefill message itself — for
  // DeepSeek's `prefix: true` field, which belongs on that one message, not
  // the whole request (see the deepseek branch below). Typed to match
  // ModelMessage['providerOptions'] directly so it can be spread onto that
  // message without a cast.
  assistantMessageProviderOptions?: SharedV3ProviderOptions;
  // Swaps the resolved model for this call only (DeepSeek needs a distinct
  // provider instance pointed at its /beta endpoint — see ai/providers.ts).
  modelOverride?: LanguageModelV3;
}

// Prefill (a trailing assistant message the model continues verbatim) only on backends
// known to honor it, with reasoning forced off so the prefix lands in the visible answer
// rather than the hidden thinking block. Unsupported backends get no fallback: callers
// reject the request.
export function getStartWithStrategy(
  modelId: string,
  customProviders: CustomProviderConfig[],
  hasImages = false,
): StartWithStrategy {
  if (modelId.startsWith('custom-')) {
    const parsed = parseCustomModelId(modelId, customProviders);
    if (!parsed) return { supported: false };

    // Real prefill only exists on the native path — an enrichedShim opt-out
    // or an image-bearing turn routes this request through the
    // OpenAI-compatible shim instead (see shouldUseNativeCustomProvider),
    // where prefill isn't reliable, so it must fall through to the hard
    // rejection below rather than claim support it can't deliver.
    const usingNative = shouldUseNativeCustomProvider(
      parsed.provider.backendKind,
      parsed.provider.enrichedShim,
      hasImages,
    );

    if (usingNative && parsed.provider.backendKind === 'llamacpp') {
      return { supported: true, providerOptions: { [parsed.provider.id]: { enable_thinking: false } } };
    }
    if (usingNative && parsed.provider.backendKind === 'ollama') {
      return { supported: true, providerOptions: { [parsed.provider.id]: { think: false } } };
    }
    return { supported: false };
  }

  if (getModelEntry(modelId)?.lab === 'anthropic') {
    return { supported: true, providerOptions: { anthropic: { thinking: { type: 'disabled' } } } };
  }

  // DeepSeek's beta endpoint turns reasoning off by itself in prefix mode.
  const deepSeekModel = getDeepSeekStartWithModel(modelId);
  if (deepSeekModel) {
    return {
      supported: true,
      modelOverride: deepSeekModel,
      assistantMessageProviderOptions: { openaiCompatible: { prefix: true } },
    };
  }

  return { supported: false };
}
