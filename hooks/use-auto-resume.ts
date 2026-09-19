'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';

export type UseAutoResumeParams = {
  autoResume: boolean;
  initialMessages: ChatMessage[];
  status: UseChatHelpers<ChatMessage>['status'];
  resumeStream: UseChatHelpers<ChatMessage>['resumeStream'];
  clearError: UseChatHelpers<ChatMessage>['clearError'];
};

export function useAutoResume({ autoResume, initialMessages, status, resumeStream, clearError }: UseAutoResumeParams) {
  const hasAttemptedInitialResumeRef = useRef(false);
  const statusRef = useRef(status);
  const isReattachingRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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

  // Re-attach whenever the tab comes back to the foreground. Mobile browsers
  // (iOS Safari in particular) kill the in-flight SSE connection while the
  // page is backgrounded, which surfaces client-side as a stream "error"
  // even though the generation kept running server-side. Without this, the
  // user is stuck looking at a false failure until they manually reload.
  useEffect(() => {
    if (!autoResume) return;

    const tryReattach = () => {
      if (document.visibilityState !== 'visible') return;
      if (isReattachingRef.current) return;
      if (statusRef.current !== 'error') return;

      isReattachingRef.current = true;
      clearError();
      void resumeStream().finally(() => {
        isReattachingRef.current = false;
      });
    };

    document.addEventListener('visibilitychange', tryReattach);
    window.addEventListener('pageshow', tryReattach);
    window.addEventListener('online', tryReattach);

    return () => {
      document.removeEventListener('visibilitychange', tryReattach);
      window.removeEventListener('pageshow', tryReattach);
      window.removeEventListener('online', tryReattach);
    };
  }, [autoResume, resumeStream, clearError]);
}
