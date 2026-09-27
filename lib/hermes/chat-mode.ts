import type { SearchGroupId } from '@/lib/utils';

// Which lane a chat is permanently committed to, decided by its FIRST message. Resolved
// server-side (app/search/[id]/page.tsx) and handed to the client as a plain prop, so the
// answer is already there on the first render.
export type HermesChatLock = 'hermes' | 'search' | null;

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

// Splits two things that used to be one value, which is what made the Agent-mode UI
// unreliable: whether this chat IS a Hermes chat (a fact about stored data — drives how
// its messages render), versus which lane the NEXT message should take (a UI selector,
// backed by a global localStorage preference shared across every chat).
//
// Deriving the first from the second meant a chat's messages rendered differently
// depending on a cross-chat preference that async queries could silently overwrite —
// hence the action toolbar appearing on Hermes messages, and the live stream detaching.
//
// committedThisSession covers the one case with no server truth yet: a brand-new chat that
// just sent its first Agent message. Its URL is swapped in with history.replaceState, so
// nothing remounts and no server render ever runs for it.
export function resolveHermesChatMode({
  serverLock,
  committedThisSession,
  storedGroup,
}: {
  serverLock: HermesChatLock;
  committedThisSession: boolean;
  storedGroup: SearchGroupId;
}): { isHermesChat: boolean; effectiveGroup: SearchGroupId } {
  const isHermesChat = serverLock === 'hermes' || committedThisSession;

  if (isHermesChat) {
    return { isHermesChat, effectiveGroup: 'hermes' };
  }

  // A search-locked chat can never offer Agent again, so fall back to the base lane rather
  // than leaving the selector stuck on a mode this chat will refuse.
  if (serverLock === 'search' && storedGroup === 'hermes') {
    return { isHermesChat, effectiveGroup: 'auto' };
  }

  return { isHermesChat, effectiveGroup: storedGroup };
}
