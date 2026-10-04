// Screen manager: one screen at a time, a back stack, and the hardware/browser back button.
import { h } from './kit.js?v=1';
import { closeAll } from './popup.js?v=1';

const defs = {};
const stack = [];
let cur = null, root = null, depth = 0;
const listeners = new Set();

export function defineScreen(name, render, { pester = false, guard = null, cls = '' } = {}) {
  defs[name] = { render, pester, guard, cls };
}

export function mountApp(el) {
  root = el;
  history.replaceState({ clued: 0 }, '');
  addEventListener('popstate', async () => {
    if (cur?.guard) {
      history.pushState({ clued: ++depth }, '');
      if (!(await cur.guard())) return;
      depth--;
    }
    back(true);
  });
}

export const current = () => cur;
export const onScreen = fn => (listeners.add(fn), () => listeners.delete(fn));
export const canPester = () => !!(cur && defs[cur.name]?.pester && !document.querySelector('#popups .pop'));

export async function go(name, params = {}, { replace = false, fromHistory = false, skipGuard = false } = {}) {
  const def = defs[name];
  if (!def) { console.warn('[clued] no screen', name); return false; }
  if (cur?.guard && !skipGuard && !(await cur.guard())) return false;
  closeAll();
  if (cur) {
    try { cur.cleanup && cur.cleanup(); } catch (e) { console.error(e); }
    if (!replace) stack.push({ name: cur.name, params: cur.params });
  }
  if (!fromHistory && !replace && cur) history.pushState({ clued: ++depth }, '');
  const el = h('section.screen', { class: `scr-${name} ${def.cls}`, dataset: { screen: name } });
  root.querySelectorAll('.screen').forEach(s => { s.classList.add('leaving'); setTimeout(() => s.remove(), 180); });
  root.append(el);
  cur = { name, params, el, cleanup: null, guard: null };
  document.body.dataset.screen = name;
  try {
    const r = await def.render(el, params, cur);
    if (typeof r === 'function') cur.cleanup = r;
    else if (r && typeof r === 'object') { cur.cleanup = r.cleanup || null; cur.guard = r.guard || null; }
  } catch (e) {
    console.error('[clued] screen failed', name, e);
    el.innerHTML = '';
    el.append(h('div.panel.error-panel', {}, h('h2', {}, 'Something went wrong'), h('p', {}, String(e.message || e)),
      h('button.btn.primary', { onclick: () => go('home', {}, { replace: true, skipGuard: true }) }, 'Home')));
  }
  el.scrollTop = 0;
  listeners.forEach(fn => { try { fn(name, params); } catch (e) {} });
  return true;
}

export function back(fromHistory = false) {
  if (!fromHistory && depth > 0) { history.back(); return; }
  if (fromHistory) depth = Math.max(0, depth - 1);
  const prev = stack.pop() || { name: 'home', params: {} };
  if (cur) cur.guard = null;
  return go(prev.name, prev.params, { replace: true, fromHistory: true, skipGuard: true });
}

// Jump somewhere and forget the trail (e.g. results -> home).
export function reset(name = 'home', params = {}) {
  stack.length = 0;
  if (cur) cur.guard = null;
  return go(name, params, { replace: true, skipGuard: true });
}

export function header(title, { backBtn = true, right = null } = {}) {
  return h('header.bar', {},
    backBtn ? h('button.icon-btn.back', { type: 'button', 'aria-label': 'Back', onclick: () => back() }, h('span', { html: '‹' })) : h('span.bar-gap'),
    h('h1.bar-title', {}, title),
    right || h('span.bar-gap'));
}
