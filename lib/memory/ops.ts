import { z } from 'zod';
import {
  MEMORY_CATEGORIES,
  MEMORY_DURABILITIES,
  MEMORY_LIMITS,
  MEMORY_TIERS,
  type MemoryCategory,
  type MemoryDurability,
  type MemoryStatus,
  type MemoryTier,
} from './constants';
import { trigramSimilarity } from './text-match';

// Flat object with nullable fields rather than a discriminated union: anyOf /
// oneOf and optional properties are where structured output breaks across
// providers (strict JSON Schema modes, llama.cpp grammars), while a single
// object shape with nullable fields is accepted everywhere.
export const memoryOpsSchema = z.object({
  ops: z.array(
    z.object({
      op: z.enum(['add', 'update', 'confirm', 'archive']),
      id: z.string().nullable().describe('Existing entry id — required for update, confirm and archive'),
      text: z.string().nullable().describe('The fact, under 200 characters — required for add'),
      category: z.enum(MEMORY_CATEGORIES).nullable(),
      durability: z.enum(MEMORY_DURABILITIES).nullable(),
      tier: z.enum(MEMORY_TIERS).nullable(),
      keywords: z.array(z.string()).nullable().describe('Words and synonyms someone would use to talk about this'),
    }),
  ),
});
export type MemoryOp = z.infer<typeof memoryOpsSchema>['ops'][number];

export interface PlannableEntry {
  id: string;
  text: string;
  status: MemoryStatus;
  userLocked: boolean;
  sourceChatId: string | null;
  sourceSessionId: string | null;
}

// Where a turn happened: a Zetora chat, a Hermes session, or both for a Hermes
// conversation held in Zetora.
export interface MemoryOrigin {
  chatId: string | null;
  sessionId: string | null;
}

export interface NewEntryValues {
  text: string;
  category: MemoryCategory;
  durability: MemoryDurability;
  tier: MemoryTier;
  keywords: string[];
}

export type MemoryMutation =
  | { kind: 'insert'; values: NewEntryValues }
  | { kind: 'update'; id: string; values: Partial<Pick<NewEntryValues, 'text' | 'keywords' | 'tier'>> }
  | { kind: 'confirm'; id: string }
  | { kind: 'archive'; id: string };

export function cleanEntryText(text: string | null | undefined): string | null {
  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  // Over-long facts are rejected rather than truncated: a cut-off fact is
  // worse than none.
  return cleaned && cleaned.length <= MEMORY_LIMITS.entryMaxChars ? cleaned : null;
}

export function cleanKeywords(keywords: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords ?? []) {
    const keyword = raw.replace(/\s+/g, ' ').trim();
    const key = keyword.toLowerCase();
    if (!keyword || keyword.length > MEMORY_LIMITS.keywordMaxChars || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length >= MEMORY_LIMITS.keywordsMax) break;
  }
  return result;
}

export function findDuplicate<T extends Pick<PlannableEntry, 'text' | 'status'>>(
  entries: T[],
  text: string,
): T | undefined {
  let best: { entry: T; similarity: number } | undefined;
  for (const entry of entries) {
    if (entry.status === 'archived') continue;
    const similarity = trigramSimilarity(entry.text, text);
    if (similarity >= MEMORY_LIMITS.duplicateSimilarity && (!best || similarity > best.similarity)) {
      best = { entry, similarity };
    }
  }
  return best?.entry;
}

// A candidate only becomes confirmed when it comes up in a different
// conversation than the one it was learned in — repetition across
// conversations is the signal that a fact is durable rather than a one-off.
// An origin that is no longer known (a deleted chat) counts as different.
function canConfirmFrom(entry: PlannableEntry, origin: MemoryOrigin): boolean {
  const sameChat = entry.sourceChatId !== null && entry.sourceChatId === origin.chatId;
  const sameSession = entry.sourceSessionId !== null && entry.sourceSessionId === origin.sessionId;
  return entry.status === 'candidate' && !sameChat && !sameSession;
}

/**
 * Turns the model's proposed operations into the mutations actually applied.
 * Everything the model can get wrong is enforced here: per-turn cap, length
 * limits, unknown ids, user-locked entries, and duplicates (a re-proposed
 * existing fact confirms the candidate instead of creating a second copy).
 */
export function planMemoryMutations(
  ops: MemoryOp[],
  entries: PlannableEntry[],
  origin: MemoryOrigin,
): MemoryMutation[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const touched = new Set<string>();
  const inserted: PlannableEntry[] = [];
  const mutations: MemoryMutation[] = [];

  const claim = (id: string) => {
    if (touched.has(id)) return false;
    touched.add(id);
    return true;
  };

  for (const op of ops.slice(0, MEMORY_LIMITS.opsPerTurnMax)) {
    if (op.op === 'add') {
      const text = cleanEntryText(op.text);
      if (!text || !op.category || !op.durability) continue;

      if (findDuplicate(inserted, text)) continue;
      const duplicate = findDuplicate(entries, text);
      if (duplicate) {
        if (canConfirmFrom(duplicate, origin) && claim(duplicate.id)) {
          mutations.push({ kind: 'confirm', id: duplicate.id });
        }
        continue;
      }

      const values: NewEntryValues = {
        text,
        category: op.category,
        durability: op.durability,
        tier: op.tier ?? 'contextual',
        keywords: cleanKeywords(op.keywords),
      };
      inserted.push({
        id: `new-${inserted.length}`,
        text,
        status: 'candidate',
        userLocked: false,
        sourceChatId: origin.chatId,
        sourceSessionId: origin.sessionId,
      });
      mutations.push({ kind: 'insert', values });
      continue;
    }

    const entry = op.id ? byId.get(op.id) : undefined;
    if (!entry || entry.status === 'archived' || entry.userLocked) continue;

    if (op.op === 'update') {
      const values: Partial<Pick<NewEntryValues, 'text' | 'keywords' | 'tier'>> = {};
      if (op.text !== null) {
        const text = cleanEntryText(op.text);
        if (!text) continue;
        if (text !== entry.text) values.text = text;
      }
      if (op.keywords !== null) values.keywords = cleanKeywords(op.keywords);
      if (op.tier !== null) values.tier = op.tier;
      if (Object.keys(values).length > 0 && claim(entry.id)) mutations.push({ kind: 'update', id: entry.id, values });
    } else if (op.op === 'confirm') {
      if (canConfirmFrom(entry, origin) && claim(entry.id)) mutations.push({ kind: 'confirm', id: entry.id });
    } else if (op.op === 'archive') {
      if (claim(entry.id)) mutations.push({ kind: 'archive', id: entry.id });
    }
  }

  return mutations;
}
