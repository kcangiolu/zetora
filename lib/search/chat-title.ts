import 'server-only';

import { generateText, UIMessage } from 'ai';
import { GoogleGenerativeAIProviderOptions, GoogleLanguageModelOptions } from '@ai-sdk/google';
import { GatewayProviderOptions } from '@ai-sdk/gateway';
import { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';

import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveTertiaryModel } from '@/ai/tertiary';

import { createLogger } from '@/lib/logger';

const log = createLogger('chat-title');

// What generateTitleFromUserMessage returns when it produced no title: title generation
// disabled in the user's preferences, or an empty model output.
export const UNTITLED_CHAT_TITLE = 'New Chat';

// `userId` is passed by the caller rather than re-derived from the request session: several
// callers run off the request path (a cron-triggered Lookout run has no session at all), and a
// missing user there silently read as "no preferences", generating titles the user had disabled.
export async function generateTitleFromUserMessage({ message, userId }: { message: UIMessage; userId: string }) {
  const startTime = Date.now();
  const firstTextPart = message.parts.find((part) => part.type === 'text');
  const prompt = JSON.stringify(firstTextPart && firstTextPart.type === 'text' ? firstTextPart.text : '');

  log.debug('Prompt: ', prompt);

  const titlePrefs = await getCachedUserPreferencesByUserId(userId).catch(() => null);
  const titlePrefsMap = (titlePrefs?.preferences ?? {}) as Record<string, string>;

  if (titlePrefs?.preferences?.['zetora-tertiary-chat-title-enabled'] === false) {
    return UNTITLED_CHAT_TITLE;
  }

  const { text: rawTitle } = await generateText({
    model: await resolveTertiaryModel('chat-title', titlePrefsMap, userId),
    system: `You are an expert title generator. You are given a message and you need to generate a short title based on it.

    - you will generate a short 3-4 words title based on the first message a user begins a conversation with
    - write the title in the same language as the user's message (a French message gets a French title); never translate it into English
    - the title should creative and unique
    - do not write anything other than the title
    - do not use quotes or colons
    - no markdown formatting allowed
    - keep plain text only
    - not more than 4 words in the title
    - do not use any other text other than the title`,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    providerOptions: {
      openai: {
        reasoningEffort: 'minimal',
        reasoningSummary: null,
        textVerbosity: 'low',
        store: false,
        include: ['reasoning.encrypted_content'],
      } satisfies OpenAIResponsesProviderOptions,
      gateway: {
        only: ['vertex', 'google'],
        order: ['vertex', 'google'],
      } satisfies GatewayProviderOptions,
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
      vertex: {
        thinkingConfig: {
          thinkingBudget: 0,
          includeThoughts: false,
        },
      } satisfies GoogleLanguageModelOptions,
    },
    onFinish: (output) => {
      log.debug('Title generated: ', output.text);
      log.debug('Model Used: ', output.model.modelId);
      const durationMs = Date.now() - startTime;
      log.debug(`⏱️ [USAGE] generateTitleFromUserMessage: Model took ${durationMs}ms`);
    },
  });

  const afterThink = rawTitle.includes('</think>') ? rawTitle.split('</think>').pop()! : rawTitle;
  const title = afterThink
    .replace(/<response>[\s\S]*?<\/response>/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 80);

  log.debug('Title: ', title);

  const durationMs = Date.now() - startTime;
  log.debug(`⏱️ [USAGE] generateTitleFromUserMessage: Model took ${durationMs}ms`);

  return title || UNTITLED_CHAT_TITLE;
}
