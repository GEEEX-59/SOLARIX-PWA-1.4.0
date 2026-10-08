const CACHE_NAME = 'solarix-pwa-v1.4.0';

// Critical local assets required for offline operation
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './calculadora_solar_pwa.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './icons/icon.svg'
];

// Optional external CDN assets (cached gracefully without failing SW install)
const OPTIONAL_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Installation event: Pre-cache local assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cache essential local files (must succeed)
      for (const asset of PRECACHE_ASSETS) {
        try {
          await cache.add(new Request(asset, { cache: 'reload' }));
        } catch (err) {
          console.warn('[SW] Could not precache local asset:', asset, err);
        }
      }

      // 2. Cache external/optional assets with fallback
      for (const url of OPTIONAL_ASSETS) {
        try {
          await cache.add(new Request(url, { mode: 'cors' }));
        } catch (err) {
          console.warn('[SW] Optional external asset unavailable during precache:', url);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activation event: Clean up previous cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting deprecated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first for fresh updates with instant Cache Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Exclude unsupported schemes (e.g., chrome-extension)
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached version immediately if available
      if (cachedResponse) {
        // In background, fetch fresh copy to keep cache updated (stale-while-revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
          })
          .catch(() => {
            // Network failed or offline - cached version already served
          });

        return cachedResponse;
      }

      // If not in cache, fetch from network and cache response
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Cache valid GET responses
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // If offline and requesting an HTML navigation, serve offline app shell
          if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html') || caches.match('./calculadora_solar_pwa.html') || caches.match('./');
          }
        });
    })
  );
});