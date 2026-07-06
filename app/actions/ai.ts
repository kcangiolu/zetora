'use server';

import { serverEnv } from '@/env/server';
import { generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import { z } from 'zod';
import { getUser } from '@/lib/auth-utils';
import { hasVisionSupport, zetora, resolveModel } from '@/ai/providers';
import {
  getChatsByUserId,
  getRecentChatsByUserId,
  deleteChatById,
  updateChatVisibilityById,
  getChatById,
  getMessageById,
  deleteMessagesByChatIdAfterTimestamp,
  updateChatTitleById,
  updateChatPinnedById,
  getExtremeSearchCount,
  incrementMessageUsage,
  incrementAnthropicUsage,
  incrementGoogleUsage,
  getMessageCount,
  getAnthropicUsageCount,
  getGoogleUsageCount,
  getAgentModeRequestCountForCurrentMonth,
  getHistoricalUsageData,
  getCustomInstructionsByUserId,
  createCustomInstructions,
  updateCustomInstructions,
  deleteCustomInstructions,
  upsertUserPreferences,
  getDodoSubscriptionsByUserId,
  createLookout,
  getLookoutsByUserId,
  getLookoutById,
  updateLookout,
  updateLookoutStatus,
  deleteLookout,
  getChatWithUserById,
} from '@/lib/db/queries';
import { db, maindb } from '@/lib/db';
import { chat, message, buildSession, dodosubscription, type User } from '@/lib/db/schema';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import { groq } from '@ai-sdk/groq';
import {
  createBullMqSchedule,
  scheduleBullMqOnce,
  deleteBullMqSchedule,
  pauseBullMqSchedule,
  resumeBullMqSchedule,
  getLockoutProvider,
} from '@/lib/services/bullmq';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import {
  usageCountCache,
  createMessageCountKey,
  createExtremeCountKey,
  createAnthropicCountKey,
  createGoogleCountKey,
  createAgentModeCountKey,
} from '@/lib/performance-cache';
import { getLightweightUserAuth, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import {
  createConnection,
  listUserConnections,
  deleteConnection,
  manualSync,
  getSyncStatus,
  type ConnectorProvider,
} from '@/lib/connectors';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';
import { getGroupConfig as getSearchGroupConfig } from '@/lib/search/group-config';
import { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { resolveTertiaryModel } from '@/ai/tertiary';

export async function suggestQuestions(history: any[]) {
  'use server';

  console.log(history);

  const suggestUser = await getUser().catch(() => null);
  const suggestPrefs = suggestUser ? await getCachedUserPreferencesByUserId(suggestUser.id).catch(() => null) : null;
  const suggestPrefsMap = (suggestPrefs?.preferences ?? {}) as Record<string, string>;

  const { output } = await generateText({
    model: await resolveTertiaryModel('followup', suggestPrefsMap, suggestUser?.id),
    providerOptions: {
      google: {
        structuredOutputs: true,
      } satisfies GoogleGenerativeAIProviderOptions,
    },
    system: `You are a search engine follow up query/questions generator. You MUST create between 3 and 5 questions for the search engine based on the conversation history.

### Question Generation Guidelines:
- Create 3-5 questions that are open-ended and encourage further discussion
- Questions must be concise (5-10 words each) but specific and contextually relevant
- Each question must contain specific nouns, entities, or clear context markers
- NEVER use pronouns (he, she, him, his, her, etc.) - always use proper nouns from the context
- Questions must be related to tools available in the system
- Questions should flow naturally from previous conversation
- You are here to generate questions for the search engine not to use tools or run tools!!

### Tool-Specific Question Types:
- Web search: Focus on factual information, current events, or general knowledge
- Academic: Focus on scholarly topics, research questions, or educational content
- YouTube: Focus on tutorials, how-to questions, or content discovery
- Social media (X/Twitter): Focus on trends, opinions, or social conversations
- Code/Analysis: Focus on programming, data analysis, or technical problem-solving
- Weather: Redirect to news, sports, or other non-weather topics
- Location: Focus on culture, history, landmarks, or local information
- Finance: Focus on market analysis, investment strategies, or economic topics

### Context Transformation Rules:
- For weather conversations → Generate questions about news, sports, or other non-weather topics
- For programming conversations → Generate questions about algorithms, data structures, or code optimization
- For location-based conversations → Generate questions about culture, history, or local attractions
- For mathematical queries → Generate questions about related applications or theoretical concepts
- For current events → Generate questions that explore implications, background, or related topics

### Formatting Requirements:
- No bullet points, numbering, or prefixes
- No quotation marks around questions
- Each question must be grammatically complete
- Each question must end with a question mark
- Questions must be diverse and not redundant
- Do not include instructions or meta-commentary in the questions

JSON Output Schema:
{
  "questions": [
    "question1 (string)",
    "question2 (string)",
    "question3 (string)"
  ]
}
`,
    messages: history,
    output: Output.object({
      schema: z.object({
        questions: z
          .array(z.string().max(150))
          .describe('The generated questions based on the message history.')
          .min(3)
          .max(5),
      }),
    }),
  });

  return {
    questions: output.questions,
  };
}

export async function checkImageModeration(images: string[]) {
  const messages: ModelMessage[] = images.map((image) => ({
    role: 'user',
    content: [{ type: 'image', image: image }],
  }));

  const { text } = await generateText({
    model: groq('meta-llama/llama-guard-4-12b'),
    messages,
    providerOptions: {
      groq: {
        service_tier: 'flex',
      },
    },
  });
  return text;
}

import { generateTitleFromUserMessage } from '@/lib/search/chat-title';
export { generateTitleFromUserMessage };

export async function enhancePrompt(raw: string) {
  try {
    const auth = await getLightweightUserAuth();

    if (!auth?.isProUser) {
      return { success: false, error: 'Pro subscription required' };
    }

    const system = `You are an expert prompt engineer. Rewrite and enhance the user's prompt.

Today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short' })}. Treat this as the authoritative current date/time.

Temporal awareness:
- Interpret relative time expressions (e.g., "today", "last week", "current", "up-to-date") relative to the date stated above.
- Do not include meta-references like "date above", "current date", or similar in the output.
- Only include an explicit calendar date when the user's prompt requests or clearly implies a time boundary; otherwise, keep timing implicit and avoid adding extra date text.
- Do not speculate about future events beyond the date stated above.

Guidelines (MANDATORY):
- Preserve the user's original intent, constraints, and point of view and voice.
- Make the prompt specific, unambiguous, and actionable.
- Add missing context when implied: entities, timeframe, location, and output format/constraints.
- Remove fluff and vague language; prefer proper nouns over pronouns.
- Keep it concise (add at most 1–2 sentences of necessary context) but information-dense.
- Do NOT ask follow-up questions.
- Do NOT answer the user's request; your job is only to improve the prompt.
- Do NOT introduce new facts not implied by the user.

Output requirements:
- Return ONLY the improved prompt text, in plain text.
- No quotes, no commentary, no markdown, and no preface.`;

    const enhancePrefs = await getCachedUserPreferencesByUserId(auth.userId).catch(() => null);
    const enhancePrefsMap = (enhancePrefs?.preferences ?? {}) as Record<string, string>;

    const { text } = await generateText({
      model: await resolveTertiaryModel('enhance', enhancePrefsMap, auth.userId),
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 1024,
      system,
      prompt: raw,
    });

    console.log('Enhanced text: ', text);

    return { success: true, enhanced: text.trim() };
  } catch (error) {
    console.error('Error enhancing prompt:', error);
    return { success: false, error: 'Failed to enhance prompt' };
  }
}

export interface GenerateSpeechResult {
  audio: string;
  alignment: CharacterAlignmentResponseModel | null;
  normalizedAlignment: CharacterAlignmentResponseModel | null;
}

export async function generateSpeech(text: string): Promise<GenerateSpeechResult> {
  const user = await getUser();
  if (!user) throw new Error('Authentication required');

  const prefs = await getCachedUserPreferencesByUserId(user.id);
  const p = prefs?.preferences ?? {};
  const ttsProvider = p['zetora-tts-provider'] || 'elevenlabs';

  if (ttsProvider === 'openai-compatible') {
    const customProviders = (p['zetora-custom-providers'] ?? []) as Array<{
      id: string;
      baseURL: string;
      apiKey?: string;
    }>;
    const providerId = p['zetora-tts-custom-provider-id'] as string | undefined;
    const customProvider = customProviders.find((cp) => cp.id === providerId);
    const baseUrl = customProvider?.baseURL || 'http://localhost:8880/v1';
    const apiKey = customProvider?.apiKey || 'not-needed';
    const model = (p['zetora-tts-openai-model'] as string) || 'qwen3-tts';
    const voice = (p['zetora-tts-openai-voice'] as string) || 'af_bella';

    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`TTS server error (${response.status}): ${errBody}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    return {
      audio: `data:audio/mp3;base64,${audioBase64}`,
      alignment: null,
      normalizedAlignment: null,
    };
  }

  // Fallback: ElevenLabs
  const client = new ElevenLabsClient({
    apiKey: serverEnv.ELEVENLABS_API_KEY,
  });
  const result = await client.textToSpeech.convertWithTimestamps('90ipbRoKi4CpHXvKVtl0', {
    text,
    modelId: 'eleven_v3',
  });
  return {
    audio: `data:audio/mp3;base64,${result.audioBase64}`,
    alignment: result.alignment ?? null,
    normalizedAlignment: result.normalizedAlignment ?? null,
  };
}

export async function getGroupConfig(...args: Parameters<typeof getSearchGroupConfig>) {
  'use server';
  return getSearchGroupConfig(...args);
}

// Lightweight function for sidebar recent chats - minimal payload, no cursor pagination
