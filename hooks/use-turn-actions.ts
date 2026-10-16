'use client';

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import { sileo } from 'sileo';

import { deleteTrailingMessages } from '@/app/actions';
import type { ChatMessage } from '@/lib/types';

interface TurnActionDeps {
  getMessages: () => ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  setSuggestedQuestions: (questions: string[]) => void;
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  stop: UseChatHelpers<ChatMessage>['stop'];
  isSignedIn: boolean;
  // regenerate() always targets /api/search, which a Hermes chat never uses, and
  // Hermes keeps its own copy of the history: both actions are off there.
  isHermesChat: boolean;
  // Set before regenerating so the retried request bypasses the response cache.
  skipCacheRef?: RefObject<boolean>;
}

// After stop(), the abort needs a moment to reach the server; deleting before
// that lets the old response's onFinish save it again behind the delete.
const STOP_SETTLE_MS = 100;

// Retry and delete for the last turn (the last user message and the reply to
// it). The callbacks are stable and read the latest dependencies when they run,
// so memoized message parts can hold them.
export function useTurnActions(deps: TurnActionDeps) {
  const depsRef = useRef(deps);
  useLayoutEffect(() => {
    depsRef.current = deps;
  });

  // Stops the stream and deletes the last user message and everything after it
  // on the server. Returns the local messages and that user message's index,
  // or null when there is no user message.
  const removeLastTurnOnServer = useCallback(async () => {
    const { getMessages, stop, isSignedIn } = depsRef.current;
    const messages = getMessages();
    const lastUserIndex = messages.findLastIndex((m) => m.role === 'user');
    if (lastUserIndex === -1) return null;

    await stop();
    await new Promise((resolve) => setTimeout(resolve, STOP_SETTLE_MS));
    if (isSignedIn) {
      await deleteTrailingMessages({ id: messages[lastUserIndex].id });
    }
    return { messages, lastUserIndex };
  }, []);

  const retryLastTurn = useCallback(async () => {
    if (depsRef.current.isHermesChat) {
      sileo.error({
        title: 'Retry is not available here',
        description: 'Use the /retry command in your Agent chat instead.',
      });
      return;
    }
    try {
      const removed = await removeLastTurnOnServer();
      if (!removed) return;

      const { setMessages, setSuggestedQuestions, regenerate, skipCacheRef } = depsRef.current;
      setMessages(removed.messages.slice(0, removed.lastUserIndex + 1));
      setSuggestedQuestions([]);
      if (skipCacheRef) skipCacheRef.current = true;
      await regenerate();
    } catch (error) {
      console.error('Error retrying the last turn:', error);
      sileo.error({ title: 'Failed to retry' });
    }
  }, [removeLastTurnOnServer]);

  const deleteLastTurn = useCallback(async () => {
    if (depsRef.current.isHermesChat) {
      sileo.error({
        title: 'Deleting is not available here',
        description: 'Agent conversations are append-only — use /undo in your Agent chat instead.',
      });
      return;
    }
    try {
      const removed = await removeLastTurnOnServer();
      if (!removed) return;

      const { setMessages, setSuggestedQuestions } = depsRef.current;
      setMessages(removed.messages.slice(0, removed.lastUserIndex));
      setSuggestedQuestions([]);
    } catch (error) {
      console.error('Error deleting the last turn:', error);
      sileo.error({ title: 'Failed to delete message' });
    }
  }, [removeLastTurnOnServer]);

  return { retryLastTurn, deleteLastTurn };
}
