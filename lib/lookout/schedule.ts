import { CronExpressionParser } from 'cron-parser';

/** What the scheduler hands over to run a lookout. */
export interface LookoutRunRequest {
  lookoutId: string;
  /** The time a one-time run was queued for (see isStaleOnceRun). */
  runAt?: string;
  /** Started from "Test" rather than by the schedule. */
  manual?: boolean;
}

/** Reads a run request from a scheduler's payload; null when it names no lookout. */
export function parseLookoutRunRequest(value: unknown): LookoutRunRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('lookoutId' in value) || typeof value.lookoutId !== 'string') return null;
  return {
    lookoutId: value.lookoutId,
    runAt: 'runAt' in value && typeof value.runAt === 'string' ? value.runAt : undefined,
    manual: 'manual' in value && value.manual === true,
  };
}

const LOOKOUT_FREQUENCIES = ['once', 'daily', 'weekly', 'monthly', 'yearly'] as const;
export type LookoutFrequency = (typeof LOOKOUT_FREQUENCIES)[number];

export function isLookoutFrequency(value: unknown): value is LookoutFrequency {
  return LOOKOUT_FREQUENCIES.some((frequency) => frequency === value);
}

/**
 * The form sends a weekly lookout's day inside its time ("HH:MM:D", D = 0 for
 * Sunday). Splits it back into the clock time and the day.
 */
export function splitScheduleTime(time: string): { time: string; dayOfWeek?: string } {
  const [hours, minutes, dayOfWeek] = time.split(':');
  return dayOfWeek === undefined ? { time } : { time: `${hours}:${minutes}`, dayOfWeek };
}

/**
 * The cron schedule of a recurring lookout, prefixed with its timezone the
 * way QStash reads it ("CRON_TZ=Europe/Paris 0 9 * * *"). A weekly lookout
 * without a day runs on Sundays.
 */
export function recurringCron(
  frequency: Exclude<LookoutFrequency, 'once'>,
  time: string,
  timezone: string,
  dayOfWeek = '0',
): string {
  const [hours, minutes] = time.split(':').map(Number);
  const fields = {
    daily: `${minutes} ${hours} * * *`,
    weekly: `${minutes} ${hours} * * ${dayOfWeek}`,
    monthly: `${minutes} ${hours} 1 * *`,
    yearly: `${minutes} ${hours} 1 1 *`,
  }[frequency];
  return `CRON_TZ=${timezone} ${fields}`;
}

/** The next time a cron schedule from `recurringCron` fires after `now`. */
export function nextCronRun(cronSchedule: string, timezone: string, now: Date = new Date()): Date {
  const fields = cronSchedule.startsWith('CRON_TZ=') ? cronSchedule.slice(cronSchedule.indexOf(' ') + 1) : cronSchedule;
  return CronExpressionParser.parse(fields, { currentDate: now, tz: timezone }).next().toDate();
}

/**
 * When a one-time lookout runs: `time` ("HH:MM") on the clock of `timezone`,
 * on `date` ("yyyy-MM-dd") when given, otherwise the next time that clock
 * reads `time`. Computed in the lookout's timezone, not the server's.
 */
export function nextOnceRun(time: string, timezone: string, date?: string, now: Date = new Date()): Date {
  const [hours, minutes] = time.split(':').map(Number);

  if (!date) {
    return CronExpressionParser.parse(`${minutes} ${hours} * * *`, { currentDate: now, tz: timezone }).next().toDate();
  }

  const [, month, day] = date.split('-').map(Number);
  // Midnight of `date` in any timezone is at most 14 hours before midnight
  // UTC, so starting a day earlier lands on that date and not the next year's.
  const dayBefore = new Date(`${date}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  return CronExpressionParser.parse(`${minutes} ${hours} ${day} ${month} *`, { currentDate: dayBefore, tz: timezone })
    .next()
    .toDate();
}

/**
 * Whether a run request is a one-time job the lookout no longer has. A
 * one-time job names the time it was queued for (`runAt`); an edit can't
 * recall it, so it is stale once the lookout is recurring or runs at another
 * time. Recurring runs and manual tests carry no `runAt`.
 */
export function isStaleOnceRun(lookout: { frequency: string; nextRunAt: Date }, runAt: unknown): boolean {
  if (typeof runAt !== 'string') return false;
  return lookout.frequency !== 'once' || lookout.nextRunAt.getTime() !== new Date(runAt).getTime();
}
