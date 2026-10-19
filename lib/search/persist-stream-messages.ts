import { getLatestStreamIdByChatId, getLatestUserMessageIdByChatId, saveMessages } from '@/lib/db/queries';
import { createLogger } from '@/lib/logger';
import type { ChatMessage } from '@/lib/types';

import type { UsageMetadata } from './stream-usage';

const log = createLogger('search');

// What a stopped answer keeps: assistant messages with some content.
export function selectPersistableMessages(messages: ChatMessage[], isAborted: boolean): ChatMessage[] {
  if (!isAborted) return messages;
  return messages.filter(
    (message) =>
      message.role === 'assistant' &&
      message.parts.some((part: any) => {
        if (part.type === 'text' || part.type === 'reasoning')
          return typeof part.text === 'string' && part.text.trim().length > 0;
        return part.type === 'tool-invocation' || part.type === 'file' || part.type === 'source-url';
      }),
  );
}

// Saves the messages a stream produced, unless a newer request already took over the
// chat: a later stream, or a newer user turn (sent, edited or regenerated meanwhile).
export async function persistStreamMessages({
  chatId,
  streamId,
  requestUserMessageId,
  messages,
  isAborted,
  model,
  usage,
}: {
  chatId: string;
  streamId: string;
  requestUserMessageId: string;
  // The messages the stream added to the conversation.
  messages: ChatMessage[];
  isAborted: boolean;
  model: string;
  usage: UsageMetadata;
}) {
  if (messages.length === 0) {
    log.info('No new messages to persist for chat', chatId);
    return;
  }

  const latestStreamId = await getLatestStreamIdByChatId({ chatId });
  if (latestStreamId !== streamId) {
    log.info('Skipping stale stream message persistence', { chatId, streamId, latestStreamId });
    return;
  }
  const latestUserMessageId = await getLatestUserMessageIdByChatId({ chatId });
  if (latestUserMessageId !== requestUserMessageId) {
    log.info('Skipping stale turn message persistence', {
      chatId,
      streamId,
      requestUserMessageId,
      latestUserMessageId,
    });
    return;
  }

  const toPersist = selectPersistableMessages(messages, isAborted);
  if (toPersist.length === 0) {
    log.info('Stream aborted with no persistable assistant output', { chatId, streamId });
    return;
  }

  await saveMessages({
    messages: toPersist.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts,
      createdAt: typeof message.metadata?.createdAt === 'string' ? new Date(message.metadata.createdAt) : new Date(),
      attachments: [],
      chatId,
      model: message.metadata?.model ?? model,
      completionTime: message.metadata?.completionTime ?? usage.completionTime,
      inputTokens: message.metadata?.inputTokens ?? usage.inputTokens,
      outputTokens: message.metadata?.outputTokens ?? usage.outputTokens,
      totalTokens: message.metadata?.totalTokens ?? usage.totalTokens,
      searchVector: null,
      isCompactionSummary: false,
      compactionReplacedCount: null,
      hermesReaction: null,
      hermesGatewayId: null,
    })),
  });
}
