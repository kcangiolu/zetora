import 'server-only';

import { wrapLanguageModel, customProvider, extractReasoningMiddleware, gateway } from 'ai';
import { dynamicXmlToolMiddleware } from '@/ai/xml-tool-middleware';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createWebSocketFetch } from 'ai-sdk-openai-websocket-fetch';
import { xai } from '@ai-sdk/xai';
import { groq } from '@ai-sdk/groq';
import { mistral } from '@ai-sdk/mistral';
import { google } from '@ai-sdk/google';
import { baseten } from '@ai-sdk/baseten';
import { anthropic } from '@ai-sdk/anthropic';
import { cohere } from '@ai-sdk/cohere';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createRetryable } from 'ai-retry';
import { createWorkersAI } from 'workers-ai-provider';

const hasKey = (key: string | undefined): key is string => !!key && !key.startsWith('placeholder');

const ark = hasKey(process.env.ARK_API_KEY)
  ? createOpenAICompatible({
      name: 'ark',
      baseURL: 'https://ark.ap-southeast.bytepluses.com/api/v3',
      apiKey: process.env.ARK_API_KEY,
    })
  : null;

const sarvam = hasKey(process.env.SARVAM_API_KEY)
  ? createOpenAICompatible({
      name: 'sarvam',
      baseURL: 'https://api.sarvam.ai/v1',
      apiKey: process.env.SARVAM_API_KEY,
    })
  : null;

const zai = hasKey(process.env.ZAI_API_KEY)
  ? createOpenAICompatible({
      name: 'zai',
      baseURL: 'https://api.z.ai/api/paas/v4',
      apiKey: process.env.ZAI_API_KEY,
    })
  : null;

const middleware = extractReasoningMiddleware({
  tagName: 'think',
});

const middlewareWithStartWithReasoning = extractReasoningMiddleware({
  tagName: 'think',
  startWithReasoning: true,
});

const huggingface = hasKey(process.env.HF_TOKEN)
  ? createOpenAICompatible({
      name: 'huggingface',
      baseURL: 'https://router.huggingface.co/v1',
      apiKey: process.env.HF_TOKEN,
    })
  : null;

const novita = hasKey(process.env.NOVITA_API_KEY)
  ? createOpenAICompatible({
      name: 'novita',
      baseURL: 'https://api.novita.ai/openai',
      apiKey: process.env.NOVITA_API_KEY,
    })
  : null;

const workersai =
  hasKey(process.env.CLOUDFLARE_ACCOUNT_ID) && hasKey(process.env.CLOUDFLARE_API_TOKEN)
    ? createWorkersAI({
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
        apiKey: process.env.CLOUDFLARE_API_TOKEN!,
      })
    : null;

const openrouter = hasKey(process.env.OPENROUTER_API_KEY)
  ? createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://zetoraai.in',
        'X-Title': 'Zetora AI',
        'Content-Type': 'application/json',
      },
    })
  : null;

const minimax = hasKey(process.env.MINIMAX_API_KEY)
  ? createOpenAICompatible({
      name: 'minimax',
      baseURL: 'https://api.minimax.io/v1',
      apiKey: process.env.MINIMAX_API_KEY,
    })
  : null;

const wsFetch = createWebSocketFetch();

const openai = hasKey(process.env.OPENAI_API_KEY) ? createOpenAI({ fetch: wsFetch }) : null;

const openai_2 = hasKey(process.env.OPENAI_API_KEY_2)
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY_2, fetch: wsFetch })
  : null;

const _xai = hasKey(process.env.XAI_API_KEY) ? xai : null;
const _groq = hasKey(process.env.GROQ_API_KEY) ? groq : null;
const _mistral = hasKey(process.env.MISTRAL_API_KEY) ? mistral : null;
const _google = hasKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY) ? google : null;
const _baseten = hasKey(process.env.BASETEN_API_KEY) ? baseten : null;
const _anthropic = hasKey(process.env.ANTHROPIC_API_KEY) ? anthropic : null;
const _cohere = hasKey(process.env.COHERE_API_KEY) ? cohere : null;

export const zetora = customProvider({
  languageModels: {
    ...(huggingface ? { 'zetora-arch-router': huggingface.chatModel('katanemo/Arch-Router-1.5B:hf-inference') } : {}),

    ...(_xai
      ? {
          'zetora-default': _xai('grok-4-1-fast-non-reasoning'),
          'zetora-auto': _xai('grok-4-1-fast-non-reasoning'),
          'zetora-grok4.1-fast-thinking': _xai('grok-4-1-fast-reasoning'),
          'zetora-ext-1': createRetryable({
            model: _xai('grok-4-1-fast-reasoning'),
            retries: [gateway('xai/grok-4.1-fast-reasoning')],
          }),
          'zetora-ext-8': _xai('grok-4.20-experimental-beta-0304-non-reasoning'),
          'zetora-grok-3-mini': _xai('grok-3-mini'),
          'zetora-grok-3': _xai('grok-3'),
          'zetora-grok-4': _xai('grok-4'),
          'zetora-grok-4.5': _xai('grok-4.5'),
          'zetora-grok-4.20-experimental-beta-0304': _xai('grok-4.20-non-reasoning-latest'),
          'zetora-grok-4.20-experimental-beta-0304-thinking': _xai('grok-4.20-reasoning-latest'),
          'zetora-grok-4-fast': _xai('grok-4-fast-non-reasoning'),
          'zetora-grok-4-fast-think': _xai('grok-4-fast-reasoning'),
          'zetora-code': _xai('grok-code-fast-1'),
        }
      : {}),

    ...(sarvam ? { 'zetora-sarvam-105b': sarvam.chatModel('sarvam-105b') } : {}),

    ...(openai && openai_2
      ? {
          'zetora-ext-2': createRetryable({
            model: openai('gpt-5.4'),
            retries: [openai_2('gpt-5.4')],
          }),
          'zetora-gpt-4.1-nano': createRetryable({
            model: openai('gpt-4.1-nano'),
            retries: [openai_2('gpt-4.1-nano')],
          }),
          'zetora-gpt-4.1-mini': createRetryable({
            model: openai('gpt-4.1-mini'),
            retries: [openai_2('gpt-4.1-mini')],
          }),
          'zetora-gpt-4.1': createRetryable({
            model: openai('gpt-4.1'),
            retries: [openai_2('gpt-4.1')],
          }),
          'zetora-gpt-5.1': createRetryable({
            model: openai('gpt-5.1'),
            retries: [openai_2('gpt-5.1')],
          }),
          'zetora-gpt-5.1-thinking': createRetryable({
            model: openai('gpt-5.1'),
            retries: [openai_2('gpt-5.1')],
          }),
          'zetora-gpt-5.2': createRetryable({
            model: openai('gpt-5.2'),
            retries: [openai_2('gpt-5.2')],
          }),
          'zetora-gpt-5.3-chat-latest': createRetryable({
            model: openai('gpt-5.3-chat-latest'),
            retries: [openai_2('gpt-5.3-chat-latest')],
          }),
          'zetora-gpt-5.4': createRetryable({
            model: openai('gpt-5.4'),
            retries: [openai_2('gpt-5.4')],
          }),
          'zetora-gpt-5.4-mini': createRetryable({
            model: openai('gpt-5.4-mini'),
            retries: [openai_2('gpt-5.4-mini')],
          }),
          'zetora-gpt-5.4-nano': createRetryable({
            model: openai('gpt-5.4-nano'),
            retries: [openai_2('gpt-5.4-nano')],
          }),
          'zetora-gpt-5.4-thinking': createRetryable({
            model: openai('gpt-5.4'),
            retries: [openai_2('gpt-5.4')],
          }),
          'zetora-gpt-5.4-thinking-xhigh': createRetryable({
            model: openai('gpt-5.4'),
            retries: [openai_2('gpt-5.4')],
          }),
          'zetora-gpt-5.2-thinking': createRetryable({
            model: openai('gpt-5.2'),
            retries: [openai_2('gpt-5.2')],
          }),
          'zetora-gpt-5.2-thinking-xhigh': createRetryable({
            model: openai('gpt-5.2'),
            retries: [openai_2('gpt-5.2')],
          }),
          'zetora-gpt-5.1-codex': createRetryable({
            model: openai('gpt-5.1-codex'),
            retries: [openai_2('gpt-5.1-codex')],
          }),
          'zetora-gpt-5.1-codex-mini': createRetryable({
            model: openai('gpt-5.1-codex-mini'),
            retries: [openai_2('gpt-5.1-codex-mini')],
          }),
          'zetora-gpt-5.1-codex-max': createRetryable({
            model: openai('gpt-5.1-codex-max'),
            retries: [openai_2('gpt-5.1-codex-max')],
          }),
          'zetora-gpt-5.2-codex': createRetryable({
            model: openai('gpt-5.2-codex'),
            retries: [openai_2('gpt-5.2-codex')],
          }),
          'zetora-gpt-5.3-codex': createRetryable({
            model: openai('gpt-5.3-codex'),
            retries: [openai_2('gpt-5.3-codex')],
          }),
          'zetora-gpt5': createRetryable({
            model: openai('gpt-5'),
            retries: [openai_2('gpt-5')],
          }),
          'zetora-gpt5-medium': createRetryable({
            model: openai('gpt-5'),
            retries: [openai_2('gpt-5')],
          }),
          'zetora-gpt5-mini': createRetryable({
            model: openai('gpt-5-mini'),
            retries: [openai_2('gpt-5-mini')],
          }),
          'zetora-gpt5-nano': createRetryable({
            model: openai('gpt-5-nano'),
            retries: [openai_2('gpt-5-nano')],
          }),
          'zetora-o3': createRetryable({
            model: openai('o3'),
            retries: [openai_2('o3')],
          }),
          'zetora-o4-mini': createRetryable({
            model: openai('o4-mini'),
            retries: [openai_2('o4-mini')],
          }),
          'zetora-gpt5-codex': createRetryable({
            model: openai('gpt-5-codex'),
            retries: [openai_2('gpt-5-codex')],
          }),
          'zetora-gpt-5.5': createRetryable({
            model: openai('gpt-5.5'),
            retries: [openai_2('gpt-5.5')],
          }),
          'zetora-gpt-5.5-thinking': createRetryable({
            model: openai('gpt-5.5'),
            retries: [openai_2('gpt-5.5')],
          }),
          'zetora-gpt-5.6': createRetryable({
            model: openai('gpt-5.6'),
            retries: [openai_2('gpt-5.6')],
          }),
          'zetora-gpt-5.6-thinking': createRetryable({
            model: openai('gpt-5.6'),
            retries: [openai_2('gpt-5.6')],
          }),
          'zetora-gpt-5.6-terra': createRetryable({
            model: openai('gpt-5.6-terra'),
            retries: [openai_2('gpt-5.6-terra')],
          }),
          'zetora-gpt-5.6-luna': createRetryable({
            model: openai('gpt-5.6-luna'),
            retries: [openai_2('gpt-5.6-luna')],
          }),
        }
      : {}),

    ...(_groq
      ? {
          'zetora-nano': _groq('llama-3.3-70b-versatile'),
          'zetora-enhance': _groq('moonshotai/kimi-k2-instruct-0905'),
          'zetora-qwen-32b': wrapLanguageModel({ model: _groq('qwen/qwen3-32b'), middleware }),
          'zetora-qwen-32b-thinking': wrapLanguageModel({ model: _groq('qwen/qwen3-32b'), middleware }),
          'zetora-gpt-oss-20': wrapLanguageModel({ model: _groq('openai/gpt-oss-20b'), middleware }),
          'zetora-kimi-k2-v2': _groq('moonshotai/kimi-k2-instruct-0905'),
        }
      : {}),

    ...(_google
      ? {
          'zetora-ext-6': createRetryable({
            model: _google('gemini-3.1-pro-preview'),
            retries: [gateway('google/gemini-3.1-pro-preview')],
          }),
          'zetora-name': createRetryable({
            model: gateway('google/gemini-3.1-flash-lite-preview'),
            retries: [_google('gemini-3.1-flash-lite-preview'), _google('gemini-2.5-flash-lite-preview-09-2025')],
          }),
          'zetora-follow-up': createRetryable({
            model: gateway('google/gemini-3.1-flash-lite-preview'),
            retries: [
              _google('gemini-3.1-flash-lite-preview'),
              _google('gemini-2.5-flash-lite-preview-09-2025'),
              _google('gemini-2.5-flash-lite'),
            ],
          }),
          'zetora-google-lite': _google('gemini-flash-lite-latest'),
          'zetora-google': _google('gemini-flash-latest'),
          'zetora-google-think': _google('gemini-flash-latest'),
          'zetora-google-pro': createRetryable({
            model: _google('gemini-2.5-pro'),
            retries: [gateway('google/gemini-2.5-pro')],
          }),
          'zetora-google-pro-think': createRetryable({
            model: _google('gemini-2.5-pro'),
            retries: [gateway('google/gemini-2.5-pro')],
          }),
          'zetora-gemini-3-flash': createRetryable({
            model: _google('gemini-3-flash-preview'),
            retries: [gateway('google/gemini-3-flash')],
          }),
          'zetora-gemini-3-flash-think': _google('gemini-3-flash-preview'),
          'zetora-gemini-3.1-flash-lite': createRetryable({
            model: gateway('google/gemini-3.1-flash-lite-preview'),
            retries: [_google('gemini-3.1-flash-lite-preview')],
          }),
          'zetora-gemini-3.1-flash-lite-think': createRetryable({
            model: gateway('google/gemini-3.1-flash-lite-preview'),
            retries: [_google('gemini-3.1-flash-lite-preview')],
          }),
          'zetora-gemini-3.1-pro': createRetryable({
            model: _google('gemini-3.1-pro-preview'),
            retries: [gateway('google/gemini-3.1-pro-preview')],
          }),
          'zetora-gemini-3.5-flash': createRetryable({
            model: _google('gemini-3.5-flash'),
            retries: [gateway('google/gemini-3.5-flash')],
          }),
          'zetora-gemini-3.5-flash-think': createRetryable({
            model: _google('gemini-3.5-flash'),
            retries: [gateway('google/gemini-3.5-flash')],
          }),
        }
      : {}),

    ...(workersai
      ? {
          'zetora-ext-4': createRetryable({
            model: workersai('@cf/zai-org/glm-4.7-flash'),
            retries: novita ? [novita.chatModel('zai-org/glm-4.7-flash')] : [],
          }),
          'zetora-nemotron-3-super': workersai('@cf/nvidia/nemotron-3-120b-a12b'),
        }
      : {}),

    ...(novita
      ? {
          'zetora-deepseek-chat-think-exp': wrapLanguageModel({
            model: novita.chatModel('deepseek/deepseek-v3.2-exp'),
            middleware,
          }),
          'zetora-deepseek-r1': wrapLanguageModel({
            model: novita.chatModel('deepseek/deepseek-r1-turbo'),
            middleware,
          }),
          'zetora-deepseek-r1-0528': wrapLanguageModel({
            model: novita.chatModel('deepseek/deepseek-r1-0528'),
            middleware,
          }),
          'zetora-qwen-coder-next': novita.chatModel('qwen/qwen3-coder-next'),
          'zetora-qwen-3-vl-30b': novita.chatModel('qwen/qwen3-vl-30b-a3b-instruct'),
          'zetora-qwen-3-vl-30b-thinking': wrapLanguageModel({
            model: novita.chatModel('qwen/qwen3-vl-30b-a3b-thinking'),
            middleware,
          }),
          'zetora-qwen-3.5-27b': novita.chatModel('qwen/qwen3.5-27b'),
          'zetora-qwen-3.5-35b': novita.chatModel('qwen/qwen3.5-35b-a3b'),
          'zetora-qwen-3.5-122b': novita.chatModel('qwen/qwen3.5-122b-a10b'),
          'zetora-qwen-3.5': novita.chatModel('qwen/qwen3.5-397b-a17b'),
          ...(workersai
            ? {}
            : {
                'zetora-ext-4': createRetryable({
                  model: novita.chatModel('zai-org/glm-4.7-flash'),
                  retries: [gateway('zai/glm-4.7-flashx')],
                }),
              }),
        }
      : {}),

    ...(huggingface
      ? {
          'zetora-qwen-4b': huggingface.chatModel('Qwen/Qwen3-4B-Instruct-2507:nscale'),
          'zetora-qwen-4b-thinking': wrapLanguageModel({
            model: huggingface.chatModel('Qwen/Qwen3-4B-Thinking-2507:nscale'),
            middleware: [middlewareWithStartWithReasoning],
          }),
          'zetora-qwen-30': huggingface.chatModel('Qwen/Qwen3-30B-A3B-Instruct-2507:nebius'),
          'zetora-qwen-30-think': wrapLanguageModel({
            model: huggingface.chatModel('Qwen/Qwen3-30B-A3B-Thinking-2507:nebius'),
            middleware,
          }),
          'zetora-qwen-3-next': huggingface.chatModel('Qwen/Qwen3-Next-80B-A3B-Instruct:hyperbolic'),
          'zetora-qwen-3-next-think': wrapLanguageModel({
            model: huggingface.chatModel('Qwen/Qwen3-Next-80B-A3B-Thinking:hyperbolic'),
            middleware: [middlewareWithStartWithReasoning],
          }),
          'zetora-qwen-235-think': wrapLanguageModel({
            model: huggingface.chatModel('Qwen/Qwen3-235B-A22B-Thinking-2507:fireworks-ai'),
            middleware: [middlewareWithStartWithReasoning],
          }),
          'zetora-glm-4.6': wrapLanguageModel({
            model: huggingface.chatModel('zai-org/GLM-4.6:zai-org'),
            middleware,
          }),
          'zetora-glm-4.6v-flash': wrapLanguageModel({
            model: huggingface.chatModel('zai-org/GLM-4.6V-Flash:zai-org'),
            middleware,
          }),
          'zetora-glm-4.6v': wrapLanguageModel({
            model: huggingface.chatModel('zai-org/GLM-4.6V:zai-org'),
            middleware,
          }),
          'zetora-glm-4.7': wrapLanguageModel({
            model: huggingface.chatModel('zai-org/GLM-4.7:novita'),
            middleware,
          }),
        }
      : {}),

    ...(_baseten
      ? {
          'zetora-gpt-oss-120': wrapLanguageModel({
            model: _baseten('openai/gpt-oss-120b'),
            middleware,
          }),
          'zetora-deepseek-v3': _baseten('deepseek-ai/DeepSeek-V3-0324'),
          'zetora-qwen-coder': _baseten('Qwen/Qwen3-Coder-480B-A35B-Instruct'),
          'zetora-kimi-k2.5': createRetryable({
            model: _baseten.chatModel('moonshotai/Kimi-K2.5'),
            retries: [gateway('moonshotai/kimi-k2.5')],
          }),
        }
      : {}),

    ...(openrouter
      ? {
          'zetora-trinity-large': wrapLanguageModel({
            model: openrouter('arcee-ai/trinity-large-preview:free'),
            middleware,
          }),
          'zetora-step-3.5-flash': openrouter('stepfun/step-3.5-flash:free'),
        }
      : {}),

    ...(_cohere
      ? {
          'zetora-cmd-a': _cohere('command-a-03-2025'),
          'zetora-cmd-a-think': _cohere('command-a-reasoning-08-2025'),
          'zetora-cmd-a-plus': _cohere('command-a-plus-05-2026'),
        }
      : {}),

    ...(_mistral
      ? {
          'zetora-ministral-3b': _mistral('ministral-3b-2512'),
          'zetora-ministral-8b': _mistral('ministral-8b-2512'),
          'zetora-ministral-14b': _mistral('ministral-14b-2512'),
          'zetora-mistral-large': _mistral('mistral-large-2512'),
          'zetora-mistral-medium': _mistral('mistral-medium-2508'),
          'zetora-magistral-small': _mistral('magistral-small-2509'),
          'zetora-magistral-medium': _mistral('magistral-medium-2509'),
          'zetora-mistral-small': _mistral('mistral-small-2603'),
          'zetora-mistral-small-think': _mistral('mistral-small-2603'),
          'zetora-leanstral': _mistral('labs-leanstral-2603'),
          'zetora-devstral': _mistral('devstral-2512'),
          'zetora-devstral-small': _mistral('labs-devstral-small-2512'),
        }
      : {}),

    ...(_anthropic
      ? {
          'zetora-anthropic-small': _anthropic('claude-haiku-4-5'),
          'zetora-anthropic': _anthropic('claude-sonnet-4-5'),
          'zetora-anthropic-think': _anthropic('claude-sonnet-4-5'),
          'zetora-anthropic-sonnet-4.6': _anthropic('claude-sonnet-4-6'),
          'zetora-anthropic-sonnet-4.6-think': _anthropic('claude-sonnet-4-6'),
          'zetora-anthropic-opus': _anthropic('claude-opus-4-5'),
          'zetora-anthropic-opus-think': _anthropic('claude-opus-4-5'),
          'zetora-anthropic-opus-4.6': _anthropic('claude-opus-4-6'),
          'zetora-anthropic-opus-4.6-think': _anthropic('claude-opus-4-6'),
          'zetora-anthropic-sonnet-5': _anthropic('claude-sonnet-5'),
          'zetora-anthropic-sonnet-5-think': _anthropic('claude-sonnet-5'),
          'zetora-anthropic-opus-4.7': _anthropic('claude-opus-4-7'),
          'zetora-anthropic-opus-4.7-think': _anthropic('claude-opus-4-7'),
          'zetora-anthropic-opus-4.8': _anthropic('claude-opus-4-8'),
          'zetora-anthropic-opus-4.8-think': _anthropic('claude-opus-4-8'),
        }
      : {}),

    ...(zai
      ? {
          'zetora-glm-air': wrapLanguageModel({ model: gateway('zai/glm-4.5-air'), middleware }),
          'zetora-glm': wrapLanguageModel({ model: gateway('zai/glm-4.5'), middleware }),
          'zetora-glm-5': wrapLanguageModel({ model: zai('glm-5-turbo'), middleware }),
          'zetora-glm-5-thinking': wrapLanguageModel({ model: zai('glm-5-turbo'), middleware }),
          'zetora-glm-5.2': wrapLanguageModel({ model: zai('glm-5.2'), middleware }),
        }
      : {}),

    ...(minimax
      ? {
          'zetora-minimax-m2.7': wrapLanguageModel({
            model: minimax.chatModel('MiniMax-M2.7-highspeed'),
            middleware,
          }),
          'zetora-minimax-m3': wrapLanguageModel({
            model: minimax.chatModel('MiniMax-M3'),
            middleware,
          }),
        }
      : {}),

    ...(ark
      ? {
          'zetora-seed-1.6': wrapLanguageModel({ model: ark('seed-1-6-250915'), middleware }),
          'zetora-seed-1.8': wrapLanguageModel({ model: ark('seed-1-8-251228'), middleware }),
          'zetora-seed-2.0-mini': wrapLanguageModel({ model: ark('seed-2-0-mini-260215'), middleware }),
          'zetora-seed-2.0-lite': ark('seed-2-0-lite-260228'),
          'zetora-seed-1.6-flash': wrapLanguageModel({ model: ark('seed-1-6-flash-250715'), middleware }),
        }
      : {}),

    ...(minimax && _baseten && novita
      ? {
          'zetora-minimax-m2.5': createRetryable({
            model: _baseten.chatModel('MiniMaxAI/MiniMax-M2.5'),
            retries: [
              minimax.chatModel('MiniMax-M2.5-highspeed'),
              novita.chatModel('minimax/minimax-m2.5'),
              gateway('minimax/minimax-m2.5'),
            ],
          }),
        }
      : {}),

    // Gateway-only models — no provider dependency
    'zetora-ext-5': gateway('moonshotai/kimi-k2.5'),
    'zetora-ext-7': gateway('alibaba/qwen3.5-flash'),
    'zetora-trinity-mini': wrapLanguageModel({ model: gateway('arcee-ai/trinity-mini'), middleware }),
    'zetora-kat-coder': gateway('kwaipilot/kat-coder-pro-v1'),
    'zetora-deepseek-v3.1-terminus': gateway('deepseek/deepseek-v3.1-terminus'),
    'zetora-deepseek-chat': gateway('deepseek/deepseek-v3.2'),
    'zetora-deepseek-chat-think': gateway('deepseek/deepseek-v3.2-thinking'),
    'zetora-deepseek-chat-exp': gateway('deepseek/deepseek-v3.2-exp'),
    'zetora-deepseek-v4-flash': gateway('deepseek/deepseek-v4-flash'),
    'zetora-deepseek-v4-flash-think': wrapLanguageModel({
      model: gateway('deepseek/deepseek-v4-flash-thinking'),
      middleware,
    }),
    'zetora-deepseek-v4-pro': gateway('deepseek/deepseek-v4-pro'),
    'zetora-deepseek-v4-pro-think': wrapLanguageModel({
      model: gateway('deepseek/deepseek-v4-pro-thinking'),
      middleware,
    }),
    'zetora-v0-10': gateway('vercel/v0-1.0-md'),
    'zetora-v0-15': gateway('vercel/v0-1.5-md'),
    'zetora-qwen-coder-small': gateway('alibaba/qwen3-coder-30b-a3b'),
    'zetora-qwen-coder-plus': gateway('alibaba/qwen3-coder-plus'),
    'zetora-qwen-3-max': gateway('alibaba/qwen3-max'),
    'zetora-qwen-3-max-preview': gateway('alibaba/qwen3-max-preview'),
    'zetora-qwen-3-max-preview-thinking': gateway('alibaba/qwen3-max-thinking'),
    'zetora-qwen-235': gateway('alibaba/qwen-3-235b'),
    'zetora-qwen-3.5-plus': gateway('alibaba/qwen3.5-plus'),
    'zetora-qwen-3.5-flash': gateway('alibaba/qwen3.5-flash'),
    'zetora-qwen-3.7-max': gateway('alibaba/qwen3.7-max'),
    'zetora-qwen-3.7-plus': gateway('alibaba/qwen3.7-plus'),
    'zetora-qwen-3-vl': gateway('alibaba/qwen3-vl-instruct'),
    'zetora-qwen-3-vl-thinking': wrapLanguageModel({ model: gateway('alibaba/qwen3-vl-thinking'), middleware }),
    'zetora-kimi-k2-v2-thinking': wrapLanguageModel({
      model: gateway('moonshotai/kimi-k2-thinking-turbo'),
      middleware,
    }),
    'zetora-kimi-k2.5-thinking': gateway('moonshotai/kimi-k2.5'),
    'zetora-kimi-k2.6': gateway('moonshotai/kimi-k2.6'),
    'zetora-kimi-k2.7-code': gateway('moonshotai/kimi-k2.7-code'),
    'zetora-mimo-v2-flash': wrapLanguageModel({ model: gateway('xiaomi/mimo-v2-flash'), middleware }),
    'zetora-mimo-v2-pro': wrapLanguageModel({ model: gateway('xiaomi/mimo-v2-pro'), middleware }),
    'zetora-nova-2-lite': gateway('amazon/nova-2-lite'),
    'zetora-mercury-2': gateway('inception/mercury-2'),
    'zetora-nemotron-3-ultra': gateway('nvidia/nemotron-3-ultra-550b-a55b'),
    'zetora-minimax-m2': wrapLanguageModel({ model: gateway('minimax/minimax-m2'), middleware }),
    'zetora-minimax-m2.1': wrapLanguageModel({ model: gateway('minimax/minimax-m2.1'), middleware }),
    'zetora-minimax-m2.1-lightning': wrapLanguageModel({
      model: gateway('minimax/minimax-m2.1-lightning'),
      middleware,
    }),
  },
});

import type { LanguageModel } from 'ai';
import { getCustomProviders, getCustomModels } from '@/lib/custom-providers';

import { createLogger } from '@/lib/logger';

const log = createLogger('providers');

const customProviderInstances = new Map<string, ReturnType<typeof createOpenAICompatible>>();

async function getOrCreateProvider(providerId: string, userId?: string) {
  const providers = await getCustomProviders(userId);
  const config = providers.find((p) => p.id === providerId);
  if (!config) throw new Error(`Custom provider ${providerId} not found`);

  const cacheKey = `${providerId}::${config.baseURL}::${config.apiKey ?? ''}`;
  if (customProviderInstances.has(cacheKey)) {
    return customProviderInstances.get(cacheKey)!;
  }
  const provider = createOpenAICompatible({
    name: config.id,
    baseURL: config.baseURL,
    apiKey: config.apiKey ?? 'not-needed',
  });
  customProviderInstances.set(cacheKey, provider);
  return provider;
}

// Returns the anonymization context for this (model, user) pair, or null if
// the layer shouldn't apply — master toggle gates everything; built-in
// providers are covered automatically once it's on, custom providers
// additionally need their own per-provider flag set (a custom provider can
// be a trusted local endpoint or a cloud one, so it can't be inferred).
// Shared by resolveModel and anything that needs to mask outgoing tool/egress
// data for the same request (see lib/search/tool-loader.ts).
export async function getAnonymizeContext(
  modelId: string,
  preferences?: Record<string, unknown> | null,
  userId?: string,
): Promise<import('@/lib/anonymizer/pseudonymize').AnonymizeContext | null> {
  if (!userId) return null;
  if (preferences?.['zetora-anonymization-enabled'] !== true) return null;

  if (modelId.startsWith('custom-')) {
    const models = await getCustomModels(userId);
    const model = models.find((m) => m.id === modelId);
    if (!model) return null;
    const providers = await getCustomProviders(userId);
    if (providers.find((p) => p.id === model.providerId)?.anonymize !== true) return null;
  }

  return {
    userId,
    language: (preferences?.['zetora-anonymization-language'] as string | undefined) ?? 'en',
    nerEnabled: preferences?.['zetora-anonymization-ner-enabled'] !== false,
    denyTerms: (preferences?.['zetora-anonymization-custom-terms'] as string[] | undefined) ?? [],
    failOpen: preferences?.['zetora-anonymization-fail-open'] === true,
  };
}

export async function resolveModel(
  modelId: string,
  preferences?: Record<string, unknown> | null,
  userId?: string,
): Promise<LanguageModel> {
  let resolved: LanguageModel;

  if (!modelId.startsWith('custom-')) {
    resolved = zetora.languageModel(modelId);
  } else {
    const models = await getCustomModels(userId);
    const model = models.find((m) => m.id === modelId);
    if (!model) {
      log.warn(`Custom model ${modelId} not found, falling back to default`);
      resolved = zetora.languageModel('zetora-default');
    } else {
      const provider = await getOrCreateProvider(model.providerId, userId);
      resolved = provider.chatModel(model.modelName);
    }
  }

  const xmlParsingEnabled = preferences?.['zetora-xml-tool-parsing-enabled'] === true;
  const isCustomModel = modelId.startsWith('custom-');

  if (xmlParsingEnabled && isCustomModel) {
    resolved = wrapLanguageModel({
      model: resolved,
      middleware: dynamicXmlToolMiddleware,
    });
  }

  const anonymizeContext = await getAnonymizeContext(modelId, preferences, userId);
  if (anonymizeContext) {
    const { createAnonymizationMiddleware } = await import('./anonymization-middleware');
    resolved = wrapLanguageModel({
      model: resolved,
      middleware: createAnonymizationMiddleware(anonymizeContext),
    });
  }

  return resolved;
}

export { hasVisionSupport, getModelParameters, shouldBypassRateLimits, getModelProvider } from './models';
