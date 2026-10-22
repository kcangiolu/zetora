import { dayOfWeekOptions } from '../constants';

// Helper functions for time conversion and formatting

const convertTo12Hour = (hour24: number): number => {
  if (hour24 === 0) return 12;
  if (hour24 > 12) return hour24 - 12;
  return hour24;
};

export const convertTo24Hour = (hour12: number, ampm: string): number => {
  if (ampm === 'AM') {
    return hour12 === 12 ? 0 : hour12;
  } else {
    return hour12 === 12 ? 12 : hour12 + 12;
  }
};

export const formatTime12Hour = (time24: string) => {
  const [hour, minute] = time24.split(':');
  const hour24 = parseInt(hour);
  const hour12 = convertTo12Hour(hour24);
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  return { hour12: hour12.toString(), minute, ampm };
};

export const formatNextRun = (date: Date | string, timezone: string, locale: string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dateObj);
};

export const formatFrequency = (frequency: string, time: string, dayOfWeek?: string): string => {
  // Convert time to 12-hour format for display
  const { hour12, minute, ampm } = formatTime12Hour(time);
  const displayTime = `${hour12}:${minute} ${ampm}`;

  switch (frequency) {
    case 'daily':
      return `Daily at ${displayTime}`;
    case 'weekly': {
      const day = dayOfWeekOptions.find((option) => option.value === (dayOfWeek ?? '0'))?.label ?? 'Sunday';
      return `${day}s at ${displayTime}`;
    }
    case 'monthly':
      return `Monthly on the 1st at ${displayTime}`;
    case 'once':
      return `Once at ${displayTime}`;
    default:
      return `${frequency} at ${displayTime}`;
  }
};

/** The date ("yyyy-MM-dd") and time ("HH:MM") a clock in `timezone` shows at `instant`. */
export function clockReading(timezone: string, instant: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Whether `date` ("yyyy-MM-dd") at `time` ("HH:MM") has passed on the clock of `timezone`. */
export function isTimeInPast(date: string, time: string, timezone: string, now: Date = new Date()): boolean {
  const clock = clockReading(timezone, now);
  return `${date} ${time}` <= `${clock.date} ${clock.time}`;
}
