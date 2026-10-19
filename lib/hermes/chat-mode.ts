import type { SearchGroupId } from '@/lib/search/search-groups';

// Which lane a chat is permanently committed to, decided by its FIRST message. Resolved
// server-side (app/search/[id]/page.tsx) and handed to the client as a plain prop, so the
// answer is already there on the first render.
export type HermesChatLock = 'hermes' | 'search' | null;

// History/Library filter on that same lane: Agent (Hermes) chats, classic search chats, or both.
export type ChatModeFilter = 'all' | 'search' | 'agent';

// 'hermes' once a hermesConversation row exists for the chat (created lazily by
// /api/hermes/send on the first Agent-mode message), 'search' once it has any message at
// all but no hermesConversation (a native Zetora search turn got there first), or null for
// a chat that hasn't received its first message yet — still free to become either.
export function resolveHermesChatLock({
  hasHermesConversation,
  hasMessages,
}: {
  hasHermesConversation: boolean;
  hasMessages: boolean;
}): HermesChatLock {
  if (hasHermesConversation) return 'hermes';
  return hasMessages ? 'search' : null;
}

// Keeps apart whether this chat IS a Hermes chat (stored fact, drives rendering) and which
// lane the next message takes (a UI selector backed by a cross-chat localStorage
// preference): rendering must never depend on that shared preference.
// sessionLock covers a brand-new chat that just sent its first message: its URL is swapped
// with history.replaceState, so no server render runs and there is no server lock yet. The
// server lock wins whenever it exists.
export function resolveHermesChatMode({
  serverLock,
  sessionLock,
  storedGroup,
}: {
  serverLock: HermesChatLock;
  sessionLock: HermesChatLock;
  storedGroup: SearchGroupId;
}): { chatLock: HermesChatLock; isHermesChat: boolean; effectiveGroup: SearchGroupId } {
  const chatLock = serverLock ?? sessionLock;
  const isHermesChat = chatLock === 'hermes';

  if (isHermesChat) {
    return { chatLock, isHermesChat, effectiveGroup: 'hermes' };
  }

  // A search-locked chat can never offer Agent again, so fall back to the base lane rather
  // than leaving the selector stuck on a mode this chat will refuse.
  if (chatLock === 'search' && storedGroup === 'hermes') {
    return { chatLock, isHermesChat, effectiveGroup: 'auto' };
  }

  return { chatLock, isHermesChat, effectiveGroup: storedGroup };
}
