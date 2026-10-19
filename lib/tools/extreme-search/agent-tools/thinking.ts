import { tool } from 'ai';
import { z } from 'zod';

import type { AgentToolContext } from './context';

export function createThinkingTool({ emit }: AgentToolContext) {
  return tool({
    description:
      'Record a brief thought before or after an action. ONLY describe what you are about to do next in plain human language, or briefly summarize what the last action returned. NO markdown, NO bullet points, NO headers, NO bold/italic. Plain sentences only, 1-3 sentences max. NEVER mention any tool names.',
    inputSchema: z.object({
      thought: z
        .string()
        .describe(
          '1-3 plain sentences only. Either: what you are about to do and why, OR a brief summary of what the last action returned. NO markdown formatting whatsoever — no **, no #, no -, no lists. NEVER name any tools (webSearch, browsePage, xSearch, fileQuery, codeRunner, thinking, done) — use plain human language only.',
        ),
      nextStep: z
        .string()
        .optional()
        .describe(
          'A SHORT human-readable action phrase (under 60 chars). NEVER include tool names. Good: "Searching for world models", "Reading the release notes", "Checking recent posts about AI". Bad: "Calling webSearch", "Running browsePage", "Using xSearch".',
        ),
    }),
    execute: async ({ thought, nextStep }, { toolCallId }) => {
      emit({ kind: 'thinking', thinkingId: toolCallId, thought, nextStep });
      return { thought, nextStep };
    },
  });
}
