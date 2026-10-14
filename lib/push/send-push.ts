import 'server-only';

import webpush from 'web-push';
import { serverEnv } from '@/env/server';
import {
  getPushSubscriptionsByUserId,
  getPushSubscriptionByEndpoint,
  deletePushSubscriptionByEndpoint,
  touchPushSubscriptionLastUsed,
} from '@/lib/db/queries';
import type { StoredPushSubscription } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('push');

let vapidConfigured = false;

// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY default to "placeholder" in env/server.ts (same
// pattern as every other optional credential there) — treat that as "push disabled on
// this deployment" rather than crashing.
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  if (serverEnv.VAPID_PUBLIC_KEY === 'placeholder' || serverEnv.VAPID_PRIVATE_KEY === 'placeholder') return false;
  webpush.setVapidDetails(serverEnv.VAPID_SUBJECT, serverEnv.VAPID_PUBLIC_KEY, serverEnv.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

type DeliveryResult = 'sent' | 'expired' | 'failed';

async function deliver(subscription: StoredPushSubscription, payload: PushPayload): Promise<DeliveryResult> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dhKey, auth: subscription.authKey },
      },
      JSON.stringify(payload),
    );
    await touchPushSubscriptionLastUsed(subscription.endpoint).catch(() => {});
    return 'sent';
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // The browser/OS dropped this subscription — prune it rather than retry forever.
      await deletePushSubscriptionByEndpoint({ userId: subscription.userId, endpoint: subscription.endpoint }).catch(
        () => {},
      );
      return 'expired';
    }
    log.error('Failed to send push notification:', error);
    return 'failed';
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const subscriptions = await getPushSubscriptionsByUserId(userId);
  await Promise.all(subscriptions.map((subscription) => deliver(subscription, payload)));
}

export type EndpointPushResult = DeliveryResult | 'not_configured' | 'not_found';

// Targets a single device, so a test from one browser doesn't ring every other device.
export async function sendPushToEndpoint(
  userId: string,
  endpoint: string,
  payload: PushPayload,
): Promise<EndpointPushResult> {
  if (!ensureVapidConfigured()) return 'not_configured';

  const subscription = await getPushSubscriptionByEndpoint({ userId, endpoint });
  if (!subscription) return 'not_found';
  return deliver(subscription, payload);
}
