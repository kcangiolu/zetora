import 'server-only';

import { cache } from 'react';
import { desc, eq } from 'drizzle-orm';
import { lookout } from '../schema';
import { databaseError } from '../../errors';
import { db, maindb } from '../index';

import { createLogger } from '@/lib/logger';

const log = createLogger('db-lookouts');

// Lookout CRUD operations
export async function createLookout({
  userId,
  title,
  prompt,
  frequency,
  cronSchedule,
  timezone,
  nextRunAt,
  qstashScheduleId,
  searchMode = 'extreme',
}: {
  userId: string;
  title: string;
  prompt: string;
  frequency: string;
  cronSchedule: string;
  timezone: string;
  nextRunAt: Date;
  qstashScheduleId?: string;
  searchMode?: string;
}) {
  try {
    const [newLookout] = await db
      .insert(lookout)
      .values({
        userId,
        title,
        prompt,
        frequency,
        cronSchedule,
        timezone,
        nextRunAt,
        qstashScheduleId,
        searchMode,
      })
      .returning();

    log.debug('✅ Created lookout with ID:', newLookout.id, 'for user:', userId);
    return newLookout;
  } catch (error) {
    log.error('❌ Failed to create lookout:', error);
    throw databaseError('Failed to create lookout', error);
  }
}

// Cache lookout queries for the duration of the request
export const getLookoutsByUserId = cache(async ({ userId }: { userId: string }) => {
  try {
    return await maindb.select().from(lookout).where(eq(lookout.userId, userId)).orderBy(desc(lookout.createdAt));
  } catch (error) {
    throw databaseError('Failed to get lookouts by user id', error);
  }
});

// Cache individual lookout lookups for the duration of the request
export const getLookoutById = cache(async ({ id }: { id: string }) => {
  try {
    log.debug('🔍 Looking up lookout with ID:', id);
    const [selectedLookout] = await maindb.select().from(lookout).where(eq(lookout.id, id)).limit(1);

    if (selectedLookout) {
      log.debug('✅ Found lookout:', selectedLookout.id, selectedLookout.title);
    } else {
      log.debug('❌ No lookout found with ID:', id);
    }

    return selectedLookout;
  } catch (error) {
    log.error('❌ Error fetching lookout by ID:', id, error);
    throw databaseError('Failed to get lookout by id', error);
  }
});

export async function updateLookout({
  id,
  title,
  prompt,
  frequency,
  cronSchedule,
  timezone,
  nextRunAt,
  qstashScheduleId,
  searchMode,
}: {
  id: string;
  title?: string;
  prompt?: string;
  frequency?: string;
  cronSchedule?: string;
  timezone?: string;
  nextRunAt?: Date;
  qstashScheduleId?: string;
  searchMode?: string;
}) {
  try {
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (prompt !== undefined) updateData.prompt = prompt;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (cronSchedule !== undefined) updateData.cronSchedule = cronSchedule;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (nextRunAt !== undefined) updateData.nextRunAt = nextRunAt;
    if (qstashScheduleId !== undefined) updateData.qstashScheduleId = qstashScheduleId;
    if (searchMode !== undefined) updateData.searchMode = searchMode;

    const [updatedLookout] = await db.update(lookout).set(updateData).where(eq(lookout.id, id)).returning();

    return updatedLookout;
  } catch (error) {
    throw databaseError('Failed to update lookout', error);
  }
}

export async function updateLookoutStatus({
  id,
  status,
}: {
  id: string;
  status: 'active' | 'paused' | 'archived' | 'running';
}) {
  try {
    const [updatedLookout] = await db
      .update(lookout)
      .set({ status, updatedAt: new Date() })
      .where(eq(lookout.id, id))
      .returning();

    return updatedLookout;
  } catch (error) {
    throw databaseError('Failed to update lookout status', error);
  }
}

export async function updateLookoutLastRun({
  id,
  lastRunAt,
  lastRunChatId,
  nextRunAt,
  runStatus = 'success',
  error,
  duration,
  tokensUsed,
  searchesPerformed,
}: {
  id: string;
  lastRunAt: Date;
  lastRunChatId: string;
  nextRunAt?: Date;
  runStatus?: 'success' | 'error' | 'timeout';
  error?: string;
  duration?: number;
  tokensUsed?: number;
  searchesPerformed?: number;
}) {
  try {
    // Get current lookout to append to run history
    const currentLookout = await getLookoutById({ id });
    if (!currentLookout) {
      throw new Error('Lookout not found');
    }

    const currentHistory = (currentLookout.runHistory as any[]) || [];

    // Add new run to history
    const newRun = {
      runAt: lastRunAt.toISOString(),
      chatId: lastRunChatId,
      status: runStatus,
      ...(error && { error }),
      ...(duration && { duration }),
      ...(tokensUsed && { tokensUsed }),
      ...(searchesPerformed && { searchesPerformed }),
    };

    // Keep only last 100 runs to prevent unbounded growth
    const updatedHistory = [...currentHistory, newRun].slice(-100);

    const updateData: any = {
      lastRunAt,
      lastRunChatId,
      runHistory: updatedHistory,
      updatedAt: new Date(),
    };
    if (nextRunAt) updateData.nextRunAt = nextRunAt;

    const [updatedLookout] = await db.update(lookout).set(updateData).where(eq(lookout.id, id)).returning();

    return updatedLookout;
  } catch (error) {
    throw databaseError('Failed to update lookout last run', error);
  }
}

// New function to get run statistics
export async function deleteLookout({ id }: { id: string }) {
  try {
    const [deletedLookout] = await db.delete(lookout).where(eq(lookout.id, id)).returning();

    return deletedLookout;
  } catch (error) {
    throw databaseError('Failed to delete lookout', error);
  }
}
