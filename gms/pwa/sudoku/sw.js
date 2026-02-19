// Service Worker for Sudoku PWA
// Strategy: Cache-first with background update (stale-while-revalidate)
// This ensures the app always works offline while still getting updates when online.

const CACHE_NAME = 'sudoku-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png'
];

// Install: cache all app shell files immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // Activate new SW immediately
  );
});

// Activate: clean up old caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim()) // Take control of all open pages
  );
});

// Fetch: serve from cache first, update cache in background
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        // Kick off a background network fetch regardless
        const networkFetch = fetch(event.request)
          .then(response => {
            // Cache valid responses for future offline use
            if (response && response.status === 200 && response.type !== 'opaque') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null); // Network failure is fine — we have cache

        // Return cached version immediately if available,
        // otherwise wait for network (first visit or uncached resource)
        return cached || networkFetch;
      })
    )
  );
});
