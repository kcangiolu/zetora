import { tool } from 'ai';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { EXA_SEARCH_TIMEOUT_MS, withAbort } from '@/lib/timeouts';

const codeContextOutputSchema = z.object({
  response: z.string().min(1),
  resultsCount: z.number().min(0),
  searchTime: z.number().min(0),
  outputTokens: z.number().min(0),
});

export const codeContextTool = tool({
  description: 'Get the context about coding, programming, and development libraries, frameworks, and tools',
  inputSchema: z.object({
    query: z.string().min(1).max(100).describe('The query to search for'),
  }),
  outputSchema: codeContextOutputSchema,
  execute: async ({ query }, { abortSignal }) => {
    const response = await fetch('https://api.exa.ai/context', {
      signal: withAbort(abortSignal, EXA_SEARCH_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'x-api-key': serverEnv.EXA_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        tokensNum: 'dynamic',
      }),
    });
    if (!response.ok) {
      throw new Error(`Exa context returned ${response.status}: ${await response.text()}`);
    }
    return codeContextOutputSchema.parse(await response.json());
  },
});
