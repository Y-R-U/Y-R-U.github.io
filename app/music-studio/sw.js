/* Music Studio service worker — app shell only.
 * Network-first: online, the page always comes fresh from the server; the
 * cached copy is used only when the server can't be reached. Data and audio
 * live in IndexedDB (app.js), not here. */
const CACHE = 'music-shell-v2';
const SHELL = ['./', 'app.js', 'style.css', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function refreshShell() {
  const c = await caches.open(CACHE);
  await Promise.all(SHELL.map(u => fetch(u, { cache: 'no-store' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
}
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'refresh-shell') {
    e.waitUntil(refreshShell().then(() => e.ports[0] && e.ports[0].postMessage('ok')));
  }
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__')) return;  // app.js handles data
  const key = e.request.mode === 'navigate' ? './' : e.request;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 4000);
      // a navigate-mode Request can't be re-fetched with an init object (TypeError),
      // which silently served the cached page forever — fetch navigations by URL
      const r = await fetch(e.request.mode === 'navigate' ? url.pathname : e.request,
                            { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (r.ok) await c.put(key, r.clone());
      return r;
    } catch {
      return (await c.match(key)) || (await c.match('./')) || Response.error();
    }
  })());
});
