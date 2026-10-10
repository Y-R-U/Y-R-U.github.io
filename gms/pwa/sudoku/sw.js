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
// immutable in practice, are cache-first. "Network-first" gives the network 3s:
// a connection that accepts and never answers (captive wifi, a dying signal)
// otherwise hangs the page forever. Past that the cached copy is served while
// the fetch carries on and refreshes the cache for next time.

const CACHE_NAME = 'sudoku-v7';
const NETWORK_TIMEOUT = 3000;
// After one timeout the network is presumed bad for a while, so the rest of the
// page's files come straight from the cache instead of each waiting 3s in turn.
const SLOW_WINDOW = 15000;
let slowUntil = 0;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png',
  './js/engine.js',
  './js/audio.js',
  './js/panels.js',
  './js/game.js',
  './js/gen-worker.js',
  './js/boot-cloud.js',
  './music/tracks.json'
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

  // A navigation is stored under its bare URL: ?test, ?fbclid=… and friends are
  // all the same page, and keying on the query piles up a copy per link.
  const nav = req.mode === 'navigate';
  const key = nav ? url.origin + url.pathname : req;
  const cacheP = caches.open(CACHE_NAME);
  const network = fetch(req);
  event.waitUntil(network.then(res => {
    if (!res || !res.ok) return;
    const copy = res.clone();
    return cacheP.then(cache => cache.put(key, copy));
  }).catch(() => {}));

  event.respondWith((async () => {
    const cache = await cacheP;
    const cached = () => cache.match(key, { ignoreSearch: nav })
      .then(hit => hit || (nav ? cache.match('./index.html') : undefined));
    if (Date.now() < slowUntil) {
      const hit = await cached();
      if (hit) return hit;
    }
    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT, 'timeout'));
    const first = await Promise.race([network.catch(() => 'error'), timeout]);
    if (first !== 'timeout' && first !== 'error') { slowUntil = 0; return first; }
    if (first === 'timeout') slowUntil = Date.now() + SLOW_WINDOW;
    // Nothing cached: keep waiting on (or fail with) the network.
    return (await cached()) || network;
  })());
});
