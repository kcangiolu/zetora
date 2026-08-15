import { tool } from 'ai';
import { z } from 'zod';
import { graphitiClient } from '@/lib/graphiti/client';
import { withMemoryWriteLock, isDuplicateOfRecentWrite, recordRecentWrite } from '@/lib/graphiti/write-coordinator';

// graphiti-core doesn't return a similarity score from client.search(), so
// results can't be filtered by threshold — keep the count small instead and
// frame them explicitly as past, possibly-unrelated context. This is what
// stops an old topic (e.g. a Tesla search) from steering an unrelated
// conversation just because it once existed in the same user's memory graph.
const MEMORY_SEARCH_RESULTS = 5;
const MEMORY_RESULTS_FRAMING =
  'These are stored memories from PAST conversations. They may be unrelated to the current question — ' +
  'ignore any memory that is not directly relevant, and NEVER let them change the topic of your answer.';

export function createGraphitiMemoryTools(userId: string) {
  const client = graphitiClient;

  const addMemoryTool = tool({
    description:
      'Save important information to long-term memory. Use this to remember facts, preferences, decisions, events, and relationships about the user that should persist across sessions.',
    inputSchema: z.object({
      memory: z.string().describe('The information to save to memory'),
    }),
    execute: async ({ memory }: { memory: string }) => {
      try {
        // Locked so this never races the background curator (or another
        // add_memory call) for the same user against the single-slot local
        // LLM extraction pipeline — see write-coordinator.ts.
        return await withMemoryWriteLock(userId, async () => {
          if (await isDuplicateOfRecentWrite(userId, memory)) {
            return { success: true, skipped: true, note: 'Skipped — near-duplicate of a memory saved moments ago.' };
          }
          const result = await client.addEpisode({
            name: `zetora-memory-${Date.now()}`,
            episodeBody: memory,
            groupId: userId,
          });
          await recordRecentWrite(userId, memory);
          return { success: true, result };
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save memory',
        };
      }
    },
  });

  const searchMemoryTool = tool({
    description:
      'Search long-term memory for information about the user. Only use this when the user refers to past context, personal facts, preferences, or explicitly asks to recall something — not for general questions unrelated to prior conversations.',
    inputSchema: z.object({
      informationToGet: z.string().describe('The information to search for in memory'),
    }),
    execute: async ({ informationToGet }: { informationToGet: string }) => {
      try {
        const result = await client.search(informationToGet, userId, MEMORY_SEARCH_RESULTS);
        return {
          success: true,
          note: MEMORY_RESULTS_FRAMING,
          results: result.results,
          count: result.results?.length ?? 0,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to search memory',
        };
      }
    },
  });

  return { addMemoryTool, searchMemoryTool };
}
