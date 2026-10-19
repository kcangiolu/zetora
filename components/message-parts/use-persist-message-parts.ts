import { useCallback } from 'react';

import { updateMessageParts } from '@/app/actions';
import { useMessageActions } from '@/contexts/message-actions-context';
import type { ChatMessage } from '@/lib/types';

// Overwrites a message's stored parts, in the open chat and, for a signed-in user, in
// the database. Used by the in-place edits, which never regenerate.
export function usePersistMessageParts(messageId: string, isSignedIn: boolean) {
  const { setMessages } = useMessageActions();
  return useCallback(
    async (parts: ChatMessage['parts']) => {
      setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, parts } : m)));
      if (isSignedIn && messageId) await updateMessageParts({ id: messageId, parts });
    },
    [messageId, isSignedIn, setMessages],
  );
}
