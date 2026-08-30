// The level document — the world as plain data. Everything the editor places is an entry in
// `objects`; build.js turns a document into geometry and nothing else reads the world from code.
// A level document also carries `start` (where the player spawns) and `hotspots` (DEV_CONTRACT §5).

import { ZONE_IDS } from '../world/zones.js';
import { CENTERS } from '../world/field.js';

export const SCENE_VERSION = 1;

// A 60 m spatial grid over the world, assigned at load rather than authored: one less thing for a
// human to get wrong, and it re-derives correctly the moment a building is moved.
export const BLK = 60;
export const blockOf = (x, z) => ((Math.floor(z / BLK) + 512) << 10) + Math.floor(x / BLK) + 512;

const num = (v, def) => (Number.isFinite(+v) ? +v : def);

// Every range here is at K = 1.5 (WORLD.md §2.8). `house` and `mass` no longer share one schema:
// a house has an interior and therefore a camera-derived 10 m minimum width, while a mass is a
// shed and may be small. HOUSE_MIN_W is that minimum — anything narrower cannot be entered
// comfortably and should be a mass.
export const HOUSE_MIN_W = 10;

// How far past the shaft radius a tower's foot spreads at ground level. Shared with buildings.js
// so the drawn stone and the collider cannot drift apart again.
export const TOWER_FOOT = 1.3;

const HOUSE_SIZE = [
  { key: 'w', label: 'Width', min: HOUSE_MIN_W, max: 48, step: 0.5, def: 12 },
  { key: 'd', label: 'Depth', min: 9, max: 42, step: 0.5, def: 10.5 },
  { key: 'h', label: 'Height', min: 7, max: 27, step: 0.5, def: 9 },
  // 1 = one over-sized room with a doorway to match, instead of a cottage with a loft.
  { key: 'hall', label: 'Great hall', min: 0, max: 1, step: 1, def: 0 },
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
    // `radius` is the shaft; the battered foot buildings.js draws under it reaches 1.3 × that at
    // the ground, and a collider on the shaft alone let the player walk 4 m into the stone of a
    // radius-9 landmark. The foot's widest ring and this figure are the same number on purpose.
    plan: p => [p.radius * TOWER_FOOT, p.radius * TOWER_FOOT], margin: [2.4, 2.4],
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
  // v3. Every one of these is the same kit — taperBox, roofSlab, gableShape, the shared
  // materials — arranged differently. None of them has zone-specific geometry; `zones.js` is
  // still the only place a zone differs.
  mill: {
    label: 'Mill', params: [
      { key: 'w', label: 'Width', min: 8, max: 24, step: 0.5, def: 13 },
      { key: 'd', label: 'Depth', min: 8, max: 20, step: 0.5, def: 11 },
      { key: 'h', label: 'Height', min: 8, max: 24, step: 0.5, def: 13.5 },
      { key: 'wheel', label: 'Wheel radius', min: 1.5, max: 6, step: 0.1, def: 3.3 },
    ],
    plan: p => [p.w / 2 + p.wheel * 0.5, p.d / 2], margin: [0.75, 0.75],
    tall: p => p.h + Math.min(p.w, p.d),
  },
  barn: {
    label: 'Barn', params: [
      { key: 'w', label: 'Width', min: 12, max: 48, step: 0.5, def: 27 },
      { key: 'd', label: 'Depth', min: 8, max: 24, step: 0.5, def: 15 },
      { key: 'h', label: 'Eaves', min: 5, max: 18, step: 0.5, def: 8.5 },
    ],
    plan: p => [p.w / 2, p.d / 2], margin: [0.9, 0.9],
    tall: p => p.h + p.d * 0.7,
  },
  pen: {
    label: 'Pen', params: [
      { key: 'w', label: 'Width', min: 4, max: 40, step: 0.5, def: 16 },
      { key: 'd', label: 'Depth', min: 4, max: 40, step: 0.5, def: 12 },
      { key: 'h', label: 'Rail height', min: 0.9, max: 2.4, step: 0.05, def: 1.5 },
    ],
    plan: p => [p.w / 2, p.d / 2], margin: [0.3, 0.3],
    tall: p => p.h + 0.6,
  },
  cross: {
    label: 'Market cross', params: [
      { key: 'steps', label: 'Steps', min: 2, max: 6, step: 1, def: 4 },
      { key: 'height', label: 'Shaft height', min: 3, max: 12, step: 0.25, def: 6.5 },
      { key: 'radius', label: 'Base radius', min: 1.5, max: 6, step: 0.1, def: 3.2 },
    ],
    plan: p => [p.radius, p.radius], margin: [0.9, 0.9],
    tall: p => p.height + p.steps * 0.28 + 1.2,
  },
  arcade: {
    label: 'Arcade', params: [
      { key: 'length', label: 'Length', min: 6, max: 60, step: 0.5, def: 21 },
      { key: 'height', label: 'Height', min: 3.6, max: 12, step: 0.25, def: 5.4 },
      { key: 'depth', label: 'Depth', min: 2, max: 8, step: 0.25, def: 3.6 },
      { key: 'bays', label: 'Bays', min: 2, max: 12, step: 1, def: 5 },
    ],
    plan: p => [p.length / 2, p.depth / 2], margin: [0.45, 0.45],
    tall: p => p.height + 1.2,
  },
  // Text on a board, and the only two types carrying a `text` string. Both read it from the
  // document, so the editor can retitle a contract board without touching code.
  sign: {
    label: 'Sign', params: [
      { key: 'w', label: 'Board width', min: 1.5, max: 10, step: 0.1, def: 4.6 },
      { key: 'h', label: 'Board height', min: 0.5, max: 4, step: 0.1, def: 1.5 },
      { key: 'post', label: 'Post height', min: 0.6, max: 5, step: 0.1, def: 2.1 },
    ],
    strings: [{ key: 'text', label: 'Text', def: 'Sign' }],
    plan: p => [p.w / 2, 0.4], margin: [0.4, 0.6],
    tall: p => p.post + p.h,
  },
  billboard: {
    label: 'Billboard', params: [
      { key: 'w', label: 'Board width', min: 2, max: 18, step: 0.25, def: 9 },
      { key: 'h', label: 'Board height', min: 1, max: 8, step: 0.25, def: 4.2 },
      { key: 'lift', label: 'Height off floor', min: 0, max: 8, step: 0.1, def: 2.2 },
    ],
    strings: [{ key: 'text', label: 'Text', def: 'Billboard' }],
    plan: p => [p.w / 2, 0.35], margin: [0.3, 0.3],
    tall: p => p.lift + p.h,
  },
  retaining: {
    label: 'Retaining wall', params: [
      { key: 'length', label: 'Length', min: 6, max: 120, step: 1, def: 36 },
      { key: 'height', label: 'Height', min: 1.5, max: 14, step: 0.25, def: 9 },
      { key: 'batter', label: 'Batter', min: 0, max: 0.4, step: 0.01, def: 0.12 },
    ],
    plan: p => [p.length / 2, p.height * p.batter + 0.9], margin: [0.6, 0.9],
    tall: p => p.height + 0.9,
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
  for (const s of TYPES[type].strings || []) p[s.key] = s.def;
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

export function emptyScene(name = 'Untitled') {
  return {
    version: SCENE_VERSION,
    id: 'untitled',
    name,
    start: { x: 0, z: 0, yaw: Math.PI },
    music: null,
    shots: [],
    districts: [district('neutral', CENTERS[0] ?? 0)],
    objects: [],
    hotspots: [],
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

const LODS = ['full', 'proxy', 'auto'];

// An imported file is untrusted: keep only fields the builder understands, drop anything that
// would throw halfway through a build, and say what was lost rather than quietly eating it.
export function normalise(raw) {
  const fail = error => ({ doc: null, error, dropped: 0, warnings: [] });
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.objects)) return fail('not a scene document');

  const v = num(raw.version, 1);
  if (v > SCENE_VERSION) return fail(`saved by a newer build (v${v}; this one reads v${SCENE_VERSION})`);

  const warnings = [];

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
      bridge: d.bridge
        ? { x: num(d.bridge.x, 0), z: num(d.bridge.z, 0), halfSpan: num(d.bridge.halfSpan, 5.6), deck: num(d.bridge.deck, 0), ry: num(d.bridge.ry, 0) }
        : null,
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
    for (const s of TYPES[o.type].strings || []) {
      p[s.key] = typeof o.p?.[s.key] === 'string' ? o.p[s.key].slice(0, 120) : s.def;
    }
    if (o.type === 'house' && p.w < HOUSE_MIN_W) narrow++;
    const id = Number.isInteger(+o.id) && +o.id > 0 && !used.has(+o.id) ? +o.id : 0;
    const dist = Math.min(districts.length - 1, Math.max(0, num(o.dist, 0) | 0));
    const x = num(o.x, 0), z = num(o.z, 0);
    const obj = {
      id,
      dist,
      town: districts[dist].zone,
      blk: blockOf(x, z),
      lod: LODS.includes(o.lod) ? o.lod : 'auto',
      zone: o.zone, type: o.type,
      x, z, ry: num(o.ry, 0),
      seed: (num(o.seed, 0) | 0) || newSeed(),
      p,
    };
    if (Array.isArray(o.fp) && o.fp.length === 2 && Number.isFinite(+o.fp[0]) && Number.isFinite(+o.fp[1])) {
      obj.fp = [+o.fp[0], +o.fp[1]];
    }
    // Built into a house's interior rather than into the world. build.js leaves it out; doors.js
    // hands it to interior.js when that house is opened.
    if (Number.isInteger(+o.inside) && +o.inside > 0) obj.inside = +o.inside;
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

  const hotspots = [];
  for (const h of Array.isArray(raw.hotspots) ? raw.hotspots : []) {
    const hs = normaliseHotspot(h, hotspots.length);
    if (hs) hotspots.push(hs); else dropped++;
  }

  const start = {
    x: num(raw.start?.x, 0), z: num(raw.start?.z, 0), yaw: num(raw.start?.yaw, Math.PI),
  };

  return {
    doc: {
      version: SCENE_VERSION,
      id: String(raw.id || 'level'),
      name: String(raw.name || 'Scene'),
      start,
      music: typeof raw.music === 'string' ? raw.music : null,
      shots: (Array.isArray(raw.shots) ? raw.shots : []).filter(
        s => s && typeof s.id === 'string' && Array.isArray(s.pos) && Array.isArray(s.look)),
      districts, objects, hotspots,
    },
    dropped, warnings,
  };
}

export const TRIGGERS = ['enter', 'exit', 'click', 'interact', 'always'];

// DEV_CONTRACT §5. An attached hotspot follows a character and ignores `shape`; a placed one has
// to have a shape it can actually be inside, so a bad one is dropped rather than made true.
export function normaliseHotspot(h, i = 0) {
  if (!h || typeof h !== 'object') return null;
  const attach = typeof h.attach === 'string' && h.attach ? h.attach : null;
  const shape = attach ? null : normaliseShape(h.shape);
  if (!attach && !shape) return null;
  return {
    id: String(h.id || `hs.${i}`),
    name: String(h.name || h.id || `Hotspot ${i}`),
    attach,
    r: attach ? num(h.r, 2.5) : 0,
    shape,
    trigger: TRIGGERS.includes(h.trigger) ? h.trigger : 'enter',
    once: !!h.once,
    cooldown: Math.max(0, num(h.cooldown, 0)),
    if: h.if ?? null,
    actions: Array.isArray(h.actions) ? h.actions.filter(a => a && typeof a.k === 'string') : [],
  };
}

function normaliseShape(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.k === 'circle') {
    const r = num(s.r, 0);
    return r > 0 ? { k: 'circle', x: num(s.x, 0), z: num(s.z, 0), r } : null;
  }
  if (s.k === 'rect') {
    const x0 = num(s.x0, 0), z0 = num(s.z0, 0), x1 = num(s.x1, 0), z1 = num(s.z1, 0);
    if (x0 === x1 || z0 === z1) return null;
    return { k: 'rect', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) };
  }
  return null;
}
