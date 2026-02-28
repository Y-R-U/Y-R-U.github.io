const CACHE_NAME = 'crpg-v8';
const ASSETS = [
  './',
  './index.html',
  './help.html',
  './css/style.css',
  './js/main.js',
  './js/config.js',
  './js/state.js',
  './js/engine/pathfinder.js',
  './js/engine/renderer.js',
  './js/engine/input.js',
  './js/engine/particles.js',
  './js/engine/audio.js',
  './js/world/map.js',
  './js/world/dungeon.js',
  './js/world/spawner.js',
  './js/world/npc.js',
  './js/entities/player.js',
  './js/entities/enemy.js',
  './js/entities/combat.js',
  './js/entities/loot.js',
  './js/skills/skillEngine.js',
  './js/skills/tasks.js',
  './js/ui/hud.js',
  './js/ui/inventory.js',
  './js/ui/skillsPanel.js',
  './js/ui/dungeonEntry.js',
  './js/ui/lootPopup.js',
  './js/ui/menuNav.js',
  './js/tests/testRunner.js',
  './js/tests/test.skills.js',
  './js/tests/test.combat.js',
  './js/tests/test.dungeon.js',
  './js/tests/test.inventory.js',
  './js/tests/test.state.js',
  './js/tests/test.map.js',
  './assets/tiles.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
