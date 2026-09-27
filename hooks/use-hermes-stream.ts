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
  | { kind: 'reaction'; message: { id: string; emoji: string | null } }
  | { kind: 'connection-status'; connected: boolean; error: string | null };

// Hermes's typing frames are one-shot and self-expiring by contract: gateway/relay/
// adapter.py's send_typing notes that "Discord/Telegram indicators self-expire and need no
// cleanup", and its stop_typing clear is Slack-gated — a connector advertising
// platform 'zetora' never receives one. So nothing will ever tell us the agent stopped,
// and a turn that ends without a message (a /stop, an error, a reaction-only turn, or a
// heartbeat from the 2s _keep_typing loop landing after the turn's final message) would
// leave the indicator up forever. Five missed heartbeats is the agent having stopped.
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
  // Fired whenever Hermes reacts to (or un-reacts from) one of the user's own messages —
  // see agent-event/route.ts's `react` branch. null clears the reaction.
  onReaction?: (messageId: string, emoji: string | null) => void;
}) {
  useEffect(() => {
    if (!enabled || !chatId) return;

    const source = new EventSource(`/api/hermes/${chatId}/stream`);

    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    const stopTyping = () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
      onTyping?.(null);
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
        stopTyping();
        setMessages((current) => {
          if (current.some((m) => m.id === id)) return current;
          return [...current, { id, role, parts } as ChatMessage];
        });
        return;
      }

      if (payload.kind === 'edit') {
        const { id, parts } = payload.message;
        stopTyping();
        setMessages((current) => current.map((m) => (m.id === id ? ({ ...m, parts } as ChatMessage) : m)));
        return;
      }

      if (payload.kind === 'typing') {
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          typingTimeout = null;
          onTyping?.(null);
        }, TYPING_IDLE_TIMEOUT_MS);
        onTyping?.(payload.content || 'Working…');
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
      if (typingTimeout) clearTimeout(typingTimeout);
      source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setMessages/onConnectionStatus/onTyping/onReaction are stable callbacks from the caller
  }, [chatId, enabled]);
}
