'use server';

import { getCurrentUser } from './user';

import { serverEnv } from '@/env/server';
import {
  createLookout,
  getLookoutsByUserId,
  getLookoutById,
  updateLookout,
  updateLookoutStatus,
  deleteLookout,
} from '@/lib/db/queries';
import { Client } from '@upstash/qstash';
import {
  createBullMqSchedule,
  scheduleBullMqOnce,
  deleteBullMqSchedule,
  pauseBullMqSchedule,
  resumeBullMqSchedule,
  getLookoutScheduler,
} from '@/lib/services/bullmq';
import { CronExpressionParser } from 'cron-parser';
import { nextOnceRun, splitScheduleTime } from '@/lib/lookout/schedule';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';

import { createLogger } from '@/lib/logger';

const log = createLogger('actions-lookouts');

// Built on use: only a LOOKOUT_SCHEDULER=qstash instance has a token (checked
// by getLookoutScheduler before any call here).
function qstashClient() {
  return new Client({ token: serverEnv.QSTASH_TOKEN });
}

// Callback URL the scheduler (QStash or the BullMQ worker) posts back to.
// NEXT_PUBLIC_APP_URL keeps self-hosted deployments working; NGROK_URL lets
// QStash reach a local dev server.
function resolveLookoutEndpoint(): string {
  const base =
    process.env.NODE_ENV === 'development'
      ? (process.env.NGROK_URL ?? 'http://localhost:3000')
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  return base.replace(/\/$/, '') + '/api/lookout';
}

// Helper function to convert frequency to cron schedule with timezone
function frequencyToCron(frequency: string, time: string, timezone: string, dayOfWeek?: string): string {
  const [hours, minutes] = time.split(':').map(Number);

  let cronExpression = '';
  switch (frequency) {
    case 'once':
      // For 'once', we'll handle it differently - no cron schedule needed
      return '';
    case 'daily':
      cronExpression = `${minutes} ${hours} * * *`;
      break;
    case 'weekly':
      // Use the day of week if provided, otherwise default to Sunday (0)
      const day = dayOfWeek || '0';
      cronExpression = `${minutes} ${hours} * * ${day}`;
      break;
    case 'monthly':
      // Run on the 1st of each month
      cronExpression = `${minutes} ${hours} 1 * *`;
      break;
    case 'yearly':
      // Run on January 1st
      cronExpression = `${minutes} ${hours} 1 1 *`;
      break;
    default:
      cronExpression = `${minutes} ${hours} * * *`; // Default to daily
  }

  // Prepend timezone to cron expression for QStash
  return `CRON_TZ=${timezone} ${cronExpression}`;
}

// Helper function to calculate next run time using cron-parser
function calculateNextRun(cronSchedule: string, timezone: string): Date {
  try {
    // Extract the actual cron expression from the timezone-prefixed format
    // Format: "CRON_TZ=timezone 0 9 * * *" -> "0 9 * * *"
    const actualCronExpression = cronSchedule.startsWith('CRON_TZ=')
      ? cronSchedule.split(' ').slice(1).join(' ')
      : cronSchedule;

    const options = {
      currentDate: new Date(),
      tz: timezone,
    };

    const interval = CronExpressionParser.parse(actualCronExpression, options);
    return interval.next().toDate();
  } catch (error) {
    log.error('Error parsing cron expression:', cronSchedule, error);
    // Fallback to simple calculation
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1);
    return nextRun;
  }
}

type LookoutScheduler = ReturnType<typeof getLookoutScheduler>;

// Queues a one-time lookout's run. Neither scheduler lets us recall the job
// later, so the body carries the time it was queued for: /api/lookout skips a
// job whose time no longer matches the lookout after an edit.
async function scheduleOnceRun(scheduler: LookoutScheduler, lookoutId: string, runAt: Date): Promise<void> {
  const delaySeconds = Math.floor((runAt.getTime() - Date.now()) / 1000);
  if (delaySeconds <= 0) {
    throw new Error('Cannot schedule for a time in the past');
  }
  const minimumDelay = Math.max(delaySeconds, 5);
  const destination = resolveLookoutEndpoint();
  const body = { lookoutId, runAt: runAt.toISOString() };

  if (scheduler === 'bullmq') {
    await scheduleBullMqOnce({
      destination,
      body,
      headers: { 'Content-Type': 'application/json', ...lookoutCallbackHeaders() },
      delayMs: minimumDelay * 1000,
    });
  } else {
    await qstashClient().publish({
      url: destination,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
      delay: minimumDelay,
    });
  }
  log.debug(`✅ [${scheduler}] One-time run queued for lookout:`, lookoutId, 'at', runAt.toISOString());
}

// Creates or replaces a recurring lookout's schedule and returns its id.
async function scheduleRecurringRuns(
  scheduler: LookoutScheduler,
  lookoutId: string,
  cronSchedule: string,
  existingScheduleId: string | null,
): Promise<string> {
  const destination = resolveLookoutEndpoint();
  const body = { lookoutId };

  if (scheduler === 'bullmq') {
    // upsertJobScheduler replaces a scheduler with the same id in place.
    const result = await createBullMqSchedule({
      scheduleId: existingScheduleId ?? lookoutId,
      destination,
      cron: cronSchedule,
      body,
      headers: { 'Content-Type': 'application/json', ...lookoutCallbackHeaders() },
    });
    return result.scheduleId;
  }

  // A QStash schedule can't be edited: delete it and create a new one.
  if (existingScheduleId) {
    await qstashClient().schedules.delete(existingScheduleId);
  }
  const scheduleResponse = await qstashClient().schedules.create({
    destination,
    method: 'POST',
    cron: cronSchedule,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
  });
  return scheduleResponse.scheduleId;
}

async function deleteRecurringRuns(scheduler: LookoutScheduler, scheduleId: string): Promise<void> {
  if (scheduler === 'bullmq') {
    await deleteBullMqSchedule(scheduleId);
  } else {
    await qstashClient().schedules.delete(scheduleId);
  }
}

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
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
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

    // Check lookout limits
    const existingLookouts = await getLookoutsByUserId({ userId: user.id });
    if (existingLookouts.length >= 10) {
      throw new Error('You have reached the maximum limit of 10 lookouts');
    }

    // Check daily lookout limit specifically
    if (frequency === 'daily') {
      const activeDailyLookouts = existingLookouts.filter(
        (lookout) => lookout.frequency === 'daily' && lookout.status === 'active',
      );
      if (activeDailyLookouts.length >= 5) {
        throw new Error('You have reached the maximum limit of 5 active daily lookouts');
      }
    }

    let cronSchedule = '';
    let nextRunAt: Date;
    const { time: clockTime, dayOfWeek } = splitScheduleTime(time);

    if (frequency === 'once') {
      // For 'once', calculate the next run time without cron
      nextRunAt = nextOnceRun(clockTime, timezone, date);
    } else {
      // Generate cron schedule for recurring frequencies
      cronSchedule = frequencyToCron(frequency, clockTime, timezone, dayOfWeek);
      nextRunAt = calculateNextRun(cronSchedule, timezone);
    }

    // Checked before anything is saved: a lookout that can't be scheduled
    // would never run.
    const schedulingProvider = getLookoutScheduler();

    // Create lookout in database first
    const lookout = await createLookout({
      userId: user.id,
      title,
      prompt,
      frequency,
      cronSchedule,
      timezone,
      nextRunAt,
      qstashScheduleId: undefined, // Will be updated if needed
      searchMode,
    });

    log.debug(`📝 Created lookout in database: ${lookout.id} — scheduling with ${schedulingProvider}`);

    // Small delay to ensure database transaction is committed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create schedule for all frequencies (recurring and once)
    if (lookout.id) {
      try {
        if (frequency === 'once') {
          // No scheduleId stored for one-time executions (both providers)
          await scheduleOnceRun(schedulingProvider, lookout.id, nextRunAt);
        } else {
          log.debug(`⏰ [${schedulingProvider}] Creating recurring schedule for lookout:`, lookout.id);
          log.debug('📅 Cron schedule with timezone:', cronSchedule);

          const scheduleId = await scheduleRecurringRuns(schedulingProvider, lookout.id, cronSchedule, null);

          log.debug(`✅ [${schedulingProvider}] Recurring schedule created: ${scheduleId} for lookout:`, lookout.id);

          await updateLookout({ id: lookout.id, qstashScheduleId: scheduleId });
          lookout.qstashScheduleId = scheduleId;
        }
      } catch (scheduleError) {
        log.error(`Error creating ${schedulingProvider} schedule:`, scheduleError);
        // Delete the lookout if scheduling fails
        await deleteLookout({ id: lookout.id });
        throw new Error(
          `Failed to ${frequency === 'once' ? 'schedule one-time search' : 'create recurring schedule'}. Please try again.`,
        );
      }
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

    // Update next run times for active lookouts
    const updatedLookouts = lookouts.map((lookout) => {
      if (lookout.status === 'active' && lookout.cronSchedule && lookout.frequency !== 'once') {
        try {
          const nextRunAt = calculateNextRun(lookout.cronSchedule, lookout.timezone);
          return { ...lookout, nextRunAt };
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
  status: 'active' | 'paused' | 'archived' | 'running';
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get lookout to verify ownership
    const lookout = await getLookoutById({ id });
    if (!lookout || lookout.userId !== user.id) {
      throw new Error('Lookout not found or access denied');
    }

    // Update schedule status if it exists
    if (lookout.qstashScheduleId) {
      const schedulingProvider = getLookoutScheduler();
      try {
        if (status === 'paused') {
          if (schedulingProvider === 'bullmq') {
            await pauseBullMqSchedule(lookout.qstashScheduleId);
          } else {
            await qstashClient().schedules.pause({ schedule: lookout.qstashScheduleId });
          }
        } else if (status === 'active') {
          if (schedulingProvider === 'bullmq') {
            await resumeBullMqSchedule(lookout.qstashScheduleId);
          } else {
            await qstashClient().schedules.resume({ schedule: lookout.qstashScheduleId });
          }
          // Update next run time when resuming
          if (lookout.cronSchedule) {
            const nextRunAt = calculateNextRun(lookout.cronSchedule, lookout.timezone);
            await updateLookout({ id, nextRunAt });
          }
        } else if (status === 'archived') {
          await deleteRecurringRuns(schedulingProvider, lookout.qstashScheduleId);
        }
      } catch (scheduleError) {
        log.error(`Error updating ${schedulingProvider} schedule:`, scheduleError);
        // Continue with database update even if scheduler call fails
      }
    }

    // Update database
    const updatedLookout = await updateLookoutStatus({ id, status });
    return { success: true, lookout: updatedLookout };
  } catch (error) {
    log.error('Error updating lookout status:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function forceStopLookoutAction({ id }: { id: string }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get lookout to verify ownership
    const lookout = await getLookoutById({ id });
    if (!lookout || lookout.userId !== user.id) {
      throw new Error('Lookout not found or access denied');
    }

    if (lookout.status !== 'running') {
      throw new Error('Lookout is not currently running');
    }

    // Stuck executions can't be aborted remotely (the serverless instance is
    // already gone), so unstick the lookout by resetting its status. One-time
    // lookouts go back to 'paused' (their normal post-run state), recurring
    // lookouts go back to 'active'.
    const resetStatus = lookout.frequency === 'once' ? 'paused' : 'active';
    const updatedLookout = await updateLookoutStatus({ id, status: resetStatus });

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
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  time: string; // Format: "HH:MM" or "HH:MM:dayOfWeek" for weekly
  timezone: string;
  date?: string; // For 'once' frequency
  searchMode?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get lookout to verify ownership
    const lookout = await getLookoutById({ id });
    if (!lookout || lookout.userId !== user.id) {
      throw new Error('Lookout not found or access denied');
    }

    // Check daily lookout limit if changing to daily frequency
    if (frequency === 'daily' && lookout.frequency !== 'daily') {
      const existingLookouts = await getLookoutsByUserId({ userId: user.id });
      const activeDailyLookouts = existingLookouts.filter(
        (existingLookout) =>
          existingLookout.frequency === 'daily' && existingLookout.status === 'active' && existingLookout.id !== id,
      );
      if (activeDailyLookouts.length >= 5) {
        throw new Error('You have reached the maximum limit of 5 active daily lookouts');
      }
    }

    // Generate new cron schedule if frequency changed
    let cronSchedule = '';
    let nextRunAt: Date;
    const { time: clockTime, dayOfWeek } = splitScheduleTime(time);

    if (frequency === 'once') {
      nextRunAt = nextOnceRun(clockTime, timezone, date);
    } else {
      cronSchedule = frequencyToCron(frequency, clockTime, timezone, dayOfWeek);
      nextRunAt = calculateNextRun(cronSchedule, timezone);
    }

    // The job already queued for this exact time still stands: queuing another
    // would run the lookout twice.
    const keepsQueuedRun =
      frequency === 'once' && lookout.frequency === 'once' && lookout.nextRunAt.getTime() === nextRunAt.getTime();
    if (frequency === 'once' && !keepsQueuedRun && nextRunAt.getTime() <= Date.now()) {
      throw new Error('Cannot schedule for a time in the past');
    }

    const schedulingProvider = getLookoutScheduler();
    let scheduleId: string | null;
    try {
      if (frequency === 'once') {
        if (!keepsQueuedRun) {
          await scheduleOnceRun(schedulingProvider, id, nextRunAt);
        }
        if (lookout.qstashScheduleId) {
          await deleteRecurringRuns(schedulingProvider, lookout.qstashScheduleId);
        }
        scheduleId = null;
      } else {
        log.debug(`⏰ [${schedulingProvider}] Scheduling lookout:`, id, 'with', cronSchedule);
        scheduleId = await scheduleRecurringRuns(schedulingProvider, id, cronSchedule, lookout.qstashScheduleId);
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
    });

    return { success: true, lookout: updatedLookout };
  } catch (error) {
    log.error('Error updating lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteLookoutAction({ id }: { id: string }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get lookout to verify ownership
    const lookout = await getLookoutById({ id });
    if (!lookout || lookout.userId !== user.id) {
      throw new Error('Lookout not found or access denied');
    }

    // Delete schedule if it exists
    if (lookout.qstashScheduleId) {
      const schedulingProvider = getLookoutScheduler();
      try {
        await deleteRecurringRuns(schedulingProvider, lookout.qstashScheduleId);
      } catch (error) {
        log.error(`Error deleting ${schedulingProvider} schedule:`, error);
        // Continue with database deletion even if scheduler call fails
      }
    }

    // Delete from database
    const deletedLookout = await deleteLookout({ id });
    return { success: true, lookout: deletedLookout };
  } catch (error) {
    log.error('Error deleting lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function testLookoutAction({ id }: { id: string }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('Authentication required');
    }

    // Get lookout to verify ownership
    const lookout = await getLookoutById({ id });
    if (!lookout || lookout.userId !== user.id) {
      throw new Error('Lookout not found or access denied');
    }

    // Only allow testing of active or paused lookouts
    if (lookout.status === 'archived' || lookout.status === 'running') {
      throw new Error(`Cannot test lookout with status: ${lookout.status}`);
    }

    // Make a POST request to the lookout API endpoint to trigger the run
    const lookoutUrl = resolveLookoutEndpoint();

    const response = await fetch(lookoutUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...lookoutCallbackHeaders(),
      },
      body: JSON.stringify({
        lookoutId: lookout.id,
        prompt: lookout.prompt,
        userId: user.id,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to trigger lookout test: ${response.statusText}`);
    }

    return { success: true, message: 'Lookout test started successfully' };
  } catch (error) {
    log.error('Error testing lookout:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
