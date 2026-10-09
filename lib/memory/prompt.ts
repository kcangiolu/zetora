import { MEMORY_LIMITS, type MemoryCategory, type MemoryStatus, type MemoryTier } from './constants';

export interface InjectableEntry {
  id: string;
  text: string;
  category: MemoryCategory;
}

export interface BioTexts {
  userText: string;
  autoText: string;
}

// Keeps the most important entries within the character budget: callers pass
// them already ordered by priority.
export function capEntries<T extends { text: string }>(entries: T[], maxCount: number, maxChars: number): T[] {
  const kept: T[] = [];
  let chars = 0;
  for (const entry of entries) {
    if (kept.length >= maxCount || chars + entry.text.length > maxChars) break;
    kept.push(entry);
    chars += entry.text.length;
  }
  return kept;
}

/**
 * The stable part of memory, appended to the system prompt. Must not change
 * from one message to the next unless memory itself changed, so the prompt
 * prefix stays cacheable.
 */
export function buildMemorySystemBlock(bio: BioTexts | null, alwaysEntries: InjectableEntry[]): string {
  const userText = bio?.userText.trim() ?? '';
  const autoText = bio?.autoText.trim() ?? '';
  if (!userText && !autoText && alwaysEntries.length === 0) return '';

  const sections = [
    '\n\n## About the user (long-term memory)',
    'What you know about the user from previous conversations. Use it silently to tailor your answers; ' +
      'do not recite it or mention that you have a memory unless asked. If the user says something that ' +
      'contradicts it, what the user says now wins.',
  ];
  if (userText) sections.push(`\nWritten by the user:\n${userText}`);
  if (autoText) sections.push(`\nLearned from past conversations:\n${autoText}`);
  if (alwaysEntries.length > 0) sections.push(`\nKnown facts:\n${alwaysEntries.map((e) => `- ${e.text}`).join('\n')}`);
  return sections.join('\n');
}

/**
 * Facts selected for this message only, appended to the last user message
 * (after the cacheable prefix).
 */
export function buildContextualMemoryBlock(entries: InjectableEntry[]): string {
  if (entries.length === 0) return '';
  return (
    '\n\n<user_memory>\nPossibly relevant facts about the user, from past conversations. ' +
    'Use them only if they actually help with this message; never let them change its topic.\n' +
    entries.map((e) => `- ${e.text}`).join('\n') +
    '\n</user_memory>'
  );
}

export interface ReviewableEntry {
  id: string;
  text: string;
  tier: MemoryTier;
  status: MemoryStatus;
}

// The instruction sent after a finished turn, asking the model to update the
// memory from it. Appended at the very end of the conversation so everything
// before it is the exact prefix of the request that produced the answer.
export function buildTurnUpdateInstruction(entries: ReviewableEntry[]): string {
  const listed =
    entries.length > 0 ? entries.map((e) => `- [${e.id}] (${e.status}, ${e.tier}) ${e.text}`).join('\n') : '(none yet)';

  return `[Memory update — internal step, the user never sees this reply]
The conversation above is finished for now. Decide whether its LAST exchange taught you something about the user worth remembering in future conversations.

Return {"ops": []} unless a fact passes BOTH tests:
1. Durable: will it still be true and useful in a month?
2. Useful: would knowing it change a future answer?

Never remember:
- what the user is doing right now ("went to get bread", "is in a meeting"), moods, one-off tasks or questions;
- the content of the question itself or of your answer, search results, general knowledge about the world;
- anything already listed below.

Operations (${MEMORY_LIMITS.opsPerTurnMax} at most, usually zero):
- "add": a new fact. "text" is short (under ${MEMORY_LIMITS.entryMaxChars} characters), self-contained, written in the user's language, e.g. "Works as a nurse in Lyon". Pick a "category" and a "durability". "tier" is "always" only for core facts relevant to almost every conversation (job, main projects, strong preferences on how to answer), otherwise "contextual". "keywords": 3 to 8 words or synonyms someone would use when talking about this topic.
- "update": an existing fact (by "id") changed or got more precise — give the new "text".
- "confirm": the conversation confirms an existing "candidate" fact (by "id").
- "archive": an existing fact (by "id") is no longer true (project finished, preference changed).
Set fields that do not apply to the operation to null.

What you currently remember:
${listed}`;
}

interface TextBearingMessage {
  role: string;
  parts?: unknown;
}

function messageText(message: TextBearingMessage): string {
  if (!Array.isArray(message.parts)) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p?.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join(' ')
    .trim();
}

/**
 * What contextual memory is matched against: the latest user message plus the
 * previous one, so a short follow-up ("and for the second one?") keeps the
 * topic of the message it follows.
 */
export function buildMemoryQueryText(messages: TextBearingMessage[], userMessageCount = 2): string {
  return messages
    .filter((m) => m.role === 'user')
    .slice(-userMessageCount)
    .map(messageText)
    .filter(Boolean)
    .join('\n');
}

const TURN_TEXT_MAX_CHARS = 8000;

// The finished exchange as plain text, for picking which entries to review
// and for the dedicated-model path (which gets no conversation context).
// The answer is cut first: the user's own words are what memory is about.
export function formatTurnForMemory(userText: string, assistantText: string): string {
  const user = userText.trim().slice(0, TURN_TEXT_MAX_CHARS / 2);
  const assistant = assistantText.trim().slice(0, TURN_TEXT_MAX_CHARS - user.length);
  return user ? `user: ${user}${assistant ? `\nassistant: ${assistant}` : ''}` : '';
}
