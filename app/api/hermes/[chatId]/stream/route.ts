import { auth } from '@/lib/auth';
import { getChatByIdForValidation } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { subscribeToHermesChat, markHermesChatViewerActive } from '@/lib/hermes/realtime';
import { isHermesEnabled } from '@/lib/hermes/feature-flag';

const ACTIVE_VIEWER_REFRESH_MS = 20_000;

// Live delivery of Hermes agent-event frames (new messages, connection-status changes) to
// an open browser tab. Deliberately NOT ai-resumable-stream — see lib/hermes/realtime.ts's
// comment on why a Hermes conversation doesn't fit that bounded-turn abstraction. Plain
// standard-SSE framing (`data: <json>\n\n`), consumed client-side by the browser's native
// EventSource (hooks/use-hermes-stream.ts) rather than the `ai` package's
// createUIMessageStream/JsonToSseTransformStream wire protocol — that protocol is built
// for a bounded LLM generation turn (start/finish/tool-call framing) with its own
// client-side reader wired into useChat's resumption path; adopting its wire shape here
// without that reader would mean hand-rolling a parser for protocol semantics this
// endpoint doesn't need, for no benefit over plain SSE.
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
