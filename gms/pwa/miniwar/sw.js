const CACHE_NAME = 'miniwar-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/sprites.js',
  './js/graphics.js',
  './js/units.js',
  './js/game.js',
  './js/ui.js',
  './js/audio.js',
  './js/app.js',
  './manifest.json'
];

// Kenney spritesheets (cached on first use)
const KENNEY_ROOT = '/gms/assets/kenney/2d';
const KENNEY_ASSETS = [
  `${KENNEY_ROOT}/cartography/spritesheet.png`,
  `${KENNEY_ROOT}/cartography/spritesheet.xml`,
  `${KENNEY_ROOT}/tanks/spritesheet.png`,
  `${KENNEY_ROOT}/tanks/spritesheet.xml`,
  `${KENNEY_ROOT}/scifi-rts/scifiRTS_spritesheet.png`,
  `${KENNEY_ROOT}/scifi-rts/scifiRTS_spritesheet.xml`,
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
    caches.match(e.request).then(r => {
      if (r) return r;
      return fetch(e.request).then(response => {
        // Cache Kenney assets on first fetch
        const url = e.request.url;
        if (url.includes('/gms/assets/kenney/') && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {});
    })
  );
});
