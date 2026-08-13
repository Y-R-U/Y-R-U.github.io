// The ground: one heightfield mesh blended across the three zones, the creek cut into it,
// road ribbons that follow it, and the contact-occlusion decals that stop buildings floating.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { getMaterial } from './materials.js';
import { waterMaterial, setObstacles, registerWaterKnobs } from './water.js';
import { clamp, lerp, smoothstep, hexRgb } from './textures/noise.js';

// Towns are data, not three evenly spaced districts. `pad` is one entry per terrace, stepping up
// toward the back of the town, so Blackstone's three levels are a list rather than a special case.
// The z centres are 0 while the demo layout is the content; WORLD.md §1.3's −60 / +40 / −80 land
// at A8, when the layout moves with them.
export const TOWNS = [
  { id: 'light', zone: 'light', cx: -520, cz: 0, hw: 120, hd: 100, pad: [24] },
  { id: 'neutral', zone: 'neutral', cx: 0, cz: 0, hw: 130, hd: 110, pad: [5] },
  { id: 'dark', zone: 'dark', cx: 520, cz: 0, hw: 115, hd: 100, pad: [28, 37, 46] },
];
export const CENTERS = TOWNS.map(t => t.cx);
const TOWN_FADE = 70;

const X0 = -720, X1 = 720, Z0 = -400, Z1 = 320;

// The mesh runs to the map edge; the player is held 40 m inside it so the horizon is always
// ground rather than the end of the world.
export const BOUNDS = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
export const PLAY = { x0: X0 + 40, x1: X1 - 40, z0: Z0 + 40, z1: Z1 - 40 };

// Non-uniform grid: 3.4 m over each town, 12 m over the marches between them, 2 m through the
// river band. The channel is ~10 m wide and 1.75 m deep, so at a flat 12 m step the cut simply is
// not in the rendered mesh however carefully heightAt describes it. The trick is separable — a
// fine band in Z is fine at every X — which is why the river may only meander so far in Z before
// it has to become the arc-length ribbon of WORLD.md §4.5 instead.
function axis(spans) {
  const out = [spans[0][0]];
  for (const [a, b, s] of spans) {
    const n = Math.max(1, Math.round((b - a) / s));
    for (let i = 1; i <= n; i++) out.push(a + (b - a) * i / n);
  }
  return Float32Array.from(out);
}
const XS = axis([[X0, -660, 12], [-660, -380, 3.4], [-380, -140, 12], [-140, 140, 3.4],
  [140, 380, 12], [380, 660, 3.4], [660, X1, 12]]);
const ZS = axis([[Z0, -200, 24], [-200, -80, 8], [-80, 60, 3.0], [60, 110, 6],
  [110, 195, 2.0], [195, 240, 6], [240, Z1, 24]]);
const NX = XS.length, NZ = ZS.length;

// Chunk seams in world metres. Culling wants small bounding spheres, so the split is by extent
// rather than by vertex count — a 12 m chunk holding the same number of vertices as a 3.4 m one
// would span a third of the map and never cull.
const CHX = [X0, -560, -380, -140, 140, 380, 560, X1];
const CHZ = [Z0, -200, -80, 60, 195, Z1];

// index of the axis node at (or just below) a chunk boundary — the boundaries are span endpoints,
// so this lands exactly on one
function span(arr, v) {
  let best = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] <= v + 1e-4) best = i;
  return best;
}

// index+fraction packed into one float; the caller takes |0 for the cell
function fcell(arr, v) {
  const n = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[n]) return n - 0.0011;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
  return lo + (v - arr[lo]) / (arr[lo + 1] - arr[lo]);
}

// Occupancy / contact-AO grid. At GS 1 over 1440 × 720 this is 1.04 M cells, a 4.2 MB Float32Array
// and a two-pass blur over a million cells at boot. 2 m is still four times finer than the ground
// vertices that read it. WORLD.md §6.5 wants this allocated per town patch at GS 1 instead, which
// is A4's to do once patches exist.
const GS = 2;
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

// The valley floor the whole map is measured against: the Vail falls 5 m west to east, and the
// river surface rides 1.35 m under it. Everything else is a height above this datum, so the water
// can never end up above the ground it is supposed to be lying in.
// Three reaches and two steps, monotonically decreasing in x — a river that ponds anywhere makes
// buildWater's flow attribute lie. Upper 0.006 m/m through the Downs, valley 0.0022, gorge 0.009,
// plus the Longacre weir that drives the mill wheel and the cascade at the head of the gorge.
export function waterY(x) {
  return 9.6
    - 0.006 * (clamp(x, X0, -200) - X0)
    - 0.0022 * (clamp(x, -200, 300) + 200)
    - 0.009 * (clamp(x, 300, X1) - 300)
    - 1.2 * smoothstep(-46, -26, x)
    - 3.0 * smoothstep(336, 372, x);
}
const FLOOR = x => waterY(x) + 1.35;

// The Vail. A spline, not a sine: a sine cannot be made to pass through a chosen point, and every
// crossing in §4.3 is a chosen point. Monotone in x, so `creekZ(x)` stays a function.
export const RIVER_CP = [
  [-880, 236], [-820, 220], [-700, 190], [-600, 158], [-500, 120], [-400, 90], [-286, 40],
  [-180, 30], [-80, 62], [-34, 118], [60, 140], [140, 110], [200, 60], [260, 20], [330, 4],
  [400, 30], [480, 72], [560, 110], [660, 150], [780, 182], [880, 205],
];

export const creekZ = x => splineAt(RIVER_CP, x) + 7 * fbm(x * 0.0091 + 1.234, 0.777, 2, 17);

const bell = (x, c, w) => 1 - smoothstep(w * 0.35, w, Math.abs(x - c));

// Named so the reaches read: the head in the Downs is a stream, the Hollow Ford is a wide shallow,
// the gorge is a narrow deep slot. FORD_X and SPAN_X are where the King's Road meets the water.
export const FORD_X = 200, SPAN_X = 400;

export const creekHalf = x => 3.5
  + 3.2 * smoothstep(-620, -120, x)
  + 8.0 * bell(x, FORD_X, 52)
  - 2.4 * smoothstep(330, 396, x)
  + 0.6 * Math.sin(x * 0.019 + 0.7);

const creekBank = x => creekHalf(x) + 5.4;

// Depth, not a constant. This is the change that makes a ford possible: 0.45 m across a 100 m band
// at the ford, 4.5 m in the gorge. Everything that used the old CHANNEL constant calls this.
export const CHANNEL = x => 1.75 - 1.30 * bell(x, FORD_X, 52) + 2.75 * smoothstep(336, 396, x);

// Catmull-Rom in x. The control points are roughly evenly spaced, so the segment parameter is
// just the fraction across the interval — a full arc-length parameterisation buys nothing here
// and would have to be inverted per query.
function splineAt(cp, x) {
  const n = cp.length;
  if (x <= cp[0][0]) return cp[0][1];
  if (x >= cp[n - 1][0]) return cp[n - 1][1];
  let i = 0;
  while (i < n - 2 && cp[i + 1][0] < x) i++;
  const t = (x - cp[i][0]) / (cp[i + 1][0] - cp[i][0]);
  const p0 = cp[Math.max(0, i - 1)][1], p1 = cp[i][1], p2 = cp[i + 1][1], p3 = cp[Math.min(n - 1, i + 2)][1];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Irrational phases, and no two terms sharing one. Value noise has zero gradient at every lattice
// node, so integer offsets put every octave's node on x = 0 at once and the flat spots line up
// into a coherent ridge the length of the map. That is the street_dusk seam — see
// docs/NOTES_WORLD_A2-A5.md.
function detail(x, z) {
  return 4.6 * fbm(x * 0.0032 + 0.317, z * 0.0032 + 0.618, 3, 11)
    + 1.7 * fbm(x * 0.011 + 2.414, z * 0.011 + 1.732, 3, 29)
    + 0.5 * fbm(x * 0.047 + 3.141, z * 0.047 + 0.577, 2, 47);
}

// West is up and pale, east is up and black, the middle is down and green: the elevation profile
// is the navigation backbone and it costs nothing.
function region(x, z) {
  return FLOOR(x)
    + 19 * smoothstep(-200, -560, x)
    + 27 * smoothstep(200, 560, x)
    + 17 * smoothstep(-170, -350, z)
    - 1.8 * smoothstep(140, 260, z);
}

const corridor = (x, z) => smoothstep(155, 45, Math.abs(z - creekZ(x)));

function natural(x, z) {
  const c = corridor(x, z);
  // detail is damped in the corridor: a flood plain is flat, and undulation there would put
  // hummocks in the water
  const h = region(x, z) + detail(x, z) * (1 - 0.72 * c);
  // Nothing outside the channel may sit below the river surface. Without this the water meadows
  // and the deeper noise troughs measure as submerged, and every "is this dry land" test in
  // scatter.js and people.js reads them as water.
  return Math.max(c > 0 ? lerp(h, FLOOR(x) + 1.45, c) : h, waterY(x) + 0.8);
}

// The winning town at a point, and how strongly. Zero everywhere between them — with 520 m of
// separation and a 120 m half-extent plus a 70 m fade, the mask genuinely releases, which the
// old three-district version never did.
function townAt(x, z) {
  let best = null, bm = 0;
  for (const t of TOWNS) {
    const m = smoothstep(t.hw + TOWN_FADE, t.hw, Math.abs(x - t.cx))
      * smoothstep(t.hd + TOWN_FADE, t.hd, Math.abs(z - t.cz));
    if (m > bm) { bm = m; best = t; }
  }
  return { t: best, m: bm };
}

// Terraces step up toward the back of the town. The riser occupies the last 18 % of each band, so
// a 9 m step is a 1:1.3 slope with a retaining wall's worth of ground under it.
function padOf(t, z) {
  const n = t.pad.length;
  if (n === 1) return t.pad[0];
  const u = clamp((t.cz + t.hd - z) / (2 * t.hd), 0, 1);
  const i = Math.min(n - 1, Math.floor(u * n));
  return lerp(t.pad[i], t.pad[Math.min(n - 1, i + 1)], smoothstep(0.82, 1, u * n - i));
}

export function heightAt(x, z) {
  let h = natural(x, z);
  const { t, m } = townAt(x, z);
  if (m > 0) { const p = padOf(t, z); h = lerp(h, p + (h - p) * 0.25, m); }
  const bank = creekBank(x), half = creekHalf(x);
  const d = Math.abs(z - creekZ(x));
  if (d < bank) {
    const wy = waterY(x);
    if (d <= half) {
      // flat bed, then a steepening shelf that reaches the water line exactly at d = half
      h = wy - CHANNEL(x) * (1 - Math.pow(d / half, 1.7));
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

// Zone boundaries wander so the ground never changes along a straight line. They sit on the
// midpoints between towns, so a march belongs to whichever town you are walking toward.
const bound0 = z => -260 + 46 * fbm(z * 0.0038 + 0.732, 1.137, 3, 91);
const bound1 = z => 260 + 46 * fbm(z * 0.0038 + 5.318, 2.449, 3, 137);

function zoneMix(x, z, out) {
  const b0 = bound0(z), b1 = bound1(z);
  const a = smoothstep(b0 - 60, b0 + 60, x);
  const b = smoothstep(b1 - 60, b1 + 60, x);
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
    const fp = { x, z, hw, hd, rot, ao: opts.ao ?? 1, grow: opts.grow ?? 0.6 };
    this.footprints.push(fp);
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const r = Math.hypot(hw, hd) + fp.grow + 5.25;
    for (let dz = -r; dz <= r; dz += GS) {
      for (let dx = -r; dx <= r; dx += GS) {
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ox = Math.abs(lx) - hw, oz = Math.abs(lz) - hd;
        const d = Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0);
        const k = this.gi(x + dx, z + dz);
        if (d < fp.grow) this.occ[k] = 1;
        if (fp.ao) this.aoSrc[k] = Math.max(this.aoSrc[k], fp.ao * smoothstep(4.8, -0.3, d));
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

  // Off the built grid, not off heightAt. buildGround used to call this per vertex and it called
  // heightAt four more times, so every terrain vertex cost five field evaluations; over the new
  // world that is the difference between a 400 ms and a 100 ms boot.
  slopeAt(x, z) {
    const e = 1.4;
    const dx = this.surfaceY(x + e, z) - this.surfaceY(x - e, z);
    const dz = this.surfaceY(x, z + e) - this.surfaceY(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  buildGround() {
    const n = NX * NZ;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const hg = this.hgrid = new Float32Array(n);
    const zi = new Uint8Array(n);
    const tints = ZONE_IDS.map(id => hexRgb(zone(id).groundTint).map(v => v / 255));
    const w = [0, 0, 0];

    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) hg[j * NX + i] = heightAt(XS[i], ZS[j]);
    }

    // Central differences on the grid rather than computeVertexNormals: the mesh is split into
    // chunks and a per-chunk normal pass has no neighbours across a seam, which lights every
    // chunk edge as a crease.
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        const i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(NZ - 1, j + 1);
        const gx = (hg[j * NX + i0] - hg[j * NX + i1]) / (XS[i1] - XS[i0]);
        const gz = (hg[j0 * NX + i] - hg[j1 * NX + i]) / (ZS[j1] - ZS[j0]);
        const l = Math.hypot(gx, 1, gz);
        nrm[k * 3] = gx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = gz / l;
      }
    }

    for (let j = 0; j < NZ; j++) {
      const z = ZS[j];
      for (let i = 0; i < NX; i++) {
        const x = XS[i];
        const k = j * NX + i;
        const h = hg[k];
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

        const sl = smoothstep(0.30, 0.85, Math.hypot(nrm[k * 3], nrm[k * 3 + 2]) / nrm[k * 3 + 1]);
        r *= lerp(1, 1.14, sl); g *= lerp(1, 1.08, sl); b *= lerp(1, 0.98, sl);

        col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
      }
    }

    const mats = ZONE_IDS.map(id => {
      const m = getMaterial(id, 'ground');
      m.vertexColors = true;
      m.needsUpdate = true;
      return m;
    });

    // One mesh spanning the map has a bounding sphere that intersects every frustum, which is why
    // 301k of 301.8k resident triangles were drawn in wall_day. Chunks are the cheapest fix that
    // does not need a second resolution of ground: same grid, same heights, several meshes.
    this.chunks = [];
    this.ground = new THREE.Group();
    this.ground.name = 'groundChunks';
    this.object3D.add(this.ground);
    for (let cz = 0; cz < CHZ.length - 1; cz++) {
      for (let cx = 0; cx < CHX.length - 1; cx++) {
        const i0 = span(XS, CHX[cx]), i1 = span(XS, CHX[cx + 1]);
        const j0 = span(ZS, CHZ[cz]), j1 = span(ZS, CHZ[cz + 1]);
        if (i1 <= i0 || j1 <= j0) continue;
        this.chunks.push(this.groundChunk(pos, nrm, col, zi, mats, i0, i1, j0, j1));
      }
    }
  }

  // Vertices are re-emitted per chunk rather than shared, so a chunk's index buffer is dense and
  // the seam is exact: both sides read the same position and the same grid normal.
  groundChunk(pos, nrm, col, zi, mats, i0, i1, j0, j1) {
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const p = new Float32Array(w * d * 3), n = new Float32Array(w * d * 3), c = new Float32Array(w * d * 3);
    for (let j = 0; j <= j1 - j0; j++) {
      for (let i = 0; i <= i1 - i0; i++) {
        const src = ((j + j0) * NX + i + i0) * 3, dst = (j * w + i) * 3;
        for (let k = 0; k < 3; k++) { p[dst + k] = pos[src + k]; n[dst + k] = nrm[src + k]; c[dst + k] = col[src + k]; }
      }
    }
    const idx = [[], [], []];
    for (let j = 0; j < j1 - j0; j++) {
      for (let i = 0; i < i1 - i0; i++) {
        const a = j * w + i, b = a + 1, cc = a + w, dd = cc + 1;
        idx[zi[(j + j0) * NX + i + i0]].push(a, cc, b);
        idx[zi[(j + j0 + 1) * NX + i + i0 + 1]].push(b, cc, dd);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const flat = [];
    let start = 0;
    for (let z = 0; z < 3; z++) {
      if (!idx[z].length) continue;
      for (const v of idx[z]) flat.push(v);
      geo.addGroup(start, idx[z].length, z);
      start += idx[z].length;
    }
    geo.setIndex(flat);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = 'ground';
    mesh.receiveShadow = true;
    this.ground.add(mesh);
    return mesh;
  }

  // Distance cull on top of three's frustum cull. Driven off viewDist so the high and ultra
  // presets do not show the world ending.
  update(dt, app) {
    if (!this.chunks) return;
    const r = (app.quality.get('viewDist') || 180) * (this.cullK ?? 1.6);
    const c = app.camera.position;
    for (const m of this.chunks) {
      const s = m.geometry.boundingSphere;
      m.visible = c.distanceTo(s.center) < r + s.radius;
    }
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

  // The surface is cut to the channel and parameterised in channel space (metres along the creek,
  // metres across it) so the shader can scroll ripples down a bend instead of across the world.
  // Cross stations bunch towards the shore so the depth ramp resolves; depth reaches 0 exactly at
  // the water line, which is what the foam lace and the alpha fade both key off.
  buildWater() {
    const CROSS = 10;
    const pos = [], chan = [], flow = [], depth = [], tint = [], idx = [];
    const st = [];
    for (let x = X0; x <= X1 + 0.1; x += 2.6) st.push(x);

    const arc = [0];
    for (let i = 1; i < st.length; i++) {
      const dx = st[i] - st[i - 1];
      arc.push(arc[i - 1] + Math.hypot(dx, creekZ(st[i]) - creekZ(st[i - 1])));
    }
    this.creekArc = x => {
      const f = clamp((x - st[0]) / 2.6, 0, st.length - 1.001);
      const i = f | 0;
      return lerp(arc[i], arc[i + 1], f - i);
    };

    const tints = ZONE_IDS.map(id => zone(id).water);
    const w = [0, 0, 0];
    for (let i = 0; i < st.length; i++) {
      const x = st[i];
      const cz = creekZ(x), wy = waterY(x), half = creekHalf(x);
      // the channel drops to the east, so the flow tangent points along +x
      const dz = creekZ(x + 0.5) - creekZ(x - 0.5);
      const fl = 1 / Math.hypot(1, dz);
      for (let c = 0; c <= CROSS; c++) {
        const t = c / CROSS * 2 - 1;
        const off = Math.sign(t) * half * Math.pow(Math.abs(t), 0.62);
        const y = wy + 0.04 * Math.sin(x * 0.42 + off * 0.9) + 0.022 * Math.sin(off * 2.3 - x * 0.17);
        pos.push(x, y, cz + off);
        chan.push(arc[i], off);
        flow.push(fl, dz * fl);
        depth.push(clamp(wy - heightAt(x, cz + off), 0, CHANNEL(x)) / CHANNEL(x));
        zoneMix(x, cz + off, w);
        for (let k = 0; k < 3; k++) {
          tint.push(w[0] * tints[0].tint[k] + w[1] * tints[1].tint[k] + w[2] * tints[2].tint[k]);
        }
        tint.push(w[0] * tints[0].foam + w[1] * tints[1].foam + w[2] * tints[2].foam);
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
    geo.setAttribute('aChan', new THREE.Float32BufferAttribute(chan, 2));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
    geo.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = waterMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'water';
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    // no system owns Terrain's update, so the clock rides the draw. userData.freeze pins it for
    // a repeatable shot.
    const t0 = performance.now();
    mesh.onBeforeRender = () => {
      mat.uniforms.uTime.value = this.waterClock ?? (performance.now() - t0) / 1000;
    };
    mesh.userData.freeze = t => { this.waterClock = t; };
    this.object3D.add(mesh);
    this.water = mesh;
    this.waterMat = mat;
    this.applyObstacles();
  }

  // Anything standing in the channel throws a bow wave and a foam tail. The bridge registers a
  // reflection quad, not its piers, so the pier offset here mirrors bridge() in editor/build.js.
  applyObstacles() {
    const list = [];
    for (const { x, cz } of this.reflects) {
      for (const s of [-1, 1]) {
        const z = cz + s * 2.9;
        list.push({ s: this.creekArc(x), n: z - creekZ(x), r: 2.4, tail: 9 });
      }
    }
    setObstacles(this.waterMat, list);
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
      push(out, 0.55 * fp.ao, 2.85);
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
    q.register({ key: 'groundCull', label: 'Ground cull × view distance', type: 'range', min: 0.8, max: 4, step: 0.1, default: 1.6, group: 'World' },
      v => { this.cullK = v; });
    registerWaterKnobs(q, this.waterMat);
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
