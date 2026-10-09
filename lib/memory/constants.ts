// Shared by the DB schema, the server-side memory pipeline and the settings
// UI — keep this file free of server-only imports.

export const MEMORY_CATEGORIES = [
  'identity',
  'work',
  'preference',
  'project',
  'skill',
  'environment',
  'people',
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// No value shorter than 'weeks' on purpose: anything that won't still matter
// in a few weeks is noise, and the schema simply has no way to express it.
export const MEMORY_DURABILITIES = ['permanent', 'months', 'weeks'] as const;
export type MemoryDurability = (typeof MEMORY_DURABILITIES)[number];

// 'always' entries go into the system prompt on every message; 'contextual'
// ones are only injected when the current message matches them.
export const MEMORY_TIERS = ['always', 'contextual'] as const;
export type MemoryTier = (typeof MEMORY_TIERS)[number];

// Only 'confirmed' entries are ever injected. A model-proposed entry starts as
// a 'candidate' and is confirmed once it comes up again in another chat.
export const MEMORY_STATUSES = ['candidate', 'confirmed', 'archived'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_LIMITS = {
  entryMaxChars: 200,
  keywordMaxChars: 40,
  keywordsMax: 8,
  bioUserMaxChars: 2000,
  bioAutoMaxChars: 2000,
  // ~1.5k tokens at ~4 chars/token, across all injected 'always' entries.
  alwaysEntriesMax: 30,
  alwaysEntriesMaxChars: 6000,
  contextualEntriesMax: 6,
  opsPerTurnMax: 3,
  // Trigram similarity above which a new entry is treated as the same fact.
  duplicateSimilarity: 0.6,
  candidateTtlDays: 30,
  consolidationIntervalDays: 7,
} as const;

// How long an entry may go unused before consolidation archives it.
export const DURABILITY_UNUSED_TTL_DAYS: Record<MemoryDurability, number | null> = {
  permanent: null,
  months: 180,
  weeks: 42,
};
