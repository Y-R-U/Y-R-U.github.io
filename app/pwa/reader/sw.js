const VERSION = 'reader-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './icons/icon.svg',
  './js/app.js',
  './js/storage.js',
  './js/books.js',
  './js/tts.js',
  './js/player.js',
  './js/ui.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for same-origin + approved CDNs. Leave HF model/weight hosts alone —
// Transformers.js manages its own Cache Storage for those.
const CACHEABLE_CDN = /^https:\/\/(cdn\.jsdelivr\.net|esm\.sh)\//;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const cdnOk = CACHEABLE_CDN.test(req.url);
  if (!sameOrigin && !cdnOk) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (sameOrigin || cdnOk)) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
