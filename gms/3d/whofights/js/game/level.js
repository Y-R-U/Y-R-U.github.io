// Level documents: data/levels/index.json and data/levels/<id>.json. The game reads exactly the
// files the editor writes — there is no second, hardcoded copy of the world anywhere.

import { normalise } from '../editor/scene.js';

export async function loadIndex(base = 'data/levels') {
  const r = await fetch(`${base}/index.json`);
  if (!r.ok) throw new Error(`level index: ${r.status}`);
  const raw = await r.json();
  const list = Array.isArray(raw) ? raw : raw?.levels;
  if (!Array.isArray(list) || !list.length) throw new Error('level index is empty');
  return list.filter(l => l && typeof l.id === 'string');
}

export async function loadLevel(id, base = 'data/levels') {
  const r = await fetch(`${base}/${id}.json`);
  if (!r.ok) throw new Error(`level ${id}: ${r.status}`);
  const out = normalise(await r.json());
  if (!out.doc) throw new Error(`level ${id}: ${out.error}`);
  out.doc.id = out.doc.id || id;
  return out;
}

// Which level to open: ?level=, else the index's first entry.
export function pickLevel(index, params) {
  const want = params?.get?.('level');
  return (want && index.find(l => l.id === want)) || index[0];
}
