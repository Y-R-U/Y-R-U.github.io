const CACHE_NAME = 'corsairs-fate-v2';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/game.js',
    './js/utils.js',
    './js/input.js',
    './js/player.js',
    './js/combat.js',
    './js/enemies.js',
    './js/world.js',
    './js/trading.js',
    './js/upgrades.js',
    './js/story.js',
    './js/particles.js',
    './js/audio.js',
    './js/ui.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((cached) => {
            return cached || fetch(e.request).then((resp) => {
                if (resp.ok && e.request.method === 'GET') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return resp;
            }).catch(() => cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }));
        })
    );
});
