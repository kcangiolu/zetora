'use server';

import { getCurrentUser } from './user';

import { serverEnv } from '@/env/server';
import { UIMessage, generateText, Output } from 'ai';
import type { ModelMessage } from 'ai';
import {
  createLookout,
  getLookoutsByUserId,
  getLookoutById,
  updateLookout,
  updateLookoutStatus,
  deleteLookout,
} from '@/lib/db/queries';
import { db, maindb } from '@/lib/db';
import { chat, message, buildSession, type User } from '@/lib/db/schema';
import { eq, desc, ilike, and, asc, inArray, notExists } from 'drizzle-orm';
import { Client } from '@upstash/qstash';
import {
  createBullMqSchedule,
  scheduleBullMqOnce,
  deleteBullMqSchedule,
  pauseBullMqSchedule,
  resumeBullMqSchedule,
  getLockoutProvider,
} from '@/lib/services/bullmq';
import type { CharacterAlignmentResponseModel } from '@elevenlabs/elevenlabs-js/api/types/CharacterAlignmentResponseModel';
import { CronExpressionParser } from 'cron-parser';
import { getCachedUserPreferencesByUserId } from '@/lib/user-data-server';
import {
  createConnection,
  listUserConnections,
  deleteConnection,
  manualSync,
  getSyncStatus,
  type ConnectorProvider,
} from '@/lib/connectors';
import { lookoutCallbackHeaders, lookoutQstashHeaders } from '@/lib/lookout-auth';
import { saveChat, saveMessages } from '@/lib/db/queries';
import { all, allSettled } from 'better-all';

import { createLogger } from '@/lib/logger';

const log = createLogger('actions-lookouts');

// Initialize QStash client
const qstash = new Client({ token: serverEnv.QSTASH_TOKEN });

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

// Helper function to calculate next run for 'once' frequency
function calculateOnceNextRun(time: string, timezone: string, date?: string): Date {
  const [hours, minutes] = time.split(':').map(Number);

  if (date) {
    // If a specific date is provided, use it
    const targetDate = new Date(date);
    targetDate.setHours(hours, minutes, 0, 0);
    return targetDate;
  }

  // Otherwise, use today or tomorrow
  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, schedule for tomorrow
  if (targetDate <= now) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  return targetDate;
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
    let actualTime = time;
    let dayOfWeek: string | undefined;

    // Extract day of week for weekly frequency
    if (frequency === 'weekly' && time.includes(':')) {
      const parts = time.split(':');
      if (parts.length === 3) {
        actualTime = `${parts[0]}:${parts[1]}`;
        dayOfWeek = parts[2];
      }
    }

    if (frequency === 'once') {
      // For 'once', calculate the next run time without cron
      nextRunAt = calculateOnceNextRun(actualTime, timezone, date);
    } else {
      // Generate cron schedule for recurring frequencies
      cronSchedule = frequencyToCron(frequency, actualTime, timezone, dayOfWeek);
      nextRunAt = calculateNextRun(cronSchedule, timezone);
    }

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

    // Determine scheduling provider from user preferences
    const userPrefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
    const schedulingProvider = getLockoutProvider(userPrefs?.preferences ?? undefined);
    log.debug(`📝 Created lookout in database: ${lookout.id} — scheduling with ${schedulingProvider}`);

    // Small delay to ensure database transaction is committed
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lookoutEndpoint = resolveLookoutEndpoint();

    const lookoutBody = { lookoutId: lookout.id, prompt, userId: user.id };

    // Create schedule for all frequencies (recurring and once)
    if (lookout.id) {
      try {
        if (frequency === 'once') {
          const delay = Math.floor((nextRunAt.getTime() - Date.now()) / 1000); // seconds
          const minimumDelay = Math.max(delay, 5);

          if (delay <= 0) {
            throw new Error('Cannot schedule for a time in the past');
          }

          if (schedulingProvider === 'bullmq') {
            log.debug('⏰ [BullMQ] Creating one-time job for lookout:', lookout.id);
            await scheduleBullMqOnce({
              destination: lookoutEndpoint,
              body: lookoutBody,
              headers: { 'Content-Type': 'application/json', ...lookoutCallbackHeaders() },
              delayMs: minimumDelay * 1000,
            });
            log.debug('✅ [BullMQ] One-time job queued for lookout:', lookout.id, 'delay:', minimumDelay, 's');
          } else {
            log.debug('⏰ Creating QStash one-time execution for lookout:', lookout.id);
            log.debug('📅 Scheduled time:', nextRunAt.toISOString());
            await qstash.publish({
              url: lookoutEndpoint,
              body: JSON.stringify(lookoutBody),
              headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
              delay: minimumDelay,
            });
            log.debug('✅ QStash one-time execution scheduled for lookout:', lookout.id, 'delay:', minimumDelay, 's');
          }
          // No scheduleId stored for one-time executions (both providers)
        } else {
          log.debug(`⏰ [${schedulingProvider}] Creating recurring schedule for lookout:`, lookout.id);
          log.debug('📅 Cron schedule with timezone:', cronSchedule);

          let scheduleId: string;

          if (schedulingProvider === 'bullmq') {
            const result = await createBullMqSchedule({
              scheduleId: lookout.id,
              destination: lookoutEndpoint,
              cron: cronSchedule,
              body: lookoutBody,
              headers: { 'Content-Type': 'application/json', ...lookoutCallbackHeaders() },
            });
            scheduleId = result.scheduleId;
          } else {
            const scheduleResponse = await qstash.schedules.create({
              destination: lookoutEndpoint,
              method: 'POST',
              cron: cronSchedule,
              body: JSON.stringify(lookoutBody),
              headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
            });
            scheduleId = scheduleResponse.scheduleId;
          }

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
      const userPrefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
      const schedulingProvider = getLockoutProvider(userPrefs?.preferences ?? undefined);
      try {
        if (status === 'paused') {
          if (schedulingProvider === 'bullmq') {
            await pauseBullMqSchedule(lookout.qstashScheduleId);
          } else {
            await qstash.schedules.pause({ schedule: lookout.qstashScheduleId });
          }
        } else if (status === 'active') {
          if (schedulingProvider === 'bullmq') {
            await resumeBullMqSchedule(lookout.qstashScheduleId);
          } else {
            await qstash.schedules.resume({ schedule: lookout.qstashScheduleId });
          }
          // Update next run time when resuming
          if (lookout.cronSchedule) {
            const nextRunAt = calculateNextRun(lookout.cronSchedule, lookout.timezone);
            await updateLookout({ id, nextRunAt });
          }
        } else if (status === 'archived') {
          if (schedulingProvider === 'bullmq') {
            await deleteBullMqSchedule(lookout.qstashScheduleId);
          } else {
            await qstash.schedules.delete(lookout.qstashScheduleId);
          }
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
  dayOfWeek,
  searchMode,
}: {
  id: string;
  title: string;
  prompt: string;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  time: string;
  timezone: string;
  dayOfWeek?: string;
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

    // Handle weekly day selection
    let adjustedTime = time;
    if (frequency === 'weekly' && dayOfWeek) {
      adjustedTime = `${time}:${dayOfWeek}`;
    }

    // Generate new cron schedule if frequency changed
    let cronSchedule = '';
    let nextRunAt: Date;

    if (frequency === 'once') {
      // For 'once', set next run to today/tomorrow at specified time
      const [hours, minutes] = time.split(':').map(Number);
      const now = new Date();
      nextRunAt = new Date(now);
      nextRunAt.setHours(hours, minutes, 0, 0);

      if (nextRunAt <= now) {
        nextRunAt.setDate(nextRunAt.getDate() + 1);
      }
    } else {
      cronSchedule = frequencyToCron(frequency, time, timezone, dayOfWeek);
      nextRunAt = calculateNextRun(cronSchedule, timezone);
    }

    // Update QStash schedule if it exists and frequency/time changed
    if (lookout.qstashScheduleId && frequency !== 'once') {
      const userPrefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
      const schedulingProvider = getLockoutProvider(userPrefs?.preferences ?? undefined);
      try {
        log.debug(`⏰ [${schedulingProvider}] Recreating schedule for lookout:`, id);
        log.debug('📅 Updated cron schedule with timezone:', cronSchedule);

        const lookoutEndpoint = resolveLookoutEndpoint();

        let newScheduleId: string;

        if (schedulingProvider === 'bullmq') {
          // upsertJobScheduler replaces the existing scheduler atomically — no explicit delete needed
          const result = await createBullMqSchedule({
            scheduleId: lookout.qstashScheduleId,
            destination: lookoutEndpoint,
            cron: cronSchedule,
            body: { lookoutId: id, prompt: prompt.trim(), userId: user.id },
            headers: { 'Content-Type': 'application/json', ...lookoutCallbackHeaders() },
          });
          newScheduleId = result.scheduleId;
        } else {
          // QStash requires delete + recreate
          await qstash.schedules.delete(lookout.qstashScheduleId);
          const scheduleResponse = await qstash.schedules.create({
            destination: lookoutEndpoint,
            method: 'POST',
            cron: cronSchedule,
            body: JSON.stringify({ lookoutId: id, prompt: prompt.trim(), userId: user.id }),
            headers: { 'Content-Type': 'application/json', ...lookoutQstashHeaders() },
          });
          newScheduleId = scheduleResponse.scheduleId;
        }

        // Update database with new details
        const updatedLookout = await updateLookout({
          id,
          title: title.trim(),
          prompt: prompt.trim(),
          frequency,
          cronSchedule,
          timezone,
          nextRunAt,
          qstashScheduleId: newScheduleId,
          searchMode,
        });

        return { success: true, lookout: updatedLookout };
      } catch (scheduleError) {
        log.error(`Error updating ${schedulingProvider} schedule:`, scheduleError);
        throw new Error('Failed to update schedule. Please try again.');
      }
    } else {
      // Update database only
      const updatedLookout = await updateLookout({
        id,
        title: title.trim(),
        prompt: prompt.trim(),
        frequency,
        cronSchedule,
        timezone,
        nextRunAt,
        searchMode,
      });

      return { success: true, lookout: updatedLookout };
    }
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
      const userPrefs = await getCachedUserPreferencesByUserId(user.id).catch(() => null);
      const schedulingProvider = getLockoutProvider(userPrefs?.preferences ?? undefined);
      try {
        if (schedulingProvider === 'bullmq') {
          await deleteBullMqSchedule(lookout.qstashScheduleId);
        } else {
          await qstash.schedules.delete(lookout.qstashScheduleId);
        }
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

// Server action to get user's geolocation using Vercel
