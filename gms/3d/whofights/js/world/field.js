// The analytic world: heights, the academy pad and the road, with no renderer import so node can
// measure it. terrain.js turns all of this into meshes and re-exports it.
//
// Who Fights is one gentle meadow, not FORGE's valley. The river API is still exported because
// terrain.js is lifted unchanged and speaks it; `HAS_WATER` is false and the channel functions
// are flat, so nothing is cut, nothing is drawn, and `carve` is zero everywhere.

import { clamp, lerp, smoothstep } from './textures/noise.js';

export const X0 = -300, X1 = 300, Z0 = -300, Z1 = 300;
export const BOUNDS = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
export const PLAY = { x0: X0 + 30, x1: X1 - 30, z0: Z0 + 30, z1: Z1 - 30 };

export const HAS_WATER = false;

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

// One place, one pad. `pad` is metres above the valley floor, the same list-of-terraces shape
// FORGE used, so a later level can step a hillside town without changing this file.
export const TOWNS = [
  { id: 'academy', zone: 'neutral', cx: 0, cz: -30, hw: 105, hd: 95, pad: [3] },
];
export const CENTERS = TOWNS.map(t => t.cx);
const TOWN_FADE = 80;

// Flat and below every ground height in the map: there is no water in Who Fights, and this is
// the datum everything else is measured from.
export const waterY = () => -1.5;
export const FLOOR = () => 0;

// Parked far outside BOUNDS so terrain.js's channel maths is a no-op rather than a special case.
const AWAY = Z1 + 600;
export const RIVER_CP = [[X0, AWAY], [X1, AWAY]];
export const creekZ = () => AWAY;
export const creekHalf = () => 3;
export const creekBank = () => 8;
export const CHANNEL = () => 1;
export const DOWNS_X = X0, MILL_X = 0, FORD_X = 0, SPAN_X = X1, GORGE_X = X1;
export const CROSSINGS = [];

export function splineAt(cp, x) {
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

// Irrational phases, no two sharing one: value noise has zero gradient at every lattice node, so
// integer offsets line every octave's flat spot up into a ridge the length of the map.
function detail(x, z) {
  return 3.4 * fbm(x * 0.0026 + 0.317, z * 0.0026 + 0.618, 3, 11)
    + 1.1 * fbm(x * 0.0094 + 2.414, z * 0.0094 + 1.732, 2, 29)
    + 0.35 * fbm(x * 0.024 + 3.141, z * 0.024 + 0.577, 1, 47);
}

// Meadow: flat in the middle, lifting to low downs at the rim so the map has an edge without a
// wall. Nothing here rises faster than the 4 m grid can hold.
function region(x, z) {
  const r = Math.max(Math.abs(x), Math.abs(z));
  return FLOOR(x) + 1.6 + 14 * smoothstep(170, 290, r);
}

function natural(x, z) {
  return region(x, z) + detail(x, z);
}

export function townAt(x, z) {
  let best = null, bm = 0;
  for (const t of TOWNS) {
    const m = smoothstep(t.hw + TOWN_FADE, t.hw, Math.abs(x - t.cx))
      * smoothstep(t.hd + TOWN_FADE, t.hd, Math.abs(z - t.cz));
    if (m > bm) { bm = m; best = t; }
  }
  return { t: best, m: bm };
}

function padOf(t) { return FLOOR(t.cx) + t.pad[0]; }

// How much of the natural relief the pad leaves behind.
const PAD_KEEP = 0.10;

export function landAt(x, z) {
  let h = natural(x, z);
  const { t, m } = townAt(x, z);
  if (m > 0) { const p = padOf(t); h = lerp(h, p + (h - p) * PAD_KEEP, m); }
  return h;
}

export const carve = () => 0;
export const heightAt = (x, z) => landAt(x, z);
export const depthAt = (x, z) => waterY(x) - heightAt(x, z);

// One zone across the whole meadow. The boundaries sit far outside BOUNDS, so `zoneMix` always
// answers neutral and the ground tint never changes along a line. Objects still carry their own
// zone — the academy is built in `light` stone on neutral ground.
export const bound0 = () => X0 - 400;
export const bound1 = () => X1 + 400;

export function zoneMix(x, z, out) {
  out[0] = 0; out[1] = 1; out[2] = 0;
  return 1;
}

export function zoneAt() { return 1; }

export function axis(spans) {
  const out = [spans[0][0]];
  for (const [a, b, s] of spans) {
    const n = Math.max(1, Math.round((b - a) / s));
    for (let i = 1; i <= n; i++) out.push(a + (b - a) * i / n);
  }
  return Float32Array.from(out);
}

// 4 m over the academy and its meadow, 10 m out to the rim.
export const XS = axis([[X0, -170, 10], [-170, 170, 4], [170, X1, 10]]);
export const ZS = axis([[Z0, -170, 10], [-170, 170, 4], [170, Z1, 10]]);
export const NX = XS.length, NZ = ZS.length;

// index+fraction packed into one float; the caller takes |0 for the cell
export function fcell(arr, v) {
  const n = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[n]) return n - 0.0011;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
  return lo + (v - arr[lo]) / (arr[lo + 1] - arr[lo]);
}

export function buildLandGrid() {
  const hg = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) hg[j * NX + i] = landAt(XS[i], ZS[j]);
  }
  return hg;
}

export function sampleGrid(hg, x, z) {
  const fx = fcell(XS, x), fz = fcell(ZS, z);
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
  const a = hg[j * NX + i], b = hg[j * NX + i + 1];
  const c = hg[(j + 1) * NX + i], d = hg[(j + 1) * NX + i + 1];
  return lerp(a + (b - a) * tx, c + (d - c) * tx, tz);
}

const R = (x, z) => [x, z];

// The one road, running east–west across the front of the academy. The level's spawn point sits
// on it. `ROAD_Z` is what data/levels/academy.json places the sign and the player against.
export const ROAD_Z = 22;

export const ROADS = [
  {
    id: 'front', width: 9, kind: 'principal',
    cp: [R(-260, ROAD_Z + 14), R(-180, ROAD_Z + 7), R(-110, ROAD_Z + 1), R(-40, ROAD_Z - 1),
      R(40, ROAD_Z - 1), R(110, ROAD_Z + 1), R(180, ROAD_Z + 7), R(260, ROAD_Z + 14)],
  },
];

export function roadPoints(road) {
  return road.cp.map(([x, z]) => [x, z === null ? creekZ(x) : z]);
}

// Catmull-Rom through the control points at `step` metres, sampled in arc length so a road bends
// instead of turning a corner.
export function roadLine(cp, step = 2.2) {
  const n = cp.length;
  const out = [];
  const at = (i, t) => {
    const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(n - 1, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    const c = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    return [c(0), c(1)];
  };
  for (let i = 0; i < n - 1; i++) {
    const seg = Math.max(2, Math.ceil(Math.hypot(cp[i + 1][0] - cp[i][0], cp[i + 1][1] - cp[i][1]) / step));
    for (let s = 0; s < seg; s++) out.push(at(i, s / seg));
  }
  out.push(cp[n - 1].slice(0, 2));
  return out;
}

export function polyLength(line) {
  let l = 0;
  for (let i = 1; i < line.length; i++) l += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return l;
}
