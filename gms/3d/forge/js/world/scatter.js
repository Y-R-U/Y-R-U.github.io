// Everything growing out of the ground: grass, flowers, shrubs, loose stone and trees.
// All instanced, one mesh per zone per type, density driven by quality.settings.foliage.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { clamp, lerp, smoothstep } from './textures/noise.js';
import { heightAt, waterY, creekZ, creekHalf, zoneAt, fbm, CENTERS, nearCamera, inCorridor, camDist } from './terrain.js';
import { track } from '../engine/budget.js';
import { defineScenario, frameCamera } from '../scenarios.js';

const CAP = { grass: 3100, flower: 300, bush: 300, rock: 150, tree: 66 };

const TUNING = {
  grass: { cluster: [1, 5], clusterR: 0.78, footBlend: 0.5, footShade: 0.92, tip: 0.98, value: 0.82 },
  canopy: { lobes: 5, amp: 0.50, sharp: 2.0, noise: 0.09, mottle: 0.30, flat: 0.34, sy: 1.0, join: 0.26, rim: 0.2 },
  bush: { lobes: 3, amp: 0.44, sharp: 1.5, noise: 0.14, mottle: 0.2, flat: 0.68, sy: 0.70, join: 0.36, rim: 0.16 },
  trunk: { prof: [[0.54, 0], [0.29, 0.13], [0.165, 1]], sides: 6, foot: 0.32 },
  tree: { lift: 0.84, spread: 1.2, canopyDecal: 0.55, footDecal: 0.8 },
  flowerHues: [0x7b62b8, 0x9a7fd0, 0xe4e2ea, 0xd8a94e],
};

let GID = 0;

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const span = (R, a, b) => a + R() * (b - a);

function white(g) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Instance colour multiplies the geometry's baked colour, so anything whose geometry carries an
// absolute palette (canopy, bush, fringe, grass base blend) wants a near-1 multiplier here.
function tint(out, R, lo, hi, warm = 0.06) {
  const k = span(R, lo, hi), t = span(R, -warm, warm);
  return out.setRGB(k * (1 + t), k, k * (1 - t * 1.4));
}

// The hue of `target` relative to `ref`, with the brightness difference divided out — a pale
// ground would otherwise bleach the root of every blade standing in it. The instance colour of a
// grass card carries its own shade, so bending only the *root* means baking this into the geometry.
const A = new THREE.Color(), B = new THREE.Color();
function footRatio(target, ref, blend, shade) {
  A.set(target); B.set(ref);
  const r = [A.r / (B.r || 1e-3), A.g / (B.g || 1e-3), A.b / (B.b || 1e-3)];
  const m = (r[0] * 0.3 + r[1] * 0.6 + r[2] * 0.1) || 1;
  const [x, y, w] = r.map(v => lerp(1, clamp(v / m, 0.45, 2.2), blend) * shade);
  return new THREE.Color(x, y, w);
}

// ── alpha-tested foliage cards ──
// A painted cluster of blades on one quad costs four triangles. The old three-blade tuft cost six
// for three, which is why the grass read as isolated sticks: the triangle budget could never buy
// enough of them. Every quad is emitted twice with opposite winding rather than using DoubleSide,
// which flips the normal on the back face and turns half of each card black.

function paint(w, h, draw, label) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return track(t, { w, h, fmt: 'rgba', label });
}

// Blades are painted near-white at the tip and only mildly darker at the root. The old map ran
// 0.44 → 1.0, and against pale ground that dark root is what made a lawn read as a field of spikes.
function bladeStrokes(g, x0p, w, h, R, n, { top = 0.06, root = 0.55, tint = 0.07 } = {}) {
  for (let i = 0; i < n; i++) {
    const x0 = x0p + w * (0.08 + 0.84 * ((i + 0.5) / n + (R() - 0.5) * 0.26));
    const tipY = h * top + h * (1 - top) * (1 - span(R, 0.42, 1.0));
    const lean = span(R, -0.38, 0.38) * w;
    const bw = w * span(R, 0.030, 0.058);
    const t = span(R, -tint, tint);
    const k = span(R, 0.86, 1.06);
    const shade = (v) => {
      const l = Math.min(255, v * k);
      return `rgb(${Math.round(Math.min(255, l * (1 + t)))},${Math.round(l)},${Math.round(l * (1 - t * 1.6))})`;
    };
    const grd = g.createLinearGradient(0, h, 0, tipY);
    grd.addColorStop(0, shade(255 * root));
    grd.addColorStop(0.55, shade(255 * (root + (1 - root) * 0.5)));
    grd.addColorStop(1, shade(248));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x0 - bw, h);
    g.quadraticCurveTo(x0 - bw * 0.4 + lean * 0.42, (h + tipY) * 0.5, x0 + lean, tipY);
    g.quadraticCurveTo(x0 + bw * 0.4 + lean * 0.42, (h + tipY) * 0.5, x0 + bw, h);
    g.closePath();
    g.fill();
  }
}

// The second panel of the grass atlas: a low skirt of short broad leaves with blades standing
// through it. The two crossed quads of one clump take one panel each, so every clump gets both
// silhouettes without a second draw call. Pure broad leaves at this scale read as agave.
function broadLeaves(g, x0p, w, h, R) {
  for (let i = 0; i < 14; i++) {
    const x0 = x0p + w * (0.1 + 0.8 * ((i + 0.5) / 14 + (R() - 0.5) * 0.34));
    const len = h * span(R, 0.14, 0.36);
    const out = span(R, -0.5, 0.5) * w * 0.22;
    const bw = w * span(R, 0.026, 0.052);
    const k = span(R, 0.5, 0.78);
    const t = span(R, -0.1, 0.1);
    const grd = g.createLinearGradient(0, h, 0, h - len);
    const shade = (v) => `rgb(${Math.round(Math.min(255, v * k * (1 + t)))},${Math.round(v * k)},${Math.round(v * k * (1 - t * 1.6))})`;
    grd.addColorStop(0, shade(170));
    grd.addColorStop(1, shade(250));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x0, h);
    g.quadraticCurveTo(x0 + out * 0.4 - bw, h - len * 0.7, x0 + out, h - len);
    g.quadraticCurveTo(x0 + out * 0.4 + bw, h - len * 0.7, x0 + bw * 0.5, h);
    g.closePath();
    g.fill();
  }
  bladeStrokes(g, x0p, w, h, R, 14, { root: 0.5 });
}

// A quad standing on the ground, uv v = 0 at the base. Emitted with both windings so the same
// up-biased normal lights either side.
function pushCard(pos, nrm, uv, col, idx, c, ramp) {
  const { w, h, ry, ox = 0, oz = 0, lean = 0, u0 = 0, u1 = 1 } = c;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const base = pos.length / 3;
  const corners = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
  const nx = -sn * 0.42, nz = cs * 0.42;
  const nl = Math.hypot(nx, 0.9, nz);
  for (const [lx, ly] of corners) {
    const dz = ly > 0 ? lean : 0;
    pos.push(ox + lx * cs + dz * -sn, ly, oz + lx * sn + dz * cs);
    nrm.push(nx / nl, 0.9 / nl, nz / nl);
    uv.push(u0 + (lx / w + 0.5) * (u1 - u0), ly / h);
    const t = ramp ? ramp(ly / h) : null;
    col.push(t ? t.r : 1, t ? t.g : 1, t ? t.b : 1);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
    base + 2, base + 1, base, base + 3, base + 2, base);
}

function cardGeo(cards, ramp) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  for (const c of cards) pushCard(pos, nrm, uv, col, idx, c, ramp);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ── soft blobs ──
// One closed icosahedron pushed out by a handful of wide, overlapping lobes. Merging three real
// spheres showed a bright crack wherever two of them intersected; displacing a single surface
// gives the same clumped silhouette with no seam and no interior faces. Normals stay radial to
// the undisplaced sphere, which is what keeps the shading soft while the outline stays ragged.

function h3(x, y, z, s) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul(s, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vn3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const tx = f(x - ix), ty = f(y - iy), tz = f(z - iz);
  let v = 0;
  for (let k = 0; k < 2; k++) {
    let a = 0;
    for (let j = 0; j < 2; j++) {
      const l0 = h3(ix, iy + j, iz + k, s), l1 = h3(ix + 1, iy + j, iz + k, s);
      a += (l0 + (l1 - l0) * tx) * (j ? ty : 1 - ty);
    }
    v += a * (k ? tz : 1 - tz);
  }
  return v * 2 - 1;
}

function lobes(seed, n) {
  const R = rng(seed * 7919 + 13);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = span(R, -0.2, 0.8);
    const a = (i / n) * 6.284 + span(R, -0.7, 0.7);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    out.push([Math.cos(a) * r, y, Math.sin(a) * r, span(R, 0.5, 1.0)]);
  }
  return out;
}

function blobGeo(detail, o) {
  const { sy = 1, flat = 0, seed = 1, ground = true, ramp,
    lobes: nl = 3, amp = 0.34, sharp = 1.45, noise = 0.12, mottle = 0 } = o;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n = p.count;
  const L = lobes(seed, nl);
  const nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const norm = 1 / (1 + amp * 0.55);
  let ymin = Infinity, ymax = -Infinity;
  const dir = [];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let r = 1;
    for (const [lx, ly, lz, la] of L) {
      const d = x * lx + y * ly + z * lz;
      if (d > 0) r += amp * la * Math.pow(d, sharp);
    }
    r = (r + noise * vn3(x * 2.4 + 5, y * 2.4 + 5, z * 2.4 + 5, seed)) * norm;
    const py = (y < 0 ? y * (1 - flat) : y) * sy * r;
    p.setXYZ(i, x * r, py, z * r);
    dir.push(x, y, z);
    ymin = Math.min(ymin, py); ymax = Math.max(ymax, py);
  }
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = dir[i * 3], y = dir[i * 3 + 1] / (sy || 1), z = dir[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
    ramp((p.getY(i) - ymin) / (ymax - ymin || 1), c);
    // without this the crown is one flat green mass at any distance closer than about 15 m
    const k = 1 + mottle * vn3(x * 2.4 - 9, y * 2.4 - 9, z * 2.4 - 9, seed + 41);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (ground) g.translate(0, -ymin, 0);
  return g;
}

function rockGeo(R) {
  const g = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * span(R, 0.85, 1.35), p.getY(i) * span(R, 0.6, 0.95), p.getZ(i) * span(R, 0.85, 1.35));
  }
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return white(g);
}

// A root flare, not a cylinder pushed through the grass: the profile widens sharply in the bottom
// fifth, and the vertex ramp darkens the last handspan so the trunk is occluded where it enters
// the earth instead of ending on a lit edge.
function trunkGeo(foot) {
  const g = new THREE.LatheGeometry(TUNING.trunk.prof.map(([r, y]) => new THREE.Vector2(r, y)), TUNING.trunk.sides);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = lerp(foot, 1, smoothstep(0, 0.26, p.getY(i)));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// The fringe card only has to break the canopy outline, so its alpha is pushed to the rim and the
// centre is left empty. A card that fills its disc turns into a solid dark slab across the crown
// the moment it is seen edge-on, and with three per tree one always is.
function leafRing(g, w, h, R) {
  const cx = w / 2, cy = h * 0.5;
  for (let i = 0; i < 110; i++) {
    const a = R() * 6.284;
    const rr = R() < 0.18 ? span(R, 1.0, 1.26) : Math.sqrt(span(R, 0.5, 1.0));
    const x = cx + Math.cos(a) * rr * w * 0.43;
    const y = cy + Math.sin(a) * rr * h * 0.41;
    const s = w * span(R, 0.05, 0.1) * (1.2 - 0.35 * rr);
    const v = Math.round(255 * span(R, 0.72, 0.98));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.ellipse(x, y, s, s * span(R, 0.55, 0.95), a, 0, 6.284);
    g.fill();
  }
}

// The instance colour multiplies the whole card, so a flower painted like a blade of grass comes
// out as a solid purple stick. The stalk is painted dark enough that any hue times it reads as a
// stem, and only the head is near-white.
function flowerHeads(g, w, h, R) {
  for (let i = 0; i < 6; i++) {
    const x0 = w * (0.12 + 0.76 * ((i + 0.5) / 6 + (R() - 0.5) * 0.3));
    const tipY = h * span(R, 0.1, 0.46);
    const lean = span(R, -0.1, 0.1) * w;
    g.strokeStyle = 'rgb(46,46,46)';
    g.lineWidth = w * span(R, 0.014, 0.022);
    g.beginPath();
    g.moveTo(x0, h);
    g.quadraticCurveTo(x0 + lean * 0.3, (h + tipY) * 0.5, x0 + lean, tipY + h * 0.05);
    g.stroke();
    for (let k = 0; k < 4; k++) {
      const v = Math.round(span(R, 205, 255));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(x0 + lean + span(R, -1, 1) * w * 0.028, tipY + span(R, -1, 1) * h * 0.035,
        w * span(R, 0.022, 0.04), 0, 6.284);
      g.fill();
    }
  }
  for (let i = 0; i < 5; i++) {
    const x0 = w * span(R, 0.1, 0.9);
    const len = h * span(R, 0.14, 0.3);
    g.fillStyle = 'rgb(60,60,60)';
    g.beginPath();
    g.ellipse(x0, h - len * 0.5, w * 0.02, len * 0.5, span(R, -0.5, 0.5), 0, 6.284);
    g.fill();
  }
}

const GW = 256, GH = 160;
const TEX = {
  grass: paint(GW * 2, GH, (g, w, h) => {
    bladeStrokes(g, 0, GW, h, rng(0x77aa11), 24);
    broadLeaves(g, GW, GW, h, rng(0x13ff02));
  }, 'foliage:grass'),
  flower: paint(96, 96, (g, w, h) => flowerHeads(g, w, h, rng(0x22bb44)), 'foliage:flower'),
  leaf: paint(128, 128, (g, w, h) => leafRing(g, w, h, rng(0x5c31d9)), 'foliage:leaf'),
};

const PANEL = [[0.004, 0.496], [0.504, 0.996]];

const foliageMat = (name, opts = {}) => new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.92, metalness: 0, name, ...opts,
});

class Kind {
  constructor(geo, mat, cap, { cast = true, receive = true } = {}) {
    this.geo = geo; this.mat = mat; this.cap = cap; this.cast = cast; this.receive = receive;
    this.items = [];
    this.pri = [];
  }
  add(m, c, g) { this.items.push({ m, c, g: g ?? ++GID }); }
  // dressing that sits against a wall survives both the cap and the density knob
  addPri(m, c) { this.pri.push({ m, c }); }
}

// Vertical palettes. The canopy runs dark leaf at the trunk join through mid to the light shade,
// with the zone's rim colour mixed into the crown so the sun side reads warm; the last fifth above
// the trunk is crushed further, which is the difference between a tree and a lollipop.
function leafRamp(f, cfg) {
  const dark = new THREE.Color(f.leaves[2]);
  const mid = new THREE.Color(f.leaves[0]);
  const light = new THREE.Color(f.leaves[1]);
  const rim = new THREE.Color(f.rim);
  return (t, out) => {
    if (t < 0.45) out.copy(dark).lerp(mid, smoothstep(0.0, 0.45, t));
    else out.copy(mid).lerp(light, smoothstep(0.45, 0.96, t));
    out.lerp(rim, cfg.rim * smoothstep(0.68, 1.0, t));
    out.multiplyScalar(lerp(cfg.join, 1, smoothstep(0, 0.22, t)));
  };
}

function bushRamp(f, cfg) {
  const dark = new THREE.Color(f.bush[2]);
  const mid = new THREE.Color(f.bush[0]);
  const light = new THREE.Color(f.bush[1]);
  return (t, out) => {
    if (t < 0.5) out.copy(dark).lerp(mid, smoothstep(0.0, 0.5, t));
    else out.copy(mid).lerp(light, smoothstep(0.5, 1.0, t));
    out.multiplyScalar(lerp(cfg.join, 1, smoothstep(0, 0.3, t)));
  };
}

export class Scatter {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'scatter';
    this.meshes = [];
    this.trees = [];
    this.density = 1;
  }

  build(quality) {
    const T = this.terrain;
    const R = rng(0x51f3a2);
    const kinds = ZONE_IDS.map((id, i) => {
      const z = zone(id);
      const f = z.foliage;
      // the blade root takes the ground's hue so a card starts in the earth rather than on it
      const foot = footRatio(z.groundTint, f.grass[0], TUNING.grass.footBlend, TUNING.grass.footShade);
      const gramp = (t) => A.copy(foot).lerp(B.setRGB(TUNING.grass.tip, TUNING.grass.tip, TUNING.grass.tip), smoothstep(0.0, 0.42, t));
      const canopyRamp = leafRamp(f, TUNING.canopy);
      const fringeRamp = (t) => { canopyRamp(clamp(t * 0.78 + 0.03, 0, 1), A); return A.multiplyScalar(0.86); };
      return {
        grass: new Kind(cardGeo([
          { w: 1.5, h: 1.0, ry: 0, lean: 0.07, u0: PANEL[0][0], u1: PANEL[0][1] },
          { w: 1.28, h: 0.84, ry: 1.16, ox: 0.14, oz: -0.08, lean: -0.06, u0: PANEL[1][0], u1: PANEL[1][1] },
        ], gramp), foliageMat('grass', { map: TEX.grass, alphaTest: 0.28, roughness: 0.96 }), CAP.grass, { cast: false }),
        flower: new Kind(cardGeo([{ w: 0.52, h: 1.0, ry: 0, lean: 0.04 }]),
          foliageMat('flower', { map: TEX.flower, alphaTest: 0.26 }), CAP.flower, { cast: false }),
        bush: new Kind(blobGeo(0, { ...TUNING.bush, seed: 3 + i, ramp: bushRamp(f, TUNING.bush) }),
          foliageMat('bush'), CAP.bush),
        rock: new Kind(rockGeo(R), foliageMat('rock', { roughness: 0.85 }), CAP.rock),
        trunk: new Kind(trunkGeo(TUNING.trunk.foot), foliageMat('trunk', { roughness: 0.9 }), CAP.tree),
        canopy: new Kind(blobGeo(1, { ...TUNING.canopy, seed: 11 + i, ground: false, ramp: canopyRamp }),
          foliageMat('canopy'), CAP.tree),
        fringe: new Kind(cardGeo([
          { w: 2.4, h: 2.0, ry: 0, ox: 0.3, oz: 0.14 },
          { w: 2.3, h: 1.92, ry: 1.05, ox: -0.32, oz: 0.2 },
          { w: 2.2, h: 1.86, ry: 2.1, ox: 0.06, oz: -0.34 },
        ], fringeRamp), foliageMat('fringe', { map: TEX.leaf, alphaTest: 0.35 }), CAP.tree, { cast: false }),
        pend: [], z, f,
      };
    });

    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const place = (x, z, sx, sy, sz, ry) => m4.makeRotationY(ry).scale(new THREE.Vector3(sx, sy, sz)).setPosition(x, T.surfaceY(x, z), z);
    const free = (x, z, margin = 0) => {
      if (T.blocked(x, z)) return false;
      return heightAt(x, z) > waterY(x) + margin;
    };

    // One clump, not one quad. A single tuft next to a wall footing leaves the razor line intact
    // either side of it; a clump of three to six overlapping pieces, some of them tucked back
    // *under* the wall face, is what actually eats the join.
    const clump = (px, pz, { n = 4, spread = 0.55, size = 1, pri = true, litter = 0 }) => {
      if (heightAt(px, pz) < waterY(px) + 0.02) return;
      const zi = zoneAt(px, pz);
      const zz = kinds[zi].z, f = kinds[zi].f;
      const gid = ++GID;
      for (let k = 0; k < n; k++) {
        const qx = px + span(R, -spread, spread), qz = pz + span(R, -spread, spread);
        const roll = R();
        const add = (kind, m, c) => (pri ? kinds[zi][kind].addPri(m, c) : kinds[zi][kind].add(m, c, gid));
        if (roll < 0.14 + litter * 0.4) {
          col.set(zz.stone.base).lerp(new THREE.Color(zz.stone.dark), span(R, 0.3, 1)).multiplyScalar(span(R, 0.5, 0.85));
          const sc = span(R, 0.3, 0.85) * size;
          // sunk, not perched — a pebble sitting on top of the grass is its own sticker problem
          const m = place(qx, qz, sc, sc * span(R, 0.5, 0.9), sc, span(R, 0, 6.28)).clone();
          m.elements[13] -= sc * span(R, 0.18, 0.4);
          add('rock', m, col.clone());
        } else if (roll < 0.34) {
          const sc = span(R, 0.35, 0.78) * size;
          const m = place(qx, qz, sc, sc * span(R, 0.5, 0.9), sc, span(R, 0, 6.28)).clone();
          m.elements[13] -= sc * 0.24;
          add('bush', m, tint(col, R, 0.55, 0.95).clone());
        } else {
          col.set(f.grass[R() < 0.5 ? 2 : 0]).multiplyScalar(span(R, 0.62, 1.05));
          if (litter) col.lerp(new THREE.Color(f.dirt[0]), litter * span(R, 0.3, 0.8));
          const sc = span(R, 0.55, 1.0) * size;
          add('grass', place(qx, qz, sc, sc * span(R, 0.8, 1.5) * (litter ? 0.55 : 1), sc, span(R, 0, 6.28)).clone(), col.clone());
        }
      }
    };

    // Every wall/ground join gets a clump growing out of it. Runs first and is priority-tagged,
    // so neither the cap nor the density knob can strip it.
    for (const fp of T.footprints) {
      const per = 4 * (fp.hw + fp.hd);
      const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
      const n = Math.max(5, Math.round(per * 0.3));
      for (let i = 0; i < n; i++) {
        const t = ((i + span(R, 0.1, 0.9)) / n) * per;
        let lx, lz;
        if (t < 2 * fp.hw) { lx = t - fp.hw; lz = -fp.hd; }
        else if (t < 2 * fp.hw + 2 * fp.hd) { lx = fp.hw; lz = t - 2 * fp.hw - fp.hd; }
        else if (t < 4 * fp.hw + 2 * fp.hd) { lx = 3 * fp.hw + 2 * fp.hd - t; lz = fp.hd; }
        else { lx = -fp.hw; lz = 3 * fp.hd + 4 * fp.hw - t; }
        // negative `out` puts part of the clump behind the wall face, which is the whole point
        const out = span(R, -0.35, 0.95);
        lx += Math.sign(lx || 1) * (Math.abs(lx) > fp.hw - 0.01 ? out : 0);
        lz += Math.sign(lz || 1) * (Math.abs(lz) > fp.hd - 0.01 ? out : 0);
        clump(fp.x + lx * c - lz * s, fp.z + lx * s + lz * c,
          { n: 3 + Math.floor(R() * 4), spread: span(R, 0.35, 0.75), size: span(R, 0.8, 1.25) });
      }
    }

    // the waterline: reed clumps and shingle where the creek meets its bank, plus a wet fringe
    // standing in the shallows so the water does not stop at a clean vector edge
    for (let x = -148; x < 148; x += 2.1) {
      const cz = creekZ(x), wy = waterY(x), half = creekHalf(x);
      for (const side of [-1, 1]) {
        const px = x + span(R, -1.0, 1.0);
        const pz = cz + side * (half + span(R, -0.9, 2.4));
        if (T.blocked(px, pz)) continue;
        const zi = zoneAt(px, pz);
        const zz = kinds[zi].z, f = kinds[zi].f;
        if (heightAt(px, pz) < wy - 0.45) continue;
        if (R() < 0.5) {
          for (let k = 0; k < 3; k++) {
            col.set(zz.stone.base).lerp(new THREE.Color(zz.stone.dark), span(R, 0.4, 1)).multiplyScalar(span(R, 0.4, 0.72));
            const sc = span(R, 0.2, 0.6);
            const m = place(px + span(R, -0.6, 0.6), pz + span(R, -0.5, 0.5), sc, sc * span(R, 0.4, 0.8), sc, span(R, 0, 6.28)).clone();
            m.elements[13] -= sc * 0.3;
            kinds[zi].rock.addPri(m, col.clone());
          }
        } else {
          for (let k = 0; k < 3; k++) {
            col.set(f.grass[0]).lerp(new THREE.Color(f.sand[2]), span(R, 0, 0.35)).multiplyScalar(span(R, 0.45, 0.8));
            const sc = span(R, 0.7, 1.4);
            kinds[zi].grass.addPri(place(px + span(R, -0.7, 0.7), pz + span(R, -0.6, 0.6),
              sc * 0.75, sc * span(R, 1.0, 1.6), sc * 0.75, span(R, 0, 6.28)).clone(), col.clone());
          }
        }
      }
    }

    // the verge: a road that ends in a clean polygon edge is the other half of the sticker problem
    for (const { pts, halfWidth } of T.paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
        for (let s = 0; s < len; s += 1.5) {
          for (const side of [-1, 1]) {
            const t = s / len;
            const off = side * (halfWidth + span(R, -0.9, 1.6));
            const px = lerp(a[0], b[0], t) + nx * off, pz = lerp(a[1], b[1], t) + nz * off;
            if (T.blocked(px, pz)) continue;
            clump(px, pz, { n: 2 + Math.floor(R() * 3), spread: 0.55, size: span(R, 0.65, 1.0), litter: 0.35 });
          }
        }
      }
    }

    // Grass — sampled on a coarser grid than the instance budget would allow, then two to four
    // cards dropped inside a metre of each accepted point. The same number of cards spread evenly
    // reads as a sprinkling of sticks; in tufts with bare ground between them it reads as a lawn.
    const [cLo, cHi] = TUNING.grass.cluster;
    for (let z = -104; z < 112; z += 2.7) {
      for (let x = -146; x < 146; x += 2.7) {
        const px = x + span(R, -1.4, 1.4), pz = z + span(R, -1.4, 1.4);
        if (!free(px, pz, 0.02)) continue;
        const sl = T.slopeAt(px, pz);
        if (sl > 0.95) continue;
        const ao = T.ao(px, pz);
        const dn = fbm(px * 0.028, pz * 0.028, 2, 3) * 0.5 + 0.5;
        const bank = smoothstep(0.95, 0.1, heightAt(px, pz) - waterY(px));
        // The instance budget is finite and the map is 300 × 224 m; spreading it evenly buys a
        // blade every 20 m². Weighting towards the shot positions is what makes the near field
        // read as a lawn instead of a sprinkling of sticks.
        const near = 0.07 + 0.93 * smoothstep(126, 26, camDist(px, pz));
        const zi = zoneAt(px, pz);
        const f = kinds[zi].f;
        const p = (0.28 + 0.6 * dn + 1.4 * ao + 0.8 * bank - 0.5 * sl) * near * (f.density ?? 1);
        if (R() > p) continue;
        const shade = f.grass[Math.floor(clamp(fbm(px * 0.09, pz * 0.09, 2, 21) * 1.6 + 1.5, 0, 2.99))];
        const meadow = smoothstep(0.15, 0.75, dn) * (1 - clamp(ao * 1.6, 0, 1));
        const gid = ++GID;
        const cr = TUNING.grass.clusterR;
        // a tuft near a camera is worth more cards than one on the far ridge, and the global cap
        // then thins everything in proportion — this is how the near field ends up dense
        const n = Math.round(lerp(cLo, cHi, near * span(R, 0.5, 1.15)));
        for (let k = 0; k < n; k++) {
          const qx = px + span(R, -cr, cr), qz = pz + span(R, -cr, cr);
          if (!free(qx, qz, 0.02)) continue;
          col.set(shade);
          if (bank > 0.35) col.lerp(new THREE.Color(f.sand[2]), bank * 0.22);
          // tone varies inside one tuft, not just between tufts
          col.multiplyScalar(TUNING.grass.value * (1 - 0.35 * ao) * span(R, 0.78, 1.24));
          const s = span(R, 0.42, 0.78) * (1 + meadow * 0.85 + bank * 0.9) * (1 + ao * 0.3) * (k ? span(R, 0.6, 1.0) : 1);
          kinds[zi].grass.add(place(qx, qz, s, s * span(R, 0.9, 1.5), s, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
      }
    }

    // flowers — clustered, the one saturated accent in the palette
    for (let z = -60; z < 96; z += 3.2) {
      for (let x = -146; x < 146; x += 3.2) {
        const px = x + span(R, -1.4, 1.4), pz = z + span(R, -1.4, 1.4);
        if (!free(px, pz, 0.15)) continue;
        const cl = fbm(px * 0.055, pz * 0.055, 2, 33);
        const ao = T.ao(px, pz);
        if (cl < 0.2 && ao < 0.2) continue;
        if (R() > 0.16 + 0.55 * cl + 0.5 * ao) continue;
        const zi = zoneAt(px, pz);
        col.set(TUNING.flowerHues[Math.floor(R() * (R() < 0.72 ? 2 : 4))]);
        col.multiplyScalar(span(R, 0.8, 1.15) * (zi === 2 ? 0.62 : 1));
        const gid = ++GID;
        for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) {
          const s = span(R, 0.34, 0.6);
          kinds[zi].flower.add(place(px + span(R, -0.55, 0.55), pz + span(R, -0.55, 0.55),
            s, s * span(R, 0.7, 1.1), s, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
      }
    }

    // shrubs — thickets rather than single balls, so they read as one mass with a ragged edge
    for (let z = -100; z < 110; z += 6.4) {
      for (let x = -144; x < 144; x += 6.4) {
        const px = x + span(R, -2.6, 2.6), pz = z + span(R, -2.6, 2.6);
        if (!free(px, pz, 0.25)) continue;
        const ao = T.ao(px, pz);
        const dn = fbm(px * 0.021, pz * 0.021, 2, 51) * 0.5 + 0.5;
        if (R() > 0.14 + 0.4 * dn + 1.1 * ao) continue;
        const zi = zoneAt(px, pz);
        const f = kinds[zi].f;
        const big = span(R, 0.55, 1.1);
        const gid = ++GID;
        for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) {
          const qx = px + span(R, -1.0, 1.0), qz = pz + span(R, -1.0, 1.0);
          const s = big * span(R, 0.55, 1.05);
          const m = place(qx, qz, s, s * span(R, 0.75, 1.2), s, span(R, 0, 6.28)).clone();
          m.elements[13] -= s * 0.14;
          kinds[zi].bush.add(m, tint(col, R, 0.7, 1.12).clone(), gid);
        }
        for (let k = 0; k < 3; k++) {
          col.set(f.grass[R() < 0.5 ? 0 : 2]).multiplyScalar(span(R, 0.6, 1.0));
          const s = span(R, 0.5, 0.9);
          kinds[zi].grass.add(place(px + span(R, -1.3, 1.3), pz + span(R, -1.3, 1.3), s, s * span(R, 0.9, 1.5), s, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
        T.mark(px, pz, big * 0.5);
        T.addPropDecal(px, pz, 1.1 + big * 1.1, 0.34);
      }
    }

    // loose stone — screes on slopes, spill at wall feet, shingle at the water
    for (let z = -104; z < 112; z += 4.6) {
      for (let x = -146; x < 146; x += 4.6) {
        const px = x + span(R, -2, 2), pz = z + span(R, -2, 2);
        if (!free(px, pz, -0.35)) continue;
        const sl = T.slopeAt(px, pz);
        const ao = T.ao(px, pz);
        const shore = smoothstep(0.9, -0.3, heightAt(px, pz) - waterY(px));
        if (R() > 0.05 + 0.75 * smoothstep(0.3, 0.9, sl) + 1.0 * ao + 0.6 * shore) continue;
        const zi = zoneAt(px, pz);
        const f = kinds[zi].f;
        const gid = ++GID;
        col.set(kinds[zi].z.stone.base).lerp(new THREE.Color(kinds[zi].z.stone.dark), span(R, 0.35, 1));
        col.multiplyScalar(span(R, 0.5, 0.85) * (shore > 0.4 ? 0.75 : 1));
        const s = span(R, 0.24, 0.68) * (1 + ao * 0.5);
        const m = place(px, pz, s, s * span(R, 0.6, 1.1), s, span(R, 0, 6.28)).clone();
        m.elements[13] -= s * span(R, 0.2, 0.45);
        kinds[zi].rock.add(m, col.clone(), gid);
        if (R() < 0.55) {
          col.set(f.grass[R() < 0.5 ? 0 : 2]).multiplyScalar(span(R, 0.55, 1.0));
          const gs = span(R, 0.45, 0.8);
          kinds[zi].grass.add(place(px + span(R, -0.7, 0.7), pz + span(R, -0.7, 0.7), gs, gs * span(R, 0.9, 1.4), gs, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
      }
    }

    // trees — a wooded rim behind the walls and across the water, sparse inside the towns
    const inTown = (x, z) => {
      if (z < -46 || z > 26) return 0;
      let m = 0;
      for (const cx of CENTERS) m = Math.max(m, smoothstep(33, 20, Math.abs(x - cx)));
      return m;
    };
    // one tree per grid cell reads as an orchard; a copse of two or three with different heights
    // crowding each other reads as woodland, and it breaks a hard ridge line as well
    const tree = (px, pz, ridge, boost) => {
      if (!free(px, pz, 0.45) || nearCamera(px, pz, 7)) return;
      if (inCorridor(px, pz, 34, 7) || T.slopeAt(px, pz) > 0.85) return;
      const zi = zoneAt(px, pz);
      const f = kinds[zi].f;
      const th = span(R, 2.4, 5.6) * boost * (1 + ridge * span(R, 0.1, 0.7));
      const tr = span(R, 0.8, 1.1) * (0.8 + th * 0.05);
      const cs = span(R, 1.4, 2.4) * (1 + (th - 2.4) * 0.08);
      const ry = span(R, 0, 6.28);
      col.set(f.trunk).multiplyScalar(span(R, 0.72, 1.02));
      kinds[zi].trunk.add(place(px, pz, tr, th, tr, ry).clone(), col.clone());
      // squat and tall crowns from the same blob: the outline changes, the material does not
      const cy = cs * span(R, 0.82, 1.45);
      const ct = tint(col, R, 0.82, 1.14, 0.05).clone();
      const m = place(px, pz, cs, cy, cs, ry).clone();
      m.elements[13] += th * TUNING.tree.lift;
      kinds[zi].canopy.add(m, ct);
      const fs = cs * TUNING.tree.spread / 1.2;
      const fr = place(px, pz, fs, cy * TUNING.tree.spread, fs, ry + span(R, 0.4, 1.2)).clone();
      fr.elements[13] += th * TUNING.tree.lift - cy * 0.92;
      kinds[zi].fringe.add(fr, ct);
      // Ground dressing is deferred: roughly three times as many trees are generated as the cap
      // keeps, and paying for a decal and a litter clump per *candidate* spent about 6 k triangles
      // and a third of the grass budget on trees that never got drawn.
      kinds[zi].pend.push({ x: px, z: pz, cs, tr, th });
      T.mark(px, pz, 0.85);
    };

    for (let z = -104; z < 112; z += 11) {
      for (let x = -146; x < 146; x += 11) {
        const px = x + span(R, -4.4, 4.4), pz = z + span(R, -4.4, 4.4);
        const wood = fbm(px * 0.016, pz * 0.016, 2, 67) * 0.5 + 0.5;
        const rim = smoothstep(-40, -62, pz) + smoothstep(58, 76, pz) + smoothstep(96, 126, Math.abs(px));
        const ridge = smoothstep(-52, -74, pz);
        const town = inTown(px, pz);
        const wooded = kinds[zoneAt(px, pz)].f.trees ?? 1;
        const p = (0.24 + 1.0 * wood + 1.1 * Math.min(rim, 1) + 0.5 * ridge) * (1 - town * 0.87) * wooded;
        if (R() > p) continue;
        const n = 1 + Math.floor(R() * (2 + Math.round(wood * 2)));
        for (let k = 0; k < n; k++) {
          tree(px + span(R, -3.2, 3.2), pz + span(R, -3.2, 3.2), ridge, k === 0 ? 1 : span(R, 0.6, 0.95));
        }
      }
    }

    for (const set of kinds) {
      // trunk, canopy and fringe are one tree, so they must be thinned in step
      shuffle(set.trunk.items, R, set.canopy.items, set.fringe.items, set.pend);
      const keep = Math.min(set.trunk.items.length, CAP.tree);
      set.trunk.items.length = set.canopy.items.length = set.fringe.items.length = keep;
      for (let i = 0; i < keep; i++) {
        const t = set.pend[i];
        this.trees.push(t);
        // two discs: the crown's own shade, then a tight one at the flare. Without the tight one
        // the trunk meets a lit patch of grass and the whole tree reads as a sticker.
        T.addPropDecal(t.x, t.z, 0.9 + t.cs * 0.7, TUNING.tree.canopyDecal);
        T.addPropDecal(t.x, t.z, 0.42 + t.tr * 0.42, TUNING.tree.footDecal);
        clump(t.x + span(R, -0.5, 0.5), t.z + span(R, -0.5, 0.5),
          { n: 4, spread: 0.85, size: span(R, 0.7, 1.1), litter: 0.7 });
      }
    }

    for (const [zi, set] of kinds.entries()) {
      for (const name of ['grass', 'flower', 'bush', 'rock', 'trunk', 'canopy', 'fringe']) {
        const k = set[name];
        // thin by tuft, not by blade — shuffling individual cards turns every clump back into a
        // sprinkle the moment the density knob comes off 1
        if (name === 'grass' || name === 'flower' || name === 'bush' || name === 'rock') k.items = groupShuffle(k.items, R);
        k.items = k.pri.concat(k.items);
        if (k.items.length > k.cap) k.items.length = k.cap;
        if (!k.items.length) continue;
        const mesh = new THREE.InstancedMesh(k.geo, k.mat, k.items.length);
        for (let i = 0; i < k.items.length; i++) {
          mesh.setMatrixAt(i, k.items[i].m);
          mesh.setColorAt(i, k.items[i].c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = k.cast;
        mesh.receiveShadow = k.receive;
        mesh.name = `${ZONE_IDS[zi]}:${name}`;
        mesh.userData.max = k.items.length;
        mesh.computeBoundingSphere();
        this.object3D.add(mesh);
        this.meshes.push(mesh);
      }
    }

    this.applyDensity(quality?.get('foliage') ?? 1);
    if (new URLSearchParams(location.search).has('dev')) this.devScenarios();
  }

  // Working framings only, registered with ?dev=1 so --all keeps rendering the five the critic scores.
  devScenarios() {
    // the tallest tree that is still near a scored camera, so the macro shot shows what ships
    const t = this.trees.reduce((b, c) =>
      (!b || c.th - camDist(c.x, c.z) * 0.12 > b.th - camDist(b.x, b.z) * 0.12 ? c : b), null);
    if (!t) return;
    defineScenario({
      id: 'tree_macro', label: 'Tree macro', zone: 'neutral',
      setup: app => {
        frameCamera(app, {
          pos: [t.x + 11, heightAt(t.x + 11, t.z + 13) + 4.5, t.z + 13],
          look: [t.x, heightAt(t.x, t.z) + t.th * 0.72, t.z], fov: 44,
        });
        app.quality.set('time', 10.5);
      },
    });
    defineScenario({
      id: 'grass_macro', label: 'Grass macro', zone: 'neutral',
      setup: app => {
        frameCamera(app, {
          pos: [-40, heightAt(-40, 76) + 1.15, 76],
          look: [-14, heightAt(-14, 64) + 0.4, 64], fov: 40,
        });
        app.quality.set('time', 10.5);
      },
    });
  }

  applyDensity(f) {
    this.density = f;
    for (const m of this.meshes) m.count = Math.max(0, Math.min(m.userData.max, Math.round(m.userData.max * f)));
  }

  registerKnobs(q) {
    q.register({ key: 'foliage', label: 'Foliage density', type: 'range', min: 0, max: 1.5, step: 0.05, group: 'World' },
      v => this.applyDensity(v));
  }
}

function shuffle(a, R, ...rest) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
    for (const b of rest) { const u = b[i]; b[i] = b[j]; b[j] = u; }
  }
}

function groupShuffle(items, R) {
  const by = new Map();
  for (const it of items) {
    const a = by.get(it.g);
    if (a) a.push(it); else by.set(it.g, [it]);
  }
  const keys = Array.from(by.keys());
  shuffle(keys, R);
  const out = [];
  for (const k of keys) for (const it of by.get(k)) out.push(it);
  return out;
}
