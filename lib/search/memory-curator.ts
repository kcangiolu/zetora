import 'server-only';

import { generateText, stepCountIs, type Tool } from 'ai';
import { resolveTertiaryModel, getTertiaryModelConfig } from '@/ai/tertiary';
import { getAnonymizeContext } from '@/ai/providers';
import { createGraphitiMemoryTools } from '@/lib/tools/graphiti-memory';
import { createMemoryTools } from '@/lib/tools/supermemory';
import type { ChatMessage } from '@/lib/types';

import { createLogger } from '@/lib/logger';

const log = createLogger('memory-curator');

// In-memory dedup so a resumed/replayed stream doesn't re-run the curator on
// the same turn within this server process (same pattern as the graphiti
// ingestion it replaces).
const curatedMessageIds = new Set<string>();

const MAX_TURN_CHARS = 8000;

function extractText(parts: unknown[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => {
      const part = p as { type?: unknown; text?: unknown };
      return part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0;
    })
    .map((p) => p.text.trim())
    .join(' ');
}

function stripLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

const CURATOR_PROMPT = `You are Zetora's background memory curator. You are invisible to the user — you never produce a user-facing reply, your only job is deciding whether anything from this finished conversation turn deserves to be saved to long-term memory.

DEFAULT: store nothing. Most turns contain nothing worth remembering.

Store only (rare):
- Stable personal facts about the user (job, location, family, ongoing projects)
- Strong, durable preferences
- Important decisions or events the user shared
- An explicit request to remember something ("remember that...", "don't forget...")

Never store:
- General knowledge, search results, or the content of your own answers
- One-off, transient tasks or questions with no lasting relevance

Process:
1. If nothing in the turn is memorable, call no tools at all and stop.
2. If there is a candidate fact, call search_memories FIRST to check whether an equivalent memory already exists. If a duplicate or equivalent memory is found, stop — do not add anything.
3. Otherwise call add_memory exactly once, with a short (under 25 words), self-contained, third-person summary starting with "User ...". Never call add_memory more than once.`;

/**
 * Fire-and-forget background curator: reads a finished chat turn and decides
 * whether to store a short, self-contained summary to the user's memory
 * store. Replaces the old raw Graphiti ingestion — never blocks the response,
 * never throws, defaults to storing nothing.
 */
export function runMemoryCurator({
  messages,
  userQueryText,
  userId,
  preferences,
}: {
  messages: ChatMessage[];
  userQueryText: string;
  userId: string;
  preferences: Record<string, unknown> | null | undefined;
}): void {
  if (preferences?.['zetora-memory-curator-enabled'] === false) return;

  const newMessageIds = messages.map((m) => m.id);
  if (newMessageIds.length > 0 && newMessageIds.every((mid) => curatedMessageIds.has(mid))) {
    return;
  }
  newMessageIds.forEach((mid) => curatedMessageIds.add(mid));
  if (curatedMessageIds.size > 10000) {
    const entries = [...curatedMessageIds];
    curatedMessageIds.clear();
    entries.slice(-5000).forEach((mid) => curatedMessageIds.add(mid));
  }

  const turnLines = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const text = Array.isArray(m.parts) ? extractText(m.parts) : '';
      return text ? `${m.role}: ${stripLinks(text)}` : null;
    })
    .filter((line): line is string => Boolean(line));

  const hasUserLine = messages.some((m) => m.role === 'user');
  if (!hasUserLine && userQueryText.trim()) {
    turnLines.unshift(`user: ${stripLinks(userQueryText)}`);
  }

  const turnText = turnLines.join('\n').slice(0, MAX_TURN_CHARS).trim();
  if (!turnText) return;

  const prefs = preferences as Record<string, string> | null;

  (async () => {
    const memoryProvider =
      (preferences?.['zetora-memory-provider'] as 'supermemory' | 'graphiti' | undefined) || 'supermemory';

    let tools: Record<string, Tool>;
    if (memoryProvider === 'graphiti') {
      const { searchMemoryTool, addMemoryTool } = createGraphitiMemoryTools(userId);
      tools = { search_memories: searchMemoryTool, add_memory: addMemoryTool };
    } else {
      const { model: curatorModelId } = getTertiaryModelConfig('memory-curator', prefs);
      const anonymizeContext = await getAnonymizeContext(curatorModelId, preferences, userId);
      const memoryTools = createMemoryTools(userId, anonymizeContext);
      // @supermemory/tools is still on ai@5 internally (no ai@6-compatible
      // release exists yet), so its tool objects carry a structurally
      // identical but nominally distinct Tool<> from a duplicate ai-sdk
      // instance — real AI SDK tools at runtime, just not the same type.
      tools = {
        search_memories: memoryTools.searchMemories,
        add_memory: memoryTools.addMemory,
      } as unknown as Record<string, Tool>;
    }

    const model = await resolveTertiaryModel('memory-curator', prefs, userId);

    await generateText({
      model,
      system: CURATOR_PROMPT,
      prompt: turnText,
      tools,
      stopWhen: stepCountIs(3),
    });
  })().catch((err) => log.error('Curator run failed:', err instanceof Error ? err.message : err));
}
