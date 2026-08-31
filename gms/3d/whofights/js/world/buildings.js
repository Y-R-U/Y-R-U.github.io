// The building kit. wallRun / tower / house, assembled from the parts in details.js.
// Every zone difference comes from zones.js data — no zone ids are branched on here.

import * as THREE from 'three';
import { zone } from './zones.js';
import { TOWER_FOOT } from '../editor/scene.js';
import { hallBand, hallWindows } from './hallplan.js';
import {
  Batch, T, rng, span, openingPts, extrude, rectShape, taperBox, mergedMesh,
  addOpening, addMerlons, addCorbels, addCrest, roofSlab, roofY, gableShape,
  addQuoins, addRubble, addSkirt, addSteps, addChimney,
} from './details.js';

// Architectural lengths are at K = 1.5 (WORLD.md §2). Human-scale ones — step rise, door leaf
// clearances, handrails — are not, and that asymmetry is the design.
export const TUNING = {
  wallSeg: 6.9,       // metres per curtain-wall module
  buttressEvery: 3,   // segments between buttresses
  panelT: 0.51,       // house wall thickness — this is what makes a reveal read
  eaves: 0.83,        // roof overhang, unless the zone names its own
  rubble: 1.0,        // debris density multiplier
};

// Detail is seeded per object. `s` is the caller's stable seed; without one it falls back to a
// counter of builders in the current batch, which makes detail depend on build order — fine for
// a one-shot scene, wrong under insert and delete, so the editor always passes a seed.
let seq = 0;
const seed = (s, ...n) => rng(n.reduce((a, v) => (a * 131 + Math.round(v * 97)) | 0, Math.imul(s || ++seq, 2654435761)));

// Optional static batching. Wrap scene construction in beginBatch() / endBatch(root) and every
// building in the group collapses into one mesh per surface — the difference between ~120 draw
// calls for a district and about six. Builders still return their own positioned Object3D.
let pending = null;

export function beginBatch() { pending = []; seq = 0; }

// `fold` renames surfaces on the way into the buckets, so a set that is only ever seen from far
// away can be merged into fewer meshes than the one seen from close up.
export function endBatch(root, fold) {
  const list = pending;
  pending = null;
  if (!list || !list.length) return null;
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  const buckets = new Map();
  for (const { group, zoneId, parts } of list) {
    for (const [name, arr] of parts) {
      const surface = fold?.[name] || name;
      const key = `${zoneId}|${surface}`;
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, bucket = { zoneId, surface, geos: [] });
      for (const g of arr) bucket.geos.push(g.applyMatrix4(group.matrixWorld));
    }
    parts.clear();
  }
  // trim is 72k of the shadow pass, but dropping its casting flattens the corbel and string
  // courses against the wall at a low sun — checked at gate_night, it is not free triangles
  for (const { zoneId, surface, geos } of buckets.values()) out.add(mergedMesh(zoneId, surface, geos));
  return out;
}

// Foundations, terraces, retaining walls, bridges — anything the world wants merged into the
// district batch. `fn` gets a Batch to push geometry into, using the kit's own surface names.
export function dressing(zoneId, fn, s = 0) {
  const b = new Batch(zoneId);
  const g = new THREE.Group();
  fn(b, seed(s, 7, 11, 13));
  return finish(b, g, zoneId);
}

// A Batch the caller filled itself. The district dressing feeds several per-block batches from one
// RNG stream, so it cannot use `dressing`'s one-callback-one-batch shape without re-rolling it.
export function emitBatch(zoneId, b) { return finish(b, new THREE.Group(), zoneId); }

function finish(b, g, zoneId) {
  if (pending) pending.push({ group: g, zoneId, parts: b.parts });
  else b.build(g);
  return g;
}

// Zone data, not zone id, decides which surfaces a building needs.
function palette(z, dressed) {
  const trim = dressed ? 'trim' : 'wall';
  return {
    wall: 'wall',
    trim,
    roof: 'roof',
    glass: 'glass',
    crest: z.crest.metalness ? 'crest' : trim,
  };
}

const V2 = (x, y) => new THREE.Vector2(x, y);

function holePath(kind, w, h, x, y) {
  return new THREE.Path(openingPts(kind, w, h).map(p => V2(p[0] + x, p[1] + y)));
}

// One flat wall panel of real thickness, with its openings cut clean through.
function panel(b, S, { m, w, h, t, y0 = 0, shape, openings = [], reveal }) {
  shape = shape || rectShape(w, h, y0);
  shape.holes = openings.map(o => holePath(o.kind, o.w, o.h, o.x, o.y));
  b.add(S.wall, extrude(shape, t), m);
  for (const o of openings) {
    addOpening(b, {
      kind: o.kind, w: o.w, h: o.h, reveal: o.reveal ?? reveal ?? t * 0.75,
      glass: o.glass !== false, bars: o.bars !== false, sill: o.sill !== false, head: o.head !== false,
      surround: S.trim, pane: S.glass,
      m: m.clone().multiply(T(o.x, o.y, t)),
    });
  }
}

export function wallRun(zoneId, { length = 40, height = 8, thickness = 2.4, seed: sv = 0 } = {}) {
  const z = zone(zoneId);
  const R = seed(sv, length, height, thickness);
  const S = palette(z, true);
  const b = new Batch(zoneId);
  const g = new THREE.Group();

  const foot = 1.9;
  const n = Math.max(3, Math.round(length / TUNING.wallSeg));
  const segL = length / n;
  const gate = length > 24;
  const gateSpan = 2;
  const gate0 = gate ? Math.max(1, Math.floor((n - gateSpan) / 2)) : -1;
  const gate1 = gate0 + gateSpan - 1;
  const inGate = i => gate && i >= gate0 && i <= gate1;
  const gateW = Math.min(8.1, thickness * 2.4);
  const gateH = Math.min(height * 0.66, gateW * 1.5);
  const houseH = height + 6.6;

  // the parapet steps once or twice along the run so the top edge is never one long line
  const segTop = [];
  let cur = height;
  for (let i = 0; i < n; i++) {
    if (i > 0 && !inGate(i) && !inGate(i - 1) && R() < 0.24) cur = height + span(R, -1.35, 1.5);
    segTop[i] = inGate(i) ? houseH : cur;
  }

  // One stretch has come down. A 56 m parapet running dead level is a silhouette failure on its
  // own, and a breach with a rubble spill reads at any distance where merlon jitter does not.
  let ruin = -1;
  const free = i => i > 0 && i < n - 1 && !inGate(i) && !inGate(i - 1) && !inGate(i + 1);
  if (n >= 6) {
    for (let t = 0; t < 14 && ruin < 0; t++) {
      const i = 1 + Math.floor(R() * (n - 2));
      if (free(i)) ruin = i;
    }
  }
  if (ruin >= 0) segTop[ruin] = foot + (height - foot) * span(R, 0.34, 0.5);

  // and one stretch carries a timber hoarding, which projects past the wall face and puts a
  // pitched roof above the parapet line
  let hoard = -1;
  if (n >= 7) {
    for (let t = 0; t < 14 && hoard < 0; t++) {
      const i = 1 + Math.floor(R() * (n - 2));
      if (free(i) && Math.abs(i - ruin) > 1) hoard = i;
    }
  }

  b.add(S.wall, taperBox(length, thickness, foot, length, thickness + 1.73), T(0, foot / 2, 0));
  addSkirt(b, { m: T(0, 0, 0), length: length + 0.75, thickness: thickness + 1.73, h: 0.51 });

  for (let i = 0; i < n; i++) {
    if (inGate(i) && i !== gate0) continue;
    const wide = inGate(i) ? gateSpan * segL : segL;
    const x = -length / 2 + segL * i + wide / 2;
    const top = segTop[i] - foot;
    const openings = [];

    if (inGate(i)) {
      openings.push({ kind: z.window.shape === 'square' ? 'arch' : z.window.shape, w: gateW, h: gateH, x: 0, y: 0, glass: false, bars: false, sill: false, reveal: thickness * 0.5 });
      for (const s of [-1, 1]) openings.push({ kind: z.window.shape, w: 1.13, h: 2.4, x: s * (gateW * 0.32), y: gateH + 2.7, reveal: thickness * 0.3 });
      openings.push({ kind: 'square', w: 0.48, h: 2.25, x: 0, y: gateH + 2.85, glass: false, bars: false, sill: false, head: false, reveal: thickness * 0.5 });
    } else if (R() < 0.42) {
      // capped against the panel: a 2.25 m slit at mid-height runs out of the top of a short run
      openings.push({ kind: 'square', w: 0.45, h: Math.min(2.25, top * 0.5), x: span(R, -0.9, 0.9), y: top * 0.45, glass: false, bars: false, sill: false, head: false, reveal: thickness * 0.62 });
    }

    // the gate module is a thicker block, so the gatehouse projects from both wall faces
    const pt = inGate(i) ? thickness + 1.95 : thickness;
    panel(b, S, { m: T(x, foot, -pt / 2), w: wide + 0.02, h: top, t: pt, openings });
  }

  // buttresses — sparse, and they are what stops the base reading as an extruded line
  for (let i = 1; i < n; i++) {
    if (inGate(i) || inGate(i - 1) || i % TUNING.buttressEvery !== 0) continue;
    const x = -length / 2 + segL * i;
    for (const side of [-1, 1]) {
      const bh = (segTop[i] - foot) * span(R, 0.68, 0.84);
      const sd = side * (thickness / 2 + 0.75);
      b.add(S.wall, taperBox(2.1, 1.65, bh, 2.55, 2.63), T(x, foot + bh / 2, sd));
      b.add(S.trim, taperBox(2.25, 1.88, 0.6, 2.43, 2.85), T(x, foot + bh + 0.3, sd));
      b.add(S.wall, taperBox(1.35, 0.42, 0.83, 2.03, 1.73), T(x, foot + bh + 0.99, sd - side * 0.51));
    }
  }

  // parapet, corbel table and merlons follow each level stretch, so a step is a real step
  let i0 = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && segTop[i] === segTop[i0]) continue;
    const x0 = -length / 2 + segL * i0, x1 = -length / 2 + segL * i;
    const len = x1 - x0, mid = (x0 + x1) / 2, ht = segTop[i0];
    if (i0 === ruin) {
      // a ragged crown of broken courses instead of a parapet, and the stone that fell off it
      for (let k = 0; k < 6; k++) {
        const bw = len / 6;
        const bh = span(R, 0.18, 1.43) * (1 - Math.abs(k - 2.5) / 4);
        b.add(S.wall, new THREE.BoxGeometry(bw * 0.94, bh, thickness * span(R, 0.7, 1.0)),
          T(x0 + bw * (k + 0.5), ht + bh / 2, span(R, -0.45, 0.45)));
      }
      for (const side of [-1, 1]) {
        addRubble(b, R, { m: T(mid, 0, side * (thickness / 2 + 2.25)), length: len * 1.2, offset: side * 1.65, count: 16, size: 0.93, surface: S.trim });
      }
    } else if (ht !== houseH) {
      b.add(S.trim, taperBox(len, thickness + 0.42, 0.39, len, thickness + 0.15), T(mid, foot + (ht - foot) * 0.5, 0));
      addCorbels(b, { m: T(mid, ht, 0), length: len, thickness, surface: S.trim });
      b.add(S.trim, new THREE.BoxGeometry(len, 0.51, thickness + 1.43), T(mid, ht + 0.26, 0));
      addMerlons(b, R, { m: T(mid, ht + 0.51, 0), length: len, thickness: thickness * 0.68, style: z.edges, height: 1.95, step: 2.9, surface: S.wall, cap: S.trim, crest: z.crest, crestSurface: S.crest });
    }
    i0 = i;
  }

  if (hoard >= 0) {
    const hx = -length / 2 + segL * (hoard + 0.5), hy = segTop[hoard] + 0.75;
    const hl = segL * 1.55, out = thickness / 2 + 2.25;
    for (const side of [-1, 1]) {
      const zc = side * out;
      b.add(S.trim, new THREE.BoxGeometry(hl, 0.3, 2.85), T(hx, hy, zc));
      b.add(S.trim, new THREE.BoxGeometry(hl, 2.25, 0.21), T(hx, hy + 1.13, zc + side * 1.35));
      b.add(S.trim, new THREE.BoxGeometry(hl + 0.75, 0.24, 3.9),
        T(hx, hy + 3.08, zc + side * 0.3, 0, side * 0.34));
      for (let k = 0; k < 3; k++) {
        const px = hx + (k - 1) * hl * 0.42;
        b.add(S.trim, new THREE.BoxGeometry(0.3, 3.0, 0.3), T(px, hy + 1.58, zc + side * 1.28));
        b.add(S.trim, new THREE.BoxGeometry(0.27, 3.45, 0.27), T(px, hy - 1.43, zc - side * 0.53, 0, side * 0.5));
      }
    }
  }

  if (gate) {
    const gx = -length / 2 + segL * gate0 + gateSpan * segL / 2;
    for (const side of [-1, 1]) {
      const px = gx + side * (gateW / 2 + 1.43);
      b.add(S.wall, taperBox(1.8, thickness + 1.65, houseH - 1.65, 2.25, thickness + 2.55), T(px, (houseH - 1.65) / 2, 0));
    }
    const bar = 0.11;
    for (let i = 0; i < 6; i++) b.add(S.trim, new THREE.BoxGeometry(bar, gateH * 0.95, bar), T(gx - gateW / 2 + gateW * (i + 0.5) / 6, foot + gateH * 0.48, -thickness * 0.18));
    for (let i = 0; i < 4; i++) b.add(S.trim, new THREE.BoxGeometry(gateW * 0.92, bar, bar), T(gx, foot + gateH * (0.18 + i * 0.26), -thickness * 0.18));

    const gw = gateSpan * segL + 0.75, gd = thickness + 2.25;
    addCorbels(b, { m: T(gx, houseH, 0), length: gw, thickness: gd - 0.75, surface: S.trim });
    b.add(S.trim, new THREE.BoxGeometry(gw, 0.6, gd + 0.45), T(gx, houseH + 0.3, 0));
    const grise = gd * (z.edges === 'sharp' ? 0.95 : 0.66);
    const gRoof = roofSlab({ w: gd, d: gw, rise: grise, over: 0.6, th: z.roof.tile === 'thatch' ? 0.75 : 0.48, profile: z.edges === 'curved' ? 'curved' : 'flat' });
    gRoof.rotateY(Math.PI / 2);
    b.add(S.roof, gRoof, T(gx, houseH + 0.6, 0), true);
    b.add(S.trim, new THREE.BoxGeometry(gw + 1.35, 0.3, 0.63), T(gx, houseH + 0.6 + grise - 0.11, 0));
    addCrest(b, z.crest, R, { m: T(gx, houseH + 0.66 + grise, 0), length: gw * 0.8, surface: S.crest });
    for (const side of [-1, 1]) {
      panel(b, S, {
        m: T(gx + side * (gw / 2 - 0.45), houseH + 0.6, 0, side * Math.PI / 2), t: 0.45,
        shape: gableShape(gd, grise, 0.6, z.edges === 'curved' ? 'curved' : 'flat', 0.48),
        openings: [{ kind: z.window.shape, w: 0.9, h: 1.65, x: 0, y: 0.38, reveal: 0.36, sill: false }],
      });
    }
  }

  g.userData = { kind: 'wallRun', zoneId, length, height, thickness };
  return finish(b, g, zoneId);
}

// Above this shaft height a tower is a landmark rather than a turret and is dressed on an
// absolute storey rhythm instead of in thirds. STOREY is floor-to-floor at K = 1.5.
const LOFTY = 30, STOREY = 8.4;

export function tower(zoneId, { radius = 4, height = 18, sides = 16, seed: sv = 0 } = {}) {
  const z = zone(zoneId);
  const R = seed(sv, radius, height, sides);
  const S = palette(z, true);
  const b = new Batch(zoneId);
  const g = new THREE.Group();

  const n = Math.max(8, Math.min(16, sides));
  const apo = radius * Math.cos(Math.PI / n);
  const pw = 2 * radius * Math.sin(Math.PI / n);
  const t = 0.69;
  const foot = 2.55;
  const shaftH = height - foot;
  // Openings are cut as holes in a panel exactly `shaftH` tall, so a hole that runs past the top
  // breaks the extrusion. At K the top level sits at 0.88·shaftH and a 2.85 m light no longer fits.
  const headroom = y => Math.max(0.7, shaftH - y - 0.6);

  b.add(S.wall, new THREE.CylinderGeometry(radius * 1.02, radius * TOWER_FOOT, foot, n), T(0, foot / 2, 0));
  b.add(S.wall, new THREE.CylinderGeometry(radius * (TOWER_FOOT - 0.08), radius * TOWER_FOOT, 0.6, n), T(0, 0.3, 0));

  const core = Math.max(0.9, apo - t - 0.09);
  b.add(S.wall, new THREE.CylinderGeometry(core, core, height, n), T(0, height / 2, 0));

  // Every band below is a fraction of the shaft, which is right for the two- and three-storey
  // turrets this was tuned on and wrong for a landmark: at 58 m the lowest opening lands 21 m up
  // and the whole height anyone stands next to is blank. A tall shaft gets a storey rhythm, a
  // door, and the lantern stage a lantern tower is named for.
  const lofty = shaftH > LOFTY;
  const lit = 2 + Math.floor(R() * 2);
  const levels = [shaftH * 0.34, shaftH * 0.66, shaftH * 0.88];
  if (lofty) {
    levels.length = 0;
    for (let y = STOREY * 0.66; y < shaftH - 5; y += STOREY) levels.push(y);
  }
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const m = T(Math.sin(a) * (apo - t), foot, Math.cos(a) * (apo - t), a);
    const openings = [];
    for (let L = 0; L < levels.length; L++) {
      if (R() > (L === levels.length - 1 ? 0.55 : lofty ? 0.44 : 0.34)) continue;
      const big = L > 0 && lit > 0;
      openings.push(big
        ? { kind: z.window.shape, w: Math.min(pw * 0.5, 1.5), h: Math.min(2.85, headroom(levels[L])), x: 0, y: levels[L], reveal: t * 0.8 }
        : { kind: 'square', w: 0.42, h: Math.min(2.1, headroom(levels[L])), x: 0, y: levels[L], glass: false, bars: false, sill: false, head: false, reveal: t * 0.72 });
    }
    // one face gets the way in, standing on the plinth the batter already climbs to
    if (lofty && i === 0) {
      openings.push({ kind: z.window.shape, w: Math.min(pw * 0.62, 2.4), h: 3.6, x: 0, y: 0.3, reveal: t * 0.9, glass: false, bars: false, sill: false });
    }
    panel(b, S, { m, w: pw + 0.03, h: shaftH, t, openings });
  }

  const courses = lofty ? levels.map(y => y - STOREY * 0.36) : [shaftH * 0.36, shaftH * 0.7];
  for (const f of courses) {
    b.add(S.trim, new THREE.CylinderGeometry(radius + 0.21, radius + 0.21, 0.36, n), T(0, foot + f, 0));
  }

  // machicolated head: corbels, an overhanging ring, then the parapet
  const topY = foot + shaftH;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    b.add(S.trim, taperBox(0.45, 0.75, 0.75, 0.24, 0.39), T(Math.sin(a) * (radius + 0.24), topY - 0.38, Math.cos(a) * (radius + 0.24), a));
  }
  const ring = radius * 1.26;
  b.add(S.trim, new THREE.CylinderGeometry(ring, radius + 0.15, 0.69, n), T(0, topY + 0.35, 0));

  const mw = 2 * ring * Math.sin(Math.PI / n) * 0.66;
  for (let i = 0; i < n; i++) {
    if (R() < 0.08) continue;
    const a = (i / n) * Math.PI * 2;
    const mh = 2.0 * span(R, 0.9, 1.12);
    const m = T(Math.sin(a) * (ring - 0.33), topY + 0.69, Math.cos(a) * (ring - 0.33), a);
    b.add(S.wall, new THREE.BoxGeometry(mw, mh, 0.75), m.clone().multiply(T(0, mh / 2, 0)));
    if (z.edges === 'sharp') b.add(S.trim, new THREE.ConeGeometry(mw * 0.7, 0.51, 4).rotateY(Math.PI / 4), m.clone().multiply(T(0, mh + 0.26, 0)));
    else if (z.edges === 'curved') b.add(S.trim, new THREE.CylinderGeometry(mw * 0.46, mw * 0.46, 0.87, 7, 1, false, 0, Math.PI).rotateX(-Math.PI / 2), m.clone().multiply(T(0, mh - 0.03, 0)));
    else b.add(S.trim, new THREE.BoxGeometry(mw + 0.21, 0.18, 0.9), m.clone().multiply(T(0, mh + 0.09, 0)));
    if (z.crest.type === 'spikes' && R() < z.crest.density) {
      const sh = span(R, 1.05, 1.65);
      b.add(S.crest, new THREE.ConeGeometry(0.11, sh, 4).rotateY(Math.PI / 4), m.clone().multiply(T(0, mh + 0.51 + sh / 2, 0)));
    }
  }

  // The lantern: a glazed stage standing inside the parapet, carrying the roof. It is what the
  // tower is named for and the only part of it lit from the inside after dark.
  let crown = radius, roofY0 = topY + 2.4;
  if (lofty) {
    // Half the shaft's faces: a light every 60° reads as a lantern from the ground and costs half
    // the openings, and this object is pinned to full detail everywhere in the world.
    const ln = Math.max(6, n >> 1);
    const lr = radius * 0.58, lt = 0.42, lh = 7.5;
    const lapo = lr * Math.cos(Math.PI / ln), lpw = 2 * lr * Math.sin(Math.PI / ln);
    const ly = topY + 1.05;
    b.add(S.wall, new THREE.CylinderGeometry(lr * 1.12, lr * 1.24, 0.7, ln), T(0, ly + 0.35, 0));
    for (let i = 0; i < ln; i++) {
      const a = ((i + 0.5) / ln) * Math.PI * 2;
      panel(b, S, {
        m: T(Math.sin(a) * (lapo - lt), ly + 0.7, Math.cos(a) * (lapo - lt), a),
        w: lpw + 0.03, h: lh, t: lt,
        openings: [{ kind: z.window.shape, w: Math.min(lpw * 0.5, 2.1), h: lh - 2.4, x: 0, y: 0.9, reveal: lt * 0.8, bars: false }],
      });
    }
    b.add(S.trim, new THREE.CylinderGeometry(lr * 1.3, lr * 1.06, 0.6, ln), T(0, ly + lh + 1.0, 0));
    crown = lr;
    roofY0 = ly + lh + 1.3;
  }

  // roof: bell for curved edges, spire for sharp, plain cone for flat
  const pitch = z.edges === 'sharp' ? 2.6 : z.edges === 'curved' ? 1.2 : 0.9;
  const rr = crown * 1.18, rh = crown * pitch * span(R, 0.94, 1.08);
  const curve = z.edges === 'curved' ? 1.6 : 1.0;
  const prof = [V2(rr * 1.12, -0.15), V2(rr * 1.14, 0.24)];
  for (let i = 1; i <= 5; i++) {
    const u = i / 5;
    prof.push(V2(rr * (1 - u), 0.45 + rh * Math.pow(u, curve)));
  }
  b.add(S.roof, new THREE.LatheGeometry(prof, n), T(0, roofY0, 0));
  b.add(S.crest, new THREE.SphereGeometry(0.36, 7, 5), T(0, roofY0 + 0.45 + rh + 0.15, 0));

  if (R() < 0.7) {
    const ph = 3.6;
    b.add(S.trim, new THREE.CylinderGeometry(0.09, 0.11, ph, 5), T(0, roofY0 + 0.6 + rh + ph / 2, 0));
    const fl = new THREE.BufferGeometry();
    const fy = roofY0 + 0.6 + rh + ph - 0.38;
    fl.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2.25, -0.42, 0, 0, -1.43, 0, 0, 0, 0, 0, -1.43, 0, 2.25, -0.42, 0], 3));
    fl.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 0.7, 0, 0, 0, 1, 0, 0, 1, 0.7], 2));
    fl.computeVertexNormals();
    b.add(S.crest, fl, T(0.06, fy, 0, span(R, 0, 6.28)));
  }

  g.userData = { kind: 'tower', zoneId, radius, height };
  return finish(b, g, zoneId);
}

export function house(zoneId, { w = 8, d = 7, h = 6, hall = 0, seed: sv = 0 } = {}) {
  const z = zone(zoneId);
  const R = seed(sv, w, d, h);
  const dressed = R() < 0.55;
  const S = palette(z, dressed);
  const b = new Batch(zoneId);
  const g = new THREE.Group();

  const t = TUNING.panelT;
  const plinth = 0.66;
  const wallTop = h;
  const storeys = wallTop - plinth > 6.6 ? 2 : 1;
  const kind = z.window.shape;
  const over = z.roof.overhang ?? TUNING.eaves;

  // The plinth is the floor. There is no solid core: the four panels, the gable ends, the roof
  // slab and the plinth already close the shell, and a core would leave nowhere for interior.js
  // to put a room.
  b.add(S.wall, taperBox(w + 0.45, d + 0.45, plinth, w + 1.5, d + 1.5), T(0, plinth / 2, 0));
  addSkirt(b, { m: T(0, 0, 0), length: w + 1.35, thickness: d + 1.35, h: 0.36, flare: 0.75, surface: S.wall });

  const rows = storeys === 2 ? [plinth + 1.5, plinth + (wallTop - plinth) * 0.55] : [plinth + (wallTop - plinth) * 0.32];
  const winH = storeys === 2 ? Math.min(2.4, (wallTop - plinth) * 0.3) : Math.min(2.9, (wallTop - plinth) * 0.44);
  const winW = kind === 'lancet' ? 1.05 : 1.35;

  const faces = [
    { m: T(0, 0, d / 2 - t), span: w, front: true },
    { m: T(0, 0, -(d / 2 - t), Math.PI), span: w },
    { m: T(w / 2 - t, 0, 0, Math.PI / 2), span: d },
    { m: T(-(w / 2 - t), 0, 0, -Math.PI / 2), span: d },
  ];

  // A great hall's doorway is architecture, not ergonomics, so it scales with the building the
  // way the walls do. Everything else about the door — the steps, the leaf, the reveal — does not.
  const dw = hall ? 5.4 : 1.75, dh = hall ? 6.0 : 3.20;
  // A 1.75 m door and a 1.35 m window on a 2 m slot pitch overlap, and two holes that cross in
  // one extruded shape is a broken panel. Skip every slot the door actually reaches.
  const doorReach = dw / 2 + winW / 2 + 0.22;
  const skip = 1 - 0.9 * (z.window.density ?? 1);

  let doorFace = 0;
  let door = null;
  // A great hall does not get the cottage's 2 m slot grid. Its windows are the ones the room
  // inside it has, read out of hallplan.js — the same list interior.js cuts its own walls for —
  // because the two surfaces disagreeing is what Aaron saw from the road and then from the
  // bench. `open` lights are left unglazed on purpose: with a hole in both surfaces they are the
  // ones you can see through, and addOpening still puts iron bars across them.
  //   The interior face is 0.09 m inside the panel, so its wall is `2t + 0.18` shorter than this
  // one; both use that shorter span for their bay midpoints or the two grids drift apart.
  const band = hall ? hallBand(plinth, wallTop, z.interior?.ceiling ?? 1) : null;
  const ROLE = ['door', 'boards', 'side', 'side'];
  for (const [fi, f] of faces.entries()) {
    const openings = [];
    // The cottage grid still runs for a hall, and its draws are still taken — they are simply not
    // built. `R()` is one stream shared by every later decision in this function, the roof ridge
    // among them, so skipping ~110 draws silently re-rolls the whole building. It did: the roof
    // flipped axis and its slab came through the gable as a stone chevron over the contract
    // boards. Anything that changes how often R() is called here changes the building.
    const slots = Math.max(1, Math.floor((f.span - 1.2) / 2.0));
    const step = f.span / (slots + 1);
    for (const [ri, ry] of rows.entries()) {
      for (let i = 1; i <= slots; i++) {
        const x = -f.span / 2 + step * i;
        if (fi === doorFace && ri === 0 && Math.abs(x) < doorReach) continue;
        if (R() < skip) continue;
        if (!hall) openings.push({ kind, w: winW, h: winH, x, y: ry, reveal: t * 0.8 });
      }
    }
    if (hall) {
      for (const o of hallWindows({ span: f.span - 2 * t - 0.18, band, kind, role: ROLE[fi], greatDoorW: dw + 0.5 })) {
        openings.push({ kind: o.kind, w: o.w, h: o.h, x: o.x, y: o.y, reveal: t * 0.8, glass: !o.open });
      }
    }
    if (fi === doorFace) {
      openings.push({ kind, w: dw, h: dh, x: 0, y: plinth - 0.02, glass: false, bars: false, sill: false, reveal: t * 0.9 });
      // rise stays 0.19 — a step is ergonomics, not architecture. Five of them clear a 0.66 plinth.
      addSteps(b, { m: f.m.clone().multiply(T(0, plinth, t + 0.03)), w: dw + 0.75, count: 5, surface: S.trim });
      // The leaf is not baked in: doors.js draws every door in the world from one instanced
      // mesh per zone, which is what lets the one you walk through swing without a mesh each.
      door = {
        // A hall's doors stand open, so they are static geometry here rather than leaves in
        // doors.js's instanced set. Nothing swings; you walk straight through.
        open: !!hall,
        w: dw, h: dh, leafW: dw - 0.1, leafH: dh - 0.08,
        z: d / 2, floor: plinth, leafZ: d / 2 - t * 0.85, leafY: plinth + (dh - 0.08) / 2 - 0.02,
      };
      if (dressed && !hall) {
        const hood = hall ? 0.3 : 0.83;
        b.add(S.trim, taperBox(dw + 2.25, 1.35, 0.33, dw + 1.95, 0.9), f.m.clone().multiply(T(0, plinth + dh + hood, t + 0.48)));
        for (const s of [-1, 1]) b.add(S.trim, new THREE.BoxGeometry(0.21, 1.13, 0.21), f.m.clone().multiply(T(s * (dw / 2 + 0.75), plinth + dh + hood - 0.6, t + 0.83)));
      }
      if (hall) door.leaves = openLeaves(b, S, { m: f.m, dw, dh, t, floor: plinth, fz: d / 2 - t });
    }
    panel(b, S, { m: f.m, w: f.span, h: wallTop, t, openings });
  }

  if (dressed) addQuoins(b, R, { m: T(0, 0, 0), w, d, h: wallTop, from: plinth, surface: S.trim });
  // The mid-height string course. It is one solid box for a cottage, where an interior ceiling is
  // always below it and nothing ever sees the underside — but a great hall is one room to the
  // roof, and that box is then a floor slab straight through the middle of it at 5.7 m. (It is
  // what made the first hall read as a low barn: everything above it, roof included, was hidden.)
  // A hall gets the same band drawn as four faces round the outside instead.
  if (storeys === 2) {
    const by = plinth + (wallTop - plinth) * 0.5 - 0.53;
    if (!hall) b.add(S.trim, new THREE.BoxGeometry(w + 0.36, 0.33, d + 0.36), T(0, by, 0));
    else for (const [bw, bd, bx, bz, front] of [[w + 0.36, 0.36, 0, (d + 0.36) / 2 - 0.18, 1], [w + 0.36, 0.36, 0, -((d + 0.36) / 2 - 0.18), 0],
                                                [0.36, d - 0.36, (w + 0.36) / 2 - 0.18, 0, 0], [0.36, d - 0.36, -((w + 0.36) / 2 - 0.18), 0, 0]]) {
      // On the front the band sits a metre below the head of a six-metre arch, so run straight it
      // is a stone bar hung across the doorway — the same fault the hall's base course had inside.
      const cut = front && by - 0.165 < plinth + dh ? dw / 2 + 0.45 : 0;
      for (const [u0, u1] of cut ? [[-bw / 2, -cut], [cut, bw / 2]] : [[-bw / 2, bw / 2]]) {
        b.add(S.trim, new THREE.BoxGeometry(u1 - u0, 0.33, bd), T(bx + (u0 + u1) / 2, by, bz));
      }
    }
  }

  // half-timber relief on the upper band of the two long faces
  if (dressed && storeys === 2 && R() < 0.6) {
    const y0 = plinth + (wallTop - plinth) * 0.5 - 0.36, bandH = wallTop - y0 - 0.15;
    for (const f of [faces[0], faces[1]]) {
      const cols = Math.max(2, Math.round(f.span / 2.4));
      for (let i = 0; i <= cols; i++) {
        b.add(S.trim, new THREE.BoxGeometry(0.22, bandH, 0.11), f.m.clone().multiply(T(-f.span / 2 + f.span * i / cols, y0 + bandH / 2, t + 0.055)));
      }
      b.add(S.trim, new THREE.BoxGeometry(f.span, 0.24, 0.11), f.m.clone().multiply(T(0, y0 + bandH, t + 0.055)));
    }
  }

  // LATENT: a hall's ridge is a coin toss here, while interior.js hard-codes the opposite —
  // *"the ridge runs along the door axis"* — and puts its gable walls on the ±z faces to match.
  // The two agree only because the draw lands the right way up for this seed. Pinning it to the
  // interior's axis is the obvious fix and it is NOT taken here: tried, it moves the exterior
  // roof slab down over the side walls, where the light zone's curved profile puts it straight
  // through the interior roof, and untangling that is a roof job, not a window one.
  const ridgeX = R() < 0.75 ? w >= d : w < d;
  const spanW = ridgeX ? d : w;
  const ridgeLen = ridgeX ? w : d;
  const profile = z.edges === 'curved' ? 'curved' : 'flat';
  const pitchBase = z.edges === 'sharp' ? 0.95 : z.edges === 'curved' ? 0.7 : 0.6;
  // a roof may never dwarf the walls it sits on, however the pitch rolls
  const rise = Math.min(spanW * pitchBase * span(R, 0.86, 1.16) * (R() < 0.18 ? 1.45 : 1), wallTop * 0.95, spanW * 0.85);
  const th = z.roof.tile === 'thatch' ? 0.75 : 0.45;

  const roof = roofSlab({ w: spanW, d: ridgeLen, rise, over, th, profile });
  if (ridgeX) roof.rotateY(Math.PI / 2);
  b.add(S.roof, roof, T(0, wallTop, 0), true);

  const gShape = () => gableShape(spanW, rise, over, profile, th);
  const gEnds = ridgeX
    ? [T(w / 2 - t, wallTop, 0, Math.PI / 2), T(-(w / 2 - t), wallTop, 0, -Math.PI / 2)]
    : [T(0, wallTop, d / 2 - t), T(0, wallTop, -(d / 2 - t), Math.PI)];
  for (const gm of gEnds) {
    const openings = [];
    if (R() < 0.85) {
      const pair = spanW > 11.25 && rise > 4.8 && R() < 0.5;
      const gh = Math.min(2.25, rise * 0.42);
      for (const gx of pair ? [-1.28, 1.28] : [0]) openings.push({ kind, w: winW * 0.85, h: gh, x: gx, y: rise * 0.16, reveal: t * 0.75 });
    }
    panel(b, S, { m: gm, t, shape: gShape(), openings });
  }

  const ridgeM = ridgeX ? T(0, wallTop + rise, 0) : T(0, wallTop + rise, 0, Math.PI / 2);
  b.add(S.trim, new THREE.BoxGeometry(ridgeLen + over * 1.6, 0.3, 0.66), ridgeM.clone().multiply(T(0, -0.11, 0)));

  // barge boards down each gable end
  const slopeA = Math.atan2(rise, spanW / 2 + over);
  const bl = Math.hypot(spanW / 2 + over, rise);
  for (const end of [-1, 1]) for (const s of [-1, 1]) {
    const m = ridgeM.clone().multiply(T(end * (ridgeLen / 2 + over + 0.075), 0, 0, 0, 0, 0));
    b.add(S.trim, new THREE.BoxGeometry(0.18, 0.36, bl), m.clone().multiply(T(0, -rise / 2 - 0.09, s * (spanW / 4 + over / 2), 0, s * slopeA)));
  }

  addCrest(b, z.crest, R, { m: ridgeM.clone().multiply(T(0, 0.04, 0)), length: ridgeLen * 0.9, surface: S.crest });

  // dormer — the single best silhouette break on a small house
  if (R() < 0.5 && spanW > 8.25) {
    const dmW = 2.6, dr = 1.35, dOver = 0.24, dTh = th * 0.7;
    const off = spanW * 0.3;
    const sideSign = R() < 0.5 ? 1 : -1;
    const along = span(R, -ridgeLen * 0.24, ridgeLen * 0.24);
    const yOnRoof = wallTop + roofY(spanW, rise, over, profile, off);
    const fm = ridgeX
      ? T(along, yOnRoof - 0.75, sideSign * off, sideSign > 0 ? 0 : Math.PI)
      : T(sideSign * off, yOnRoof - 0.75, along, sideSign > 0 ? Math.PI / 2 : -Math.PI / 2);
    panel(b, S, { m: fm.clone().multiply(T(0, 0, 0.75)), w: dmW, h: 2.25, t: 0.36, openings: [{ kind, w: 0.93, h: 1.5, x: 0, y: 0.45, reveal: 0.3, sill: false }] });
    panel(b, S, { m: fm.clone().multiply(T(0, 2.25, 0.75)), t: 0.36, shape: gableShape(dmW + 0.45, dr, dOver, profile, dTh) });
    b.add(S.roof, roofSlab({ w: dmW + 0.45, d: 2.25, rise: dr, over: dOver, th: dTh, profile }), fm.clone().multiply(T(0, 2.25, 0)), true);
  }

  // lean-to: breaks the eaves line and gives the roofline a second, lower step
  if (R() < 0.45) {
    const lw = span(R, 2.55, 3.75), ld = Math.min(d * 0.7, 6.9), lh = wallTop * span(R, 0.42, 0.56);
    const sx = R() < 0.5 ? 1 : -1;
    const lz = span(R, -d * 0.12, d * 0.12);
    const pitch = Math.atan2(lw * 0.62, lw + 0.9);
    b.add(S.wall, taperBox(lw, ld, lh, lw + 0.33, ld + 0.33), T(sx * (w / 2 + lw / 2 - 0.18), lh / 2, lz));
    b.add(S.roof, new THREE.BoxGeometry((lw + 0.9) / Math.cos(pitch), th * 0.8, ld + 0.75),
      T(sx * (w / 2 + lw / 2 - 0.38), lh + lw * 0.32, lz, 0, 0, -sx * pitch));
  }

  // projecting gabled bay: the cheapest way to stop a house reading as one box
  if (R() < 0.5) {
    const f = faces[1 + Math.floor(R() * 3)];
    const bw = Math.min(f.span * 0.36, 3.9), bd = 1.9, bh = wallTop * span(R, 0.44, 0.62);
    const om = f.m.clone().multiply(T(span(R, -f.span * 0.2, f.span * 0.2), 0, t));
    const brise = (bw / 2 + 0.48) * Math.max(0.85, pitchBase * 1.35);
    b.add(S.wall, taperBox(bw + 0.42, bd + 0.75, plinth, bw + 1.28, bd + 1.5), om.clone().multiply(T(0, plinth / 2, bd / 2 - 0.45)));
    b.add(S.wall, new THREE.BoxGeometry(bw, bh - plinth, bd + 0.6), om.clone().multiply(T(0, plinth + (bh - plinth) / 2, bd / 2 - 0.53)));
    panel(b, S, { m: om.clone().multiply(T(0, plinth, bd - t)), w: bw, h: bh - plinth, t, openings: [{ kind, w: winW, h: Math.min(winH, (bh - plinth) * 0.5), x: 0, y: (bh - plinth) * 0.3, reveal: t * 0.8 }] });
    b.add(S.roof, roofSlab({ w: bw, d: bd + 0.75, rise: brise, over: 0.48, th: th * 0.85, profile }), om.clone().multiply(T(0, bh, bd / 2 - 0.53)), true);
    panel(b, S, { m: om.clone().multiply(T(0, bh, bd - t)), t, shape: gableShape(bw, brise, 0.48, profile, th * 0.85) });
  }

  // chimney
  if (R() < 0.88) {
    const cx = ridgeX ? span(R, -ridgeLen * 0.36, ridgeLen * 0.36) : 0;
    const cz = ridgeX ? 0 : span(R, -ridgeLen * 0.36, ridgeLen * 0.36);
    addChimney(b, R, { m: T(cx, wallTop + rise - 0.6, cz), w: 1.35, h: span(R, 2.55, 4.65), surface: S.wall, cap: S.trim });
  }

  g.userData = { kind: 'house', zoneId, w, d, h, t, plinth, wallTop, hall: !!hall, door };
  return finish(b, g, zoneId);
}

// Two leaves standing open into the reveal, hinged at the jambs. Static: nothing closes them.
// Boarded, ledged and studded — the same door interior.js hangs in the hall's own inner
// doorways, drawn here with the outdoor kit's one timber surface.
//
// The swing was 1.9 rad, and past a right angle a leaf lies flat behind its own jamb: from the
// road the arch read as empty. Returns each leaf's footprint in the building's frame so the room
// can stand a collider in it.
const LEAF_SWING = 1.25;

function openLeaves(b, S, { m, dw, dh, t, floor, fz }) {
  const lw = dw / 2 - 0.06, lh = dh - 0.1;
  const planks = 5, pw = lw / planks;
  const out = [];
  for (const s of [-1, 1]) {
    const ry = -s * LEAF_SWING;
    const hinge = m.clone().multiply(T(s * dw / 2, floor + lh / 2, t * 0.4, ry));
    // `u` runs from the hinge along the leaf; the boarded face is the one that swings outward.
    const at = (u, y, z) => hinge.clone().multiply(T(-s * u, y, z));
    b.add('wood', new THREE.BoxGeometry(lw, lh, 0.07), at(lw / 2, 0, 0));
    for (let i = 0; i < planks; i++) {
      b.add('wood', new THREE.BoxGeometry(pw - 0.05, lh - 0.04, 0.10), at((i + 0.5) * pw, 0, 0.08));
    }
    // Boards outside, ledges behind them: both faces of a leaf standing open are on show, and a
    // flat back is the half a critic pass would call an unfinished slab.
    for (const y of [-lh * 0.32, 0, lh * 0.32]) {
      b.add(S.trim, new THREE.BoxGeometry(lw - 0.18, 0.16, 0.10), at(lw / 2, y, -0.08));
      for (const u of [0.22, lw - 0.22]) b.add(S.trim, new THREE.BoxGeometry(0.13, 0.13, 0.13), at(u, y, 0.15));
    }
    b.add(S.trim, new THREE.TorusGeometry(0.20, 0.05, 4, 10), at(lw - 0.34, -lh * 0.14, 0.17));
    const c = Math.cos(ry), sn = Math.sin(ry);
    out.push({
      x: s * (dw / 2 - (lw / 2) * c), z: fz + t * 0.4 + s * (lw / 2) * sn,
      hw: lw / 2, hd: 0.16, ry, top: floor + lh,
    });
  }
  return out;
}
