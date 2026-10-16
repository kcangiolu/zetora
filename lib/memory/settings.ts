import type { UserPreferenceValues } from '@/lib/db/schema';

// Memory-related user preferences, read the same way on every code path.

type Preferences = UserPreferenceValues | null | undefined;

// Master switch (Settings → Memories): when off, nothing is injected and
// nothing is learned.
export function isMemoryEnabled(preferences: Preferences): boolean {
  return preferences?.['zetora-memory-enabled'] !== false;
}

// The "Memory" background task toggle (Settings → AI models): when off, the
// memory is still injected but only changes through explicit requests and
// manual edits.
export function isAutoMemoryEnabled(preferences: Preferences): boolean {
  return isMemoryEnabled(preferences) && preferences?.['zetora-memory-curator-enabled'] !== false;
}

// With no dedicated model picked, a chat turn's memory update reuses the
// conversation's own model (and its cached prompt).
export function hasDedicatedMemoryModel(preferences: Preferences): boolean {
  const model = preferences?.['zetora-tertiary-memory-curator-model'];
  return typeof model === 'string' && model.length > 0;
}
