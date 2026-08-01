const CACHE_NAME = 'snakeio-v8';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/config.js',
    './js/utils.js',
    './js/storage.js',
    './js/ladder.js',
    './js/snake.js',
    './js/world.js',
    './js/input.js',
    './js/camera.js',
    './js/collision.js',
    './js/ai.js',
    './js/particles.js',
    './js/upgrades.js',
    './js/renderer.js',
    './js/audio.js',
    './js/main.js',
    './js/cloud.js',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg'
];

// A service worker sees EVERY request its clients make, not just requests for
// files in its own scope. Left alone, this one would start caching
// /lib/auth/*.js and Firebase's own endpoints, and the player would be stuck
// running whatever version of the account layer happened to be cached the day
// they installed the PWA. Only ever handle our own directory.
const SCOPE_PATH = new URL('./', self.location).pathname;

function isOurs(request) {
    if (request.method !== 'GET') return false;
    let url;
    try { url = new URL(request.url); } catch (e) { return false; }
    if (url.origin !== self.location.origin) return false;
    return url.pathname.startsWith(SCOPE_PATH);
}

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
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
    if (!isOurs(e.request)) return;   // let the network handle everything else
    e.respondWith(
        caches.match(e.request).then(cached =>
            fetch(e.request)
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    }
                    return response;
                })
                .catch(() => cached || new Response('Offline', { status: 503 }))
        )
    );
});
