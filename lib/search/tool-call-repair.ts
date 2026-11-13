import {
  generateText,
  NoSuchToolError,
  Output,
  type ModelMessage,
  type ToolCallRepairFunction,
  type ToolSet,
} from 'ai';
import { asSchema, safeParseJSON, safeValidateTypes } from '@ai-sdk/provider-utils';
import type { JSONSchema7 } from '@ai-sdk/provider';

import { resolveTertiaryModel } from '@/ai/tertiary';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('search');

// Enough of the user's message for the repair model to keep the call on topic.
const MAX_USER_TEXT_LENGTH = 2000;

// Small models often pass one value where the schema wants a list ("queries":
// "x" instead of ["x"]). Wrapping it keeps exactly what the model meant, where a
// repair model would rewrite the call. Returns null when nothing needed wrapping.
export function wrapValuesInArrays(input: unknown, schema: JSONSchema7): Record<string, unknown> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  let changed = false;
  const wrapped: Record<string, unknown> = { ...input };
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const value = wrapped[key];
    if (typeof property === 'object' && property.type === 'array' && value !== undefined && !Array.isArray(value)) {
      wrapped[key] = [value];
      changed = true;
    }
  }
  return changed ? wrapped : null;
}

// The text of the last user message, which the repair model needs to fix a call
// without inventing one about something else.
export function lastUserText(messages: ModelMessage[]): string {
  const message = messages.findLast((entry) => entry.role === 'user');
  if (!message) return '';
  const text =
    typeof message.content === 'string'
      ? message.content
      : message.content
          .flatMap((part) => (part.type === 'text' ? [part.text] : []))
          .join('\n')
          .trim();
  return text.slice(0, MAX_USER_TEXT_LENGTH);
}

// Fixes a tool call whose arguments do not match the tool's schema: wraps single
// values the schema wants as lists, else asks the user's tool-repair model. A
// call to an unknown tool, or a repair that fails, is dropped rather than
// aborting the answer.
export function createToolCallRepair(
  preferences: UserPreferenceValues,
  userId: string | undefined,
): ToolCallRepairFunction<ToolSet> {
  return async ({ toolCall, tools, inputSchema, error, messages }) => {
    if (NoSuchToolError.isInstance(error)) return null;
    log.debug('Repairing tool call', { toolCall, tools, inputSchema, error });

    const tool = tools[toolCall.toolName as keyof typeof tools];
    if (!tool) return null;

    const jsonSchema = await inputSchema({ toolName: toolCall.toolName });
    const parsed = await safeParseJSON({ text: toolCall.input });
    const wrapped = parsed.success ? wrapValuesInArrays(parsed.value, jsonSchema) : null;
    if (wrapped && (await safeValidateTypes({ value: wrapped, schema: asSchema(tool.inputSchema) })).success) {
      return { ...toolCall, input: JSON.stringify(wrapped) };
    }

    const userText = lastUserText(messages);
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
          JSON.stringify(jsonSchema),
          ...(userText ? ['The call answers this message from the user:', userText] : []),
          'Please fix the arguments. Keep what the model meant to do: do not change the subject of the call.',
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
