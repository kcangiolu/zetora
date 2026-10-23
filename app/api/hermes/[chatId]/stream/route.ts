import { auth } from '@/lib/auth';
import { getChatByIdForValidation } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { ACTIVE_VIEWER_REFRESH_MS, subscribeToHermesChat, markHermesChatViewerActive } from '@/lib/hermes/realtime';
import { isHermesEnabled } from '@/lib/hermes/feature-flag';

// Live delivery of Hermes agent-event frames (new messages, connection-status changes) to
// an open tab, as plain SSE read by the browser's EventSource (hooks/use-hermes-stream.ts).
// Not ai-resumable-stream or the `ai` UI-message protocol: both model a bounded LLM turn,
// which a Hermes conversation is not (see lib/hermes/realtime.ts).
export async function GET(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  if (!isHermesEnabled()) {
    return new ChatSDKError('not_found:api').toResponse();
  }

  const { chatId } = await params;
  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth.api.getSession(req);
  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  // A brand-new Hermes chat has no `chat` row yet — /api/hermes/send is the only thing
  // that creates one, and only on the FIRST message (see its own comment on why). The
  // client opens this stream the moment Hermes mode is activated, before any message is
  // necessarily sent, so a missing chat here is a legitimate "nothing to subscribe to
  // yet" state, not an error — 404ing would make the browser's EventSource retry loop
  // race the chat's creation and miss the very first agent reply. chatId is a private,
  // client-generated random id never exposed before the owning session creates it, so
  // there's no meaningful ownership check to perform for a chat that doesn't exist yet.
  const chat = await getChatByIdForValidation({ id: chatId });
  if (chat && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Controller already closed (client disconnected mid-write) — ignore.
        }
      };

      // A leading comment frame opens the stream immediately so EventSource fires
      // `onopen` right away instead of waiting for the first real event.
      controller.enqueue(encoder.encode(': connected\n\n'));

      // The "viewer is active" marker (gates push notifications) lives here, not in the
      // client hook: an open SSE connection to THIS route is itself the proof of
      // liveness. Refreshed on an interval rather than set once so it decays naturally
      // (kvSet's TTL) if the connection dies without a clean close.
      void markHermesChatViewerActive(chatId);
      heartbeat = setInterval(() => {
        void markHermesChatViewerActive(chatId);
      }, ACTIVE_VIEWER_REFRESH_MS);

      void subscribeToHermesChat(chatId, send).then((unsub) => {
        unsubscribe = unsub;
        if (req.signal.aborted) unsub();
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  req.signal.addEventListener('abort', () => {
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
