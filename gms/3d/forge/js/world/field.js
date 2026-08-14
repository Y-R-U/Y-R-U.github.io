// The analytic world: heights, the Vail, the towns and the roads, with no renderer import so
// node can measure it. terrain.js turns all of this into meshes and re-exports it.

import { clamp, lerp, smoothstep } from './textures/noise.js';

export const X0 = -720, X1 = 720, Z0 = -400, Z1 = 320;
export const BOUNDS = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
export const PLAY = { x0: X0 + 40, x1: X1 - 40, z0: Z0 + 40, z1: Z1 - 40 };

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

// `pad` is metres above the valley floor at the town's own x, one entry per terrace stepping up
// toward the back — so Blackstone's three levels are a list rather than a special case, and the
// numbers are the ones WORLD.md §1.3 states rather than absolute heights nobody can check.
export const TOWNS = [
  { id: 'light', zone: 'light', cx: -520, cz: -60, hw: 120, hd: 100, pad: [22] },
  { id: 'neutral', zone: 'neutral', cx: 0, cz: 40, hw: 130, hd: 110, pad: [2] },
  { id: 'dark', zone: 'dark', cx: 520, cz: -80, hw: 115, hd: 100, pad: [30, 39, 48], riser: 26 },
];
export const CENTERS = TOWNS.map(t => t.cx);
const TOWN_FADE = 70;

// Three reaches and two steps, monotonically decreasing in x — a river that ponds anywhere makes
// buildWater's flow attribute lie. Upper 0.006 m/m through the Downs, valley 0.0022, gorge 0.009,
// plus the Longacre weir that drives the mill wheel and the cascade at the head of the gorge.
export function waterY(x) {
  return 9.6
    - 0.006 * (clamp(x, X0, -200) - X0)
    - 0.0022 * (clamp(x, -200, 340) + 200)
    - 0.009 * (clamp(x, 340, X1) - 340)
    - 1.2 * smoothstep(-32, -12, x)
    - 3.0 * smoothstep(392, 428, x);
}

// The valley floor the whole map is measured against; the river surface rides 1.35 m under it.
export const FLOOR = x => waterY(x) + 1.35;

// The Vail. A spline, not a sine: a sine cannot be made to pass through a chosen point, and every
// fishing stand, mill leat and crossing is a chosen point. Monotone in x, so `creekZ(x)` stays a
// function.
//
// FROZEN. `data/areas.json` places 89 areas — six fish stands, four reaches, the mill leat, all
// four crossings — by evaluating this exact spline, wobble included, at each x. Moving a control
// point moves fishing water into dry fields. WORLD.md §4.2 proposed a different list and §4.3 a
// different ford and span; the doc was wrong and has been corrected to these numbers.
export const RIVER_CP = [
  [-880, 236], [-820, 220], [-700, 190], [-600, 158], [-500, 120], [-400, 90], [-286, 40],
  [-180, 30], [-80, 62], [-34, 118], [60, 140], [140, 110], [200, 60], [260, 20], [330, 4],
  [400, 30], [480, 72], [560, 110], [660, 150], [780, 182], [880, 205],
];

// Catmull-Rom in x. The control points are roughly evenly spaced, so the segment parameter is
// just the fraction across the interval — a full arc-length parameterisation buys nothing here
// and would have to be inverted per query.
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

export const creekZ = x => splineAt(RIVER_CP, x) + 7 * fbm(x * 0.0091 + 1.234, 0.777, 2, 17);

const bell = (x, c, w) => 1 - smoothstep(w * 0.35, w, Math.abs(x - c));

// Where the King's Road meets the water, and where the gorge is. All four crossings come from
// data/areas.json; the ford and the gorge also change the channel profile.
export const DOWNS_X = -286, MILL_X = -34, FORD_X = 200, SPAN_X = 400, GORGE_X = 430;

export const creekHalf = x => 3.5
  + 3.2 * smoothstep(-620, -120, x)
  + 8.0 * bell(x, FORD_X, 52)
  - 2.4 * bell(x, GORGE_X, 80)
  + 0.6 * Math.sin(x * 0.019 + 0.7);

// Depth, not a constant. This is the change that makes a ford possible: 0.45 m across the ford
// band, 4.5 m in the gorge. Everything that used the old CHANNEL constant calls this.
export const CHANNEL = x => 1.75 - 1.30 * bell(x, FORD_X, 52) + 2.75 * bell(x, GORGE_X, 80);

// A function of x alone, never of the query point's height: this is where `carve` stops, so if it
// varied across the section the cut would be discontinuous along its own edge. The ford gets the
// wide shoulder — the King's Road drives through it.
export const creekBank = x => creekHalf(x) + 5.4 + 10 * bell(x, FORD_X, 60);

// Irrational phases, no two terms sharing one: value noise has zero gradient at every lattice node,
// so integer offsets put every octave's node on x = 0 at once and the flat spots line up into a
// ridge the length of the map. Top frequency 0.026 — a 38 m cell — because the coarse grid steps
// 10 m and relief the mesh cannot hold is relief that makes surfaceY and heightAt disagree.
function detail(x, z) {
  return 4.6 * fbm(x * 0.0032 + 0.317, z * 0.0032 + 0.618, 3, 11)
    + 1.7 * fbm(x * 0.011 + 2.414, z * 0.011 + 1.732, 2, 29)
    + 0.55 * fbm(x * 0.026 + 3.141, z * 0.026 + 0.577, 1, 47);
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

// The flood plain: flat out to `corridorW`, then 3.2 m of run per metre it has to climb — a valley
// wall the grid can hold rather than a cliff it aliases into a step. A constant 155 m swallowed
// Whitewall whole once the Vail was routed past its south gate.
const corridorW = x => 30 + 110 * smoothstep(-520, -200, x) * smoothstep(520, 200, x);

// The gorge is the absence of a flood plain, not a deeper one: a lowered plain just runs into
// `natural`'s "never below the water line" clamp. Switch the corridor off and the basalt uplift
// reaches the water's edge on its own, which is a 13 m slot at Blackspan.
function corridor(x, z) {
  const cz = creekZ(x), w = corridorW(x);
  const depth = Math.max(0, region(x, cz) - FLOOR(x) - 1.45);
  return (1 - 0.95 * bell(x, GORGE_X, 78)) * smoothstep(w + 30 + 3.2 * depth, w, Math.abs(z - cz));
}

function natural(x, z) {
  const c = corridor(x, z);
  // detail is damped in the corridor: a flood plain is flat, and undulation there would put
  // hummocks in the water
  const h = region(x, z) + detail(x, z) * (1 - 0.72 * c);
  return Math.max(c > 0 ? lerp(h, FLOOR(x) + 1.45, c) : h, waterY(x) + 0.8);
}

// The winning town at a point, and how strongly. It releases between towns — which the old
// three-district version never did — and at the river, because the Vail runs inside both
// Whitewall's and Blackstone's footprints and a pad that ignored it would flatten the water away.
export function townAt(x, z) {
  let best = null, bm = 0;
  for (const t of TOWNS) {
    const m = smoothstep(t.hw + TOWN_FADE, t.hw, Math.abs(x - t.cx))
      * smoothstep(t.hd + TOWN_FADE, t.hd, Math.abs(z - t.cz));
    if (m > bm) { bm = m; best = t; }
  }
  if (bm > 0) {
    const b = creekBank(x);
    bm *= smoothstep(b, b + 26, Math.abs(z - creekZ(x)));
  }
  return { t: best, m: bm };
}

// Terraces step up toward the back of the town. `riser` is the slope's width in metres rather
// than a fraction of the band, because it is the number the grid has to resolve: a 9 m step in
// 12 m is 0.5 m of disagreement between the mesh and the field however you sample it.
function padOf(t, z) {
  const base = FLOOR(t.cx);
  const n = t.pad.length;
  if (n === 1) return base + t.pad[0];
  const band = 2 * t.hd / n, r = (t.riser ?? 26) / 2;
  let p = t.pad[0];
  for (let k = 1; k < n; k++) {
    const zb = t.cz + t.hd - k * band;
    p += (t.pad[k] - t.pad[k - 1]) * smoothstep(zb + r, zb - r, z);
  }
  return base + p;
}

// How much of the natural relief a town pad leaves behind. At 0.25 Whitewall sat 5 m below its
// own shelf, because the Vail's valley wall runs through its footprint.
const PAD_KEEP = 0.12;

// The land, with no river cut in it. This is what the coarse world mesh is built from — a 10 m
// grid cannot hold a 10 m channel however carefully the field describes one, so the channel is
// not in the field the mesh samples. See `carve`.
export function landAt(x, z) {
  let h = natural(x, z);
  const { t, m } = townAt(x, z);
  if (m > 0) { const p = padOf(t, z); h = lerp(h, p + (h - p) * PAD_KEEP, m); }
  return h;
}

// How far the river cuts below the land at this point. Zero outside the banks, so `land + carve`
// is continuous and the bank ribbon meets the world mesh exactly at its edge.
export function carve(x, z, land = landAt(x, z)) {
  const wy = waterY(x);
  const half = creekHalf(x);
  const bank = creekBank(x);
  const d = Math.abs(z - creekZ(x));
  if (d >= bank) return 0;
  if (d <= half) return wy - CHANNEL(x) * (1 - Math.pow(d / half, 1.7)) - land;
  // steep just above the water, flattening into the natural ground — a real bank
  const u = (d - half) / (bank - half);
  return (wy - land) * Math.pow(1 - u, 2.4);
}

export const heightAt = (x, z) => { const l = landAt(x, z); return l + carve(x, z, l); };
export const depthAt = (x, z) => waterY(x) - heightAt(x, z);

// Zone boundaries wander so the ground never changes along a straight line. They sit on the
// midpoints between towns, so a march belongs to whichever town you are walking toward.
export const bound0 = z => -260 + 46 * fbm(z * 0.0038 + 0.732, 1.137, 3, 91);
export const bound1 = z => 260 + 46 * fbm(z * 0.0038 + 5.318, 2.449, 3, 137);

export function zoneMix(x, z, out) {
  const b0 = bound0(z), b1 = bound1(z);
  const a = smoothstep(b0 - 60, b0 + 60, x);
  const b = smoothstep(b1 - 60, b1 + 60, x);
  out[0] = 1 - a; out[1] = a - b; out[2] = b;
  return x < b0 ? 0 : x < b1 ? 1 : 2;
}

export function zoneAt(x, z) { return x < bound0(z) ? 0 : x < bound1(z) ? 1 : 2; }

// Non-uniform grid: 4 m over the three towns, 10 m over the marches between them. There is no
// fine band for the river any more — the arc-length bank ribbon carries the channel, and a fine
// Z band cannot follow water that wanders 300 m in z anyway.
export function axis(spans) {
  const out = [spans[0][0]];
  for (const [a, b, s] of spans) {
    const n = Math.max(1, Math.round((b - a) / s));
    for (let i = 1; i <= n; i++) out.push(a + (b - a) * i / n);
  }
  return Float32Array.from(out);
}

export const XS = axis([[X0, -660, 10], [-660, -380, 4], [-380, -150, 10], [-150, 150, 4],
  [150, 380, 10], [380, 660, 4], [660, X1, 10]]);
export const ZS = axis([[Z0, -260, 10], [-260, -200, 8], [-200, 160, 4], [160, 240, 8],
  [240, Z1, 10]]);
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

// The two roads of WORLD.md §4.4, plus the spurs that join them. `at` is a crossing: the z is
// taken from creekZ at build time so the road always meets the water where the water actually is,
// wobble included.
const R = (x, z) => [x, z];
const AT = x => [x, null];

export const ROADS = [
  {
    id: 'kings', width: 18, kind: 'principal',
    cp: [R(-408, -66), R(-380, -46), R(-352, -24), R(-322, 2), R(-300, 22), AT(DOWNS_X),
      R(-262, 56), R(-210, 52), R(-152, 58), R(-96, 88), R(-72, 126), R(-52, 138), AT(MILL_X),
      R(-18, 102), R(-6, 90), R(-1, 72), R(2, 41), R(0, 20), R(8, 16), R(42, 14), R(88, 14), R(126, 20),
      R(148, 28), R(170, 38), AT(FORD_X), R(238, 66), R(292, 40), R(344, 34), R(378, 46),
      AT(SPAN_X), R(408, -6), R(411, -44), R(411, -80)],
  },
  {
    id: 'drove', width: 8, kind: 'track',
    cp: [R(-470, -248), R(-370, -272), R(-286, -262), R(-170, -276), R(-40, -280),
      R(110, -272), R(250, -258), R(390, -248), R(470, -242)],
  },
  { id: 'spur_light', width: 10, cp: [R(-520, -142), R(-522, -180), R(-520, -212), R(-496, -234), R(-470, -248)] },
  { id: 'spur_neutral', width: 10, cp: [R(0, -70), R(-8, -134), R(-22, -206), R(-40, -280)] },
  { id: 'spur_dark', width: 10, cp: [R(520, -174), R(521, -196), R(520, -214), R(500, -232), R(470, -242)] },
];

export function roadPoints(road) {
  return road.cp.map(([x, z]) => [x, z === null ? creekZ(x) : z]);
}

// Catmull-Rom through the control points at `step` metres, so a road bends instead of turning a
// corner. Sampling in arc length rather than in x matters on the legs that run nearly north.
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

// The four crossings of WORLD.md §4.3. `bridge` records the deck; the ford has none.
export const CROSSINGS = [
  { id: 'downs', label: 'Downs Bridge', x: DOWNS_X, kind: 'bridge', halfSpan: 12, zone: 'light' },
  { id: 'mill', label: 'Millbridge', x: MILL_X, kind: 'bridge', halfSpan: 9, zone: 'neutral' },
  { id: 'ford', label: 'Hollow Ford', x: FORD_X, kind: 'ford', zone: 'neutral' },
  { id: 'blackspan', label: 'Blackspan', x: SPAN_X, kind: 'bridge', halfSpan: 15, deck: 14, zone: 'dark' },
];
