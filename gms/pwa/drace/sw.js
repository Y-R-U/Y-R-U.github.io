const CACHE_NAME = 'drace-v1';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/game.js',
    './js/board.js',
    './js/player.js',
    './js/ai.js',
    './js/dice.js',
    './js/effects.js',
    './js/ui.js',
    './js/audio.js',
    './js/storage.js',
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
        caches.match(e.request).then(cached => {
            const fetched = fetch(e.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => cached);
            return cached || fetched;
        })
    );
});
