// Minimal Web Push service worker — currently only serves the Hermes relay channel's
// notifications (see lib/push/send-push.ts). Payload shape: { title, body, url? }.
self.addEventListener('push', (event) => {
  let payload = { title: 'Zetora', body: '' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'Zetora', body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Zetora', {
      body: payload.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
