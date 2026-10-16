import { describe, it, expect } from 'vitest';

import { getChatIdFromPath } from '@/lib/chat-route';
import { formatClockDuration, formatHoursMinutes } from '@/lib/format';

describe('formatClockDuration', () => {
  it('formats under an hour as m:ss and from an hour as h:mm:ss', () => {
    expect(formatClockDuration(0)).toBe('0:00');
    expect(formatClockDuration(65.9)).toBe('1:05');
    expect(formatClockDuration(3725)).toBe('1:02:05');
  });
});

describe('formatHoursMinutes', () => {
  it('drops the hours under an hour', () => {
    expect(formatHoursMinutes(45)).toBe('45m');
    expect(formatHoursMinutes(125)).toBe('2h 5m');
  });
});

describe('getChatIdFromPath', () => {
  it('reads the id of a /search/<id> path only', () => {
    expect(getChatIdFromPath('/search/abc-123')).toBe('abc-123');
    expect(getChatIdFromPath('/search/undefined')).toBeNull();
    expect(getChatIdFromPath('/settings')).toBeNull();
    expect(getChatIdFromPath(null)).toBeNull();
  });
});
