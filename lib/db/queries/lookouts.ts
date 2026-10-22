import 'server-only';

import { cache } from 'react';
import { and, desc, eq, sql } from 'drizzle-orm';
import { lookout } from '../schema';
import { databaseError } from '../../errors';
import { db, maindb } from '../index';

import { createLogger } from '@/lib/logger';

const log = createLogger('db-lookouts');

export type LookoutStatus = (typeof lookout.$inferSelect)['status'];
const LOOKOUT_STATUSES: readonly LookoutStatus[] = ['active', 'paused', 'archived', 'running'];

function isLookoutStatus(value: string): value is LookoutStatus {
  return LOOKOUT_STATUSES.some((status) => status === value);
}

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

type LookoutChanges = Partial<
  Pick<
    typeof lookout.$inferInsert,
    'title' | 'prompt' | 'frequency' | 'cronSchedule' | 'timezone' | 'nextRunAt' | 'qstashScheduleId' | 'searchMode'
  >
> & { status?: LookoutStatus };

export async function updateLookout({ id, ...changes }: { id: string } & LookoutChanges) {
  try {
    // Drizzle leaves the columns of undefined fields untouched.
    const [updatedLookout] = await db
      .update(lookout)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(lookout.id, id))
      .returning();

    return updatedLookout;
  } catch (error) {
    throw databaseError('Failed to update lookout', error);
  }
}

/**
 * Marks a lookout running when its status is one of `from`, or when it has
 * been running for more than `staleAfterMs` (a run that died without
 * releasing it). Atomic, so two runs of one lookout never overlap. Returns
 * the status the run replaced, or null when the lookout can't run now.
 */
export async function claimLookoutRun({
  id,
  from,
  staleAfterMs,
}: {
  id: string;
  from: LookoutStatus[];
  staleAfterMs?: number;
}): Promise<LookoutStatus | null> {
  try {
    // Timestamps are stored as UTC without a zone, so `now()` is compared in UTC too.
    const stale =
      staleAfterMs === undefined
        ? sql`false`
        : sql`(previous.status = 'running' and ${lookout.updatedAt} < (now() at time zone 'utc') - make_interval(secs => ${staleAfterMs / 1000}))`;
    const result = await maindb.execute<{ status: string }>(sql`
      update ${lookout}
      set status = 'running', updated_at = (now() at time zone 'utc')
      from (select id, status from ${lookout} where id = ${id} for update) as previous
      where ${lookout.id} = previous.id
        and (previous.status in (${sql.join(
          from.map((status) => sql`${status}`),
          sql`, `,
        )}) or ${stale})
      returning previous.status
    `);
    const previous = result.rows[0]?.status;
    if (previous === undefined) return null;
    if (!isLookoutStatus(previous)) throw new Error(`Unknown lookout status: ${previous}`);
    return previous;
  } catch (error) {
    throw databaseError('Failed to claim lookout run', error);
  }
}

// Ends a run: the lookout leaves 'running' for `status`, unless something
// (a forced stop) already moved it.
export async function releaseLookoutRun({ id, status }: { id: string; status: LookoutStatus }) {
  try {
    await db
      .update(lookout)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(lookout.id, id), eq(lookout.status, 'running')));
  } catch (error) {
    throw databaseError('Failed to release lookout run', error);
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
