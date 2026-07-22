import 'server-only';

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { chat, message, messageUsage } from '../schema';
import { ChatSDKError } from '../../errors';
import { db, maindb } from '../index';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

import { createLogger } from '@/lib/logger';

const log = createLogger('db-usage');

async function getMessageUsageByUserId({ userId }: { userId: string }) {
  try {
    const now = new Date();
    // Start of current day
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfDay.setHours(0, 0, 0, 0);

    // Start of next day
    const startOfNextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    startOfNextDay.setHours(0, 0, 0, 0);

    const [usage] = await maindb
      .select()
      .from(messageUsage)
      .where(
        and(eq(messageUsage.userId, userId), gte(messageUsage.date, startOfDay), lt(messageUsage.date, startOfNextDay)),
      )
      .limit(1);

    return usage;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get message usage');
  }
}

export async function incrementMessageUsage({ userId }: { userId: string }) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End of current day for daily reset
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    endOfDay.setHours(0, 0, 0, 0);

    // Clean up previous day entries for this user (non-blocking, errors won't fail the increment)
    db.delete(messageUsage)
      .where(and(eq(messageUsage.userId, userId), lt(messageUsage.date, today)))
      .catch((err) => log.error('Failed to clean up old message usage:', err));

    // Atomic upsert: insert or increment if exists
    // Uses ON CONFLICT on the unique (userId, date) constraint
    const [result] = await db
      .insert(messageUsage)
      .values({
        userId,
        messageCount: 1,
        date: today,
        resetAt: endOfDay,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [messageUsage.userId, messageUsage.date],
        set: {
          messageCount: sql`${messageUsage.messageCount} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to increment message usage');
  }
}

export async function getMessageCount({ userId }: { userId: string }): Promise<number> {
  try {
    const usage = await getMessageUsageByUserId({ userId });
    return usage?.messageCount || 0;
  } catch (error) {
    log.error('Error getting message count:', error);
    return 0;
  }
}

export async function getMessageCountByUserId({ userId }: { userId: string }): Promise<{ messageCount: number }> {
  try {
    const messageUsageRow = await getMessageUsageByUserId({ userId });
    return { messageCount: messageUsageRow?.messageCount ?? 0 };
  } catch (error) {
    log.error('Error getting message usage count:', error);
    return { messageCount: 0 };
  }
}

export async function getHistoricalUsageData({ userId, months = 6 }: { userId: string; months?: number }) {
  try {
    // Get aggregated message counts by date using SQL aggregation
    // This is much more efficient than fetching all messages and grouping in JS
    const totalDays = months * 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (totalDays - 1));

    // Use SQL aggregation to count messages per day
    const dailyCounts = await maindb
      .select({
        date: sql<string>`DATE(${message.createdAt})`.as('date'),
        messageCount: sql<number>`COUNT(*)::int`.as('message_count'),
      })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, userId),
          eq(message.role, 'user'),
          gte(message.createdAt, startDate),
          lt(message.createdAt, endDate),
        ),
      )
      .groupBy(sql`DATE(${message.createdAt})`)
      .orderBy(sql`DATE(${message.createdAt})`);

    // Convert to the format expected by the frontend
    return dailyCounts.map((row) => ({
      date: new Date(row.date),
      messageCount: row.messageCount,
    }));
  } catch (error) {
    log.error('Error getting historical usage data:', error);
    return [];
  }
}

// Custom Instructions CRUD operations
