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
  // Only stops reading the stream here: the server keeps generating, and the
  // re-attach that follows picks the reply up again.
  stopReading: UseChatHelpers<ChatMessage>['stop'];
  clearError: UseChatHelpers<ChatMessage>['clearError'];
};

export function useAutoResume({
  autoResume,
  initialMessages,
  messages,
  status,
  error,
  resumeStream,
  stopReading,
  clearError,
}: UseAutoResumeParams) {
  const hasAttemptedInitialResumeRef = useRef(false);
  const statusRef = useRef(status);
  const messagesRef = useRef(messages);
  const isStoppingRef = useRef(false);
  // Set until the resumeStream() call it holds settles, which covers the
  // resume request itself, while the chat status still reads 'ready'.
  const pendingResumeRef = useRef<Promise<void> | null>(null);
  const retryAttemptRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;
    messagesRef.current = messages;
  }, [status, messages]);

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
  // connection while the page is backgrounded or the network switches, even
  // though the generation keeps running server-side. iOS reports the loss late,
  // as an error, or not at all, leaving a stream that never delivers another
  // chunk. Either way, re-attach to the server's stream of the reply.
  const reattach = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    if (isStoppingRef.current) return;
    if (!hasUnfinishedReply(messagesRef.current)) return;

    const currentStatus = statusRef.current;
    if (currentStatus === 'error') {
      clearError();
    } else if (currentStatus === 'submitted' || currentStatus === 'streaming' || pendingResumeRef.current) {
      isStoppingRef.current = true;
      try {
        await stopReading();
      } finally {
        isStoppingRef.current = false;
      }
    } else {
      return;
    }

    const resume = resumeStream().finally(() => {
      if (pendingResumeRef.current === resume) pendingResumeRef.current = null;
    });
    pendingResumeRef.current = resume;
  }, [resumeStream, stopReading, clearError]);

  // A connection lost while the page stays in the foreground (a network
  // switch) surfaces as an error, and the first request after iOS wakes a PWA
  // often fails too: retry on the error itself, a few times.
  useEffect(() => {
    if (status === 'streaming') retryAttemptRef.current = 0;
    if (!autoResume || status !== 'error' || !isConnectionLoss(error)) return;

    const delay = RESUME_RETRY_DELAYS_MS[retryAttemptRef.current];
    if (delay === undefined) return;
    retryAttemptRef.current += 1;

    const timer = setTimeout(() => void reattach(), delay);
    return () => clearTimeout(timer);
  }, [autoResume, status, error, reattach]);

  // Back in the foreground, the connection that carried the reply cannot be
  // trusted, whatever state it reports: re-attach whenever a reply is under way
  // or ended on an error.
  useEffect(() => {
    if (!autoResume) return;

    const reattachNow = () => {
      if (document.visibilityState !== 'visible') return;
      retryAttemptRef.current = 0;
      void reattach();
    };
    // Only a page restored from the back/forward cache: a fresh load already
    // resumes on mount.
    const reattachOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) reattachNow();
    };

    document.addEventListener('visibilitychange', reattachNow);
    window.addEventListener('pageshow', reattachOnRestore);
    window.addEventListener('online', reattachNow);

    return () => {
      document.removeEventListener('visibilitychange', reattachNow);
      window.removeEventListener('pageshow', reattachOnRestore);
      window.removeEventListener('online', reattachNow);
    };
  }, [autoResume, reattach]);
}
