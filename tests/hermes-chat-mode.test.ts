import { describe, it, expect } from 'vitest';
import { resolveHermesChatLock, resolveHermesChatMode } from '@/lib/hermes/chat-mode';

describe('resolveHermesChatLock', () => {
  it('locks to hermes as soon as a hermesConversation row exists', () => {
    expect(resolveHermesChatLock({ hasHermesConversation: true, hasMessages: true })).toBe('hermes');
  });

  it('locks to search for a chat with messages but no hermesConversation', () => {
    expect(resolveHermesChatLock({ hasHermesConversation: false, hasMessages: true })).toBe('search');
  });

  it('leaves a chat with no messages unlocked', () => {
    expect(resolveHermesChatLock({ hasHermesConversation: false, hasMessages: false })).toBeNull();
  });
});

describe('resolveHermesChatMode', () => {
  // Each case below is a bug that shipped to production. The mode selector is a global,
  // cross-chat localStorage preference, so it must never be what decides whether a chat's
  // messages render as Agent messages.
  it('treats a hermes-locked chat as a Hermes chat even when the stored mode says otherwise', () => {
    expect(resolveHermesChatMode({ serverLock: 'hermes', sessionLock: null, storedGroup: 'auto' })).toEqual({
      chatLock: 'hermes',
      isHermesChat: true,
      effectiveGroup: 'hermes',
    });
  });

  it('treats a brand-new chat as a Hermes chat once it has sent its first Agent message', () => {
    expect(resolveHermesChatMode({ serverLock: null, sessionLock: 'hermes', storedGroup: 'hermes' })).toEqual({
      chatLock: 'hermes',
      isHermesChat: true,
      effectiveGroup: 'hermes',
    });
  });

  it('keeps a search-locked chat out of Agent mode and falls back to the base lane', () => {
    expect(resolveHermesChatMode({ serverLock: 'search', sessionLock: null, storedGroup: 'hermes' })).toEqual({
      chatLock: 'search',
      isHermesChat: false,
      effectiveGroup: 'auto',
    });
  });

  it('locks a brand-new chat out of Agent mode once its first message was a search turn', () => {
    // The chat never gets a server render (history.replaceState), so without the session
    // lock it kept offering Agent until reloaded — and a message sent there was refused by
    // /api/hermes/send, leaving the view stuck rendering as an Agent chat.
    expect(resolveHermesChatMode({ serverLock: null, sessionLock: 'search', storedGroup: 'hermes' })).toEqual({
      chatLock: 'search',
      isHermesChat: false,
      effectiveGroup: 'auto',
    });
  });

  it('lets the server lock win over the session lock', () => {
    expect(resolveHermesChatMode({ serverLock: 'search', sessionLock: 'hermes', storedGroup: 'hermes' })).toEqual({
      chatLock: 'search',
      isHermesChat: false,
      effectiveGroup: 'auto',
    });
  });

  it('does not treat an armed-but-unused Agent selection as a Hermes chat', () => {
    // Agent mode picked in the + menu, nothing sent yet: the selector is armed for the next
    // message, but no message in this chat came from Hermes, so nothing may render as such.
    expect(resolveHermesChatMode({ serverLock: null, sessionLock: null, storedGroup: 'hermes' })).toEqual({
      chatLock: null,
      isHermesChat: false,
      effectiveGroup: 'hermes',
    });
  });

  it('passes a non-Agent stored mode through untouched on an unlocked chat', () => {
    expect(resolveHermesChatMode({ serverLock: null, sessionLock: null, storedGroup: 'auto' })).toEqual({
      chatLock: null,
      isHermesChat: false,
      effectiveGroup: 'auto',
    });
  });

  it('leaves a search-locked chat on its stored mode when that mode is not Agent', () => {
    expect(resolveHermesChatMode({ serverLock: 'search', sessionLock: null, storedGroup: 'extreme' })).toEqual({
      chatLock: 'search',
      isHermesChat: false,
      effectiveGroup: 'extreme',
    });
  });
});
