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
  // phrase when it has one, a generic fallback otherwise), and called with null to clear
  // whenever a real message/edit lands — the arriving content is itself proof the agent
  // is done for now. The two cases are unambiguous: only the clear call ever passes null.
  onTyping?: (content: string | null) => void;
  // Fired whenever Hermes reacts to (or un-reacts from) one of the user's own messages —
  // see agent-event/route.ts's `react` branch. null clears the reaction.
  onReaction?: (messageId: string, emoji: string | null) => void;
}) {
  useEffect(() => {
    if (!enabled || !chatId) return;

    const source = new EventSource(`/api/hermes/${chatId}/stream`);

    source.onmessage = (event) => {
      let payload: HermesEvent;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.kind === 'message') {
        const { id, role, parts } = payload.message;
        onTyping?.(null);
        setMessages((current) => {
          if (current.some((m) => m.id === id)) return current;
          return [...current, { id, role, parts } as ChatMessage];
        });
        return;
      }

      if (payload.kind === 'edit') {
        const { id, parts } = payload.message;
        onTyping?.(null);
        setMessages((current) => current.map((m) => (m.id === id ? ({ ...m, parts } as ChatMessage) : m)));
        return;
      }

      if (payload.kind === 'typing') {
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

    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setMessages/onConnectionStatus/onTyping/onReaction are stable callbacks from the caller
  }, [chatId, enabled]);
}
