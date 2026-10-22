import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserById } from '@/lib/db/queries';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import { subscribeToHermesChat } from '@/lib/hermes/realtime';
import { sendToHermes } from '@/lib/hermes/send';
import { HermesSpeechTracker } from '@/lib/hermes/voice-reply';
import { textOfParts } from '@/lib/text-parts';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-voice-hermes');

// Zetora's Hermes plugin reports the end of each turn (turn_end). Without the plugin,
// Hermes's typing heartbeat, which repeats every 2s while the agent works, is the only
// sign of life: this much silence ends the turn.
const AGENT_IDLE_MS = 15_000;
const TURN_MAX_MS = 5 * 60_000;

const bodySchema = z.object({ chatId: z.string().uuid(), text: z.string().trim().min(1) });

const frameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), draftId: z.number(), content: z.string() }),
  z.object({ kind: z.literal('message'), message: z.object({ parts: z.array(z.record(z.string(), z.unknown())) }) }),
  z.object({ kind: z.literal('turn_end'), response: z.string().nullable() }),
  z.object({
    kind: z.literal('tool_step'),
    step: z.object({
      toolCallId: z.string(),
      toolName: z.string(),
      preview: z.string().nullable(),
      status: z.string(),
    }),
  }),
  z.object({ kind: z.literal('typing') }),
  z.object({ kind: z.literal('connection-status'), connected: z.boolean() }),
]);

// The reply leg of the voice page in Hermes mode, called by the s2s-service in place of
// /api/v1/chat/completions: it sends the user's transcript to their Hermes agent, in the
// voice session's Hermes chat, and streams the agent's reply back in the same OpenAI-style
// SSE, so the s2s-service only switches URLs. Tool steps ride along as `tool` chunks.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'chatId and text are required' }, { status: 400 });
  const { chatId, text } = parsed.data;

  const dbUser = await getUserById(userId);
  if (!dbUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = { id: dbUser.id, name: dbUser.name };

  const encoder = new TextEncoder();
  const tracker = new HermesSpeechTracker();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let unsubscribe: () => void = () => {};
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let replied = false;
  let closed = false;

  const write = (chunk: string) => {
    try {
      controller?.enqueue(encoder.encode(chunk));
    } catch {
      // The s2s-service hung up: nothing left to write to.
    }
  };
  const writeData = (payload: unknown) => write(`data: ${JSON.stringify(payload)}\n\n`);
  const stop = () => {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimer);
    clearTimeout(maxTimer);
    unsubscribe();
  };
  const finish = (error?: string) => {
    if (closed) return;
    stop();
    if (error) writeData({ error: { message: error } });
    write('data: [DONE]\n\n');
    try {
      controller?.close();
    } catch {
      // Already closed by a disconnect.
    }
  };
  // The s2s-service drops the request when the user talks over the reply, types a
  // message or leaves. Hermes would otherwise finish the turn, and in its default
  // `interrupt` mode answer the next message with an "interrupting" notice that would be
  // read aloud.
  const hangUp = () => {
    if (closed) return;
    stop();
    sendToHermes({ user, chatId, text: '/stop' }).then(
      (result) => {
        if (!result.ok) log.warn(`Could not stop the Hermes turn: ${result.error}`);
      },
      (error) => log.error('Could not stop the Hermes turn:', error),
    );
  };
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => finish(replied ? undefined : 'Hermes stopped without replying'), AGENT_IDLE_MS);
  };
  const speak = (delta: string) => {
    if (delta) writeData({ choices: [{ delta: { content: delta } }] });
  };
  const maxTimer = setTimeout(() => finish(), TURN_MAX_MS);

  const onFrame = (payload: unknown) => {
    const frame = frameSchema.safeParse(payload);
    if (!frame.success || closed) return;
    switch (frame.data.kind) {
      case 'draft':
        speak(tracker.draft(frame.data.draftId, frame.data.content));
        break;
      case 'message':
        replied = true;
        speak(tracker.message(textOfParts(frame.data.message.parts)));
        break;
      case 'turn_end':
        speak(tracker.turnEnd(frame.data.response ?? ''));
        return finish();
      case 'tool_step': {
        const { toolCallId, toolName, preview, status } = frame.data.step;
        writeData({ tool: { callId: toolCallId, name: toolName, preview, status } });
        break;
      }
      case 'typing':
        // A comment line: it keeps the s2s-service's read timeout from firing while the
        // agent works without speaking.
        write(': working\n\n');
        break;
      case 'connection-status':
        if (!frame.data.connected) return finish('Hermes disconnected');
        break;
    }
    armIdle();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel: hangUp,
  });
  req.signal.addEventListener('abort', hangUp);

  // Subscribed before the message goes out, so no frame of the reply can be missed.
  unsubscribe = await subscribeToHermesChat(chatId, onFrame);
  const result = await sendToHermes({ user, chatId, text, voice: true });
  if (!result.ok) {
    stop();
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  armIdle();

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
  });
}
