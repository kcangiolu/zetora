'use client';

import { useEffect } from 'react';
import type { ChatMessage } from '@/lib/types';

type HermesEvent =
  // `parts` is intentionally loose (Record-shaped, not the full ChatMessage union) — this
  // mirrors exactly what app/api/internal/hermes/agent-event/route.ts persists and
  // publishes, which already includes non-text parts like `data-hermes_prompt`.
  | { kind: 'message'; message: { id: string; role: 'assistant'; parts: Array<Record<string, unknown>>; createdAt: string } }
  | { kind: 'edit'; message: { id: string; parts: Array<Record<string, unknown>> } }
  | { kind: 'typing'; content: string | null }
  | { kind: 'draft'; draftId: number; content: string; final: boolean }
  | { kind: 'reaction'; message: { id: string; emoji: string | null } }
  | { kind: 'connection-status'; connected: boolean; error: string | null };

// Hermes's typing frames are one-shot and self-expiring by contract: gateway/relay/
// adapter.py's send_typing notes that "Discord/Telegram indicators self-expire and need no
// cleanup", and its stop_typing clear is Slack-gated — a connector advertising
// platform 'zetora' never receives one. So nothing will ever tell us the agent stopped,
// and a turn that ends without a message (a /stop, an error, a reaction-only turn, or a
// heartbeat from the 2s _keep_typing loop landing after the turn's final message) would
// leave the indicator up forever. Five missed heartbeats is the agent having stopped.
// Draft frames share this timer for the same reason: they carry no "stream ended" signal
// either (the clear is the turn-final `send`, which a dead turn never produces).
const TYPING_IDLE_TIMEOUT_MS = 10_000;

// Subscribes to app/api/hermes/[chatId]/stream (plain SSE, native EventSource — see that
// route's comment on why it isn't the `ai` package's UI-message-stream protocol) and
// merges incoming Hermes agent replies into useChat's own message list, so voice/TTS/
// attachment rendering downstream works unchanged regardless of which mode produced the
// message. Only active while `enabled` (the chat is in Hermes mode) — a no-op otherwise.
export function useHermesStream({
  chatId,
  enabled,
  setMessages,
  onConnectionStatus,
  onTyping,
  onDraft,
  onReaction,
}: {
  chatId: string;
  enabled: boolean;
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;
  onConnectionStatus?: (connected: boolean, error: string | null) => void;
  // Fired on every `typing` heartbeat with a non-null string (the agent's current status
  // phrase when it has one, a generic fallback otherwise). Called with null to clear it,
  // either when a real message/edit lands — the arriving content is itself proof the agent
  // is done for now — or after TYPING_IDLE_TIMEOUT_MS of silence. The two cases are
  // unambiguous: only a clear ever passes null.
  onTyping?: (content: string | null) => void;
  // Fired on every `draft` frame with the reply's text so far — the progressive-streaming
  // lane. Same clearing contract as onTyping (null clears), and the same two triggers:
  // the turn-final `send` landing, or idle expiry. The text is never persisted, so this is
  // the only place it exists — a reload mid-answer legitimately shows nothing until the
  // segment lands as a real message.
  onDraft?: (content: string | null) => void;
  // Fired whenever Hermes reacts to (or un-reacts from) one of the user's own messages —
  // see agent-event/route.ts's `react` branch. null clears the reaction.
  onReaction?: (messageId: string, emoji: string | null) => void;
}) {
  useEffect(() => {
    if (!enabled || !chatId) return;

    const source = new EventSource(`/api/hermes/${chatId}/stream`);

    // One timer for both transient indicators (the typing label and the streamed draft):
    // they are two views of the same fact — a turn is in flight — and the same events end
    // them, so a shared timer can't leave one of them stranded behind the other.
    let idleTimeout: ReturnType<typeof setTimeout> | null = null;
    const clearProgress = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }
      onTyping?.(null);
      onDraft?.(null);
    };
    const armIdleTimeout = () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => {
        idleTimeout = null;
        onTyping?.(null);
        onDraft?.(null);
      }, TYPING_IDLE_TIMEOUT_MS);
    };

    source.onmessage = (event) => {
      let payload: HermesEvent;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.kind === 'message') {
        const { id, role, parts } = payload.message;
        clearProgress();
        setMessages((current) => {
          if (current.some((m) => m.id === id)) return current;
          return [...current, { id, role, parts } as ChatMessage];
        });
        return;
      }

      if (payload.kind === 'edit') {
        const { id, parts } = payload.message;
        clearProgress();
        setMessages((current) => current.map((m) => (m.id === id ? ({ ...m, parts } as ChatMessage) : m)));
        return;
      }

      if (payload.kind === 'typing') {
        armIdleTimeout();
        onTyping?.(payload.content || 'Working…');
        return;
      }

      if (payload.kind === 'draft') {
        // A sealing frame is never sent to a Telegram-shaped connector like this one
        // (adapter.py arms seal interception only for stream-is-the-message chats), but if
        // one ever arrives it means the stream is over — that's a clear, not a live draft.
        if (payload.final) {
          clearProgress();
          return;
        }
        // Each frame carries the reply's full text so far, so the latest one always wins:
        // payload.draftId identifies the turn's stream for the gateway's own bookkeeping
        // and needs no client-side keying.
        armIdleTimeout();
        onDraft?.(payload.content);
        return;
      }

      if (payload.kind === 'reaction') {
        onReaction?.(payload.message.id, payload.message.emoji);
        return;
      }

      if (payload.kind === 'connection-status') {
        onConnectionStatus?.(payload.connected, payload.error);
      }
    };

    return () => {
      if (idleTimeout) clearTimeout(idleTimeout);
      source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setMessages/onConnectionStatus/onTyping/onDraft/onReaction are stable callbacks from the caller
  }, [chatId, enabled]);
}
