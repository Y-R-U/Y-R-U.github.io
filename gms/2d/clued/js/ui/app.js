// Screen manager: one screen at a time, a back stack, and the hardware/browser back button.
import { h } from './kit.js?v=202610101826';
import { closeAll } from './popup.js?v=202610101826';
import { showBanner, reloadFresh } from './update.js?v=202610101826';

// State lives on globalThis: a module loaded across a deploy can import a second copy of this file,
// and that copy must still drive the same screens.
const N = globalThis.__cluedNav || (globalThis.__cluedNav = { defs: {}, stack: [], cur: null, root: null, depth: 0, listeners: new Set() });
const { defs, stack, listeners } = N;

export function defineScreen(name, render, { pester = false, guard = null, cls = '' } = {}) {
  defs[name] = { render, pester, guard, cls };
}

export function mountApp(el) {
  N.root = el;
  history.replaceState({ clued: 0 }, '');
  addEventListener('popstate', async () => {
    if (N.cur?.guard) {
      history.pushState({ clued: ++N.depth }, '');
      if (!(await N.cur.guard())) return;
      N.depth--;
    }
    back(true);
  });
}

export const current = () => N.cur;
export const onScreen = fn => (listeners.add(fn), () => listeners.delete(fn));
export const canPester = () => !!(N.cur && defs[N.cur.name]?.pester && !document.querySelector('#popups .pop'));

function failed(el, name, params, e) {
  console.error('[clued] screen failed', name, e);
  const load = /module|import/i.test(String(e?.message || e));
  if (load) showBanner(false);
  el.replaceChildren(h('div.panel.error-panel', {}, h('h2', {}, 'Something went wrong'),
    h('p', {}, 'This screen didn’t load. Check your connection and try again.'),
    h('p.tiny.muted', {}, String(e?.message || e).slice(0, 160)),
    h('div.row', {},
      h('button.btn.primary', { type: 'button', dataset: { act: 'retry' }, onclick: () => go(name, params, { replace: true, skipGuard: true }) }, 'Retry'),
      load ? h('button.btn', { type: 'button', onclick: reloadFresh }, 'Refresh') : h('button.btn', { type: 'button', onclick: () => reset('home') }, 'Home'))));
}

export async function go(name, params = {}, { replace = false, fromHistory = false, skipGuard = false } = {}) {
  const def = defs[name];
  if (!def) { console.warn('[clued] no screen', name); return false; }
  const prev = N.cur;
  if (prev?.guard && !skipGuard && !(await prev.guard())) return false;
  if (N.cur !== prev) return false;
  closeAll();
  if (prev) {
    try { prev.cleanup && prev.cleanup(); } catch (e) { console.error(e); }
    if (!replace) stack.push({ name: prev.name, params: prev.params });
  }
  if (!fromHistory && !replace && prev) history.pushState({ clued: ++N.depth }, '');
  const el = h('section.screen', { class: `scr-${name} ${def.cls}`, dataset: { screen: name } });
  N.root.querySelectorAll('.screen').forEach(s => { s.classList.add('leaving'); setTimeout(() => s.remove(), 180); });
  N.root.append(el);
  const me = N.cur = { name, params, el, cleanup: null, guard: null };
  document.body.dataset.screen = name;
  let r;
  try { r = await def.render(el, params, me); } catch (e) { if (N.cur === me) failed(el, name, params, e); }
  const cleanup = typeof r === 'function' ? r : r && typeof r === 'object' ? r.cleanup || null : null;
  if (N.cur !== me) {   // another go() took over while this screen was still building
    try { cleanup && cleanup(); } catch (e) {}
    return false;
  }
  me.cleanup = cleanup;
  me.guard = r && typeof r === 'object' ? r.guard || null : null;
  el.scrollTop = 0;
  listeners.forEach(fn => { try { fn(name, params); } catch (e) {} });
  return true;
}

export function back(fromHistory = false) {
  if (!fromHistory && N.depth > 0) { history.back(); return; }
  if (fromHistory) N.depth = Math.max(0, N.depth - 1);
  const prev = stack.pop() || { name: 'home', params: {} };
  if (N.cur) N.cur.guard = null;
  return go(prev.name, prev.params, { replace: true, fromHistory: true, skipGuard: true });
}

// Jump somewhere and forget the trail (e.g. results -> home).
export function reset(name = 'home', params = {}) {
  stack.length = 0;
  if (N.cur) N.cur.guard = null;
  return go(name, params, { replace: true, skipGuard: true });
}

export function header(title, { backBtn = true, right = null } = {}) {
  return h('header.bar', {},
    backBtn ? h('button.icon-btn.back', { type: 'button', 'aria-label': 'Back', onclick: () => back() }, h('span', { html: '‹' })) : h('span.bar-gap'),
    h('h1.bar-title', {}, title),
    right || h('span.bar-gap'));
}
