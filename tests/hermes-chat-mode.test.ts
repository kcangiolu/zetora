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
    expect(
      resolveHermesChatMode({ serverLock: 'hermes', committedThisSession: false, storedGroup: 'auto' }),
    ).toEqual({ isHermesChat: true, effectiveGroup: 'hermes' });
  });

  it('treats a brand-new chat as a Hermes chat once it has sent its first Agent message', () => {
    expect(resolveHermesChatMode({ serverLock: null, committedThisSession: true, storedGroup: 'hermes' })).toEqual({
      isHermesChat: true,
      effectiveGroup: 'hermes',
    });
  });

  it('keeps a search-locked chat out of Agent mode and falls back to the base lane', () => {
    expect(
      resolveHermesChatMode({ serverLock: 'search', committedThisSession: false, storedGroup: 'hermes' }),
    ).toEqual({ isHermesChat: false, effectiveGroup: 'auto' });
  });

  it('does not treat an armed-but-unused Agent selection as a Hermes chat', () => {
    // Agent mode picked in the + menu, nothing sent yet: the selector is armed for the next
    // message, but no message in this chat came from Hermes, so nothing may render as such.
    expect(resolveHermesChatMode({ serverLock: null, committedThisSession: false, storedGroup: 'hermes' })).toEqual({
      isHermesChat: false,
      effectiveGroup: 'hermes',
    });
  });

  it('passes a non-Agent stored mode through untouched on an unlocked chat', () => {
    expect(resolveHermesChatMode({ serverLock: null, committedThisSession: false, storedGroup: 'auto' })).toEqual({
      isHermesChat: false,
      effectiveGroup: 'auto',
    });
  });

  it('leaves a search-locked chat on its stored mode when that mode is not Agent', () => {
    expect(
      resolveHermesChatMode({ serverLock: 'search', committedThisSession: false, storedGroup: 'extreme' }),
    ).toEqual({ isHermesChat: false, effectiveGroup: 'extreme' });
  });
});
