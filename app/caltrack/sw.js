/* caltrack service worker — offline shell + installable PWA.
   Network-first so an online device always gets the latest code; the cache is
   only an offline fallback. API requests are never cached. Bump VERSION on any
   change so browsers pick up the new worker and drop old caches.               */
const VERSION = 'caltrack-v3';
const SHELL = [
  './', './index.html', './app.css', './app.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // never touch writes
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // leave cross-origin alone
  if (url.pathname.includes('/api/')) return;             // API: straight to network

  // Network-first: fresh when online, cached shell when offline.
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(m => m || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
