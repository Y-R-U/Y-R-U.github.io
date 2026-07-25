// The battlefield itself: one big heightfield that shells actually dig into.
//
// Heights live in a plain Float32Array; the mesh is flat-shaded so craters only
// need position + colour uploads (no normal recompute). Tanks read the field
// through terrainHeight()/terrainNormal(), so a crater immediately changes how
// they drive and what they can see over.

import * as THREE from 'three';
import { TERRAIN_SIZE, TERRAIN_SEG, FIELD_R } from './config.js';
import { clamp, clamp01, lerp, smoothstep, mulberry32 } from './utils.js';
import { fieldRoot } from './render.js';

const SEG = TERRAIN_SEG;
const N = SEG + 1;
const SIZE = TERRAIN_SIZE;
const CELL = SIZE / SEG;
const HALF = SIZE / 2;

const heights = new Float32Array(N * N);
const baseHeights = new Float32Array(N * N);
const scorch = new Float32Array(N * N);
const baseCols = new Float32Array(N * N * 3);
const dug = new Float32Array(N * N);        // accumulated excavation, clamped

let mesh = null;
let posAttr = null;
let colAttr = null;
let dirty = false;
// contiguous vertex span touched since the last upload
let dirtyLo = 0;
let dirtyHi = -1;
let detail = null;                          // instanced ground clutter
let detailData = [];
let detailDirty = false;
let biome = null;

export const MAX_DIG = 7.5;                 // stops repeat shelling tunnelling

const _tmp = new THREE.Vector3();

const idx = (i, j) => j * N + i;

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function shape(x, z, p, b) {
  const r = Math.hypot(x, z);

  // rolling interior — gentle enough to drive, tall enough to shoot over
  let h =
    Math.sin(x * 0.0125 + p[0]) * Math.cos(z * 0.0111 + p[1]) * 5.2 * b.relief +
    Math.sin(x * 0.031 + p[2]) * Math.cos(z * 0.027 + p[3]) * 2.6 * b.relief +
    Math.sin(x * 0.069 + p[4]) * Math.cos(z * 0.061 + p[5]) * 1.1 * b.rough;

  // dunes / drifts run along one axis in the sandy and snowy biomes
  if (b.dunes) {
    const a = p[6];
    const u = x * Math.cos(a) + z * Math.sin(a);
    h += Math.sin(u * 0.026 + p[7]) * 3.4 * b.dunes;
    h += Math.sin(u * 0.083 + p[8]) * 0.9 * b.dunes;
  }

  // seeded hills and hollows: the cover that makes arcing shots matter
  for (const f of p.features) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) {
      const k = Math.pow(Math.cos((d / f.r) * Math.PI * 0.5), 1.6);
      h += f.h * k;
    }
  }

  // the bowl rim: everything beyond the play area lifts into scenery. Two
  // octaves of ridge noise so it reads as a mountain range, not a bowl.
  const rim = smoothstep(FIELD_R * 1.06, FIELD_R * 2.5, r);
  const a = Math.atan2(z, x);
  const ridge = 0.45 + 0.3 * Math.sin(a * 3.0 + p[9]) + 0.25 * Math.sin(a * 7.3 + p[10]);
  h += rim * rim * (24 + 46 * ridge) * b.mountains;

  // keep the very centre of the arena honest
  h *= 1 - 0.35 * smoothstep(26, 0, r);
  return h;
}

function colourAt(out, o, x, z, h, slope, rng, b) {
  const r = Math.hypot(x, z);
  const c = _c1;
  const hk = clamp01((h + 4) / 14);
  c.copy(b.cLow).lerp(b.cMid, smoothstep(0.15, 0.75, hk));
  c.lerp(b.cHigh, smoothstep(0.6, 1.0, hk));
  c.lerp(b.cRock, smoothstep(0.42, 0.9, slope));
  c.lerp(b.cFar, smoothstep(FIELD_R * 1.0, FIELD_R * 2.2, r));
  const v = 1 + (rng() - 0.5) * b.grain;
  out[o] = c.r * v;
  out[o + 1] = c.g * v;
  out[o + 2] = c.b * v;
}

const _c1 = new THREE.Color();

export function buildTerrain(seed, biomeDef) {
  biome = biomeDef;
  const rng = mulberry32(seed);
  const p = [];
  for (let i = 0; i < 12; i++) p.push(rng() * Math.PI * 2);
  p.features = [];
  const featureCount = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < featureCount; i++) {
    const a = rng() * Math.PI * 2;
    const rr = 18 + rng() * (FIELD_R - 30);
    p.features.push({
      x: Math.cos(a) * rr, z: Math.sin(a) * rr,
      r: 16 + rng() * 34,
      h: (rng() < 0.68 ? 1 : -1) * (3.5 + rng() * 7.5) * biomeDef.relief,
    });
  }

  if (!mesh) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.0,
    });
    mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    posAttr = geo.attributes.position;
    colAttr = geo.attributes.color;
  }
  mesh.material.roughness = biomeDef.roughness ?? 0.95;
  if (!mesh.parent) fieldRoot.add(mesh);

  // heights + colours
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * CELL;
      const h = shape(x, z, p, biomeDef);
      const k = idx(i, j);
      heights[k] = h;
      baseHeights[k] = h;
      scorch[k] = 0;
      dug[k] = 0;
    }
  }
  // slope-aware colouring needs finished heights
  const crng = mulberry32(seed ^ 0x9e3779b9);
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * CELL;
      const k = idx(i, j);
      const hL = heights[idx(Math.max(0, i - 1), j)];
      const hR = heights[idx(Math.min(N - 1, i + 1), j)];
      const hD = heights[idx(i, Math.max(0, j - 1))];
      const hU = heights[idx(i, Math.min(N - 1, j + 1))];
      const slope = Math.min(1, Math.hypot(hR - hL, hU - hD) / (CELL * 2) * 1.5);
      colourAt(baseCols, k * 3, x, z, heights[k], slope, crng, biomeDef);
    }
  }
  writeAll();
  buildDetail(seed, biomeDef);
  return mesh;
}

function writeAll() {
  const pa = posAttr.array, ca = colAttr.array;
  for (let k = 0; k < N * N; k++) {
    pa[k * 3 + 1] = heights[k];
    const s = 1 - scorch[k] * 0.72;
    ca[k * 3] = baseCols[k * 3] * s;
    ca[k * 3 + 1] = baseCols[k * 3 + 1] * s * (1 - scorch[k] * 0.1);
    ca[k * 3 + 2] = baseCols[k * 3 + 2] * s;
  }
  if (posAttr.clearUpdateRanges) {
    posAttr.clearUpdateRanges();
    colAttr.clearUpdateRanges();
  }
  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  dirty = false;
  dirtyHi = -1;
  mesh.geometry.computeBoundingSphere();
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

export function terrainHeight(x, z) {
  const fx = (x + HALF) / CELL;
  const fz = (z + HALF) / CELL;
  const i = clamp(Math.floor(fx), 0, N - 2);
  const j = clamp(Math.floor(fz), 0, N - 2);
  const tx = clamp01(fx - i);
  const tz = clamp01(fz - j);
  const h00 = heights[idx(i, j)];
  const h10 = heights[idx(i + 1, j)];
  const h01 = heights[idx(i, j + 1)];
  const h11 = heights[idx(i + 1, j + 1)];
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

export function terrainNormal(x, z, out = _tmp) {
  const d = CELL;
  const hL = terrainHeight(x - d, z);
  const hR = terrainHeight(x + d, z);
  const hD = terrainHeight(x, z - d);
  const hU = terrainHeight(x, z + d);
  out.set(hL - hR, 2 * d, hD - hU).normalize();
  return out;
}

// 0 = flat, 1 = vertical-ish
export function terrainSlope(x, z) {
  const n = terrainNormal(x, z, _tmp);
  return 1 - clamp01(n.y);
}

// Ray-march a ray against the heightfield. Used for aim reticles and AI
// line-of-fire checks over hills.
export function raycastTerrain(origin, dir, maxDist = 420, step = 1.4) {
  let t = 0;
  let prevAbove = origin.y - terrainHeight(origin.x, origin.z);
  while (t < maxDist) {
    t += step;
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const above = y - terrainHeight(x, z);
    if (above <= 0) {
      // refine with a couple of bisections
      let lo = t - step, hi = t;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        const mx = origin.x + dir.x * mid;
        const my = origin.y + dir.y * mid;
        const mz = origin.z + dir.z * mid;
        if (my - terrainHeight(mx, mz) > 0) lo = mid; else hi = mid;
      }
      return {
        dist: hi,
        point: new THREE.Vector3(
          origin.x + dir.x * hi, origin.y + dir.y * hi, origin.z + dir.z * hi),
      };
    }
    prevAbove = above;
    // take bigger steps when high above the ground
    step = clamp(prevAbove * 0.55, 1.4, 9);
  }
  return null;
}

// Does the segment a->b clear the terrain? (cheap sampled version)
export function terrainBlocks(ax, ay, az, bx, by, bz, samples = 12) {
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = lerp(ax, bx, t), z = lerp(az, bz, t), y = lerp(ay, by, t);
    if (y < terrainHeight(x, z) - 0.15) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Destruction
// ---------------------------------------------------------------------------

export function deformCrater(x, z, radius, depth, scorchAmt = 0.85) {
  if (!mesh) return;
  // A crater smaller than a grid cell can miss every vertex, so the smallest
  // shells still dent a cell-and-a-half's worth of ground.
  radius = Math.max(radius, CELL * 1.4);
  const i0 = clamp(Math.floor((x - radius + HALF) / CELL), 0, N - 1);
  const i1 = clamp(Math.ceil((x + radius + HALF) / CELL), 0, N - 1);
  const j0 = clamp(Math.floor((z - radius + HALF) / CELL), 0, N - 1);
  const j1 = clamp(Math.ceil((z + radius + HALF) / CELL), 0, N - 1);
  const pa = posAttr.array, ca = colAttr.array;

  for (let j = j0; j <= j1; j++) {
    const vz = -HALF + j * CELL;
    for (let i = i0; i <= i1; i++) {
      const vx = -HALF + i * CELL;
      const d = Math.hypot(vx - x, vz - z);
      if (d > radius) continue;
      const t = d / radius;
      const k = idx(i, j);
      const bowl = -depth * Math.pow(1 - t * t, 1.35);
      const lip = depth * 0.26 * Math.exp(-Math.pow((t - 0.86) / 0.2, 2));
      let delta = bowl + lip;
      // clamp total excavation so a mortar duel cannot dig to the mantle
      const room = -(MAX_DIG + dug[k]);
      if (delta < room) delta = room;
      if (delta === 0) continue;
      heights[k] += delta;
      if (delta < 0) dug[k] += delta;
      scorch[k] = Math.min(1, scorch[k] + scorchAmt * (1 - t * 0.8));
      pa[k * 3 + 1] = heights[k];
      const s = 1 - scorch[k] * 0.72;
      ca[k * 3] = baseCols[k * 3] * s;
      ca[k * 3 + 1] = baseCols[k * 3 + 1] * s * (1 - scorch[k] * 0.1);
      ca[k * 3 + 2] = baseCols[k * 3 + 2] * s;
    }
  }
  markDirty(idx(i0, j0), idx(i1, j1));
  clearDetailNear(x, z, radius * 0.95);
}

function markDirty(lo, hi) {
  if (!dirty) { dirtyLo = lo; dirtyHi = hi; dirty = true; return; }
  if (lo < dirtyLo) dirtyLo = lo;
  if (hi > dirtyHi) dirtyHi = hi;
}

// Scorch without digging — smaller shells, burning wrecks, fire.
export function scorchGround(x, z, radius, amount = 0.6) {
  if (!mesh) return;
  const i0 = clamp(Math.floor((x - radius + HALF) / CELL), 0, N - 1);
  const i1 = clamp(Math.ceil((x + radius + HALF) / CELL), 0, N - 1);
  const j0 = clamp(Math.floor((z - radius + HALF) / CELL), 0, N - 1);
  const j1 = clamp(Math.ceil((z + radius + HALF) / CELL), 0, N - 1);
  const ca = colAttr.array;
  for (let j = j0; j <= j1; j++) {
    const vz = -HALF + j * CELL;
    for (let i = i0; i <= i1; i++) {
      const vx = -HALF + i * CELL;
      const d = Math.hypot(vx - x, vz - z);
      if (d > radius) continue;
      const k = idx(i, j);
      scorch[k] = Math.min(1, scorch[k] + amount * (1 - d / radius));
      const s = 1 - scorch[k] * 0.72;
      ca[k * 3] = baseCols[k * 3] * s;
      ca[k * 3 + 1] = baseCols[k * 3 + 1] * s * (1 - scorch[k] * 0.1);
      ca[k * 3 + 2] = baseCols[k * 3 + 2] * s;
    }
  }
  markDirty(idx(i0, j0), idx(i1, j1));
}

// Uploads only the rows a crater actually touched — a 31k-vertex field would
// otherwise push 370KB to the GPU on every frame of a barrage.
export function flushTerrain() {
  if (dirty) {
    const lo = Math.max(0, dirtyLo);
    const hi = Math.min(N * N - 1, dirtyHi);
    if (posAttr.addUpdateRange) {
      posAttr.clearUpdateRanges();
      colAttr.clearUpdateRanges();
      posAttr.addUpdateRange(lo * 3, (hi - lo + 1) * 3);
      colAttr.addUpdateRange(lo * 3, (hi - lo + 1) * 3);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    dirty = false;
    dirtyHi = -1;
  }
  if (detailDirty && detail) {
    detail.instanceMatrix.needsUpdate = true;
    detailDirty = false;
  }
}

// ---------------------------------------------------------------------------
// Ground clutter (grass tufts, pebbles, scrub) — instanced, one draw call
// ---------------------------------------------------------------------------

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s3 = new THREE.Vector3();
const _p3 = new THREE.Vector3();

function buildDetail(seed, b) {
  if (detail) {
    fieldRoot.remove(detail);
    detail.geometry.dispose();
    detail.material.dispose();
    detail = null;
  }
  detailData = [];
  if (!b.detail || b.detail.count === 0) return;

  const rng = mulberry32(seed ^ 0x51ed270b);
  const count = b.detail.count;
  const isRock = b.detail.kind === 'rock';
  const geo = isRock
    ? new THREE.TetrahedronGeometry(0.5, 0)
    : new THREE.ConeGeometry(0.16, 1.0, 4);
  // rocks lie flat on the ground; tufts stand up
  const squash = isRock ? 0.42 : 0.62;
  const mat = new THREE.MeshStandardMaterial({
    color: b.detail.colour, flatShading: true, roughness: 1,
  });
  detail = new THREE.InstancedMesh(geo, mat, count);
  detail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  detail.receiveShadow = false;
  detail.castShadow = false;

  for (let n = 0; n < count; n++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * (FIELD_R * 1.12);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = (0.6 + rng() * 1.1) * (b.detail.scale || 1);
    const y = terrainHeight(x, z);
    detailData.push({ x, z, s, sy: s * squash, live: true });
    _e.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
    _q.setFromEuler(_e);
    _m4.compose(_p3.set(x, y + s * squash * 0.35, z), _q, _s3.set(s, s * squash, s));
    detail.setMatrixAt(n, _m4);
  }
  fieldRoot.add(detail);
}

function clearDetailNear(x, z, radius) {
  if (!detail) return;
  const r2 = radius * radius;
  for (let n = 0; n < detailData.length; n++) {
    const d = detailData[n];
    if (!d.live) continue;
    const dx = d.x - x, dz = d.z - z;
    if (dx * dx + dz * dz > r2) continue;
    d.live = false;
    _m4.makeScale(0.0001, 0.0001, 0.0001);
    _m4.setPosition(d.x, -50, d.z);
    detail.setMatrixAt(n, _m4);
    detailDirty = true;
  }
}

// Settle clutter back onto the ground after generation (used once per battle).
export function resettleDetail() {
  if (!detail) return;
  for (let n = 0; n < detailData.length; n++) {
    const d = detailData[n];
    if (!d.live) continue;
    const sy = d.sy || d.s;
    _e.set(0, (d.x + d.z) * 0.7, 0);
    _q.setFromEuler(_e);
    _m4.compose(_p3.set(d.x, terrainHeight(d.x, d.z) + sy * 0.35, d.z), _q,
      _s3.set(d.s, sy, d.s));
    detail.setMatrixAt(n, _m4);
  }
  detailDirty = true;
}

export function terrainMesh() { return mesh; }
export const terrainCell = CELL;
