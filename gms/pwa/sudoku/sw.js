// sw.js
const CACHE = "sudoku-v2";

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      "/",                  // caches your index.html
      "./"                  // some hosts need both
    ]))
    .then(() => self.skipWaiting())
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
