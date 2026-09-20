'use server';

import { getCurrentUser } from './user';
import { createPushSubscription, deletePushSubscriptionByEndpoint } from '@/lib/db/queries';
import { createLogger } from '@/lib/logger';

const log = createLogger('actions-push');

export async function subscribeToPushAction(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required' };
    }

    await createPushSubscription({
      userId: user.id,
      endpoint: subscription.endpoint,
      p256dhKey: subscription.keys.p256dh,
      authKey: subscription.keys.auth,
      userAgent: null,
    });

    return { success: true as const };
  } catch (error) {
    log.error('Failed to save push subscription:', error);
    return { success: false as const, error: 'Failed to save subscription' };
  }
}

export async function unsubscribeFromPushAction(endpoint: string) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required' };
    }

    await deletePushSubscriptionByEndpoint({ userId: user.id, endpoint });
    return { success: true as const };
  } catch (error) {
    log.error('Failed to remove push subscription:', error);
    return { success: false as const, error: 'Failed to remove subscription' };
  }
}
