import { tool } from 'ai';
import { z } from 'zod';
import { graphitiClient, createGraphitiClient } from '@/lib/graphiti/client';

export function createGraphitiMemoryTools(userId: string, customApiUrl?: string) {
  const client = customApiUrl ? createGraphitiClient(customApiUrl) : graphitiClient;

  const addMemoryTool = tool({
    description:
      'Save important information to long-term memory. Use this to remember facts, preferences, decisions, events, and relationships about the user that should persist across sessions.',
    inputSchema: z.object({
      memory: z.string().describe('The information to save to memory'),
    }),
    execute: async ({ memory }: { memory: string }) => {
      try {
        const result = await client.addEpisode({
          name: `zetora-memory-${Date.now()}`,
          episodeBody: memory,
          groupId: userId,
        });
        return { success: true, result };
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
      'Search long-term memory for information about the user. Use this to recall preferences, past decisions, relationships, or any previously stored information.',
    inputSchema: z.object({
      informationToGet: z.string().describe('The information to search for in memory'),
    }),
    execute: async ({ informationToGet }: { informationToGet: string }) => {
      try {
        const result = await client.search(informationToGet, userId, 10);
        return {
          success: true,
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

export type { AddMemoryTool, SearchMemoryTool } from './supermemory';
