import { getModelEntry } from '@/ai/catalog/models';
import { getReasoningProviderOptions } from '@/ai/catalog/reasoning';
import type { SharedV3ProviderOptions } from '@ai-sdk/provider';
import type { SpecialModeId } from '@/lib/utils';
import type { GroqProviderOptions } from '@ai-sdk/groq';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { GoogleGenerativeAIProviderOptions, GoogleLanguageModelOptions } from '@ai-sdk/google';
import type { ReasoningEffort } from '@/lib/reasoning-effort';
import { withReasoningSwitch } from '@/ai/reasoning-switch-model';

export async function getStreamTextStaticSettings({
  specialMode,
  isXmlParsedCustomModel,
}: {
  specialMode: SpecialModeId | string | undefined;
  isXmlParsedCustomModel: boolean;
}): Promise<{
  stopWhenStepCount: number;
  maxRetries: number;
}> {
  return {
    // XML-parsed local models keep their tools armed on every step (see
    // prepareStep), so the step count is their only hard bound against
    // search-after-search looping: 1 tool round + 1 slack + synthesis.
    stopWhenStepCount: specialMode === 'mcp' ? 50 : !specialMode ? 15 : isXmlParsedCustomModel ? 3 : 5,
    // Local llama.cpp serves one slot: 10 retries on 10-25k-token prompts
    // stack minutes of dead time, so custom models get a tight budget.
    maxRetries: isXmlParsedCustomModel ? 2 : 10,
  };
}

// Per-provider settings that hold for every model a provider serves: one
// tool call per step (the search loop expects sequential calls), no
// server-side storage.
function getProviderDefaults(): SharedV3ProviderOptions {
  return {
    gateway: {
      only: [
        'openai',
        'google',
        'vertex',
        'zai',
        'arcee-ai',
        'deepseek',
        'alibaba',
        'baseten',
        'minimax',
        'streamlake',
        'fireworks',
        'bedrock',
        'vercel',
        'xai',
        'bytedance',
        'moonshotai',
        'novita',
        'togetherai',
        'inception',
      ],
    },
    openai: {
      parallelToolCalls: false,
      store: false,
      promptCacheKey: 'zetora-oai',
    } satisfies OpenAIResponsesProviderOptions,
    deepseek: { parallelToolCalls: false },
    groq: {
      parallelToolCalls: false,
      structuredOutputs: true,
      serviceTier: 'auto',
    } satisfies GroqProviderOptions,
    xai: {
      parallel_function_calling: false,
      parallel_tool_calls: false,
      parallelToolCalls: false,
    },
    anthropic: { disableParallelToolUse: true } satisfies AnthropicProviderOptions,
    google: { threshold: 'OFF' } satisfies GoogleGenerativeAIProviderOptions,
    vertex: { threshold: 'OFF' } satisfies GoogleLanguageModelOptions,
  };
}

function mergeProviderOptions(base: SharedV3ProviderOptions, extra: SharedV3ProviderOptions): SharedV3ProviderOptions {
  const merged = { ...base };
  for (const [provider, options] of Object.entries(extra)) {
    merged[provider] = { ...merged[provider], ...options };
  }
  return merged;
}

export function getSearchProviderOptions(model: string, effort: ReasoningEffort = 'auto'): SharedV3ProviderOptions {
  const entry = getModelEntry(model);
  const reasoning = entry ? getReasoningProviderOptions(entry, effort) : {};
  return mergeProviderOptions({ ...withReasoningSwitch(effort !== 'off'), ...getProviderDefaults() }, reasoning);
}
