import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { dodosubscription } from '../schema';
import { ChatSDKError } from '../../errors';
import { maindb } from '../index';
import { getDodoSubscriptions, setDodoSubscriptions } from '../../performance-cache';
import { encryptMcpCredentials, decryptMcpCredentials } from '@/lib/mcp/crypto';

type DodoSubscriptionRow = typeof dodosubscription.$inferSelect;

async function getCachedOrFreshDodoSubscriptions(userId: string) {
  const cachedSubscriptions = getDodoSubscriptions(userId);
  if (cachedSubscriptions) return cachedSubscriptions as DodoSubscriptionRow[];

  const subscriptions = await maindb
    .select()
    .from(dodosubscription)
    .where(eq(dodosubscription.userId, userId))
    .orderBy(desc(dodosubscription.createdAt));

  setDodoSubscriptions(userId, subscriptions);
  return subscriptions;
}

// Cache user lookups for the duration of the request

// Dodo Subscription CRUD operations
export async function getDodoSubscriptionsByUserId({ userId }: { userId: string }) {
  try {
    return await getCachedOrFreshDodoSubscriptions(userId);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get Dodo subscriptions by user id');
  }
}

// Lookout CRUD operations
