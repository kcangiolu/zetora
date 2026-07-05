import 'server-only';

import { and, eq, gte, lt, sql } from 'drizzle-orm';
import {
  chat,
  message,
  extremeSearchUsage,
  anthropicUsage,
  googleUsage,
  messageUsage,
  agentModeUsageEvents,
} from '../schema';
import { ChatSDKError } from '../../errors';
import { db, maindb } from '../index';
import {
  getDodoSubscriptions,
  setDodoSubscriptions,
  getDodoProStatus,
  setDodoProStatus,
} from '../../performance-cache';
import { all } from 'better-all';
import { getBetterAllOptions } from '@/lib/better-all';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

export async function getExtremeSearchUsageByUserId({ userId }: { userId: string }) {
  try {
    const now = new Date();
    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Start of next month
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    startOfNextMonth.setHours(0, 0, 0, 0);

    const [usage] = await maindb
      .select()
      .from(extremeSearchUsage)
      .where(
        and(
          eq(extremeSearchUsage.userId, userId),
          gte(extremeSearchUsage.date, startOfMonth),
          lt(extremeSearchUsage.date, startOfNextMonth),
        ),
      )
      .limit(1);

    return usage;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get extreme search usage');
  }
}

export async function incrementExtremeSearchUsage({ userId }: { userId: string }) {
  try {
    // Start of current month for the date key
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // End of current month for monthly reset
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    endOfMonth.setHours(0, 0, 0, 0);

    // Atomic upsert: insert or increment if exists
    // Uses ON CONFLICT on the unique (userId, date) constraint
    const [result] = await db
      .insert(extremeSearchUsage)
      .values({
        userId,
        searchCount: 1,
        date: startOfMonth,
        resetAt: endOfMonth,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [extremeSearchUsage.userId, extremeSearchUsage.date],
        set: {
          searchCount: sql`${extremeSearchUsage.searchCount} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to increment extreme search usage');
  }
}

export async function getExtremeSearchCount({ userId }: { userId: string }): Promise<number> {
  try {
    const usage = await getExtremeSearchUsageByUserId({ userId });
    return usage?.searchCount || 0;
  } catch (error) {
    console.error('Error getting extreme search count:', error);
    return 0;
  }
}

export async function getAnthropicUsageByUserId({ userId }: { userId: string }) {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);
    startOfNextWeek.setHours(0, 0, 0, 0);

    const [usage] = await maindb
      .select()
      .from(anthropicUsage)
      .where(
        and(
          eq(anthropicUsage.userId, userId),
          gte(anthropicUsage.date, startOfWeek),
          lt(anthropicUsage.date, startOfNextWeek),
        ),
      )
      .limit(1);

    return usage;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get anthropic usage');
  }
}

export async function incrementAnthropicUsage({ userId, model }: { userId: string; model?: string | null }) {
  try {
    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    endOfWeek.setHours(0, 0, 0, 0);

    db.delete(anthropicUsage)
      .where(and(eq(anthropicUsage.userId, userId), lt(anthropicUsage.date, startOfWeek)))
      .catch((err) => console.error('Failed to clean up old anthropic usage:', err));

    const [result] = await db
      .insert(anthropicUsage)
      .values({
        userId,
        usageCount: 1,
        date: startOfWeek,
        resetAt: endOfWeek,
        metadata: model ? { lastModel: model } : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [anthropicUsage.userId, anthropicUsage.date],
        set: {
          usageCount: sql`${anthropicUsage.usageCount} + 1`,
          metadata: model ? { lastModel: model } : sql`${anthropicUsage.metadata}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to increment anthropic usage');
  }
}

export async function getAnthropicUsageCount({ userId }: { userId: string }): Promise<number> {
  try {
    const usage = await getAnthropicUsageByUserId({ userId });
    return usage?.usageCount || 0;
  } catch (error) {
    console.error('Error getting anthropic usage count:', error);
    return 0;
  }
}

export async function getGoogleUsageByUserId({ userId }: { userId: string }) {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    startOfNextMonth.setHours(0, 0, 0, 0);

    const [usage] = await maindb
      .select()
      .from(googleUsage)
      .where(
        and(
          eq(googleUsage.userId, userId),
          gte(googleUsage.date, startOfMonth),
          lt(googleUsage.date, startOfNextMonth),
        ),
      )
      .limit(1);

    return usage;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get google usage');
  }
}

export async function incrementGoogleUsage({ userId, model }: { userId: string; model?: string | null }) {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfNextMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    startOfNextMonth.setHours(0, 0, 0, 0);

    db.delete(googleUsage)
      .where(and(eq(googleUsage.userId, userId), lt(googleUsage.date, startOfMonth)))
      .catch((err) => console.error('Failed to clean up old google usage:', err));

    const [result] = await db
      .insert(googleUsage)
      .values({
        userId,
        usageCount: 1,
        date: startOfMonth,
        resetAt: startOfNextMonth,
        metadata: model ? { lastModel: model } : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [googleUsage.userId, googleUsage.date],
        set: {
          usageCount: sql`${googleUsage.usageCount} + 1`,
          metadata: model ? { lastModel: model } : sql`${googleUsage.metadata}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to increment google usage');
  }
}

export async function getGoogleUsageCount({ userId }: { userId: string }): Promise<number> {
  try {
    const usage = await getGoogleUsageByUserId({ userId });
    return usage?.usageCount || 0;
  } catch (error) {
    console.error('Error getting google usage count:', error);
    return 0;
  }
}

export async function getMessageUsageByUserId({ userId }: { userId: string }) {
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
      .catch((err) => console.error('Failed to clean up old message usage:', err));

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
    console.error('Error getting message count:', error);
    return 0;
  }
}

/**
 * Fetches message count (daily), extreme search count (monthly), and anthropic count (daily)
 * in one parallel round-trip. Use for critical-checks path to avoid sequential awaits.
 */
export async function getMessageCountAndExtremeSearchByUserId({
  userId,
}: {
  userId: string;
}): Promise<{ messageCount: number; extremeSearchCount: number; anthropicCount: number; googleCount: number }> {
  try {
    const { messageUsageRow, extremeUsageRow, anthropicUsageRow, googleUsageRow } = await all(
      {
        async messageUsageRow() {
          return getMessageUsageByUserId({ userId });
        },
        async extremeUsageRow() {
          return getExtremeSearchUsageByUserId({ userId });
        },
        async anthropicUsageRow() {
          return getAnthropicUsageByUserId({ userId });
        },
        async googleUsageRow() {
          return getGoogleUsageByUserId({ userId });
        },
      },
      getBetterAllOptions(),
    );
    return {
      messageCount: messageUsageRow?.messageCount ?? 0,
      extremeSearchCount: extremeUsageRow?.searchCount ?? 0,
      anthropicCount: anthropicUsageRow?.usageCount ?? 0,
      googleCount: googleUsageRow?.usageCount ?? 0,
    };
  } catch (error) {
    console.error('Error getting batched usage counts:', error);
    return { messageCount: 0, extremeSearchCount: 0, anthropicCount: 0, googleCount: 0 };
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
    console.error('Error getting historical usage data:', error);
    return [];
  }
}

export async function getAgentModeRequestCountForCurrentMonth({ userId }: { userId: string }): Promise<number> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    startOfNextMonth.setHours(0, 0, 0, 0);

    const [row] = await maindb
      .select({
        requestCount: sql<number>`COUNT(*)::int`.as('request_count'),
      })
      .from(agentModeUsageEvents)
      .where(
        and(
          eq(agentModeUsageEvents.userId, userId),
          gte(agentModeUsageEvents.date, startOfMonth),
          lt(agentModeUsageEvents.date, startOfNextMonth),
        ),
      );

    return row?.requestCount ?? 0;
  } catch (error) {
    console.error('Error getting agent mode request count:', error);
    return 0;
  }
}

export async function trackAgentModeUsageEventForMessage({
  userId,
  messageId,
}: {
  userId: string;
  messageId: string;
}): Promise<void> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    startOfNextMonth.setHours(0, 0, 0, 0);

    await maindb
      .insert(agentModeUsageEvents)
      .values({
        userId,
        messageId,
        date: startOfMonth,
        resetAt: startOfNextMonth,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [agentModeUsageEvents.messageId],
      });
  } catch (error) {
    // Usage tracking should never break builds; swallow and log.
    console.error('Error tracking agent mode usage event:', error);
  }
}

// Custom Instructions CRUD operations
