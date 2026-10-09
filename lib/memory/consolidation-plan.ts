import { z } from 'zod';
import { MEMORY_LIMITS, MEMORY_TIERS, type MemoryCategory, type MemoryTier } from './constants';
import { cleanEntryText, cleanKeywords } from './ops';

export const consolidationSchema = z.object({
  entries: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        tier: z.enum(MEMORY_TIERS),
        keywords: z.array(z.string()),
      }),
    )
    .describe('Every editable entry to keep, possibly rewritten — leave out the ones merged into another'),
  bio: z.string().describe('The "learned from past conversations" profile, rewritten'),
});
export type ConsolidationResult = z.infer<typeof consolidationSchema>;

export interface ConsolidatableEntry {
  id: string;
  text: string;
  category: MemoryCategory;
  tier: MemoryTier;
  keywords: string[];
  userLocked: boolean;
}

export function buildConsolidationPrompt({
  entries,
  bioUserText,
  bioAutoText,
  autoTextEditedByUser,
}: {
  entries: ConsolidatableEntry[];
  bioUserText: string;
  bioAutoText: string;
  autoTextEditedByUser: boolean;
}): string {
  const editable = entries.filter((e) => !e.userLocked);
  const locked = entries.filter((e) => e.userLocked);
  const format = (e: ConsolidatableEntry) =>
    JSON.stringify({ id: e.id, text: e.text, category: e.category, tier: e.tier, keywords: e.keywords });

  return `You maintain the long-term memory of an AI assistant about its user. Tidy it up.

Editable entries:
${editable.map(format).join('\n') || '(none)'}

Entries written by the user (read-only, never return them):
${locked.map(format).join('\n') || '(none)'}

Profile written by the user (read-only):
${bioUserText.trim() || '(empty)'}

Current "learned" profile${autoTextEditedByUser ? ' (the user edited it: keep their wording and only change what the entries contradict or add)' : ''}:
${bioAutoText.trim() || '(empty)'}

Tasks:
1. Merge editable entries that state the same fact: return a single entry (keep one of their ids, rewrite its text if needed) and leave the others out. Also leave out editable entries that only repeat a read-only entry.
2. Rewrite vague or overlong entries so each is short (under ${MEMORY_LIMITS.entryMaxChars} characters), self-contained and in the user's language. Never invent facts.
3. Set "tier" to "always" only for core facts relevant to almost every conversation (at most ${MEMORY_LIMITS.alwaysEntriesMax} in total, read-only ones included), otherwise "contextual".
4. Give each entry 3 to 8 keywords or synonyms someone would use when talking about its topic.
5. Rewrite "bio": a few sentences (under ${MEMORY_LIMITS.bioAutoMaxChars} characters) summarizing who the user is, what they work on and how they like to be answered, based on all entries. Do not repeat the profile written by the user.

Return every editable entry you keep, unchanged ones included.`;
}

export interface ConsolidationPlan {
  updates: { id: string; text: string; tier: MemoryTier; keywords: string[] }[];
  deleteIds: string[];
  bio: string | null;
}

/**
 * Validates a consolidation result against the entries it was computed from.
 * Unknown or read-only ids are ignored, and an editable entry missing from the
 * result counts as merged away. A result that would drop most of the memory is
 * almost certainly a truncated or failed generation, so in that case nothing
 * is deleted.
 */
export function planConsolidation(result: ConsolidationResult, entries: ConsolidatableEntry[]): ConsolidationPlan {
  const editable = new Map(entries.filter((e) => !e.userLocked).map((e) => [e.id, e]));
  const kept = new Set<string>();
  const updates: ConsolidationPlan['updates'] = [];

  for (const item of result.entries) {
    const original = editable.get(item.id);
    if (!original || kept.has(item.id)) continue;
    kept.add(item.id);
    const text = cleanEntryText(item.text) ?? original.text;
    const keywords = cleanKeywords(item.keywords);
    updates.push({ id: item.id, text, tier: item.tier, keywords: keywords.length > 0 ? keywords : original.keywords });
  }

  const dropped = [...editable.keys()].filter((id) => !kept.has(id));
  const tooDestructive = editable.size >= 4 && dropped.length > editable.size / 2;

  const bio = result.bio.replace(/[ \t]+/g, ' ').trim();
  return {
    updates,
    deleteIds: tooDestructive ? [] : dropped,
    bio: bio && bio.length <= MEMORY_LIMITS.bioAutoMaxChars ? bio : null,
  };
}
