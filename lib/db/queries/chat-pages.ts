import 'server-only';

import { eq } from 'drizzle-orm';
import { chat, type User, message, type Message, type Chat } from '../schema';
import { ChatSDKError, databaseError } from '../../errors';
import { maindb } from '../index';

import { createLogger } from '@/lib/logger';

const log = createLogger('chat-pages');

// Optimized query to get chat with user data for ownership checks
export async function getChatWithUserAndInitialMessages({ id }: { id: string }): Promise<{
  chat: Chat | null;
  user: User | null;
  messages: Message[];
  hasMoreMessages: boolean;
}> {
  try {
    log.debug('🔍 [DB-OPTIMIZED] getChatWithUserAndInitialMessages: Starting optimized query (db.query.chat)...');
    const startTime = Date.now();

    const record = await maindb.query.chat.findFirst({
      where: eq(chat.id, id),
    });

    if (!record) {
      return {
        chat: null,
        user: null,
        messages: [],
        hasMoreMessages: false,
      };
    }

    // The only caller already fetches the current session user separately,
    // so avoid joining the chat owner row here.
    const messages = await maindb.query.message.findMany({
      where: eq(message.chatId, id),
      orderBy: (fields, { asc: orderAsc }) => [orderAsc(fields.createdAt), orderAsc(fields.id)],
    });

    const queryTime = (Date.now() - startTime) / 1000;
    log.debug(
      `⏱️  [DB-OPTIMIZED] getChatWithUserAndInitialMessages: db.query.chat (with user + messages) took ${queryTime.toFixed(
        2,
      )}s`,
    );

    return {
      chat: record,
      user: null,
      messages,
      hasMoreMessages: false,
    };
  } catch (error) {
    log.error('Error in getChatWithUserAndInitialMessages:', error);
    throw databaseError('Failed to get chat with user and messages', error);
  }
}
