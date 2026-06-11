/* Exercise Library — shared service worker for offline use.
   Caches the launcher + all three sub-apps + shared styles + program data + icons.
   Network-first for HTML, cache-first for static assets. */

const CACHE = 'exercise-library-v4';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './shared/styles.css',
  './hyrox/',
  './hyrox/index.html',
  './achilles/',
  './achilles/index.html',
  './athletic-af/',
  './athletic-af/index.html',
  './athletic-af/data.json',
  './hotel/',
  './hotel/index.html',
  './full-body-aesthetics/',
  './full-body-aesthetics/index.html',
  './full-body-aesthetics/data.json',
  './kb-shred/',
  './kb-shred/index.html',
  './kb-shred/data.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for HTML — fall back to cache when offline.
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, JSON, images, manifest).
  event.respondWith(
    caches.match(req).then((m) => {
      if (m) return m;
      return fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => m);
    })
  );
});
