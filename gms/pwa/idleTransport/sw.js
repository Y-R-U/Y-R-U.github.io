// ============================================================
// Idle Transport Empire - Service Worker
// ============================================================

const CACHE = 'idle-transport-v1';
const CORE = [
    './', './index.html', './manifest.json',
    './js/utils.js', './js/config.js', './js/state.js',
    './js/economy.js', './js/audio.js', './js/scene.js',
    './js/events.js', './js/actions.js', './js/ui.js', './js/main.js',
    './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(names => Promise.all(
        names.filter(n => n !== CACHE).map(n => caches.delete(n))
    )));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);

    // CDN (Babylon.js) - network first, cache fallback
    if (url.hostname !== location.hostname) {
        e.respondWith(
            fetch(e.request).then(r => {
                const cl = r.clone();
                caches.open(CACHE).then(c => c.put(e.request, cl));
                return r;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Local assets - cache first, network fallback
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(r => {
                const cl = r.clone();
                caches.open(CACHE).then(c => c.put(e.request, cl));
                return r;
            });
        })
    );
});
