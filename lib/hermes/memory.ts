import { z } from 'zod';
import { MEMORY_CATEGORIES, MEMORY_DURABILITIES, MEMORY_TIERS } from '@/lib/memory/constants';
import { memoryOpsSchema, type MemoryOp } from '@/lib/memory/ops';

// Chat id and session id of the Hermes turn. The chat id is set only for a Hermes
// conversation held in Zetora; it is checked against the gateway's own conversations.
const originFields = {
  chatId: z.string().min(1).nullable(),
  sessionId: z.string().min(1).nullable(),
};

// The requests hermes-plugin/zetora's memory provider sends, one action each.
export const hermesMemoryRequestSchema = z.discriminatedUnion('action', [
  // The stable block for Hermes's system prompt.
  z.object({ action: z.literal('context') }),
  // The facts matching the message about to be answered.
  z.object({ action: z.literal('recall'), query: z.string() }),
  // A finished turn to learn from.
  z.object({ action: z.literal('turn'), ...originFields, user: z.string(), assistant: z.string() }),
  // What Hermes's own model answered to the prompt a `turn` returned.
  z.object({ action: z.literal('ops'), ...originFields, output: z.string() }),
  // An explicit "remember that…" (the add_memory tool).
  z.object({
    action: z.literal('remember'),
    ...originFields,
    memory: z.string(),
    category: z.enum(MEMORY_CATEGORIES),
    durability: z.enum(MEMORY_DURABILITIES),
    tier: z.enum(MEMORY_TIERS),
    keywords: z.array(z.string()),
  }),
  // A lookup in past facts (the search_memories tool).
  z.object({ action: z.literal('search'), query: z.string() }),
]);
export type HermesMemoryRequest = z.infer<typeof hermesMemoryRequestSchema>;

// Hermes's model gets no structured-output enforcement through the plugin, so the
// prompt carries the exact schema its reply must follow.
export function buildAgentMemoryPrompt(turnPrompt: string): string {
  return `${turnPrompt}

Reply with only a JSON object matching this JSON Schema, no other text:
${JSON.stringify(z.toJSONSchema(memoryOpsSchema))}`;
}

/** The operations in a model reply, tolerating a code fence or text around the JSON; null if there are none. */
export function parseMemoryOpsOutput(output: string): MemoryOp[] | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  let json: unknown;
  try {
    json = JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = memoryOpsSchema.safeParse(json);
  return parsed.success ? parsed.data.ops : null;
}
