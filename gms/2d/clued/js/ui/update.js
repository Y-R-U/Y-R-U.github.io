// Stale-deploy guard. No build step means a page left open across a deploy can import new modules next to the
// old ones it already holds; a failed or mixed lazy import used to make a tap silently do nothing.
import { BUILD } from '../build.js?v=202610100510';
import { h } from './kit.js?v=202610100510';

const G = globalThis.__cluedUpd || (globalThis.__cluedUpd = { armed: false, latest: null, reason: null });
const ROOT = new URL('../../', import.meta.url).href;
const quietScreens = new Set(['home']);

export function reloadFresh() {
  const q = new URLSearchParams(location.search);
  q.set('v', Date.now());
  location.replace(location.pathname + '?' + q);
}

const canReloadQuietly = () => quietScreens.has(document.body.dataset.screen) && !document.querySelector('#popups .pop')
  && !document.querySelector('#br8t-account')?.shadowRoot?.querySelector('.scrim');

export function showBanner(updated = true) {
  const old = document.querySelector('.upd-banner');
  if (old && (old.dataset.kind === 'upd' || !updated)) return;
  old?.remove();
  document.body.append(h('button.upd-banner', { type: 'button', dataset: { kind: updated ? 'upd' : 'err' }, onclick: reloadFresh },
    h('b', {}, updated ? 'Clued has been updated' : 'Couldn’t load that part of Clued'), h('span', {}, 'Tap to refresh')));
}

// A newer build exists (or this page is already running a mix of two builds).
export function updateAvailable(reason, { quiet = false } = {}) {
  G.reason = G.reason || reason;
  if (quiet && canReloadQuietly()) return reloadFresh();
  showBanner(true);
}

export async function checkVersion({ quiet = false } = {}) {
  try {
    const r = await fetch(new URL(`../build.js?t=${Date.now()}`, import.meta.url), { cache: 'no-store' });
    const v = r.ok && (await r.text()).match(/BUILD = '([^']+)'/)?.[1];
    if (!v) return null;
    G.latest = v;
    if (v !== BUILD) updateAvailable('server', { quiet });
    return v;
  } catch (e) { return null; }
}

// Our own js/css requested with another build's ?v= means a second copy of the shell is in play.
function foreignBuild(name) {
  if (!name.startsWith(ROOT) || name.includes('/vendor/')) return null;
  const m = /^[^?#]*\.(?:js|css)\?(?:[^#]*&)?v=([^&#]+)/.exec(name.slice(ROOT.length));
  return m && m[1] !== BUILD ? m[1] : null;
}

const isLoadError = e => /dynamically imported module|Importing a module script failed|error loading dynamically|module script/i.test(String(e?.message || e));

const recovered = m => (document.querySelector('.upd-banner[data-kind="err"]')?.remove(), m);

// import() that never fails silently: one retry on a fresh URL (Chrome remembers a failed URL), then the banner.
export async function lazyImport(url) {
  try { return recovered(await import(url)); } catch (e) {
    if (!isLoadError(e)) { checkVersion().then(v => (!v || v === BUILD) && showBanner(false)); throw e; }
    try { return recovered(await import(url + (url.includes('?') ? '&' : '?') + 'r=' + Date.now())); } catch (e2) {
      console.warn('[clued] module failed to load', url, e2?.message);
      const v = await checkVersion();
      if (!v || v === BUILD) showBanner(false);
      throw e2;
    }
  }
}

export function watchVersion({ poll = true } = {}) {
  if (G.armed) return;
  G.armed = true;
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) if (foreignBuild(e.name)) return updateAvailable('mixed');
    }).observe({ type: 'resource', buffered: true });
  } catch (e) {}
  addEventListener('unhandledrejection', e => { if (isLoadError(e.reason)) checkVersion().then(v => v === BUILD && showBanner(false)); });
  if (!poll) return;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion({ quiet: true }); });
  setInterval(() => { if (document.visibilityState === 'visible') checkVersion({ quiet: true }); }, 10 * 60e3);
}

export const updateState = () => ({ running: BUILD, latest: G.latest, reason: G.reason, banner: !!document.querySelector('.upd-banner') });
