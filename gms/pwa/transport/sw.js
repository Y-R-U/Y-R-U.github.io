// ============================================================
// Transport Empire - Service Worker
// ============================================================

const CACHE_NAME = 'transport-empire-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './js/utils.js',
    './js/config.js',
    './js/state.js',
    './js/economy.js',
    './js/audio.js',
    './js/scene.js',
    './js/events.js',
    './js/actions.js',
    './js/ui.js',
    './js/main.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Vehicle assets to cache after install
const VEHICLE_ASSETS = [
    './assets/vehicles/truck.glb',
    './assets/vehicles/van.glb',
    './assets/vehicles/delivery.glb',
    './assets/vehicles/delivery-flat.glb',
    './assets/vehicles/truck-flat.glb',
    './assets/vehicles/suv.glb',
    './assets/vehicles/ambulance.glb',
    './assets/vehicles/firetruck.glb'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and cross-origin CDN requests
    if (event.request.method !== 'GET') return;

    // For CDN resources (Babylon.js), use network-first
    if (url.hostname !== location.hostname) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For local assets, use cache-first
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, clone);
                });
                return response;
            });
        })
    );
});
