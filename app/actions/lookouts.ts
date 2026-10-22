'use server';

import { getCurrentUser } from './user';

import { serverEnv } from '@/env/server';
import {
  createLookout,
  getLookoutsByUserId,
  getLookoutById,
  updateLookout,
  deleteLookout,
  type LookoutStatus,
} from '@/lib/db/queries';
import { Client } from '@upstash/qstash';
import {
  createBullMqSchedule,
  scheduleBullMqOnce,
  deleteBullMqSchedule,
  getLookoutScheduler,
} from '@/lib/services/bullmq';
import { LOOKOUT_LIMITS } from '@/lib/lookout/limits';
import {
  nextCronRun,
  nextOnceRun,
  recurringCron,
  isLookoutFrequency,
  splitScheduleTime,
  type LookoutFrequency,
  type LookoutRunRequest,
} from '@/lib/lookout/schedule';
import { lookoutQstashHeaders } from '@/lib/lookout-auth';

import { createLogger } from '@/lib/logger';

const log = createLogger('actions-lookouts');

// The scheduler mirrors the database: an active recurring lookout has a
// schedule, a paused or archived one has none. A one-time lookout has a
// queued job instead, which can't be recalled, so every run checks the
// lookout's status and time before it starts (lib/lookout/run.ts).

type LookoutScheduler = ReturnType<typeof getLookoutScheduler>;

// Built on use: only a LOOKOUT_SCHEDULER=qstash instance has a token (checked
// by getLookoutScheduler before any call here).
function qstashClient() {
  return new Client({ token: serverEnv.QSTASH_TOKEN });
}

// QStash calls back over the internet: the public URL, or NGROK_URL to reach
// a local dev server.
function qstashCallbackUrl(): string {
  const variable = process.env.NODE_ENV === 'development' ? 'NGROK_URL' : 'NEXT_PUBLIC_APP_URL';
  const base = process.env[variable];
  if (!base) throw new Error(`Lookouts: LOOKOUT_SCHEDULER=qstash needs ${variable} for QStash to call back`);
  return base.replace(/\/$/, '') + '/api/lookout';
}

// Hands a run to the scheduler, to start after `delaySeconds`.
async function queueRun(scheduler: LookoutScheduler, request: LookoutRunRequest, delaySeconds: number) {
  if (scheduler === 'bullmq') {
    await scheduleBullMqOnce({ request, delayMs: delaySeconds * 1000 });
  } else {
    await qstashClient().publish({
      url: qstashCallbackUrl(),
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
      delay: delaySeconds,
    });
  }
}

// Queues a one-time lookout's run, carrying the time it was queued for so a
// run left over from an earlier time is skipped.
async function scheduleOnceRun(scheduler: LookoutScheduler, lookoutId: string, runAt: Date): Promise<void> {
  const delaySeconds = Math.floor((runAt.getTime() - Date.now()) / 1000);
  if (delaySeconds <= 0) {
    throw new Error('Cannot schedule for a time in the past');
  }
  await queueRun(scheduler, { lookoutId, runAt: runAt.toISOString() }, Math.max(delaySeconds, 5));
  log.debug(`✅ [${scheduler}] One-time run queued for lookout:`, lookoutId, 'at', runAt.toISOString());
}

// Creates or replaces a recurring lookout's schedule and returns its id.
async function scheduleRecurringRuns(
  scheduler: LookoutScheduler,
  lookoutId: string,
  cronSchedule: string,
  existingScheduleId: string | null,
): Promise<string> {
  if (scheduler === 'bullmq') {
    // upsertJobScheduler replaces a scheduler with the same id in place.
    const result = await createBullMqSchedule({ scheduleId: lookoutId, cron: cronSchedule, request: { lookoutId } });
    return result.scheduleId;
  }

  // A QStash schedule can't be edited: delete it and create a new one.
  if (existingScheduleId) {
    await qstashClient().schedules.delete(existingScheduleId);
  }
  const scheduleResponse = await qstashClient().schedules.create({
    destination: qstashCallbackUrl(),
    method: 'POST',
    cron: cronSchedule,
    body: JSON.stringify({ lookoutId } satisfies LookoutRunRequest),
    headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
  });
  return scheduleResponse.scheduleId;
}

// Removes a recurring schedule. A schedule left behind by a failure only
// fires runs that are skipped, since the lookout is no longer active.
async function removeRecurringRuns(scheduler: LookoutScheduler, scheduleId: string): Promise<void> {
  try {
    if (scheduler === 'bullmq') {
      await deleteBullMqSchedule(scheduleId);
    } else {
      await qstashClient().schedules.delete(scheduleId);
    }
  } catch (error) {
    log.error(`Error deleting ${scheduler} schedule ${scheduleId}:`, error);
  }
}

// A cron schedule and first run time from the form's fields. `time` is
// "HH:MM", or "HH:MM:D" for a weekly lookout (D = 0 for Sunday).
function computeSchedule(
  frequency: LookoutFrequency,
  time: string,
  timezone: string,
  date?: string,
): { cronSchedule: string; nextRunAt: Date } {
  // Server actions take any JSON: the type above is not checked at runtime.
  if (!isLookoutFrequency(frequency)) throw new Error(`Unknown frequency: ${String(frequency)}`);
  const { time: clockTime, dayOfWeek } = splitScheduleTime(time);
  if (frequency === 'once') {
    return { cronSchedule: '', nextRunAt: nextOnceRun(clockTime, timezone, date) };
  }
  const cronSchedule = recurringCron(frequency, clockTime, timezone, dayOfWeek);
  return { cronSchedule, nextRunAt: nextCronRun(cronSchedule, timezone) };
}

async function requireOwnLookout(id: string) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  const lookout = await getLookoutById({ id });
  if (!lookout || lookout.userId !== user.id) {
    throw new Error('Lookout not found or access denied');
  }
  return { user, lookout };
}

// Throws when one more lookout (`countsTowardTotal`), or one more active
// daily lookout, would go over LOOKOUT_LIMITS.
async function assertWithinLimits(
  userId: string,
  { frequency, countsTowardTotal, excludeId }: { frequency: string; countsTowardTotal: boolean; excludeId?: string },
) {
  const others = (await getLookoutsByUserId({ userId })).filter((lookout) => lookout.id !== excludeId);
  if (
    countsTowardTotal &&
    others.filter((lookout) => lookout.status !== 'archived').length >= LOOKOUT_LIMITS.TOTAL_LOOKOUTS
  ) {
    throw new Error(`You have reached the maximum limit of ${LOOKOUT_LIMITS.TOTAL_LOOKOUTS} lookouts`);
  }
  if (
    frequency === 'daily' &&
    others.filter(
      (lookout) => lookout.frequency === 'daily' && (lookout.status === 'active' || lookout.status === 'running'),
    ).length >= LOOKOUT_LIMITS.DAILY_LOOKOUTS
  ) {
    throw new Error(`You have reached the maximum limit of ${LOOKOUT_LIMITS.DAILY_LOOKOUTS} active daily lookouts`);
  }
}

const RUNNING_ERROR = 'Wait for the current run to finish, or stop it';

export async function createScheduledLookout({
  title,
  prompt,
  frequency,
  time,
  timezone = 'UTC',
  date,
  searchMode = 'extreme',
}: {
  title: string;
  prompt: string;
  frequency: LookoutFrequency;
  time: string; // Format: "HH:MM" or "HH:MM:dayOfWeek" for weekly
  timezone?: string;
  date?: string; // For 'once' frequency
  searchMode?: string; // Search mode: 'extreme', 'web', 'academic', etc.
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }
    await assertWithinLimits(user.id, { frequency, countsTowardTotal: true });

    const { cronSchedule, nextRunAt } = computeSchedule(frequency, time, timezone, date);
    if (frequency === 'once' && nextRunAt.getTime() <= Date.now()) {
      throw new Error('Cannot schedule for a time in the past');
    }

    // Checked before anything is saved: a lookout that can't be scheduled
    // would never run.
    const schedulingProvider = getLookoutScheduler();

    const lookout = await createLookout({
      userId: user.id,
      title,
      prompt,
      frequency,
      cronSchedule,
      timezone,
      nextRunAt,
      searchMode,
    });

    try {
      if (frequency === 'once') {
        await scheduleOnceRun(schedulingProvider, lookout.id, nextRunAt);
      } else {
        const scheduleId = await scheduleRecurringRuns(schedulingProvider, lookout.id, cronSchedule, null);
        await updateLookout({ id: lookout.id, qstashScheduleId: scheduleId });
        lookout.qstashScheduleId = scheduleId;
      }
    } catch (scheduleError) {
      log.error(`Error creating ${schedulingProvider} schedule:`, scheduleError);
      await deleteLookout({ id: lookout.id });
      throw new Error(
        `Failed to ${frequency === 'once' ? 'schedule one-time search' : 'create recurring schedule'}. Please try again.`,
      );
    }

    return { success: true, lookout };
  } catch (error) {
    log.error('Error creating scheduled lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function getUserLookouts() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    const lookouts = await getLookoutsByUserId({ userId: user.id });

    // The stored next run time is only refreshed by runs: compute it fresh.
    const updatedLookouts = lookouts.map((lookout) => {
      if (lookout.status === 'active' && lookout.cronSchedule && lookout.frequency !== 'once') {
        try {
          return { ...lookout, nextRunAt: nextCronRun(lookout.cronSchedule, lookout.timezone) };
        } catch (error) {
          log.error('Error calculating next run for lookout:', lookout.id, error);
          return lookout;
        }
      }
      return lookout;
    });

    return { success: true, lookouts: updatedLookouts };
  } catch (error) {
    log.error('Error getting user lookouts:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateLookoutStatusAction({
  id,
  status,
}: {
  id: string;
  status: Exclude<LookoutStatus, 'running'>;
}) {
  try {
    if (status !== 'active' && status !== 'paused' && status !== 'archived') {
      throw new Error(`Cannot set a lookout's status to ${String(status)}`);
    }
    const { user, lookout } = await requireOwnLookout(id);
    if (lookout.status === 'running') {
      throw new Error(RUNNING_ERROR);
    }
    if (lookout.status === status) {
      return { success: true, lookout };
    }

    const schedulingProvider = getLookoutScheduler();

    if (status !== 'active') {
      if (lookout.qstashScheduleId) {
        await removeRecurringRuns(schedulingProvider, lookout.qstashScheduleId);
      }
      const updatedLookout = await updateLookout({ id, status, qstashScheduleId: null });
      return { success: true, lookout: updatedLookout };
    }

    await assertWithinLimits(user.id, {
      frequency: lookout.frequency,
      countsTowardTotal: lookout.status === 'archived',
      excludeId: id,
    });

    if (lookout.frequency === 'once') {
      // Its queued run is still waiting when its time is ahead.
      if (lookout.nextRunAt.getTime() <= Date.now()) {
        throw new Error('This one-time lookout has already run: edit it to choose a new time');
      }
      const updatedLookout = await updateLookout({ id, status });
      return { success: true, lookout: updatedLookout };
    }

    let scheduleId: string;
    try {
      scheduleId = await scheduleRecurringRuns(schedulingProvider, id, lookout.cronSchedule, lookout.qstashScheduleId);
    } catch (scheduleError) {
      log.error(`Error resuming ${schedulingProvider} schedule:`, scheduleError);
      throw new Error('Failed to resume the schedule. Please try again.');
    }
    const updatedLookout = await updateLookout({
      id,
      status,
      qstashScheduleId: scheduleId,
      nextRunAt: nextCronRun(lookout.cronSchedule, lookout.timezone),
    });
    return { success: true, lookout: updatedLookout };
  } catch (error) {
    log.error('Error updating lookout status:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function forceStopLookoutAction({ id }: { id: string }) {
  try {
    const { lookout } = await requireOwnLookout(id);
    if (lookout.status !== 'running') {
      throw new Error('Lookout is not currently running');
    }

    // A run that died can't report back, so the lookout is unstuck here. The
    // status it had before the run is unknown: a recurring lookout comes back
    // active with its schedule in place, a one-time lookout active only while
    // its time is still ahead.
    if (lookout.frequency === 'once') {
      const status = lookout.nextRunAt.getTime() > Date.now() ? 'active' : 'paused';
      return { success: true, lookout: await updateLookout({ id, status }) };
    }
    const scheduleId = await scheduleRecurringRuns(
      getLookoutScheduler(),
      id,
      lookout.cronSchedule,
      lookout.qstashScheduleId,
    );
    const updatedLookout = await updateLookout({ id, status: 'active', qstashScheduleId: scheduleId });
    return { success: true, lookout: updatedLookout };
  } catch (error) {
    log.error('Error force stopping lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function updateLookoutAction({
  id,
  title,
  prompt,
  frequency,
  time,
  timezone,
  date,
  searchMode,
}: {
  id: string;
  title: string;
  prompt: string;
  frequency: LookoutFrequency;
  time: string; // Format: "HH:MM" or "HH:MM:dayOfWeek" for weekly
  timezone: string;
  date?: string; // For 'once' frequency
  searchMode?: string;
}) {
  try {
    const { user, lookout } = await requireOwnLookout(id);
    if (lookout.status === 'running') {
      throw new Error(RUNNING_ERROR);
    }

    const { cronSchedule, nextRunAt } = computeSchedule(frequency, time, timezone, date);

    // An edit keeps the status, except a one-time lookout that already ran:
    // giving it a new schedule makes it active again.
    const alreadyRan =
      lookout.frequency === 'once' && lookout.status === 'paused' && lookout.nextRunAt.getTime() <= Date.now();
    const status = alreadyRan ? 'active' : lookout.status;
    if (status === 'active' && frequency === 'daily') {
      await assertWithinLimits(user.id, { frequency, countsTowardTotal: false, excludeId: id });
    }

    // The job already queued for this exact time still stands: queuing another
    // would run the lookout twice.
    const keepsQueuedRun =
      frequency === 'once' && lookout.frequency === 'once' && lookout.nextRunAt.getTime() === nextRunAt.getTime();
    if (frequency === 'once' && !keepsQueuedRun && nextRunAt.getTime() <= Date.now()) {
      throw new Error('Cannot schedule for a time in the past');
    }

    const schedulingProvider = getLookoutScheduler();
    let scheduleId: string | null = null;
    try {
      if (frequency === 'once') {
        // Queued whatever the status: the run checks it when the time comes.
        if (!keepsQueuedRun) {
          await scheduleOnceRun(schedulingProvider, id, nextRunAt);
        }
        if (lookout.qstashScheduleId) {
          await removeRecurringRuns(schedulingProvider, lookout.qstashScheduleId);
        }
      } else if (status === 'active') {
        scheduleId = await scheduleRecurringRuns(schedulingProvider, id, cronSchedule, lookout.qstashScheduleId);
      } else if (lookout.qstashScheduleId) {
        await removeRecurringRuns(schedulingProvider, lookout.qstashScheduleId);
      }
    } catch (scheduleError) {
      log.error(`Error updating ${schedulingProvider} schedule:`, scheduleError);
      throw new Error('Failed to update schedule. Please try again.');
    }

    const updatedLookout = await updateLookout({
      id,
      title: title.trim(),
      prompt: prompt.trim(),
      frequency,
      cronSchedule,
      timezone,
      nextRunAt,
      qstashScheduleId: scheduleId,
      searchMode,
      status,
    });

    return { success: true, lookout: updatedLookout };
  } catch (error) {
    log.error('Error updating lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteLookoutAction({ id }: { id: string }) {
  try {
    const { lookout } = await requireOwnLookout(id);

    if (lookout.qstashScheduleId) {
      await removeRecurringRuns(getLookoutScheduler(), lookout.qstashScheduleId);
    }

    const deletedLookout = await deleteLookout({ id });
    return { success: true, lookout: deletedLookout };
  } catch (error) {
    log.error('Error deleting lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Runs a lookout now, through the scheduler like any run.
export async function testLookoutAction({ id }: { id: string }) {
  try {
    const { lookout } = await requireOwnLookout(id);

    if (lookout.status === 'archived' || lookout.status === 'running') {
      throw new Error(`Cannot test lookout with status: ${lookout.status}`);
    }

    await queueRun(getLookoutScheduler(), { lookoutId: lookout.id, manual: true }, 0);

    return { success: true, message: 'Lookout test started successfully' };
  } catch (error) {
    log.error('Error testing lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
