import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserById } from '@/lib/db/queries';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import { subscribeToHermesChat } from '@/lib/hermes/realtime';
import { sendToHermes } from '@/lib/hermes/send';
import { HermesSpeechTracker, hermesMessageText } from '@/lib/hermes/voice-reply';
import { resolveVoiceRequestUserId } from '@/lib/voice-session-token';

// Hermes's typing heartbeat repeats every 2s while the agent works, and nothing marks the
// end of a turn (see hooks/use-hermes-stream.ts). Before a first reply, this much silence
// means the agent stopped without answering; after one, a shorter silence ends the turn.
const AGENT_IDLE_MS = 15_000;
const REPLY_IDLE_MS = 3_000;
const TURN_MAX_MS = 5 * 60_000;

const bodySchema = z.object({ chatId: z.string().uuid(), text: z.string().trim().min(1) });

const frameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('draft'), draftId: z.number(), content: z.string() }),
  z.object({ kind: z.literal('message'), message: z.object({ parts: z.array(z.record(z.string(), z.unknown())) }) }),
  z.object({ kind: z.literal('typing') }),
  z.object({ kind: z.literal('tool_step') }),
  z.object({ kind: z.literal('connection-status'), connected: z.boolean() }),
]);

// The reply leg of the voice page in Agent mode, called by the s2s-service in place of
// /api/v1/chat/completions: it sends the user's transcript to their Hermes agent, in the
// voice session's own Hermes chat, and streams the agent's reply back in the same
// OpenAI-style SSE, so the s2s-service only switches URLs.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const userId = await resolveVoiceRequestUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'chatId and text are required' }, { status: 400 });
  const { chatId, text } = parsed.data;

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      // The s2s-service hung up (a barge-in): nothing left to write to.
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
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => finish(replied ? undefined : 'Hermes stopped without replying'),
      replied ? REPLY_IDLE_MS : AGENT_IDLE_MS,
    );
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
        speak(tracker.message(hermesMessageText(frame.data.message.parts)));
        break;
      case 'connection-status':
        if (!frame.data.connected) return finish('Hermes disconnected');
        break;
      default:
        // A comment line: it keeps the s2s-service's read timeout from firing while the
        // agent works without speaking.
        write(': working\n\n');
    }
    armIdle();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel: stop,
  });
  req.signal.addEventListener('abort', stop);

  // Subscribed before the message goes out, so no frame of the reply can be missed.
  unsubscribe = await subscribeToHermesChat(chatId, onFrame);
  const result = await sendToHermes({ user: { id: user.id, name: user.name }, chatId, text, voice: true });
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
