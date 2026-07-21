import { getMaxOutputTokens } from '@/ai/models';
import type { SpecialModeId } from '@/lib/utils';
import { getExtensionMode } from '@/lib/search/extension-modes';
import { GroqProviderOptions } from '@ai-sdk/groq';
import { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { GoogleGenerativeAIProviderOptions, GoogleLanguageModelOptions } from '@ai-sdk/google';
import { CohereChatModelOptions } from '@ai-sdk/cohere';

export function getStreamTextStaticSettings({
  model,
  specialMode,
  shouldUseXaiMultiAgent,
  isXmlParsedCustomModel,
}: {
  model: string;
  specialMode: SpecialModeId | 'buddy' | string | undefined;
  shouldUseXaiMultiAgent: boolean;
  isXmlParsedCustomModel: boolean;
}): {
  stopWhenStepCount: number;
  maxRetries: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
} {
  const extensionMode = getExtensionMode(specialMode);
  return {
    // XML-parsed local models keep their tools armed on every step (see
    // prepareStep), so the step count is their only hard bound against
    // search-after-search looping: 1 tool round + 1 slack + synthesis.
    stopWhenStepCount: shouldUseXaiMultiAgent
      ? 5
      : extensionMode
        ? (extensionMode.stepCount ?? 25)
        : specialMode === 'mcp'
          ? 50
          : !specialMode
            ? 15
            : isXmlParsedCustomModel
              ? 3
              : 5,
    // Local llama.cpp serves one slot: 10 retries on 10-25k-token prompts
    // stack minutes of dead time, so custom models get a tight budget.
    maxRetries: isXmlParsedCustomModel ? 2 : 10,
    ...(shouldUseXaiMultiAgent
      ? {}
      : model === 'zetora-default' ||
          model === 'zetora-grok4.1-fast-thinking' ||
          model === 'zetora-glm-4.6' ||
          model === 'zetora-glm-4.6v-flash' ||
          model === 'zetora-glm-4.6v'
        ? {
            maxOutputTokens: getMaxOutputTokens(model),
          }
        : {}),
    ...(model === 'zetora-anthropic' ||
    model === 'zetora-anthropic-think' ||
    model === 'zetora-anthropic-sonnet-4.6' ||
    model === 'zetora-anthropic-sonnet-4.6-think' ||
    model === 'zetora-anthropic-opus-4.6' ||
    model === 'zetora-anthropic-opus-4.6-think'
      ? {
          headers: {
            'anthropic-beta': 'context-1m-2025-08-07',
          },
        }
      : {}),
  };
}

export function getSearchProviderOptions(model: string, shouldUseXaiMultiAgent: boolean) {
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
      ...(model === 'zetora-kimi-k2-v2-thinking'
        ? {
            order: ['moonshotai'],
          }
        : {}),
      ...(model === 'zetora-qwen-coder' || model === 'zetora-deepseek-v3' || model === 'zetora-qwen-235'
        ? {
            order: ['baseten'],
          }
        : {}),
      ...(model === 'zetora-nova-2-lite'
        ? {
            order: ['bedrock'],
          }
        : {}),
      ...(model === 'zetora-kat-coder'
        ? {
            order: ['streamlake'],
          }
        : {}),
      ...(model === 'zetora-glm-4.7' || model === 'zetora-glm-4.7-flash'
        ? {
            order: ['zai'],
          }
        : {}),
      ...(model === 'zetora-kimi-k2.5' || model === 'zetora-kimi-k2.5-thinking'
        ? {
            order: ['fireworks'],
          }
        : {}),
    },
    'workersai.chat': {
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    sarvam: {
      reasoning_effort: 'high',
    },
    openai: {
      ...(model !== 'zetora-qwen-coder'
        ? {
            parallelToolCalls: false,
          }
        : {}),
      ...((model === 'zetora-gpt5' ||
      model === 'zetora-gpt5-mini' ||
      model === 'zetora-o3' ||
      model === 'zetora-gpt5-nano' ||
      model === 'zetora-gpt5-codex' ||
      model === 'zetora-gpt5-medium' ||
      model === 'zetora-o4-mini' ||
      model === 'zetora-gpt-4.1' ||
      model === 'zetora-gpt-4.1-mini' ||
      model === 'zetora-gpt-4.1-nano' ||
      model === 'zetora-gpt-5.1' ||
      model === 'zetora-gpt-5.1-thinking' ||
      model === 'zetora-gpt-5.1-codex' ||
      model === 'zetora-gpt-5.1-codex-mini' ||
      model === 'zetora-gpt-5.1-codex-max' ||
      model === 'zetora-gpt-5.2' ||
      model === 'zetora-gpt-5.4' ||
      model === 'zetora-gpt-5.4-mini' ||
      model === 'zetora-gpt-5.4-nano' ||
      model === 'zetora-gpt-5.4-thinking' ||
      model === 'zetora-gpt-5.4-thinking-xhigh' ||
      model === 'zetora-gpt-5.2-thinking' ||
      model === 'zetora-gpt-5.2-thinking-xhigh' ||
      model === 'zetora-gpt-5.2-codex' ||
      model === 'zetora-gpt-5.3-codex'
        ? {
            reasoningEffort:
              model === 'zetora-gpt5-nano' || model === 'zetora-gpt5' || model === 'zetora-gpt5-mini'
                ? 'minimal'
                : model === 'zetora-gpt-5.2-thinking-xhigh' || model === 'zetora-gpt-5.4-thinking-xhigh'
                  ? 'xhigh'
                  : model === 'zetora-gpt-5.1' ||
                      model === 'zetora-gpt-5.2' ||
                      model === 'zetora-gpt-5.4' ||
                      model === 'zetora-gpt-5.4-mini' ||
                      model === 'zetora-gpt-5.4-nano'
                    ? 'none'
                    : 'medium',
            parallelToolCalls:
              model === 'zetora-gpt-5.2-thinking-xhigh' || model === 'zetora-gpt-5.4-thinking-xhigh' ? true : false,
            reasoningSummary: 'detailed',
            promptCacheKey: 'zetora-oai',
            ...(model === 'zetora-gpt-5.1' ||
            model === 'zetora-gpt-5.4' ||
            model === 'zetora-gpt-5.4-mini' ||
            model === 'zetora-gpt-5.4-nano' ||
            model === 'zetora-gpt-5.4-thinking' ||
            model === 'zetora-gpt-5.2' ||
            model === 'zetora-gpt-5.2-thinking' ||
            model === 'zetora-gpt-5.2-codex' ||
            model === 'zetora-gpt-5.3-codex' ||
            model === 'zetora-gpt-5.1-codex' ||
            model === 'zetora-gpt-5.1-codex-mini' ||
            model === 'zetora-gpt-5.1-codex-max' ||
            model === 'zetora-gpt5' ||
            model === 'zetora-gpt5-codex' ||
            // Pre-existing comparison: 'zetora-gpt4.1' (sans dash) can never
            // match inside this branch — kept verbatim from the route.
            (model as string) === 'zetora-gpt4.1'
              ? {
                  promptCacheRetention: '24h',
                }
              : {}),
            store: false,
            ...(model === 'zetora-gpt-5.4' ||
            model === 'zetora-gpt-5.4-mini' ||
            model === 'zetora-gpt-5.4-nano' ||
            model === 'zetora-gpt-5.4-thinking' ||
            model === 'zetora-gpt-5.4-thinking-xhigh'
              ? {
                  serviceTier: 'priority',
                }
              : {}),
            // only for reasoning models
            ...(model === 'zetora-gpt-5.1' ||
            model === 'zetora-gpt-5.1-codex' ||
            model === 'zetora-gpt-5.1-codex-mini' ||
            model === 'zetora-gpt5' ||
            model === 'zetora-gpt5-codex' ||
            model === 'zetora-gpt-5.1-thinking' ||
            model === 'zetora-gpt5-nano' ||
            model === 'zetora-gpt5-mini' ||
            model === 'zetora-gpt-5.4' ||
            model === 'zetora-gpt-5.4-mini' ||
            model === 'zetora-gpt-5.4-nano' ||
            model === 'zetora-gpt-5.4-thinking' ||
            model === 'zetora-gpt-5.4-thinking-xhigh' ||
            model === 'zetora-gpt-5.1-codex-max' ||
            model === 'zetora-gpt-5.2' ||
            model === 'zetora-gpt-5.2-thinking' ||
            model === 'zetora-gpt-5.2-codex' ||
            model === 'zetora-gpt-5.3-codex'
              ? {
                  include: ['reasoning.encrypted_content'],
                }
              : {}),
            textVerbosity:
              model === 'zetora-o3' ||
              model === 'zetora-gpt5-codex' ||
              model === 'zetora-gpt-5.1-codex' ||
              model === 'zetora-gpt-5.1-codex-mini' ||
              model === 'zetora-gpt-5.1-codex-max' ||
              model === 'zetora-gpt-5.2-codex' ||
              model === 'zetora-gpt-5.3-codex' ||
              model === 'zetora-o4-mini' ||
              model === 'zetora-gpt-4.1' ||
              model === 'zetora-gpt-4.1-mini' ||
              model === 'zetora-gpt-4.1-nano'
                ? 'medium'
                : 'high',
          }
        : {}) satisfies OpenAIResponsesProviderOptions),
    },
    deepseek: {
      parallelToolCalls: false,
    },
    groq: {
      ...(model === 'zetora-gpt-oss-20' || model === 'zetora-gpt-oss-120'
        ? {
            reasoningEffort: 'high',
            reasoningFormat: 'hidden',
          }
        : {}),
      ...(model === 'zetora-qwen-32b'
        ? {
            reasoningEffort: 'none',
          }
        : {}),
      parallelToolCalls: false,
      structuredOutputs: true,
      serviceTier: 'auto',
    } satisfies GroqProviderOptions,
    xai: shouldUseXaiMultiAgent
      ? {
          reasoningEffort: 'high',
          parallel_function_calling: true,
          parallel_tool_calls: true,
          parallelToolCalls: true,
          paralelFunctionCalling: true,
        }
      : {
          parallel_function_calling: false,
          parallel_tool_calls: false,
          parallelToolCalls: false,
          paralelFunctionCalling: false,
        },
    anannas: {
      parallel_function_calling: false,
      parallel_tool_calls: false,
    },
    cohere: {
      ...(model === 'zetora-cmd-a-think'
        ? {
            thinking: {
              type: 'enabled',
              tokenBudget: 1000,
            },
          }
        : {}),
    } satisfies CohereChatModelOptions,
    zai: {
      ...(model === 'zetora-glm-4.7' ||
      model === 'zetora-glm-4.7-flash' ||
      model === 'zetora-glm-5' ||
      model === 'zetora-pony-alpha-2'
        ? {
            thinking: {
              type: 'disabled',
              clear_thinking: true,
            },
          }
        : {}),
    },
    anthropic: {
      ...(model === 'zetora-anthropic-think' || model === 'zetora-anthropic-opus-think'
        ? {
            sendReasoning: true,
            thinking: {
              type: 'enabled',
              budgetTokens: 4000,
            },
          }
        : {}),
      ...(model === 'zetora-anthropic-sonnet-4.6-think' || model === 'zetora-anthropic-opus-4.6-think'
        ? {
            sendReasoning: true,
            thinking: {
              type: 'adaptive' as const,
            },
            effort: 'medium' as const,
          }
        : {}),
      disableParallelToolUse: true,
    } satisfies AnthropicProviderOptions,
    google: {
      ...(model === 'zetora-google-think' || model === 'zetora-google-pro-think'
        ? {
            thinkingConfig: {
              thinkingBudget: 400,
              includeThoughts: true,
            },
          }
        : {}),
      ...(model === 'zetora-gemini-3-flash-think' ||
      model === 'zetora-gemini-3.1-pro' ||
      model === 'zetora-gemini-3.1-flash-lite-think'
        ? {
            thinkingConfig: {
              thinkingLevel: 'medium',
              includeThoughts: true,
            },
          }
        : {}),
      threshold: 'OFF',
    } satisfies GoogleGenerativeAIProviderOptions,
    vertex: {
      ...(model === 'zetora-gemini-3-flash-think' ||
      model === 'zetora-gemini-3.1-pro' ||
      model === 'zetora-gemini-3.1-flash-lite-think'
        ? {
            thinkingConfig: {
              thinkingLevel: 'medium',
              includeThoughts: true,
            },
          }
        : {}),
      threshold: 'OFF',
    } satisfies GoogleLanguageModelOptions,
    openrouter: {
      ...(model === 'zetora-anthropic-think' || model === 'zetora-anthropic-opus-think'
        ? {
            reasoning: {
              exclude: false,
              max_tokens: 400,
            },
          }
        : {}),
      // ...(model === "zetora-pony-alpha" ? {
      //   reasoning: {
      //     exclude: true,
      //   },
      // } : {}),
    },
    bytedance: {
      reasoningEffort: 'minimal',
    },
    ark: {
      thinking: { type: 'disabled' },
      reasoning: { effort: 'minimal' },
    },
    alibaba: {
      ...(model === 'zetora-qwen-3-max-preview-thinking'
        ? {
            enable_thinking: true,
          }
        : {}),
      ...(model === 'zetora-qwen-3.5-flash'
        ? {
            enable_thinking: false,
          }
        : {}),
    },
    moonshotai: {
      ...(model === 'zetora-kimi-k2.5'
        ? {
            thinking: { type: 'disabled' },
          }
        : {}),
      ...(model === 'zetora-kimi-k2.5-thinking'
        ? {
            thinking: { type: 'enabled' },
          }
        : {}),
    },
    fireworks: {
      ...(model === 'zetora-kimi-k2.5'
        ? {
            thinking: { type: 'disabled' },
          }
        : {}),
      ...(model === 'zetora-kimi-k2.5-thinking'
        ? {
            thinking: { type: 'enabled' },
          }
        : {}),
    },
    novita: {
      ...(model === 'zetora-deepseek-chat-think-exp'
        ? {
            enable_thinking: true,
          }
        : {}),
      ...(model === 'zetora-qwen-3.5'
        ? {
            enable_thinking: false,
          }
        : {}),
    },
    mistral: {
      ...(model === 'zetora-mistral-small-think'
        ? {
            reasoning_effort: 'high',
          }
        : {}),
    },
    inception: {
      ...(model === 'zetora-mercury-2'
        ? {
            reasoning_effort: 'high',
            reasoning_summary: true,
            reasoning_summary_wait: true,
          }
        : {}),
    },
  };
}
