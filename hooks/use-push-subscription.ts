'use client';

import { useCallback, useEffect, useState } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/app/actions';

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

// Opt-in Web Push subscription management for the Settings > Hermes tab's notification
// toggle. Never auto-prompts — subscribe() is only ever called from a user-initiated
// click, since a permission prompt on page load is exactly the kind of thing that gets a
// site's notification permission permanently denied.
export function usePushSubscription() {
  // Feature detection is a one-time read, not a subscription to something that changes —
  // a lazy initializer avoids the render-then-setState-in-effect cascade a `useEffect`
  // would cause here.
  const [isSupported] = useState(
    () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window,
  );
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

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

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

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe };
}
