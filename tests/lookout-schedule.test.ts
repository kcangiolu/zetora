import { describe, it, expect } from 'vitest';

import { isStaleOnceRun, nextOnceRun, splitScheduleTime } from '@/lib/lookout/schedule';

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
