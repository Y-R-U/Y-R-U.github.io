// The one place every authored document is loaded, cached, mutated, undone and saved. Tools never
// touch the api or localStorage directly — they go through here so two tabs on the same document
// stay in sync and one undo stack covers the lot.

import apiDefault from './api.js';

export const KINDS = {
  levelIndex: {
    file: () => 'data/levels/index.json',
    blank: () => [],
    // The contract fixes this one as a bare array, unlike every other document.
    validate: d => Array.isArray(d) ? d.flatMap((e, i) =>
      !e || typeof e.id !== 'string' ? [`entry ${i} has no id`] : []) : ['must be an array'],
  },
  levels: {
    collection: true,
    file: id => `data/levels/${id}.json`,
    // Must match SCENE_VERSION in js/editor/scene.js, which is 1. Not imported: scene.js pulls in
    // three via field.js, and this module has to load in selftest.html, which has no importmap.
    blank: id => ({ version: 1, id, name: id, objects: [], hotspots: [] }),
    validate: d => {
      const e = [];
      if (!d || typeof d !== 'object') return ['must be an object'];
      if (typeof d.id !== 'string') e.push('no id');
      if (d.hotspots && !Array.isArray(d.hotspots)) e.push('hotspots must be an array');
      for (const [i, h] of (d.hotspots || []).entries()) {
        if (!h || typeof h.id !== 'string') e.push(`hotspot ${i} has no id`);
        if (h && !h.attach && !h.shape) e.push(`hotspot ${h?.id || i} has neither shape nor attach`);
        for (const [j, a] of (h?.actions || []).entries()) {
          if (!a || typeof a.k !== 'string') e.push(`hotspot ${h?.id || i} action ${j} has no k`);
        }
      }
      return e;
    },
  },
  conversations: {
    file: () => 'data/conversations.json',
    blank: () => ({ version: 1, nodes: {} }),
    validate: d => {
      const e = [];
      if (!d || typeof d.nodes !== 'object' || !d.nodes) return ['no nodes object'];
      for (const [id, n] of Object.entries(d.nodes)) {
        if (!Array.isArray(n?.lines)) e.push(`${id}: lines must be an array`);
        for (const c of n?.choices || []) {
          if (c?.goto && !d.nodes[c.goto]) e.push(`${id}: choice goes to missing node ${c.goto}`);
        }
        if (n?.next && !d.nodes[n.next]) e.push(`${id}: next is a missing node ${n.next}`);
      }
      return e;
    },
  },
  characters: {
    file: () => 'data/characters.json',
    blank: () => ({ version: 1, characters: {} }),
    validate: d => {
      const e = [];
      if (!d || typeof d.characters !== 'object' || !d.characters) return ['no characters object'];
      for (const [id, c] of Object.entries(d.characters)) {
        if (!c?.name) e.push(`${id}: no name`);
        if (!c?.body) e.push(`${id}: no body`);
        else if (!['robed', 'none'].includes(c.body)) e.push(`${id}: body must be robed or none`);
        if (c?.body === 'robed' && c.place && typeof c.place.level !== 'string') e.push(`${id}: place needs a level`);
      }
      return e;
    },
  },
  barks: {
    file: () => 'data/barks.json',
    blank: () => ({ version: 1, categories: Object.fromEntries(BARK_CATEGORIES.map(c =>
      [c, { label: c[0].toUpperCase() + c.slice(1), note: '' }])), shared: {} }),
    validate: d => {
      const e = [];
      if (!d?.shared || typeof d.shared !== 'object') return ['no shared object'];
      for (const k of Object.keys(d.shared)) {
        if (!BARK_CATEGORIES.includes(k)) e.push(`unknown category ${k}`);
        if (!Array.isArray(d.shared[k])) e.push(`${k} must be an array of lines`);
      }
      return e;
    },
  },
  music: {
    file: () => 'data/music.json',
    blank: () => ({ version: 1, tracks: [], sets: [] }),
    validate: d => {
      const e = [];
      if (!Array.isArray(d?.tracks)) e.push('tracks must be an array');
      if (!Array.isArray(d?.sets)) e.push('sets must be an array');
      const ids = new Set((d?.tracks || []).map(t => t?.id));
      for (const s of d?.sets || []) {
        for (const t of s?.tracks || []) if (!ids.has(t)) e.push(`set ${s.id}: missing track ${t}`);
      }
      return e;
    },
  },
};

export const BARK_CATEGORIES = ['idle', 'greet', 'farewell', 'curious', 'grumble', 'success',
  'failure', 'hurt', 'combat', 'spot', 'thanks', 'refuse', 'wander', 'weather'];

const HISTORY_MAX = 200;
const LS = key => `wf.dev.doc.${key}`;
const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const keyOf = (kind, id) => (KINDS[kind]?.collection ? `${kind}:${id}` : kind);

let api = apiDefault;
let store = memoryStorage();
let fetchFn = typeof fetch === 'function' ? (...a) => fetch(...a) : null;

if (typeof localStorage !== 'undefined') {
  try { localStorage.setItem('wf.dev.probe', '1'); localStorage.removeItem('wf.dev.probe'); store = localStorage; }
  catch { /* private mode / quota: memory only, and storageHealth() says so */ }
}

function memoryStorage() {
  const m = new Map();
  return { __memory: true, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

const entries = new Map();
const kindListeners = new Map();
const anyListeners = new Set();
const saveListeners = new Set();
let history = [];
let future = [];

function emit(kind, id, entry, why) {
  for (const fn of kindListeners.get(kind) || []) safely(fn, entry.doc, id, why);
  for (const fn of anyListeners) safely(fn, { kind, id, doc: entry.doc, why });
}
const safely = (fn, ...a) => { try { fn(...a); } catch (e) { console.error('[dev.data] listener threw', e); } };

function entryFor(kind, id) {
  const k = keyOf(kind, id);
  let e = entries.get(k);
  if (!e) {
    e = { key: k, kind, id: KINDS[kind]?.collection ? id : null, doc: null, saved: null,
      source: null, loaded: false, lastSave: null, staleDraft: false };
    entries.set(k, e);
  }
  return e;
}

function draft(key) {
  try {
    const raw = store.getItem(LS(key));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeDraft(key, doc) {
  try { store.setItem(LS(key), JSON.stringify({ at: Date.now(), doc })); return true; }
  catch (e) { return String(e.message || e); }
}

export const data = {
  KINDS, BARK_CATEGORIES,

  configure(o = {}) {
    if (o.api) api = o.api;
    if (o.storage) store = o.storage;
    if (o.fetch !== undefined) fetchFn = o.fetch;
    if (o.reset) { entries.clear(); history = []; future = []; }
  },

  kinds: () => Object.keys(KINDS),
  fileOf: (kind, id) => KINDS[kind]?.file(id),
  keyOf,

  async load(kind, id, { force = false } = {}) {
    if (!KINDS[kind]) return null;
    const e = entryFor(kind, id);
    if (e.loaded && !force) return e.doc;
    if (e.loading) return e.loading;
    e.loading = (async () => {
      const file = KINDS[kind].file(id);
      let doc = null, source = null;
      const r = await api.load(file);
      if (r.ok) { doc = r.json; source = 'server'; }
      // Only reach for the static copy when the dev server is not there to answer. If it answered
      // "missing", fetching the same path again just logs a 404 in the console.
      if (doc === null && !r.missing && fetchFn) {
        // Served statically (GitHub Pages, python -m http.server) — read the same file the game reads.
        try {
          const res = await fetchFn(fileURL(file), { cache: 'no-store' });
          if (res.ok) { doc = await res.json(); source = 'static'; }
        } catch { /* not served, or not there */ }
      }
      const d = draft(e.key);
      const offline = !(await api.online());
      if (d && offline) { doc = d.doc; source = 'local'; }
      else if (d && doc !== null) e.staleDraft = true;
      if (doc === null) { doc = KINDS[kind].blank(id); source = 'blank'; }
      e.doc = doc;
      e.saved = source === 'server' || source === 'static' ? JSON.stringify(doc) : null;
      e.source = source;
      e.loaded = true;
      e.loading = null;
      emit(kind, id, e, 'load');
      return doc;
    })();
    return e.loading;
  },

  get(kind, id) { return entries.get(keyOf(kind, id))?.doc ?? null; },
  loaded(kind, id) { return !!entries.get(keyOf(kind, id))?.loaded; },
  source(kind, id) { return entries.get(keyOf(kind, id))?.source ?? null; },

  // The only way a document changes. Records undo, marks dirty, notifies every listener.
  set(kind, doc, id, { label = 'edit', coalesce = false } = {}) {
    const e = entryFor(kind, id);
    const before = e.doc === null ? null : JSON.stringify(e.doc);
    const after = JSON.stringify(doc);
    if (before === after) return e.doc;
    e.doc = doc;
    e.loaded = true;
    const top = history[history.length - 1];
    if (coalesce && top && top.key === e.key && top.label === label && Date.now() - top.at < 800) {
      top.after = after;
      top.at = Date.now();
    } else {
      history.push({ key: e.key, kind, id, before, after, label, at: Date.now() });
      if (history.length > HISTORY_MAX) history.shift();
    }
    future = [];
    writeDraft(e.key, doc);
    emit(kind, id, e, 'set');
    return doc;
  },

  // Clone-apply-set. `fn` may mutate the clone or return a replacement.
  mutate(kind, id, fn, opts) {
    const cur = this.get(kind, id);
    const next = clone(cur ?? KINDS[kind].blank(id));
    const ret = fn(next);
    return this.set(kind, ret === undefined ? next : ret, id, opts);
  },

  async save(kind, id) {
    const e = entryFor(kind, id);
    if (!e.loaded) return report(e, { ok: false, error: 'not loaded' });
    const file = KINDS[kind].file(id);
    const problems = this.validate(kind, e.doc);
    const r = await api.save(file, e.doc);
    if (r.ok) {
      e.saved = JSON.stringify(e.doc);
      e.source = 'server';
      e.staleDraft = false;
      try { store.removeItem(LS(e.key)); } catch { /* nothing to drop */ }
      return report(e, { ok: true, where: 'server', path: r.path || file, bytes: r.bytes, problems });
    }
    const w = writeDraft(e.key, e.doc);
    if (w === true) return report(e, { ok: true, where: 'local', path: LS(e.key), problems,
      note: r.offline ? 'no dev server — saved in this browser only' : r.error });
    return report(e, { ok: false, where: 'local', error: `${r.error}; localStorage also failed: ${w}` });
  },

  async saveAll() {
    const out = [];
    for (const e of entries.values()) if (this.dirty(e.kind, e.id)) out.push({ key: e.key, ...(await this.save(e.kind, e.id)) });
    return out;
  },

  revert(kind, id) {
    const e = entryFor(kind, id);
    if (e.saved === null) return { ok: false, error: 'nothing saved to revert to' };
    this.set(kind, JSON.parse(e.saved), id, { label: 'revert' });
    return { ok: true };
  },

  dirty(kind, id) {
    const e = entries.get(keyOf(kind, id));
    if (!e || !e.loaded) return false;
    return e.saved === null || JSON.stringify(e.doc) !== e.saved;
  },
  dirtyKeys() { return [...entries.values()].filter(e => this.dirty(e.kind, e.id)).map(e => e.key); },

  validate(kind, doc) {
    try { return KINDS[kind]?.validate(doc ?? this.get(kind)) || []; }
    catch (e) { return [`validator threw: ${e.message}`]; }
  },

  undo() { return step(history, future, 'before'); },
  redo() { return step(future, history, 'after'); },
  canUndo: () => history.length > 0,
  canRedo: () => future.length > 0,
  historyLabels: () => history.map(h => `${h.kind}${h.id ? ':' + h.id : ''} — ${h.label}`),
  clearHistory() { history = []; future = []; },

  onChange(kind, fn) {
    if (!kindListeners.has(kind)) kindListeners.set(kind, new Set());
    kindListeners.get(kind).add(fn);
    return () => kindListeners.get(kind).delete(fn);
  },
  onAny(fn) { anyListeners.add(fn); return () => anyListeners.delete(fn); },
  onSave(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); },

  list() {
    return [...entries.values()].map(e => ({ key: e.key, kind: e.kind, id: e.id, source: e.source,
      loaded: e.loaded, dirty: this.dirty(e.kind, e.id), lastSave: e.lastSave,
      staleDraft: e.staleDraft, bytes: e.doc ? JSON.stringify(e.doc).length : 0 }));
  },

  // Level ids from the index, the drafts in this browser and the dev server's data/levels.
  async levelIds() {
    const ids = new Set();
    const idx = this.get('levelIndex') ?? await this.load('levelIndex');
    for (const e of Array.isArray(idx) ? idx : []) if (e?.id) ids.add(e.id);
    const ls = await api.ls('data/levels');
    if (ls.ok) for (const f of ls.files || []) {
      if (f.name.endsWith('.json') && f.name !== 'index.json') ids.add(f.name.slice(0, -5));
    }
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i) || '';
      if (k.startsWith(LS('levels:'))) ids.add(k.slice(LS('levels:').length));
    }
    for (const e of entries.values()) if (e.kind === 'levels' && e.id) ids.add(e.id);
    return [...ids].sort();
  },

  applyDraft(kind, id) {
    const e = entryFor(kind, id);
    const d = draft(e.key);
    if (!d) return { ok: false, error: 'no draft' };
    this.set(kind, d.doc, id, { label: 'apply local draft' });
    e.staleDraft = false;
    return { ok: true };
  },
  dropDraft(kind, id) {
    const e = entryFor(kind, id);
    try { store.removeItem(LS(e.key)); } catch { /* already gone */ }
    e.staleDraft = false;
    return { ok: true };
  },

  storageHealth() {
    if (store.__memory) return { ok: false, error: 'localStorage unavailable — edits live only until reload' };
    let bytes = 0, mine = 0;
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        const v = store.getItem(k) || '';
        bytes += k.length + v.length;
        if (k.startsWith('wf.dev.doc.')) mine += v.length;
      }
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true, bytes, mine };
  },

  download(kind, id) {
    const doc = this.get(kind, id);
    if (doc === null) return { ok: false, error: 'not loaded' };
    const file = KINDS[kind].file(id);
    if (typeof document === 'undefined') return { ok: false, error: 'no DOM' };
    const blob = new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { ok: true, file };
  },
};

function report(e, r) {
  e.lastSave = { ...r, at: Date.now() };
  for (const fn of saveListeners) safely(fn, { key: e.key, kind: e.kind, id: e.id, ...e.lastSave });
  return e.lastSave;
}

function step(from, to, field) {
  const h = from.pop();
  if (!h) return { ok: false };
  to.push(h);
  const e = entryFor(h.kind, h.id);
  e.doc = h[field] === null ? null : JSON.parse(h[field]);
  if (e.doc !== null) writeDraft(e.key, e.doc);
  emit(h.kind, h.id, e, field === 'before' ? 'undo' : 'redo');
  return { ok: true, label: h.label, kind: h.kind, id: h.id };
}

// data/… is relative to the game root; the dev modules sit two levels down from it.
function fileURL(file) {
  try { return new URL(`../../${file}`, import.meta.url).href; } catch { return file; }
}

export default data;
