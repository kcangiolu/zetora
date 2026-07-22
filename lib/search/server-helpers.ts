import 'server-only';

import { getMessageCountByUserId } from '@/lib/db/queries';
import { createMessageCountKey, usageCountCache } from '@/lib/performance-cache';
import { getLightweightUserAuth } from '@/lib/user-data-server';

export async function getLightweightUser() {
  return getLightweightUserAuth();
}

export async function getMessageCountByUserIdAction(userId: string): Promise<{ messageCount: number }> {
  const messageCacheKey = createMessageCountKey(userId);
  const cached = usageCountCache.get(messageCacheKey);
  if (cached !== null) {
    return { messageCount: cached };
  }

  const { messageCount } = await getMessageCountByUserId({ userId });
  usageCountCache.set(messageCacheKey, messageCount);
  return { messageCount };
}
