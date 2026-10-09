import 'server-only';

import { getUserBio, listMemoryEntries, touchMemoryEntries } from '@/lib/db/queries/memory';
import type { MemoryEntry } from '@/lib/db/schema';
import { MEMORY_LIMITS } from './constants';
import { buildContextualMemoryBlock, buildMemorySystemBlock, capEntries } from './prompt';
import { selectRelevantEntries } from './text-match';

import { createLogger } from '@/lib/logger';

const log = createLogger('memory');

export interface MemoryContext {
  // Appended to the system prompt — stable across messages.
  systemBlock: string;
  // Appended to the last user message — specific to this message.
  contextualBlock: string;
}

const EMPTY_CONTEXT: MemoryContext = { systemBlock: '', contextualBlock: '' };

function isInjectable(entry: MemoryEntry) {
  return entry.status === 'confirmed' && !entry.sensitive;
}

// Stable order on purpose (user-written first, then oldest first): ordering by
// recency of use would reshuffle the system prompt on every message and
// defeat prompt caching.
function byPriority(a: MemoryEntry, b: MemoryEntry) {
  if (a.userLocked !== b.userLocked) return a.userLocked ? -1 : 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * Loads what to inject for one message. `queryText` is what the contextual
 * entries are matched against (the latest user message, plus the previous one
 * so a short follow-up keeps its topic). Never throws: memory is an
 * enhancement, a failure here must not break the chat.
 */
export async function loadMemoryContext(userId: string, queryText: string): Promise<MemoryContext> {
  try {
    const [bio, entries] = await Promise.all([getUserBio(userId), listMemoryEntries(userId)]);
    const injectable = entries.filter(isInjectable);

    const always = capEntries(
      injectable.filter((e) => e.tier === 'always').sort(byPriority),
      MEMORY_LIMITS.alwaysEntriesMax,
      MEMORY_LIMITS.alwaysEntriesMaxChars,
    );
    const contextual = selectRelevantEntries(
      injectable.filter((e) => e.tier === 'contextual'),
      queryText,
      MEMORY_LIMITS.contextualEntriesMax,
    );

    // 'always' entries are used by definition; only contextual hits tell
    // which facts are still relevant, and that is what expiry looks at.
    touchMemoryEntries(contextual.map((e) => e.id)).catch((error) =>
      log.error('Failed to record memory usage:', error),
    );

    return {
      systemBlock: buildMemorySystemBlock(bio, always),
      contextualBlock: buildContextualMemoryBlock(contextual),
    };
  } catch (error) {
    log.error('Failed to load memory context:', error);
    return EMPTY_CONTEXT;
  }
}
