import { CronExpressionParser } from 'cron-parser';

/**
 * The form sends a weekly lookout's day inside its time ("HH:MM:D", D = 0 for
 * Sunday). Splits it back into the clock time and the day.
 */
export function splitScheduleTime(time: string): { time: string; dayOfWeek?: string } {
  const [hours, minutes, dayOfWeek] = time.split(':');
  return dayOfWeek === undefined ? { time } : { time: `${hours}:${minutes}`, dayOfWeek };
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
