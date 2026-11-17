// Service worker for flash push notifications. It only shows pushes and opens them; it does not
// cache or intercept the page's requests.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'מבזק', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'מבזק', {
    body: data.body || '',
    tag: data.tag,
    data: { url: data.url || './' },
    icon: 'icon-180.png',
    badge: 'icon-180.png',
    lang: 'he',
    dir: 'rtl',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.openWindow(url));
});
