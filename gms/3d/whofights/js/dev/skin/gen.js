// Client for POST /api/skin. api.js has no generic caller and it is not this agent's file, so the
// submit lives here; the polling still goes through api.job() so the queue readout stays honest.

import api from '../api.js';

export async function listSkins() {
  const r = await api.ls('art/skins');
  if (r.ok) {
    const files = (r.files || []).filter(f => f.name.endsWith('.png') && !f.name.endsWith('_raw.png'));
    if (files.length) {
      return files.map(f => ({ id: f.name.replace(/\.png$/, ''), size: f.size, mtime: f.mtime }))
        .sort((a, b) => b.mtime - a.mtime);
    }
  }
  // No dev server, or a build of it that predates art/skins being on the /api/ls whitelist.
  try {
    const idx = await (await fetch(artURL('art/skins/index.json'))).json();
    return (idx.skins || []).map(s => ({ id: s.id, mtime: Date.parse(s.at) || 0 }));
  } catch { return []; }
}

// /api/load is confined to data/, so the sidecar is read as the static file it is.
export async function readSidecar(id) {
  try {
    const r = await fetch(new URL(`../../../art/skins/${id}.json`, import.meta.url));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export const skinURL = id => new URL(`../../../art/skins/${id}.png`, import.meta.url).href;
export const artURL = rel => new URL(`../../../${rel}`, import.meta.url).href;

export async function generate(body, onProgress) {
  const base = api.base || (await api.status()) && api.base;
  if (!base) return { ok: false, error: 'no dev server — generation needs one', offline: true };
  let start;
  try {
    const res = await fetch(`${base}/api/skin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    start = await res.json();
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  if (!start.ok) return start;
  onProgress?.({ state: 'queued', position: start.position, note: `queued (${start.position})` });
  for (let i = 0; ; i++) {
    await new Promise(r => setTimeout(r, i < 4 ? 800 : 2500));
    const s = await api.job(start.job);
    if (!s.ok) return s;
    onProgress?.(s);
    if (s.state === 'done') return { ok: true, ...s, out: start.out, prompt: start.prompt };
    if (s.state === 'error') return { ok: false, error: s.error || 'job failed' };
    if (i > 900) return { ok: false, error: 'gave up waiting' };
  }
}
