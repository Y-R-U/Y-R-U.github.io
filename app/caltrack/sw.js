/* caltrack service worker — offline shell + installable PWA.
   Works for both deployments (scope is wherever this file is served from):
     • API requests (/api/…) are never cached — always hit the network.
     • Page navigations are network-first (fresh after a deploy when online,
       cached shell when offline).
     • Other static assets are stale-while-revalidate.                        */
const VERSION = 'caltrack-v1';
const SHELL = [
  './', './index.html', './app.css', './app.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
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

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const fromNet = fetch(req)
        .then(res => { if (res && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || fromNet;
    })
  );
});
