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

// PWA app-icon badge: track the unread count in a Cache entry (the only
// storage shared between the SW and the page that doesn't require IDB
// boilerplate), and reflect it on the home-screen icon via the Badging
// API. iOS 16.4+ and recent Chrome/Edge on Android support
// navigator.setAppBadge for installed PWAs; older platforms no-op silently.
const STATE_CACHE = 'voeli-state';
const UNREAD_KEY = '/__voeli_unread__';

async function _readUnread(){
  try {
    const cache = await caches.open(STATE_CACHE);
    const res = await cache.match(UNREAD_KEY);
    if(!res) return 0;
    const n = parseInt(await res.text(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch(_){ return 0; }
}

async function _writeUnread(n){
  try {
    const cache = await caches.open(STATE_CACHE);
    await cache.put(UNREAD_KEY, new Response(String(n)));
  } catch(_){}
}

async function _bumpBadge(){
  const n = (await _readUnread()) + 1;
  await _writeUnread(n);
  try { if(self.navigator.setAppBadge) await self.navigator.setAppBadge(n); } catch(_){}
}

async function _clearBadge(){
  await _writeUnread(0);
  try { if(self.navigator.clearAppBadge) await self.navigator.clearAppBadge(); } catch(_){}
}

messaging.onBackgroundMessage(async (payload) => {
  const data = payload.data || {};
  const title = (payload.notification && payload.notification.title) || data.title || 'New message';
  const body  = (payload.notification && payload.notification.body)  || data.body  || '';
  await _bumpBadge();
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.roomId || 'voeli-msg',
    data: { url: data.url || '/', roomId: data.roomId || null }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(Promise.all([
    _clearBadge(),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin)) { w.focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  ]));
});

// The page tells us to clear when it gains visibility — we reset the
// stored count and the OS badge so they stay in sync with what the user
// has actually seen.
self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'clear-badge'){
    event.waitUntil(_clearBadge());
  }
});
