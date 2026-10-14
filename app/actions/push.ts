'use server';

import { getCurrentUser } from './user';
import { createPushSubscription, deletePushSubscriptionByEndpoint } from '@/lib/db/queries';
import { sendPushToEndpoint } from '@/lib/push/send-push';
import { assertPublicHttpUrl } from '@/lib/net/public-url';
import { createLogger } from '@/lib/logger';
import { z } from 'zod';

const log = createLogger('actions-push');

// web-push later POSTs to the endpoint, so it must be a public https URL
// (a browser push service), never an address on the server's network.
const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith('https://').max(2048),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .max(256),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+={0,2}$/)
      .max(256),
  }),
});

export async function subscribeToPushAction(rawSubscription: unknown) {
  'use server';

  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false as const, error: 'Authentication required' };
    }

    const parsed = pushSubscriptionSchema.safeParse(rawSubscription);
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid push subscription' };
    }
    const subscription = parsed.data;
    try {
      await assertPublicHttpUrl(subscription.endpoint);
    } catch {
      return { success: false as const, error: 'Invalid push subscription' };
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
