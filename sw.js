// TaiwanRain Service Worker — Offline support + caching
const CACHE_NAME = 'taiwanrain-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Noto+Sans+TC:wght@400;500;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal: some CDN assets may fail in SW context
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first for CWA API, cache first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // CWA API calls — always network, no cache (live data)
  if (url.hostname === 'opendata.cwa.gov.tw') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', message: '離線模式：無法載入即時資料' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // OpenStreetMap tiles — cache with 7-day TTL
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open('taiwanrain-tiles').then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(resp => {
            cache.put(event.request, resp.clone());
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Static assets — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, resp.clone()));
        }
        return resp;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Push notifications
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || '台灣雨 — 即時天氣更新',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: '查看詳情' },
      { action: 'dismiss', title: '關閉' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '🌧️ 台灣雨提醒', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
  }
});
