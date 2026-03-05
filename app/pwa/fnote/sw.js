const CACHE_NAME = 'fnote-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/app.js',
  './js/store.js',
  './js/router.js',
  './js/home.js',
  './js/editor.js',
  './js/settings.js',
  './js/modal.js',
  './js/theme.js',
  './js/utils.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
