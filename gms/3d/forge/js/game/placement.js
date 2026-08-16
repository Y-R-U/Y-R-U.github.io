// Where an authored prop or a named NPC actually stands. Pure: authored entries plus the area
// table in, world positions out.
//
// `at` is a fraction of the anchor area's own extent, never a world coordinate, so moving or
// resizing an area moves everything anchored in it. That is the whole guarantee: nothing here
// reads a step's `in`, and `wwa.board` is already anchored outside its own id, so "a prop stands
// in every area a quest looks for it in" is placement.test.js's promise and not this file's.

import { contains } from './areas.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

export function anchor(area, at = [0, 0]) {
  const s = area?.shape;
  const [u, v] = at;
  if (!s || !isNum(u) || !isNum(v)) return null;
  if (s.k === 'circle') {
    if (u * u + v * v > 1) return null;
    return { x: s.x + u * s.r, z: s.z + v * s.r };
  }
  if (Math.abs(u) > 1 || Math.abs(v) > 1) return null;
  const hw = Math.abs(s.x1 - s.x0) / 2, hd = Math.abs(s.z1 - s.z0) / 2;
  return { x: (s.x0 + s.x1) / 2 + u * hw, z: (s.z0 + s.z1) / 2 + v * hd };
}

export function placeAll(entries, areas) {
  const errors = [], placed = [], seen = new Set();
  for (const [i, e] of (entries || []).entries()) {
    const p = `entry[${i}]`;
    if (!e?.id) { errors.push(`${p}: needs an id`); continue; }
    if (seen.has(e.id)) { errors.push(`${e.id}: placed more than once`); continue; }
    seen.add(e.id);
    const area = areas?.[e.area];
    if (!area) { errors.push(`${e.id}: unknown area ${e.area}`); continue; }
    const at = anchor(area, e.at || [0, 0]);
    if (!at) { errors.push(`${e.id}: at ${JSON.stringify(e.at)} is outside ${e.area}`); continue; }
    if (!contains(area, at.x, at.z)) { errors.push(`${e.id}: lands outside ${e.area}`); continue; }
    placed.push({ ...e, area: e.area, town: area.town || null, x: at.x, z: at.z, ry: e.ry || 0 });
  }
  return { placed, errors };
}

// Which prop ids the quest corpus asks for. The only authority on that is the packs themselves,
// so nothing here or in the tests carries a second copy of the list.
export function propIds(defs) {
  const out = new Map();
  for (const def of Object.values(defs || {})) {
    for (const s of def.steps || []) {
      for (const o of s.objectives || []) {
        if (o.k !== 'interact') continue;
        const rec = out.get(o.id) || { id: o.id, n: 0, verbs: new Set(), in: new Set() };
        rec.n++;
        if (s.verb) rec.verbs.add(s.verb);
        if (s.in) rec.in.add(s.in);
        out.set(o.id, rec);
      }
    }
  }
  return out;
}

// Five results, not one. In series and sharing a rejection, losing props.json also lost
// cast_at.json and every named NPC in the game behind a single warning that named neither.
export async function loadPlacements(base = 'data') {
  const errors = [];
  const get = async (p, fallback) => {
    try {
      const r = await fetch(`${base}/${p}`);
      if (!r.ok) throw new Error(`${base}/${p} (${r.status})`);
      return await r.json();
    } catch (e) {
      errors.push(e.message);
      return fallback;
    }
  };
  const { normaliseAreas } = await import('./questdef.js');
  const [table, propFile, castFile, nodeFile, escortFile] = await Promise.all([
    get('areas.json', null), get('props.json', []), get('cast_at.json', []), get('gather.json', []),
    get('escorts.json', []),
  ]);
  // Without the areas nothing has an anchor, and reporting that once beats sixty-six unknown-area
  // errors saying the same thing.
  const areas = table ? normaliseAreas(table).areas : {};
  const empty = { placed: [], errors: [] };
  const props = table ? placeAll(propFile, areas) : empty;
  const cast = table ? placeAll(castFile, areas) : empty;
  const nodes = table ? placeAll(nodeFile, areas) : empty;
  const escorts = table ? placeAll(escortFile, areas) : empty;
  errors.push(...props.errors, ...cast.errors, ...nodes.errors, ...escorts.errors);
  for (const e of errors) console.warn(`placement: ${e}`);
  return { areas, props: props.placed, cast: cast.placed, nodes: nodes.placed, escorts: escorts.placed, errors };
}
