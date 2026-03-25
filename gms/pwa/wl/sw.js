const CACHE = 'warlords-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/data/units.js',
  './js/data/factions.js',
  './js/game/tile.js',
  './js/game/player.js',
  './js/game/city.js',
  './js/game/hero.js',
  './js/game/army.js',
  './js/game/combat.js',
  './js/game/world.js',
  './js/game/turn.js',
  './js/engine/camera.js',
  './js/engine/input.js',
  './js/engine/renderer.js',
  './js/engine/state.js',
  './js/ai/ai.js',
  './js/ui/hud.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
