// Vermin. One parameterised quadruped — rat, boar and crab — instanced per kind and per zone,
// with gait, lunge, flinch and death driven in the vertex shader off per-instance state.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { onEnvIntensity } from './materials.js';
import { rng, span } from './details.js';
import { heightAt, waterY, CENTERS, nearCamera, zoneAt } from './terrain.js';
import { walkStep, groundAt, collidersReady } from './colliders.js';
import { paint } from './tree.js';
import { defineScenario, frameCamera } from '../scenarios.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const PART = { body: 0, head: 1, tail: 2, limb: 3, prop: 4 };
const ACT = { none: 0, attack: 1, hurt: 2, die: 3 };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function faceNormal(a, b, c) {
  _a.fromArray(a.p); _b.fromArray(b.p).sub(_a); _c.fromArray(c.p).sub(_a);
  _b.cross(_c).normalize();
  return [_b.x, _b.y, _b.z];
}

class Build {
  constructor(aoTop) {
    this.p = []; this.n = []; this.c = []; this.uv = []; this.k = []; this.v = []; this.g = [];
    this.tris = 0;
    this.aoTop = aoTop;
    this.at(PART.body, [0, 0, 0]);
  }
  at(part, pivot, gait = [0, 1, 0], flip = false) {
    this.part = part; this.pivot = pivot; this.gait = gait; this.flip = flip;
    return this;
  }
  vert(v, n) {
    this.p.push(v.p[0], v.p[1], v.p[2]);
    this.n.push(n[0], n[1], n[2]);
    const ao = 0.58 + 0.42 * Math.min(1, Math.max(0, v.p[1] / this.aoTop));
    this.c.push(v.c[0] * ao, v.c[1] * ao, v.c[2] * ao);
    const u = v.uv || [(v.p[0] + v.p[2]) * 5, v.p[1] * 6];
    this.uv.push(u[0], u[1]);
    this.k.push(this.part);
    this.v.push(this.pivot[0], this.pivot[1], this.pivot[2]);
    this.g.push(this.gait[0], this.gait[1], this.gait[2]);
  }
  tri(a, b, c) {
    if (this.flip) { const t = b; b = c; c = t; }
    const n = faceNormal(a, b, c);
    this.vert(a, n); this.vert(b, n); this.vert(c, n);
    this.tris++;
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('aPivot', new THREE.Float32BufferAttribute(this.v, 3));
    g.setAttribute('aGait', new THREE.Float32BufferAttribute(this.g, 3));
    g.userData.tris = this.tris;
    return g;
  }
}

function shade(hex, dark) {
  const base = new THREE.Color(hex), low = new THREE.Color(dark);
  const c = new THREE.Color();
  return s => {
    c.copy(low).lerp(base, Math.min(1, Math.max(0, s)));
    if (s > 1) c.multiplyScalar(1 + (s - 1) * 0.6);
    return [c.r, c.g, c.b];
  };
}
const flat = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// Flatter underneath than a circle: a rat's belly sits on its legs, and a round section reads as
// a sausage from every angle the game ever shows it from.
function ringPt(R, j, seg, col, uvs = 4) {
  const a = (j % seg) / seg * TAU;
  const co = Math.cos(a), si = Math.sin(a);
  const squash = 1 - 0.22 * Math.max(0, -si);
  return {
    p: [co * R.rx * squash, R.y + si * R.ry * squash, R.z],
    c: col(R.s, si),
    uv: [(j % seg) / seg * 2, -R.z * uvs],
  };
}

function loft(B, rings, seg, col, { capBack = true, capFront = false, uvs } = {}) {
  const v = (i, j) => ringPt(rings[i], j, seg, col, uvs);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) B.quad(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j));
  }
  if (capFront) {
    const f = rings[0];
    const nose = { p: [0, f.y, f.z + f.rx * 0.55], c: col(f.s * 1.05, 0.4) };
    for (let j = 0; j < seg; j++) B.tri(v(0, j), v(0, j + 1), nose);
  }
  if (capBack) {
    const r = rings[rings.length - 1], i = rings.length - 1;
    const rear = { p: [0, r.y, r.z - r.rx * 0.7], c: col(r.s * 0.68, 0.2) };
    for (let j = 0; j < seg; j++) B.tri(v(i, j), v(i, j + 1), rear);
  }
}

// A limb, tail or claw: a prism swept along a polyline, cross-sections square to the local
// direction so one builder serves a vertical leg, a trailing tail and a diagonal claw arm.
function tube(B, pts, seg, col, { tip = true, uvs = 4 } = {}) {
  const dir = i => {
    const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(pts.length - 1, i + 1)].p;
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return _a.lengthSq() < 1e-9 ? _a.set(0, -1, 0) : _a.normalize().clone();
  };
  const ring = (i, j) => {
    const t = pts[i].d || (pts[i].d = dir(i));
    const u = _b.set(0, 1, 0);
    if (Math.abs(t.y) > 0.9) u.set(1, 0, 0);
    const x = _c.copy(u).cross(t).normalize().clone();
    const y = t.clone().cross(x).normalize();
    const a = (j % seg) / seg * TAU;
    const r = pts[i].r;
    return {
      p: [pts[i].p[0] + x.x * Math.cos(a) * r + y.x * Math.sin(a) * r,
        pts[i].p[1] + x.y * Math.cos(a) * r + y.y * Math.sin(a) * r,
        pts[i].p[2] + x.z * Math.cos(a) * r + y.z * Math.sin(a) * r],
      c: col(pts[i].s),
      uv: [(j % seg) / seg * 1.5, i * uvs * 0.25],
    };
  };
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < seg; j++) B.quad(ring(i, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j));
  }
  if (tip) {
    const e = pts.length - 1, t = pts[e].d;
    const cap = { p: [pts[e].p[0] + t.x * pts[e].r, pts[e].p[1] + t.y * pts[e].r, pts[e].p[2] + t.z * pts[e].r], c: col(pts[e].s * 1.1) };
    for (let j = 0; j < seg; j++) B.tri(ring(e, j), ring(e, j + 1), cap);
  }
}

// Ears, tusks, pincer plates and eyestalks: a flat quad drawn both ways, because a one-sided
// ear vanishes from half the compass and these are what the silhouette is made of.
function flap(B, quad, c) {
  const v = quad.map(p => ({ p, c }));
  B.tri(v[0], v[1], v[2]); B.tri(v[0], v[2], v[3]);
  B.tri(v[0], v[2], v[1]); B.tri(v[0], v[3], v[2]);
}

// Every dimension is metres at scale 1 and nothing here scales with K — a creature is a
// human-scale thing (WORLD.md §2). `ao` is the height the baked occlusion ramp reaches.
const KINDS = {
  rat: {
    // 8 around the body, not 6: at 6 the two facets either side of vertical meet in a flat plate
    // across the spine and the animal reads as a beetle. 8 puts a ridge on the back instead.
    seg: 8, hseg: 5, ao: 0.16, stride: 0.13, run: 1.9, contact: 0.13, hip: [0.055, -0.03], uvs: 9, size: 1,
    body: [
      { z: 0.150, y: 0.090, rx: 0.024, ry: 0.030, s: 0.94 },
      { z: 0.090, y: 0.090, rx: 0.036, ry: 0.046, s: 1.00 },
      { z: 0.015, y: 0.090, rx: 0.039, ry: 0.050, s: 0.96 },
      { z: -0.065, y: 0.094, rx: 0.042, ry: 0.054, s: 0.90 },
      { z: -0.130, y: 0.098, rx: 0.028, ry: 0.034, s: 0.78 },
      { z: -0.165, y: 0.100, rx: 0.012, ry: 0.014, s: 0.70 },
    ],
    head: {
      pivot: [0, 0.092, 0.140],
      rings: [
        { z: 0.150, y: 0.096, rx: 0.032, ry: 0.034, s: 1.02 },
        { z: 0.202, y: 0.088, rx: 0.023, ry: 0.024, s: 1.06 },
        { z: 0.240, y: 0.079, rx: 0.011, ry: 0.011, s: 1.10 },
      ],
      nose: [0, 0.076, 0.262],
      eye: [0.024, 0.104, 0.192],
      ear: { at: [0.026, 0.122, 0.150], r: 0.038, lean: 0.62 },
    },
    tail: {
      pivot: [0, 0.100, -0.168],
      pts: [
        { p: [0, 0.100, -0.168], r: 0.0130, s: 0.60 },
        { p: [0, 0.106, -0.300], r: 0.0080, s: 0.52 },
        { p: [0, 0.070, -0.430], r: 0.0030, s: 0.44 },
      ],
    },
    legs: [
      { hip: [0.030, 0.074, 0.072], foot: [0.036, 0.006, 0.086], r: [0.012, 0.007], ph: 0, sw: 1.0 },
      { hip: [0.036, 0.076, -0.062], foot: [0.043, 0.006, -0.078], r: [0.014, 0.008], ph: Math.PI, sw: 0.88 },
    ],
  },

  boar: {
    seg: 6, hseg: 5, ao: 0.74, stride: 0.42, run: 4.2, contact: 0.42, hip: [0.30, -0.16], uvs: 1.6, size: 3.4,
    counter: 0.30, limb: 0.42,
    // Deep barrel, high shoulder hump, rump falling away, head hung at chest height and no neck
    // at all. Long legs and a level back is a deer, which is what the first pass built.
    body: [
      { z: 0.40, y: 0.44, rx: 0.150, ry: 0.170, s: 0.90 },
      { z: 0.20, y: 0.47, rx: 0.205, ry: 0.240, s: 1.00 },
      { z: -0.04, y: 0.44, rx: 0.210, ry: 0.220, s: 0.95 },
      { z: -0.26, y: 0.40, rx: 0.170, ry: 0.175, s: 0.86 },
      { z: -0.44, y: 0.37, rx: 0.095, ry: 0.100, s: 0.76 },
      { z: -0.53, y: 0.36, rx: 0.038, ry: 0.042, s: 0.68 },
    ],
    head: {
      pivot: [0, 0.44, 0.40], shade: 0.60,
      rings: [
        { z: 0.42, y: 0.455, rx: 0.115, ry: 0.125, s: 1.00 },
        { z: 0.60, y: 0.395, rx: 0.082, ry: 0.080, s: 1.04 },
        { z: 0.75, y: 0.345, rx: 0.045, ry: 0.040, s: 1.10 },
      ],
      nose: [0, 0.338, 0.800],
      eye: [0.086, 0.478, 0.505],
      ear: { at: [0.090, 0.545, 0.435], r: 0.046, lean: 0.30, shade: 0.42 },
      tusk: { from: [0.046, 0.345, 0.735], to: [0.092, 0.460, 0.820], w: 0.022 },
    },
    crest: { from: 0.28, to: -0.14, y: 0.700, h: 0.080, n: 4 },
    tail: {
      pivot: [0, 0.38, -0.53],
      pts: [
        { p: [0, 0.38, -0.53], r: 0.022, s: 0.58 },
        { p: [0, 0.29, -0.60], r: 0.014, s: 0.50 },
        { p: [0, 0.19, -0.61], r: 0.020, s: 0.42 },
      ],
    },
    legs: [
      { hip: [0.122, 0.340, 0.215], foot: [0.130, 0.012, 0.225], r: [0.066, 0.036], ph: 0, sw: 1.0 },
      { hip: [0.128, 0.335, -0.205], foot: [0.136, 0.012, -0.230], r: [0.072, 0.038], ph: Math.PI, sw: 0.9 },
    ],
  },

  crab: {
    seg: 6, hseg: 4, ao: 0.20, stride: 0.11, run: 1.5, contact: 0.30, yaw: Math.PI / 2, hip: [0.09, 0], uvs: 6, size: 1.3,
    body: [
      { z: 0.150, y: 0.100, rx: 0.120, ry: 0.052, s: 0.92 },
      { z: 0.040, y: 0.112, rx: 0.200, ry: 0.088, s: 1.00 },
      { z: -0.060, y: 0.106, rx: 0.186, ry: 0.078, s: 0.90 },
      { z: -0.150, y: 0.094, rx: 0.110, ry: 0.044, s: 0.80 },
    ],
    stalk: { at: [0.058, 0.150, 0.128], up: 0.070, w: 0.018 },
    claw: {
      arm: [
        { p: [0.150, 0.098, 0.150], r: 0.032, s: 0.86 },
        { p: [0.225, 0.072, 0.250], r: 0.046, s: 0.96 },
      ],
      jaw: [[0.225, 0.100, 0.256], [0.320, 0.078, 0.318], [0.314, 0.040, 0.300], [0.225, 0.046, 0.242]],
    },
    legs: [
      { hip: [0.165, 0.098, 0.085], foot: [0.268, 0.006, 0.130], r: [0.016, 0.008], ph: 0, sw: 1.0, axis: 1 },
      { hip: [0.180, 0.098, -0.010], foot: [0.300, 0.006, -0.020], r: [0.017, 0.008], ph: Math.PI, sw: 1.0, axis: 1 },
      { hip: [0.165, 0.096, -0.100], foot: [0.262, 0.006, -0.150], r: [0.016, 0.008], ph: 0, sw: 0.9, axis: 1 },
    ],
  },
};

// The three vermin are the same animal family read three ways; everything that separates a
// granary rat from a field vole from a shaft rat is in zones.js.
const FALLBACK = {
  label: 'rat', fur: '#8b7c63', dark: '#3d3428', belly: '#b6a98e', nose: '#b8807c', claw: '#cbb79a',
  ear: 1, tail: 1, bulk: 1,
};
const vermOf = id => ({ ...FALLBACK, ...(zone(id).vermin || {}) });

export const verminName = id => vermOf(id).label;

function headPart(B, K, V, col, dark) {
  const H = K.head;
  if (!H) return;
  const face = s => col(s * (H.shade ?? 1));
  B.at(PART.head, H.pivot);
  loft(B, H.rings, K.hseg, face, { capBack: false, uvs: K.uvs });
  const last = H.rings[H.rings.length - 1];
  const v = (j) => ringPt(last, j, K.hseg, face, K.uvs);
  const nose = { p: H.nose, c: flat(V.nose) };
  for (let j = 0; j < K.hseg; j++) B.tri(v(j + 1), v(j), nose);

  for (const side of [1, -1]) {
    const e = H.eye;
    const a = { p: [side * e[0], e[1] + 0.006, e[2] - 0.004], c: dark };
    const b = { p: [side * e[0], e[1] - 0.005, e[2] - 0.006], c: dark };
    const c = { p: [side * (e[0] - 0.004), e[1], e[2] + 0.008], c: dark };
    if (side > 0) B.tri(a, c, b); else B.tri(a, b, c);

    if (H.ear) {
      const r = H.ear.r * V.ear, at = H.ear.at, lean = H.ear.lean;
      // Both base corners sit on the skull and the flap fans out and up from there. A quad with
      // its base off the surface reads as a card floating beside the head, which is what the
      // first pass rendered.
      flap(B, [
        [side * at[0], at[1], at[2] + r * 0.30],
        [side * (at[0] + r * lean * 0.85), at[1] + r * 1.02, at[2] + r * 0.48],
        [side * (at[0] + r * lean * 1.10), at[1] + r * 1.18, at[2] - r * 0.34],
        [side * at[0], at[1] + r * 0.06, at[2] - r * 0.38],
      ], col(H.ear.shade ?? 0.72));
    }
    if (H.tusk) {
      const t = H.tusk;
      flap(B, [
        [side * t.from[0], t.from[1], t.from[2]],
        [side * t.to[0], t.to[1], t.to[2]],
        [side * (t.to[0] + t.w), t.to[1] - t.w * 0.4, t.to[2] - t.w],
        [side * (t.from[0] + t.w), t.from[1], t.from[2] - t.w],
      ], flat(V.claw));
    }
  }
}

// The ridge has to sit on the faceted mesh, not on the analytic ellipse: with 6 segments the
// topmost vertex is at 0.866 r, and a crest authored at r floats a visible few centimetres.
function backY(rings, seg, z) {
  const top = R => R.y + R.ry * Math.sin(Math.PI * 0.5 - Math.PI / seg);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    if (z <= a.z && z >= b.z) {
      const t = (a.z - z) / (a.z - b.z);
      return top(a) + (top(b) - top(a)) * t;
    }
  }
  return top(rings[0]);
}

function crestPart(B, K, col) {
  if (!K.crest) return;
  B.at(PART.body, [0, 0, 0]);
  const C = K.crest;
  const y = z => backY(K.body, K.seg, z) - 0.015;
  for (let i = 0; i < C.n; i++) {
    const z0 = C.from + (C.to - C.from) * (i / C.n);
    const z1 = C.from + (C.to - C.from) * ((i + 1) / C.n);
    const h = C.h * (1 - 0.45 * i / C.n);
    B.quad(
      { p: [0, y(z0), z0], c: col(0.42) },
      { p: [0, y(z0) + h, z0 + h * 0.3], c: col(0.26) },
      { p: [0, y(z1) + h, z1 + h * 0.3], c: col(0.26) },
      { p: [0, y(z1), z1], c: col(0.42) });
  }
}

function limbParts(B, K, V, col) {
  for (const L of K.legs) {
    for (const side of [1, -1]) {
      const hip = [side * L.hip[0], L.hip[1], L.hip[2]];
      const foot = [side * L.foot[0], L.foot[1], L.foot[2]];
      const ph = L.ph + (side > 0 ? 0 : Math.PI);
      B.at(PART.limb, hip, [ph, L.sw, L.axis || 0], side < 0);
      tube(B, [
        { p: hip, r: L.r[0], s: 0.74 },
        { p: [(hip[0] + foot[0]) * 0.5, (hip[1] + foot[1]) * 0.52, (hip[2] + foot[2]) * 0.5], r: L.r[1] * 1.15, s: 0.66 },
        { p: foot, r: L.r[1], s: 0.58 },
      ], 3, s => (s < 0.6 ? (K.limb ? col(0.10) : flat(V.claw)) : col(s * (K.limb ?? 1))), { uvs: K.uvs });
    }
  }
  if (K.claw) {
    for (const side of [1, -1]) {
      const root = [side * K.claw.arm[0].p[0], K.claw.arm[0].p[1], K.claw.arm[0].p[2]];
      B.at(PART.prop, root, [side > 0 ? 0 : 1.4, side, 0], side < 0);
      tube(B, K.claw.arm.map(a => ({ ...a, p: [side * a.p[0], a.p[1], a.p[2]] })), 3, col, { uvs: K.uvs });
      flap(B, K.claw.jaw.map(p => [side * p[0], p[1], p[2]]), col(1.06));
    }
  }
  if (K.stalk) {
    for (const side of [1, -1]) {
      const s = K.stalk;
      B.at(PART.head, [side * s.at[0], s.at[1], s.at[2]]);
      flap(B, [
        [side * s.at[0] - s.w, s.at[1], s.at[2]],
        [side * s.at[0] - s.w * 0.6, s.at[1] + s.up, s.at[2] + s.w],
        [side * s.at[0] + s.w * 0.6, s.at[1] + s.up, s.at[2] + s.w],
        [side * s.at[0] + s.w, s.at[1], s.at[2]],
      ], col(0.7));
    }
  }
}

function verminGeometry(kind, zoneId) {
  const K = KINDS[kind];
  const V = vermOf(zoneId);
  const col = shade(V.fur, V.dark);
  const belly = shade(V.belly, V.dark);
  const dark = [0.03, 0.025, 0.025];
  const B = new Build(K.ao);

  const bulk = kind === 'rat' ? V.bulk : 1;
  const body = K.body.map(r => ({ ...r, rx: r.rx * bulk, ry: r.ry * bulk }));
  // Countershaded: dark along the spine, pale under the flank. From the game camera you see the
  // back and almost nothing else, so this is what the animal is at 6 m.
  const ctr = K.counter ?? 1;
  const flank = (s, d = 0) => {
    const t = 1 - ctr * (1 - Math.min(1, Math.max(0, (d + 0.45) / 0.85)));
    const a = belly(s * 1.12), b = col(s * (1 - 0.26 * ctr * Math.max(0, d)));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  B.at(PART.body, [0, 0, 0]);
  loft(B, body, K.seg, flank, { capBack: true, capFront: !K.head, uvs: K.uvs });
  crestPart(B, K, col);
  headPart(B, K, V, col, dark);
  if (K.tail) {
    const t = K.tail;
    const long = kind === 'rat' ? V.tail : 1;
    const skin = shade(V.nose, V.dark);
    B.at(PART.tail, t.pivot);
    tube(B, t.pts.map(p => ({
      ...p,
      p: [p.p[0], t.pivot[1] + (p.p[1] - t.pivot[1]) * long, t.pivot[2] + (p.p[2] - t.pivot[2]) * long],
    })), 3, skin, { uvs: K.uvs });
  }
  limbParts(B, K, V, col);
  return B.geometry();
}

// Coarse fur. It does nothing at 30 px and stops the body reading as moulded plastic at two
// metres, which is where the first quest puts the camera.
function furMap() {
  const t = paint(96, 96, (g, w, h) => {
    g.fillStyle = 'rgb(252,250,246)';
    g.fillRect(0, 0, w, h);
    const R = rng(0x7ac31d);
    for (let i = 0; i < 900; i++) {
      const x = R() * w, y = R() * h, len = span(R, 3, 8), ang = span(R, -0.5, 0.5) + Math.PI * 0.5;
      const v = Math.round(span(R, 214, 246));
      g.strokeStyle = `rgb(${v},${v - 3},${v - 8})`;
      g.lineWidth = span(R, 0.6, 1.3);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    for (let i = 0; i < 700; i++) {
      const v = Math.round(span(R, 232, 255));
      g.fillStyle = `rgba(${v},${v},${v - 5},0.4)`;
      g.fillRect(R() * w, R() * h, 1, 1);
    }
  }, 'vermin:fur');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const PARS = `
uniform float uTime;
uniform vec4 uGait;
uniform vec4 uHead;
uniform vec4 uAct;
uniform vec4 uIdle;
uniform vec4 uLimb;
uniform vec4 uKind;
uniform vec4 uSelf;
uniform float uSeed;
attribute float aPart;
attribute vec3 aPivot;
attribute vec3 aGait;
#ifdef USE_INSTANCING
attribute vec4 aInst;
attribute float aSeed;
#endif

mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

vec3 verm(vec3 p, float part, vec3 pivot, vec3 gait, vec4 self, float seed, out mat3 outR) {
  float cyc = self.x, raw = self.y, act = self.z, at = self.w;
  float g = cyc * 6.2831853;
  float mv = smoothstep(0.02, 0.30, raw);
  float spd = clamp(raw / uKind.z, 0.0, 1.0);

  float isAtk = step(0.5, act) * (1.0 - step(1.5, act));
  float isHrt = step(1.5, act) * (1.0 - step(2.5, act));
  float isDie = step(2.5, act);

  // A lunge is crouch, drive, settle. The windup is what makes the strike read as intent rather
  // than a twitch, and it is the only part the player has time to react to.
  float wind = (smoothstep(0.0, 0.20, at) - smoothstep(0.26, 0.42, at)) * isAtk;
  float lung = (smoothstep(0.28, 0.40, at) - smoothstep(0.56, 0.86, at)) * isAtk;
  float flin = (smoothstep(0.0, 0.07, at) - smoothstep(0.16, 0.70, at)) * isHrt;
  float dead = smoothstep(0.0, 0.42, at) * isDie;
  float live = 1.0 - dead;

  float bob = uGait.y * spd * (0.5 - 0.5 * cos(2.0 * g)) * mv;
  float breath = uIdle.x * (1.0 - mv) * live * (0.5 + 0.5 * sin(uTime * 1.7 + seed * 6.283));

  mat3 R = mat3(1.0);
  vec3 T = vec3(0.0);

  // Every translation below is authored in rat metres and scaled by uKind.w, or a 5 cm head
  // thrust that is a third of a rat's head is nothing at all on a boar.
  float sz = uKind.w;

  if (part > 0.5 && part < 1.5) {
    float sniff = uIdle.y * (1.0 - mv) * live * max(0.0, sin(uTime * 3.4 + seed * 11.0));
    float pitch = sniff + uHead.y * lung - uHead.z * flin + uHead.w * dead + 0.12 * spd * sin(2.0 * g) * mv;
    float yaw = uIdle.z * (1.0 - mv) * live * sin(uTime * 0.65 + seed * 6.283);
    R = rotY(yaw) * rotX(pitch);
    T = vec3(0.0, -bob * 0.4 * sz, uHead.x * lung * sz);
  } else if (part > 1.5 && part < 2.5) {
    float sway = uGait.z * 1.6 * spd * sin(g + 1.1) * mv + uIdle.w * (1.0 - mv) * live * sin(uTime * 2.3 + seed * 7.1);
    R = rotY(sway) * rotX(-0.55 * lung + 0.8 * dead - 0.5 * flin);
  } else if (part > 2.5 && part < 3.5) {
    float s = uGait.w * gait.y * mv * sin(g + gait.x)
            + uLimb.y * gait.y * (lung - 0.6 * wind)
            + uLimb.z * gait.y * dead;
    R = gait.z < 0.5 ? rotX(s) : rotZ(s * sign(pivot.x));
    T = vec3(0.0, max(0.0, -sin(g + gait.x)) * uLimb.x * mv * gait.y * sz, 0.0);
  } else if (part > 3.5) {
    float wave = uIdle.w * 1.4 * (1.0 - mv) * live * sin(uTime * 1.9 + gait.x + seed * 6.283);
    R = rotY(gait.y * (wave - uLimb.w * (lung + 0.5 * wind))) * rotX(-0.7 * dead);
  }

  vec3 q = R * (p - pivot) + pivot + T;

  vec3 piv = vec3(0.0, uKind.x, uKind.y);
  mat3 bodyR = rotX(-uAct.x * lung + uAct.y * wind + 0.9 * flin)
             * rotZ(uGait.z * spd * sin(g) * mv + uAct.w * dead);
  vec3 bodyT = vec3(0.0, (bob + breath) * sz - uKind.x * 0.55 * dead, (uAct.z * lung - uAct.z * 0.7 * flin) * sz);
  outR = bodyR * R;
  return bodyR * (q - piv) + piv + bodyT;
}

vec4 vermSelf() {
  #ifdef USE_INSTANCING
    return aInst;
  #else
    return uSelf;
  #endif
}
float vermSeed() {
  #ifdef USE_INSTANCING
    return aSeed;
  #else
    return uSeed;
  #endif
}
`;

const CALC = `
  mat3 vermR;
  vec3 vermP = verm(position, aPart, aPivot, aGait, vermSelf(), vermSeed(), vermR);
`;

function patch(shader, uniforms, withNormal) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = PARS + shader.vertexShader;
  shader.vertexShader = withNormal
    ? shader.vertexShader
      .replace('#include <beginnormal_vertex>', `${CALC}\n vec3 objectNormal = normalize(vermR * normal);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vermP;')
    : shader.vertexShader
      .replace('#include <begin_vertex>', `${CALC}\n vec3 transformed = vermP;`);
}

const AO_SEG = 7;

// terrain.js's ground-decal recipe: dst * (1 - srcAlpha) with the strength in alpha, and an inner
// ring so the dark core survives instead of ramping away under the body.
function contactDisc(count) {
  const pos = [0, 0, 0], col = [0, 0, 0, 1], idx = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let j = 0; j < AO_SEG; j++) {
      const a = j / AO_SEG * TAU;
      const r = ring ? 1 : 0.44;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      col.push(0, 0, 0, ring ? 0 : 1);
    }
  }
  for (let j = 0; j < AO_SEG; j++) {
    const a = 1 + j, b = 1 + (j + 1) % AO_SEG;
    idx.push(0, b, a, a, b, 1 + AO_SEG + (j + 1) % AO_SEG, a, 1 + AO_SEG + (j + 1) % AO_SEG, 1 + AO_SEG + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    name: 'vermin:contact',
  });
  const mesh = new THREE.InstancedMesh(g, m, count);
  mesh.name = 'vermin:contact';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.count = 0;
  return mesh;
}

const POOL = 48;
const PER_MESH = 16;
const ATTACK_T = 1.15;
const HURT_T = 0.45;
const DIE_T = 1.30;
const ROAM = 4.5;

// Which rig each bestiary row wears, and how big. Six table entries, one parameterised rig, and
// no zone named anywhere: a rat picks up its town from the ground it spawns on.
export const CREATURES = {
  grain_rat: { kind: 'rat', scale: 1.00 },
  mire_rat: { kind: 'rat', scale: 1.22 },
  rat_knot: { kind: 'rat', scale: 0.86 },
  brood_mother: { kind: 'rat', scale: 2.40 },
  creek_crab: { kind: 'crab', scale: 1.00 },
  blight_boar: { kind: 'boar', scale: 1.00 },
};

const POSES = ['live', 'idle', 'move', 'attack', 'hurt', 'die'];

// Where the ?dev=1 cast stands, relative to the dev site. Shared with the scenarios so a camera
// can frame one animal without the spawner having run yet.
const DEV_STAND = { grain_rat: [0, 0], blight_boar: [6.0, 1.6], creek_crab: [-4.4, 0.9] };

export class Vermin {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'vermin';
    this.time = 0;
    this.recount = 0;
    this.life = 1;
    this.scale = 1;
    this.pose = 'live';
    this.phase = 0.4;

    // uGait = ref speed, body bob, sway, leg swing · uHead = lunge reach, lunge pitch, flinch,
    // death drop · uAct = lunge pitch, windup crouch, lunge push, death roll ·
    // uIdle = breath, sniff, look, tail flick · uLimb = foot lift, lunge kick, death curl, pincer
    this.uniforms = {
      uTime: { value: 0 },
      uGait: { value: new THREE.Vector4(0, 0.010, 0.055, 0.62) },
      uHead: { value: new THREE.Vector4(0.010, 0.34, 0.50, 0.28) },
      uAct: { value: new THREE.Vector4(0.26, 0.20, 0.10, 1.45) },
      uIdle: { value: new THREE.Vector4(0.006, 0.20, 0.28, 0.22) },
      uLimb: { value: new THREE.Vector4(0.020, 0.55, 0.85, 0.55) },
      uSelf: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSeed: { value: 0 },
    };

    this.map = furMap();
    this.geo = new Map();
    this.mat = new Map();
    this.depth = new Map();
    this.meshes = new Map();

    onEnvIntensity(v => {
      this.env = v;
      for (const m of this.mat.values()) m.envMapIntensity = v;
    });

    this.spawn();
    this.ao = contactDisc(POOL);
    this.object3D.add(this.ao);
    this.setContact(0.72);
    this.setCount(0);
  }

  kindUniforms(kind) {
    const K = KINDS[kind];
    return { ...this.uniforms, uKind: { value: new THREE.Vector4(K.hip[0], K.hip[1], K.run, K.size ?? 1) } };
  }

  mesh(kind, zi) {
    const key = `${kind}:${zi}`;
    let m = this.meshes.get(key);
    if (m) return m;
    const zoneId = ZONE_IDS[zi];
    if (!this.geo.has(key)) this.geo.set(key, verminGeometry(kind, zoneId));
    if (!this.depth.has(kind)) {
      const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      const u = this.kindUniforms(kind);
      d.onBeforeCompile = s => patch(s, u, false);
      d.customProgramCacheKey = () => `vermDepth:${kind}`;
      this.depth.set(kind, d);
    }
    if (!this.mat.has(key)) {
      const mat = new THREE.MeshStandardMaterial({
        map: this.map, vertexColors: true, roughness: 0.86, metalness: 0, name: `vermin:${key}`,
      });
      const u = this.kindUniforms(kind);
      mat.onBeforeCompile = s => patch(s, u, true);
      mat.customProgramCacheKey = () => `verm:${kind}`;
      if (this.env !== undefined) mat.envMapIntensity = this.env;
      this.mat.set(key, mat);
    }
    m = new THREE.InstancedMesh(this.geo.get(key), this.mat.get(key), PER_MESH);
    m.name = `vermin:${key}`;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = this.depth.get(kind);
    m.count = 0;
    m.geometry.setAttribute('aInst',
      new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH * 4), 4).setUsage(THREE.DynamicDrawUsage));
    m.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH), 1));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH * 3).fill(1), 3);
    this.object3D.add(m);
    this.meshes.set(key, m);
    return m;
  }

  // Vermin infest: they come in nests behind a building, along a bank or under a hedge, never
  // sprinkled evenly. One rat in the open reads as a bug in the spawner.
  spawn() {
    const R = rng(0x3ab19f);
    const T = this.terrain;
    const ground = (x, z) => (T ? T.surfaceY(x, z) : heightAt(x, z));
    const indoors = (x, z) => (T?.footprints || []).some(fp => {
      const dx = x - fp.x, dz = z - fp.z;
      const c = Math.cos(-fp.rot), s = Math.sin(-fp.rot);
      return Math.abs(dx * c - dz * s) < fp.hw + 0.8 && Math.abs(dx * s + dz * c) < fp.hd + 0.8;
    });
    const dryFree = (x, z) => !indoors(x, z) && Math.min(heightAt(x, z), ground(x, z)) > waterY(x) + 1.0;

    const fps = (T?.footprints || []).filter(fp => fp.hw > 2 && fp.hd > 2);
    const sites = [];
    for (let zi = 0; zi < 3; zi++) {
      const near = fps.filter(fp => zoneAt(fp.x, fp.z) === zi);
      let made = 0;
      for (let n = 0; n < 80 && made < 2; n++) {
        const fp = near.length ? near[Math.floor(R() * near.length) % near.length] : null;
        const a = span(R, 0, TAU);
        const d = (fp ? Math.hypot(fp.hw, fp.hd) : 0) + span(R, 2.0, 5.0);
        const x = (fp ? fp.x : CENTERS[zi]) + Math.cos(a) * d;
        const z = (fp ? fp.z : span(R, -10, 30)) + Math.sin(a) * d;
        if (!dryFree(x, z) || nearCamera(x, z, -6)) continue;
        sites.push({ zi, x, z, enemy: made ? 'mire_rat' : 'grain_rat' });
        made++;
      }
    }
    const dev = devSite();
    for (const [enemy, [dx, dz]] of Object.entries(DEV_STAND)) {
      const x = dev.x + dx, z = dev.z + dz;
      sites.push({ zi: zoneAt(x, z), x, z, enemy, dev: true });
    }

    this.agents = [];
    const filled = new Map();
    for (let i = 0; this.agents.length < POOL && i < sites.length * 12; i++) {
      const site = sites[i % sites.length];
      const n = filled.get(site) || 0;
      if (site.dev && n >= 5) continue;
      filled.set(site, n + 1);
      // The first of a nest sits on the site exactly, so a dev camera aimed at the site always
      // has something in frame however the jitter falls.
      const spread = n === 0 ? 0
        : site.dev ? 0.6 + KINDS[CREATURES[site.enemy].kind].contact * 2.6 : 2.6;
      const x = site.x + span(R, -spread, spread), z = site.z + span(R, -spread, spread);
      if (!dryFree(x, z)) continue;
      this.agents.push({
        enemy: site.enemy, kind: CREATURES[site.enemy].kind, zi: site.zi,
        x, z, home: [site.x, site.z], dev: !!site.dev,
        heading: span(R, 0, TAU), speed: 0, cyc: span(R, 0, 4), seed: R(),
        scale: span(R, 0.88, 1.12), tone: span(R, 0.88, 1.12),
        act: 0, at: 0, wait: span(R, 0.2, 3.5),
      });
    }
    // Nearest first, so a low count still fills the dev cluster rather than a nest across the map.
    this.agents.sort((a, b) => (b.dev ? 1 : 0) - (a.dev ? 1 : 0));
  }

  setContact(v) {
    const g = this.ao.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      col.setW(i, Math.hypot(pos.getX(i), pos.getZ(i)) > 0.9 ? 0 : v);
    }
    col.needsUpdate = true;
  }

  setCount(n) {
    this.count = Math.min(n, POOL);
    this.assign();
  }

  assign(cam) {
    let src = this.agents;
    if (cam) {
      const cx = cam.position.x, cz = cam.position.z;
      src = this.agents.slice().sort((a, b) =>
        ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
    }
    this.active = src.slice(0, this.count | 0);
    for (const m of this.meshes.values()) { m.count = 0; m.userData.list = null; }
    const byMesh = new Map();
    for (const a of this.active) {
      const key = `${a.kind}:${a.zi}`;
      const list = byMesh.get(key) || byMesh.set(key, []).get(key);
      if (list.length < PER_MESH) list.push(a);
    }
    const col = new THREE.Color();
    for (const [key, list] of byMesh) {
      const [kind, zi] = key.split(':');
      const mesh = this.mesh(kind, +zi);
      mesh.count = list.length;
      mesh.userData.list = list;
      const ic = mesh.instanceColor, sd = mesh.geometry.getAttribute('aSeed');
      list.forEach((a, i) => {
        col.setRGB(a.tone, a.tone * 0.985, a.tone * 0.96).toArray(ic.array, i * 3);
        sd.array[i] = a.seed;
      });
      ic.needsUpdate = true; sd.needsUpdate = true;
    }
    this.recount = 0;
  }

  registerKnobs(q) {
    const U = this.uniforms;
    // Default 0: nothing places vermin yet, and the gate profile has no headroom to carry a
    // population nobody asked for. The dev scenarios raise it themselves.
    q.register({ key: 'vermin', label: 'Vermin', type: 'range', min: 0, max: POOL, step: 2, default: 0, group: 'Vermin' },
      v => this.setCount(v));
    q.register({ key: 'verminScale', label: 'Vermin size', type: 'range', min: 0.5, max: 2.0, step: 0.05, default: 1, group: 'Vermin' },
      v => { this.scale = v; });
    q.register({ key: 'verminPose', label: 'Pose', type: 'select', options: POSES, default: 'live', group: 'Vermin' },
      v => { this.pose = v; });
    q.register({ key: 'verminPhase', label: 'Pose phase', type: 'range', min: 0, max: 1, step: 0.02, default: 0.4, group: 'Vermin' },
      v => { this.phase = v; });
    // -4 is off; anything in range turns every agent to that heading so a pose can be shot from
    // a chosen side without the spawner's dice deciding what the camera sees.
    q.register({ key: 'verminFace', label: 'Force heading', type: 'range', min: -4, max: 3.2, step: 0.1, default: -4, group: 'Vermin' },
      v => { this.face = v > -3.5 ? v : null; });
    q.register({ key: 'verminLife', label: 'Activity', type: 'range', min: 0, max: 3, step: 0.1, default: 1, group: 'Vermin' },
      v => { this.life = v; });
    q.register({ key: 'verminBob', label: 'Body bob', type: 'range', min: 0, max: 0.05, step: 0.002, default: 0.010, group: 'Vermin' },
      v => { U.uGait.value.y = v; });
    q.register({ key: 'verminSway', label: 'Spine sway', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0.055, group: 'Vermin' },
      v => { U.uGait.value.z = v; });
    q.register({ key: 'verminSwing', label: 'Leg swing', type: 'range', min: 0, max: 1.4, step: 0.02, default: 0.62, group: 'Vermin' },
      v => { U.uGait.value.w = v; });
    q.register({ key: 'verminLunge', label: 'Lunge reach', type: 'range', min: 0, max: 0.4, step: 0.01, default: 0.10, group: 'Vermin' },
      v => { U.uAct.value.z = v; });
    q.register({ key: 'verminSniff', label: 'Idle sniff', type: 'range', min: 0, max: 0.8, step: 0.02, default: 0.20, group: 'Vermin' },
      v => { U.uIdle.value.y = v; });
    q.register({ key: 'verminContact', label: 'Vermin contact shade', type: 'range', min: 0, max: 1, step: 0.05, default: 0.72, group: 'Vermin' },
      v => this.setContact(v));
  }

  choose(a) {
    const r = Math.random();
    if (r < 0.30) { a.act = ACT.none; a.speed = 0; a.wait = (0.4 + Math.random() * 1.6) / Math.max(0.15, this.life); }
    else if (r < 0.40) { a.act = ACT.attack; a.at = 0; a.speed = 0; }
    else {
      a.act = ACT.none;
      a.heading += (Math.random() - 0.5) * 3.0;
      a.speed = KINDS[a.kind].run * (0.28 + Math.random() * 0.42);
      a.wait = (0.5 + Math.random() * 1.8) / Math.max(0.15, this.life);
    }
  }

  update(dt, app) {
    this.time = (this.time + dt) % 600;
    this.uniforms.uTime.value = this.time;
    if (!this.count) { this.ao.count = 0; return; }

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const tilt = new THREE.Quaternion();
    const up = new THREE.Vector3();
    const T = this.terrain;
    const pinned = POSES.indexOf(this.pose);
    let ai = 0;

    for (const mesh of this.meshes.values()) {
      const list = mesh.userData.list;
      if (!list || !list.length) continue;
      const inst = mesh.geometry.getAttribute('aInst');
      const K = KINDS[list[0].kind];

      for (let i = 0; i < list.length; i++) {
        const a = list[i];

        if (pinned > 0) {
          a.act = Math.max(0, pinned - 2);
          a.at = this.phase;
          a.speed = pinned === 2 ? K.run * 0.55 : 0;
          a.cyc = this.phase * 2;
        } else if (a.act) {
          a.at += dt / (a.act === ACT.attack ? ATTACK_T : a.act === ACT.hurt ? HURT_T : DIE_T);
          if (a.at >= 1) {
            if (a.act === ACT.die) a.at = 1;
            else { a.act = ACT.none; a.at = 0; a.wait = (0.4 + Math.random() * 2.0) / Math.max(0.15, this.life); }
          }
        } else {
          a.wait -= dt * this.life;
          if (a.wait <= 0) this.choose(a);
        }

        if (a.speed > 0.01 && pinned <= 0) {
          const wx = a.x + Math.sin(a.heading) * a.speed * dt;
          const wz = a.z + Math.cos(a.heading) * a.speed * dt;
          const step = collidersReady() ? walkStep(a.x, a.z, wx, wz, a.y ?? 0, 0.14) : { x: wx, z: wz, hit: false };
          const dx = step.x - a.home[0], dz = step.z - a.home[1];
          if (dx * dx + dz * dz > ROAM * ROAM || step.hit) a.heading += Math.PI * 0.79;
          else {
            a.cyc += Math.hypot(step.x - a.x, step.z - a.z) / (2 * K.stride * a.scale * this.scale);
            a.x = step.x; a.z = step.z;
          }
        }

        const fall = T ? T.surfaceY(a.x, a.z) : heightAt(a.x, a.z);
        const want = collidersReady() ? groundAt(a.x, a.z, a.y ?? fall) : fall;
        const gy = a.y = a.y === undefined ? want : a.y + (want - a.y) * (1 - Math.exp(-14 * dt));
        const sc = a.scale * this.scale * (CREATURES[a.enemy]?.scale || 1);

        e.set(0, (this.face ?? a.heading) + (K.yaw || 0), 0);
        q.setFromEuler(e);
        pos.set(a.x, gy, a.z);
        scl.setScalar(sc);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);

        if (ai < POOL) {
          if (T) {
            up.set(T.surfaceY(a.x - 0.4, a.z) - T.surfaceY(a.x + 0.4, a.z), 0.8,
              T.surfaceY(a.x, a.z - 0.4) - T.surfaceY(a.x, a.z + 0.4)).normalize();
            tilt.setFromUnitVectors(UP, up);
          }
          pos.set(a.x, gy + 0.03, a.z);
          scl.set(K.contact * sc, 1, K.contact * sc);
          m4.compose(pos, tilt, scl);
          this.ao.setMatrixAt(ai++, m4);
        }

        inst.array[i * 4] = a.cyc;
        inst.array[i * 4 + 1] = a.speed;
        inst.array[i * 4 + 2] = a.act;
        inst.array[i * 4 + 3] = a.at;
      }
      mesh.instanceMatrix.needsUpdate = true;
      inst.needsUpdate = true;
    }

    this.ao.count = ai;
    this.ao.instanceMatrix.needsUpdate = true;

    this.recount -= dt;
    if (this.recount <= 0) {
      this.recount = 1.5;
      this.assign(app.camera);
      for (const m of this.meshes.values()) if (m.count) m.computeBoundingSphere();
    }
  }

  cost() {
    const per = {};
    for (const [key, g] of this.geo) per[key] = g.userData.tris;
    let drawn = 0, tris = 0;
    for (const [key, m] of this.meshes) {
      if (!m.count) continue;
      drawn++;
      tris += m.count * per[key];
    }
    return { per, tris, contact: this.ao.count * AO_SEG * 3, drawn: drawn + (this.ao.count ? 1 : 0) };
  }
}

// Registered at import time, not from the constructor: main.js resolves ?shot= long before the
// bottom of the file, so a scenario defined by the instance would never be found.
function devScenarios() {
  const at = (id, label, opts) => defineScenario({
    id, label, zone: 'neutral',
    setup: app => {
      const s = devSite();
      const [ox, oz] = DEV_STAND[opts.on || 'grain_rat'];
      const gy = heightAt(s.x + ox, s.z + oz);
      frameCamera(app, {
        pos: [s.x + ox + opts.dx, gy + opts.h, s.z + oz + opts.dz],
        look: [s.x + ox + (opts.lx || 0), gy + (opts.ly ?? 0.12), s.z + oz],
        fov: opts.fov,
      });
      app.quality.set('time', 10.5);
      app.quality.set('vermin', opts.n);
      app.quality.set('verminPose', opts.pose || 'live');
      app.quality.set('verminPhase', opts.phase ?? 0.4);
      app.quality.set('verminFace', opts.face ?? -4);
    },
  });
  at('vermin_close', 'Rat close-up', { dx: 0.42, dz: 0.62, h: 0.26, fov: 34, n: 8, pose: 'idle', ly: 0.09, face: 1.0 });
  at('vermin_nest', 'Rat nest at 3 m', { dx: 1.6, dz: 2.1, h: 1.05, fov: 42, n: 12 });
  at('vermin_play', 'Vermin at gameplay range', { dx: 4.0, dz: 6.4, h: 4.2, fov: 46, n: 20, ly: 0.4 });
  at('vermin_cast', 'Rat, boar and crab', { dx: 0.7, dz: 9.5, h: 3.0, fov: 54, n: 32, ly: 0.35, face: 0.1 });
  at('vermin_boar', 'Blight boar', { on: 'blight_boar', dx: 1.6, dz: 2.6, h: 1.1, fov: 44, n: 32, ly: 0.42, pose: 'idle', face: 0.55 });
  at('vermin_crab', 'Creek crab', { on: 'creek_crab', dx: 0.7, dz: 1.1, h: 0.55, fov: 40, n: 32, ly: 0.14, pose: 'idle', face: 0.6 });
  at('vermin_attack', 'Mid-lunge', { dx: 1.35, dz: 1.5, h: 0.70, fov: 32, n: 6, pose: 'attack', phase: 0.44, face: -1.6, ly: 0.10 });
  at('vermin_die', 'Death pose', { dx: 1.35, dz: 1.5, h: 0.70, fov: 32, n: 6, pose: 'die', phase: 1, face: -1.6, ly: 0.10 });
}
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')) devScenarios();

// A flat, dry patch near Longacre that the five scenario cameras do not look at, so the dev
// scenarios can frame a nest without the spawner having to exist first.
let _dev = null;
function devSite() {
  if (_dev) return _dev;
  let best = null;
  for (let dx = -60; dx <= 60; dx += 4) {
    for (let dz = -40; dz <= 60; dz += 4) {
      const x = CENTERS[1] + dx, z = 40 + dz;
      if (nearCamera(x, z, 4)) continue;
      const h = heightAt(x, z);
      if (h < waterY(x) + 1.5) continue;
      const slope = Math.abs(heightAt(x + 3, z) - h) + Math.abs(heightAt(x, z + 3) - h);
      if (!best || slope < best.slope) best = { x, z, slope };
    }
  }
  return (_dev = best || { x: CENTERS[1], z: 40 });
}
