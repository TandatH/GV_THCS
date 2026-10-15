// Service Worker for Firebase Cloud Messaging
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Lắng nghe sự kiện Push ngầm khi tab web đã tắt
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (err) {
    payload = {
      notification: {
        title: 'Hệ thống Quản lý Giáo viên',
        body: event.data.text() || 'Bạn có thông báo mới.',
      },
    };
  }

  const notification = payload.notification || payload.data || {};
  const title = notification.title || 'Hệ thống Quản lý Giáo viên';
  const options = {
    body: notification.body || 'Bạn có thông báo mới từ nhà trường.',
    icon: notification.icon || '/logo.png',
    badge: '/icon.svg',
    tag: notification.tag || 'school-notification',
    data: {
      url: notification.click_action || payload.data?.url || '/teacher/notifications',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Xử lý khi người dùng nhấp vào thông báo ngoài màn hình
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/teacher/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
