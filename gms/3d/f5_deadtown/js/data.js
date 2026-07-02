// Data layer: the game reads levels + the mission config from the Go server's
// REST API (same origin, :8901) and saves progress to /api/saves/main — the
// SAME SQLite database the level editor writes to. When there is no API
// (GitHub Pages static hosting) it falls back to the published snapshot
// data/snapshot/game.json (written by the editor's Publish button) and
// localStorage for saves.

const LS_KEY = 'f5deadtown_save_v1';
const SLOT = 'main';

async function jfetch(url, opts = {}, ms = 2500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export const data = {
  api: false,          // true → live server + SQLite; false → snapshot mode
  snapshot: null,

  async init() {
    try { const p = await jfetch('api/ping', {}, 1500); this.api = !!p.ok; }
    catch { this.api = false; }
    if (!this.api) {
      try { this.snapshot = await jfetch('data/snapshot/game.json', {}, 8000); }
      catch { this.snapshot = { levels: {}, config: {} }; }
    }
    return this.api;
  },

  async config() {
    if (this.api) { const r = await jfetch('api/config/game'); return r.data; }
    return this.snapshot?.config?.game || null;
  },

  async level(id) {
    if (this.api) { const r = await jfetch(`api/levels/${id}`); return r.data; }
    const doc = this.snapshot?.levels?.[id];
    if (!doc) throw new Error(`level not in snapshot: ${id}`);
    return doc;
  },

  async listLevels() {
    if (this.api) { const r = await jfetch('api/levels'); return r.levels; }
    return Object.entries(this.snapshot?.levels || {}).map(([id, d]) => ({ id, name: d.name || id }));
  },

  async loadSave() {
    if (this.api) {
      try { const r = await jfetch(`api/saves/${SLOT}`); return r.data; }
      catch { return null; }
    }
    try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
  },

  async storeSave(d) {
    if (this.api) {
      try { await jfetch(`api/saves/${SLOT}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: d }) }); return; }
      catch { /* fall through to localStorage so progress still survives */ }
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
  },

  async clearSave() {
    if (this.api) { try { await jfetch(`api/saves/${SLOT}`, { method: 'DELETE' }); } catch {} }
    try { localStorage.removeItem(LS_KEY); } catch {}
  },
};
