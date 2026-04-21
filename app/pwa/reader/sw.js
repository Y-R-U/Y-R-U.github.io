const VERSION = 'reader-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
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

// Cache-first for same-origin + approved CDNs. HF weight hosts are included so
// the Kokoro model survives Cache Storage eviction of transformers.js's own cache.
const CACHEABLE_CDN = /^https:\/\/([a-z0-9-]+\.)*(jsdelivr\.net|esm\.sh|huggingface\.co|hf\.co)\//;

self.addEventListener('message', (e) => {
  if (e.data === 'clear-model-cache') {
    e.waitUntil((async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('transformers-')).map((n) => caches.delete(n)));
      const own = await caches.open(VERSION);
      const reqs = await own.keys();
      await Promise.all(reqs.filter((r) => /huggingface\.co|hf\.co/.test(r.url)).map((r) => own.delete(r)));
    })());
  }
});

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
