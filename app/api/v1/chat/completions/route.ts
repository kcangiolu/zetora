import { NextRequest } from 'next/server';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { resolveTertiaryModel, getTertiaryModelConfig } from '@/ai/tertiary';
import { getAnonymizeContext } from '@/ai/providers';
import { loadConfiguredTools } from '@/lib/search/tool-loader';
import { resolvePrepareStepOverride } from '@/lib/search/prepare-step';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';
import { StreamTokenBuffer } from '@/ai/anonymization-middleware';
import { TOKEN_PATTERN } from '@/lib/anonymizer/pseudonymize';
import type { SearchProvider } from '@/lib/utils';

// Small curated toolset for spoken conversations — kept intentionally narrow so
// the prompt stays light and turns stay low-latency (see the voice search plan).
const VOICE_TOOL_NAMES = ['web_search', 'retrieve', 'get_weather_data', 'datetime'];

// Server-side tool guidance appended to the caller's spoken persona. Deliberately
// terse and speech-oriented — the `web` group's own instructions are written for
// written chat (markdown, inline citations) and read badly aloud.
const VOICE_TOOL_INSTRUCTIONS = `

## Tools
You can look things up. If the user asks about current events, recent facts, prices,
weather, or anything you are not confident you know, call a tool before answering:
- web_search — for news, facts, people, products; use 1-3 short queries.
- retrieve — to read a specific URL the user gives you.
- get_weather_data — for weather.
- datetime — for the current date/time.
After the tool returns, answer in one or two natural spoken sentences. Never read out
raw URLs, markdown, or the tool output verbatim — summarize it conversationally. For
simple greetings or chit-chat, just reply without any tool. Never mention technical
issues, tool errors, or retries out loud — silently retry or answer with what you have.`;

// OpenAI-compatible /v1/chat/completions, streaming-only. Built for the local
// s2s-service LLM stage. The model is resolved the same way every other
// background task is (Settings > Tertiary Models > Voice), not passed by the
// caller — this keeps voice consistent with chat-title/followup/etc. and
// picks up anonymization middleware for free via resolveTertiaryModel.
//
// Tools run server-side here: the AI SDK drives the tool loop and only the final
// spoken answer flows out through result.textStream (tool-calls are separate
// parts, never in textStream), so s2s-service needs no changes.
export async function POST(req: NextRequest) {
  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Invalid request body: messages must be an array' }, { status: 400 });
  }

  const rawMessages = body.messages as ModelMessage[];

  // s2s-service sends the spoken persona as messages[0] (role:'system'). Pull it
  // out into `system` so prepareStep's system override composes cleanly, and
  // keep the rest as the conversation.
  const first = rawMessages[0];
  const personaSystem = first?.role === 'system' && typeof first.content === 'string' ? first.content : '';
  const messages = personaSystem ? rawMessages.slice(1) : rawMessages;
  const baseSystem = personaSystem + VOICE_TOOL_INSTRUCTIONS;

  const record = await getCachedUserPreferencesByUserId(userId).catch(() => null);
  const prefs = (record?.preferences ?? null) as Record<string, string> | null;
  const model = await resolveTertiaryModel('voice', prefs, userId);
  const modelId = getTertiaryModelConfig('voice', prefs).model;

  // Local custom models (e.g. Qwen3 on llama.cpp) can't do native tool-calling;
  // resolveTertiaryModel already wraps them in the XML tool middleware. They need
  // their tool schemas armed on every step (see prepare-step.ts) or raw
  // <web_search> XML would be spoken.
  const isXmlParsedCustomModel =
    modelId.startsWith('custom-') &&
    (prefs as Record<string, unknown> | null)?.['zetora-xml-tool-parsing-enabled'] === true;

  const anonymizeContext = await getAnonymizeContext(
    modelId,
    prefs as Record<string, unknown> | null,
    userId,
  );

  const tools = await loadConfiguredTools({
    activeToolNames: VOICE_TOOL_NAMES,
    dataStream: undefined,
    searchProvider: (prefs?.['zetora-search-provider'] as SearchProvider | undefined) || undefined,
    timezone: undefined,
    contextFiles: [],
    includeMcpTools: false,
    mcpDynamicTools: {},
    lightweightUser: { userId, email: '', isProUser: false },
    selectedConnectors: undefined,
    userPreferences: (prefs ?? {}) as Record<string, unknown>,
    anonymizeContext,
  });

  const result = streamText({
    model,
    system: baseSystem,
    messages,
    tools,
    activeTools: VOICE_TOOL_NAMES,
    toolChoice: 'auto',
    // Spoken replies are meant to be one or two sentences (see
    // VOICE_TOOL_INSTRUCTIONS above) — without a cap, a local model with no
    // natural stop point can run to its full context length, which both
    // reads absurdly long aloud and can blow past s2s-service's read timeout
    // on /api/v1/chat/completions.
    maxOutputTokens: 300,
    stopWhen: stepCountIs(isXmlParsedCustomModel ? 3 : 5),
    maxRetries: isXmlParsedCustomModel ? 2 : 3,
    prepareStep: async ({ steps }) => {
      const latestStep = steps[steps.length - 1];
      const latestStepHasToolRoundTrip =
        Boolean(latestStep) && latestStep.toolCalls.length > 0 && latestStep.toolResults.length > 0;

      return resolvePrepareStepOverride({
        group: 'web',
        shouldUseXaiMultiAgent: false,
        isXmlParsedCustomModel,
        model: modelId,
        latestStepHasToolRoundTrip,
        streamActiveTools: VOICE_TOOL_NAMES,
        baseSystem,
      });
    },
  });

  const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  // Defense in depth: even though anonymization middleware already
  // de-anonymizes resolvable tokens on the way out, a model can invent or
  // mutate a token (unknown hash — no vault entry) or repeat one from a
  // stale/foreign conversation. Those can never be resolved, so scrub any
  // that survive before this reaches the TTS leg — spoken raw tokens are
  // far worse than a dropped word.
  const scrubTokens = (text: string) => text.replace(TOKEN_PATTERN, '');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      const tokenBuffer = new StreamTokenBuffer({ userId });
      try {
        for await (const delta of result.textStream) {
          const resolved = scrubTokens(await tokenBuffer.push(delta));
          if (resolved) {
            send({
              id,
              object: 'chat.completion.chunk',
              created,
              model: modelId,
              choices: [{ index: 0, delta: { content: resolved }, finish_reason: null }],
            });
          }
        }
        const remaining = scrubTokens(await tokenBuffer.flush());
        if (remaining) {
          send({
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelId,
            choices: [{ index: 0, delta: { content: remaining }, finish_reason: null }],
          });
        }
        send({
          id,
          object: 'chat.completion.chunk',
          created,
          model: modelId,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        console.error('[api/v1/chat/completions] stream error:', error);
        controller.error(error);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
