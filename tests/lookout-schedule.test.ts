import { describe, it, expect } from 'vitest';

import {
  isStaleOnceRun,
  nextCronRun,
  nextOnceRun,
  parseLookoutRunRequest,
  recurringCron,
  splitScheduleTime,
} from '@/lib/lookout/schedule';

describe('splitScheduleTime', () => {
  it('reads the weekly day the form appends to the time', () => {
    expect(splitScheduleTime('09:30:3')).toEqual({ time: '09:30', dayOfWeek: '3' });
  });

  it('leaves a plain time alone', () => {
    expect(splitScheduleTime('09:30')).toEqual({ time: '09:30' });
  });
});

describe('nextOnceRun', () => {
  it('runs at the time on the given date in the lookout timezone', () => {
    // 09:00 in Paris during summer time is 07:00 UTC.
    expect(nextOnceRun('09:00', 'Europe/Paris', '2026-07-15').toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('keeps the date in timezones far from UTC', () => {
    expect(nextOnceRun('00:30', 'Pacific/Kiritimati', '2026-07-15').toISOString()).toBe('2026-07-14T10:30:00.000Z');
    expect(nextOnceRun('23:30', 'Pacific/Pago_Pago', '2026-07-15').toISOString()).toBe('2026-07-16T10:30:00.000Z');
  });

  it('without a date, picks today when the time is still ahead in that timezone', () => {
    const now = new Date('2026-07-15T05:00:00Z'); // 07:00 in Paris
    expect(nextOnceRun('09:00', 'Europe/Paris', undefined, now).toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('without a date, moves to tomorrow once the time has passed in that timezone', () => {
    const now = new Date('2026-07-15T08:00:00Z'); // 10:00 in Paris
    expect(nextOnceRun('09:00', 'Europe/Paris', undefined, now).toISOString()).toBe('2026-07-16T07:00:00.000Z');
  });
});

describe('isStaleOnceRun', () => {
  const runAt = '2026-07-15T07:00:00.000Z';

  it("runs the job queued for the lookout's current time", () => {
    expect(isStaleOnceRun({ frequency: 'once', nextRunAt: new Date(runAt) }, runAt)).toBe(false);
  });

  it('drops a job left over from an earlier time', () => {
    expect(isStaleOnceRun({ frequency: 'once', nextRunAt: new Date('2026-07-16T07:00:00Z') }, runAt)).toBe(true);
  });

  it('drops a one-time job once the lookout is recurring', () => {
    expect(isStaleOnceRun({ frequency: 'daily', nextRunAt: new Date(runAt) }, runAt)).toBe(true);
  });

  it('runs recurring runs and manual tests, which carry no time', () => {
    expect(isStaleOnceRun({ frequency: 'daily', nextRunAt: new Date(runAt) }, undefined)).toBe(false);
    expect(isStaleOnceRun({ frequency: 'once', nextRunAt: new Date('2026-07-16T07:00:00Z') }, undefined)).toBe(false);
  });
});

describe('recurringCron', () => {
  it('prefixes each frequency with its timezone', () => {
    expect(recurringCron('daily', '09:30', 'Europe/Paris')).toBe('CRON_TZ=Europe/Paris 30 9 * * *');
    expect(recurringCron('weekly', '09:30', 'Europe/Paris', '3')).toBe('CRON_TZ=Europe/Paris 30 9 * * 3');
    expect(recurringCron('monthly', '09:30', 'UTC')).toBe('CRON_TZ=UTC 30 9 1 * *');
    expect(recurringCron('yearly', '09:30', 'UTC')).toBe('CRON_TZ=UTC 30 9 1 1 *');
  });

  it('runs a weekly lookout without a day on Sundays', () => {
    expect(recurringCron('weekly', '09:30', 'UTC')).toBe('CRON_TZ=UTC 30 9 * * 0');
  });
});

describe('nextCronRun', () => {
  it('reads the schedule on the lookout clock', () => {
    const now = new Date('2026-07-15T08:00:00Z'); // 10:00 in Paris, a Wednesday
    expect(nextCronRun('CRON_TZ=Europe/Paris 30 9 * * *', 'Europe/Paris', now).toISOString()).toBe(
      '2026-07-16T07:30:00.000Z',
    );
    expect(nextCronRun('CRON_TZ=Europe/Paris 0 11 * * 3', 'Europe/Paris', now).toISOString()).toBe(
      '2026-07-15T09:00:00.000Z',
    );
  });
});

describe('parseLookoutRunRequest', () => {
  it('reads a run request', () => {
    expect(parseLookoutRunRequest({ lookoutId: 'l-1', runAt: '2026-07-15T07:00:00.000Z' })).toEqual({
      lookoutId: 'l-1',
      runAt: '2026-07-15T07:00:00.000Z',
      manual: false,
    });
    expect(parseLookoutRunRequest({ lookoutId: 'l-1', manual: true })).toEqual({
      lookoutId: 'l-1',
      runAt: undefined,
      manual: true,
    });
  });

  it('rejects a payload that names no lookout', () => {
    expect(parseLookoutRunRequest(null)).toBeNull();
    expect(parseLookoutRunRequest({ lookoutId: 42 })).toBeNull();
    expect(parseLookoutRunRequest('l-1')).toBeNull();
  });
});
