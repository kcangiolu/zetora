'use server';

import { serverEnv } from '@/env/server';
import { generateText } from 'ai';
import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import { getUser } from '@/lib/auth-utils';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import { getLightweightUserAuth, getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveTertiaryModel } from '@/ai/tertiary';
import { isConfigured } from '@/ai/catalog/env';
import { getCustomProviderById } from '@/lib/custom-providers';
import { buildFollowUpRequest } from '@/lib/search/follow-up-prompt';

import { createLogger } from '@/lib/logger';

const log = createLogger('ai');

// The last exchange of a chat, as the chat interface sends it.
const suggestionHistorySchema = z
  .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) }))
  .min(1)
  .max(10);

export async function suggestQuestions(rawHistory: unknown) {
  'use server';

  const suggestUser = await getUser();
  if (!suggestUser) {
    throw new Error('Authentication required');
  }
  const history = suggestionHistorySchema.parse(rawHistory);

  const suggestPrefs = await getCachedUserPreferencesByUserId(suggestUser.id);
  const suggestPrefsMap = suggestPrefs?.preferences ?? {};

  if (suggestPrefs?.preferences?.['zetora-tertiary-followup-enabled'] === false) {
    return { questions: [] };
  }

  // Plain-text generation + JSON extraction (not the AI SDK's Output.object/
  // structured-outputs path): the 'followup' tertiary task can resolve to a
  // custom/local provider (e.g. Ollama) that doesn't support response-format
  // schemas, which made structured output throw AI_NoOutputGeneratedError
  // and take the whole page down with it. Same pattern as auto-router.ts.
  try {
    const { text } = await generateText({
      model: await resolveTertiaryModel('followup', suggestPrefsMap, suggestUser.id),
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

Respond with ONLY the JSON object below, no markdown code fences or extra commentary:
{
  "questions": [
    "question1 (string)",
    "question2 (string)",
    "question3 (string)"
  ]
}
`,
      prompt: buildFollowUpRequest(history),
      // Generous budget: on providers where reasoning can only be masked, not
      // disabled (see resolveTertiaryModel), a hidden <think> preamble still
      // consumes real tokens before the JSON — 500 was tight enough that it
      // could exhaust the budget before any output appeared at all.
      maxOutputTokens: 2000,
    });

    const rawMatch = text.match(/\{[\s\S]*\}/);
    const parsed = rawMatch ? JSON.parse(jsonrepair(rawMatch[0])) : null;
    const validated = z.object({ questions: z.array(z.string().max(150)).min(1).max(5) }).safeParse(parsed);

    if (!validated.success) {
      log.error('[suggestQuestions] Could not parse questions from model output:', text);
      return { questions: [] };
    }

    return { questions: validated.data.questions };
  } catch (error) {
    log.error('[suggestQuestions] Failed to generate follow-up questions:', error);
    return { questions: [] };
  }
}

export async function enhancePrompt(raw: string) {
  try {
    const auth = await getLightweightUserAuth();

    if (!auth) {
      return { success: false, error: 'Authentication required' };
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

    const enhancePrefs = await getCachedUserPreferencesByUserId(auth.userId);
    const enhancePrefsMap = enhancePrefs?.preferences ?? {};

    const { text } = await generateText({
      model: await resolveTertiaryModel('enhance', enhancePrefsMap, auth.userId),
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 1024,
      system,
      prompt: raw,
    });

    log.debug('Enhanced text: ', text);

    return { success: true, enhanced: text.trim() };
  } catch (error) {
    log.error('Error enhancing prompt:', error);
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
    const customProvider = await getCustomProviderById(p['zetora-tts-custom-provider-id'], user.id);
    if (!customProvider?.baseURL) {
      throw new Error('No text-to-speech server selected: pick one under Settings > Voice > Text-to-Speech');
    }
    const model = p['zetora-tts-openai-model'] || 'qwen3-tts';
    const voice = p['zetora-tts-openai-voice'] || 'af_bella';

    const response = await fetch(`${customProvider.baseURL}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customProvider.apiKey ? { Authorization: `Bearer ${customProvider.apiKey}` } : {}),
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

  if (!isConfigured(serverEnv.ELEVENLABS_API_KEY)) {
    throw new Error(
      'ElevenLabs speech needs ELEVENLABS_API_KEY on this instance, or pick a custom server under Settings > Voice',
    );
  }
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

// Lightweight function for sidebar recent chats - minimal payload, no cursor pagination
