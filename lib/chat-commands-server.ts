import 'server-only';
import type { LanguageModel } from 'ai';
import type { SharedV3ProviderOptions } from '@ai-sdk/provider';
import { parseCustomModelId, type CustomProviderConfig } from '@/lib/custom-providers';
import { getModelProvider } from '@/ai/models';
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
  modelOverride?: LanguageModel;
}

// Real prefill (pushing a trailing assistant message the model continues
// verbatim) only works on backends we've verified honor it, and only once
// reasoning is forced off — otherwise the prefix lands inside the hidden
// <think>/thinking block instead of the visible answer (confirmed live
// against a Qwen3 GGUF on llama.cpp: enable_thinking:false was required for
// the prefix to actually surface). No system-prompt fallback: a trailing
// assistant message on a backend that doesn't support continuation is just
// treated as a stale previous turn, which wouldn't reliably honor the prefix
// either — callers should reject the request outright when unsupported.
export function getStartWithStrategy(modelId: string, customProviders: CustomProviderConfig[]): StartWithStrategy {
  if (modelId.startsWith('custom-')) {
    const parsed = parseCustomModelId(modelId, customProviders);
    if (!parsed) return { supported: false };

    if (parsed.provider.backendKind === 'llamacpp') {
      return { supported: true, providerOptions: { [parsed.provider.id]: { enable_thinking: false } } };
    }
    if (parsed.provider.backendKind === 'ollama') {
      return { supported: true, providerOptions: { [parsed.provider.id]: { think: false } } };
    }
    return { supported: false };
  }

  if (getModelProvider(modelId) === 'anthropic') {
    return { supported: true, providerOptions: { anthropic: { thinking: { type: 'disabled' } } } };
  }

  // DeepSeek's beta endpoint disables reasoning automatically in prefix mode
  // (confirmed live: reasoning_content comes back null) — no provider-level
  // override needed here, unlike the backends above.
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
