// sw.js — Service worker with cache-first strategy
const CACHE_NAME = 'rcell-v1';

const PRECACHE = [
  './index.html',
  './manifest.json',
  './src/main.js',
  './src/game.js',
  './src/renderer.js',
  './src/utils/math.js',
  './src/utils/pool.js',
  './src/utils/storage.js',
  './src/entities/player.js',
  './src/entities/enemies.js',
  './src/entities/projectiles.js',
  './src/entities/pickups.js',
  './src/systems/collision.js',
  './src/systems/waves.js',
  './src/systems/xp.js',
  './src/systems/audio.js',
  './src/upgrades/ingame.js',
  './src/upgrades/meta.js',
  './src/upgrades/upgrade-ui.js',
  './src/ui/hud.js',
  './src/ui/screens.js',
  './src/ui/meta-screen.js',
  './src/data/enemies.json',
  './src/data/ingame-upgrades.json',
  './src/data/meta-upgrades.json',
  './assets/icons/icon.svg'
];

// Install: precache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first with network fallback
self.addEventListener('fetch', (event) => {
  // Only handle same-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache successful GET responses
        if (response.ok && event.request.method === 'GET') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      }).catch(() => {
        // Offline fallback: return index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
