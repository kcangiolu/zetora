import { NextRequest } from 'next/server';
import { streamText, type ModelMessage } from 'ai';
import { resolveTertiaryModel, getTertiaryModelConfig } from '@/ai/tertiary';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';

// OpenAI-compatible /v1/chat/completions, streaming-only. Built for the local
// s2s-service LLM stage. The model is resolved the same way every other
// background task is (Settings > Tertiary Models > Voice), not passed by the
// caller — this keeps voice consistent with chat-title/followup/etc. and
// picks up anonymization middleware for free via resolveTertiaryModel.
export async function POST(req: NextRequest) {
  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Invalid request body: messages must be an array' }, { status: 400 });
  }

  const messages = body.messages as ModelMessage[];

  const record = await getCachedUserPreferencesByUserId(userId).catch(() => null);
  const prefs = (record?.preferences ?? null) as Record<string, string> | null;
  const model = await resolveTertiaryModel('voice', prefs, userId);
  const modelId = getTertiaryModelConfig('voice', prefs).model;

  const result = streamText({ model, messages, maxRetries: 3 });

  const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      try {
        for await (const delta of result.textStream) {
          send({
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelId,
            choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
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
