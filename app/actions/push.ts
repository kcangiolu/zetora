'use server';

import { getCurrentUser } from './user';
import { createPushSubscription, deletePushSubscriptionByEndpoint } from '@/lib/db/queries';
import { sendPushToEndpoint } from '@/lib/push/send-push';
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

const TEST_PUSH_ERRORS = {
  not_configured: 'Push notifications are not configured on this deployment',
  not_found: 'This device is no longer registered. Turn notifications off and on again.',
  expired: 'This device dropped its subscription. Turn notifications off and on again.',
  failed: "The browser's push service rejected the notification. Please try again.",
} as const;

export async function sendTestPushAction(endpoint: string) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required' };
    }

    const result = await sendPushToEndpoint(user.id, endpoint, {
      title: 'Zetora',
      body: 'Test notification: push notifications work on this device.',
      url: '/settings',
    });
    if (result !== 'sent') {
      return { success: false as const, error: TEST_PUSH_ERRORS[result] };
    }
    return { success: true as const };
  } catch (error) {
    log.error('Failed to send test push notification:', error);
    return { success: false as const, error: 'Failed to send test notification' };
  }
}
