'use client';

import { createContext, useContext } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';

import type { ChatMessage } from '@/lib/types';

// The actions a message list hands to every message and message part. Provided once by
// Messages instead of threaded through each level as props; every callback is stable, so
// streamed chunks never change the context value.
export interface MessageActions {
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  // Reads the current message list when an action runs: the list itself changes on every
  // streamed chunk.
  getMessages: () => ChatMessage[];
  setSuggestedQuestions: (questions: string[]) => void;
  onRetryLastTurn: () => Promise<void>;
  onDeleteLastTurn: () => Promise<void>;
  onBeforeSubmit?: () => void;
  onHighlight?: (text: string) => void;
  onToggleImageHidden?: (imageUrl: string, hidden: boolean) => void;
  onVisibilityChange?: (visibility: 'public' | 'private') => void;
}

const MessageActionsContext = createContext<MessageActions | null>(null);

export const MessageActionsProvider = MessageActionsContext.Provider;

export function useMessageActions(): MessageActions {
  const actions = useContext(MessageActionsContext);
  if (!actions) throw new Error('useMessageActions must be used within a MessageActionsProvider');
  return actions;
}
