// Firebase Cloud Messaging Service Worker.
// Required filename and root path: Firebase auto-discovers it at
// /firebase-messaging-sw.js when registering the messaging client.
//
// Receives push notifications when the Voeli tab is closed or backgrounded
// and surfaces them as native OS notifications. Foreground messages are
// handled in index.html via onMessage().

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCmQ87ZzyniLlLIChxHm0NQTWb3iiH9KPo",
  authDomain: "voeli-prod.firebaseapp.com",
  databaseURL: "https://voeli-prod-default-rtdb.firebaseio.com",
  projectId: "voeli-prod",
  storageBucket: "voeli-prod.firebasestorage.app",
  messagingSenderId: "359587359920",
  appId: "1:359587359920:web:5929b372ee55f9389d5f75"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = (payload.notification && payload.notification.title) || data.title || 'New message';
  const body  = (payload.notification && payload.notification.body)  || data.body  || '';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.roomId || 'voeli-msg',
    data: { url: data.url || '/', roomId: data.roomId || null }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin)) { w.focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
