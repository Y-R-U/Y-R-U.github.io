// The ground: one heightfield mesh blended across the three zones, the creek cut into it,
// road ribbons that follow it, and the contact-occlusion decals that stop buildings floating.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { getMaterial } from './materials.js';
import { clamp, lerp, smoothstep, hexRgb } from './textures/noise.js';

export const DISTRICT_W = 70;
export const CENTERS = ZONE_IDS.map((_, i) => (i - 1) * DISTRICT_W);

const X0 = -150, X1 = 150, Z0 = -108, Z1 = 116;

// Non-uniform grid. The creek channel is only ~10 m wide and 1.75 m deep, so at a flat 2.9 m
// step the cut simply is not in the rendered mesh however carefully heightAt describes it.
// Rows are 1.15 m through the creek band and 6 m out at the map edges, which pays for it.
function axis(spans) {
  const out = [spans[0][0]];
  for (const [a, b, s] of spans) {
    const n = Math.max(1, Math.round((b - a) / s));
    for (let i = 1; i <= n; i++) out.push(a + (b - a) * i / n);
  }
  return Float32Array.from(out);
}
const XS = axis([[X0, -96, 6.1], [-96, 96, 2.9], [96, X1, 6.1]]);
const ZS = axis([[Z0, -78, 6.0], [-78, 33, 2.9], [33, 79, 1.15], [79, 92, 2.9], [92, Z1, 6.0]]);
const NX = XS.length, NZ = ZS.length;

// index+fraction packed into one float; the caller takes |0 for the cell
function fcell(arr, v) {
  const n = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[n]) return n - 0.0011;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
  return lo + (v - arr[lo]) / (arr[lo + 1] - arr[lo]);
}

const GS = 1;
const GW = Math.round((X1 - X0) / GS) + 1;
const GH = Math.round((Z1 - Z0) / GS) + 1;


function ihash(x, y, s) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vn(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const tx = x - ix, ty = y - iy;
  const fx = tx * tx * (3 - 2 * tx), fy = ty * ty * (3 - 2 * ty);
  const a = ihash(ix, iy, s), b = ihash(ix + 1, iy, s);
  const c = ihash(ix, iy + 1, s), d = ihash(ix + 1, iy + 1, s);
  const t0 = a + (b - a) * fx, t1 = c + (d - c) * fx;
  return t0 + (t1 - t0) * fy;
}

// signed, -1..1
export function fbm(x, y, oct, s) {
  let v = 0, a = 1, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { v += a * vn(x * f, y * f, s + i * 131); sum += a; a *= 0.5; f *= 2; }
  return (v / sum) * 2 - 1;
}

export const creekZ = x => 56 + 7.5 * Math.sin(x * 0.0185) + 3.0 * Math.sin(x * 0.052 + 1.1);
export const creekHalf = x => 4.2 + 1.5 * Math.sin(x * 0.031 + 0.6) + 0.5 * Math.sin(x * 0.11);
const creekBank = x => creekHalf(x) + 5.4;
export const waterY = x => 0.15 - x * 0.0042;
export const CHANNEL = 1.75;

function wild(x, z) {
  let h = 3.1 * fbm(x * 0.0072, z * 0.0072, 3, 11)
        + 1.15 * fbm(x * 0.025 + 3, z * 0.025 - 7, 2, 29)
        + 0.32 * fbm(x * 0.083 - 5, z * 0.083 + 2, 2, 47) + 1.6;
  h += 15 * smoothstep(-50, -100, z) * (0.8 + 0.35 * fbm(x * 0.010 + 9, 0.31, 2, 61));
  h += 9 * smoothstep(60, 112, z) * (0.8 + 0.3 * fbm(x * 0.013 - 4, 0.77, 2, 73));
  h += 10 * smoothstep(104, 152, Math.abs(x));
  return h;
}

const PADS = CENTERS.map(cx => wild(cx, -12));

function padAt(x) {
  if (x <= CENTERS[0]) return PADS[0];
  if (x >= CENTERS[2]) return PADS[2];
  const i = x < CENTERS[1] ? 0 : 1;
  return lerp(PADS[i], PADS[i + 1], (x - CENTERS[i]) / DISTRICT_W);
}

function townMask(x, z) {
  const mz = smoothstep(38, 24, z) * smoothstep(-62, -50, z);
  let mx = 0;
  for (const cx of CENTERS) mx = Math.max(mx, smoothstep(42, 28, Math.abs(x - cx)));
  return mx * mz;
}

export function heightAt(x, z) {
  let h = wild(x, z);
  const t = townMask(x, z);
  if (t > 0) { const p = padAt(x); h = lerp(h, p + (h - p) * 0.3, t); }
  const bank = creekBank(x), half = creekHalf(x);
  const d = Math.abs(z - creekZ(x));
  if (d < bank) {
    const wy = waterY(x);
    if (d <= half) {
      // flat bed, then a steepening shelf that reaches the water line exactly at d = half
      h = wy - CHANNEL * (1 - Math.pow(d / half, 1.7));
    } else {
      // steep just above the water, flattening into the natural ground — a real bank
      const u = (d - half) / (bank - half);
      const nat = Math.max(h, wy + 0.9);
      h = wy + (nat - wy) * (1 - Math.pow(1 - u, 2.4));
    }
  }
  return h;
}

export const depthAt = (x, z) => waterY(x) - heightAt(x, z);

// Zone boundaries wander so the ground never changes along a straight line.
const bound0 = z => -35 + 17 * fbm(z * 0.012, 1.1, 3, 91);
const bound1 = z => 35 + 17 * fbm(z * 0.012, 5.3, 3, 137);

function zoneMix(x, z, out) {
  const b0 = bound0(z), b1 = bound1(z);
  const a = smoothstep(b0 - 15, b0 + 15, x);
  const b = smoothstep(b1 - 15, b1 + 15, x);
  out[0] = 1 - a; out[1] = a - b; out[2] = b;
  return x < b0 ? 0 : x < b1 ? 1 : 2;
}

export function zoneAt(x, z) { return x < bound0(z) ? 0 : x < bound1(z) ? 1 : 2; }

// Scenario cameras: position, keep-out radius, and the view direction. The scenarios are the
// critic's contract, so this is a hard constraint on the layout, not a hint. demo.js fills it
// from its own shot table via setCameras() before anything is placed.
export const CAMERAS = [[-108, -52, 13, 0.95, 0.31], [0, 44, 10, 0, -1], [52, -14, 11, 0.67, -0.74],
  [40, 46, 10, -0.54, -0.84], [-52, 80, 10, 0.9, -0.42]];

export function setCameras(list) {
  CAMERAS.length = 0;
  for (const { pos, look, keep = 10 } of list) {
    const dx = look[0] - pos[0], dz = look[2] - pos[2];
    const l = Math.hypot(dx, dz) || 1;
    CAMERAS.push([pos[0], pos[2], keep, dx / l, dz / l]);
  }
}

export function nearCamera(x, z, extra = 0) {
  for (const [cx, cz, r] of CAMERAS) {
    const d = r + extra;
    if ((x - cx) ** 2 + (z - cz) ** 2 < d * d) return true;
  }
  return false;
}

export function camDist(x, z) {
  let best = Infinity;
  for (const [cx, cz] of CAMERAS) best = Math.min(best, Math.hypot(x - cx, z - cz));
  return best;
}

// A tree that lands in the first few metres of a shot's sight line fills a third of the frame.
// Only foliage uses this — clearing buildings out of the corridor would gut the composition.
export function inCorridor(x, z, dist = 30, rad = 6) {
  for (const [cx, cz, , dx, dz] of CAMERAS) {
    const t = (x - cx) * dx + (z - cz) * dz;
    if (t < 0 || t > dist) continue;
    const px = x - (cx + dx * t), pz = z - (cz + dz * t);
    if (px * px + pz * pz < rad * rad) return true;
  }
  return false;
}

export class Terrain {
  constructor() {
    this.object3D = new THREE.Group();
    this.object3D.name = 'terrain';
    this.occ = new Uint8Array(GW * GH);
    this.aoSrc = new Float32Array(GW * GH);
    this.footprints = [];
    this.paths = [];
    this.decalRings = [];
    this.propDecals = [];
    this.reflects = [];
  }

  mark(x, z, r) {
    for (let dz = -r; dz <= r; dz += GS) {
      for (let dx = -r; dx <= r; dx += GS) {
        if (dx * dx + dz * dz <= r * r) this.occ[this.gi(x + dx, z + dz)] = 1;
      }
    }
  }

  addPropDecal(x, z, r, s) { this.propDecals.push({ x, z, r, s }); }

  gi(x, z) {
    const i = clamp(Math.round((x - X0) / GS), 0, GW - 1);
    const j = clamp(Math.round((z - Z0) / GS), 0, GH - 1);
    return j * GW + i;
  }

  // Building footprint: blocks scatter, drives the AO decal and darkens the ground around it.
  addFootprint(x, z, hw, hd, rot = 0, opts = {}) {
    const fp = { x, z, hw, hd, rot, ao: opts.ao ?? 1, grow: opts.grow ?? 0.4 };
    this.footprints.push(fp);
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const r = Math.hypot(hw, hd) + fp.grow + 3.5;
    for (let dz = -r; dz <= r; dz += GS) {
      for (let dx = -r; dx <= r; dx += GS) {
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ox = Math.abs(lx) - hw, oz = Math.abs(lz) - hd;
        const d = Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0);
        const k = this.gi(x + dx, z + dz);
        if (d < fp.grow) this.occ[k] = 1;
        if (fp.ao) this.aoSrc[k] = Math.max(this.aoSrc[k], fp.ao * smoothstep(3.2, -0.2, d));
      }
    }
    if (fp.ao) this.decalRings.push(fp);
    return fp;
  }

  addPath(pts, halfWidth, zoneId) {
    this.paths.push({ pts, halfWidth, zoneId });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / GS));
      for (let s = 0; s <= n; s++) {
        const x = lerp(a[0], b[0], s / n), z = lerp(a[1], b[1], s / n);
        for (let dz = -halfWidth; dz <= halfWidth; dz += GS) {
          for (let dx = -halfWidth; dx <= halfWidth; dx += GS) {
            if (dx * dx + dz * dz > halfWidth * halfWidth) continue;
            this.occ[this.gi(x + dx, z + dz)] = 1;
          }
        }
      }
    }
  }

  blocked(x, z) { return this.occ[this.gi(x, z)] === 1; }

  // min / max ground under a rotated footprint — what a foundation has to span.
  range(x, z, hw, hd, rot = 0) {
    const c = Math.cos(rot), s = Math.sin(rot);
    let lo = Infinity, hi = -Infinity;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const lx = i * hw, lz = j * hd;
        const h = heightAt(x + lx * c - lz * s, z + lx * s + lz * c);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    return { lo, hi };
  }

  build() {
    this.blurAO();
    this.buildGround();
    this.buildWater();
    this.buildReflections();
    this.buildRoads();
  }

  blurAO() {
    const tmp = new Float32Array(GW * GH);
    const R = 2;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < GH; j++) {
        for (let i = 0; i < GW; i++) {
          let s = 0, n = 0;
          for (let k = -R; k <= R; k++) {
            const ii = i + k;
            if (ii < 0 || ii >= GW) continue;
            s += this.aoSrc[j * GW + ii]; n++;
          }
          tmp[j * GW + i] = s / n;
        }
      }
      for (let i = 0; i < GW; i++) {
        for (let j = 0; j < GH; j++) {
          let s = 0, n = 0;
          for (let k = -R; k <= R; k++) {
            const jj = j + k;
            if (jj < 0 || jj >= GH) continue;
            s += tmp[jj * GW + i]; n++;
          }
          this.aoSrc[j * GW + i] = s / n;
        }
      }
    }
  }

  ao(x, z) {
    const fx = clamp((x - X0) / GS, 0, GW - 1.001), fz = clamp((z - Z0) / GS, 0, GH - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const a = this.aoSrc[j * GW + i], b = this.aoSrc[j * GW + i + 1];
    const c = this.aoSrc[(j + 1) * GW + i], d = this.aoSrc[(j + 1) * GW + i + 1];
    return lerp(a + (b - a) * tx, c + (d - c) * tx, tz);
  }

  // Height of the rendered surface, not the analytic field — props sit on what you can see.
  surfaceY(x, z) {
    const fx = fcell(XS, x), fz = fcell(ZS, z);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const h = this.hgrid;
    const a = h[j * NX + i], b = h[j * NX + i + 1];
    const c = h[(j + 1) * NX + i], d = h[(j + 1) * NX + i + 1];
    return lerp(a + (b - a) * tx, c + (d - c) * tx, tz);
  }

  slopeAt(x, z) {
    const e = 1.4;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  buildGround() {
    const n = NX * NZ;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const hg = this.hgrid = new Float32Array(n);
    const zi = new Uint8Array(n);
    const tints = ZONE_IDS.map(id => hexRgb(zone(id).groundTint).map(v => v / 255));
    const w = [0, 0, 0];

    for (let j = 0; j < NZ; j++) {
      const z = ZS[j];
      for (let i = 0; i < NX; i++) {
        const x = XS[i];
        const k = j * NX + i;
        const h = heightAt(x, z);
        hg[k] = h;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;

        const zn = zoneMix(x, z, w);
        zi[k] = zn;
        const base = tints[zn];
        let r = clamp((w[0] * tints[0][0] + w[1] * tints[1][0] + w[2] * tints[2][0]) / base[0], 0.5, 1.8);
        let g = clamp((w[0] * tints[0][1] + w[1] * tints[1][1] + w[2] * tints[2][1]) / base[1], 0.5, 1.8);
        let b = clamp((w[0] * tints[0][2] + w[1] * tints[1][2] + w[2] * tints[2][2]) / base[2], 0.5, 1.8);

        const mot = 1 + 0.13 * fbm(x * 0.043, z * 0.043, 2, 5) + 0.07 * fbm(x * 0.17, z * 0.17, 2, 19);
        r *= mot; g *= mot; b *= mot;

        const a = clamp(this.ao(x, z), 0, 1);
        const k1 = 1 - 0.5 * a;
        r *= k1; g *= k1 * 1.01; b *= k1 * 1.04;

        // the margin: a dark saturated wet band right at the water line, a pale shingle strip
        // just above it, both confined to the channel so low ground elsewhere stays green
        const near = smoothstep(creekBank(x) * 1.9, creekBank(x) * 0.95, Math.abs(z - creekZ(x)));
        const above = h - waterY(x);
        const wet = smoothstep(2.0, -0.05, above) * near;
        const shingle = smoothstep(3.4, 1.1, above) * smoothstep(0.4, 1.4, above) * near;
        r *= lerp(1, 0.32, wet) * lerp(1, 1.20, shingle);
        g *= lerp(1, 0.39, wet) * lerp(1, 1.14, shingle);
        b *= lerp(1, 0.53, wet) * lerp(1, 1.02, shingle);

        const sl = smoothstep(0.30, 0.85, this.slopeAt(x, z));
        r *= lerp(1, 1.14, sl); g *= lerp(1, 1.08, sl); b *= lerp(1, 0.98, sl);

        col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
      }
    }

    const idx = [[], [], []];
    for (let j = 0; j < NZ - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
        idx[zi[a]].push(a, c, b);
        idx[zi[d]].push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const flat = [];
    let start = 0;
    for (let z = 0; z < 3; z++) {
      for (const v of idx[z]) flat.push(v);
      geo.addGroup(start, idx[z].length, z);
      start += idx[z].length;
    }
    geo.setIndex(flat);
    geo.computeVertexNormals();

    const mats = ZONE_IDS.map(id => {
      const m = getMaterial(id, 'ground');
      m.vertexColors = true;
      m.needsUpdate = true;
      return m;
    });
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = 'ground';
    mesh.receiveShadow = true;
    this.object3D.add(mesh);
    this.ground = mesh;
  }

  waterEdge(x, cz, wy, sign) {
    let lo = 0, hi = creekBank(x) * 1.2;
    if (heightAt(x, cz) >= wy) return 0;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      if (heightAt(x, cz + sign * m) < wy) lo = m; else hi = m;
    }
    return lo;
  }

  // The surface is cut to the channel: the cross stations bunch towards the shore so the depth
  // ramp resolves, alpha goes to zero at the water line so there is no hard vector edge, and the
  // deep centre is dark enough to hold a sky reflection instead of glowing pale blue.
  buildWater() {
    const CROSS = 10;
    const pos = [], col = [], idx = [];
    const st = [];
    for (let x = X0; x <= X1 + 0.1; x += 2.6) st.push(x);
    for (const x of st) {
      const cz = creekZ(x), wy = waterY(x), half = creekHalf(x);
      for (let c = 0; c <= CROSS; c++) {
        const t = c / CROSS * 2 - 1;
        const off = Math.sign(t) * half * Math.pow(Math.abs(t), 0.62);
        const y = wy + 0.05 * Math.sin(x * 0.42 + off * 0.9) + 0.028 * Math.sin(off * 2.3 - x * 0.17);
        pos.push(x, y, cz + off);
        const dep = clamp(wy - heightAt(x, cz + off), 0, CHANNEL) / CHANNEL;
        const deep = Math.pow(dep, 0.75);
        col.push(
          lerp(0.98, 0.20, deep),
          lerp(0.94, 0.31, deep),
          lerp(0.72, 0.38, deep),
          smoothstep(0.0, 0.26, dep) * 0.95,
        );
      }
    }
    const row = CROSS + 1;
    for (let s = 0; s < st.length - 1; s++) {
      for (let c = 0; c < CROSS; c++) {
        const p = s * row + c;
        idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a6570, vertexColors: true, transparent: true, depthWrite: false,
      roughness: 0.26, metalness: 0.0,
    });
    // there is no planar reflection here, so the env map is only ever the sky: turn it down or
    // grazing Fresnel paints the whole creek the colour of the brightest thing in the scene
    mat.envMapIntensity = 0.6;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'water';
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    this.object3D.add(mesh);
    this.water = mesh;
  }

  addReflection(x, cz, w, h) { this.reflects.push({ x, cz, w, h }); }

  // A screen-cheap stand-in for a planar reflection: the mass above the water smeared towards
  // the near bank, broken by the same ripple frequency as the surface. Only creek_day sees it,
  // and creek_day looks from +z, so the smear runs that way.
  buildReflections() {
    if (!this.reflects.length) return;
    const pos = [], col = [], idx = [];
    for (const { x, cz, w, h } of this.reflects) {
      const NU = 6, NV = 7;
      const base0 = pos.length / 3;
      for (let v = 0; v <= NV; v++) {
        const fz = (v / NV) * h * 1.5;
        for (let u = 0; u <= NU; u++) {
          const px = x + (u / NU - 0.5) * w;
          const pz = cz + 2.0 + fz;
          pos.push(px, waterY(px) + 0.03, pz);
          const fade = (1 - smoothstep(0.15, 1, v / NV)) * (1 - smoothstep(0.6, 1, Math.abs(u / NU - 0.5) * 2));
          const ripple = 0.55 + 0.45 * Math.sin(pz * 1.5 + px * 0.4);
          col.push(0.10, 0.10, 0.11, fade * ripple * 0.62);
        }
      }
      for (let v = 0; v < NV; v++) {
        for (let u = 0; u < NU; u++) {
          const p = base0 + v * (NU + 1) + u;
          idx.push(p, p + 1, p + NU + 1, p + 1, p + NU + 2, p + NU + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'waterReflect';
    mesh.renderOrder = 3;
    this.object3D.add(mesh);
  }

  buildRoads() {
    const CROSS = 6;
    for (const { pts, halfWidth, zoneId } of this.paths) {
      const line = resample(pts, 2.2);
      const pos = [], col = [], idx = [];
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        const q = line[Math.min(i + 1, line.length - 1)];
        const o = line[Math.max(i - 1, 0)];
        let nx = -(q[1] - o[1]), nz = q[0] - o[0];
        const l = Math.hypot(nx, nz) || 1;
        nx /= l; nz /= l;
        const hwL = halfWidth * (1 + 0.17 * fbm(p[0] * 0.09, p[1] * 0.09, 2, 7));
        const hwR = halfWidth * (1 + 0.17 * fbm(p[0] * 0.09 + 40, p[1] * 0.09, 2, 7));
        for (let c = 0; c <= CROSS; c++) {
          const t = c / CROSS * 2 - 1;
          const hw = lerp(hwL, hwR, (t + 1) / 2);
          const x = p[0] + nx * t * hw, z = p[1] + nz * t * hw;
          pos.push(x, this.surfaceY(x, z) + 0.06, z);
          // ends fade out too, or the ribbon stops dead in a straight polygon edge; the fade
          // width is itself noisy so the margin is worn rather than a clean band
          const end = Math.min(smoothstep(0, 4, i), smoothstep(0, 4, line.length - 1 - i));
          const f0 = 0.30 + 0.16 * fbm(x * 0.22, z * 0.22, 2, 13);
          col.push(1, 1, 1, (1 - smoothstep(f0, 1.0, Math.abs(t))) * end);
        }
      }
      const row = CROSS + 1;
      for (let s = 0; s < line.length - 1; s++) {
        for (let c = 0; c < CROSS; c++) {
          const p = s * row + c;
          idx.push(p, p + 1, p + row, p + 1, p + row + 1, p + row);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();

      const mat = getMaterial(zoneId, 'road');
      mat.vertexColors = true;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.needsUpdate = true;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'road';
      mesh.renderOrder = 1;
      mesh.receiveShadow = true;
      this.object3D.add(mesh);
    }
  }

  // A soft dark collar on the ground at every base. This is the single thing that stops a
  // building reading as a sticker; it costs one transparent draw call for the whole scene.
  // Runs last, after scatter has registered its trees.
  finish() {
    const pos = [], col = [], idx = [];
    const push = (outline, strength, pad) => {
      const n = outline.length;
      const base = pos.length / 3;
      let cx = 0, cz = 0;
      for (const p of outline) { cx += p[0] / n; cz += p[1] / n; }
      for (const p of outline) {
        let dx = p[0] - cx, dz = p[1] - cz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        pos.push(p[0], this.surfaceY(p[0], p[1]) + 0.05, p[1]);
        col.push(0, 0, 0, strength);
        const ox = p[0] + dx * pad, oz = p[1] + dz * pad;
        pos.push(ox, this.surfaceY(ox, oz) + 0.05, oz);
        col.push(0, 0, 0, 0);
      }
      for (let i = 0; i < n; i++) {
        const a = base + i * 2, b = base + ((i + 1) % n) * 2;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    };

    for (const fp of this.decalRings) {
      const out = [];
      const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
      const segs = 4;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        for (let k = 0; k < segs; k++) {
          const t = k / segs;
          const lx = lerp(a[0], b[0], t) * fp.hw, lz = lerp(a[1], b[1], t) * fp.hd;
          out.push([fp.x + lx * c - lz * s, fp.z + lx * s + lz * c]);
        }
      }
      push(out, 0.55 * fp.ao, 1.9);
    }

    // props get a filled disc, not a ring — a tree trunk does not shade its own footprint
    for (const d of this.propDecals) {
      const n = 7, base = pos.length / 3;
      pos.push(d.x, this.surfaceY(d.x, d.z) + 0.05, d.z);
      col.push(0, 0, 0, d.s);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const ox = d.x + Math.cos(a) * d.r, oz = d.z + Math.sin(a) * d.r;
        pos.push(ox, this.surfaceY(ox, oz) + 0.05, oz);
        col.push(0, 0, 0, 0);
      }
      for (let i = 0; i < n; i++) idx.push(base, base + 1 + ((i + 1) % n), base + 1 + i);
    }

    this.decalMat = null;
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    // Straight multiplicative darkening: dst * (1 - srcAlpha). Immune to whatever the lit
    // pipeline would otherwise do to a "black quad with alpha".
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'contactAO';
    mesh.renderOrder = 2;
    this.object3D.add(mesh);
    this.decalMat = mat;
  }

  registerKnobs(q) {
    q.register({ key: 'groundAO', label: 'Contact shade', type: 'range', min: 0, max: 1.6, step: 0.05, default: 1, group: 'World' },
      v => { if (this.decalMat) this.decalMat.opacity = v; });
  }
}

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t < len) {
      out.push([lerp(a[0], b[0], t / len), lerp(a[1], b[1], t / len)]);
      t += step;
    }
    carry = t - len;
  }
  out.push(pts[pts.length - 1]);
  return out;
}
