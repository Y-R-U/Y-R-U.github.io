// Hash router. Routes: #/hub, #/map/1, #/squad, #/formation/m1_l1, #/battle, #/results, #/unit/u3,
// #/collection, #/recruit, #/hq, #/arena, #/events, #/settings, #/workshop
export function parseHash(hash = location.hash) {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [name = '', ...args] = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(hash.split('?')[1] || ''));
  return { name: name || 'hub', args, q, path: '/' + [name || 'hub', ...args].join('/') };
}

export function createRouter({ fallback = 'hub' } = {}) {
  const handlers = new Set();
  let current = null;
  let busy = Promise.resolve();
  let guard = null, internal = false;
  const router = {
    get current() { return current; },
    // guard(nextRoute) -> false blocks a history (Back/Forward) navigation: the URL is put back and nothing remounts.
    // Programmatic router.go() is never blocked. Used by the battle screen (QA Q16: Back must ask before retreating).
    setGuard(fn) { guard = fn || null; return () => { if (guard === fn) guard = null; }; },
    go(path, { replace = false } = {}) {
      const h = '#' + (path.startsWith('/') ? path : '/' + path);
      if (location.hash === h) { router.reload(); return; }
      if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
      internal = true;
      fire();
      internal = false;
      // pushState fires no event; tell listeners (js/audio route music) now instead of on their 250 ms hash poll.
      // Our own popstate handler sees the hash it just routed and ignores it.
      try { dispatchEvent(new PopStateEvent('popstate', { state: null })); } catch (e) { /* old browsers: the poll still catches it */ }
    },
    back(fallbackPath = '/' + fallback) {
      if (history.length > 1 && current?.from) history.back(); else router.go(fallbackPath, { replace: true });
    },
    reload() { fire(true); },
    on(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    start() {
      addEventListener('hashchange', () => fire());
      addEventListener('popstate', () => fire());
      if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', '#/' + fallback);
      fire(true);
    },
  };
  let lastHash = null;
  function fire(force = false) {
    if (!force && location.hash === lastHash) return;
    const r = parseHash();
    if (!internal && !force && guard && lastHash && guard(r) === false) {
      // pushState (not replaceState) also drops the forward entries, so Forward can't land somewhere stale afterwards
      history.pushState(null, '', lastHash);
      return;
    }
    lastHash = location.hash;
    r.from = current?.path || null;
    current = r;
    // route changes are serialised so a fast double-tap can't interleave mount/unmount
    busy = busy.then(async () => { for (const fn of handlers) await fn(r); }).catch((e) => console.error('[router]', e));
  }
  return router;
}
