import 'server-only';

import { cache } from 'react';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { chat, message, stream } from '../schema';
import { ChatSDKError, databaseError } from '../../errors';
import { db, maindb } from '../index';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

import { createLogger } from '@/lib/logger';

const log = createLogger('streams');

export async function createStreamId({ streamId, chatId }: { streamId: string; chatId: string }) {
  try {
    // clock_timestamp() (DB server clock) instead of app-host new Date(): a single
    // app instance with a skewed clock (e.g. a cold start before NTP sync) would
    // otherwise leave a createdAt in the "future" that getLatestStreamIdByChatId's
    // ordering would treat as newest forever, silently dropping every later
    // assistant response as stale.
    await db.insert(stream).values({ id: streamId, chatId, createdAt: sql`clock_timestamp()` });
  } catch (error) {
    throw databaseError('Failed to create stream id', error);
  }
}

/**
 * Creates a new chat and its first stream ID in a single DB round-trip using a CTE.
 * Saves one RTT compared to two sequential inserts (saveChat then createStreamId).
 */
export async function saveNewChatWithStream({
  chatId,
  userId,
  title,
  visibility,
  streamId,
}: {
  chatId: string;
  userId: string;
  title: string;
  visibility: 'public' | 'private';
  streamId: string;
}) {
  const safeVisibility: 'public' | 'private' = visibility === 'public' ? 'public' : 'private';
  try {
    // Use the DB server's own clock (clock_timestamp()) rather than the app
    // host's new Date(): a single skewed app instance (e.g. a cold start before
    // NTP sync) would otherwise stamp this chat/stream in the "future", which
    // getLatestStreamIdByChatId's createdAt ordering would treat as newest
    // forever, silently dropping every later assistant response as stale.
    await maindb.execute(
      sql`WITH new_chat AS (
        INSERT INTO "chat" (id, "userId", title, visibility, created_at, updated_at)
        VALUES (${chatId}, ${userId}, ${title}, ${safeVisibility}, clock_timestamp(), clock_timestamp())
        RETURNING id
      )
      INSERT INTO "stream" (id, "chatId", "createdAt")
      SELECT ${streamId}, id, clock_timestamp() FROM new_chat`,
    );
  } catch (error) {
    log.error('[saveNewChatWithStream] DB error:', error);
    // Fallback: two sequential inserts
    await maindb.insert(chat).values({
      id: chatId,
      userId,
      title,
      visibility: safeVisibility,
      createdAt: sql`clock_timestamp()`,
      updatedAt: sql`clock_timestamp()`,
    });
    await maindb.insert(stream).values({ id: streamId, chatId, createdAt: sql`clock_timestamp()` });
  }
}

// Cache stream ID lookups for the duration of the request
export const getStreamIdsByChatId = cache(async ({ chatId }: { chatId: string }) => {
  try {
    const streamIds = await maindb
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw databaseError('Failed to get stream ids by chat id', error);
  }
});

/**
 * Returns the most recently created stream ID for a chat.
 * Uses maindb to avoid replica lag when guarding concurrent writes.
 * Orders by id (uuidv7, chronologically sortable) rather than createdAt:
 * a single clock-skewed insert (e.g. a cold-started instance) can leave
 * createdAt in the "future", which would make that stream look newest
 * forever and cause every later assistant response to be dropped as stale.
 */
export async function getLatestStreamIdByChatId({ chatId }: { chatId: string }): Promise<string | null> {
  try {
    const [latestStream] = await maindb
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(desc(stream.id))
      .limit(1);

    return latestStream?.id ?? null;
  } catch (error) {
    throw databaseError('Failed to get latest stream id by chat id', error);
  }
}

/**
 * Returns the latest user message ID for a chat.
 * Uses maindb to avoid replica lag for race-condition guards.
 */
export async function getLatestUserMessageIdByChatId({ chatId }: { chatId: string }): Promise<string | null> {
  try {
    const [latestUserMessage] = await maindb
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.chatId, chatId), eq(message.role, 'user')))
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(1);

    return latestUserMessage?.id ?? null;
  } catch (error) {
    throw databaseError('Failed to get latest user message id by chat id', error);
  }
}
