var CACHE_NAME = 'khydro-v1';

var ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/ui.js',
    './js/store.js',
    './js/app.js',
    './icons/icon.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js'
];

self.addEventListener('install', function(e) {
    e.waitUntil(caches.open(CACHE_NAME).then(function(c) { return c.addAll(ASSETS); }));
    self.skipWaiting();
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(e) {
    // Bypass cache for API calls
    if (e.request.url.indexOf('/api/') !== -1) return;

    e.respondWith(
        caches.match(e.request).then(function(cached) {
            return cached || fetch(e.request);
        })
    );
});
