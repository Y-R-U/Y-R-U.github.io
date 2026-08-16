// Fowl. One faceted bird per zone, instanced, with walk / peck / startle driven entirely in the
// vertex shader off per-instance state, so a flock costs one draw call per zone.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { onEnvIntensity } from './materials.js';
import { rng, span } from './details.js';
import { heightAt, waterY, CENTERS, nearCamera, zoneAt } from './terrain.js';
import { walkStep, groundAt, collidersReady } from './colliders.js';
import { paint } from './tree.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { penned } from './roster.js';
import { FOWL } from './bestiary.js';
import { ACT, STATE, carry } from '../sim/foes.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const PART = { body: 0, head: 1, wingL: 2, wingR: 3, legL: 4, legR: 5, tail: 6 };

// One step carries the bird exactly this far and the head holds still over exactly that distance.
// Tie the two together or the head skates instead of stabilising, and the whole read is gone.
const STRIDE = 0.115;
const WALK_SPEED = 0.46;
const SCURRY = 1.7;

const HIP = [0.052, 0.158, -0.018];
const NECK = [0, 0.272, 0.078];
const SHOULDER = [0.070, 0.276, 0.006];
const TAIL_ROOT = [0, 0.270, -0.135];

// Breast to tail: z, centre height, half-width, half-height, plumage value. The mass is forward
// and low, the body is far deeper than it is wide, and the back falls to a notch before the tail.
// That notch is most of the silhouette.
const BODY = [
  { z: 0.135, y: 0.244, rx: 0.030, ry: 0.038, s: 1.00 },
  { z: 0.098, y: 0.228, rx: 0.062, ry: 0.086, s: 0.97 },
  { z: 0.030, y: 0.222, rx: 0.082, ry: 0.108, s: 0.92 },
  { z: -0.045, y: 0.230, rx: 0.080, ry: 0.098, s: 0.87 },
  { z: -0.105, y: 0.248, rx: 0.054, ry: 0.062, s: 0.79 },
  { z: -0.140, y: 0.268, rx: 0.024, ry: 0.028, s: 0.74 },
];

// `w` is how much of the neck bend each ring takes, so a peck curls the neck instead of snapping
// the head off the shoulders.
const NECKLINE = [
  { p: [0, 0.272, 0.078], r: 0.050, s: 0.92, w: 0.00 },
  { p: [0, 0.316, 0.092], r: 0.034, s: 1.00, w: 0.26 },
  { p: [0, 0.352, 0.106], r: 0.030, s: 1.04, w: 0.55 },
  { p: [0, 0.382, 0.122], r: 0.038, s: 1.07, w: 0.82 },
  { p: [0, 0.406, 0.126], r: 0.032, s: 1.05, w: 0.96 },
  { p: [0, 0.420, 0.116], r: 0.014, s: 1.02, w: 1.00 },
];

const WING = [
  [0.088, 0.288, 0.058],
  [0.084, 0.284, -0.062],
  [0.076, 0.236, -0.130],
  [0.070, 0.178, -0.038],
  [0.080, 0.200, 0.048],
];

const BSEG = 8;
const NSEG = 6;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function faceNormal(a, b, c) {
  _a.fromArray(a.p); _b.fromArray(b.p).sub(_a); _c.fromArray(c.p).sub(_a);
  _b.cross(_c).normalize();
  return [_b.x, _b.y, _b.z];
}

class Build {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.uv = []; this.k = []; this.v = []; this.w = [];
    this.tris = 0;
    this.part = PART.body;
    this.pivot = [0, 0, 0];
    this.flip = false;
  }
  at(part, pivot, flip = false) { this.part = part; this.pivot = pivot; this.flip = flip; return this; }
  vert(v, n) {
    this.p.push(v.p[0], v.p[1], v.p[2]);
    this.n.push(n[0], n[1], n[2]);
    const ao = 0.62 + 0.38 * Math.min(1, Math.max(0, (v.p[1] - 0.02) / 0.36));
    this.c.push(v.c[0] * ao, v.c[1] * ao, v.c[2] * ao);
    const u = v.uv || [v.p[0] * 6 + v.p[2] * 2, v.p[1] * 7];
    this.uv.push(u[0], u[1]);
    this.k.push(this.part);
    this.v.push(this.pivot[0], this.pivot[1], this.pivot[2]);
    this.w.push(v.w ?? 1);
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
    g.setAttribute('aBend', new THREE.Float32BufferAttribute(this.w, 1));
    g.userData.tris = this.tris;
    return g;
  }
}

const mirror = p => [-p[0], p[1], p[2]];

// Flatter under the belly than a circle, which is what keeps the breast from reading as a ball.
function ringPt(R, j, col) {
  const a = (j % BSEG) / BSEG * TAU;
  const co = Math.cos(a), si = Math.sin(a);
  const flat = 1 - 0.16 * Math.max(0, -si);
  return {
    p: [co * R.rx * flat, R.y + si * R.ry * flat, R.z],
    c: col(R.s * (0.94 + 0.10 * si)),
    uv: [(j % BSEG) / BSEG * 2, (0.4 - R.z) * 4],
  };
}

// The neck axis is close to vertical, so its cross-sections lie in x/z with a small backward tilt.
function tubePt(A, j, col) {
  const a = (j % NSEG) / NSEG * TAU;
  const co = Math.cos(a), si = Math.sin(a);
  return {
    p: [co * A.r, A.p[1] - si * A.r * 0.26, A.p[2] + si * A.r],
    c: col(A.s),
    uv: [(j % NSEG) / NSEG * 1.5, A.p[1] * 7],
    w: A.w,
  };
}

function bodyPart(B, col) {
  B.at(PART.body, [0, 0, 0]);
  const v = (i, j) => ringPt(BODY[i], j, col);
  for (let i = 0; i < BODY.length - 1; i++) {
    for (let j = 0; j < BSEG; j++) B.quad(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j));
  }
  const nose = { p: [0, BODY[0].y, BODY[0].z + 0.026], c: col(1.04), uv: [0, 0] };
  const rear = { p: [0, BODY[5].y, BODY[5].z - 0.016], c: col(0.66), uv: [0, 1] };
  for (let j = 0; j < BSEG; j++) {
    B.tri(v(0, j + 1), v(0, j), nose);
    B.tri(v(5, j), v(5, j + 1), rear);
  }
}

function neckPart(B, col, comb, beak) {
  B.at(PART.head, NECK);
  const v = (i, j) => tubePt(NECKLINE[i], j, col);
  for (let i = 0; i < NECKLINE.length - 1; i++) {
    for (let j = 0; j < NSEG; j++) B.quad(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j));
  }
  const crown = { p: [0, 0.430, 0.112], c: col(1.03) };
  for (let j = 0; j < NSEG; j++) B.tri(v(5, j), v(5, j + 1), crown);

  const bk = p => ({ p, c: beak });
  const b0 = bk([-0.013, 0.392, 0.148]), b1 = bk([0.013, 0.392, 0.148]);
  const b2 = bk([-0.010, 0.376, 0.148]), b3 = bk([0.010, 0.376, 0.148]);
  const tip = bk([0, 0.382, 0.190]);
  B.tri(b0, tip, b1); B.tri(b3, tip, b2); B.tri(b2, tip, b0); B.tri(b1, tip, b3);

  // Comb, wattle and beak are the only saturated colour on the bird and they sit at the very top
  // of the silhouette. Three tiny shapes doing all of the identifying.
  const cb = p => ({ p, c: comb });
  for (let i = 0; i < 3; i++) {
    const z = 0.086 + i * 0.020;
    const h = 0.410 + [0.020, 0.026, 0.018][i];
    const a = cb([-0.007, 0.406, z]), b = cb([0.007, 0.406, z]);
    const c = cb([-0.007, 0.408, z + 0.017]), d = cb([0.007, 0.408, z + 0.017]);
    const t = cb([0, h, z + 0.008]);
    B.tri(a, b, t); B.tri(d, c, t); B.tri(b, d, t); B.tri(c, a, t);
  }
  const w0 = cb([-0.006, 0.374, 0.136]), w1 = cb([0.006, 0.374, 0.136]);
  const w2 = cb([0, 0.348, 0.130]);
  B.tri(w0, w1, w2); B.tri(w1, w0, w2);

  for (const side of [1, -1]) {
    const ey = p => ({ p: [side * 0.039, p[0], p[1]], c: [0.04, 0.03, 0.03] });
    const a = ey([0.390, 0.128]), b = ey([0.381, 0.127]), c = ey([0.384, 0.138]);
    if (side > 0) B.tri(a, c, b); else B.tri(a, b, c);
  }
}

// A hard slab down the flank. Its lower edge is a straight line across a curved body, and that
// line is what stops the barrel reading as a barrel.
function wingPart(B, col, side) {
  B.at(side > 0 ? PART.wingL : PART.wingR, side > 0 ? SHOULDER : mirror(SHOULDER), side < 0);
  const out = WING.map(p => ({ p: [side * p[0], p[1], p[2]], c: col(0.72) }));
  const inn = WING.map(p => ({ p: [side * (p[0] - 0.018), p[1] - 0.004, p[2] * 0.93], c: col(0.46) }));
  for (let i = 0; i < 3; i++) B.tri(out[0], out[i + 2], out[i + 1]);
  for (let i = 0; i < WING.length; i++) {
    const k = (i + 1) % WING.length;
    B.quad(inn[i], out[i], out[k], inn[k]);
  }
}

// Tail feathers fan vertically, so from the side this is a broad shape and from the front a thin
// one — the opposite way round to the wings, and getting it backwards makes a pheasant.
function tailPart(B, col) {
  B.at(PART.tail, TAIL_ROOT);
  const root = [[-0.022, 0.246, -0.124], [0.022, 0.246, -0.124], [0.019, 0.290, -0.140], [-0.019, 0.290, -0.140]];
  const tip = [[-0.023, 0.314, -0.232], [0.023, 0.314, -0.232], [0.015, 0.386, -0.208], [-0.015, 0.386, -0.208]];
  const r = root.map((p, i) => ({ p, c: col(i > 1 ? 0.46 : 0.34) }));
  const t = tip.map((p, i) => ({ p, c: col(i > 1 ? 0.38 : 0.28) }));
  for (let i = 0; i < 4; i++) {
    const k = (i + 1) % 4;
    B.quad(r[i], t[i], t[k], r[k]);
  }
  B.quad(t[3], t[2], t[1], t[0]);
}

function legPart(B, leg, side) {
  const hip = side > 0 ? HIP : mirror(HIP);
  B.at(side > 0 ? PART.legL : PART.legR, hip, side < 0);
  const rings = [
    { y: 0.170, r: 0.019, x: hip[0], z: hip[2] },
    { y: 0.086, r: 0.011, x: hip[0] * 1.04, z: hip[2] + 0.010 },
    { y: 0.012, r: 0.009, x: hip[0] * 1.08, z: hip[2] + 0.020 },
  ];
  const v = (i, j) => {
    const a = (j % 4) / 4 * TAU + 0.78;
    const R = rings[i];
    return { p: [R.x + Math.cos(a) * R.r, R.y, R.z + Math.sin(a) * R.r], c: leg(i ? 1 : 0.7) };
  };
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) B.quad(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j));
  }
  const foot = rings[2];
  const l = { p: [foot.x - 0.010, 0.008, foot.z], c: leg(0.9) };
  const r = { p: [foot.x + 0.010, 0.008, foot.z], c: leg(0.9) };
  for (const [dx, dz] of [[-0.028, 0.036], [0, 0.046], [0.028, 0.036]]) {
    const t = { p: [foot.x + dx, 0.002, foot.z + dz], c: leg(1.05) };
    B.tri(l, r, t); B.tri(r, l, t);
  }
  const heel = { p: [foot.x, 0.002, foot.z - 0.026], c: leg(0.85) };
  B.tri(r, l, heel); B.tri(l, r, heel);
}

function shade(hex, dark) {
  const base = new THREE.Color(hex), low = new THREE.Color(dark);
  const c = new THREE.Color();
  return s => {
    c.copy(low).lerp(base, Math.min(1, Math.max(0, s)));
    if (s > 1) c.multiplyScalar(1 + (s - 1) * 0.7);
    return [c.r, c.g, c.b];
  };
}

function flatCol(hex) {
  const c = new THREE.Color(hex);
  return s => [c.r * s, c.g * s, c.b * s];
}

const FALLBACK = { body: '#8a5a34', dark: '#4a2c19', comb: '#a8382f', beak: '#d8b064', leg: '#c79a5c' };
const fowlOf = id => zone(id).fowl || FALLBACK;

const darken = (hex, s) => `#${new THREE.Color(hex).multiplyScalar(s).getHexString()}`;

// One mesh per plumage. The three zones, then the hostile rows, which keep their own colour
// wherever they spawn for the reason foeshape.js gives: an enemy you have to recognise in three
// towns cannot be three colours. The comb survives the darkening — it is the only saturated mark
// on the bird, and a sour crow reads as carrion because of it.
const KEYS = [...ZONE_IDS, ...Object.keys(FOWL)];
function paletteOf(key) {
  const foe = FOWL[key];
  if (!foe) return fowlOf(key);
  const f = fowlOf(foe.zone);
  return { ...f, body: darken(f.body, foe.shade), dark: darken(f.dark, foe.shade), leg: darken(f.leg, foe.shade) };
}

function chickenGeometry(key) {
  const f = paletteOf(key);
  const B = new Build();
  const col = shade(f.body, f.dark);
  const comb = flatCol(f.comb)(1);
  const beak = flatCol(f.beak)(1);
  const leg = flatCol(f.leg);
  bodyPart(B, col);
  neckPart(B, col, comb, beak);
  wingPart(B, col, 1);
  wingPart(B, col, -1);
  tailPart(B, col);
  legPart(B, leg, 1);
  legPart(B, leg, -1);
  return B.geometry();
}

// Plumage. At 30 px this does nothing; at 2 m it is the difference between a bird and a bar of
// soap. Painted bright, because it multiplies the vertex colour rather than replacing it.
function plumageMap() {
  const t = paint(128, 128, (g, w, h) => {
    g.fillStyle = 'rgb(255,252,246)';
    g.fillRect(0, 0, w, h);
    const R = rng(0x2f81a3);
    const rows = 14;
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * h / rows;
      for (let i = -1; i < 10; i++) {
        const x = (i + (row % 2) * 0.5) * w / 9;
        const r = w / 17 * span(R, 0.9, 1.15);
        const v = Math.round(span(R, 226, 246));
        g.strokeStyle = `rgb(${v},${v - 4},${v - 9})`;
        g.lineWidth = h / 90;
        g.beginPath();
        g.arc(x, y - r * 0.55, r, Math.PI * 0.2, Math.PI * 0.8);
        g.stroke();
      }
    }
    for (let i = 0; i < 1400; i++) {
      const v = Math.round(span(R, 232, 255));
      g.fillStyle = `rgba(${v},${v},${v - 6},0.45)`;
      g.fillRect(R() * w, R() * h, 1, 1);
    }
  }, 'chicken:plumage');
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const PARS = `
uniform float uTime;
uniform vec4 uGait;
uniform vec4 uHead;
uniform vec4 uAct;
uniform vec4 uSelf;
uniform float uSeed;
attribute float aPart;
attribute vec3 aPivot;
attribute float aBend;
#ifdef USE_INSTANCING
attribute vec4 aInst;
attribute float aSeed;
#endif

mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

vec3 fowl(vec3 p, float part, vec3 pivot, float bend, vec4 self, float seed, out mat3 outR) {
  float cyc = self.x, raw = self.y, act = self.z, at = self.w;
  float g = cyc * 6.2831853;
  float mv = smoothstep(0.02, 0.40, raw);
  float spd = clamp(raw / 0.9, 0.0, 1.0);

  float isPeck = step(0.5, act) * (1.0 - step(1.5, act));
  float isFlap = step(1.5, act);

  float down = (smoothstep(0.14, 0.40, at) - smoothstep(0.60, 0.88, at)) * isPeck;
  float scr  = (smoothstep(0.0, 0.03, at) - smoothstep(0.05, 0.09, at)
             +  smoothstep(0.10, 0.13, at) - smoothstep(0.15, 0.19, at)) * isPeck;
  float jab  = sin(at * 96.0) * (smoothstep(0.40, 0.44, at) - smoothstep(0.54, 0.58, at)) * isPeck;
  float env  = smoothstep(0.0, 0.05, at) * (1.0 - smoothstep(0.40, 0.78, at)) * isFlap;
  float beat = sin(at * 58.0);
  float hop  = max(0.0, sin(min(at, 0.30) * 10.472)) * isFlap;

  float bob = uGait.y * spd * (0.5 - 0.5 * cos(2.0 * g)) * mv + uAct.w * hop;

  // The head holds still in world space for most of a step then snaps forward. Its amplitude is
  // the step length, so it cancels the body's travel exactly — that cancellation is the read.
  float f = fract(cyc * 2.0);
  float hold = uHead.x;
  float sw = f < hold ? (0.5 - f / hold)
                      : (-0.5 + smoothstep(0.0, 1.0, (f - hold) / max(0.02, 1.0 - hold)));

  mat3 R = mat3(1.0);
  vec3 T = vec3(0.0);

  if (part > 0.5 && part < 1.5) {
    float yaw = uHead.w * sin(uTime * 0.8 + seed * 6.283) * (1.0 - mv) * (1.0 - isPeck);
    float pitch = -uHead.z * sw * mv + 1.80 * uAct.x * down + 0.16 * jab - 0.42 * env;
    R = rotY(yaw * bend) * rotX(pitch * bend);
    T = vec3(0.0, -bob - 0.030 * down, uGait.x * uHead.y * mv * sw + 0.022 * down) * bend;
  } else if (part > 1.5 && part < 3.5) {
    float side = part < 2.5 ? 1.0 : -1.0;
    float roll = 0.03 + env * uAct.z * (0.95 + 0.85 * beat) + 0.12 * down;
    R = rotZ(side * roll) * rotX(env * 0.40) * rotY(-side * env * 0.28);
  } else if (part > 3.5 && part < 5.5) {
    float lg = g + (part < 4.5 ? 0.0 : 3.1415927);
    float swing = uGait.w * mv * sin(lg) - scr * 0.85 * step(part, 4.5) + env * 0.55;
    R = rotX(swing);
    T = vec3(0.0, max(0.0, -sin(lg)) * 0.026 * mv + env * 0.02, 0.0);
  } else if (part > 5.5) {
    R = rotX(uAct.y * down + 0.30 * env + 0.05 * spd * sin(2.0 * g) * mv);
  }

  vec3 q = R * (p - pivot) + pivot + T;

  mat3 bodyR = rotX(0.34 * down - 0.20 * env) * rotZ(0.09 * spd * sin(g) * mv);
  vec3 bodyPiv = vec3(0.0, 0.16, -0.02);
  vec3 bodyT = vec3(uGait.z * spd * sin(g) * mv, bob - 0.055 * down, 0.0);
  outR = bodyR * R;
  return bodyR * (q - bodyPiv) + bodyPiv + bodyT;
}

vec4 fowlSelf() {
  #ifdef USE_INSTANCING
    return aInst;
  #else
    return uSelf;
  #endif
}
float fowlSeed() {
  #ifdef USE_INSTANCING
    return aSeed;
  #else
    return uSeed;
  #endif
}
`;

const CALC = `
  mat3 fowlR;
  vec3 fowlP = fowl(position, aPart, aPivot, aBend, fowlSelf(), fowlSeed(), fowlR);
`;

function patch(shader, uniforms, withNormal) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = PARS + shader.vertexShader;
  shader.vertexShader = withNormal
    ? shader.vertexShader
      .replace('#include <beginnormal_vertex>', `${CALC}\n vec3 objectNormal = normalize(fowlR * normal);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = fowlP;')
    : shader.vertexShader
      .replace('#include <begin_vertex>', `${CALC}\n vec3 transformed = fowlP;`);
}

const AO_SEG = 7;
const AO_R = 0.19;

// The recipe terrain.js uses for ground decals: dst * (1 - srcAlpha) with the strength in alpha,
// and an inner ring so the dark core survives instead of ramping away under the bird.
function contactDisc(count) {
  const pos = [0, 0, 0], col = [0, 0, 0, 1], idx = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let j = 0; j < AO_SEG; j++) {
      const a = j / AO_SEG * TAU;
      const r = ring ? AO_R : AO_R * 0.42;
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
    name: 'chicken:contact',
  });
  const mesh = new THREE.InstancedMesh(g, m, count);
  mesh.name = 'chickens:contact';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.count = 0;
  return mesh;
}

const POOL = 54;
const PER_MESH = 24;
const PECK_T = 1.55;
const FLAP_T = 1.45;
const ROAM = 5.0;

export class Chickens {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'chickens';
    this.time = 0;
    this.recount = 0;
    this.life = 1;
    this.scale = 1;
    this.frozen = false;

    // uGait = stride, body bob, sway, leg swing · uHead = hold fraction, stabilise, thrust pitch,
    // idle look · uAct = peck reach, tail lift, wing beat, hop
    this.uniforms = {
      uTime: { value: 0 },
      uGait: { value: new THREE.Vector4(STRIDE, 0.016, 0.010, 0.62) },
      uHead: { value: new THREE.Vector4(0.70, 1.0, 0.30, 0.30) },
      uAct: { value: new THREE.Vector4(1.0, 0.62, 1.0, 0.075) },
      uSelf: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSeed: { value: 0 },
    };

    this.map = plumageMap();
    this.geo = {}; this.mat = {};
    this.depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    this.depth.onBeforeCompile = s => patch(s, this.uniforms, false);
    this.depth.customProgramCacheKey = () => 'fowlDepth';

    for (const id of KEYS) {
      this.geo[id] = chickenGeometry(id);
      const m = new THREE.MeshStandardMaterial({
        map: this.map, vertexColors: true, roughness: 0.78, metalness: 0, name: `fowl:${id}`,
      });
      m.onBeforeCompile = s => patch(s, this.uniforms, true);
      m.customProgramCacheKey = () => 'fowl';
      this.mat[id] = m;
    }

    onEnvIntensity(v => { for (const id of KEYS) this.mat[id].envMapIntensity = v; });

    this.spawn();
    this.buildMeshes();
    this.setFlock(24);
    if (new URLSearchParams(location.search).has('dev')) this.devScenarios();
  }

  // Chickens belong to a yard, so they spawn as flocks around a building rather than sprinkled:
  // one bird in a field reads as a bug, six in a yard read as livestock.
  spawn() {
    const R = rng(0x51c0a7);
    const T = this.terrain;
    const fps = (T?.footprints || []).filter(fp => fp.hw > 2 && fp.hd > 2);
    const indoors = (x, z) => (T?.footprints || []).some(fp => {
      const dx = x - fp.x, dz = z - fp.z;
      const c = Math.cos(-fp.rot), s = Math.sin(-fp.rot);
      return Math.abs(dx * c - dz * s) < fp.hw + 1.0 && Math.abs(dx * s + dz * c) < fp.hd + 1.0;
    });
    const ground = (x, z) => (T ? T.surfaceY(x, z) : heightAt(x, z));
    const free = (x, z) => !indoors(x, z) && Math.min(heightAt(x, z), ground(x, z)) > waterY(x) + 1.1
      && !nearCamera(x, z, -6);

    const sites = [];
    for (let zi = 0; zi < 3; zi++) {
      const near = fps.filter(fp => zoneAt(fp.x, fp.z) === zi);
      let made = 0;
      for (let n = 0; n < 60 && made < 3; n++) {
        const fp = near.length ? near[Math.floor(R() * near.length) % near.length] : null;
        const a = span(R, 0, TAU);
        const d = (fp ? Math.hypot(fp.hw, fp.hd) : 0) + span(R, 3.0, 7.0);
        const x = (fp ? fp.x : CENTERS[zi]) + Math.cos(a) * d;
        const z = (fp ? fp.z : span(R, -10, 30)) + Math.sin(a) * d;
        if (!free(x, z)) continue;
        sites.push({ zi, x, z });
        made++;
      }
    }

    const byZone = [[], [], []];
    for (let i = 0; i < sites.length * 8; i++) {
      const site = sites[i % sites.length];
      if (!site || byZone[site.zi].length >= PER_MESH) continue;
      const x = site.x + span(R, -2.4, 2.4), z = site.z + span(R, -2.4, 2.4);
      if (!free(x, z)) continue;
      byZone[site.zi].push({
        zi: site.zi, x, z, home: [site.x, site.z],
        heading: span(R, 0, TAU), speed: 0, cyc: span(R, 0, 4),
        seed: R(), scale: span(R, 0.88, 1.08), tone: span(R, 0.9, 1.1),
        act: 0, at: 0, wait: span(R, 0.3, 5),
      });
    }
    // Round-robin so a low flock count still puts birds in every district.
    this.agents = [];
    for (let i = 0; this.agents.length < POOL; i++) {
      const list = byZone[i % 3];
      const a = list[(i / 3) | 0];
      if (a) this.agents.push(a);
      else if (i > POOL * 3) break;
    }
  }

  buildMeshes() {
    this.meshes = KEYS.map(id => {
      const m = new THREE.InstancedMesh(this.geo[id], this.mat[id], PER_MESH);
      m.name = `chickens:${id}`;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = true;
      m.customDepthMaterial = this.depth;
      m.count = 0;
      m.geometry.setAttribute('aInst',
        new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH * 4), 4).setUsage(THREE.DynamicDrawUsage));
      m.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH), 1));
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH * 3).fill(1), 3);
      this.object3D.add(m);
      return m;
    });
    this.ao = contactDisc(POOL);
    this.object3D.add(this.ao);
    this.setContact(0.7);
  }

  setContact(v) {
    const g = this.ao.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      col.setW(i, Math.hypot(pos.getX(i), pos.getZ(i)) > AO_R * 0.9 ? 0 : v);
    }
    col.needsUpdate = true;
  }

  setFlock(n) {
    this.flockN = Math.min(n, POOL);
    this.assign();
  }

  // Two callers, both pinned so the flock knob cannot take the seat: js/game/escort.js walking a
  // hen home, and js/game/spawner.js placing a sour crow. Pinned from birth for the reason
  // robed.js is — `arm()` only runs after this returns, and an unpinned body goes undrawn until
  // the next re-assign.
  add(spec) {
    const foe = spec.enemy ? FOWL[spec.enemy] : null;
    if (spec.enemy && !foe) return null;
    const zi = foe ? KEYS.indexOf(spec.enemy) : zoneAt(spec.x, spec.z);
    if (this.agents.filter(a => a.pin && a.zi === zi).length >= PER_MESH) return null;
    const R = this.rand || (this.rand = rng(0x7c31a9));
    const a = {
      zi, x: spec.x, z: spec.z, home: spec.home || [spec.x, spec.z], pin: true,
      heading: spec.heading || 0, speed: 0, cyc: span(R, 0, 4), seed: R(),
      scale: foe?.scale ?? 1, tone: 1, act: 0, at: 0, wait: span(R, 0.3, 5),
    };
    if (foe) Object.assign(a, { enemy: spec.enemy, kind: spec.enemy, run: foe.run, state: STATE.idle });
    this.agents.unshift(a);
    this.assign();
    return a;
  }

  remove(a) {
    const i = this.agents.indexOf(a);
    if (i < 0) return false;
    this.agents.splice(i, 1);
    this.assign();
    return true;
  }

  // Slots went to the first N agents in spawn order, so a bird could stand two metres in front of
  // you and never be drawn while one across the map held its slot.
  assign(cam) {
    this.active = penned(this.agents, this.flockN ?? 24, cam, POOL);
    const col = new THREE.Color();
    this.meshes.forEach((mesh, zi) => {
      const list = this.active.filter(a => a.zi === zi).slice(0, PER_MESH);
      mesh.count = list.length;
      mesh.userData.list = list;
      const ic = mesh.instanceColor, sd = mesh.geometry.getAttribute('aSeed');
      list.forEach((a, i) => {
        col.setRGB(a.tone, a.tone * 0.99, a.tone * 0.96).toArray(ic.array, i * 3);
        sd.array[i] = a.seed;
      });
      ic.needsUpdate = true; sd.needsUpdate = true;
    });
    this.recount = 0;
  }

  registerKnobs(q) {
    const U = this.uniforms;
    q.register({ key: 'flock', label: 'Chickens', type: 'range', min: 0, max: POOL, step: 3, default: 24, group: 'Fowl' },
      v => this.setFlock(v));
    q.register({ key: 'fowlScale', label: 'Chicken size', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1, group: 'Fowl' },
      v => { this.scale = v; });
    q.register({ key: 'fowlHead', label: 'Head stabilise', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'Fowl' },
      v => { U.uHead.value.y = v; });
    q.register({ key: 'fowlHold', label: 'Head hold fraction', type: 'range', min: 0.3, max: 0.92, step: 0.02, default: 0.7, group: 'Fowl' },
      v => { U.uHead.value.x = v; });
    q.register({ key: 'fowlBob', label: 'Body bob', type: 'range', min: 0, max: 0.05, step: 0.002, default: 0.016, group: 'Fowl' },
      v => { U.uGait.value.y = v; });
    q.register({ key: 'fowlSwing', label: 'Leg swing', type: 'range', min: 0, max: 1.4, step: 0.02, default: 0.62, group: 'Fowl' },
      v => { U.uGait.value.w = v; });
    q.register({ key: 'fowlPeck', label: 'Peck reach', type: 'range', min: 0, max: 1.5, step: 0.05, default: 1, group: 'Fowl' },
      v => { U.uAct.value.x = v; });
    q.register({ key: 'fowlTail', label: 'Peck tail lift', type: 'range', min: 0, max: 1.4, step: 0.02, default: 0.62, group: 'Fowl' },
      v => { U.uAct.value.y = v; });
    q.register({ key: 'fowlWing', label: 'Wing beat', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'Fowl' },
      v => { U.uAct.value.z = v; });
    q.register({ key: 'fowlHop', label: 'Startle hop', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0.075, group: 'Fowl' },
      v => { U.uAct.value.w = v; });
    q.register({ key: 'fowlLife', label: 'Activity', type: 'range', min: 0, max: 3, step: 0.1, default: 1, group: 'Fowl' },
      v => { this.life = v; });
    q.register({ key: 'fowlContact', label: 'Chicken contact shade', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7, group: 'Fowl' },
      v => this.setContact(v));
  }

  // Only with ?dev=1 — --all must keep rendering exactly the five the critic scores.
  devScenarios() {
    const a = this.agents.filter(g => g.zi === 1)
      .sort((p, q) => (heightAt(q.x, q.z) - waterY(q.x)) - (heightAt(p.x, p.z) - waterY(p.x)))[0];
    if (!a) return;
    const gy = heightAt(a.x, a.z);
    const at = (id, label, d, h, fov) => defineScenario({
      id, label, zone: 'neutral',
      setup: app => {
        frameCamera(app, { pos: [a.x + d, gy + h, a.z + d], look: [a.x, gy + 0.22, a.z], fov });
        app.quality.set('time', 10.5);
      },
    });
    at('fowl_close', 'Chicken close-up', 1.1, 0.45, 36);
    at('fowl_yard', 'Chicken yard', 6.0, 2.6, 42);
    at('fowl_far', 'Chickens at 30 m', 21, 8, 40);

    // The crow beside a yard bird, which is the only comparison that says whether the scale reads.
    // Placed in the setup, not here: a body built at boot stands in every other rig's dev shot.
    for (const [id, t] of [['foe_sour_crow', 10.5], ['foe_sour_crow_night', 22]]) {
      defineScenario({
        id, label: `sour crow at 3 m${t > 20 ? ', at night' : ''}`, zone: 'neutral',
        setup: app => {
          if (!this.crowShown) this.crowShown = this.add({ enemy: 'sour_crow', x: a.x + 1.1, z: a.z });
          frameCamera(app, { pos: [a.x + 2.2, gy + 1.1, a.z + 2.4], look: [a.x + 0.5, gy + 0.35, a.z], fov: 40 });
          app.quality.set('time', t);
        },
      });
    }
  }

  choose(a) {
    const r = Math.random();
    if (r < 0.46) { a.act = 1; a.at = 0; a.speed = 0; }
    else if (r < 0.58) { a.act = 2; a.at = 0; a.speed = 0; }
    else {
      a.act = 0;
      a.heading += (Math.random() - 0.5) * 2.6;
      a.speed = WALK_SPEED * (0.7 + Math.random() * 0.6);
      a.wait = (0.8 + Math.random() * 2.4) / Math.max(0.15, this.life);
    }
  }

  // Same division robed.js has: js/sim/foes.js decides the heading and the speed, `carry` applies
  // them, and the rig puts the colliders on top.
  foeStep(a, dt) {
    const w = carry(a, dt);
    if (!w) return;
    const step = collidersReady() ? walkStep(a.x, a.z, w.x, w.z, a.y ?? 0, 0.16) : w;
    a.x = step.x;
    a.z = step.z;
  }

  update(dt, app) {
    // Frozen leaves the frame exactly as it was. A hostile crow's speed comes from the session's
    // spawner tick, which stops with the menu, so without this it would coast on the last one.
    if (this.frozen) return;
    this.time = (this.time + dt) % 600;
    this.uniforms.uTime.value = this.time;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const tilt = new THREE.Quaternion();
    const up = new THREE.Vector3();
    const T = this.terrain;
    let ai = 0;

    for (const mesh of this.meshes) {
      const list = mesh.userData.list;
      if (!list || !list.length) continue;
      const inst = mesh.geometry.getAttribute('aInst');

      for (let i = 0; i < list.length; i++) {
        const a = list[i];

        // Test hook: pins every bird to one pose so a still can be taken at a chosen phase. A
        // pinned bird is a hen being driven home — js/game/escort.js owns its position, heading
        // and speed — so neither the pose clock nor the wander gets a say in what it does.
        if (this.hold) Object.assign(a, this.hold);
        else if (!a.pin) {
          if (a.act) {
            a.at += dt / (a.act === 1 ? PECK_T : FLAP_T);
            // A startle is a burst of wing and then a short scurry away, not a flap on the spot.
            a.speed = a.act === 2 && a.at > 0.28 && a.at < 0.80 ? SCURRY * (0.80 - a.at) * 2.4 : 0;
            if (a.at >= 1) {
              a.act = 0; a.at = 0; a.speed = 0;
              a.wait = (0.5 + Math.random() * 2.4) / Math.max(0.15, this.life);
            }
          } else {
            a.wait -= dt * this.life;
            if (a.wait <= 0) this.choose(a);
          }

          if (a.speed > 0.01) {
            const wx = a.x + Math.sin(a.heading) * a.speed * dt;
            const wz = a.z + Math.cos(a.heading) * a.speed * dt;
            const step = collidersReady() ? walkStep(a.x, a.z, wx, wz, a.y ?? 0, 0.16) : { x: wx, z: wz, hit: false };
            const dx = step.x - a.home[0], dz = step.z - a.home[1];
            if (dx * dx + dz * dz > ROAM * ROAM || step.hit) a.heading += Math.PI * 0.83;
            else {
              a.cyc += Math.hypot(step.x - a.x, step.z - a.z) / (2 * STRIDE);
              a.x = step.x; a.z = step.z;
            }
          }
        }

        if (a.enemy) this.foeStep(a, dt);

        // A pinned bird is carried rather than walked, so its stride comes from how far it moved.
        if (a.pin) a.cyc += Math.hypot(a.x - (a.lx ?? a.x), a.z - (a.lz ?? a.z)) / (2 * STRIDE * a.scale);
        a.lx = a.x; a.lz = a.z;

        const fall = T ? T.surfaceY(a.x, a.z) : heightAt(a.x, a.z);
        const want = collidersReady() ? groundAt(a.x, a.z, a.y ?? fall) : fall;
        const gy = a.y = a.y === undefined ? want : a.y + (want - a.y) * (1 - Math.exp(-12 * dt));

        // js/sim/foes.js's ACT numbers land on the shader's own: attack is 1, which is the peck,
        // and hurt is 2, which is the startle flap. Only the fall has no counterpart, so it rides
        // the instance matrix — a roll about the bird's own axis, pivoting at its feet.
        const drop = a.act === ACT.die ? Math.min(1, a.at / 0.45) ** 2 : 0;
        e.set(0, a.heading, 1.48 * drop);
        q.setFromEuler(e);
        pos.set(a.x, gy, a.z);
        scl.setScalar(a.scale * this.scale);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);

        if (ai < POOL) {
          if (T) {
            up.set(T.surfaceY(a.x - 0.4, a.z) - T.surfaceY(a.x + 0.4, a.z), 0.8,
              T.surfaceY(a.x, a.z - 0.4) - T.surfaceY(a.x, a.z + 0.4)).normalize();
            tilt.setFromUnitVectors(UP, up);
          }
          pos.set(a.x, gy + 0.035, a.z);
          scl.set(a.scale, 1, a.scale);
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
      for (const m of this.meshes) if (m.count) m.computeBoundingSphere();
    }
  }

  cost() {
    const per = {};
    for (const id of KEYS) per[id] = this.geo[id].userData.tris;
    const birds = this.meshes.reduce((s, m, i) => s + m.count * per[KEYS[i]], 0);
    return { per, birds, contact: this.ao.count * AO_SEG * 3, drawn: this.meshes.filter(m => m.count).length + 1 };
  }
}
