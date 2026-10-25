'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import { useCallback, useEffect, useRef } from 'react';
import { hasUnfinishedReply, isConnectionLoss, RESUME_RETRY_DELAYS_MS } from '@/lib/chat-resume';
import type { ChatMessage } from '@/lib/types';

export type UseAutoResumeParams = {
  autoResume: boolean;
  initialMessages: ChatMessage[];
  messages: ChatMessage[];
  status: UseChatHelpers<ChatMessage>['status'];
  error: UseChatHelpers<ChatMessage>['error'];
  resumeStream: UseChatHelpers<ChatMessage>['resumeStream'];
  clearError: UseChatHelpers<ChatMessage>['clearError'];
};

export function useAutoResume({
  autoResume,
  initialMessages,
  messages,
  status,
  error,
  resumeStream,
  clearError,
}: UseAutoResumeParams) {
  const hasAttemptedInitialResumeRef = useRef(false);
  const statusRef = useRef(status);
  const errorRef = useRef(error);
  const messagesRef = useRef(messages);
  const isReattachingRef = useRef(false);
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;
    errorRef.current = error;
    messagesRef.current = messages;
  }, [status, error, messages]);

  // Resume once on mount, for the case where the page was loaded (or reloaded)
  // while a generation was still in flight server-side.
  useEffect(() => {
    if (!autoResume) return;
    if (hasAttemptedInitialResumeRef.current) return;
    hasAttemptedInitialResumeRef.current = true;

    const mostRecentMessage = initialMessages.at(-1);

    if (mostRecentMessage?.role === 'user') {
      void resumeStream();
    }
  }, [autoResume, initialMessages, resumeStream]);

  // Mobile browsers (iOS Safari and PWAs in particular) kill the in-flight SSE
  // connection while the page is backgrounded or the network switches, which
  // surfaces client-side as a stream "error" even though the generation kept
  // running server-side. Re-attach instead of leaving that false failure up.
  const tryReattach = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    if (isReattachingRef.current) return;
    if (statusRef.current !== 'error') return;
    if (!isConnectionLoss(errorRef.current)) return;
    if (!hasUnfinishedReply(messagesRef.current)) return;

    isReattachingRef.current = true;
    clearError();
    void resumeStream().finally(() => {
      isReattachingRef.current = false;
    });
  }, [resumeStream, clearError]);

  // iOS reports the dropped connection only after the page is back in the
  // foreground, after the events below have fired, and the first request after
  // waking often fails too: retry on the error itself, a few times.
  useEffect(() => {
    if (status === 'streaming') retryAttemptRef.current = 0;
    if (!autoResume || status !== 'error') return;

    const delay = RESUME_RETRY_DELAYS_MS[retryAttemptRef.current];
    if (delay === undefined) return;
    retryAttemptRef.current += 1;

    const timer = setTimeout(tryReattach, delay);
    return () => clearTimeout(timer);
  }, [autoResume, status, error, tryReattach]);

  useEffect(() => {
    if (!autoResume) return;

    const reattachNow = () => {
      if (document.visibilityState !== 'visible') return;
      retryAttemptRef.current = 0;
      tryReattach();
    };

    document.addEventListener('visibilitychange', reattachNow);
    window.addEventListener('pageshow', reattachNow);
    window.addEventListener('online', reattachNow);

    return () => {
      document.removeEventListener('visibilitychange', reattachNow);
      window.removeEventListener('pageshow', reattachNow);
      window.removeEventListener('online', reattachNow);
    };
  }, [autoResume, tryReattach]);
}
