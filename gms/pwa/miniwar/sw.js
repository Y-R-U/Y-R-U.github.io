const CACHE_NAME = 'miniwar-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/graphics.js',
  './js/units.js',
  './js/game.js',
  './js/ui.js',
  './js/audio.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => {}))
  );
});
