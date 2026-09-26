import { hash32 } from './rng.js';

export const SAVE_VERSION = 1;
export const SAVE_PREFIX = 'heirframe.save.';

// migrations[n] upgrades a v(n) save object to v(n+1). Keep them forever.
export const migrations = {
  // 1: s => { s.newField = default; return s; },
};

// Transient runtime keys never written to disk.
const TRANSIENT = new Set(['live', 'runtime', '_cache']);

export function serialize(state) {
  const data = JSON.parse(JSON.stringify(state, (k, v) => (TRANSIENT.has(k) ? undefined : v)));
  data.v = SAVE_VERSION;
  const body = JSON.stringify(data);
  return JSON.stringify({ v: SAVE_VERSION, sum: hash32(body), body });
}

export function deserialize(text) {
  let wrap;
  try { wrap = JSON.parse(text); } catch { throw new Error('save: not JSON'); }
  if (!wrap || typeof wrap.body !== 'string') throw new Error('save: bad wrapper');
  if (hash32(wrap.body) !== wrap.sum) throw new Error('save: checksum mismatch');
  return migrate(JSON.parse(wrap.body));
}

export function migrate(data) {
  let v = data.v ?? 0;
  if (v > SAVE_VERSION) throw new Error(`save: from newer version ${v}`);
  while (v < SAVE_VERSION) {
    const fn = migrations[v];
    if (!fn) throw new Error(`save: no migration from v${v}`);
    data = fn(data);
    data.v = ++v;
  }
  return data;
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    keys: () => [...m.keys()],
  };
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      const t = '__hf_test';
      localStorage.setItem(t, '1'); localStorage.removeItem(t);
      return localStorage;
    }
  } catch { /* private mode etc */ }
  return memoryStorage();
}

// Writes keep the previous good save in .bak so a corrupt write never loses progress.
export function createSaveStore(storage = defaultStorage()) {
  const key = slot => SAVE_PREFIX + slot;
  return {
    storage,
    save(state, slot = 'main') {
      const text = serialize(state);
      try {
        const prev = storage.getItem(key(slot));
        if (prev) storage.setItem(key(slot) + '.bak', prev);
        storage.setItem(key(slot), text);
        return { ok: true, bytes: text.length };
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
    load(slot = 'main') {
      for (const k of [key(slot), key(slot) + '.bak']) {
        let text = null;
        try { text = storage.getItem(k); } catch { /* ignore */ }
        if (!text) continue;
        try { return { ok: true, state: deserialize(text), fromBackup: k.endsWith('.bak') }; }
        catch (e) { if (k.endsWith('.bak')) return { ok: false, error: e.message }; }
      }
      return { ok: false, error: 'empty' };
    },
    has(slot = 'main') { try { return !!storage.getItem(key(slot)); } catch { return false; } },
    clear(slot = 'main') {
      try { storage.removeItem(key(slot)); storage.removeItem(key(slot) + '.bak'); } catch { /* ignore */ }
    },
    exportText(state) { return serialize(state); },
    importText(text) { return deserialize(text); },
  };
}
