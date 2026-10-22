import { describe, it, expect } from 'vitest';

import { clockReading, formatFrequency, isTimeInPast } from '@/app/lookout/utils/time-utils';

describe('clockReading', () => {
  it('reads the date and time on the clock of a timezone', () => {
    const instant = new Date('2026-07-15T22:30:00Z');
    expect(clockReading('Europe/Paris', instant)).toEqual({ date: '2026-07-16', time: '00:30' });
    expect(clockReading('America/New_York', instant)).toEqual({ date: '2026-07-15', time: '18:30' });
  });
});

describe('isTimeInPast', () => {
  const now = new Date('2026-07-15T08:00:00Z'); // 10:00 in Paris, 04:00 in New York

  it('compares on the lookout clock, not the browser one', () => {
    expect(isTimeInPast('2026-07-15', '09:00', 'Europe/Paris', now)).toBe(true);
    expect(isTimeInPast('2026-07-15', '09:00', 'America/New_York', now)).toBe(false);
  });

  it('treats a later date as ahead', () => {
    expect(isTimeInPast('2026-07-16', '00:00', 'Europe/Paris', now)).toBe(false);
  });
});

describe('formatFrequency', () => {
  it('names the weekly day', () => {
    expect(formatFrequency('weekly', '11:00', '1')).toBe('Mondays at 11:00 AM');
    expect(formatFrequency('weekly', '14:30')).toBe('Sundays at 2:30 PM');
  });
});
