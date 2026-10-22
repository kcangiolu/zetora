import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { deanonymizeText } from '@/lib/anonymizer/pseudonymize';
import { listMemoryEntries, rememberMemoryEntry } from '@/lib/db/queries/memory';
import { MEMORY_CATEGORIES, MEMORY_DURABILITIES, MEMORY_TIERS } from './constants';
import { cleanEntryText, cleanKeywords } from './ops';
import { selectRelevantEntries } from './text-match';

const SEARCH_RESULTS_MAX = 10;

// Learning happens automatically after every answer (lib/memory/jobs.ts);
// these tools only cover explicit requests ("remember that…", "what do you
// know about my…").
export function createMemoryTools(userId: string, chatId: string | null) {
  const addMemory = tool({
    description:
      'Save a fact about the user to long-term memory. Use it ONLY when the user explicitly asks you to remember something ("remember that…", "don\'t forget…") — everything else is learned automatically.',
    inputSchema: z.object({
      memory: z.string().describe("The fact, short (under 200 characters), self-contained, in the user's language"),
      category: z.enum(MEMORY_CATEGORIES),
      durability: z.enum(MEMORY_DURABILITIES),
      tier: z
        .enum(MEMORY_TIERS)
        .describe('"always" for core facts relevant to almost every conversation, otherwise "contextual"'),
      keywords: z.array(z.string()).describe('3 to 8 words or synonyms someone would use to talk about this'),
    }),
    execute: async ({ memory, category, durability, tier, keywords }) => {
      // With anonymization on, the model only knows pseudonym tokens, so its
      // tool input is tokenized. Memory is stored locally and must hold the
      // real values (it gets re-tokenized whenever it is sent to a model).
      const text = cleanEntryText(await deanonymizeText(memory, { userId }));
      if (!text) return { success: false, error: 'The memory must be between 1 and 200 characters.' };
      const entry = await rememberMemoryEntry(
        userId,
        {
          text,
          category,
          durability,
          tier,
          keywords: cleanKeywords(await Promise.all(keywords.map((k) => deanonymizeText(k, { userId })))),
        },
        { chatId, sessionId: null },
      );
      return { success: true, memory: { id: entry.id, memory: entry.text } };
    },
  });

  const searchMemories = tool({
    description:
      'Search long-term memory about the user. Use it only when the user refers to something from past conversations that is not already in your context.',
    inputSchema: z.object({
      informationToGet: z.string().describe('What to look for, as keywords'),
    }),
    execute: async ({ informationToGet }) => {
      const entries = (await listMemoryEntries(userId)).filter((e) => e.status === 'confirmed' && !e.sensitive);
      const results = selectRelevantEntries(entries, informationToGet, SEARCH_RESULTS_MAX).map((e) => ({
        id: e.id,
        memory: e.text,
      }));
      return { success: true, results, count: results.length };
    },
  });

  return { addMemory, searchMemories };
}
