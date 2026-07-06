import { supermemoryTools } from '@supermemory/tools/ai-sdk';
import { Tool } from 'ai';
import { serverEnv } from '@/env/server';
import { anonymizeToolInput, type AnonymizeContext } from '@/lib/anonymizer/pseudonymize';

// SuperMemory is a hosted third-party SaaS — unlike Graphiti (self-hosted),
// it must never receive cleartext when the anonymization layer is active.
// searchMemories is left untouched: its query doesn't get written anywhere,
// and results coming back should stay in token space toward the model.
export function createMemoryTools(userId: string, anonymizeContext?: AnonymizeContext | null) {
  const tools = supermemoryTools(serverEnv.SUPERMEMORY_API_KEY, {
    containerTags: [userId],
  });

  if (!anonymizeContext) return tools;

  const originalExecute = tools.addMemory.execute!.bind(tools.addMemory);
  return {
    ...tools,
    addMemory: {
      ...tools.addMemory,
      execute: async (input: { memory: string }, options: unknown) => {
        const masked = (await anonymizeToolInput(input, anonymizeContext)) as { memory: string };
        return originalExecute(masked, options as never);
      },
    },
  };
}

export type SearchMemoryTool = Tool<
  {
    informationToGet: string;
  },
  | {
      success: boolean;
      results: any[];
      count: number;
      error?: undefined;
    }
  | {
      success: boolean;
      error: string;
      results?: undefined;
      count?: undefined;
    }
>;

export type AddMemoryTool = Tool<
  {
    memory: string;
  },
  | {
      success: boolean;
      memory: any;
      error?: undefined;
    }
  | {
      success: boolean;
      error: string;
      memory?: undefined;
    }
>;
