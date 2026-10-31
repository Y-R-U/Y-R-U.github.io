// GAMBIT shell: boot, hash routing, top bar, fullscreen, wake lock, account glue.
import { loadDeps, deps, usingReal } from './deps.js';
import { $, h, icon, closeAllOverlays, toast } from './ui.js';
import { getSettings } from './store.js';
import { unlockAudio } from './sound.js';
import * as home from './screens/home.js';
import * as bots from './screens/bots.js';
import * as timecontrol from './screens/timecontrol.js';
import * as game from './screens/game.js';
import * as ladderScreen from './screens/ladder.js';
import * as settings from './screens/settings.js';
import * as placeholder from './screens/placeholder.js';
import { openSettingsSheet, forgetSettingsSheet } from './settingsheet.js';

const params = new URLSearchParams(location.search);
const TEST = params.has('test') || params.has('nocloud');

export const app = {
  route: '',
  cloud: null,          // { matchFinished, checkpoint } once the account layer loads
  deps,
  usingReal,
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  canPester() { return app.route !== 'game' || !game.isActive(); },
  /** The screen we came from in this tab (null at the first screen / after a deep link). */
  prevHash() { return nav.i > 0 ? nav.stack[nav.i - 1] || null : null; },
  /** Go back to `fallback`: a real history.back() when that is where we came from, else navigate. */
  back(fallback = '#/home') {
    const prev = app.prevHash();
    if (prev && (!fallback || prev === fallback)) history.back(); else app.go(fallback);
  },
  openSettings() { openSettings(); },
};

// ---------- in-tab navigation stack (ui-4) ----------
// Each hash entry is numbered in history.state.gn so we know which screen is "previous":
// the top-bar back arrow then becomes history.back() when it points there (so the Android back
// button and the arrow agree, and history doesn't grow on every back tap), and Settings' back
// returns to wherever you opened it from.
const nav = (() => {
  try { const v = JSON.parse(sessionStorage.getItem('gambit.nav') || 'null'); if (v && Array.isArray(v.stack)) return v; } catch { /* ignore */ }
  return { stack: [], i: -1 };
})();
function trackNav() {
  const st = history.state || {};
  const hash = location.hash || '#/home';
  if (typeof st.gn === 'number' && st.gn >= 0 && st.gn < nav.stack.length) nav.i = st.gn;   // back / forward
  else {
    nav.i += 1; nav.stack.length = nav.i;
    try { history.replaceState({ ...st, gn: nav.i }, '', location.href); } catch { /* ignore */ }
  }
  nav.stack[nav.i] = hash;
  if (nav.stack.length > 60) { nav.stack.splice(0, nav.stack.length - 60); nav.i = nav.stack.length - 1; }
  try { sessionStorage.setItem('gambit.nav', JSON.stringify(nav)); } catch { /* ignore */ }
}

// Settings without losing your place: any screen with the shared 3D board on show (bot game,
// online game, puzzle, lesson) gets the in-place sheet; everything else the full page.
function openSettings() {
  if (document.querySelector('#view .board-host')) openSettingsSheet(app);
  else app.go('#/settings');
}
window.__gambit = app;   // handy for tests / debugging

// ---------- plug-in screens (owned by other agents) ----------
// One line per screen: '#/<route>' -> loader of a module exporting
//   mount(container, ctx) -> optional cleanup fn | {leave()}
// ctx = { app, deps, params, go(hash), setTop({title, sub, back}), canPester(fn) }.
// A plug-in route overrides the built-in placeholder for the same route.
// The loader is only called when the route is opened, so a missing module never 404s at boot.
export const PLUGINS = {
  puzzles: () => import('../puzzles/screen.js'),
  online: () => import('./screens/online.js'),   // online agent
  learn: () => import('../learn/screen.js'),
};

const ROUTES = [
  [/^#\/home$/, home, () => ({})],
  [/^#\/play\/bot$/, bots, () => ({})],
  [/^#\/play\/bot\/([\w-]+)$/, timecontrol, m => ({ botId: m[1] })],
  [/^#\/game$/, game, () => ({})],
  [/^#\/ladder(?:\/(stats))?$/, ladderScreen, m => ({ tab: m[1] || 'board' })],
  [/^#\/settings$/, settings, () => ({})],
  [/^#\/(online|puzzles|learn)$/, placeholder, m => ({ kind: m[1] })],
];

// Wraps a plug-in module as a normal screen.
function pluginScreen(name, loader) {
  return {
    ROUTE: name,
    render(app, params) {
      const el = h(`<section class="screen plugin plugin-${name}"><div class="board-loading" style="position:static;padding:40px">Loading…</div></section>`);
      let cleanup = null, left = false, pester = null;
      const prevPester = app.canPester;
      const ctx = {
        app, deps: app.deps, params, go: hash => app.go(hash),
        setTop: t => setTopbar({ back: '#/home', ...t }),
        canPester: fn => { pester = fn; },
      };
      loader().then(mod => {
        if (left) return;
        el.replaceChildren();
        const r = mod.mount(el, ctx);
        cleanup = typeof r === 'function' ? r : r && r.leave ? () => r.leave() : null;
      }).catch(e => { console.error(`[gambit] ${name} screen failed`, e); el.textContent = 'This screen could not load.'; });
      app.canPester = () => (pester ? !!pester() : true);
      return {
        el, top: { title: name[0].toUpperCase() + name.slice(1), back: '#/home' },
        leave() { left = true; app.canPester = prevPester; try { cleanup && cleanup(); } catch (e) { console.warn(e); } },
      };
    },
  };
}

let current = null;
function render() {
  const hash = location.hash || '#/home';
  let match = null;
  const pm = hash.match(/^#\/([\w-]+)(?:\/(.*))?$/);
  if (pm && PLUGINS[pm[1]]) match = { mod: pluginScreen(pm[1], PLUGINS[pm[1]]), params: { rest: pm[2] || '' } };
  if (!match) for (const [re, mod, p] of ROUTES) { const m = hash.match(re); if (m) { match = { mod, params: p(m) }; break; } }
  if (!match) { location.replace('#/home'); return; }
  if (current && current.leave) { try { current.leave(); } catch (e) { console.warn(e); } }
  forgetSettingsSheet();
  closeAllOverlays();
  const view = $('#view');
  const res = match.mod.render(app, match.params) || {};
  app.route = res.route || match.mod.ROUTE || '';
  view.replaceChildren(res.el);
  view.scrollTop = 0;
  current = res;
  setTopbar(res.top || {});
  document.body.dataset.route = app.route;
  view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  if (app.canPester() && app.cloud) app.cloud.checkpoint?.();
  wakeLock(app.route === 'game');
}

// ---------- top bar ----------
function setTopbar({ title = '', back = null, logo = false, sub = '' }) {
  const bar = $('#topbar');
  bar.querySelector('.tb-left').innerHTML = logo
    ? `<a class="logo" href="#/home" aria-label="GAMBIT home"><span class="logo-mark">${knightMark()}</span><span class="logo-word">GAMBIT</span></a>`
    : `${back ? `<a class="tb-btn" href="${back}" aria-label="Back">${icon('back')}</a>` : ''}
       <div class="tb-title"><div>${title}</div>${sub ? `<small>${sub}</small>` : ''}</div>`;
}
export function knightMark() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dfa6"/><stop offset="1" stop-color="#b98431"/></linearGradient></defs>
  <path fill="url(#lg)" d="M9 27h15v-2.6c0-3.4-1.6-6-1.6-9.6 0-4.2 1.6-6 1.6-6-2-2.9-5.4-4.4-8.6-4.1L13.8 3l-1.6 2.6C8.6 7.2 6.4 10.6 6 14.3l3.3 1.4 2.6-2.1 2.2.3c-1.6 2.3-4 4.4-5.1 7.6z"/>
  <circle cx="15.6" cy="9.4" r="1.2" fill="#1a1206"/><rect x="7.5" y="27" width="18" height="2.6" rx="1.3" fill="url(#lg)"/></svg>`;
}

// ---------- fullscreen (D1: hidden where the API is unavailable, e.g. iOS Safari) ----------
function setupFullscreen() {
  const btn = $('#fs-btn');
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!req || !enabled) { btn.hidden = true; return; }
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const sync = () => { btn.innerHTML = icon(isFs() ? 'exitfs' : 'fullscreen'); btn.setAttribute('aria-label', isFs() ? 'Exit fullscreen' : 'Fullscreen'); };
  btn.addEventListener('click', async () => {
    try {
      if (isFs()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await req.call(el, { navigationUI: 'hide' });
    } catch { toast('Fullscreen is not available here'); }
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}

// ---------- wake lock while a game is on screen ----------
let lock = null, wantLock = false;
async function wakeLock(on) {
  wantLock = on;
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && !lock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wantLock) wakeLock(true); });

// ---------- account layer (optional; the game runs without it) ----------
function setupCloud() {
  if (TEST) return;
  import('./cloud.js')
    .then(m => { app.cloud = m.initCloud(() => app.canPester()); })
    .catch(e => console.warn('[gambit] account layer unavailable — local saves only', e && e.message));
}

// ---------- no rubber-band / double-tap zoom on the shell ----------
function setupTouch() {
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('pointerdown', unlockAudio, { once: true });
}

async function boot() {
  const status = $('#boot-status');
  document.documentElement.dataset.theme = getSettings().theme;
  try {
    await loadDeps();
  } catch (e) {
    if (status) status.textContent = 'Could not load the game. Tap reload.';
    throw e;
  }
  setupFullscreen();
  setupTouch();
  $('#settings-btn').addEventListener('click', openSettings);
  // top-bar back arrow: pop history when it points at the screen we came from
  $('#topbar').addEventListener('click', e => {
    const a = e.target.closest('.tb-left a.tb-btn'); if (!a) return;
    const href = a.getAttribute('href');
    if (href && app.prevHash() === href) { e.preventDefault(); history.back(); }
  });
  window.addEventListener('hashchange', () => { trackNav(); render(); });
  trackNav();
  render();
  setupCloud();
  window.__booted = true;
  $('#boot')?.classList.add('gone');
  setTimeout(() => $('#boot')?.remove(), 400);
}

boot();
