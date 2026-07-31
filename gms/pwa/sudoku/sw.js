// Service Worker for Sudoku PWA
//
// A service worker sees every request its clients make, not just the ones for
// files under its scope. That matters here: the game loads the shared account
// layer from /lib/auth/ and Firebase then talks to googleapis.com, and serving
// any of that from a cache would mean stale auth code and replayed API reads.
// So anything outside this game's own directory is left alone entirely.
//
// Within the directory, code and markup are network-first — a deploy has to be
// able to reach players on their next load — while images and audio, which are
// immutable in practice, are cache-first.

const CACHE_NAME = 'sudoku-v6';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png',
  './js/engine.js',
  './js/audio.js',
  './js/panels.js',
  './js/game.js',
  './js/boot-cloud.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // One miss must not abandon the whole install.
      .then(cache => Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(err => console.warn('[sw] skipped', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

const CACHE_FIRST = /\.(?:png|jpe?g|gif|svg|webp|ico|mp3|ogg|wav|woff2?)$/i;

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Firebase, CDNs, …
  if (!url.href.startsWith(self.registration.scope)) return; // /lib/auth/, the hub

  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // Network-first for HTML/JS/JSON: fresh when online, still playable when not.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      fetch(req)
        .then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cache.match(req).then(hit =>
          hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined)))
    )
  );
});
