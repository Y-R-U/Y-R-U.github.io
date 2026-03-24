const CACHE_NAME = 'corsairs-fate-v11';
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
    './js/kraken.js',
    './js/debug.js',
    './manifest.json',
    './assets/icon-192.svg',
    './assets/icon-512.svg'
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
    const url = new URL(e.request.url);

    // Navigation requests: network-first so updates propagate
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).then((resp) => {
                if (resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return resp;
            }).catch(() => caches.match(e.request).then((cached) =>
                cached || new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
            ))
        );
        return;
    }

    // Other requests: cache-first with network fallback
    e.respondWith(
        caches.match(e.request).then((cached) => {
            return cached || fetch(e.request).then((resp) => {
                if (resp.ok && e.request.method === 'GET') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return resp;
            }).catch(() => new Response('Offline', { status: 503, statusText: 'Service Unavailable' }));
        })
    );
});
