const CACHE_NAME = 'flappy-strike-v1';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/config.js',
    './js/audio.js',
    './js/input.js',
    './js/particles.js',
    './js/renderer.js',
    './js/player.js',
    './js/obstacles.js',
    './js/enemies.js',
    './js/powerups.js',
    './js/shop.js',
    './js/ui.js',
    './js/app.js',
    './manifest.json',
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
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
