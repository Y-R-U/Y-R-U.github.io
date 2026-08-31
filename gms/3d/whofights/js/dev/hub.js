// The dev overlay: tab registry, shell chrome, toast, save indicator, and the game pause.
// A tab is a module under js/dev/tabs/ that calls registerTab; nothing else here knows what it does.

import api from './api.js';
import data from './data.js';

// The full shape of the tool set, whether or not a tab module exists yet. A slot with no module
// renders as a placeholder, so the shell shows what is coming.
const SLOTS = [
  { id: 'status', label: 'Status', order: 0, owner: 'dev-infrastructure' },
  { id: 'level', label: 'Level editor', order: 10, owner: 'level-editor agent' },
  { id: 'convo', label: 'Conversations', order: 20, owner: 'conversation agent' },
  { id: 'chars', label: 'Characters', order: 30, owner: 'character agent' },
  { id: 'music', label: 'Sound & music', order: 40, owner: 'audio agent' },
  { id: 'skin', label: 'Skins', order: 50, owner: 'skin agent' },
  { id: 'data', label: 'Data', order: 80, owner: 'dev-infrastructure' },
  { id: 'debug', label: 'Debug', order: 90, owner: 'debug agent' },
];

const tabs = new Map();
let el = null, navEl = null, mainEl = null, toastEl = null, saveEl = null, pillsEl = null;
let current = null, mounted = null, opened = false, loadedTabs = false;
let host = {};
let resumeGame = null;

export function registerTab(tab) {
  if (!tab || !tab.id) return console.error('[dev] registerTab needs an id');
  if (typeof tab.mount !== 'function') return console.error(`[dev] tab ${tab.id} has no mount()`);
  const slot = SLOTS.find(s => s.id === tab.id);
  tabs.set(tab.id, { order: slot?.order ?? 50, label: slot?.label ?? tab.id, ...tab });
  if (opened) paintNav();
}

export function isOpen() { return opened; }

// `host` is whatever main.js hands bootDev; app/world are read lazily so the hub still works if the
// game finished booting after the button was inserted.
export function configureHub(o = {}) { host = { ...host, ...o }; }

export async function openHub() {
  if (opened) return;
  ensureCSS();
  build();
  opened = true;
  el.classList.remove('hidden');
  document.documentElement.style.overflow = 'hidden';
  pauseGame();
  await loadTabs();
  paintNav();
  paintStatus();
  paintSave();
  const want = localStorage.getItem('wf.dev.tab');
  show(tabs.has(want) ? want : [...tabs.values()].sort(byOrder)[0]?.id);
}

export function closeHub() {
  if (!opened) return;
  unmountCurrent();
  opened = false;
  el.classList.add('hidden');
  document.documentElement.style.overflow = '';
  resumeGame?.();
  resumeGame = null;
}

export const toggleHub = () => (opened ? closeHub() : openHub());

export function toast(msg, kind = '') {
  if (!toastEl) return console.log('[dev]', msg);
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  t.onclick = () => t.remove();
  toastEl.appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 9000 : 3500);
  return t;
}

function ctx() {
  return {
    get app() { return host.app || window.__wf?.app || null; },
    get world() { return host.world || window.__wf?.world || null; },
    api, data, toast,
    close: closeHub,
    hub: { show, registerTab, refreshStatus: paintStatus, slots: () => SLOTS.slice() },
  };
}

function byOrder(a, b) { return a.order - b.order || a.label.localeCompare(b.label); }

function ensureCSS() {
  const href = new URL('./dev.css', import.meta.url).href;
  if (![...document.styleSheets].some(s => s.href === href) &&
      !document.querySelector(`link[href="${href}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }
}

function build() {
  if (el) return;
  el = document.createElement('div');
  el.id = 'wf-dev';
  el.className = 'hidden';
  el.innerHTML = `
    <header>
      <h1>WHO FIGHTS · DEV</h1>
      <div class="pills"></div>
      <div class="spacer"></div>
      <div class="savestate"></div>
      <button data-act="save">Save all</button>
      <button data-act="undo" title="ctrl/cmd+Z">Undo</button>
      <button data-act="redo" title="ctrl/cmd+shift+Z">Redo</button>
      <button data-act="close" title="Esc">Close ✕</button>
    </header>
    <div class="body"><nav></nav><main></main></div>
    <div class="toasts"></div>`;
  document.body.appendChild(el);
  navEl = el.querySelector('nav');
  mainEl = el.querySelector('main');
  toastEl = el.querySelector('.toasts');
  saveEl = el.querySelector('.savestate');
  pillsEl = el.querySelector('.pills');

  el.querySelector('[data-act=close]').onclick = closeHub;
  el.querySelector('[data-act=save]').onclick = saveAll;
  el.querySelector('[data-act=undo]').onclick = () => stepHistory('undo');
  el.querySelector('[data-act=redo]').onclick = () => stepHistory('redo');

  addEventListener('keydown', e => { if (opened) onKey(e); });
  data.onSave(r => {
    // `note` is the whole difference between "there is no dev server" and "the dev server refused
    // it". Printing only the path made those two the same sentence.
    toast(r.ok ? `saved ${r.path}${r.note ? ` — ${r.note}` : ''}` : `SAVE FAILED — ${r.error || r.note}`,
      r.ok ? (r.where === 'local' ? 'warn' : 'good') : 'bad');
    paintSave();
    paintNav();
  });
  data.onAny(() => { paintSave(); paintNav(); });
  addEventListener('beforeunload', e => {
    if (!data.dirtyKeys().length) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function onKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === 'Escape' && !typing) { e.preventDefault(); return closeHub(); }
  if (!(e.metaKey || e.ctrlKey)) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); saveAll(); }
  // Inside a textarea the browser's own undo is the one the author wants.
  else if (k === 'z' && !typing) { e.preventDefault(); stepHistory(e.shiftKey ? 'redo' : 'undo'); }
  else if (k === 'y' && !typing) { e.preventDefault(); stepHistory('redo'); }
}

function stepHistory(which) {
  const r = data[which]();
  toast(r.ok ? `${which}: ${r.label}` : `nothing to ${which}`, r.ok ? '' : 'warn');
  paintSave();
}

async function saveAll() {
  const dirty = data.dirtyKeys();
  if (!dirty.length) return toast('nothing to save');
  const out = await data.saveAll();
  const bad = out.filter(r => !r.ok);
  paintSave();
  if (bad.length) toast(`${bad.length} of ${out.length} saves FAILED`, 'bad');
}

async function loadTabs() {
  if (loadedTabs) return;
  loadedTabs = true;
  // Ask what is actually there first: importing a tab module that does not exist yet works fine,
  // but logs a 404 that every agent then has to learn to ignore.
  const ls = await api.ls('js/dev/tabs');
  const present = ls.ok ? new Set((ls.files || []).map(f => f.name)) : null;
  for (const s of SLOTS) {
    if (present && !present.has(`${s.id}.js`)) continue;
    try { await import(`./tabs/${s.id}.js`); }
    catch (e) { console.warn(`[dev] tab ${s.id} did not load`, e.message); }
  }
  for (const s of SLOTS) if (!tabs.has(s.id)) registerTab({ ...s, mount: el2 => placeholder(el2, s) });
}

function placeholder(node, slot) {
  node.innerHTML = `<div class="empty"><b>${slot.label}</b>
    owned by another agent — not built yet<br><span class="dim">js/dev/tabs/${slot.id}.js
    (${slot.owner})</span></div>`;
}

function paintNav() {
  if (!navEl) return;
  const list = [...tabs.values()].sort(byOrder);
  navEl.innerHTML = '';
  for (const t of list) {
    const b = document.createElement('button');
    b.textContent = t.label;
    b.className = t.id === current ? 'active' : '';
    if (t.id === 'data' && data.dirtyKeys().length) b.innerHTML += ' <span class="dot">●</span>';
    b.onclick = () => show(t.id);
    navEl.appendChild(b);
  }
  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = '` or ctrl+shift+D toggles · Esc closes';
  navEl.appendChild(note);
}

function unmountCurrent() {
  try { mounted?.unmount?.(); } catch (e) { console.error('[dev] unmount threw', e); }
  mounted = null;
  if (mainEl) mainEl.innerHTML = '';
}

function show(id) {
  if (!tabs.has(id)) return;
  unmountCurrent();
  current = id;
  localStorage.setItem('wf.dev.tab', id);
  paintNav();
  const t = tabs.get(id);
  mounted = t;
  try {
    const r = t.mount(mainEl, ctx());
    if (r && typeof r.catch === 'function') r.catch(e => mountFailed(t, e));
  } catch (e) { mountFailed(t, e); }
}

function mountFailed(t, e) {
  console.error(`[dev] tab ${t.id} failed to mount`, e);
  mainEl.innerHTML = `<div class="empty"><b>${t.label} crashed</b>${String(e && e.message || e)}
    <br><span class="dim">see the console</span></div>`;
  toast(`tab ${t.id} failed: ${e && e.message || e}`, 'bad');
}

async function paintStatus() {
  if (!pillsEl) return;
  const s = await api.status();
  const pill = (label, on, title = '') =>
    `<span class="pill ${on === null ? '' : on ? 'on' : 'off'}" title="${title}">${label}</span>`;
  pillsEl.innerHTML =
    pill(s.devserver ? 'dev server' : 'no dev server', !!s.devserver, api.base || 'localStorage only') +
    pill('kokoro', !!s.kokoro) + pill('ace-step', !!s.ace) + pill('flux', !!s.flux) +
    (s.queue?.running ? `<span class="pill warn">queue: ${s.queue.running.kind} ${s.queue.running.note || ''}</span>` : '');
}

function paintSave() {
  if (!saveEl) return;
  const dirty = data.dirtyKeys();
  const last = data.list().map(e => e.lastSave).filter(Boolean).sort((a, b) => b.at - a.at)[0];
  const when = last ? new Date(last.at).toLocaleTimeString() : null;
  saveEl.className = 'savestate' + (dirty.length ? ' dirty' : last && !last.ok ? ' bad' : last ? ' good' : '');
  // A localStorage save leaves the document dirty against the file on disk, which is the truth —
  // but "unsaved" alone reads as data loss, so it says which it is.
  const browserOnly = dirty.length && data.list()
    .filter(e => dirty.includes(e.key)).every(e => e.lastSave?.ok && e.lastSave.where === 'local');
  saveEl.innerHTML = dirty.length
    ? `${dirty.length} ${browserOnly ? 'in this browser only' : 'unsaved'} · ${dirty.join(' ')}`
    : last ? `${last.ok ? 'saved' : 'SAVE FAILED'} ${last.path || ''} ${when}` : 'nothing loaded';
}

// No engine hook is assumed: whatever main.js exposes is used, and the raw rAF handle is the
// fallback because js/engine/app.js `start()` keeps its id on `app.raf`.
function pauseGame() {
  const app = host.app || window.__wf?.app;
  if (typeof window.__wf?.pause === 'function') {
    window.__wf.pause();
    resumeGame = () => window.__wf.resume?.();
  } else if (app && typeof app.pause === 'function') {
    app.pause();
    resumeGame = () => app.resume?.();
  } else if (app && app.raf) {
    cancelAnimationFrame(app.raf);
    app.raf = null;
    resumeGame = () => { if (!app.raf) app.start?.(); };
  } else {
    resumeGame = null;
  }
}

export { api, data };
export default { registerTab, openHub, closeHub, toggleHub, isOpen, configureHub, toast };
