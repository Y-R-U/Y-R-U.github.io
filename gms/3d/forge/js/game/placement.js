// Where an authored prop or a named NPC actually stands. Pure: authored entries plus the area
// table in, world positions out.
//
// `at` is a fraction of the anchor area's own extent, never a world coordinate. A prop therefore
// cannot be authored outside the area a quest looks for it in, and if A8 moves or resizes an area
// everything standing in it moves with it.

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

export async function loadPlacements(base = 'data') {
  const get = async p => {
    const r = await fetch(`${base}/${p}`);
    if (!r.ok) throw new Error(`${base}/${p} (${r.status})`);
    return r.json();
  };
  const { normaliseAreas } = await import('./questdef.js');
  const areas = normaliseAreas(await get('areas.json')).areas;
  const props = placeAll(await get('props.json'), areas);
  const cast = placeAll(await get('cast_at.json'), areas);
  for (const e of [...props.errors, ...cast.errors]) console.warn(`placement: ${e}`);
  return { areas, props: props.placed, cast: cast.placed, errors: [...props.errors, ...cast.errors] };
}
