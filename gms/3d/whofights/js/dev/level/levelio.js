// Level bookkeeping with no DOM and no store: deriving an id from a name, seeding a document,
// keeping data/levels/index.json in step, and working out what deleting one would break.

import { emptyScene, normalise, TYPES } from '../../editor/scene.js';

const round = (v, p = 4) => Math.round((Number.isFinite(+v) ? +v : 0) * 10 ** p) / 10 ** p;

export function slugify(name) {
  const s = String(name ?? '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'level';
}

export function uniqueId(base, taken = []) {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; n < 1e4; n++) if (!set.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now()}`;
}

export const deriveId = (name, taken = []) => uniqueId(slugify(name), taken);

export function seedLevel(id, name = id) {
  const doc = emptyScene(String(name || id));
  doc.id = String(id);
  doc.name = String(name || id);
  return doc;
}

export function duplicateLevel(doc, id, name) {
  const copy = JSON.parse(JSON.stringify(doc || {}));
  copy.id = String(id);
  copy.name = String(name || id);
  return copy;
}

export const indexEntry = doc => ({
  id: String(doc?.id || ''),
  name: String(doc?.name || doc?.id || ''),
  start: { x: round(doc?.start?.x), z: round(doc?.start?.z), yaw: round(doc?.start?.yaw ?? Math.PI, 5) },
});

export function indexUpsert(index, entry) {
  const list = (Array.isArray(index) ? index : []).filter(e => e && typeof e.id === 'string');
  const i = list.findIndex(e => e.id === entry.id);
  if (i < 0) return [...list, entry];
  const out = list.slice();
  out[i] = { ...out[i], ...entry };
  return out;
}

export function indexRemove(index, id) {
  return (Array.isArray(index) ? index : []).filter(e => e && e.id !== id);
}

// Order is meaning here: the game opens index[0] when no ?level= is given.
export function indexMove(index, id, delta) {
  const list = (Array.isArray(index) ? index : []).slice();
  const i = list.findIndex(e => e?.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

// Everything a human authored, and nothing the loader derives (`town`, `blk` come back out of
// normalise()). Written this way so a document round-tripped through the running world editor
// does not grow a second, stale copy of the spatial grid.
const AUTHORED = ['id', 'dist', 'zone', 'type', 'lod', 'x', 'z', 'ry', 'seed', 'inside', 'rubble', 'rubbleSeed'];

export function exportObjects(objects = []) {
  return (Array.isArray(objects) ? objects : []).filter(Boolean).map(o => {
    const out = {};
    for (const k of AUTHORED) if (o[k] !== undefined) out[k] = o[k];
    if (Array.isArray(o.fp)) out.fp = [...o.fp];
    out.p = { ...(o.p || {}) };
    return out;
  });
}

export const sameObjects = (a, b) =>
  JSON.stringify(exportObjects(a)) === JSON.stringify(exportObjects(b));

// The file on disk is raw and the running world is normalised — every default filled in, every
// id assigned — so comparing the two directly reports drift that is not there. This puts the
// authored document through the same loader the game used before comparing.
export function loadedObjects(doc) {
  const r = normalise(doc);
  return exportObjects(r.doc ? r.doc.objects : doc?.objects);
}

export const sameAsLoaded = (authored, world) =>
  JSON.stringify(loadedObjects(authored)) === JSON.stringify(exportObjects(world));

// Types carrying a `strings` param — the sign and the billboards, the only text in the world.
export function textObjects(doc) {
  const out = [];
  for (const o of doc?.objects || []) {
    for (const s of TYPES[o?.type]?.strings || []) {
      out.push({ id: o.id, type: o.type, key: s.key, label: s.label, def: s.def,
        value: typeof o.p?.[s.key] === 'string' ? o.p[s.key] : s.def, inside: o.inside ?? null });
    }
  }
  return out;
}

export function deleteImpact(id, { index = [], levels = {}, characters = {} } = {}) {
  const out = [];
  const ids = (Array.isArray(index) ? index : []).filter(e => e?.id).map(e => e.id);
  if (ids.length <= 1 && ids.includes(id)) out.push('it is the only level in the index — the game will not boot until another is added');
  else if (ids[0] === id) out.push(`it is the first level in the index, so the game will open ${ids[1]} instead`);
  const placed = Object.entries(characters).filter(([, c]) => c?.place?.level === id).map(([k]) => k);
  if (placed.length) out.push(`${placed.length} character${placed.length > 1 ? 's have' : ' has'} nowhere to stand: ${placed.join(', ')}`);
  for (const [lid, doc] of Object.entries(levels)) {
    if (lid === id) continue;
    const n = (doc?.hotspots || []).reduce((sum, h) =>
      sum + (h?.actions || []).filter(a => a?.k === 'goto' && a.level === id).length, 0);
    if (n) out.push(`${n} goto action${n > 1 ? 's' : ''} in ${lid} point here and would go nowhere`);
  }
  return out;
}

// Changing a level's id is not a rename. The id is the filename, the index key, every character's
// place.level and the target of every goto action, so it is a set of edits across four documents —
// returned together so the tab applies them in one go and node can assert them.
export function retargetLevel(from, to, { index = [], levels = {}, characters = {} } = {}) {
  const doc = levels[from] ? { ...JSON.parse(JSON.stringify(levels[from])), id: to } : null;
  // Replaced in place, not removed and re-added: index[0] is the level the game boots into, so
  // the order is meaning and an id change must not quietly reorder it.
  const entry = indexEntry(doc || { id: to, name: to });
  const list = Array.isArray(index) ? index : [];
  const idx = list.some(e => e?.id === from)
    ? list.map(e => (e?.id === from ? { ...e, ...entry } : e))
    : indexUpsert(list, entry);
  const gotos = {};
  const notes = [];
  for (const [lid, d] of Object.entries(levels)) {
    if (lid === from || !d) continue;
    let n = 0;
    const copy = JSON.parse(JSON.stringify(d));
    for (const h of copy.hotspots || []) {
      for (const a of h.actions || []) if (a?.k === 'goto' && a.level === from) { a.level = to; n++; }
    }
    if (n) { gotos[lid] = copy; notes.push(`${n} goto action${n > 1 ? 's' : ''} in ${lid}`); }
  }
  let cast = null;
  const moved = Object.entries(characters).filter(([, c]) => c?.place?.level === from).map(([k]) => k);
  if (moved.length) {
    cast = JSON.parse(JSON.stringify(characters));
    for (const k of moved) cast[k].place.level = to;
    notes.push(`${moved.length} character${moved.length > 1 ? 's' : ''} (${moved.join(', ')})`);
  }
  return { doc, index: idx, gotos, characters: cast, notes };
}

// The player start, as a facing rather than a number: forward is (sin yaw, cos yaw) — see
// js/player.js — so yaw π faces −z, which is what every seeded level uses.
export const yawTowards = (from, to) => round(Math.atan2(to.x - from.x, to.z - from.z), 5);
export const yawDegrees = yaw => Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360);
