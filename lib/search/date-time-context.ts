// The current date and time for the system prompt, in the user's time zone when the
// browser sent a valid one, else in UTC. Rebuilt for each request and placed last, so
// it never changes the cacheable prefix of the prompt.
export function buildDateTimeContext(timezone: string | null | undefined, now = new Date()): string {
  if (timezone) {
    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }).format(now);
      return `\n\nCurrent date and time: ${formatted} (${timezone}).`;
    } catch {
      // Not an IANA time zone: UTC below.
    }
  }
  return `\n\nCurrent date and time (UTC): ${now.toISOString()}.`;
}
