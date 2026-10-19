import { generateText, NoSuchToolError, Output, type ToolCallRepairFunction, type ToolSet } from 'ai';

import { resolveTertiaryModel } from '@/ai/tertiary';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('search');

// Fixes a tool call whose arguments do not match the tool's schema with the user's
// tool-repair model. A call to an unknown tool, or a repair that fails, is dropped
// rather than aborting the answer.
export function createToolCallRepair(
  preferences: UserPreferenceValues,
  userId: string | undefined,
): ToolCallRepairFunction<ToolSet> {
  return async ({ toolCall, tools, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) return null;
    log.debug('Repairing tool call', { toolCall, tools, inputSchema, error });

    const tool = tools[toolCall.toolName as keyof typeof tools];
    if (!tool) return null;

    // The repair model can be a custom provider without structured output, where
    // Output.object throws.
    try {
      const { output: repairedArgs } = await generateText({
        model: await resolveTertiaryModel('tool-repair', preferences, userId),
        output: Output.object({ schema: tool.inputSchema }),
        // Groq's strict JSON Schema mode requires every property in `required`, which
        // optional zod fields are not: it would reject the schema outright. No-op
        // elsewhere.
        providerOptions: { groq: { strictJsonSchema: false } },
        prompt: [
          `The model tried to call the tool "${toolCall.toolName}"` + ` with the following arguments:`,
          JSON.stringify(toolCall.input),
          `The tool accepts the following schema:`,
          JSON.stringify(await inputSchema({ toolName: toolCall.toolName })),
          'Please fix the arguments.',
          'For the code interpreter tool do not use print statements.',
          `For the web search make multiple queries to get the best results but avoid using the same query multiple times.`,
          `Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        ].join('\n'),
      });
      log.debug('repairedArgs', repairedArgs);
      return { ...toolCall, input: JSON.stringify(repairedArgs) };
    } catch (repairError) {
      log.error('Failed to repair tool call:', repairError);
      return null;
    }
  };
}
