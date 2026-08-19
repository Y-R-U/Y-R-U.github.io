// §5.1–§5.4 — the vehicle family: ONE parametric hull, one shared light rig, five draw calls for
// every craft in the world (player included).
//
// ── the one idea (§5.1) ────────────────────────────────────────────────────
//
// Every craft in §5.2's table is the SAME MESH under a non-uniform scale. That is not an
// optimisation bolted onto the design, it is what the brief asks for read literally:
//
//   "Variation between types is length / height / width only — the curve language is shared."
//
// §5.1's loft is `halfW(t) = W * f(t)`, `halfH(t) = H * g(t) + canopy(t)` with `canopy(t)`
// itself proportional to H, and `x(t) = L * (t - 0.5)`. Every station coordinate is therefore
// LINEAR in exactly one of L, W, H — so the whole family is the unit hull (L = W = H = 1) with an
// instance matrix of `scale(W, H, L)`. Nine craft, one geometry, one InstancedMesh, one draw.
//
// The three integer options (nacelle count 2/4, fin count 0/1/2) cannot be a scale, so they are
// baked in as ALL FOUR nacelles and BOTH fins, each vertex tagged with `aPart`, and the unused
// slots collapsed to zero size in the vertex shader against a per-instance `iOpt`. A collapsed
// part is a degenerate triangle: no fill, no draw call, no second geometry.
//
// ── the five draws ─────────────────────────────────────────────────────────
//
//   body      InstancedMesh  hull + nacelles + fins + belly plate, dark metal, §5.3
//   glass     InstancedMesh  the canopy cap, §5.3's dark glass
//   lights    InstancedMesh  billboarded additive quads — EVERY light on EVERY craft (§5.4)
//   cones     InstancedMesh  oriented additive cones — thruster plumes, lamp cones, police sweep
//   (streaks are traffic.js's own field — §5.5's far band)
//
// §5.4 says "one InstancedMesh per role … so the whole city's vehicle lighting is 1 draw call",
// which is two statements that cannot both be true. §3.8's budget settles it: it prices vehicle
// lights at ONE draw. So the roles are per-instance DATA (colour, size, intensity), not per-role
// meshes, and §5.4's second sentence is the one that survives.
//
// ── two things that would silently break ───────────────────────────────────
//
// 1. NON-UNIFORM INSTANCE SCALE AND NORMALS — a fix that was WRONG, and the render said so.
//    A 4.4:1 `mammoth` under `scale(W, H, L)` needs its normals transformed by S⁻¹, not S, so this
//    file first shipped a per-instance S⁻² pre-multiply to compose with the S three was assumed to
//    apply. The first contact sheet came back with every hull mirroring the sky like white chrome.
//    Cause: **r160 already does it.** `defaultnormal_vertex` reads
//      `transformedNormal /= vec3( dot(im[0],im[0]), dot(im[1],im[1]), dot(im[2],im[2]) ); im * …`
//    — divide by S², multiply by S, which IS S⁻¹ (three.module.js:13882, verified against the
//    pinned 0.160.0 build, not from memory). The "fix" was a second correction on top of a correct
//    one and left the normals at S⁻³.
//    So there is no correction here, and the attribute that carried it is gone. The proof that the
//    hull's shading is real is `__game.craftEnv(false)` instead: detach the envMap and the hull
//    goes flat black, which is a check that can fail and did.
//
// 3. `pow()` ON AN INTERPOLATED VARYING BLANKED EVERY SHOT. This one is worth reading twice. With five patches on the hull
//    (normals, part collapse, panels, tint, rim) AND the streak field drawing in the same frame,
//    Every shot — not just the ones with a craft in them — came back at the clear colour: 43 draw
//    calls issued, 142 k triangles, no GL error, no context loss, no NaN anywhere in the instance
//    buffers, and `?lite=1` rendered perfectly. It bisected to needing BOTH the vertex patch (which
//    WRITES the chine varying) and the rim patch (which READS it), which is what finally named it:
//
//      `outgoingLight += vRim * pow( vMix.x, 2.2 ) * …`
//
//    **`pow(x, y)` is undefined for x < 0 in GLSL and returns NaN.** `vMix.x` is 0 or 1 at the
//    vertices, so it is in [0,1] *inside* the triangle — but under MSAA a covered sample can lie
//    slightly OUTSIDE it, and the interpolator then extrapolates to a small negative value. One NaN
//    fragment lands in the HalfFloat target, `UnrealBloomPass` blurs it across five mip levels, and
//    the composite paints the ENTIRE FRAME with NaN. That is why `?lite=1` (msaa 0, no bloom) was
//    clean, why `setBloom(0)` did NOT help (0 × NaN is still NaN), and why the instance buffers
//    were spotless: the corruption was created in the fragment shader and amplified by post.
//    The fix is one `saturate()`. **Never call pow() on an interpolated value without clamping it.**
// 2. `iTint` is OUR attribute, not `InstancedMesh.setColorAt`. three's instanceColor path depends
//    on `USE_INSTANCING_COLOR` reaching `color_fragment`, which is a chunk detail of the pinned
//    build; an own attribute multiplied in an own patch cannot be silently dropped by a version
//    bump.

import * as THREE from 'three';
import { patch, patchFog, U } from './materials.js';
import { clamp } from './utils.js';

// ── §5.2 the family ────────────────────────────────────────────────────────
// L/W/H are FULL dimensions in metres. `nac` and `fin` are the two integer options; `hull` is the
// §5.3 tint (black unless the table says otherwise) and `police` selects §5.4's light override.

// S2-C adds two more integer options to §5.1's three, for the same reason and by the same
// mechanism. Aaron, having flown the shipped build: "The cars/vehicles have little variation …
// no variation … some different height/length vehicles? Maybe 2 or 3 other shapes as well".
// L/W/H alone could not answer that — nine craft under one loft read as nine lozenges, which is
// exactly what shots/s2c/before_family.png shows. So:
//
//   `kit`  0-3  a bolt-on module group on a FLYING hull — spine rail, flank sponsons, cargo stack
//   `road` 0-3  a ROAD form: 0 is the flying hull, 1-3 are bus / articulated / tram-transport
//
// Both are per-instance integers selecting between parts that are baked into the SAME geometry
// and collapsed to zero in the vertex shader, exactly as `nac` and `fin` already are. Still one
// body geometry, still one draw call. §5.1's rule was never "two options"; it was "no craft gets
// a bespoke mesh", and that survives intact.
export const CRAFT_DEFS = {
  wisp:      { L: 5.4,  W: 2.0, H: 1.15, nac: 2, fin: 1, slots: 2, top: 62, role: 'starter courier', hull: 0x0a0b0e, trim: 0x35e6ff, run: 0 },
  kestrel:   { L: 6.2,  W: 2.4, H: 1.50, nac: 2, fin: 1, slots: 3, top: 66, role: 'all-rounder', hull: 0x090e18, trim: 0x2bd0ff, run: 0 },
  lance:     { L: 6.6,  W: 1.8, H: 1.00, nac: 2, fin: 2, slots: 2, top: 84, role: 'racer', hull: 0x15090c, trim: 0xff3a2b, run: 4, edge: 4 },
  drayman:   { L: 7.8,  W: 2.6, H: 1.90, nac: 4, fin: 1, kit: 2, slots: 4, top: 54, role: 'hauler', hull: 0x1a1005, trim: 0xffb04a, run: 1, edge: 2 },
  nocturne:  { L: 6.8,  W: 2.2, H: 1.35, nac: 4, fin: 0, kit: 1, slots: 3, top: 72, role: 'premium', hull: 0x120b18, trim: 0x9a6bff, run: 0, edge: 3, pulse: 0.55 },
  mammoth:   { L: 10.5, W: 3.4, H: 2.40, nac: 4, fin: 2, kit: 3, slots: 6, top: 46, role: 'freighter', hull: 0x14161a, trim: 0x6bff8a, run: 3, edge: 1 },
  // ── civilian traffic. Five silhouettes, not two. The proportions are deliberately spread:
  // 2.5:1 (van) to 5.4:1 (limo) in length-to-width, and 1.10 m to 2.55 m tall, so a lane reads as
  // mixed traffic rather than as one model at three scales.
  taxi_ai:   { L: 6.0,  W: 2.2, H: 1.40, nac: 2, fin: 1, top: 58, role: 'traffic' },
  hauler_ai: { L: 9.0,  W: 3.0, H: 2.10, nac: 4, fin: 1, kit: 3, top: 46, role: 'traffic' },
  pod_ai:    { L: 4.8,  W: 2.2, H: 1.90, nac: 2, fin: 0, top: 44, role: 'traffic' },      // stubby, tall
  limo_ai:   { L: 11.2, W: 2.0, H: 1.10, nac: 2, fin: 1, top: 70, role: 'traffic' },      // long, low
  van_ai:    { L: 7.6,  W: 3.0, H: 2.55, nac: 4, fin: 0, kit: 1, top: 40, role: 'traffic' },
  // §5.3: "the police hull stays black". Its trim is the one that does NOT vary — a patrol craft
  // has to be identifiable at a glance or the light rig exception means nothing.
  patrol:    { L: 7.0,  W: 2.5, H: 1.50, nac: 4, fin: 2, top: 78, role: 'traffic', police: true, hull: 0x0a0b0e, trim: 0xdfeaff, run: 4 },
  // ── §S2-C's road transports. Aaron: "for now I just want a few longer vehicles that could
  // represent buses/trams/long transports - but traveling on the roads". `road` collapses the
  // flying hull, its nacelles and its fins, and raises a box form instead; `nac`/`fin` are still
  // declared so nothing downstream has to special-case a missing field, and both are ignored.
  // L is the whole vehicle: a 34 m three-car transport is 34 m, not 3 x 34.
  bus_road:  { L: 12.0, W: 2.60, H: 3.00, nac: 0, fin: 0, road: 1, top: 16, role: 'road', trim: 0xffb04a, run: 0 },
  tram_road: { L: 22.0, W: 2.60, H: 3.20, nac: 0, fin: 0, road: 2, top: 14, role: 'road', trim: 0x35e6ff, run: 0 },
  haul_road: { L: 32.0, W: 3.00, H: 3.40, nac: 0, fin: 0, road: 3, top: 12, role: 'road', trim: 0x6bff8a, run: 0 },
};

export const CRAFT_IDS = Object.keys(CRAFT_DEFS);
export const PLAYER_IDS = CRAFT_IDS.filter(id => CRAFT_DEFS[id].slots !== undefined);

const HULL_BLACK = 0x0a0b0e;

// ── the paint, and why there is barely any of it ───────────────────────────
//
// Aaron, on seeing the first hulls: "most cars imo should be a very dark colour, like very dark
// red/blue etc, but they would have colour highlights, maybe a neon trim, headlights etc. the very
// dark colour should be reflective … like the buildings there should be different dark colours and
// different trim colours and some cars may only have partial trim".
//
// So the body palette is eight NEAR-BLACKS with a hue in them. Every entry is under 0x22 on its
// brightest channel: in shadow they are all simply black, and the hue only declares itself where
// the city hits them. If one of these ever reads as "a red car" it is wrong by a long way.
//
// The COLOUR in frame is not the paint. It is the trim run, the lamps, the thruster and — the
// thing that actually does the work — the reflection. See `bodyMaterial` for why the material had
// to change for that to be true.
export const BODY_TINTS = [
  0x0a0b0e,   // black
  0x15090c,   // very dark burgundy
  0x090e18,   // very dark navy
  0x081310,   // very dark green
  0x14161a,   // gunmetal
  0x120b18,   // very dark violet
  0x1a1005,   // very dark bronze
  0x0c1418,   // very dark teal
];

// Trim is a NEON, at full saturation, because it is a light source and not a paint. It varies per
// vehicle — which is a deliberate reading of the brief: "lights are shared across civilian types"
// governs the FIXTURES and their placement (§5.4's rig is identical on every civilian craft), and
// Aaron has since said explicitly that trim colour is separate and should vary.
export const TRIM_TINTS = [
  0x35e6ff, 0xff2a9d, 0xffb04a, 0x6bff8a, 0x9a6bff, 0xdfeaff, 0xff3a2b, 0x2bd0ff,
];

// The trim RUNS, as station spans. §5.4's edge rule is t 0.25 → 0.85; the rest are partial, and
// the last is a craft with no trim at all. `w` is the spawn weight.
export const TRIM_RUNS = [
  { amt: 1.00, t0: 0.25, t1: 0.85, w: 0.30 },   // §5.4's full chine rule
  { amt: 0.85, t0: 0.52, t1: 0.86, w: 0.16 },   // aft half only
  { amt: 0.85, t0: 0.16, t1: 0.48, w: 0.12 },   // a nose flash
  { amt: 0.60, t0: 0.30, t1: 0.62, w: 0.12 },   // a short mid run, dim
  { amt: 1.00, t0: 0.62, t1: 0.99, w: 0.08 },   // tail rail
  { amt: 0.00, t0: 0.00, t1: 0.00, w: 0.22 },   // NONE. Variety includes absence.
];

// ── §5.1 the loft ──────────────────────────────────────────────────────────
// Read exactly as written, with one reading and one deviation, both stated:
//
// READING: `W`, `H` in §5.1 are the FULL width and height of §5.2's table (a 5.4 m craft that is
// 2.0 m wide), so `halfW` peaks at W/2 and the unit hull peaks at 0.5. Taking them literally would
// make `wisp` 4 m wide and 2.3 m tall on a 5.4 m body.
//
// DEVIATION: §5.1 adds `canopy(t)` to `halfH`, which puts the same bulge on the BELLY. A craft
// with a canopy blister underneath it is not the `1939970_00` silhouette. The canopy is therefore
// added to the upper half only, and the belly is flattened to 0.88 — which is also what makes the
// belly plate and the belly strobe sit on something flat.

const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

export const HULL = {
  halfW: t => 0.5 * (0.18 + 0.82 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85)),
  halfH: t => 0.5 * (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.80)), 1.15)),
  canopy: t => 0.30 * 0.5 * smooth(0.28, 0.40, t) * (1 - smooth(0.52, 0.62, t)),
  n: t => 2.4 + 1.6 * smooth(0.15, 0.55, t),
  up: t => HULL.halfH(t) + HULL.canopy(t),
  dn: t => HULL.halfH(t) * 0.88,
};

const STATIONS = 11;
const RING = 12;

// The hull runs along -Z: the nose is at z = -L/2, which is the craft's forward under the same
// YXZ convention flight.js and camera.js use (`lookDir` is (-sin yaw, 0, -cos yaw)). Authoring it
// along +X, as §5.1's `x(t)` literally says, would mean a 90 deg fudge in every pose matrix.
function station(t, k, out) {
  const th = (k / RING) * Math.PI * 2;
  const e = 2 / HULL.n(t);
  const c = Math.cos(th), s = Math.sin(th);
  const hw = HULL.halfW(t);
  const hy = s >= 0 ? HULL.up(t) : HULL.dn(t);
  out[0] = hw * Math.sign(c) * Math.pow(Math.abs(c), e);
  out[1] = hy * Math.sign(s) * Math.pow(Math.abs(s), e);
  out[2] = t - 0.5;
  return out;
}

// ── a tiny mesher ──────────────────────────────────────────────────────────
// Everything in this file is a handful of triangles, so there is no reason for an index buffer
// gymnastics layer. Positions and normals are pushed flat; `part` and `chine` ride along.

class Mesh {
  constructor() {
    this.p = []; this.n = []; this.part = []; this.t = [];
    // Three EDGE channels rather than one chine. `eMark` is the value tri()/quad() stamp on every
    // vertex they emit, so a strip authored as a quad becomes a lit band without a per-vertex
    // argument threaded through six call sites.
    this.eA = []; this.eB = []; this.eC = [];
    this.tMark = 0.5; this.eMark = [0, 0, 0];
  }
  vert(x, y, z, nx, ny, nz, part, e = this.eMark, t = this.tMark) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.part.push(part);
    this.eA.push(e[0]); this.eB.push(e[1]); this.eC.push(e[2]);
    this.t.push(t);
  }
  // Flat-shaded triangle: the normal is the face normal, which is what a hard-edged nacelle wants.
  tri(a, b, c, part) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, c]) this.vert(v[0], v[1], v[2], nx, ny, nz, part);
  }
  quad(a, b, c, d, part) { this.tri(a, b, c, part); this.tri(a, c, d, part); }
  get tris() { return this.p.length / 9; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    // `aCT` is (shoulder, station t, keel, spine) in ONE vec4. It began as a vec2 of (chine, t)
    // because attribute and varying slots are the scarcest thing in this shader — see the header
    // note on the blank-frame bug — and widening a vec2 to a vec4 costs no additional slot, which
    // is why S2-C's two extra edge channels went here rather than into a second attribute.
    // `t` is what lets a trim run be a PER-INSTANCE span, so "some craft have only partial trim"
    // is attribute data and not a second mesh; on a ROAD form the spine channel is reused as the
    // lit-window-band mask, because a bus has no dorsal spine and does have windows.
    const n = this.eA.length;
    const ct = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      ct[i * 4] = this.eA[i]; ct[i * 4 + 1] = this.t[i];
      ct[i * 4 + 2] = this.eB[i]; ct[i * 4 + 3] = this.eC[i];
    }
    g.setAttribute('aCT', new THREE.Float32BufferAttribute(ct, 4));
    return g;
  }
}

// aPart codes.
//   0      the flying hull core — drawn unless the instance is a ROAD form
//   1-4    nacelle slots, kept while `slot <= iOpt.x`            (COUNT, nested)
//   11-12  fin slots, kept while `slot - 10 <= iOpt.y`           (COUNT, nested)
//   21-23  flying module kits, kept when `slot - 20 == iVar.x`   (EXACT, exclusive)
//   31-33  road forms, kept when `slot - 30 == iVar.y`           (EXACT, exclusive)
//
// Nacelles and fins are counts because two nacelles are a subset of four. Kits and road forms are
// exact matches because a cargo stack is not a superset of a spine rail and a tram is not a bus
// with an extra box on it — nesting them would force an ordering that does not exist.
const P_ALWAYS = 0, P_NAC = 1, P_FIN = 11, P_KIT = 21, P_ROAD = 31;

// Numeric surface normal for the loft. An analytic one exists but the superellipse exponent is
// itself a function of t, so the derivative is three terms of chain rule for a shape that is
// generated once at boot; a central difference is the same answer for none of the risk.
const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _d = [0, 0, 0], _o = [0, 0, 0];
function hullNormal(t, k, out) {
  const h = 0.004, hk = 0.06;
  station(clamp(t + h, 0, 1), k, _a); station(clamp(t - h, 0, 1), k, _b);
  station(t, k + hk, _c); station(t, k - hk, _d);
  const ux = _a[0] - _b[0], uy = _a[1] - _b[1], uz = _a[2] - _b[2];
  const vx = _c[0] - _d[0], vy = _c[1] - _d[1], vz = _c[2] - _d[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  // Outward test against the radial direction from the section's own centre.
  station(t, k, _o);
  const cy = (HULL.up(t) - HULL.dn(t)) * 0.5;
  if (nx * _o[0] + ny * (_o[1] - cy) < 0) { nx = -nx; ny = -ny; nz = -nz; }
  out[0] = nx; out[1] = ny; out[2] = nz;
  return out;
}

// §5.4's edge rule runs "along the hull chine, t 0.25→0.85". The CHINE is the widest line of the
// section (theta = 0 and pi), so `aChine` marks those two vertices and the fragment raises it to a
// power to tighten the interpolated band into a hairline. The 0.25→0.85 SPAN is deliberately NOT
// baked here: it is per-instance (`iTrimK`), which is what makes "some vehicles have only partial
// trim, some none at all" a colour attribute rather than a second geometry.
// RING = 12, so k is theta in 30-degree steps: 0 = +x (widest), 3 = top, 6 = -x, 9 = bottom.
//   A  k 1, 5    the UPPER SHOULDER line
//   B  k 7, 11   the LOWER SHOULDER — the keel line, which is what an underglow runs along
//   C  k 3       the SPINE, the top centreline
//
// k = 1 and 5 rather than k = 0 and 6: the widest line is the true chine and is where §5.4 puts
// the edge rule, but from the chase camera and from every angle the player actually sees a craft
// from, the widest line is exactly the silhouette edge and the trim disappears into it. The
// shoulder reads from above, from the side, and in the `1939970_00` framing.
//
// Three channels rather than one because Aaron asked for "lights highlighting some edges that
// could be varied per vehicle" — the variation has to be in WHICH edge, not only in its colour,
// and a per-instance mode picking among three baked channels costs no geometry at all.
function edgeAt(k) {
  return [(k === 1 || k === 5) ? 1 : 0, (k === 7 || k === 11) ? 1 : 0, (k === 3) ? 1 : 0];
}

function buildBody() {
  const m = new Mesh();
  const nrm = [0, 0, 0];
  const P = [], N = [], C = [];
  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    P.push([]); N.push([]); C.push([]);
    for (let k = 0; k < RING; k++) {
      P[i].push(station(t, k, [0, 0, 0]).slice());
      N[i].push(hullNormal(t, k, [0, 0, 0]).slice());
      C[i].push(edgeAt(k));
    }
  }
  // The lofted skin, smooth-shaded from the analytic normals.
  const push = (i, k) => m.vert(P[i][k][0], P[i][k][1], P[i][k][2],
    N[i][k][0], N[i][k][1], N[i][k][2], P_ALWAYS, C[i][k], i / (STATIONS - 1));
  for (let i = 0; i < STATIONS - 1; i++) {
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      push(i, k); push(i + 1, k); push(i + 1, k2);
      push(i, k); push(i + 1, k2); push(i, k2);
    }
  }
  // Flat caps. Their own copies of the ring, so the cap's -Z/+Z normal never bleeds into the skin.
  for (const [i, sgn] of [[0, -1], [STATIONS - 1, 1]]) {
    m.tMark = i / (STATIONS - 1);
    const cy = (HULL.up(i / (STATIONS - 1)) - HULL.dn(i / (STATIONS - 1))) * 0.5;
    const ctr = [0, cy, P[i][0][2]];
    for (let k = 0; k < RING; k++) {
      const k2 = (k + 1) % RING;
      if (sgn < 0) m.tri(ctr, P[i][k2], P[i][k], P_ALWAYS);
      else m.tri(ctr, P[i][k], P[i][k2], P_ALWAYS);
    }
  }

  // §5.1's belly plate — a flat underside panel, 16 tris, which is also what stops the hull
  // reading as a lozenge from below and gives the belly strobe something to sit on.
  {
    const t0 = 0.34, t1 = 0.80, y = -HULL.dn(0.6) * 0.97;
    for (let s = 0; s < 4; s++) {
      const ta = t0 + (t1 - t0) * (s / 4), tb = t0 + (t1 - t0) * ((s + 1) / 4);
      m.tMark = (ta + tb) * 0.5;
      const wa = HULL.halfW(ta) * 0.52, wb = HULL.halfW(tb) * 0.52;
      const ya = -HULL.dn(ta) * 0.97, yb = -HULL.dn(tb) * 0.97;
      m.quad([-wa, ya, ta - 0.5], [wa, ya, ta - 0.5], [wb, yb, tb - 0.5], [-wb, yb, tb - 0.5], P_ALWAYS);
      m.quad([-wb, yb + 0.001, tb - 0.5], [wb, yb + 0.001, tb - 0.5],
        [wa, ya + 0.001, ta - 0.5], [-wa, ya + 0.001, ta - 0.5], P_ALWAYS);
    }
    void y;
  }

  for (let s = 0; s < 4; s++) { m.tMark = NACELLE[s].t; pod(m, NACELLE[s], P_NAC + s); }
  for (let s = 0; s < 2; s++) { m.tMark = FIN[s].t; fin(m, FIN[s], P_FIN + s); }
  buildKits(m);
  buildRoadForms(m);
  m.tMark = 0.5; m.eMark = [0, 0, 0];
  return m.geometry();
}

// An axis-aligned box in unit-hull space, 12 tris, with `t` written per face from the face's own
// z so a trim run and the window band both track length rather than the whole box taking one t.
function box(m, x0, y0, z0, x1, y1, z1, part) {
  const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y1, z0], D = [x0, y1, z0];
  const E = [x0, y0, z1], F = [x1, y0, z1], G = [x1, y1, z1], H = [x0, y1, z1];
  const tz = z => z + 0.5;
  const mid = (tz(z0) + tz(z1)) * 0.5;
  m.tMark = tz(z0); m.quad(B, A, D, C, part);          // -z end (nose)
  m.tMark = tz(z1); m.quad(E, F, G, H, part);          // +z end (tail)
  m.tMark = mid;
  m.quad(A, E, H, D, part);                            // -x flank
  m.quad(F, B, C, G, part);                            // +x flank
  m.quad(D, H, G, C, part);                            // roof
  m.quad(A, B, F, E, part);                            // floor
}

// A thin lit STRIP: one marked quad, running along z, carrying an edge channel.
//
// TWO renders forced this into existence and both are worth keeping.
//
// 1. The first cut marked whole box FACES with an edge channel and came back with a bus whose
//    entire roof was a slab of solid orange and a sponson that was a bar of neon. The chine term
//    is `pow(edge, 2.2) * 4.2 * RIM_DIM` — on the loft that is a hairline, because the value
//    interpolates from 1 at two vertices to 0 at their neighbours, but on a marked face every
//    fragment reads 1 and the "edge light" becomes a coat of paint. An edge light on a FLAT form
//    has to be an actual thin piece of geometry.
// 2. The second cut emitted each strip twice with opposite winding so it would be visible from
//    either side, and shots/s2c/bus_close.png came back with the roofline as a dotted line of red
//    specks — two coincident planes z-fighting, which at a glance reads as aliasing and is not.
//    So a strip faces ONE way and the caller says which.
function stripUp(m, x0, x1, y, z0, z1, e, part) {      // a rail on a roofline, facing +y
  m.eMark = e;
  m.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], part);
  m.eMark = [0, 0, 0];
}

function stripSide(m, x, sgn, y0, y1, z0, z1, e, part) {   // a band on a flank, facing sgn * x
  m.eMark = e;
  const A = [x, y0, z0], B = [x, y0, z1], C = [x, y1, z1], D = [x, y1, z0];
  if (sgn > 0) m.quad(D, C, B, A, part); else m.quad(A, B, C, D, part);
  m.eMark = [0, 0, 0];
}

// ── the flying module kits (§S2-C) ─────────────────────────────────────────
//
// Three bolt-on groups, each authored in the same normalised hull coordinates the light rig uses,
// so a kit sits on the skin of a 4.8 m pod and a 10.5 m freighter without a per-craft number. The
// point of them is SILHOUETTE: `hauler_ai` with a cargo stack and `taxi_ai` without are two
// different shapes in the same lane, which is what "no variation" was asking for.
function buildKits(m) {
  // kit 1 — a dorsal spine rail. A long low ridge along the crown, marked on the spine channel so
  // a craft whose edge mode is `spine` lights the rail rather than the hull under it.
  {
    const t0 = 0.30, t1 = 0.92;
    const y0 = HULL.up(0.55) * 0.96, y1 = y0 + 0.055;
    box(m, -0.055, y0, t0 - 0.5, 0.055, y1, t1 - 0.5, P_KIT + 0);
    // two ribs, so the rail is a fitting and not an extrusion
    for (const t of [0.44, 0.72]) box(m, -0.10, y0 - 0.01, t - 0.5 - 0.012, 0.10, y0 + 0.03, t - 0.5 + 0.012, P_KIT + 0);
    // the rail's own light line, on the spine channel
    m.tMark = 0.6;
    stripUp(m, -0.048, 0.048, y1 + 0.004, t0 - 0.48, t1 - 0.52, [0, 0, 1], P_KIT + 0);
  }
  // kit 2 — flank sponsons. Two tapered outriggers low on the sides: the mid-body gets wider than
  // the loft ever goes, which is the one thing a non-uniform scale cannot produce.
  {
    const t0 = 0.34, t1 = 0.86;
    for (const s of [-1, 1]) {
      const xa = s * HULL.halfW(0.6) * 1.00, xb = s * HULL.halfW(0.6) * 1.42;
      const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
      box(m, lo, -0.055, t0 - 0.5, hi, 0.055, t1 - 0.5, P_KIT + 1);
      // a nose fairing on each, so the pod does not end in a flat wall
      box(m, lo + 0.01, -0.030, t0 - 0.5 - 0.055, hi - 0.01, 0.030, t0 - 0.5, P_KIT + 1);
      // a light line along the sponson's outer shoulder
      m.tMark = 0.6;
      const xe = s > 0 ? hi : lo;
      stripUp(m, xe - 0.012, xe + 0.012, 0.058, t0 - 0.48, t1 - 0.52, [1, 0, 0], P_KIT + 1);
    }
  }
  // kit 3 — the cargo stack. A boxy container sitting proud of the spine: this is the freighter
  // read, and it is the strongest silhouette change in the set.
  {
    const y0 = HULL.up(0.62) * 0.92, y1 = y0 + 0.30;
    box(m, -0.20, y0, -0.10, 0.20, y1, 0.34, P_KIT + 2);
    // banding straps, and a smaller second container forward — an uneven stack reads as cargo
    for (const t of [0.02, 0.22]) box(m, -0.215, y0 + 0.04, t - 0.014, 0.215, y0 + 0.09, t + 0.014, P_KIT + 2);
    box(m, -0.13, y0, -0.30, 0.13, y0 + 0.17, -0.12, P_KIT + 2);
    // a marker line along the container's top edge
    m.tMark = 0.75;
    stripUp(m, -0.19, 0.19, y1 + 0.004, -0.08, 0.32, [0, 0, 1], P_KIT + 2);
  }
}

// ── the road transports (§S2-C) ────────────────────────────────────────────
//
// Authored in a UNIT BOX — x, y, z all in [-0.5, 0.5] — and scaled by the def's (W, H, L), so
// y = -0.5 is the road surface and the pose only has to place the vehicle at y = H/2. Nothing
// about the loft is involved: `road > 0` collapses the hull, its nacelles and its fins, and one
// of these three is raised instead.
//
// Each form is a complete vehicle over the whole unit length, not a segment, because the three
// are EXCLUSIVE rather than nested — see the aPart note above. The cost of that choice is the two
// unused forms riding along as degenerate triangles on every instance, which is the same bargain
// the four nacelles have always taken.
function buildRoadForms(m) {
  const WIN = [0, 0, 1];               // the spine channel, reused as the lit-window mask

  // One carriage: a body, a chamfered roof cap, a lit window band down each flank, a skirt, and
  // a light line where the roof cap meets the body — the shoulder of a bus.
  const carriage = (z0, z1, part, cab) => {
    const hw = 0.5, hy0 = -0.34, hy1 = 0.40;
    m.eMark = [0, 0, 0];
    box(m, -hw, hy0, z0, hw, hy1, z1, part);
    // the skirt: inset and darker-reading because it is a separate face at a different angle
    box(m, -hw * 0.90, -0.50, z0 + 0.004, hw * 0.90, hy0, z1 - 0.004, part);
    // roof cap, narrower — the chamfer that stops the box being a box
    box(m, -hw * 0.86, hy1, z0 + 0.006, hw * 0.86, 0.50, z1 - 0.006, part);
    m.tMark = 0.5;
    for (const sg of [-1, 1]) {
      // the ledge where the roof cap steps in from the body — a real 18 cm shoulder rail, seen
      // from above, which is the angle the player looks at a street from
      const xe = sg * hw * 0.93;
      stripUp(m, xe - 0.035, xe + 0.035, hy1 + 0.006, z0 + 0.02, z1 - 0.02, [1, 0, 0], part);
      // and a keel band on the flank above the skirt, seen from the side
      stripSide(m, sg * (hw + 0.006), sg, hy0 - 0.012, hy0 + 0.028, z0 + 0.02, z1 - 0.02,
        [0, 1, 0], part);
    }
    // the window band: two thin quads proud of each flank, marked on the window channel
    m.eMark = WIN;
    const wy0 = 0.02, wy1 = 0.34, xo = hw + 0.004;
    const za = z0 + (cab ? 0.055 : 0.012), zb = z1 - 0.012;
    for (const s of [-1, 1]) {
      const x = s * xo;
      const A = [x, wy0, za], B = [x, wy0, zb], C = [x, wy1, zb], D = [x, wy1, za];
      // Wound so the outward normal is the flank's own: A,B,C,D faces -x, the reverse faces +x.
      if (s > 0) m.quad(D, C, B, A, part); else m.quad(A, B, C, D, part);
      // The band has to carry the LENGTH coordinate per vertex or every pane shares one `t` and
      // the per-window hash in the shader lights the whole strip identically. quad() emits
      // A,B,C then A,C,D, and both windings above put za/zb in the same six slots.
      const n = m.t.length;
      const order = [za, zb, zb, za, zb, za];
      for (let i = 0; i < 6; i++) m.t[n - 6 + i] = order[i] + 0.5;
    }
    m.eMark = [0, 0, 0];
  };

  // A concertina joint: narrower and shorter than the carriages either side, so an articulated
  // vehicle visibly bends there. One box — three ribs were 36 tris of detail invisible at 60 m.
  const joint = (zc, part) => {
    m.eMark = [0, 0, 0];
    box(m, -0.42, -0.28, zc - 0.030, 0.42, 0.34, zc + 0.030, part);
  };

  // form 1 — a bus. One carriage over the whole length, a cab front.
  carriage(-0.5, 0.5, P_ROAD + 0, true);

  // form 2 — an articulated bus: two carriages and a joint at the middle.
  carriage(-0.5, -0.03, P_ROAD + 1, true);
  joint(0.0, P_ROAD + 1);
  carriage(0.03, 0.5, P_ROAD + 1, false);

  // form 3 — a tram / long transport: three carriages, two joints and a full-length roof rail,
  // which is the pantograph read even though nothing is drawn above it.
  carriage(-0.5, -0.19, P_ROAD + 2, true);
  joint(-0.17, P_ROAD + 2);
  carriage(-0.15, 0.15, P_ROAD + 2, false);
  joint(0.17, P_ROAD + 2);
  carriage(0.19, 0.5, P_ROAD + 2, false);
  box(m, -0.05, 0.50, -0.44, 0.05, 0.54, 0.44, P_ROAD + 2);
  m.eMark = [0, 0, 0];
}

// §5.4's rig and the nacelle placements share one convention: positions are given as a station `t`
// plus fractions of the LOCAL half-width and half-height at that station, so a light or a pod
// authored once sits on the surface of every craft in the family — which is precisely §5.4's
// "authored once in normalised hull coordinates and scaled by that craft's L/W/H".
const NACELLE = [
  { t: 0.64, fx: -1.05, fy: -0.22, r: 0.055, len: 0.30 },
  { t: 0.64, fx: 1.05, fy: -0.22, r: 0.055, len: 0.30 },
  { t: 0.78, fx: -1.55, fy: 0.28, r: 0.048, len: 0.26 },
  { t: 0.78, fx: 1.55, fy: 0.28, r: 0.048, len: 0.26 },
];

const FIN = [
  { t: 0.86, fx: 0, fy: 1.0, h: 0.16, len: 0.20, sweep: 0.09, thick: 0.012 },
  { t: 0.88, fx: 0, fy: -1.0, h: -0.11, len: 0.15, sweep: 0.06, thick: 0.012 },
];

export function localAt(t, fx, fy) {
  const y = fy >= 0 ? HULL.up(t) * fy : HULL.dn(t) * fy;
  return [HULL.halfW(t) * fx, y, t - 0.5];
}

// The road forms' equivalent: a unit BOX, so nothing tapers and a headlamp at fx = -0.74 sits at
// 0.74 of the half-width whatever the vehicle's length.
export function boxAt(t, fx, fy) { return [0.5 * fx, 0.5 * fy, t - 0.5]; }

// A nacelle pod: a 6-sided tube with both ends capped. 6*2*2 + 2*6 = 36 tris.
function pod(m, d, part) {
  const [cx, cy, cz] = localAt(d.t, d.fx, d.fy);
  const S = 6;
  const ring = (z, r) => {
    const out = [];
    for (let k = 0; k < S; k++) {
      const a = (k / S) * Math.PI * 2 + Math.PI / S;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
    }
    return out;
  };
  const zA = cz - d.len * 0.5, zB = cz + d.len * 0.5;
  const A = ring(zA, d.r * 0.72), B = ring(zB, d.r);
  for (let k = 0; k < S; k++) {
    const k2 = (k + 1) % S;
    m.quad(A[k], A[k2], B[k2], B[k], part);
  }
  const fa = [cx, cy, zA - d.r * 0.5], fb = [cx, cy, zB];
  for (let k = 0; k < S; k++) {
    const k2 = (k + 1) % S;
    m.tri(fa, A[k2], A[k], part);
    m.tri(fb, B[k], B[k2], part);
  }
}

// A fin: a swept plate, 12 tris. `h` is signed so slot 2 hangs below as a ventral strake.
function fin(m, d, part) {
  const [cx, cy, cz] = localAt(d.t, d.fx, d.fy);
  const th = d.thick;
  const root = [[cx, cy, cz - d.len * 0.5], [cx, cy, cz + d.len * 0.5]];
  const tip = [[cx, cy + d.h, cz - d.len * 0.5 + d.sweep], [cx, cy + d.h, cz + d.len * 0.5]];
  for (const s of [-1, 1]) {
    const o = th * s;
    if (s > 0) m.quad([root[0][0] + o, root[0][1], root[0][2]], [root[1][0] + o, root[1][1], root[1][2]],
      [tip[1][0] + o, tip[1][1], tip[1][2]], [tip[0][0] + o, tip[0][1], tip[0][2]], part);
    else m.quad([tip[0][0] + o, tip[0][1], tip[0][2]], [tip[1][0] + o, tip[1][1], tip[1][2]],
      [root[1][0] + o, root[1][1], root[1][2]], [root[0][0] + o, root[0][1], root[0][2]], part);
  }
  // leading and trailing edges
  m.quad([root[0][0] - th, root[0][1], root[0][2]], [tip[0][0] - th, tip[0][1], tip[0][2]],
    [tip[0][0] + th, tip[0][1], tip[0][2]], [root[0][0] + th, root[0][1], root[0][2]], part);
  m.quad([root[1][0] + th, root[1][1], root[1][2]], [tip[1][0] + th, tip[1][1], tip[1][2]],
    [tip[1][0] - th, tip[1][1], tip[1][2]], [root[1][0] - th, root[1][1], root[1][2]], part);
}

// §5.1's canopy cap — the clipped superellipse over the bulge, floated 1.5 % proud so it reads as
// glass ON the hull rather than glass coincident with it (z-fighting on a 6 m craft at 200 m is a
// crawling shimmer, and it is exactly the sort of thing a critic writes down as "Finish").
function buildCanopy() {
  const m = new Mesh();
  const T0 = 0.26, T1 = 0.64, NS = 6, NR = 7;
  const grid = [];
  for (let i = 0; i <= NS; i++) {
    const t = T0 + (T1 - T0) * (i / NS);
    m.tMark = t;
    const row = [];
    for (let k = 0; k <= NR; k++) {
      const th = Math.PI * (k / NR);
      const e = 2 / HULL.n(t);
      const c = Math.cos(th), s = Math.sin(th);
      const sw = 1.028, sh = 1.030;
      row.push([
        HULL.halfW(t) * sw * Math.sign(c) * Math.pow(Math.abs(c), e),
        HULL.up(t) * sh * Math.pow(Math.abs(s), e),
        t - 0.5,
      ]);
    }
    grid.push(row);
  }
  for (let i = 0; i < NS; i++) {
    for (let k = 0; k < NR; k++) {
      m.quad(grid[i][k], grid[i][k + 1], grid[i + 1][k + 1], grid[i + 1][k], P_ALWAYS);
    }
  }
  return m.geometry();
}

// A 6-sided cone, nozzle ring at z = 0 and apex at z = 1, so the instance matrix's z scale IS the
// plume length in metres and a NEGATIVE z scale turns the same 12 triangles into a forward lamp
// cone. DoubleSide + forceSinglePass is what makes the flipped winding legal at no extra draw.
function buildCone() {
  const m = new Mesh();
  const S = 6, R = 0.5;
  const ring = [];
  for (let k = 0; k < S; k++) {
    const a = (k / S) * Math.PI * 2;
    ring.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
  }
  const apex = [0, 0, 1], ctr = [0, 0, 0];
  for (let k = 0; k < S; k++) {
    const k2 = (k + 1) % S;
    m.tri(ring[k], ring[k2], apex, P_ALWAYS);
    m.tri(ctr, ring[k2], ring[k], P_ALWAYS);
  }
  return m.geometry();
}

// ── materials (§5.3, §5.4, §3.7c) ──────────────────────────────────────────

const BODY_VERT_DECL = /* glsl */`
attribute float aPart;
attribute vec4 aCT;          // x shoulder, y station t, z keel, w spine (road: lit window band)
attribute vec4 iTint;         // rgb body colour, w throttle
attribute vec4 iRim;         // rgb trim colour, w trim amount
attribute vec4 iOpt;         // x nacelles, y fins, z trim t0, w trim t1
attribute vec4 iVar;         // x kit, y road form, z edge mode, w edge pulse rate
varying vec3 vTint;
varying vec3 vRim;
varying vec4 vMix;           // x edge mask, y station t, z trim strength, w lit-window mask
varying vec3 vThr;           // x throttle, y road flag, z pulse rate
`;

// The part collapse and §5.1's integer options — three when this shipped, five now. `step(a,b)`
// is 1 when b >= a, so nacelle slot 3 survives only on a craft whose iOpt.x is 4; the kit and
// road slots use `step(abs(diff), 0.5)` instead, which is an EQUALITY and not a threshold.
const BODY_VERT_BODY = /* glsl */`
#include <begin_vertex>
  vTint = iTint.rgb;
  vRim = iRim.rgb;
  float road = step( 0.5, iVar.y );
  vThr = vec3( iTint.w, road, iVar.w );
  // Which EDGE this vehicle lights, per instance. Six modes over three baked channels; the weights
  // are equality tests rather than a branch so every craft compiles to the same instruction path.
  float em = iVar.z;
  float wS = step( abs( em ), 0.5 ) + step( abs( em - 1.0 ), 0.5 ) + step( abs( em - 4.0 ), 0.5 );
  float wK = step( abs( em - 2.0 ), 0.5 ) + step( abs( em - 4.0 ), 0.5 ) + step( abs( em - 5.0 ), 0.5 );
  float wP = step( abs( em - 1.0 ), 0.5 ) + step( abs( em - 3.0 ), 0.5 ) + step( abs( em - 5.0 ), 0.5 );
  // vMix.z is the trim RUN, per instance: its amount and the station span it covers. An amount of
  // 0 is a craft with no trim at all, which is as much a part of the variety as any colour.
  vMix = vec4(
    wS * aCT.x + wK * aCT.z + ( 1.0 - road ) * wP * aCT.w,
    aCT.y,
    iRim.w * smoothstep( iOpt.z, iOpt.z + 0.07, aCT.y )
      * ( 1.0 - smoothstep( iOpt.w - 0.07, iOpt.w, aCT.y ) ),
    road * aCT.w );
  {
    float keep;
    if ( aPart > 30.5 ) keep = step( abs( aPart - 30.0 - iVar.y ), 0.5 );
    else if ( aPart > 20.5 ) keep = ( 1.0 - road ) * step( abs( aPart - 20.0 - iVar.x ), 0.5 );
    else if ( aPart > 10.5 ) keep = ( 1.0 - road ) * step( aPart - 10.0, iOpt.y );
    else if ( aPart > 0.5 ) keep = ( 1.0 - road ) * step( aPart, iOpt.x );
    else keep = 1.0 - road;
    transformed *= keep;
  }
`;


// ── the reflection, which is the whole point of S2-C ───────────────────────
//
// Aaron, on the shipped build: "I am not seeing one of the main goals of making them look
// reflective/glassy/futuristic atm." He is right, and the reason is written in this file's own
// comment three screens down: "our env is a smooth sky bake, so any roughness gives a smooth
// WASH". A wash is not a reflection. What makes a black lacquered surface read as lacquer is
// STRUCTURE in what it reflects — a hard bright edge that slides across the panel as the object
// turns — and a PMREM of a four-stop sky gradient contains no edges at all.
//
// A real probe is a second scene render and is not happening on a phone. So the city is
// RECONSTRUCTED from the reflection direction: vertical slabs of window light around the horizon,
// a rarer saturated sign among them, warm sodium below. Cost is about thirty ALU on the few
// hundred pixels a craft covers — no texture fetch, no render target, no draw call, and it is a
// uniform away from zero on a weak phone.
//
// The world-position term is the load-bearing half. Without it the slabs are a fixed pattern in
// world direction and the reflection only moves when the craft turns; with it, flying two blocks
// north changes which slab a given direction picks up, which is what "a sign going past" is.
const CITY_REFL = /* glsl */`
uniform vec4 uCity;          // x intensity, y reflection floor at normal incidence, z sign gain, w scale

vec3 cityRefl( vec3 d, vec2 wp ) {
  float el = d.y;
  float u = atan( d.z, d.x ) * 2.5464 + dot( wp, vec2( 0.0090 ) );   // 8/PI -> 16 slabs a turn
  float i = floor( u ), f = fract( u );
  float h = fract( sin( i * 127.1 + 11.7 ) * 43758.5453 );
  float h2 = fract( h * 197.3 );
  float wd = 0.09 + 0.22 * h2;
  // The gaps matter more than the slabs. A first cut fired a slab 66 % of the time over a broad
  // elevation band, and the render came back with nine chrome craft: fill the reflection and it
  // is a wash again, just an expensive one. Half the directions must return nothing.
  float slab = smoothstep( wd + 0.07, wd, abs( f - 0.5 ) ) * step( 0.52, h );
  // The towers occupy a wedge of elevation and the sky above them is the real envMap's job.
  float band = exp( -el * el * 44.0 ) * step( -0.30, el );
  // Window rows inside the slab. Deliberately low contrast: the reflection direction sweeps fast
  // across a curved hull, and a high-contrast row pattern turns into a moire the moment it does.
  float rows = 0.72 + 0.28 * sin( el * 46.0 + h * 30.0 );
  vec3 col = mix( vec3( 1.00, 0.62, 0.26 ), vec3( 0.36, 0.72, 1.00 ), h2 );
  // The rarer, brighter, saturated one — a sign rather than a window grid. This is the term that
  // actually reads as a reflection when it slides across the crown.
  float sgn = step( 0.86, h ) * smoothstep( 0.30, 0.10, abs( f - 0.5 ) ) * exp( -el * el * 90.0 );
  vec3 sgnCol = mix( vec3( 1.0, 0.14, 0.52 ), vec3( 0.20, 0.95, 1.0 ), fract( h * 53.7 ) );
  float street = smoothstep( -0.10, -0.55, el );
  return col * ( slab * band * rows ) + sgnCol * ( sgn * uCity.z )
    + vec3( 1.0, 0.55, 0.22 ) * ( street * 0.09 );
}
`;

const BODY_FRAG_DECL = /* glsl */`
varying vec3 vTint;
varying vec3 vRim;
varying vec4 vMix;
varying vec3 vThr;
uniform float uRimAmt;
uniform vec3 uEngine;
uniform float uChineAmt;
uniform float uPanels;
uniform float uKey;
uniform float uTime;
uniform vec3 uWindow;
` + CITY_REFL;

// Panel lines, per pixel and not per polygon. A single smooth reflective lozenge reads as a bar of
// soap however good the material is; seven bands of slightly different roughness break the
// reflection up so it reads as panelled bodywork, and a dark line at each band edge is the seam.
// Costs one fract, no texture, no tris, and it is the only "close-up detail" lever that does not
// touch the instancing architecture.
const BODY_ROUGH_BODY = /* glsl */`
#include <roughnessmap_fragment>
  {
    float band = floor( vMix.y * 7.0 );
    float bh = fract( sin( band * 12.9898 + 4.1 ) * 43758.5453 );
    roughnessFactor *= mix( 1.0, 0.62 + 0.85 * bh, uPanels );
  }
`;

// Everything the hull adds on top of the standard shading, in one injection before
// <opaque_fragment>. `geometryViewDir` and `geometryNormal` are the r155+ names and are in scope
// there — both verified in this repo by patchGlass, which has been shipping since P1a.
//
// §3.7(c)'s fresnel rim and §5.4's edge rule are driven by the craft's OWN trim colour rather than
// by a fleet-wide district tint. That is the whole of Aaron's "different trim colours, and some cars
// may only have partial trim": a craft whose trim amount is 0 gets neither term, and reads as pure
// black bodywork carrying nothing but its reflections and its lights — which is also a look the
// brief asks for. Both terms scale with `vMix.z`, so absence is genuinely absence.
const BODY_FRAG_BODY = /* glsl */`
  // A HARD specular break, which is the single thing every round-6 critic named as the reason the
  // hull read as "a matte vinyl decal" rather than lacquered metal: "it needs a narrow, near-clipped
  // highlight running the length of the dorsal crown". The envMap cannot supply one — our env is a
  // smooth sky bake, so any roughness gives a smooth WASH and turning it up just makes the whole
  // hull the colour of the sky (which is how the first three passes ended up with red craft). So the
  // break comes from a fixed virtual key at a high exponent: bright, narrow, and — because it is
  // additive on top of a near-black albedo — it lights the crown and nothing else.
  vec3 vRefl = reflect( -geometryViewDir, geometryNormal );
  vec3 kL = normalize( vec3( -0.35, 0.86, 0.37 ) );
  float kSpec = pow( saturate( dot( vRefl, kL ) ), 420.0 );
  outgoingLight += vec3( 0.72, 0.78, 0.92 ) * kSpec * uKey;
  float nv = saturate( dot( geometryNormal, geometryViewDir ) );
  // The city, in the paint. Fresnel-weighted, because a dielectric clear coat over a black base
  // reflects a few per cent head-on and nearly everything at a grazing angle — which is exactly
  // why the reflection lands as a bright rim around the silhouette and a slide across the crown
  // rather than as a uniform coat, and why it does not turn a near-black hull into a grey one.
  {
    vec3 wR = inverseTransformDirection( vRefl, viewMatrix );
    float fr = mix( uCity.y, 1.0, pow( 1.0 - nv, 3.6 ) );
    outgoingLight += cityRefl( wR, vWorldPosition.xz * uCity.w ) * ( uCity.x * fr );
  }
  float cRim = pow( 1.0 - nv, 3.4 );
  outgoingLight += vRim * cRim * uRimAmt * saturate( vMix.z );
  // §5.4's edge rule, now on WHICH edge and with an optional travelling bead. A craft with
  // vThr.z = 0 is the steady run this shipped with; the rest carry a chaser, which is the
  // cheapest thing in the file that reads as "powered" rather than "painted".
  float pulse = mix( 1.0,
    0.30 + 0.95 * ( 0.5 + 0.5 * sin( ( vMix.y * 3.0 - uTime * vThr.z ) * 6.2832 ) ),
    step( 0.01, vThr.z ) );
  outgoingLight += vRim * pow( saturate( vMix.x ), 2.2 ) * uChineAmt * saturate( vMix.z ) * pulse;
  // A road transport's lit window band. Per-pane, hashed off the length coordinate, so some panes
  // are dark and the strip reads as a vehicle with people in it rather than as a light bar.
  {
    float pane = floor( vMix.y * 22.0 );
    float lit = 0.30 + 0.70 * step( 0.34, fract( sin( pane * 91.7 + 3.1 ) * 4375.85 ) );
    outgoingLight += uWindow * ( saturate( vMix.w ) * lit );
  }
  // The plume's own light on the hull it is bolted to. Not a real light — a station-space wash over
  // the aft third, scaled by throttle — but it is the difference between "three plasma torches under
  // a black shell" and a craft whose engines are attached to it.
  outgoingLight += uEngine * smoothstep( 0.52, 0.98, vMix.y ) * vThr.x * 0.5 * ( 1.0 - vThr.y );
  {
    float e = abs( fract( vMix.y * 7.0 ) - 0.5 ) * 2.0;
    outgoingLight *= mix( 1.0, mix( 1.0, 0.45, smoothstep( 0.88, 1.0, e ) ), uPanels );
  }
#include <opaque_fragment>
`;

// §3.7(c)'s `outgoingLight += uRim * f * 0.55` is kept verbatim — but `uRim` there is "the local
// district's neon tint", and the tint handed in is a FULL-INTENSITY neon (0xff2d3a, 0x35e6ff …).
// On a §5.3 hull whose albedo is 0x0a0b0e — 0.003 in linear — a 0.55 rim of pure red is two
// hundred times the surface's own reflectance, and the first contact sheet came back with nine
// tomato-red craft. So the COLOUR is dimmed on the way in (`RIM_DIM`, the same trick patchGlass
// already uses at 0.14) and the amplitude stays at the plan's number.
export const RIM_DIM = 0.13;

export const CRAFT_U = {
  // §3.7(c)'s own number, kept — it is the COLOUR that had to be dimmed (RIM_DIM above), not the
  // amplitude. Peak contribution is 0.55 x 0.13 = 0.07 of a neon at full grazing, which is an edge
  // and not a coat of paint.
  uRimAmt: { value: 0.55 },
  // The shoulder line. A hairline at 4.2 x 0.13 = 0.55 peak, tightened by pow(x, 2.2) so it stays a
  // stroke rather than a band.
  uChineAmt: { value: 4.2 },
  uPanels: { value: 1 },
  uKey: { value: 0.60 },
  // §5.4's thruster cyan, in linear. One colour for the whole fleet, because §5.4's rig is shared.
  uEngine: { value: new THREE.Color(0x35d6e8).convertSRGBToLinear().multiplyScalar(0.16) },
  // S2-C's procedural city reflection. `x` is the master amplitude and is what a gate drives to
  // zero to prove the term is doing the work; `y` is the reflection surviving at normal incidence
  // (a clear coat is ~4 % head-on, and 0.14 here is that plus a little licence because the hull
  // has to read at all from directly behind); `z` is the sign gain; `w` scales the world-position
  // term — 1.0 means the reflection changes over roughly a 110 m block, which is the pitch that
  // makes a craft crossing a junction pick up a different sign.
  uCity: { value: new THREE.Vector4(0.46, 0.07, 2.2, 1.0) },
  // A road transport's interior, warm and dim: it is seen through glass from 60 m up.
  uWindow: { value: new THREE.Color(0xffd7a0).convertSRGBToLinear().multiplyScalar(0.42) },
  // The canopy takes the same city at 3.4x the hull's gain — it is glass over a cabin, not clear
  // coat over black paint — and its alpha runs from nearly clear head-on to nearly opaque at the
  // grazing angle where a real windscreen becomes a mirror.
  uGlassRefl: { value: 3.4 },
  uGlassA: { value: new THREE.Vector2(0.24, 0.92) },
};

// The one lever the quality preset would want if the measurement said the reflection is too
// expensive on a weak phone. It is a uniform, so it is also how a gate falsifies the term.
export function setCityRefl(amount) {
  const p = CRAFT_U.uCity.value.x;
  CRAFT_U.uCity.value.x = +amount;
  return p;
}

function addPatch(mat, tag, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { prev?.call(mat, sh, r); fn(sh, r); };
  mat.userData.patches = (mat.userData.patches || []).concat(tag);
  const key = mat.type + '|' + mat.userData.patches.join(',');
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

// §5.3's ONE hull material, shared by every craft in the game.
export function bodyMaterial(env) {
  const m = new THREE.MeshStandardMaterial({
    // §5.3 SAYS `metalness: 0.92, roughness: 0.16`, and taken together with its own
    // `color: 0x0a0b0e` that recipe cannot work. A METAL's F0 IS ITS ALBEDO, so a 0.003-linear
    // metal reflects 0.3 % of the city and renders as a matte black blob — the exact opposite of
    // the brief's "some reflective surfaces", and the reason the first contact sheet had nothing
    // on it but §3.7(c)'s rim.
    //
    // Black car paint is a DIELECTRIC over a dark base: F0 = 0.04, white, and sharp. So the tint
    // stays as dark as §5.3 wants (darker, in most of BODY_TINTS) and the metalness drops to 0.30,
    // which puts F0 at mix(0.04, ~0.005, 0.30) ≈ 0.030 — a real 3 % specular for the neon to land
    // on, while the diffuse term stays black. Roughness drops to 0.10 because a blurred reflection
    // of a fog gradient is a wash, and what makes a black hull exciting in a black city is a SHARP
    // reflection of a sign going past.
    //
    // This is a deviation from §5.3's numbers and is reported to the manager as a plan defect.
    // `tools/gates_p5.mjs` proves the reflection is real by detaching the envMap and measuring the
    // hull go dark — P3b's `groundMaterial` shipped a roughness map that was really an albedo
    // channel, and "it has an envMap assigned" is not evidence that anything is reflecting.
    color: 0xffffff, metalness: 0.30, roughness: 0.11,
    envMap: env || null, envMapIntensity: 0.62, fog: true,
  });
  addPatch(m, 'craft:body', sh => {
    sh.uniforms.uRimAmt = CRAFT_U.uRimAmt;
    sh.uniforms.uChineAmt = CRAFT_U.uChineAmt;
    sh.uniforms.uPanels = CRAFT_U.uPanels;
    sh.uniforms.uKey = CRAFT_U.uKey;
    sh.uniforms.uEngine = CRAFT_U.uEngine;
    sh.uniforms.uCity = CRAFT_U.uCity;
    sh.uniforms.uWindow = CRAFT_U.uWindow;
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = patch(sh.vertexShader, '#include <common>',
      '#include <common>' + BODY_VERT_DECL, 'craft/body-vert-decl');
    sh.vertexShader = patch(sh.vertexShader, '#include <begin_vertex>',
      BODY_VERT_BODY, 'craft/body-vert-body');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <common>',
      '#include <common>' + BODY_FRAG_DECL, 'craft/body-frag-decl');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <roughnessmap_fragment>',
      BODY_ROUGH_BODY, 'craft/body-panels');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <color_fragment>',
      '#include <color_fragment>\n  diffuseColor.rgb *= vTint;', 'craft/body-tint');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <opaque_fragment>',
      BODY_FRAG_BODY, 'craft/body-rim');
  });
  patchFog(m, 'opaque');
  return m;
}

// §5.3's canopy. MeshStandardMaterial, NOT MeshPhysicalMaterial — transmission is a second render
// target and is not happening on a phone. FrontSide: transparent + DoubleSide renders twice in
// r160 and a canopy is a closed cap seen from outside.
// The canopy read nothing at all in shots/s2c/before_family.png — nine craft and not one visible
// windscreen — because a constant 0.55 alpha over a near-black metal is a slightly grey patch on
// a black hull whichever way you look at it. Real glass is the opposite: nearly transparent
// head-on and nearly a mirror at a grazing angle. So the alpha now RIDES the fresnel, and the
// same procedural city the hull reflects lands on it at a much higher gain, which is what puts a
// hard bright sweep across the screen as the craft banks.
const GLASS_FRAG = /* glsl */`
  float gnv = saturate( dot( geometryNormal, geometryViewDir ) );
  float gf = pow( 1.0 - gnv, 3.0 );
  vec3 gR = inverseTransformDirection( reflect( -geometryViewDir, geometryNormal ), viewMatrix );
  outgoingLight += cityRefl( gR, vWorldPosition.xz * uCity.w ) * ( uCity.x * uGlassRefl * ( 0.30 + 0.90 * gf ) );
  // A tint of the frame's own colour at the very edge, so the canopy has a rim and not just a
  // gradient — the thing that says "there is a pane fitted here" rather than "the paint changed".
  outgoingLight += vec3( 0.42, 0.62, 0.86 ) * pow( 1.0 - gnv, 7.0 ) * 0.55;
  diffuseColor.a = mix( uGlassA.x, uGlassA.y, gf );
#include <opaque_fragment>
`;

export function glassMaterial(env) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x05070a, metalness: 1.0, roughness: 0.05,
    envMap: env || null, envMapIntensity: 1.35,
    transparent: true, opacity: 1.0, depthWrite: false, fog: true,
  });
  addPatch(m, 'craft:glass', sh => {
    sh.uniforms.uCity = CRAFT_U.uCity;
    sh.uniforms.uGlassRefl = CRAFT_U.uGlassRefl;
    sh.uniforms.uGlassA = CRAFT_U.uGlassA;
    sh.fragmentShader = patch(sh.fragmentShader, '#include <common>',
      '#include <common>\nuniform float uGlassRefl;\nuniform vec2 uGlassA;\n' + CITY_REFL,
      'craft/glass-decl');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <opaque_fragment>',
      GLASS_FRAG, 'craft/glass-body');
  });
  patchFog(m, 'alpha');
  return m;
}

// §5.4's whole light rig, as one billboarded additive quad field. The falloff is procedural — no
// texture, no atlas dependency, and the same six lines serve a 0.4 m tail lamp and a 2 m thruster
// disc because size is per instance.
const LIGHT_VERT_DECL = /* glsl */`
attribute vec3 iCol;
attribute float iInt;
varying vec3 vCol;
varying float vI;
varying vec2 vQ;
`;

const LIGHT_VERT_BODY = /* glsl */`
#include <begin_vertex>
  vCol = iCol; vI = iInt; vQ = position.xy;
`;

// mvPosition, not `mv`: fog_vertex reads it two chunks later for vFogDepth, and a rename here is
// a compile error that only shows up with fog enabled.
const LIGHT_BILLBOARD = /* glsl */`
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  mvPosition.xy += position.xy * length( instanceMatrix[ 0 ].xyz );
  gl_Position = projectionMatrix * mvPosition;
`;

const LIGHT_FRAG = /* glsl */`
  float r2 = dot( vQ, vQ ) * 4.0;
  float fall = exp( -r2 * 2.6 );
  diffuseColor.rgb = vCol * vI * fall;
  diffuseColor.a = fall;
`;

export function lightMaterial() {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true, toneMapped: false,
  });
  addPatch(m, 'craft:light', sh => {
    sh.vertexShader = patch(sh.vertexShader, '#include <common>',
      '#include <common>' + LIGHT_VERT_DECL, 'craft/light-vert-decl');
    sh.vertexShader = patch(sh.vertexShader, '#include <begin_vertex>',
      LIGHT_VERT_BODY, 'craft/light-vert-body');
    sh.vertexShader = patch(sh.vertexShader, '#include <project_vertex>',
      LIGHT_BILLBOARD, 'craft/light-billboard');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vCol;\nvarying float vI;\nvarying vec2 vQ;', 'craft/light-frag-decl');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <map_fragment>',
      LIGHT_FRAG, 'craft/light-frag-body');
  });
  patchFog(m, 'additive');
  return m;
}

// The thruster plume / lamp cone. Oriented, not billboarded: a plume that always faces the camera
// is a sprite, and §5.4 wants `1939970_00`'s bells, which are volumes seen from behind.
const CONE_VERT_DECL = /* glsl */`
attribute vec3 iCol;
attribute float iInt;
attribute float iGrad;
varying vec3 vCol;
varying float vI;
varying float vZ;
varying float vNV;     // |N.V| — the volumetric thickness approximation
`;

// `iGrad` flips which END of the cone is the bright one. A thruster plume is brightest at the
// nozzle and narrows aft; a lamp cone is brightest at the LAMP and widens forward — the same
// twelve triangles, placed apex-first, with the gradient reversed. Getting this wrong is not a
// subtle error: a headlight that is brightest 14 m in front of the craft reads as a second craft.
const CONE_VERT_BODY = /* glsl */`
#include <begin_vertex>
  vCol = iCol; vI = iInt; vZ = mix( position.z, 1.0 - position.z, iGrad );
`;

// A cone SURFACE has |xy| proportional to (1 - z), so a radial falloff taken off position.xy is
// zero at every vertex of it — the first attempt at softening the plume this way deleted it. The
// right term is how much of the VOLUME the ray crosses: maximum where the surface faces the camera
// (the ray goes down the axis) and zero at the silhouette (the ray clips the skin). That is |N.V|,
// and it is what turns six flat triangles into something that reads as gas.
const CONE_PROJECT = /* glsl */`
#include <project_vertex>
  {
    vec3 nrm = normalize( normalMatrix * ( mat3( instanceMatrix ) * normal ) );
    vNV = abs( dot( nrm, normalize( -mvPosition.xyz ) ) );
  }
`;

// Round 6, every critic, in almost the same words: "hard-edged flat triangles of constant opacity",
// "solid plastic wedges, not exhaust", "no hot core, no falloff". A six-sided cone with a constant
// alpha shows its polygon silhouette, and no amount of length or brightness hides that. Two terms
// fix it and neither costs a triangle: a RADIAL falloff across the cone so the edge feathers to
// nothing instead of ending at a straight cut, and a white-hot core in the first ~15 % of the
// plume so the bell has an actual centre.
const CONE_FRAG = /* glsl */`
  float axial = 1.0 - saturate( vZ );
  float thick = saturate( vNV );
  float fall = axial * axial * thick;
  float core = pow( saturate( 1.0 - vZ * 5.0 ), 3.0 ) * thick * thick;
  diffuseColor.rgb = ( vCol + vec3( core * 1.35 ) ) * vI * fall;
  diffuseColor.a = fall;
`;

export function coneMaterial() {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
    fog: true, toneMapped: false,
  });
  addPatch(m, 'craft:cone', sh => {
    sh.vertexShader = patch(sh.vertexShader, '#include <common>',
      '#include <common>' + CONE_VERT_DECL, 'craft/cone-vert-decl');
    sh.vertexShader = patch(sh.vertexShader, '#include <begin_vertex>',
      CONE_VERT_BODY, 'craft/cone-vert-body');
    sh.vertexShader = patch(sh.vertexShader, '#include <project_vertex>',
      CONE_PROJECT, 'craft/cone-project');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vCol;\nvarying float vI;\nvarying float vZ;\nvarying float vNV;', 'craft/cone-frag-decl');
    sh.fragmentShader = patch(sh.fragmentShader, '#include <map_fragment>',
      CONE_FRAG, 'craft/cone-frag-body');
  });
  patchFog(m, 'additive');
  return m;
}

// ── §5.4's rig, in normalised hull coordinates ─────────────────────────────
//
// `fx` and `fy` are fractions of the LOCAL half-width and half-height at station `t`, so a rig
// authored once sits on the skin of every craft in the family whatever its L/W/H. Reading them as
// fractions of W and H instead — which is what §5.4's "±0.70W" says literally — floats the tail
// strips 0.22 m off the side of a `wisp`, because the hull has necked to 0.13 W by t = 0.97.
//
// `anim`: 0 steady · 1 belly strobe (1.4 Hz, 60 ms) · 2/3 police bar halves (2.2 Hz) · 4 thruster.

export const LIGHT_RIG = [
  { id: 'lamp', t: 0.06, fx: -0.55, fy: 0.00, col: 0xdfeaff, size: 0.135, i: 0.85, anim: 0 },
  { id: 'lamp', t: 0.06, fx: 0.55, fy: 0.00, col: 0xdfeaff, size: 0.135, i: 0.85, anim: 0 },
  { id: 'tail', t: 0.97, fx: -0.70, fy: 0.15, col: 0xff2b3a, size: 0.105, i: 0.42, anim: 0, brake: true },
  { id: 'tail', t: 0.97, fx: 0.70, fy: 0.15, col: 0xff2b3a, size: 0.105, i: 0.42, anim: 0, brake: true },
  { id: 'belly', t: 0.55, fx: 0.00, fy: -0.90, col: 0xffb04a, size: 0.09, i: 0.9, anim: 1 },
];

// §5.4's ONE piece of per-type light data in the whole game. `patrol` drops the tail strips and
// the belly strobe and takes a roof bar instead; everything else on it is the civilian rig.
// S2-C's road transports. Coordinates are in the UNIT BOX the road forms are authored in, not on
// the loft, so `boxAt` and not `localAt` places them: fx and fy are fractions of the half-width
// and half-height of the box itself.
export const ROAD_RIG = [
  { id: 'lamp', t: 0.005, fx: -0.74, fy: -0.34, col: 0xfff0d0, size: 0.11, i: 0.80, anim: 0 },
  { id: 'lamp', t: 0.005, fx: 0.74, fy: -0.34, col: 0xfff0d0, size: 0.11, i: 0.80, anim: 0 },
  { id: 'dest', t: 0.010, fx: 0.00, fy: 0.62, col: 0xffb04a, size: 0.10, i: 0.55, anim: 0 },
  { id: 'tail', t: 0.995, fx: -0.74, fy: -0.20, col: 0xff2b3a, size: 0.09, i: 0.45, anim: 0, brake: true },
  { id: 'tail', t: 0.995, fx: 0.74, fy: -0.20, col: 0xff2b3a, size: 0.09, i: 0.45, anim: 0, brake: true },
  { id: 'roof', t: 0.500, fx: 0.00, fy: 1.04, col: 0x9fd8ff, size: 0.07, i: 0.30, anim: 0 },
];

export const POLICE_RIG = [
  { id: 'lamp', t: 0.06, fx: -0.55, fy: 0.00, col: 0xdfeaff, size: 0.135, i: 0.85, anim: 0 },
  { id: 'lamp', t: 0.06, fx: 0.55, fy: 0.00, col: 0xdfeaff, size: 0.135, i: 0.85, anim: 0 },
  { id: 'bar', t: 0.44, fx: -0.42, fy: 0.98, col: 0xff2b3a, size: 0.20, i: 1.5, anim: 2 },
  { id: 'bar', t: 0.44, fx: 0.42, fy: 0.98, col: 0x2b5cff, size: 0.20, i: 1.5, anim: 3 },
];

const _col = new THREE.Color();
const lin = hex => _col.setHex(hex).convertSRGBToLinear();

// ── the fields ─────────────────────────────────────────────────────────────
//
// One global InstancedMesh per material class, exactly as render_city.js and signage.js do it.
// Unlike those two, a craft field is REBUILT EVERY FRAME rather than owning slot ranges — every
// vehicle in the game moves every frame, so there is no static allocation to preserve; what the
// architecture rule protects (one mesh, packed [0, n), frustumCulled off) is preserved exactly.

// 56, not 40: S2-C's road transports share these fields with the flying population (that is what
// keeps the whole vehicle layer at §3.8's five draws), so the near set is now 26 flying + up to 8
// road + the player. The buffers are 56 x 16 floats — 3.5 KB — so the headroom is free and an
// overflow is a craft that silently does not draw.
const CAP = { body: 56, glass: 56, light: 56 * 7, cone: 56 * 6 };

export class CraftFields {
  constructor(scene, sky) {
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);

    this.matBody = bodyMaterial(sky?.env);
    this.matGlass = glassMaterial(sky?.env);
    this.matLight = lightMaterial();
    this.matCone = coneMaterial();

    this.geoBody = buildBody();
    this.geoGlass = buildCanopy();
    this.geoLight = new THREE.PlaneGeometry(1, 1);
    this.geoCone = buildCone();

    this.body = this._field('craftBody', this.geoBody, this.matBody, CAP.body,
      [['iTint', 4], ['iRim', 4], ['iOpt', 4], ['iVar', 4]], 2);
    this.glass = this._field('craftGlass', this.geoGlass, this.matGlass, CAP.glass, [], 3);
    this.light = this._field('craftLight', this.geoLight, this.matLight, CAP.light,
      [['iCol', 3], ['iInt', 1]], 4);
    this.cone = this._field('craftCone', this.geoCone, this.matCone, CAP.cone,
      [['iCol', 3], ['iInt', 1], ['iGrad', 1]], 4);

    this.fields = [this.body, this.glass, this.light, this.cone];

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    // The district's neon, kept for anything that wants the ambient hue. The HULL no longer uses
    // it: after Aaron's note, rim and chine are the craft's OWN trim colour, so a fleet does not
    // wash to one colour the moment it crosses a district boundary.
    this.rim = new THREE.Color(0x35e6ff).convertSRGBToLinear();
    this.overflow = 0;
  }

  _field(name, geo, mat, cap, attrs, order) {
    const f = {
      name, cap, n: 0, geo, mat, attrs: {},
      mesh: new THREE.InstancedMesh(geo, mat, cap),
    };
    f.mesh.frustumCulled = false;
    f.mesh.matrixAutoUpdate = false;
    f.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    f.mesh.renderOrder = order;
    f.mesh.count = 0;
    for (const [an, size] of attrs) {
      const ba = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      ba.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(an, ba);
      f.attrs[an] = ba.array;
      f.attrList = (f.attrList || []).concat(ba);
    }
    f.tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    this.group.add(f.mesh);
    return f;
  }

  begin() { for (const f of this.fields) f.n = 0; }

  flush() {
    for (const f of this.fields) {
      f.mesh.count = f.n;
      f.mesh.instanceMatrix.needsUpdate = true;
      for (const a of f.attrList || []) a.needsUpdate = true;
    }
  }

  setVisible(on) { for (const f of this.fields) f.mesh.visible = !!on; return !!on; }

  // The gate's handles on S2-C's material work. They live here rather than in main.js because
  // main.js is another phase's file and `__game.craftFields` is already exposed — a gate reaching
  // `craftFields.setCityRefl(0)` is reaching the same object the renderer uses, which is the point.
  get u() { return CRAFT_U; }
  setCityRefl(amount) { return setCityRefl(amount); }

  setRim(hex) { this.rim.setHex(hex).convertSRGBToLinear(); return this.rim; }

  // ── write one craft ──────────────────────────────────────────────────────
  //
  // `c` is a plain pose object, which is what lets traffic.js and the player share one path:
  //   { def, x, y, z, yaw, pitch, roll, throttle, brake, t, glass, lights, tint }
  write(c) {
    const d = c.def;
    if (this.body.n >= this.body.cap) { this.overflow++; return false; }

    this._e.set(c.pitch || 0, c.yaw || 0, c.roll || 0);
    this._q.setFromEuler(this._e);
    this._p.set(c.x, c.y, c.z);
    this._s.set(d.W, d.H, d.L);
    this._m.compose(this._p, this._q, this._s);

    const bi = this.body.n++;
    this._m.toArray(this.body.mesh.instanceMatrix.array, bi * 16);
    const A = this.body.attrs;

    const tint = lin(c.tint !== undefined ? c.tint : (d.hull !== undefined ? d.hull : HULL_BLACK));
    const thr = clamp(c.throttle === undefined ? 0.35 : c.throttle, 0, 1);
    A.iTint[bi * 4] = tint.r; A.iTint[bi * 4 + 1] = tint.g;
    A.iTint[bi * 4 + 2] = tint.b; A.iTint[bi * 4 + 3] = thr;

    // Trim: the craft's own neon, dimmed on the way in for the same reason patchGlass dims its
    // sheen — a full-intensity neon added to a 0.005-linear hull paints the whole body.
    const trimHex = c.trim !== undefined ? c.trim : (d.trim !== undefined ? d.trim : 0x35e6ff);
    const tr = lin(trimHex);
    const run = c.run !== undefined ? TRIM_RUNS[c.run % TRIM_RUNS.length]
      : (d.run !== undefined ? TRIM_RUNS[d.run % TRIM_RUNS.length] : TRIM_RUNS[0]);
    A.iRim[bi * 4] = tr.r * RIM_DIM; A.iRim[bi * 4 + 1] = tr.g * RIM_DIM;
    A.iRim[bi * 4 + 2] = tr.b * RIM_DIM; A.iRim[bi * 4 + 3] = run.amt;
    A.iOpt[bi * 4] = d.nac; A.iOpt[bi * 4 + 1] = d.fin;
    A.iOpt[bi * 4 + 2] = run.t0; A.iOpt[bi * 4 + 3] = run.t1;
    // S2-C's two extra options plus the edge rig. `kit` and `road` come off the DEF (a def is a
    // vehicle type and its shape is not per-instance); `edge` and `pulse` come off the POSE,
    // because "lights highlighting some edges … varied per vehicle" is exactly a per-instance
    // property and traffic.js seeds it from the same bytes the colours come from.
    const road = d.road || 0;
    A.iVar[bi * 4] = road ? 0 : (d.kit || 0);
    A.iVar[bi * 4 + 1] = road;
    A.iVar[bi * 4 + 2] = c.edge !== undefined ? c.edge : (d.edge !== undefined ? d.edge : 0);
    A.iVar[bi * 4 + 3] = c.pulse !== undefined ? c.pulse : (d.pulse !== undefined ? d.pulse : 0);

    // A road transport has no canopy: its glazing is the lit window band in the body geometry.
    if (c.glass !== false && !road && this.glass.n < this.glass.cap) {
      const gi = this.glass.n++;
      this._m.toArray(this.glass.mesh.instanceMatrix.array, gi * 16);
    }

    if (c.lights !== false) this._writeLights(c, d);
    return true;
  }

  // The craft basis, once, then every light is three multiply-adds off it. Lights are billboards,
  // so their matrices carry a translation and a uniform scale and nothing else — 16 stores, no
  // quaternion, no compose.
  _writeLights(c, d) {
    const m = this._m.elements;
    // columns of the composed matrix, divided by the scale, are the unit basis vectors
    const rx = m[0] / d.W, ry = m[1] / d.W, rz = m[2] / d.W;      // craft +X (right)
    const ux = m[4] / d.H, uy = m[5] / d.H, uz = m[6] / d.H;      // craft +Y (up)
    const fx = m[8] / d.L, fy = m[9] / d.L, fz = m[10] / d.L;     // craft +Z (aft)

    const t = c.t || 0;
    const police = !!d.police;
    const road = !!d.road;
    const rig = road ? ROAD_RIG : (police ? POLICE_RIG : LIGHT_RIG);
    const at = road ? boxAt : localAt;
    const thr = clamp(c.throttle === undefined ? 0.35 : c.throttle, 0, 1);
    const brake = c.brake ? 2 : 1;

    for (const L of rig) {
      const lp = at(L.t, L.fx, L.fy);
      let inten = L.i;
      if (L.anim === 1) inten *= (t * 1.4) % 1 < 0.084 ? 1 : 0.06;
      else if (L.anim === 2) inten *= (t * 2.2) % 1 < 0.42 ? 1 : 0.04;
      else if (L.anim === 3) inten *= (t * 2.2) % 1 >= 0.5 && (t * 2.2) % 1 < 0.92 ? 1 : 0.04;
      if (L.brake) inten *= brake;
      this._light(lp, d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, L.col, L.size * Math.max(d.W, d.H), inten);
    }

    // §5.4's thruster discs — one at every LIVE nacelle, scale and brightness tracking throttle.
    const nCol = c.boost ? 0xeaf6ff : 0x35d6e8;
    for (let s = 0; s < d.nac; s++) {
      const N = NACELLE[s];
      const lp = localAt(N.t, N.fx, N.fy);
      lp[2] += N.len * 0.5 + 0.01;
      const sz = N.r * 1.8 * Math.max(d.W, d.H) * (0.55 + 0.75 * thr);
      this._light(lp, d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, nCol, sz, 0.22 + 0.62 * thr);
      // §5.4's plume: 1.2 + 5.0 * throttle metres, cyan → white at boost. The bells in
      // `1939970_00` are a modest, well-shaped blue — not a flare, which is what an unclamped
      // additive cone under bloom becomes.
      const len = (0.9 + 3.1 * thr) * (c.boost ? 1.6 : 1.0);
      this._cone(lp, d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c,
        nCol, N.r * 2.2 * Math.max(d.W, d.H), len, 0.14 + 0.34 * thr, 0);
    }

    // §5.4's forward lamp cones — 14 m, apex AT the lamp and widening forward, which is the whole
    // reason `iGrad` exists. Placed by translating the instance to the far end and giving it a
    // negative length, so the apex lands back on the lamp. A road transport gets a shorter, wider
    // one: it is 3 m off the deck and its beam ends on tarmac, not in open air.
    if (road) this._lampCone(d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, 0xffe6bf, 9, 2.2, 0.075, 0.0, boxAt);
    else this._lampCone(d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, 0xbfd6ff, 14, 2.6, 0.085);
    if (police) {
      // decision 6: a sweep light, because a police craft in this genre has one. It illuminates
      // nothing, follows nothing, and is 12 triangles.
      this._lampCone(d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c,
        (t * 2.2) % 1 < 0.5 ? 0xff2b3a : 0x2b5cff, 40, 7.0, 0.020, 0.30);
    }
  }

  // A cone whose APEX is on the hull and whose mouth is `len` metres forward. `fwdT` is where the
  // apex sits along the hull (0.06 = the lamps, 0.30 = the police sweep).
  //
  // ── a P5 bug, found by S2-C and fixed here ─────────────────────────────
  //
  // The length was passed NEGATIVE, and the comment on it ("so the apex lands back on the lamp")
  // described what the author intended rather than what the arithmetic did. Measured on the live
  // instance matrix at yaw 0, a `kestrel` whose nose is at z = -3.1 had its lamp cone spanning
  // z -16.73 to -30.73 — a beam floating between 13.6 m and 27.6 m IN FRONT of the craft, never
  // touching it. It survived since P5 because a faint additive cone in fog reads as haze; S2-C
  // found it only because a road transport is a slab and the detached wedge beside it was obvious.
  //
  // The origin was already right. `_cone` places the ring (local z = 0) at the origin and the apex
  // (local z = 1) at origin + zAxis, so with the origin at `lamp - len` the axis must be `+len`
  // for the apex to land on the lamp. gates_s2c B3 asserts exactly that, and can fail: it
  // measures the apex against the lamp station, not against a tolerance around zero.
  _lampCone(d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, col, len, radius, inten, fwdT = 0.06, at = localAt) {
    const lp = at(fwdT, 0, 0);
    lp[2] -= len / d.L;          // localAt is in unit-hull space; _cone scales z by d.L
    this._cone(lp, d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, col, radius, len, inten, 1);
  }

  _light(lp, d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, col, size, inten) {
    const f = this.light;
    if (f.n >= f.cap) { this.overflow++; return; }
    const i = f.n++;
    const a = f.mesh.instanceMatrix.array, o = i * 16;
    const px = lp[0] * d.W, py = lp[1] * d.H, pz = lp[2] * d.L;
    const wx = c.x + rx * px + ux * py + fx * pz;
    const wy = c.y + ry * px + uy * py + fy * pz;
    const wz = c.z + rz * px + uz * py + fz * pz;
    a[o] = size; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = size; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = size; a[o + 11] = 0;
    a[o + 12] = wx; a[o + 13] = wy; a[o + 14] = wz; a[o + 15] = 1;
    const cl = lin(col);
    f.attrs.iCol[i * 3] = cl.r; f.attrs.iCol[i * 3 + 1] = cl.g; f.attrs.iCol[i * 3 + 2] = cl.b;
    f.attrs.iInt[i] = inten;
  }

  _cone(lp, d, rx, ry, rz, ux, uy, uz, fx, fy, fz, c, col, radius, len, inten, grad = 0) {
    const f = this.cone;
    if (f.n >= f.cap) { this.overflow++; return; }
    const i = f.n++;
    const a = f.mesh.instanceMatrix.array, o = i * 16;
    const px = lp[0] * d.W, py = lp[1] * d.H, pz = lp[2] * d.L;
    const wx = c.x + rx * px + ux * py + fx * pz;
    const wy = c.y + ry * px + uy * py + fy * pz;
    const wz = c.z + rz * px + uz * py + fz * pz;
    a[o] = rx * radius; a[o + 1] = ry * radius; a[o + 2] = rz * radius; a[o + 3] = 0;
    a[o + 4] = ux * radius; a[o + 5] = uy * radius; a[o + 6] = uz * radius; a[o + 7] = 0;
    a[o + 8] = fx * len; a[o + 9] = fy * len; a[o + 10] = fz * len; a[o + 11] = 0;
    a[o + 12] = wx; a[o + 13] = wy; a[o + 14] = wz; a[o + 15] = 1;
    const cl = lin(col);
    f.attrs.iCol[i * 3] = cl.r; f.attrs.iCol[i * 3 + 1] = cl.g; f.attrs.iCol[i * 3 + 2] = cl.b;
    f.attrs.iInt[i] = inten;
    f.attrs.iGrad[i] = grad;
  }

  breakdown() {
    const rows = this.fields.map(f => ({
      field: f.name, draws: f.n ? 1 : 0, instances: f.n, geoTris: f.tris,
      tris: f.n * f.tris, cap: f.cap,
    }));
    return {
      rows,
      draws: rows.reduce((a, r) => a + r.draws, 0),
      tris: rows.reduce((a, r) => a + r.tris, 0),
      overflow: this.overflow,
    };
  }

  dispose() {
    for (const f of this.fields) { f.geo.dispose(); f.mesh.dispose(); }
    for (const m of [this.matBody, this.matGlass, this.matLight, this.matCone]) m.dispose();
    this.group.parent?.remove(this.group);
  }
}

// ── the player craft (§3.10 #6) ────────────────────────────────────────────
//
// A pose adaptor, nothing more. It reads flight.js and writes a pose object; it owns no physics
// and no state that the flight model does not already have, which is what keeps §6's "attitude is
// a decoration" true all the way to the mesh: `bank` and `vpitch` reach the hull here and nowhere
// else touches them.

export class PlayerCraft {
  constructor(craftId = 'wisp') {
    this.setCraft(craftId);
    this.pose = { def: this.def, x: 0, y: 60, z: 0, yaw: 0, pitch: 0, roll: 0,
      throttle: 0, brake: false, boost: false, t: 0 };   // tint/trim/run come from the def
    this.visible = true;
  }

  setCraft(id) {
    this.id = CRAFT_DEFS[id] ? id : 'wisp';
    this.def = CRAFT_DEFS[this.id];
    if (this.pose) this.pose.def = this.def;
    return this.id;
  }

  fromFlight(f, t) {
    const p = this.pose;
    p.x = f.px; p.y = f.py; p.z = f.pz;
    p.yaw = f.heading;
    // The DECORATION, and only here. §6.3 item 1's cosmetic attitude is what a chase camera and a
    // hull are for; nothing reads it back.
    p.pitch = f.vpitch;
    p.roll = f.bank;
    p.throttle = clamp(f.speed / Math.max(1, f.maxFwd), 0, 1);
    p.brake = f.speed < 0.6 && f.contact === 0 ? false : false;
    p.boost = !!f.boostOn;
    p.t = t;
    return p;
  }

  // Shot mode has no flight model. §12.1's `hero_craft` needs a craft in the left third of a
  // frozen camera, so the pose is authored as an offset in the CAMERA's own basis — which means
  // it cannot drift if the frozen camera is ever re-verified, and it adds no field to SCENARIOS
  // (tools/shot.mjs compares the scenario against shots/<id>.json key by key).
  fromCamera(cam, off, t) {
    const p = this.pose;
    const yaw = cam.rotation.y, pitch = cam.rotation.x;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fwd = [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp];
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    // cross(RIGHT, FWD), not cross(fwd, right). The other order gives -up, which silently inverts
    // the offset and cost an hour of "why is `down` moving it up".
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]];
    p.x = cam.position.x + fwd[0] * off.fwd + right[0] * off.right + up[0] * off.up;
    p.y = cam.position.y + fwd[1] * off.fwd + right[1] * off.right + up[1] * off.up;
    p.z = cam.position.z + fwd[2] * off.fwd + right[2] * off.right + up[2] * off.up;
    p.yaw = yaw + (off.yaw || 0);
    p.pitch = off.pitch || 0;
    p.roll = off.roll || 0;
    p.throttle = off.throttle === undefined ? 0.8 : off.throttle;
    p.boost = !!off.boost;
    p.brake = false;
    p.t = t;
    return p;
  }
}

// §12.1's `hero_craft` note: "the canyon falls away to the right and the left third is deliberately
// open — that is where P5's craft goes. Do not re-frame it when the craft exists; the empty third
// IS the composition." So the craft is placed into that third rather than the camera moved.
export const SHOT_CRAFT = {
  // `fov` in three is VERTICAL, so the horizontal half-angle at 55 deg on 16:9 is ~44 deg: the
  // offsets below are sized against that and not against the fov number. 11 m is the game's own
  // F.CHASE.dist, so this is the frame the player actually flies in, not a bespoke camera.
  hero_craft: { craft: 'kestrel', fwd: 13.5, right: -5.2, up: 3.4, yaw: 0.66, pitch: -0.05, roll: -0.17, throttle: 0.86 },
  cockpit: { craft: 'kestrel', fwd: 0, right: 0, up: 0, yaw: 0, pitch: 0, roll: 0, throttle: 0.5, hide: true },
  // decision 14's test. The cameras are P3b's, unmoved; a craft is placed into each frame and
  // nothing else changes, so a score or complaint that moves between P3b's round 3 and P5's round 4
  // moved because of the SUBJECT.
  fog_city: { craft: 'drayman', fwd: 21, right: 7.4, up: 2.6, yaw: -0.5, pitch: -0.03, roll: 0.10, throttle: 0.62 },
  canyon_dive: { craft: 'mammoth', fwd: 26, right: -6.0, up: 6.5, yaw: 0.5, pitch: 0.10, roll: -0.12, throttle: 0.7 },
};

export { HULL_BLACK, buildBody, buildCanopy, buildCone };
