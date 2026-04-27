// Service Worker for Sudoku PWA
// Strategy: Cache-first with background update (stale-while-revalidate)

const CACHE_NAME = 'sudoku-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png',
  './js/engine.js',
  './js/audio.js',
  './js/panels.js',
  './js/game.js'
];

// Install: cache all app shell files immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: serve from cache first, update cache in background
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const networkFetch = fetch(event.request)
          .then(response => {
            if (response && response.status === 200 && response.type !== 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        return cached || networkFetch;
      })
    )
  );
});
