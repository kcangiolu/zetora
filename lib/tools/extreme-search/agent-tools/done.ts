import { tool } from 'ai';
import { z } from 'zod';

import type { AgentToolContext } from './context';

export function createDoneTool({ emit }: AgentToolContext) {
  return tool({
    description:
      'REQUIRED to conclude research. You MUST call this tool when research is complete — it is the only valid way to finish. Stopping without calling done breaks the UI. Call with a brief summary of what was researched and found.',
    inputSchema: z.object({
      summary: z.string().describe('A brief summary (1-2 sentences) of what was researched and key findings'),
    }),
    execute: async ({ summary }) => {
      emit({ kind: 'done', summary });
      return { done: true, summary };
    },
  });
}
