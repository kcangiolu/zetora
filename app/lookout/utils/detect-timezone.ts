import { timezoneOptions } from '../constants';

// The browser's timezone, mapped to one of the selector's options.
export function detectTimezone(): string {
  try {
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Check if the detected timezone is in our options list
    const matchingOption = timezoneOptions.find((option) => option.value === systemTimezone);

    if (matchingOption) {
      return systemTimezone;
    } else {
      // Try to find a close match based on common patterns
      let fallbackTimezone = 'UTC';

      if (systemTimezone.includes('America/')) {
        if (
          systemTimezone.includes('New_York') ||
          systemTimezone.includes('Montreal') ||
          systemTimezone.includes('Toronto')
        ) {
          fallbackTimezone = 'America/New_York';
        } else if (systemTimezone.includes('Chicago') || systemTimezone.includes('Winnipeg')) {
          fallbackTimezone = 'America/Chicago';
        } else if (systemTimezone.includes('Denver') || systemTimezone.includes('Edmonton')) {
          fallbackTimezone = 'America/Denver';
        } else if (systemTimezone.includes('Los_Angeles') || systemTimezone.includes('Vancouver')) {
          fallbackTimezone = 'America/Los_Angeles';
        }
      } else if (systemTimezone.includes('Europe/')) {
        if (systemTimezone.includes('London')) {
          fallbackTimezone = 'Europe/London';
        } else if (
          systemTimezone.includes('Paris') ||
          systemTimezone.includes('Berlin') ||
          systemTimezone.includes('Rome')
        ) {
          fallbackTimezone = 'Europe/Paris';
        }
      } else if (systemTimezone.includes('Asia/')) {
        if (systemTimezone.includes('Tokyo')) {
          fallbackTimezone = 'Asia/Tokyo';
        } else if (systemTimezone.includes('Shanghai') || systemTimezone.includes('Beijing')) {
          fallbackTimezone = 'Asia/Shanghai';
        } else if (systemTimezone.includes('Singapore')) {
          fallbackTimezone = 'Asia/Singapore';
        } else if (systemTimezone.includes('Kolkata') || systemTimezone.includes('Mumbai')) {
          fallbackTimezone = 'Asia/Kolkata';
        }
      } else if (systemTimezone.includes('Australia/')) {
        if (systemTimezone.includes('Sydney') || systemTimezone.includes('Melbourne')) {
          fallbackTimezone = 'Australia/Sydney';
        } else if (systemTimezone.includes('Perth')) {
          fallbackTimezone = 'Australia/Perth';
        }
      }

      return fallbackTimezone;
    }
  } catch {
    return 'UTC';
  }
}
