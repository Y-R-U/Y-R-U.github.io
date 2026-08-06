// Card fields, textures and the sea-light arbiter shared by impact.js and fire.js — C4.
// VFX-private: nothing outside those two files imports this.
//
// `vfx/index.js` is frozen and its shared field is hard-additive on a soft disc whose falloff stops
// at the quad edge. C3 measured what that costs — a countable circular boundary and hard white
// bokeh discs at 4x — so this file provides the same service with the two fixes: soft-additive
// blending for anything emissive, and falloffs that reach zero inside the quad.
//
// It also adds two things CardField cannot do and a splash needs: non-uniform scale (a flame tongue
// and a spray streak are both far taller than they are wide) and a per-instance alpha on the
// normal-blended path.

import * as THREE from 'three';
import { track } from '../../engine/budget.js';
import { fields, clamp, smoothstep } from '../textures/noise.js';
import { sea } from '../ocean.js';
import { setShipAmbient } from '../materials/hull.js';

// dst' = src·(1 − dst) + dst, which approaches 1 asymptotically and cannot reach it. Additive
// blending happens after tone mapping, so N plain-additive cards sum in LDR and clip to a flat
// white plateau; this is the soft knee the scene has no bloom pass to give. The factor is on the
// source COLOUR, so alpha no longer modulates it — every texture on this path is premultiplied.
export function softAdd(mat) {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneMinusDstColorFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

// Isolation switches, read every frame: `--pre="__c4.col=0"` renders a splash with no column body,
// `__c4.spray=0` with no spray. Isolating a term is the only way to tell "wired wrong" from "wired
// right and multiplied out", and both failures look identical in a finished frame.
export const dbg = (window.__c4 = window.__c4 ?? { col: 1, spray: 1, apron: 1, flame: 1, smoke: 1, hot: 1, sea: 1, light: 1, rain: 1 });

const AXIS = new THREE.Vector3(0, 0, 1);
const TINT = new THREE.Color();
const all = new Set();
let pumped = -1;

// index.js pumps only its own field, so every live effect calls this and the frame guard makes the
// extra calls free.
export function pumpCards(camera) {
  const f = window.__waterline?.frames?.() ?? -1;
  if (f === pumped) return;
  pumped = f;
  for (const c of all) c.flush(camera);
}

export class Cards {
  constructor(cap, mat, { perAlpha = false, order = 4, root, minPx = 2.5 } = {}) {
    this.cap = cap;
    this.perAlpha = perAlpha;
    this.minPx = minPx;
    if (perAlpha) alphaPatch(mat);
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.count = cap;
    if (perAlpha) {
      this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      this.aAlpha.setUsage(THREE.DynamicDrawUsage);
      this.mesh.geometry.setAttribute('aAlpha', this.aAlpha);
    }
    this.slots = [];
    for (let i = 0; i < cap; i++) {
      this.slots.push({ i, live: false, pos: new THREE.Vector3(), sx: 1, sy: 1, rot: 0, alpha: 0, colour: new THREE.Color() });
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.qq = new THREE.Quaternion();
    this.qz = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    if (root) root.add(this.mesh);
    all.add(this);
  }

  take() {
    for (const s of this.slots) if (!s.live) { s.live = true; s.alpha = 0; s.rot = 0; return s; }
    return null;
  }

  give(s) { if (s) { s.live = false; s.alpha = 0; } }

  flush(camera) {
    camera.getWorldQuaternion(this.q);
    // world metres per screen pixel at unit distance. A card thinner than a couple of pixels is
    // not a small particle, it is an aliased square — the far embers were 1–2 px hard-edged blocks.
    // Grow it to the floor and pay for the extra area in alpha (exponent < 1 so it stays visible).
    const px = (window.innerHeight || 720) * (window.devicePixelRatio || 1);
    const mpp = 2 * Math.tan((camera.fov ?? 50) * Math.PI / 360) / px;
    let live = 0;
    for (const s of this.slots) {
      const on = s.live && s.alpha > 0.002;
      if (on) live++;
      if (s.rot) { this.qz.setFromAxisAngle(AXIS, s.rot); this.qq.copy(this.q).multiply(this.qz); }
      else this.qq.copy(this.q);
      let sx = s.sx, sy = s.sy, dim = 1;
      if (on && this.minPx > 0) {
        const floor = mpp * this.minPx * camera.position.distanceTo(s.pos);
        const ax = Math.abs(sx), ay = Math.abs(sy);
        if (ax < floor || ay < floor) {
          const nx = Math.max(ax, floor), ny = Math.max(ay, floor);
          dim = Math.pow((ax * ay) / (nx * ny), 0.7);
          sx = Math.sign(sx || 1) * nx; sy = Math.sign(sy || 1) * ny;
        }
      }
      this.s.set(on ? sx : 0, on ? sy : 0, 1);
      this.m.compose(s.pos, this.qq, this.s);
      this.mesh.setMatrixAt(s.i, this.m);
      if (dim < 1 && !this.perAlpha) { TINT.copy(s.colour).multiplyScalar(dim); this.mesh.setColorAt(s.i, TINT); }
      else this.mesh.setColorAt(s.i, s.colour);
      if (this.aAlpha) this.aAlpha.array[s.i] = on ? s.alpha * dim : 0;
    }
    this.mesh.count = live ? this.cap : 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    if (this.aAlpha) this.aAlpha.needsUpdate = true;
  }
}

// One field per material, shared by impact.js and fire.js: a splash, an explosion and a burning
// ship are four card systems between them, not eight, and each field is one draw call.

let sprayF = null, smokeF = null, hotF = null, flameF = null, rainF = null;

export function sprayField(root) {
  if (!sprayF) sprayF = new Cards(560, new THREE.MeshBasicMaterial({
    map: sprayTexture(), transparent: true, depthWrite: false, fog: true, toneMapped: true,
  }), { perAlpha: true, order: 3, root });
  return sprayF;
}

export function smokeField(root) {
  if (!smokeF) smokeF = new Cards(280, new THREE.MeshBasicMaterial({
    map: smokeTexture(), transparent: true, depthWrite: false, fog: true, toneMapped: true,
  }), { perAlpha: true, order: 3, root });
  return smokeF;
}

export function hotField(root) {
  if (!hotF) hotF = new Cards(260, softAdd(new THREE.MeshBasicMaterial({
    map: hotTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: true,
  })), { order: 6, root });
  return hotF;
}

export function flameField(root) {
  if (!flameF) flameF = new Cards(220, softAdd(new THREE.MeshBasicMaterial({
    map: flameTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: true,
  })), { order: 5, root });
  return flameF;
}

// Rain is soft-additive, not alpha-blended, and that is the whole point. An alpha streak drawn over
// a fire's core can only DARKEN it, so every streak crossing the glow came back cool grey however
// warm its own colour was. Additive, the streak takes the fire's light instead of masking it.
export function rainField(root) {
  if (!rainF) rainF = new Cards(360, softAdd(new THREE.MeshBasicMaterial({
    map: rainTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: true,
  })), { order: 7, root, minPx: 1.6 });
  return rainF;
}

// instanceColor alone cannot fade a normal-blended card, so every puff in a cloud would pop out of
// existence on the same frame. Same patch C3 uses on its gun smoke.
function alphaPatch(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vA;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vA = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vA;')
      .replace('#include <opaque_fragment>', 'gl_FragColor = vec4( outgoingLight, diffuseColor.a * vA );');
  };
  mat.customProgramCacheKey = () => 'waterlineC4Alpha';
}

// ── textures ────────────────────────────────────────────────────────────────────────────────
// All small. D16: texture MB is a project total and C4/C6/C7 share about 6 MB of it, so nothing
// here is over 128² and none of it is baked per effect.

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

function finish(cv, { srgb = true, label, mips = true }) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  track(t, { w: cv.width, h: cv.height, fmt: 'rgba', mips, label });
  return t;
}

let sprayT = null;
// Spray, for the splash column and its fallout. The alpha carries only low-frequency shape,
// stretched vertically so a card reads as a torn streak of water rather than as a disc — the
// plate's column is made of vertical fingers, and a radial gradient stacked forty deep integrates
// into a smooth lozenge, which is the "cards read as cards" defect. rgb carries a top-lit ramp so
// every card has a lit face and a shadowed face before any per-card shading is applied.
export function sprayTexture() {
  if (sprayT) return sprayT;
  const S = 128;
  const cv = canvas(S, S);
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const f = fields();
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.hypot(u * 1.25, v * 0.92) * 2;
      // sampled with v compressed 3x, so the noise features are vertical streaks
      const n = f.coarse.at(u * 1.6 + 0.5, v * 0.5 + 0.27) - 0.5;
      const w = f.warp.at(u * 2.6 + 0.5, v * 0.7 + 0.61) - 0.5;
      const e = (f.fine.at(u * 5.1 + 0.63, v * 1.9 + 0.11) - 0.5) * d;
      let a = smoothstep(1.0, 0.04, d * (0.86 + 0.62 * n + 0.30 * w + 0.40 * e));
      a *= 0.42 + 0.72 * f.coarse.at(u * 3.4 + 0.2, v * 0.62 + 0.8);
      // The noise modulates the radius, so on a low-noise texel the falloff has not reached zero by
      // the corner of the quad. The guard has to be RADIAL: a max(|u|,|v|) box guard ends the card
      // on four straight sides, and on a 12 m veil card that is a hard-edged grey wedge lying across
      // the water. Long ramp so the circle it does draw is never a visible boundary.
      a *= smoothstep(0.86, 0.30, d);
      const lit = 0.52 + 0.48 * smoothstep(0.75, -0.85, v * 2);
      const i = (y * S + x) * 4;
      img.data[i] = 252 * lit; img.data[i + 1] = 254 * lit; img.data[i + 2] = 255 * lit;
      img.data[i + 3] = clamp(a, 0, 1) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  sprayT = finish(cv, { label: 'vfx:spray' });
  return sprayT;
}

let smokeT = null;
// Dark smoke. Low-frequency alpha only (fine noise multiplied in resolves as clumps of dithered
// pixels the moment anyone zooms), and a mild baked top-light — the strong shading is per card,
// computed from the fire's centre, because MeshBasic can never be reached by a PointLight.
export function smokeTexture() {
  if (smokeT) return smokeT;
  const S = 128;
  const cv = canvas(S, S);
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const f = fields();
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.hypot(u, v) * 2;
      const n = f.coarse.at(u * 1.15 + 0.31, v * 1.15 + 0.62) - 0.5;
      const b = f.warp.at(u * 0.8 + 0.7, v * 0.8 + 0.2) - 0.5;
      // the fine term is weighted by d so it only bites at the silhouette: a low-frequency radius
      // wobble alone still draws a smooth oval, and a smooth oval is what makes a row of puffs
      // countable
      const e = (f.fine.at(u * 4.3 + 0.17, v * 4.3 + 0.83) - 0.5) * d;
      // radial guard, not a box — see the note in sprayTexture
      const a = smoothstep(1.0, 0.07, d * (0.86 + 0.42 * n + 0.22 * b + 0.34 * e))
        * smoothstep(0.96, 0.30, d);
      const lit = (0.46 + 0.54 * smoothstep(0.6, -0.6, v * 2)) * (0.9 + 0.1 * (1 - d));
      const i = (y * S + x) * 4;
      img.data[i] = 255 * lit; img.data[i + 1] = 250 * lit; img.data[i + 2] = 243 * lit;
      img.data[i + 3] = clamp(a, 0, 1) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  smokeT = finish(cv, { label: 'vfx:smoke' });
  return smokeT;
}

let flameT = null;
// One flame tongue: wide and hot at the root, tapering to a curled point, with internal flutes and
// see-through gaps. Premultiplied for softAdd. The plate's oil fires are clusters of these — a
// blob of orange sprites has no tongue silhouette and reads as a smoke puff tinted orange.
export function flameTexture() {
  if (flameT) return flameT;
  const W = 64, H = 128;
  const cv = canvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const f = fields();
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;                       // 0 at the root, 1 at the tip
    // peaks near v = 0.28: a tongue swells just off its root and tapers to a point
    // 0.80 is the peak of the two-term product below, so `half` peaks at 0.40 of the quad width.
    // Getting that normaliser wrong put the tongue WIDER than its own quad and every flame in the
    // first fire render had hard vertical sides — five straight-edged pillars at 3x.
    const half = 0.42 * Math.pow(smoothstep(-0.12, 0.34, v), 0.50) * Math.pow(1 - v, 0.55) / 0.80;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5;
      const k = half > 1e-3 ? Math.abs(u) / half : 9;
      const n = f.coarse.at(u * 2.2 + 0.5, v * 0.9 + 0.13) - 0.5;
      // three soft flutes across the tongue plus a low-frequency wobble down its length
      const flute = 0.80 + 0.20 * Math.cos(u * Math.PI * 7);
      let a = Math.pow(clamp(1 - k * (0.92 + 0.50 * n), 0, 1), 1.15) * flute;
      a *= smoothstep(1.02, 0.62, v);                  // the tip dissolves rather than ending
      a *= smoothstep(1.02, 0.70, Math.abs(u) * 2);    // and the sides end inside the quad
      a *= smoothstep(0, 0.11, v);                     // no ruled line where the root is cut off
      const core = Math.pow(clamp(1 - k * 1.9, 0, 1), 1.4) * Math.pow(1 - v, 1.2);
      const heat = clamp(core * 1.15 + Math.pow(1 - v, 2.4) * 0.35, 0, 1);
      // The colour ceiling. softAdd drives every non-zero channel towards 1, so a stack deep enough
      // to saturate red saturates green too and the core goes neutral white — small white pips with
      // nothing inside them. Holding green at ~0.8·red and blue at ~0.43·red in the SOURCE means
      // green is still a chroma behind when red tops out, so the hottest core rolls red→orange→
      // yellow and never reaches G=255. Do not "make the fire hotter" by raising these.
      const r = 255;
      const gr = 66 + 138 * heat;
      const b = 6 + 104 * heat * heat;
      const i = (y * W + x) * 4;
      img.data[i] = r * a; img.data[i + 1] = gr * a; img.data[i + 2] = b * a;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  flameT = finish(cv, { srgb: false, label: 'vfx:flame' });
  return flameT;
}

let hotT = null;
// The generic emissive blob: fireball, flame root, ember, glow. Premultiplied, and the falloff runs
// to zero over the whole quad with a high exponent so there is no radius at which it stops and
// draws an edge. The radius is noise-warped: a mathematically perfect radial falloff is what makes
// a fireball resolve into a cluster of countable bokeh discs at 2x, and this is the one texture
// every hot card in the game uses.
export function hotTexture() {
  if (hotT) return hotT;
  const S = 96;
  const cv = canvas(S, S);
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const f = fields();
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const n = (f.coarse.at(u * 1.3 + 0.44, v * 1.3 + 0.19) - 0.5)
        + 0.5 * (f.fine.at(u * 3.6 + 0.7, v * 3.6 + 0.05) - 0.5);
      const d = Math.min(1, Math.hypot(u, v) * 2 * (0.86 + 0.48 * n));
      const a = Math.pow(1 - d, 2.7) * (0.52 + 0.48 * (1 - d * d))
        * smoothstep(1.0, 0.42, Math.hypot(u, v) * 2);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  hotT = finish(cv, { srgb: false, label: 'vfx:hot' });
  return hotT;
}

let rainT = null;
// One streak. The old rain reused the spray card, whose falloff is radial, so at 30:1 aspect every
// drop had the same flat body and the same abrupt end. This tapers to nothing at both tips, is
// brightest a third of the way down (where a falling drop's smear catches most light), and carries
// a low-frequency break along its length so no two sample the same profile. Premultiplied.
export function rainTexture() {
  if (rainT) return rainT;
  const W = 16, H = 128;
  const cv = canvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const f = fields();
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const along = Math.pow(Math.sin(Math.PI * v), 0.85) * (0.62 + 0.55 * Math.pow(1 - v, 1.4));
    const brk = 0.72 + 0.42 * f.coarse.at(0.31, v * 2.6);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5;
      const a = clamp(along * brk * Math.pow(clamp(1 - Math.abs(u) * 2.1, 0, 1), 1.25), 0, 1);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  rainT = finish(cv, { srgb: false, label: 'vfx:rain' });
  return rainT;
}

let apronT = null;
// What a splash leaves on the water: a broken foam ring with disturbed dark water inside it. Both
// live in one texture because "objects that do not touch" is the most reliably punished defect on
// this project and contact darkening is half of the answer — a bright ring alone floats.
export function apronTexture() {
  if (apronT) return apronT;
  const S = 128;
  const cv = canvas(S, S);
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const f = fields();
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.min(1.3, Math.hypot(u, v) * 2);
      const th = Math.atan2(v, u) / (Math.PI * 2) + 0.5;
      const n = f.coarse.at(th * 2.0, d * 0.85 + 0.2);
      const m = f.fine.at(th * 3.0 + 0.4, d * 0.6);
      // radial fingers, not an annulus: a splash throws foam outward in spokes and a smooth ring
      // reads as a decal laid on the water. High angular frequency, sampled per-angle only, so the
      // streaks run along d rather than round it.
      const spoke = 0.30 + 1.25 * f.fine.at(th * 7.0 + 0.9, 0.31)
        * (0.45 + 0.85 * f.coarse.at(th * 3.5 + 0.2, 0.77));
      // narrow: a wide Gaussian integrates into a filled saucer, and a filled saucer is the "dark
      // elliptical smudge" the base used to be. The band has to be thin enough to read as a ring
      // with disturbed water visible inside it.
      const ring = Math.exp(-Math.pow((d - 0.60 - 0.14 * (n - 0.5)) / (0.085 + 0.115 * spoke), 2))
        * (0.30 + 1.30 * n) * (0.30 + 1.00 * spoke);
      const inner = smoothstep(0.78, 0.0, d) * (0.55 + 0.45 * m);
      const edge = smoothstep(1.06, 0.74, d);
      const foam = clamp(ring * 1.15, 0, 1) * edge;
      const dark = clamp(inner * 0.30, 0, 1) * edge;
      const a = clamp(foam + dark, 0, 1);
      const mixw = a > 1e-3 ? foam / (foam + dark + 1e-3) : 0;
      const i = (y * S + x) * 4;
      img.data[i] = (28 + 222 * mixw);
      img.data[i + 1] = (44 + 208 * mixw);
      img.data[i + 2] = (46 + 206 * mixw);
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  apronT = finish(cv, { label: 'vfx:apron' });
  return apronT;
}

let ringT = null;
// The wave a splash sends out across the water, as an annulus on its own texture rather than as a
// second apron: the apron carries contact darkening across its whole disc, and at six times the
// column's radius that darkening is a grey saucer sitting on the sea. This is ring only — a bright
// leading crest, a shorter aerated tail behind it, and nothing at all inside.
export function ringTexture() {
  if (ringT) return ringT;
  const S = 128;
  const cv = canvas(S, S);
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const f = fields();
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.hypot(u, v) * 2;
      const th = Math.atan2(v, u) / (Math.PI * 2) + 0.5;
      // the crest is not a circle: a ring that keeps its radius all the way round is a decal
      const wob = 0.055 * (f.coarse.at(th * 2.0, 0.31) - 0.5) + 0.030 * (f.fine.at(th * 5.0, 0.7) - 0.5);
      const rr = 0.80 + wob;
      const front = Math.exp(-Math.pow((d - rr) / 0.075, 2));
      const tail = Math.exp(-Math.pow((d - rr + 0.16) / 0.135, 2)) * 0.40;
      const brk = 0.35 + 1.15 * f.fine.at(th * 6.0 + 0.4, 0.55);
      const a = clamp((front + tail) * brk, 0, 1) * smoothstep(1.02, 0.86, d);
      const i = (y * S + x) * 4;
      img.data[i] = 236; img.data[i + 1] = 244; img.data[i + 2] = 248;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  ringT = finish(cv, { label: 'vfx:ring' });
  return ringT;
}

// ── a patch of water an effect sits on ──────────────────────────────────────────────────────
// A flat quad on the sea slices through the crests and draws an angular polygon boundary across
// them — gun.js works around it by floating its blast wash 2.2 m clear, which is fine for a glow
// and useless for foam that has to touch. This writes its vertices from ocean.heightAt every
// frame instead, so the patch lies on the swell.

export class WaterPatch {
  constructor(mat, { rings = 6, seg = 26, root } = {}) {
    const pos = [], uv = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const rr = Math.pow(r / rings, 0.85);
      for (let a = 0; a <= seg; a++) {
        const th = (a / seg) * Math.PI * 2;
        const dx = Math.cos(th) * rr, dz = Math.sin(th) * rr;
        pos.push(dx, 0, dz);
        uv.push(0.5 + dx * 0.5, 0.5 + dz * 0.5);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let a = 0; a < seg; a++) {
        const i0 = r * (seg + 1) + a, i1 = i0 + 1, i2 = i0 + seg + 1, i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.unit = Float32Array.from(pos);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    if (root) root.add(this.mesh);
  }

  set(x, z, radius, lift = 0.4) {
    const p = this.geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const dx = this.unit[i] * radius, dz = this.unit[i + 2] * radius;
      p[i] = dx;
      p[i + 1] = seaHeight(x + dx, z + dz) + lift;
      p[i + 2] = dz;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.position.set(x, 0, z);
    this.mesh.visible = true;
  }

  hide() { this.mesh.visible = false; }
}

// ── sea lights ──────────────────────────────────────────────────────────────────────────────
// ocean.setSeaLights takes at most 2 sources, and gun.js clears the list outright when a muzzle
// dies. Both facts make a last-writer-wins call site wrong: a burning ship must not lose the water
// under it because a splash 300 m away expired. Every source registers here, the two strongest win,
// and the list is re-asserted every frame so another component's clear cannot survive.

const sources = [];
const two = [];

export function seaSource() {
  const s = { pos: new THREE.Vector3(), colour: '#ff8a30', intensity: 0, radius: 200, live: true };
  sources.push(s);
  return s;
}

export function seaSources() { return sources; }

// Every fire and every fireball also registers here, whether or not it won a sea-light slot. The
// sea arbiter caps at two; "what is bright enough to light the rain and the smoke" has no such cap
// and a fire with `sea:false` still throws light on everything near it.
const warms = [];
export function warmSource(radius = 60) {
  const s = { pos: new THREE.Vector3(), intensity: 0, radius };
  warms.push(s);
  return s;
}
export function dropWarmSource(s) { const i = warms.indexOf(s); if (i >= 0) warms.splice(i, 1); }
export function warmSources() { return warms; }

export function dropSeaSource(s) {
  const i = sources.indexOf(s);
  if (i >= 0) sources.splice(i, 1);
}

export function pumpSea() {
  const ocean = window.__waterline?.world?.ocean;
  if (!ocean) return;
  two.length = 0;
  for (const s of sources) if (s.intensity * dbg.sea > 0.01) two.push(s);
  two.sort((a, b) => b.intensity - a.intensity);
  for (const s of two) s.applied = s.intensity * dbg.sea;
  ocean.setSeaLights(two.slice(0, 2).map(s => ({ pos: s.pos, colour: s.colour, intensity: s.applied, radius: s.radius })));
}

// The emitter context, stashed by the first emitter that runs. Rain is not one of the six names the
// frozen façade knows about, so it has no way in — but it is the same card field and the same pump,
// and a scenario that has already emitted a fire has already given us the context it needs.
let CTX = null;
export function useCtx(c) { CTX = c; }
export function vfxCtx() { return CTX; }

// ── posing ──────────────────────────────────────────────────────────────────────────────────
// A still of an animated effect must be reproducible or it cannot be scored: the harness settles
// 45 frames before capture, so an unpinned 3 s splash is long gone, and under D13 two renders of
// the same code land on different phases anyway. Two clocks, because an impact worth looking at is
// 0.1 s old and the fire it starts is 30 s old.

const pin = { impact: null, spread: 0, fire: null };

export function setImpactPhase(t, spread = 0) { pin.impact = t; pin.spread = spread; }
export function setFirePhase(t) { pin.fire = t; }
export function impactPin() { return pin.impact; }
export function impactSpread() { return pin.spread; }
export function firePin() { return pin.fire; }

// ── scenario setup ──────────────────────────────────────────────────────────────────────────

export function vfxScene(app, grade, { seaState, shadow = 110, sky, fog, fade, amb = 0.86 } = {}) {
  const { ocean, lighting } = sea(app, grade, ['fleet']);
  const fleet = window.__waterline.world.fleet;
  fleet.clearStage();
  window.__waterline.vfx.clear();
  setShipAmbient(amb);
  // Knobs first. Every sky knob re-runs sky.applyGrade(), whose listeners rewrite scene.fog from
  // the grade — D15 gives fog an override that survives that, but sea state and detail fade have
  // none, so they still have to come after.
  if (sky) for (const k of Object.keys(sky)) app.quality.set(k, sky[k]);
  // NOT ocean.setSeaState(): that writes stateIdx, which applyGrade overwrites from the grade the
  // next time anything touches the sky — sky.setSun() after this call put all three scored shots
  // back on the dusk grade's `slight` (0.7 m). The knob writes stateOverride, which applyGrade
  // respects. -1 hands the state back to the grade.
  app.quality.set('seaState', seaState ?? -1);
  if (fog) lighting.setFog(fog[0], fog[1]);
  if (fade) ocean.setDetailFade(fade);
  lighting.setShadowExtent(shadow);
  return { ocean, lighting, fleet };
}

// ── shared world knowledge ──────────────────────────────────────────────────────────────────

const SUN = new THREE.Vector3(-0.5, 0.7, 0.4).normalize();
export function sunDir() {
  const s = window.__waterline?.world?.lighting?.sun;
  return s ? SUN.copy(s.position).normalize() : SUN;
}

export function seaHeight(x, z) {
  return window.__waterline?.world?.ocean?.heightAt(x, z) ?? 0;
}
