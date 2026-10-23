import { serverEnv } from '@/env/server';

// How many lookouts a user may keep (archived ones aside), and how many of
// them may run daily. Enforced by the server actions, shown by the UI.
export interface LookoutLimits {
  total: number;
  daily: number;
}

export function getLookoutLimits(): LookoutLimits {
  return { total: serverEnv.ZETORA_LOOKOUT_LIMIT, daily: serverEnv.ZETORA_DAILY_LOOKOUT_LIMIT };
}
