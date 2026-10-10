const CACHE_NAME = 'snakeio-v10';
const NET_TIMEOUT_MS = 3000;
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
    './js/net.js',
    './js/netgame.js',
    './js/rooms.js',
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
    // The room server's stats live under our path but must never be cached.
    if (url.pathname.startsWith(SCOPE_PATH + 'net/')) return false;
    return url.pathname.startsWith(SCOPE_PATH);
}

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache =>
        cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            // Older versions cached every ?room=… and ?test… URL they saw.
            .then(() => caches.open(CACHE_NAME))
            .then(cache => cache.keys().then(reqs =>
                Promise.all(reqs.filter(r => new URL(r.url).search).map(r => cache.delete(r)))))
    );
    self.clients.claim();
});

// Network first, so a deploy reaches the very next load — but never wait on a
// network that accepts and then says nothing (lie-fi): after a few seconds the
// cached copy is served, and the network answer still refreshes the cache.
self.addEventListener('fetch', e => {
    if (!isOurs(e.request)) return;   // let the network handle everything else
    const url = new URL(e.request.url);
    const nav = e.request.mode === 'navigate';
    // A share link is index.html with a query; it must open offline too, and
    // must not leave one cache entry per room code behind.
    const key = url.search ? url.origin + url.pathname : e.request;

    let stored = null;
    const network = fetch(nav || url.search ? url.href : e.request, { cache: 'no-cache', credentials: 'same-origin' })
        .then(response => {
            if (response && response.status === 200 && response.type === 'basic') {
                const clone = response.clone();
                stored = caches.open(CACHE_NAME).then(cache => cache.put(key, clone)).catch(() => {});
            }
            return response;
        });
    e.waitUntil(network.then(() => stored, () => {}));
    const cached = () => caches.match(key).then(hit => hit || (nav ? caches.match('./index.html') : undefined));

    e.respondWith(new Promise(resolve => {
        let done = false;
        const settle = r => { if (!done && r) { done = true; resolve(r); } };
        const fallback = () => cached().then(hit => {
            if (hit) settle(hit);
            else network.then(settle, () => settle(new Response('Offline', { status: 503 })));
        });
        const timer = setTimeout(fallback, NET_TIMEOUT_MS);
        network.then(r => { clearTimeout(timer); settle(r); }, () => { clearTimeout(timer); fallback(); });
    }));
});
