const CACHE_NAME = 'orpg-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/game.css',
  '/js/main.js',
  '/js/config.js',
  '/js/engine.js',
  '/js/world.js',
  '/js/entities.js',
  '/js/systems.js',
  '/js/renderer.js',
  '/js/ui.js',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
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
});
