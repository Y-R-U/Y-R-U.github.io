// The scene document — the world as plain data. Everything the editor places is an entry in
// `objects`; build.js turns a document into geometry and nothing else reads the world from code.

import { ZONE_IDS } from '../world/zones.js';
import { CENTERS } from '../world/terrain.js';

export const SCENE_VERSION = 2;

const num = (v, def) => (Number.isFinite(+v) ? +v : def);

// Every range here is at K = 1.5 (WORLD.md §2.8). `house` and `mass` no longer share one schema:
// a house has an interior and therefore a camera-derived 10 m minimum width, while a mass is a
// shed and may be small. HOUSE_MIN_W is that minimum — anything narrower cannot be entered
// comfortably and should be a mass.
export const HOUSE_MIN_W = 10;

const HOUSE_SIZE = [
  { key: 'w', label: 'Width', min: HOUSE_MIN_W, max: 36, step: 0.5, def: 12 },
  { key: 'd', label: 'Depth', min: 9, max: 30, step: 0.5, def: 10.5 },
  { key: 'h', label: 'Height', min: 7, max: 27, step: 0.5, def: 9 },
];

const MASS_SIZE = [
  { key: 'w', label: 'Width', min: 4, max: 36, step: 0.5, def: 12 },
  { key: 'd', label: 'Depth', min: 4, max: 30, step: 0.5, def: 10.5 },
  { key: 'h', label: 'Height', min: 3, max: 27, step: 0.5, def: 9 },
];

// `margin` is how far the ground footprint reaches past the plan — it drives the contact decal,
// blocks foliage, and is what `heightAt` gets sampled over to seat the object.
export const TYPES = {
  house: {
    label: 'House', params: HOUSE_SIZE,
    plan: p => [p.w / 2, p.d / 2], margin: [0.75, 0.75],
    tall: p => p.h + Math.min(p.w, p.d),
  },
  tower: {
    label: 'Tower',
    params: [
      { key: 'radius', label: 'Radius', min: 2.25, max: 13.5, step: 0.1, def: 6 },
      { key: 'height', label: 'Height', min: 8, max: 60, step: 0.5, def: 27 },
      { key: 'sides', label: 'Sides', min: 8, max: 16, step: 1, def: 12 },
    ],
    plan: p => [p.radius, p.radius], margin: [2.4, 2.4],
    tall: p => p.height + p.radius * 3.2,
  },
  wallRun: {
    label: 'Wall', rubble: true,
    params: [
      { key: 'length', label: 'Length', min: 12, max: 135, step: 1, def: 60 },
      { key: 'height', label: 'Height', min: 5, max: 33, step: 0.5, def: 12 },
      { key: 'thickness', label: 'Thickness', min: 1.5, max: 7.5, step: 0.1, def: 3.6 },
    ],
    plan: p => [p.length / 2, p.thickness / 2], margin: [0.9, 1.05],
    tall: p => p.height + 9,
  },
  // A plain gabled block: two hundred triangles instead of four thousand. This is what makes a
  // town read as packed without spending the whole triangle budget on infill.
  mass: {
    label: 'Block', params: MASS_SIZE,
    plan: p => [p.w / 2, p.d / 2], margin: [0.45, 0.45],
    tall: p => p.h + Math.min(p.w, p.d),
  },
};

export const TYPE_IDS = Object.keys(TYPES);

const plan = o => TYPES[o.type].plan(o.p);
export const tall = o => TYPES[o.type].tall(o.p);

export function footprint(o) {
  if (o.fp) return o.fp;
  const [a, b] = plan(o);
  const m = TYPES[o.type].margin;
  return [a + m[0], b + m[1]];
}

// Ghost-preview extents for a brush, before any object exists to measure.
export function typeBox(type) {
  const t = TYPES[type], p = defaultParams(type);
  const [a, b] = t.plan(p);
  return [a * 2, t.tall(p), b * 2];
}

function defaultParams(type) {
  const p = {};
  for (const s of TYPES[type].params) p[s.key] = s.def;
  return p;
}

// Seeds the object's own detail. Kept inside 2^24 so `buildings.js` can fold it with the
// parameters without leaving exact integer range.
export const newSeed = () => 1 + Math.floor(Math.random() * 0xfffffe);

export function districtFor(doc, x) {
  let best = 0;
  for (let i = 1; i < doc.districts.length; i++) {
    if (Math.abs(x - doc.districts[i].cx) < Math.abs(x - doc.districts[best].cx)) best = i;
  }
  return best;
}

function emptyScene(name = 'Untitled') {
  return {
    version: SCENE_VERSION,
    name,
    districts: ZONE_IDS.map((zone, i) => district(zone, CENTERS[i])),
    objects: [],
  };
}

export function district(zone, cx, extra = {}) {
  return {
    zone, cx, seed: 0, dressSeed: 0, road: null, roadWidth: 3.6, kerbs: [], bridge: null, ...extra,
  };
}

export function makeObject(doc, { type, zone, x, z, ry = 0, p, dist, seed }) {
  const id = doc.objects.reduce((n, o) => Math.max(n, o.id), 0) + 1;
  return {
    id,
    dist: dist ?? districtFor(doc, x),
    zone, type, x, z, ry,
    seed: seed ?? newSeed(),
    p: p ? { ...p } : defaultParams(type),
  };
}

export const cloneScene = doc => JSON.parse(JSON.stringify(doc));

// v1 had no per-object seeds and fast-forwarded one shared RNG per district (`dressSkip`), so
// detail depended on build order. Nothing can recover the old look from the data alone; the
// migration gives every object a stable seed and says so.
const MIGRATIONS = {
  1: raw => ({
    ...raw,
    version: 2,
    districts: (raw.districts || []).map(d => ({ ...d, dressSeed: num(d.seed, 0) })),
    objects: (raw.objects || []).map((o, i) => ({ ...o, seed: num(o.seed, i * 2654435 + 1) })),
  }),
};

// An imported file is untrusted: keep only fields the builder understands, drop anything that
// would throw halfway through a build, and say what was lost rather than quietly eating it.
export function normalise(raw) {
  const fail = error => ({ doc: null, error, dropped: 0, warnings: [] });
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) return fail('not a scene document');

  const v = num(raw.version, 1);
  if (v > SCENE_VERSION) return fail(`saved by a newer build (v${v}; this one reads v${SCENE_VERSION})`);

  const warnings = [];
  for (let from = Math.max(1, Math.floor(v)); from < SCENE_VERSION; from++) {
    if (!MIGRATIONS[from]) return fail(`no migration from v${from}`);
    raw = MIGRATIONS[from](raw);
    warnings.push(`upgraded v${from} → v${from + 1}; object detail was re-seeded`);
  }

  const districts = (Array.isArray(raw.districts) ? raw.districts : []).map((d, i) => district(
    ZONE_IDS.includes(d.zone) ? d.zone : ZONE_IDS[i % ZONE_IDS.length],
    num(d.cx, CENTERS[i] ?? 0),
    {
      seed: num(d.seed, 0),
      dressSeed: num(d.dressSeed, 0),
      road: Array.isArray(d.road) ? d.road.map(p => [num(p?.[0], 0), num(p?.[1], 0)]) : null,
      roadWidth: num(d.roadWidth, 3.6),
      kerbs: Array.isArray(d.kerbs)
        ? d.kerbs.map(k => ({ x: num(k?.x, 0), z: num(k?.z, 0), len: num(k?.len, 4), side: Math.sign(num(k?.side, 1)) || 1, top: num(k?.top, 0) }))
        : [],
      bridge: d.bridge ? { x: num(d.bridge.x, 0), z: num(d.bridge.z, 0), halfSpan: num(d.bridge.halfSpan, 5.6) } : null,
    },
  ));
  if (!districts.length) districts.push(...emptyScene().districts);

  const objects = [];
  const used = new Set();
  let dropped = 0, narrow = 0;
  const badType = new Set(), badZone = new Set();
  for (const o of raw.objects) {
    if (!o || !TYPES[o.type] || !ZONE_IDS.includes(o.zone)) {
      dropped++;
      if (o && !TYPES[o.type]) badType.add(String(o.type));
      else if (o) badZone.add(String(o.zone));
      continue;
    }
    const p = {};
    for (const s of TYPES[o.type].params) p[s.key] = num(o.p?.[s.key], s.def);
    if (o.type === 'house' && p.w < HOUSE_MIN_W) narrow++;
    const id = Number.isInteger(+o.id) && +o.id > 0 && !used.has(+o.id) ? +o.id : 0;
    const obj = {
      id,
      dist: Math.min(districts.length - 1, Math.max(0, num(o.dist, 0) | 0)),
      zone: o.zone, type: o.type,
      x: num(o.x, 0), z: num(o.z, 0), ry: num(o.ry, 0),
      seed: (num(o.seed, 0) | 0) || newSeed(),
      p,
    };
    if (Array.isArray(o.fp) && o.fp.length === 2 && Number.isFinite(+o.fp[0]) && Number.isFinite(+o.fp[1])) {
      obj.fp = [+o.fp[0], +o.fp[1]];
    }
    if (o.rubble && TYPES[o.type].rubble) {
      obj.rubble = true;
      obj.rubbleSeed = (num(o.rubbleSeed, 0) | 0) || obj.seed;
    }
    if (id) used.add(id);
    objects.push(obj);
  }
  let next = 1;
  for (const o of objects) {
    if (o.id) continue;
    while (used.has(next)) next++;
    o.id = next;
    used.add(next);
  }

  // Kept rather than demoted to a mass: the geometry still builds, the interior is just cramped,
  // and silently rewriting somebody's saved scene is worse than saying so.
  if (narrow) warnings.push(`${narrow} house${narrow > 1 ? 's are' : ' is'} under ${HOUSE_MIN_W} m wide — no working camera inside (WORLD.md §2.5)`);
  if (badType.size) warnings.push(`unknown type${badType.size > 1 ? 's' : ''}: ${[...badType].join(', ')}`);
  if (badZone.size) warnings.push(`unknown zone${badZone.size > 1 ? 's' : ''}: ${[...badZone].join(', ')}`);

  return {
    doc: { version: SCENE_VERSION, name: String(raw.name || 'Scene'), districts, objects },
    dropped, warnings,
  };
}
