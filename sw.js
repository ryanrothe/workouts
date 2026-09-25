/* Exercise Library — shared service worker for offline use.
   v22 (2026-09-25): health system shell (Today, Library, Fuel), shared shell/fuel/library modules, self-hosted fonts.
   Caches the launcher + all three sub-apps + shared styles + program data + icons.
   Network-first for HTML, scripts, styles and program data (so a deploy never pairs a
   new page with an old shared/setlog.js); cache-first for images and the manifest. */

const CACHE = 'exercise-library-v23';
const PRECACHE = [
  './',
  './index.html',
  './library.html',
  './manifest.webmanifest',
  './shared/styles.css',
  './shared/app.css',
  './shared/setlog.js',
  './shared/shell.js',
  './shared/fuel.js',
  './shared/library.js',
  './shared/programs.js',
  './shared/fonts/archivo-latin.woff2',
  './shared/fonts/figtree-latin.woff2',
  './father-son/',
  './father-son/index.html',
  './tfm-1/',
  './tfm-1/index.html',
  './tfm-2/',
  './tfm-2/index.html',
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
  './ppl/',
  './ppl/index.html',
  './nutrition/',
  './nutrition/index.html',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // cache: 'reload' skips the browser's HTTP cache, so a deploy never precaches a stale copy.
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))).catch(() => {}))
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
  const isCode = /\.(js|css|json)$/.test(url.pathname);

  if (isHTML || isCode) {
    // Network-first for HTML and code — fall back to cache when offline. 'no-cache'
    // revalidates with the server (a cheap 304) instead of trusting the HTTP cache.
    const fresh = isHTML ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
    event.respondWith(
      fetch(fresh)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(req).then((m) => m || (isHTML ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // Cache-first for images and the manifest.
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
