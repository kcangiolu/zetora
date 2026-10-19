import type { Message as DbMessage } from '@/lib/db/schema';
import type { ChatMessage } from '@/lib/types';

function toChatMessage(message: DbMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: (message.parts as ChatMessage['parts']) ?? [],
    metadata: {
      createdAt: message.createdAt.toISOString(),
      model: message.model ?? '',
      completionTime: message.completionTime ?? null,
      inputTokens: message.inputTokens ?? null,
      outputTokens: message.outputTokens ?? null,
      totalTokens: message.totalTokens ?? null,
      isCompactionSummary: message.isCompactionSummary,
      compactionReplacedCount: message.compactionReplacedCount ?? null,
    },
  };
}

// The conversation a turn answers. A saved chat is read back from the database plus the
// new user message; a temporary chat, or a request carrying several messages, uses what
// the client sent.
//
// `all` is every message of it; `active` drops the ones an existing compaction summary
// replaced (created before it), which the client still shows but the model must not get
// twice (lib/search/context-compaction.ts).
export function buildConversation({
  persisted,
  incoming,
  isTemporaryChat,
}: {
  persisted: DbMessage[];
  incoming: ChatMessage[];
  isTemporaryChat: boolean;
}): { all: ChatMessage[]; active: ChatMessage[]; newIncoming: ChatMessage[] } {
  const persistedIds = new Set(persisted.map((message) => message.id));
  const newIncoming = incoming.filter((message) => !persistedIds.has(message.id));
  const all =
    !isTemporaryChat && persisted.length > 0 && incoming.length === 1
      ? [...persisted.map(toChatMessage), ...newIncoming]
      : incoming;

  const summary = all.find((m) => m.metadata?.isCompactionSummary);
  if (!summary) return { all, active: all, newIncoming };
  const cutoff = new Date(summary.metadata!.createdAt).getTime();
  const active = all.filter(
    (m) =>
      m.id === summary.id ||
      // Not saved yet, so newer than any summary.
      !m.metadata?.createdAt ||
      new Date(m.metadata.createdAt).getTime() > cutoff,
  );
  return { all, active, newIncoming };
}

// The text of the most recent user message.
export function getLastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue;
    const text = messages[i].parts.findLast((part) => part.type === 'text' && part.text);
    if (text?.type === 'text') return text.text;
  }
  return '';
}
