'use client';

import { useCallback } from 'react';

export interface HermesPromptResponse {
  promptId: string;
  optionId: string;
  label?: string;
}

// Outbound path for a Hermes-mode chat: posts straight to /api/hermes/send instead of
// useChat's sendMessage (which targets /api/search — a Hermes turn never calls an LLM, so
// it never goes through that route). The user's own message and the eventual agent reply
// both reach the UI via the SSE channel (use-hermes-stream.ts), not this call's response —
// this only confirms the send was accepted/delivered.
export function useHermesSend(chatId: string) {
  return useCallback(
    async (text: string, promptResponse?: HermesPromptResponse) => {
      const res = await fetch('/api/hermes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text, promptResponse }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? `Failed to send (${res.status})`);
      }

      return (await res.json()) as { success: true; messageId: string };
    },
    [chatId],
  );
}
