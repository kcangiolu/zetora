// How many lookouts a user may keep (archived ones aside), and how many of
// them may run daily. Enforced by the server actions, shown by the UI.
export const LOOKOUT_LIMITS = {
  TOTAL_LOOKOUTS: 30,
  DAILY_LOOKOUTS: 20,
} as const;
