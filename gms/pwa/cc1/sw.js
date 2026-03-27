var CACHE_NAME = 'bounce-merge-v1';
var ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/config.js',
    './js/audio.js',
    './js/ui.js',
    './js/engine.js',
    './js/renderer.js',
    './js/game.js',
    './manifest.json'
];

self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) { return cache.addAll(ASSETS); })
            .then(function() { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE_NAME; })
                    .map(function(k) { return caches.delete(k); })
            );
        }).then(function() { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function(e) {
    e.respondWith(
        caches.match(e.request).then(function(r) {
            return r || fetch(e.request);
        })
    );
});
