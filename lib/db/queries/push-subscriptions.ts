import 'server-only';

import { and, eq } from 'drizzle-orm';
import { pushSubscription } from '../schema';
import { ChatSDKError } from '../../errors';
import { maindb } from '../index';

export interface CreatePushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string | null;
}

export async function createPushSubscription(input: CreatePushSubscriptionInput) {
  try {
    const [created] = await maindb
      .insert(pushSubscription)
      .values({
        userId: input.userId,
        endpoint: input.endpoint,
        p256dhKey: input.p256dhKey,
        authKey: input.authKey,
        userAgent: input.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: {
          p256dhKey: input.p256dhKey,
          authKey: input.authKey,
          userAgent: input.userAgent ?? null,
          lastUsedAt: new Date(),
        },
      })
      .returning();
    return created;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save push subscription');
  }
}

export async function getPushSubscriptionsByUserId(userId: string) {
  try {
    return await maindb.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to fetch push subscriptions');
  }
}

export async function getPushSubscriptionByEndpoint({ userId, endpoint }: { userId: string; endpoint: string }) {
  try {
    const [subscription] = await maindb
      .select()
      .from(pushSubscription)
      .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
    return subscription ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to fetch push subscription');
  }
}

export async function deletePushSubscriptionByEndpoint({ userId, endpoint }: { userId: string; endpoint: string }) {
  try {
    const [deleted] = await maindb
      .delete(pushSubscription)
      .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
      .returning();
    return deleted ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete push subscription');
  }
}

export async function touchPushSubscriptionLastUsed(endpoint: string) {
  try {
    await maindb.update(pushSubscription).set({ lastUsedAt: new Date() }).where(eq(pushSubscription.endpoint, endpoint));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to update push subscription');
  }
}
