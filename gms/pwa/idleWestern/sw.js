const CACHE_NAME = 'idle-western-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/gameData.js',
  './js/gameState.js',
  './js/effects.js',
  './js/events.js',
  './js/ui.js',
  './js/app.js',
  './js/story.js',
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
  // For video files, always go to network (don't cache large media)
  if (e.request.url.match(/\.(mp4|webm|ogg)$/)) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 404 })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
