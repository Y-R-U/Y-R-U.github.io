const CACHE_NAME = 'dicey-v4';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/utils.js',
    './js/audio.js',
    './js/sprites.js',
    './js/board.js',
    './js/ui.js',
    './js/ai.js',
    './js/game.js',
    './js/app.js',
    './manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    // Don't cache music files - they may or may not exist
    if (e.request.url.includes('/music/')) {
        e.respondWith(fetch(e.request).catch(() => new Response('', { status: 404 })));
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            return cached || fetch(e.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            });
        }).catch(() => {
            if (e.request.destination === 'document') {
                return caches.match('./index.html');
            }
        })
    );
});
