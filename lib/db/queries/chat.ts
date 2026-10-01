import 'server-only';

import { cache } from 'react';
import { and, asc, desc, eq, gt, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { user, chat, message, type Message, stream, buildSession, hermesConversation } from '../schema';
import { ChatSDKError } from '../../errors';
import { db, maindb } from '../index';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';
import { linkUploadedFilesToChats } from './uploaded-files';

import { createLogger } from '@/lib/logger';

const log = createLogger('chat');

type VisibilityType = 'public' | 'private';

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await maindb.insert(chat).values({
      id,
      userId,
      title,
      visibility,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat' + error);
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    // Use transaction to ensure atomicity - if chat deletion fails,
    // message and stream deletions are rolled back
    return await maindb.transaction(async (tx) => {
      // Delete messages and streams in parallel within the transaction using better-all
      await all(
        {
          deleteMessages: async function () {
            await tx.delete(message).where(eq(message.chatId, id));
            return true;
          },
          deleteStreams: async function () {
            await tx.delete(stream).where(eq(stream.chatId, id));
            return true;
          },
        },
        getBetterAllOptions(),
      );

      // Delete the chat and return the deleted record
      const [chatsDeleted] = await tx.delete(chat).where(eq(chat.id, id)).returning();
      return chatsDeleted;
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete chat by id');
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
  cursorDate,
  cursorIsPinned,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
  cursorDate?: string | null;
  cursorIsPinned?: boolean | null;
}) {
  try {
    const extendedLimit = limit + 1;

    // Select only necessary columns for better performance
    const query = (whereCondition?: SQL<any>) =>
      maindb
        .select({
          id: chat.id,
          userId: chat.userId,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          isPinned: chat.isPinned,
          visibility: chat.visibility,
          // A chat permanently locked to Agent mode (getHermesChatLock's own comment) —
          // the history list's rainbow-dot indicator.
          isHermesChat: sql<boolean>`${hermesConversation.chatId} IS NOT NULL`,
        })
        .from(chat)
        .leftJoin(hermesConversation, eq(hermesConversation.chatId, chat.id))
        .where(whereCondition ? and(whereCondition, eq(chat.userId, id)) : eq(chat.userId, id))
        .orderBy(desc(chat.isPinned), desc(chat.updatedAt), desc(chat.id))
        .limit(extendedLimit);

    let filteredChats: Array<any> = [];

    if (startingAfter) {
      // If we have a direct timestamp cursor, skip the extra lookup
      const cursorTimestamp = cursorDate ? new Date(cursorDate) : null;
      if (cursorTimestamp) {
        filteredChats = await query(gt(chat.updatedAt, cursorTimestamp));
      } else {
        const [selectedChat] = await maindb
          .select({ updatedAt: chat.updatedAt })
          .from(chat)
          .where(eq(chat.id, startingAfter))
          .limit(1);

        if (!selectedChat) {
          throw new ChatSDKError('not_found:database', `Chat with id ${startingAfter} not found`);
        }

        filteredChats = await query(gt(chat.updatedAt, selectedChat.updatedAt));
      }
    } else if (endingBefore) {
      // If we have a direct timestamp cursor, skip the extra lookup
      const cursorTimestamp = cursorDate ? new Date(cursorDate) : null;
      if (cursorTimestamp) {
        if (cursorIsPinned) {
          filteredChats = await query(
            or(and(eq(chat.isPinned, true), lt(chat.updatedAt, cursorTimestamp)), eq(chat.isPinned, false)),
          );
        } else {
          filteredChats = await query(and(eq(chat.isPinned, false), lt(chat.updatedAt, cursorTimestamp)));
        }
      } else {
        const [selectedChat] = await maindb
          .select({ updatedAt: chat.updatedAt, isPinned: chat.isPinned })
          .from(chat)
          .where(eq(chat.id, endingBefore))
          .limit(1);

        if (!selectedChat) {
          throw new ChatSDKError('not_found:database', `Chat with id ${endingBefore} not found`);
        }

        if (selectedChat.isPinned) {
          filteredChats = await query(
            or(and(eq(chat.isPinned, true), lt(chat.updatedAt, selectedChat.updatedAt)), eq(chat.isPinned, false)),
          );
        } else {
          filteredChats = await query(and(eq(chat.isPinned, false), lt(chat.updatedAt, selectedChat.updatedAt)));
        }
      }
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chats by user id');
  }
}

// Lightweight query for sidebar recent chats - minimal columns, no pagination cursor logic
export async function getRecentChatsByUserId({ userId, limit = 8 }: { userId: string; limit?: number }): Promise<{
  chats: Array<{
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
    isPinned: boolean;
    visibility: 'public' | 'private';
    isHermesChat: boolean;
  }>;
  hasMore: boolean;
}> {
  try {
    const extendedLimit = limit + 1;
    // Use maindb (primary) so newly created chats appear immediately without replication lag
    const results = await maindb
      .select({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        isPinned: chat.isPinned,
        visibility: chat.visibility,
        // A chat permanently locked to Agent mode (getHermesChatLock's own comment) — the
        // sidebar's rainbow-dot indicator.
        isHermesChat: sql<boolean>`${hermesConversation.chatId} IS NOT NULL`,
      })
      .from(chat)
      .leftJoin(buildSession, eq(buildSession.chatId, chat.id))
      .leftJoin(hermesConversation, eq(hermesConversation.chatId, chat.id))
      .where(and(eq(chat.userId, userId), isNull(buildSession.chatId)))
      .orderBy(desc(chat.isPinned), desc(chat.updatedAt), desc(chat.id))
      .limit(extendedLimit);

    const hasMore = results.length > limit;
    return {
      chats: hasMore ? results.slice(0, limit) : results,
      hasMore,
    };
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get recent chats by user id');
  }
}

// Lightweight version that only fetches id and userId for ownership validation - cached per request
export const getChatByIdForValidation = cache(
  async ({ id }: { id: string }): Promise<{ id: string; userId: string } | null> => {
    try {
      const [selectedChat] = await maindb
        .select({ id: chat.id, userId: chat.userId })
        .from(chat)
        .where(eq(chat.id, id))
        .limit(1);
      return selectedChat || null;
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
    }
  },
);

// Cache chat lookups for the duration of the request
export const getChatById = cache(async ({ id }: { id: string }) => {
  try {
    log.debug('🔍 [DB-DETAIL] getChatById: Starting query...');
    const cacheQueryStart = Date.now();
    // Use direct select instead of relational query for better performance
    const [selectedChat] = await maindb.select().from(chat).where(eq(chat.id, id)).limit(1);
    const cacheQueryTime = (Date.now() - cacheQueryStart) / 1000;
    log.debug(`⏱️  [DB-DETAIL] getChatById: Query (with cache) took ${cacheQueryTime.toFixed(2)}s`);
    return selectedChat || null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
});

export async function getChatWithUserById({ id }: { id: string }) {
  try {
    const [result] = await maindb
      .select({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        visibility: chat.visibility,
        userId: chat.userId,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(chat)
      .innerJoin(user, eq(chat.userId, user.id))
      .where(eq(chat.id, id));
    return result;
  } catch (error) {
    log.debug('Error getting chat with user by id', error);
    return null;
  }
}

/**
 * Saves the user message that opens a turn, stamped with the DB server's own
 * clock (clock_timestamp()) rather than the app host's new Date().
 *
 * getLatestUserMessageIdByChatId orders by createdAt to detect whether a
 * newer turn has started before persisting an in-flight assistant response.
 * If this row's createdAt came from an app instance with a skewed clock
 * (e.g. a cold start before NTP sync), it could look "newest" forever and
 * cause every later assistant response in the chat to be dropped as stale.
 */
export async function saveUserTurnMessage({
  chatId,
  id,
  parts,
  model,
}: {
  chatId: string;
  id: string;
  parts: Message['parts'];
  model: string;
}) {
  try {
    await maindb
      .insert(message)
      .values({
        chatId,
        id,
        role: 'user',
        parts,
        attachments: [],
        createdAt: sql`clock_timestamp()`,
        model,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        completionTime: 0,
      })
      .onConflictDoNothing({ target: message.id });

    await maindb
      .update(chat)
      .set({ updatedAt: sql`clock_timestamp()` })
      .where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save user turn message');
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  if (!messages.length) return [];

  await linkUploadedFilesToChats(messages);

  try {
    const insertBatchSize = 50;
    const payloadBatchThresholdBytes = 256 * 1024;
    const isSingleChat = messages.every((messageItem) => messageItem.chatId === messages[0].chatId);

    let estimatedPayloadBytes = 0;
    for (const messageItem of messages) {
      estimatedPayloadBytes += Buffer.byteLength(JSON.stringify(messageItem.parts));
      estimatedPayloadBytes += Buffer.byteLength(JSON.stringify(messageItem.attachments));
      if (estimatedPayloadBytes >= payloadBatchThresholdBytes) break;
    }

    const shouldBatch =
      messages.length > insertBatchSize &&
      (messages.length > insertBatchSize * 2 || estimatedPayloadBytes >= payloadBatchThresholdBytes);

    if (!shouldBatch) {
      const insertResult = await maindb.insert(message).values(messages).onConflictDoNothing({ target: message.id });

      if (isSingleChat) {
        let latestMessageAt = messages[0].createdAt;

        for (let index = 1; index < messages.length; index++) {
          if (messages[index].createdAt > latestMessageAt) latestMessageAt = messages[index].createdAt;
        }

        await maindb
          .update(chat)
          .set({ updatedAt: latestMessageAt })
          .where(and(eq(chat.id, messages[0].chatId), lt(chat.updatedAt, latestMessageAt)));

        return insertResult;
      }

      const latestMessageAtByChatId = new Map<string, Date>();

      for (const messageItem of messages) {
        const existing = latestMessageAtByChatId.get(messageItem.chatId);
        if (!existing || messageItem.createdAt > existing) {
          latestMessageAtByChatId.set(messageItem.chatId, messageItem.createdAt);
        }
      }

      await Promise.all(
        Array.from(latestMessageAtByChatId.entries()).map(([chatId, latestMessageAt]) =>
          maindb
            .update(chat)
            .set({ updatedAt: latestMessageAt })
            .where(and(eq(chat.id, chatId), lt(chat.updatedAt, latestMessageAt))),
        ),
      );

      return insertResult;
    }

    // Large multi-row payloads are safer to split into smaller inserts.
    return await maindb.transaction(async (tx) => {
      let lastInsertResult = await tx
        .insert(message)
        .values(messages.slice(0, insertBatchSize))
        .onConflictDoNothing({ target: message.id });

      for (let index = insertBatchSize; index < messages.length; index += insertBatchSize) {
        const messageBatch = messages.slice(index, index + insertBatchSize);
        lastInsertResult = await tx.insert(message).values(messageBatch).onConflictDoNothing({ target: message.id });
      }

      if (isSingleChat) {
        let latestMessageAt = messages[0].createdAt;

        for (let index = 1; index < messages.length; index++) {
          if (messages[index].createdAt > latestMessageAt) latestMessageAt = messages[index].createdAt;
        }

        await tx
          .update(chat)
          .set({ updatedAt: latestMessageAt })
          .where(and(eq(chat.id, messages[0].chatId), lt(chat.updatedAt, latestMessageAt)));

        return lastInsertResult;
      }

      const latestMessageAtByChatId = new Map<string, Date>();

      for (const messageItem of messages) {
        const existing = latestMessageAtByChatId.get(messageItem.chatId);
        if (!existing || messageItem.createdAt > existing) {
          latestMessageAtByChatId.set(messageItem.chatId, messageItem.createdAt);
        }
      }

      for (const [chatId, latestMessageAt] of latestMessageAtByChatId.entries()) {
        await tx
          .update(chat)
          .set({ updatedAt: latestMessageAt })
          .where(and(eq(chat.id, chatId), lt(chat.updatedAt, latestMessageAt)));
      }

      return lastInsertResult;
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

// Cache message lookups for the duration of the request
export const getMessagesByChatId = cache(
  async ({
    id,
    limit = 50,
    offset = 0,
    mostRecent = false,
  }: { id: string; limit?: number; offset?: number; mostRecent?: boolean }) => {
    try {
      if (mostRecent) {
        // Fetch the newest `limit` rows, then flip back to chronological
        // order — callers always get ascending order, same contract as the
        // default branch below.
        const rows = await maindb
          .select()
          .from(message)
          .where(eq(message.chatId, id))
          .orderBy(desc(message.createdAt), desc(message.id))
          .limit(limit)
          .offset(offset);
        return rows.reverse();
      }

      return await maindb
        .select()
        .from(message)
        .where(eq(message.chatId, id))
        .orderBy(asc(message.createdAt), asc(message.id))
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new ChatSDKError('bad_request:database', 'Failed to get messages by chat id');
    }
  },
);

export async function getMessageById({ id }: { id: string }) {
  try {
    return await maindb.select().from(message).where(eq(message.id, id)).limit(1);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get message by id');
  }
}

export async function updateMessagePartsById({ id, parts }: { id: string; parts: Message['parts'] }) {
  try {
    return await maindb.update(message).set({ parts }).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to update message parts');
  }
}

// Hermes's `react` op — see lib/db/schema.ts's hermesReaction comment. `emoji: null`
// clears it (action.remove === true).
export async function updateMessageHermesReaction({ id, emoji }: { id: string; emoji: string | null }) {
  try {
    return await maindb.update(message).set({ hermesReaction: emoji }).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to update message reaction');
  }
}

// Inserts the chat's (at most one) compaction-summary message on first
// compaction, or updates it in place on every later incremental re-compaction
// (see lib/search/context-compaction.ts). The message's own createdAt is the
// compaction cutoff — advancing it on update is what lets the summary "cover"
// more of the conversation over time, so no separate cutoff column exists.
export async function upsertCompactionSummaryMessage({
  chatId,
  existingMessageId,
  text,
  replacedCount,
  cutoffCreatedAt,
}: {
  chatId: string;
  existingMessageId?: string;
  text: string;
  replacedCount: number;
  cutoffCreatedAt: Date;
}) {
  try {
    if (existingMessageId) {
      const [updated] = await maindb
        .update(message)
        .set({
          parts: [{ type: 'text', text }],
          compactionReplacedCount: replacedCount,
          createdAt: cutoffCreatedAt,
        })
        .where(eq(message.id, existingMessageId))
        .returning();
      return updated;
    }

    const [inserted] = await maindb
      .insert(message)
      .values({
        chatId,
        role: 'assistant',
        parts: [{ type: 'text', text }],
        attachments: [],
        isCompactionSummary: true,
        compactionReplacedCount: replacedCount,
        createdAt: cutoffCreatedAt,
      })
      .returning();
    return inserted;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to upsert compaction summary message');
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({ chatId, timestamp }: { chatId: string; timestamp: Date }) {
  try {
    // Direct delete without intermediate query - more efficient and atomic
    // This prevents race conditions where messages could be inserted between select and delete
    return await maindb.delete(message).where(and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete messages by chat id after timestamp');
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  log.debug('🔄 updateChatVisibilityById called with:', { chatId, visibility });

  try {
    log.debug('📡 Executing database update for chat visibility');
    const result = await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
    log.debug('✅ Database update successful, result:', result);

    // Return a consistent, serializable structure
    return {
      success: true,
      rowCount: result.rowCount || 0,
      chatId,
      visibility,
    };
  } catch (error) {
    log.error('❌ Database error in updateChatVisibilityById:', {
      chatId,
      visibility,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ChatSDKError('bad_request:database', 'Failed to update chat visibility by id');
  }
}

export async function updateChatTitleById({ chatId, title }: { chatId: string; title: string }) {
  try {
    const [updatedChat] = await db
      .update(chat)
      .set({ title, updatedAt: new Date() })
      .where(eq(chat.id, chatId))
      .returning();
    return updatedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to update chat title by id');
  }
}

export async function updateChatPinnedById({ chatId, isPinned }: { chatId: string; isPinned: boolean }) {
  try {
    const [updatedChat] = await db.update(chat).set({ isPinned }).where(eq(chat.id, chatId)).returning();
    return updatedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to update chat pinned state by id');
  }
}
