'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction, sendTestPushAction } from '@/app/actions';

// Uint8Array.from(...) types as Uint8Array<ArrayBufferLike> (its backing could in
// principle be a SharedArrayBuffer), which the DOM lib's stricter BufferSource type
// rejects — construct over an explicit ArrayBuffer instead so the type lines up with
// PushSubscriptionOptionsInit.applicationServerKey without a cast.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

// iOS only exposes PushManager to a home-screen web app (iOS 16.4+), so a Safari tab
// there needs an install hint rather than a flat "not supported". iPadOS reports a
// desktop Mac user agent, hence the touch-points check.
function isIOSBrowserTab(): boolean {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return isIOS && !window.matchMedia('(display-mode: standalone)').matches;
}

type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported';

function detectPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if ('serviceWorker' in navigator && 'PushManager' in window) return 'supported';
  return isIOSBrowserTab() ? 'ios-needs-install' : 'unsupported';
}

async function requestNotificationPermission(): Promise<void> {
  // A previously denied permission resolves to "denied" without showing any prompt, so
  // only the site settings can undo it.
  if (Notification.permission === 'denied') {
    throw new Error(
      "Notifications are blocked for this site. Allow them in your browser's site settings (the icon left of the address bar), then try again.",
    );
  }
  const permission = await Notification.requestPermission();
  if (permission === 'denied') {
    throw new Error(
      "Notification permission denied. Allow notifications in your browser's site settings to enable them.",
    );
  }
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted. Turn the switch on again and accept the prompt.');
  }
}

// Brave ships with its push service turned off, and subscribe() then fails with the same
// AbortError Chrome raises when its push service is unreachable — only the hint differs.
function pushServiceError(): Error {
  if ('brave' in navigator) {
    return new Error(
      'Brave blocks push notifications by default. Enable "Use Google services for push messaging" in brave://settings/privacy, then try again.',
    );
  }
  return new Error(
    "Your browser's push service couldn't be reached. Check that push messaging isn't disabled in your browser settings, then try again.",
  );
}

async function subscribeWithPushService(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw pushServiceError();
    throw error;
  }
}

// Opt-in Web Push subscription management for the Settings > Hermes tab's notification
// toggle. Never auto-prompts — subscribe() is only ever called from a user-initiated
// click, since a permission prompt on page load is exactly the kind of thing that gets a
// site's notification permission permanently denied.
export function usePushSubscription() {
  // Feature detection is a one-time read, not a subscription to something that changes —
  // a lazy initializer avoids the render-then-setState-in-effect cascade a `useEffect`
  // would cause here.
  const [support] = useState(detectPushSupport);
  const isSupported = support === 'supported';
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isSupported) {
      setIsLoading(false);
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(!!subscription))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Push notifications are not supported in this browser');
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      throw new Error('Push notifications are not configured on this deployment');
    }

    await requestNotificationPermission();

    const registration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await subscribeWithPushService(registration, publicKey);

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Browser returned an incomplete push subscription');
    }

    const result = await subscribeToPushAction({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    if (!result.success) throw new Error(result.error);

    setIsSubscribed(true);
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await unsubscribeFromPushAction(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setIsSubscribed(false);
  }, []);

  const sendTest = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      setIsSubscribed(false);
      throw new Error('This browser is no longer subscribed. Turn notifications on again.');
    }
    const result = await sendTestPushAction(subscription.endpoint);
    if (!result.success) throw new Error(result.error);
  }, []);

  return { support, isSupported, isSubscribed, isLoading, subscribe, unsubscribe, sendTest };
}
