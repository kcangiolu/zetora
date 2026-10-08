import { getMaxOutputTokens, getModelConfig } from '@/ai/models';
import type { SpecialModeId } from '@/lib/utils';
import { GroqProviderOptions } from '@ai-sdk/groq';
import { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { GoogleGenerativeAIProviderOptions, GoogleLanguageModelOptions } from '@ai-sdk/google';
import { CohereChatModelOptions } from '@ai-sdk/cohere';
import {
  type ReasoningEffort,
  OPENAI_STYLE_EFFORT_MAP,
  getAnthropicThinkingOptions,
  getGeminiThinkingConfig,
} from '@/lib/reasoning-effort';
import { withReasoningSwitch } from '@/ai/reasoning-switch-model';

// Claude models whose thinking follows the reasoning-effort toggle.
const CLAUDE_THINKING_MODELS = new Set([
  'zetora-anthropic',
  'zetora-anthropic-opus',
  'zetora-anthropic-sonnet-4.6',
  'zetora-anthropic-opus-4.6',
  'zetora-anthropic-sonnet-5',
  'zetora-anthropic-opus-4.7',
  'zetora-anthropic-opus-4.8',
]);

// The catalog's reasoning flag marks the Gemini entries whose thinking
// follows the reasoning-effort toggle.
function isGeminiThinkingModel(model: string): boolean {
  const config = getModelConfig(model);
  return (config?.provider === 'google' || config?.provider === 'vertex') && config.reasoning === true;
}

export async function getStreamTextStaticSettings({
  model,
  specialMode,
  shouldUseXaiMultiAgent,
  isXmlParsedCustomModel,
}: {
  model: string;
  specialMode: SpecialModeId | string | undefined;
  shouldUseXaiMultiAgent: boolean;
  isXmlParsedCustomModel: boolean;
}): Promise<{
  stopWhenStepCount: number;
  maxRetries: number;
  maxOutputTokens?: number;
  headers?: Record<string, string>;
}> {
  return {
    // XML-parsed local models keep their tools armed on every step (see
    // prepareStep), so the step count is their only hard bound against
    // search-after-search looping: 1 tool round + 1 slack + synthesis.
    stopWhenStepCount: shouldUseXaiMultiAgent
      ? 5
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
    ...(model === 'zetora-anthropic' || model === 'zetora-anthropic-sonnet-4.6' || model === 'zetora-anthropic-opus-4.6'
      ? {
          headers: {
            'anthropic-beta': 'context-1m-2025-08-07',
          },
        }
      : {}),
  };
}

export function getSearchProviderOptions(
  model: string,
  shouldUseXaiMultiAgent: boolean,
  effort: ReasoningEffort = 'auto',
) {
  const thinking = effort !== 'off';
  return {
    ...withReasoningSwitch(thinking),
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
      ...(model === 'zetora-kimi-k2-v2' && thinking
        ? {
            order: ['moonshotai'],
          }
        : {}),
      ...(model === 'zetora-qwen-coder' || model === 'zetora-qwen-235'
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
      ...(model === 'zetora-glm-4.7'
        ? {
            order: ['zai'],
          }
        : {}),
      ...(model === 'zetora-kimi-k2.5'
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
      model === 'zetora-gpt-5.1-codex' ||
      model === 'zetora-gpt-5.1-codex-mini' ||
      model === 'zetora-gpt-5.1-codex-max' ||
      model === 'zetora-gpt-5.2' ||
      model === 'zetora-gpt-5.4' ||
      model === 'zetora-gpt-5.4-mini' ||
      model === 'zetora-gpt-5.4-nano' ||
      model === 'zetora-gpt-5.5' ||
      model === 'zetora-gpt-5.6' ||
      model === 'zetora-gpt-5.4-thinking-xhigh' ||
      model === 'zetora-gpt-5.2-thinking-xhigh' ||
      model === 'zetora-gpt-5.2-codex' ||
      model === 'zetora-gpt-5.3-codex'
        ? {
            reasoningEffort:
              effort !== 'auto'
                ? OPENAI_STYLE_EFFORT_MAP[effort]
                : model === 'zetora-gpt5-nano' || model === 'zetora-gpt5' || model === 'zetora-gpt5-mini'
                  ? 'minimal'
                  : model === 'zetora-gpt-5.2-thinking-xhigh' || model === 'zetora-gpt-5.4-thinking-xhigh'
                    ? 'xhigh'
                    : model === 'zetora-gpt-5.4-mini' || model === 'zetora-gpt-5.4-nano'
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
            model === 'zetora-gpt-5.2' ||
            model === 'zetora-gpt-5.2-codex' ||
            model === 'zetora-gpt-5.3-codex' ||
            model === 'zetora-gpt-5.1-codex' ||
            model === 'zetora-gpt-5.1-codex-mini' ||
            model === 'zetora-gpt-5.1-codex-max' ||
            model === 'zetora-gpt5' ||
            model === 'zetora-gpt5-codex'
              ? {
                  promptCacheRetention: '24h',
                }
              : {}),
            store: false,
            ...(model === 'zetora-gpt-5.4' ||
            model === 'zetora-gpt-5.4-mini' ||
            model === 'zetora-gpt-5.4-nano' ||
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
            model === 'zetora-gpt5-nano' ||
            model === 'zetora-gpt5-mini' ||
            model === 'zetora-gpt-5.4' ||
            model === 'zetora-gpt-5.4-mini' ||
            model === 'zetora-gpt-5.4-nano' ||
            model === 'zetora-gpt-5.4-thinking-xhigh' ||
            model === 'zetora-gpt-5.5' ||
            model === 'zetora-gpt-5.6' ||
            model === 'zetora-gpt-5.1-codex-max' ||
            model === 'zetora-gpt-5.2' ||
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
      ...(model === 'zetora-deepseek-v4.1-flash' || model === 'zetora-deepseek-v4-pro'
        ? effort === 'off'
          ? { thinking: { type: 'disabled' } }
          : {
              thinking: { type: 'enabled' },
              // DeepSeek collapses low/medium into high server-side, so the
              // raw tier can be forwarded as-is (see api-docs.deepseek.com).
              ...(effort !== 'auto' ? { reasoning_effort: effort } : {}),
            }
        : {}),
    },
    groq: {
      ...(model === 'zetora-gpt-oss-20' || model === 'zetora-gpt-oss-120'
        ? {
            reasoningEffort: effort !== 'auto' ? OPENAI_STYLE_EFFORT_MAP[effort] : 'high',
            reasoningFormat: 'hidden',
          }
        : {}),
      ...(model === 'zetora-qwen-3.6-27b'
        ? {
            reasoningEffort: effort !== 'auto' ? OPENAI_STYLE_EFFORT_MAP[effort] : 'none',
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
      ...(model === 'zetora-cmd-a' && thinking
        ? {
            thinking: {
              type: 'enabled',
              tokenBudget: 1000,
            },
          }
        : {}),
    } satisfies CohereChatModelOptions,
    zai: {
      ...(model === 'zetora-glm-4.7' || (model === 'zetora-glm-5' && !thinking)
        ? {
            thinking: {
              type: 'disabled',
              clear_thinking: true,
            },
          }
        : {}),
    },
    anthropic: {
      ...(CLAUDE_THINKING_MODELS.has(model) ? getAnthropicThinkingOptions(model, effort) : {}),
      disableParallelToolUse: true,
    } satisfies AnthropicProviderOptions,
    google: {
      ...(isGeminiThinkingModel(model) ? { thinkingConfig: getGeminiThinkingConfig(model, effort) } : {}),
      threshold: 'OFF',
    } satisfies GoogleGenerativeAIProviderOptions,
    vertex: {
      ...(isGeminiThinkingModel(model) ? { thinkingConfig: getGeminiThinkingConfig(model, effort) } : {}),
      threshold: 'OFF',
    } satisfies GoogleLanguageModelOptions,
    bytedance: {
      reasoningEffort: 'minimal',
    },
    ark: {
      thinking: { type: 'disabled' },
      reasoning: { effort: 'minimal' },
    },
    alibaba: {
      ...(model === 'zetora-qwen-3-max-preview' && thinking
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
            thinking: { type: thinking ? 'enabled' : 'disabled' },
          }
        : {}),
    },
    fireworks: {
      ...(model === 'zetora-kimi-k2.5'
        ? {
            thinking: { type: thinking ? 'enabled' : 'disabled' },
          }
        : {}),
    },
    novita: {
      ...(model === 'zetora-deepseek-chat-exp' && thinking
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
      ...(model === 'zetora-mistral-small' && thinking
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
