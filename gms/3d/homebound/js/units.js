// The tier ladder's geometry. One BufferGeometry per entry in config.js:TIERS,
// built entirely out of tagged chamfered boxes, domes and cylinders — see
// "Primitives" — so `toon.js`'s crowd shader can walk a soldier with no bones,
// no skinning and no per-unit CPU work.
//
// The `aPart` tag on every vertex is the whole rig:
//
//   0 body   1 leg-left   2 leg-right   3 arm-left   4 arm-right   5 head
//   6 spinner (rotates about model Y)
//
// The shader pivots legs at y = 0.78 and arms at y = 1.28, so every foot unit
// is built to human proportion at 1.75 m with its hips and shoulders on those
// two lines. Move a soldier's hips and his legs start swinging from his knees.
//
// ---------------------------------------------------------------------------
// WHY THERE IS A PALETTE TEXTURE
//
// A tier gets ONE material, because 400 men have to be two draw calls. The
// first cut of this file put the tier colour on the material and multiplied it
// by a 5-step grey ramp sampled from the uv, which was the right idea and the
// wrong range: at 30 m every man was a single blue lump with a marginally
// bluer lump on top. Three things were wrong and all three are fixed here.
//
//  1. The steps were too close together AND assigned badly — helmet 1.00 next
//     to torso 0.84 is a 16% step, and torso/yoke/pack, which are most of what
//     the camera sees, all sat inside two steps of each other. The palette now
//     runs lightness 0.085 (boots, weapon) to 0.68 (helmet), and the assignment
//     puts a WIDE dark yoke between the bright cap and the mid torso so each
//     man is a bright cap inside a dark collar — that ring is what separates
//     one helmet from the next man's in a packed block.
//
//  2. A grey ramp can only darken, so an accent could never be a different
//     HUE — and "which tier am I" is exactly the job a trim colour does best.
//     So the map is no longer grey: it is a per-crowd 8-texel PALETTE with the
//     tier colour already baked into every step, the material colour is white,
//     and two of the eight texels are fixed accents (warm sand, pale steel) that
//     do not come from the tier colour at all. Still one texture, one material,
//     one draw call — the texture is just doing more work.
//
//  3. The camera looks at these men from BEHIND and 39 degrees ABOVE. Every
//     face pointing +Z is invisible, which is where the old chest rig, brim,
//     breastplate and — fatally — the entire rifle were. Everything that has
//     to read is now on the top or the back, and the rifle is out at x = -0.30
//     and raked up so its barrel clears its own man's helmet along the view
//     ray and lands across the NEXT man's bright cap. See buildRifleman.
//
// Shade slots, in the order they are written into the texture:
//
//   HELM   the bright cap. Biggest top-facing area on the model.
//   PLATE  secondary bright: back armour, glacis, bonnets, turret roofs.
//   COAT   the base body value.
//   GEAR   webbing, yokes, packs — the dark ring that isolates the helmet.
//   LIMB   legs.
//   INK    boots, weapons, tracks, canopies. Near black by design; it merges
//          into the outline and that is what gives the crowd a dark footing.
//   TRIM   warm sand accent   \  fixed, not derived from the tier colour, so
//   TRIM2  pale steel accent  /  a promotion changes colour and not just value.
//
// The accents ALTERNATE up the ladder — sand, steel, sand, steel — because what a
// player has to notice is that the crowd *changed*, and two neighbouring tiers
// wearing the same trim is the one arrangement that hides it.
//
// Rule for placing an accent: it is either a free-standing box (a pauldron), a
// STACKED slab sharing its parent's footprint (a turret cap), or a raised
// stripe inset in depth by 0.10 from its parent. Never an embedded slab that
// is as wide as the thing it sits in — the inverted-hull shell is pushed out
// 0.045-0.065 in every direction, so a flush inset slab's shell escapes its
// parent's shell and draws a dark halo where no edge exists.

import * as THREE from 'three';
import { TIERS, PAL, RUN } from './config.js';
import { mergeParts, makeCrowd } from './toon.js';

const BODY = 0, LEG_L = 1, LEG_R = 2, ARM_L = 3, ARM_R = 4, HEAD = 5, SPIN = 6;

// Facing +Z (the road runs away from the camera), +Y up. Facing that way the
// unit's own left hand is at +X, so parts 1/3 live at +X and 2/4 at -X — the
// shader swings left-leg against left-arm, which is only a correct gait if the
// two are on the same side of the body.
const L = 1, R = -1;

// Shade slots. Index into the palette below.
const HELM = 0, PLATE = 1, COAT = 2, GEAR = 3, LIMB = 4, INK = 5, TRIM = 6, TRIM2 = 7;
const PAL_N = 8;

// [saturation multiplier, lightness] against the tier's own hue. The lightness
// column IS the read.
//
// These numbers were measured out of real frames, not guessed, and they are
// biased for THIS camera. Two passes of sampling say the lighting alone is
// already a strong ramp: a top face renders at 0.77 of its texel and a face
// pointing at the camera at 0.48, because the hemisphere gives a top face the
// full sky and a vertical face half sky, half dark olive ground. So the
// helmet — which the player sees as a top face — gets 1.6x for free.
//
// Pass one ran HELM at 0.76 lightness and half saturation, and sampled at
// rgb(132,144,168) over a body at rgb(0,24,48): a 5.7:1 ratio, so extreme that
// the crowd read as pale grey pebbles on black and "your squad is BLUE" was
// gone. Pass two fixed the hue and left the body at 0.395, which still
// rendered at luminance 41 — the SAME value as the weapons, which is exactly
// why no weapon read. The body values below are therefore lifted hard: the
// torso lands near luminance 64 against a helmet at 127 (about 2:1, where the
// reference frames sit) and against an INK weapon at about 9, so a rifle is
// finally a dark bar on something rather than black on black.
const SHADES = [
  [0.78, 0.680],   // HELM
  [0.90, 0.600],   // PLATE
  [1.00, 0.500],   // COAT
  [1.05, 0.330],   // GEAR
  [1.05, 0.270],   // LIMB
  [0.65, 0.085],   // INK
];
// The accents are fixed, never derived from the tier colour, so a promotion
// changes hue and not just value. TRIM2 is a pale STEEL rather than a white:
// at full white the heavy's helmet plus pauldrons covered enough of his top
// surface that a squad of 150 read as a white crowd and stopped being blue.
const TRIM_RGB = [0.96, 0.80, 0.36];    // warm sand
const TRIM2_RGB = [0.76, 0.86, 0.95];   // pale steel
const SAT_BOOST = 0.18;                 // the hemisphere fill washes hue out

let ctxRef = null;
const geoCache = new Map();     // tier id -> master BufferGeometry
const palCache = new Map();     // base colour hex -> DataTexture

// --------------------------------------------------------------------------
// The palette
// --------------------------------------------------------------------------

function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hsl2rgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// RANK. army.js draws a stack of men as one body once the squad outgrows the
// draw budget, and a body standing for 500 men has to read as heavier than one
// standing for 5 even when the badge over its head is too small to parse. Size
// does half of that; this does the other half.
//
// The lift goes almost entirely into the two FIXED accents and the two bright
// top-facing steps, for the reason the header gives: the camera is 39 degrees
// up, so a helmet, a roof deck and a turret band are what it actually sees, and
// pushing those toward white makes a merged formation glint along its top
// surfaces. The body steps move barely at all — lifting those washes the hue
// out and the squad stops being blue, which is the one thing it must never do.
const RANK_SPAN = 6;                     // rungs to reach the full lift
const RANK_LIFT = [0.075, 0.060, 0.030, 0.020, 0.020, 0.010];   // per SHADES row
const RANK_TRIM = 0.34;                  // how far the accents move toward white

/** The eight shades of one tier colour, as [r,g,b] in 0..1 sRGB. */
function shades(hex, rank = 0) {
  const k = Math.min(1, Math.max(0, rank) / RANK_SPAN);
  const [h, s0] = rgb2hsl(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  const s = Math.min(1, s0 + SAT_BOOST);
  const out = SHADES.map(([sm, l], i) => hsl2rgb(h, Math.min(1, s * sm), Math.min(0.90, l + RANK_LIFT[i] * k)));
  const white = (c) => c.map((v) => v + (1 - v) * RANK_TRIM * k);
  out.push(white(TRIM_RGB), white(TRIM2_RGB));
  return out;
}

// An 8x1 nearest-filtered texture, one per crowd colour. Nearest and no
// mipmaps on purpose: a linear filter would blend the steps into one average
// the moment the crowd is more than 30 m out, which is exactly when the
// contrast is doing the most work.
function paletteTex(hex, rank = 0) {
  const key = hex * 16 + Math.min(15, Math.max(0, rank | 0));
  let t = palCache.get(key);
  if (t) return t;
  const cols = shades(hex, rank);
  const px = new Uint8Array(PAL_N * 4);
  for (let i = 0; i < PAL_N; i++) {
    px[i * 4] = Math.round(cols[i][0] * 255);
    px[i * 4 + 1] = Math.round(cols[i][1] * 255);
    px[i * 4 + 2] = Math.round(cols[i][2] * 255);
    px[i * 4 + 3] = 255;
  }
  t = new THREE.DataTexture(px, PAL_N, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  palCache.set(key, t);
  return t;
}

/**
 * Repaint a crowd for a stack rank. One texture swap on the material it already
 * has — no new material, no new draw call, and `customProgramCacheKey` in
 * toon.js means the program is reused, so it does not stall on a recompile.
 * Called by army.js when the stack ladder steps, which is a handful of times a
 * run, never per frame.
 */
export function applyRank(crowd, tierIndex, rank = 0) {
  if (!crowd?.material || crowd.userData?.rankable === false) return crowd;
  const t = TIERS[tierIndexOf(tierIndex)];
  const src = crowd.userData?.baseColor ?? t.color;
  const hex = typeof src === 'number' ? src : new THREE.Color(src).getHex();
  const tex = paletteTex(hex, rank);
  if (crowd.material.map !== tex) { crowd.material.map = tex; crowd.material.needsUpdate = true; }
  return crowd;
}

// --------------------------------------------------------------------------
// Primitives
// --------------------------------------------------------------------------
//
// ROUNDER, NOT SMOOTHER.
//
// The units read as stacks of cubes because they *were* stacks of cubes. The
// cheapest honest fix is to stop drawing boxes and draw CHAMFERED boxes: the
// same six faces, plus twelve edge bevels and eight corner triangles. 44
// triangles instead of 12, still hard-faceted, still one merged geometry — and
// every silhouette in the game picked up a soft shoulder without a single
// builder below having to change a line.
//
// A chamfer is not a fillet. It keeps the flat-shaded, poster-paint look the
// whole game is drawn in; it just stops every edge being a 90 degree glint.
//
// The triangles are paid for by army.js, which now draws a STACK of men per
// body: the crowd is ~64 bodies where it used to be up to 600, so a unit can
// afford five times the geometry it could before. Rifleman counts 1,083
// triangles against the old 204 — and the whole crowd is 69k against 122k, so
// the rounder units are still 43% CHEAPER than the carpet they replace.
//
// Two curved primitives go where a bevel cannot reach — `dome` for helmets and
// hat crowns, `cyl` for wheels, barrels and masts. Both are low-segment and
// smooth-normalled, which against the faceted chamfers reads as moulded plastic
// rather than as subdivision, and moulded plastic is exactly the reference.

const CH = 0.28;        // default chamfer, as a fraction of the smallest dimension
const CH_MAX = 0.15;    // ...but never more than this in metres: a 3 m tank hull
                        // with a proportional chamfer stops being a tank.

// One convex face, appended to a running position/normal/index list.
//
// Winding is DERIVED, never hand-written: every primitive here is convex and
// centred on its own local origin, so the outward side of a face is the one
// whose normal points away from that origin. Twenty-six faces per box is far
// too many to get right by hand, and one inverted face is a hole in the man.
function pushFace(P, N, I, pts) {
  const m = pts.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= m; cy /= m; cz /= m;
  const ax = pts[1][0] - pts[0][0], ay = pts[1][1] - pts[0][1], az = pts[1][2] - pts[0][2];
  const bx = pts[2][0] - pts[0][0], by = pts[2][1] - pts[0][1], bz = pts[2][2] - pts[0][2];
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const flip = (nx * cx + ny * cy + nz * cz) < 0;
  if (flip) { nx = -nx; ny = -ny; nz = -nz; }
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  const v0 = P.length / 3;
  for (let k = 0; k < m; k++) {
    const p = pts[flip ? m - 1 - k : k];
    P.push(p[0], p[1], p[2]);
    N.push(nx, ny, nz);
  }
  for (let k = 2; k < m; k++) I.push(v0, v0 + k - 1, v0 + k);
}

// A box with its twelve edges cut back by `c`. 96 vertices, 44 triangles, and
// every face flat — the three corner points X/Y/Z are the same corner pushed
// onto the three faces that used to meet there.
function chamferGeo(w, h, d, c) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  c = Math.max(0.003, Math.min(c, hx * 0.9, hy * 0.9, hz * 0.9));
  const X = (sx, sy, sz) => [sx * hx, sy * (hy - c), sz * (hz - c)];
  const Y = (sx, sy, sz) => [sx * (hx - c), sy * hy, sz * (hz - c)];
  const Z = (sx, sy, sz) => [sx * (hx - c), sy * (hy - c), sz * hz];
  const P = [], N = [], I = [];
  for (const s of [-1, 1]) {                       // the six flats
    pushFace(P, N, I, [X(s, -1, -1), X(s, 1, -1), X(s, 1, 1), X(s, -1, 1)]);
    pushFace(P, N, I, [Y(-1, s, -1), Y(1, s, -1), Y(1, s, 1), Y(-1, s, 1)]);
    pushFace(P, N, I, [Z(-1, -1, s), Z(1, -1, s), Z(1, 1, s), Z(-1, 1, s)]);
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) {   // the twelve bevels
    pushFace(P, N, I, [X(a, b, -1), X(a, b, 1), Y(a, b, 1), Y(a, b, -1)]);
    pushFace(P, N, I, [X(a, -1, b), X(a, 1, b), Z(a, 1, b), Z(a, -1, b)]);
    pushFace(P, N, I, [Y(-1, a, b), Y(1, a, b), Z(1, a, b), Z(-1, a, b)]);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pushFace(P, N, I, [X(sx, sy, sz), Y(sx, sy, sz), Z(sx, sy, sz)]);   // corners
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((P.length / 3) * 2), 2));
  g.setIndex(I);
  return g;
}

/**
 * The mitre direction for the outline shell, one vector per vertex.
 *
 * An inverted hull pushed along the FACE normal tears a solid apart: each face
 * slides out on its own axis and the corners come away as loose quads, which at
 * any outline thick enough to read looks like the model exploded. The fix on a
 * plain box was to sum the three normals meeting at a corner, which lands on
 * (+/-1, +/-1, +/-1) and moves every face plane out by exactly uThick.
 *
 * A chamfered box breaks that shortcut. Four faces meet at each of its corner
 * points, not three, and their sum is nearly three units long — so the naive
 * version drew an outline three times too thick on the chamfers and the units
 * came out wearing a black halo. So: normalise the sum, then scale it so the
 * SHALLOWEST plane it touches still moves out by a full uThick. On a plain box
 * that solves back to exactly (+/-1, +/-1, +/-1), so nothing that worked before
 * changed; on a sphere or a cylinder every vertex has one normal and it solves
 * to the normal itself, which is the correct offset for a smooth surface.
 */
function mitreDirs(g) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  const n = g.attributes.position.count;
  const out = new Float32Array(n * 3);
  const at = new Map();
  const key = (i) => `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let a = at.get(k);
    if (!a) at.set(k, a = { x: 0, y: 0, z: 0, ns: [] });
    const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
    let dup = false;
    for (const q of a.ns) {
      if (Math.abs(q[0] - nx) < 2e-3 && Math.abs(q[1] - ny) < 2e-3 && Math.abs(q[2] - nz) < 2e-3) { dup = true; break; }
    }
    if (dup) continue;                       // a seam duplicate must not bias the sum
    a.ns.push([nx, ny, nz]);
    a.x += nx; a.y += ny; a.z += nz;
  }
  for (const a of at.values()) {
    const l = Math.hypot(a.x, a.y, a.z) || 1;
    const vx = a.x / l, vy = a.y / l, vz = a.z / l;
    let mn = 1e9;
    for (const q of a.ns) { const d = vx * q[0] + vy * q[1] + vz * q[2]; if (d < mn) mn = d; }
    const s = Math.min(2.2, 1 / Math.max(0.36, mn));
    a.x = vx * s; a.y = vy * s; a.z = vz * s;
  }
  for (let i = 0; i < n; i++) {
    const a = at.get(key(i));
    out[i * 3] = a.x; out[i * 3 + 1] = a.y; out[i * 3 + 2] = a.z;
  }
  return out;
}

// Place a raw primitive: turn it, move it, tag every vertex with its body part,
// and rewrite the uv to the palette texel that carries its shade. The uv is the
// whole colour system — see the header — so nothing may reach mergeParts
// without going through here.
function finish(g, x, y, z, part = BODY, sh = COAT, rx = 0, ry = 0) {
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (x || y || z) g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  const uv = g.attributes.uv.array;
  const u = (sh + 0.5) / PAL_N;
  for (let i = 0; i < uv.length; i += 2) { uv[i] = u; uv[i + 1] = 0.5; }
  g.userData.shell = mitreDirs(g);
  return g;
}

/**
 * A chamfered box with a shade slot and an optional turn. `chf` is the chamfer
 * as a fraction of the part's SMALLEST dimension, so a 0.07 m stripe keeps a
 * crisp edge and a 0.6 m torso gets a real shoulder out of the same number.
 * Push it to 0.45+ and the part is effectively a lozenge — which is what a boot,
 * a glove and a forearm want.
 */
function box(w, h, d, x, y, z, part = BODY, sh = COAT, rx = 0, ry = 0, chf = CH) {
  const c = Math.min(Math.min(w, h, d) * chf, CH_MAX);
  return finish(chamferGeo(w, h, d, c), x, y, z, part, sh, rx, ry);
}

// A half-sphere sitting ON its own base plane, so `y` is the brim line and
// `ry` is how far it rises above it. Nine segments and three rings is 45
// triangles — cheaper than the chamfered box it replaces on a helmet.
function dome(rx_, ry_, rz_, x, y, z, part = BODY, sh = COAT, segs = 9, rings = 3) {
  const g = new THREE.SphereGeometry(1, segs, rings, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(rx_, ry_, rz_);
  return finish(g, x, y, z, part, sh);
}

// A whole low-poly ellipsoid. Shoulder ends, pauldrons, knuckles: the places a
// dome cannot go because the round part has to face sideways.
function ball(rx_, ry_, rz_, x, y, z, part = BODY, sh = COAT, segs = 8, rings = 5) {
  const g = new THREE.SphereGeometry(1, segs, rings);
  g.scale(rx_, ry_, rz_);
  return finish(g, x, y, z, part, sh);
}

function pairBall(out, rx_, ry_, rz_, x, y, z, partL, partR, sh = COAT) {
  out.push(ball(rx_, ry_, rz_, x * L, y, z, partL, sh));
  out.push(ball(rx_, ry_, rz_, x * R, y, z, partR, sh));
}

// A capped cylinder along one axis. Wheels, barrels, masts — the three things a
// box has never once managed to look like.
function cyl(r, len, x, y, z, part = BODY, sh = COAT, axis = 'y', segs = 10, rx = 0, ry = 0) {
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1, false);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return finish(g, x, y, z, part, sh, rx, ry);
}

// mergeParts carries position/normal/uv/aPart and nothing else, so the shell
// directions are concatenated by hand afterwards — in the same order, because
// mergeParts appends the list front to back.
function mergeUnit(parts) {
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const shell = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) { shell.set(g.userData.shell, o); o += g.attributes.position.count * 3; }
  const out = mergeParts(parts);
  out.setAttribute('aShell', new THREE.BufferAttribute(shell, 3));
  return out;
}

// Mirrored pair, one box per side, each tagged with its own part. Used for
// everything limbed: legs, arms, skids.
function pair(out, w, h, d, x, y, z, partL, partR, sh = COAT, rx = 0, ry = 0, chf = CH) {
  out.push(box(w, h, d, x * L, y, z, partL, sh, rx, ry * L, chf));
  out.push(box(w, h, d, x * R, y, z, partR, sh, rx, ry * R, chf));
}

// Mirrored domes: shoulder caps, pauldrons, hat crowns worn in pairs.
function pairDome(out, rx_, ry_, rz_, x, y, z, partL, partR, sh = COAT) {
  out.push(dome(rx_, ry_, rz_, x * L, y, z, partL, sh));
  out.push(dome(rx_, ry_, rz_, x * R, y, z, partR, sh));
}

// A pair of round wheels on a common axle. Tagged BODY for the reason in the
// vehicle header — a wheel tagged as a leg swings out of its own arch.
function wheelPair(out, r, wdt, x, z, sh = INK, segs = 10, y = r) {
  out.push(cyl(r, wdt, x * L, y, z, BODY, sh, 'x', segs));
  out.push(cyl(r, wdt, x * R, y, z, BODY, sh, 'x', segs));
}

// --------------------------------------------------------------------------
// Foot tiers
// --------------------------------------------------------------------------
//
// PROPORTION. The old man was a chunk on two 0.16 m sticks and at 30 m the
// sticks disappeared into the road, so the crowd read as a raft of floating
// cubes. These are 0.215 m thick and end in a 0.275 x 0.40 boot — the boot is
// wider than the leg, which is what stops the bottom of the unit dissolving.
// Hips stay on 0.78 and shoulders on 1.28 because the shader pivots there;
// "shorter legs" is bought by making the boot 0.23 m tall instead of 0.13, so
// the thin part of the leg is 0.55 m rather than 0.65 m and the mass sits low.
//
// The shoulder yoke is the other half of the trick. It is 0.62 m wide — wider
// than the helmet, wider than the torso — and GEAR dark, so from the camera's
// angle every man is a bright cap ringed by a dark collar. That ring is what
// separates one helmet from the next man's in a packed block.

// The common man. Everything below is this silhouette with things bolted on or
// cut away, which is deliberate: three foot tiers that share a stance read as
// one army at three ranks, not as three different games. Rifleman carries NO
// trim colour — he is the baseline a promotion is measured against.
function buildRifleman() {
  const p = [];
  // legs — top at 0.78, exactly the shader's hip line
  pair(p, 0.215, 0.58, 0.24, 0.140, 0.49, 0.005, LEG_L, LEG_R, LIMB, 0, 0, 0.42);
  // boots. Chamfered almost to a lozenge (0.50) and given a domed toe: the
  // bottom of a man is the first thing that dissolves at 30 m, and a rounded
  // lump survives that far better than a brick does.
  pair(p, 0.275, 0.22, 0.36, 0.145, 0.115, 0.030, LEG_L, LEG_R, INK, 0, 0, 0.50);
  pairDome(p, 0.135, 0.115, 0.115, 0.145, 0.100, 0.175, LEG_L, LEG_R, INK);
  // torso — stocky: 0.56 across, 0.38 deep, rounded hard
  p.push(box(0.56, 0.62, 0.38, 0, 1.05, 0, BODY, COAT, 0, 0, 0.34));
  p.push(box(0.60, 0.15, 0.42, 0, 0.795, 0, BODY, GEAR, 0, 0, 0.40));   // belt + pouches
  p.push(box(0.44, 0.32, 0.13, 0, 1.10, -0.245, BODY, GEAR, 0, 0, 0.42)); // back pouches
  // The shoulder yoke stays 0.64 across — wider than the helmet and the torso,
  // and GEAR dark, so every man is a bright cap ringed by a dark collar. It is
  // now a rounded bar capped with two half-ellipsoids rather than a slab, and
  // that is where most of the "less blocky" read comes from: the shoulders are
  // the widest thing on the man and the camera looks straight down on them.
  p.push(box(0.44, 0.16, 0.44, 0, 1.300, 0, BODY, GEAR, 0, 0, 0.50));   // shoulder bar
  pairBall(p, 0.108, 0.108, 0.200, 0.212, 1.300, 0, BODY, BODY, GEAR);  // shoulder ends
  // arms — the swing pivot is 1.28, and they are carried FORWARD (+z) so the
  // weapon they hold is out in front of the torso instead of inside it
  pair(p, 0.16, 0.42, 0.20, 0.335, 1.10, 0.07, ARM_L, ARM_R, COAT, 0, 0, 0.46);
  pair(p, 0.17, 0.15, 0.22, 0.320, 0.92, 0.16, ARM_L, ARM_R, INK, 0, 0, 0.50); // gloves
  // head
  p.push(box(0.18, 0.13, 0.18, 0, 1.44, 0, HEAD, INK, 0, 0, 0.44));     // neck
  p.push(box(0.25, 0.20, 0.25, 0, 1.52, 0, HEAD, GEAR, 0, 0, 0.38));
  // The helmet is a DOME on a brim, not a cube. It is 0.38 across against a
  // 0.62 yoke and a 0.56 torso — it was 0.42 as a box and that was too much: at
  // 39 degrees of depression a cap that wide covers its own man's shoulders and
  // back, the crowd loses its mid value and the weapons have nothing to be
  // silhouetted against. The brim keeps the bright top area a box gave for
  // free; the dome puts a soft highlight in the middle of it.
  p.push(box(0.38, 0.075, 0.40, 0, 1.585, -0.010, HEAD, HELM, 0, 0, 0.46)); // brim
  p.push(dome(0.185, 0.135, 0.195, 0, 1.615, -0.010, HEAD, HELM));          // -> 1.75
  p.push(box(0.36, 0.07, 0.10, 0, 1.545, -0.190, HEAD, INK, 0, 0, 0.44));   // nape shadow
  // The rifle, carried by the right arm so it rides the swing, at HIGH READY —
  // and the angle is arithmetic, not styling. Screen height on this camera is
  // 0.777*y + 0.629*z, so a man's own helmet sits at 1.28 and the next rank's,
  // 0.62 m ahead, at 1.67. A rifle held level at chest height lands at 1.21:
  // squarely in the dark body mass, where an INK bar is invisible. Raked up to
  // muzzle (y 1.72, z 0.60) it lands at 1.71 — across the NEXT man's bright
  // helmet, and still nearer the camera than he is, so it draws over him. That
  // is the difference between "no weapon reads" and a field of dark bars.
  p.push(cyl(0.062, 0.85, -0.30, 1.53, 0.22, ARM_R, INK, 'z', 8, -0.465));
  p.push(box(0.15, 0.20, 0.24, -0.30, 1.36, -0.20, ARM_R, INK, -0.465, 0, 0.40)); // stock
  p.push(box(0.10, 0.20, 0.13, -0.30, 1.33, 0.14, ARM_R, INK, 0, 0, 0.40));       // magazine
  return mergeUnit(p);
}

// Longer gun, bigger load, and a SAND hat. The hat and the pack are what you
// actually see at 40 m — a ranger in a crowd of riflemen has to be legible
// from behind, and from behind the pack is the whole torso.
function buildRanger() {
  const p = [];
  pair(p, 0.205, 0.58, 0.23, 0.135, 0.49, 0.005, LEG_L, LEG_R, LIMB, 0, 0, 0.42);
  pair(p, 0.265, 0.22, 0.36, 0.140, 0.115, 0.030, LEG_L, LEG_R, INK, 0, 0, 0.50);
  pairDome(p, 0.130, 0.115, 0.115, 0.140, 0.100, 0.175, LEG_L, LEG_R, INK);
  p.push(box(0.54, 0.62, 0.36, 0, 1.05, 0.01, BODY, COAT, 0, 0, 0.34));
  p.push(box(0.58, 0.15, 0.40, 0, 0.795, 0, BODY, GEAR, 0, 0, 0.40));
  p.push(box(0.42, 0.16, 0.42, 0, 1.305, 0, BODY, GEAR, 0, 0, 0.50));   // yoke
  pairBall(p, 0.105, 0.105, 0.195, 0.205, 1.305, 0, BODY, BODY, GEAR);
  // the pack: the tier's whole read from the camera's angle. Rounded off hard —
  // a domed bedroll on top of it is the shape that says "kit", not "crate".
  p.push(box(0.46, 0.52, 0.30, 0, 1.09, -0.30, BODY, GEAR, 0, 0, 0.34));
  p.push(dome(0.235, 0.130, 0.155, 0, 1.350, -0.30, BODY, TRIM));       // bedroll — sand
  p.push(cyl(0.032, 0.50, -0.19, 1.62, -0.32, BODY, INK, 'y', 6));      // antenna
  pair(p, 0.155, 0.42, 0.19, 0.325, 1.10, 0.08, ARM_L, ARM_R, COAT, 0, 0, 0.46);
  pair(p, 0.165, 0.15, 0.21, 0.310, 0.92, 0.17, ARM_L, ARM_R, INK, 0, 0, 0.50);
  p.push(box(0.18, 0.13, 0.18, 0, 1.44, 0, HEAD, INK, 0, 0, 0.44));
  p.push(box(0.25, 0.20, 0.25, 0, 1.52, 0, HEAD, GEAR, 0, 0, 0.38));
  // boonie: wider and flatter than a helmet, and SAND, so the crowd changes
  // both shape and colour the moment the squad promotes. The brim is a disc and
  // the crown a dome — from directly above, a round hat among round helmets is
  // still unmistakable because it is a third wider and a different hue.
  p.push(cyl(0.235, 0.075, 0, 1.615, 0, HEAD, TRIM, 'y', 10));          // brim
  p.push(dome(0.150, 0.125, 0.150, 0, 1.625, 0, HEAD, TRIM));           // crown -> 1.75
  // marksman rifle: longer barrel, a scope, and a bipod hanging off the front
  p.push(cyl(0.060, 1.06, -0.30, 1.56, 0.30, ARM_R, INK, 'z', 8, -0.44));
  p.push(box(0.14, 0.21, 0.28, -0.30, 1.50, 0.16, ARM_R, INK, -0.44, 0, 0.40)); // scope
  p.push(box(0.16, 0.20, 0.24, -0.30, 1.35, -0.19, ARM_R, INK, -0.44, 0, 0.40)); // stock
  p.push(box(0.10, 0.19, 0.13, -0.30, 1.36, 0.16, ARM_R, INK, 0, 0, 0.40));      // magazine
  p.push(box(0.24, 0.06, 0.16, -0.30, 1.74, 0.68, ARM_R, INK, 0, 0, 0.40));      // bipod
  return mergeUnit(p);
}

// Squat, wide, plated, and flashed in ICE on both shoulders. The shield is a
// slab on the left arm and the LMG is a drum-fed brick on the right, so the
// heavy's outline is asymmetric — that plus two bright pauldrons is how you
// pick him out of 300 blue men at a glance.
function buildHeavy() {
  const p = [];
  pair(p, 0.245, 0.58, 0.26, 0.155, 0.49, 0.005, LEG_L, LEG_R, LIMB, 0, 0, 0.42);
  pair(p, 0.305, 0.23, 0.38, 0.160, 0.120, 0.030, LEG_L, LEG_R, INK, 0, 0, 0.50);
  pairDome(p, 0.150, 0.120, 0.120, 0.160, 0.105, 0.185, LEG_L, LEG_R, INK);
  p.push(box(0.66, 0.60, 0.44, 0, 1.04, 0, BODY, COAT, 0, 0, 0.34));
  p.push(box(0.70, 0.16, 0.48, 0, 0.785, 0, BODY, GEAR, 0, 0, 0.42));
  p.push(box(0.56, 0.44, 0.14, 0, 1.10, -0.28, BODY, PLATE, 0, 0, 0.44)); // backplate
  p.push(box(0.52, 0.44, 0.13, 0, 1.08, 0.26, BODY, GEAR, 0, 0, 0.44));   // breastplate
  p.push(box(0.52, 0.17, 0.46, 0, 1.295, 0, BODY, GEAR, 0, 0, 0.50));     // yoke
  pairBall(p, 0.115, 0.115, 0.215, 0.245, 1.295, 0, BODY, BODY, GEAR);
  // pauldrons — domes, not slabs. They are the heavy's signature from directly
  // above and a round one catches the sun across its whole width.
  pairDome(p, 0.155, 0.135, 0.190, 0.360, 1.290, 0, ARM_L, ARM_R, PLATE);
  pair(p, 0.18, 0.40, 0.21, 0.375, 1.08, 0.07, ARM_L, ARM_R, COAT, 0, 0, 0.46);
  pair(p, 0.19, 0.16, 0.23, 0.360, 0.90, 0.16, ARM_L, ARM_R, INK, 0, 0, 0.50);
  // shield, left arm — swings with the arm, which reads as bracing
  p.push(box(0.13, 0.72, 0.58, 0.53, 1.06, 0.10, ARM_L, GEAR, 0, 0, 0.34));
  p.push(ball(0.075, 0.150, 0.140, 0.600, 1.06, 0.10, ARM_L, TRIM2));     // boss — ice
  p.push(box(0.19, 0.13, 0.19, 0, 1.42, 0, HEAD, INK, 0, 0, 0.44));
  p.push(box(0.27, 0.19, 0.27, 0, 1.51, 0, HEAD, GEAR, 0, 0, 0.38));
  p.push(box(0.40, 0.085, 0.42, 0, 1.575, -0.010, HEAD, TRIM2, 0, 0, 0.46)); // brim
  p.push(dome(0.195, 0.130, 0.205, 0, 1.618, -0.010, HEAD, TRIM2));          // ice dome
  p.push(box(0.38, 0.08, 0.12, 0, 1.535, -0.185, HEAD, INK, 0, 0, 0.44));    // nape guard
  // LMG
  p.push(cyl(0.075, 0.92, -0.35, 1.51, 0.24, ARM_R, INK, 'z', 8, -0.44));
  p.push(box(0.17, 0.22, 0.26, -0.35, 1.34, -0.20, ARM_R, INK, -0.44, 0, 0.40)); // stock
  p.push(cyl(0.140, 0.24, -0.35, 1.30, 0.14, ARM_R, INK, 'x', 9));               // drum
  return mergeUnit(p);
}

// --------------------------------------------------------------------------
// Vehicle tiers
// --------------------------------------------------------------------------
//
// Wheels are tagged BODY, not LEG_L/LEG_R. The shader swings parts 1 and 2
// fore/aft about y = 0.78 by up to 0.43 m at a run — on a leg that is a stride,
// on a wheel it is the axle sliding out of the arch. So vehicles ride flat and
// take only the whole-body bounce, which reads as suspension over a bad road.
// The turret/cupola is tagged HEAD, so it gets the counter-bob and jiggles.
//
// Every vehicle is built no taller than a soldier (~1.75 m) on purpose: TIERS
// scales them up to 1.30x and the brief's ceiling is 1.3x a man. The moment one
// unit dwarfs the rest the crowd stops reading as a crowd.
//
// From 39 degrees above, a vehicle is a ROOF. So the roof is always the
// brightest thing on it, the flanks are GEAR, the running gear is INK, and the
// tier accent is a stripe painted straight down the middle of the roof where
// nothing can hide it.

// Round wheels, at last. A cylinder at ten segments is 40 triangles against a
// box's 12, and it is the single biggest "less blocky" win on every vehicle in
// the ladder — from directly above a vehicle is a roof and four dark discs.
function wheels(p, r, x, zs, w = 0.30) {
  for (const z of zs) wheelPair(p, r, w, x, z);
}

function buildJeep() {
  const p = [];
  wheels(p, 0.32, 0.74, [0.88, -0.86]);
  p.push(box(1.52, 0.46, 2.50, 0, 0.72, 0, BODY, GEAR, 0, 0, 0.34));   // hull
  p.push(box(1.40, 0.30, 0.94, 0, 1.04, 0.76, BODY, HELM, 0, 0, 0.34)); // bonnet
  p.push(box(0.32, 0.07, 0.84, 0, 1.215, 0.76, BODY, TRIM));           // bonnet stripe
  p.push(box(1.30, 0.36, 0.92, 0, 1.11, -0.28, BODY, INK, 0, 0, 0.34)); // crew bay
  p.push(box(1.36, 0.12, 0.10, 0, 1.33, 0.24, BODY, GEAR));            // screen frame
  pair(p, 0.11, 0.52, 0.11, 0.60, 1.45, -0.60, BODY, BODY, INK, 0, 0, 0.45); // roll bar
  p.push(box(1.32, 0.11, 0.11, 0, 1.66, -0.60, BODY, INK, 0, 0, 0.45));
  p.push(box(1.56, 0.34, 0.16, 0, 0.76, 1.32, BODY, INK, 0, 0, 0.40)); // bull bar
  pairBall(p, 0.085, 0.110, 0.075, 0.62, 1.12, 1.26, BODY, BODY, PLATE); // headlamps
  p.push(box(0.30, 0.22, 0.30, 0, 1.36, -0.42, HEAD, GEAR, 0, 0, 0.40)); // pintle mount
  p.push(cyl(0.065, 0.90, 0, 1.51, -0.06, HEAD, INK, 'z', 8));         // mounted MG
  return mergeUnit(p);
}

function buildHumvee() {
  const p = [];
  wheels(p, 0.36, 0.86, [1.02, -1.00], 0.34);
  p.push(box(1.80, 0.52, 2.90, 0, 0.70, 0, BODY, GEAR, 0, 0, 0.34));
  p.push(box(1.70, 0.34, 1.02, 0, 1.02, 0.98, BODY, PLATE, 0, 0, 0.34)); // bonnet
  p.push(box(1.62, 0.56, 1.70, 0, 1.20, -0.35, BODY, COAT, 0, 0, 0.30)); // cab
  p.push(box(1.68, 0.12, 1.76, 0, 1.52, -0.35, BODY, HELM, 0, 0, 0.40)); // roof
  p.push(box(0.38, 0.08, 1.66, 0, 1.60, -0.35, BODY, TRIM2));          // roof stripe — ice
  p.push(box(1.56, 0.34, 0.08, 0, 1.28, 0.50, BODY, INK, -0.32));      // raked screen
  p.push(box(1.84, 0.38, 0.18, 0, 0.74, 1.52, BODY, INK, 0, 0, 0.40)); // brush guard
  pairBall(p, 0.095, 0.120, 0.080, 0.72, 1.10, 1.48, BODY, BODY, TRIM2); // lamps
  p.push(cyl(0.310, 0.26, 0, 1.66, -0.30, HEAD, GEAR, 'y', 10));       // cupola ring
  p.push(cyl(0.072, 0.84, 0.10, 1.72, 0.14, HEAD, INK, 'z', 8));       // turret gun
  return mergeUnit(p);
}

function buildApc() {
  const p = [];
  wheels(p, 0.34, 0.90, [1.14, 0.02, -1.12], 0.32);
  p.push(box(1.86, 0.62, 3.20, 0, 0.66, 0, BODY, INK, 0, 0, 0.30));    // lower hull
  p.push(box(1.76, 0.48, 2.60, 0, 1.14, -0.20, BODY, GEAR, 0, 0, 0.34)); // upper hull
  p.push(box(1.70, 0.52, 0.90, 0, 1.02, 1.28, BODY, PLATE, -0.42, 0, 0.34)); // glacis
  p.push(box(1.52, 0.14, 1.70, 0, 1.40, -0.42, BODY, HELM, 0, 0, 0.40)); // roof deck
  p.push(box(0.36, 0.08, 1.58, 0, 1.49, -0.42, BODY, TRIM));           // deck stripe — sand
  pair(p, 0.11, 0.30, 2.40, 0.94, 1.18, -0.20, BODY, BODY, INK, 0, 0, 0.40); // skirts
  p.push(box(1.40, 0.62, 0.14, 0, 1.00, -1.62, BODY, GEAR, 0, 0, 0.40)); // ramp
  pairBall(p, 0.095, 0.130, 0.075, 0.72, 1.00, 1.68, BODY, BODY, PLATE); // lamps
  p.push(box(0.80, 0.26, 0.86, 0, 1.55, 0.24, HEAD, PLATE, 0, 0, 0.34)); // turret
  p.push(dome(0.400, 0.130, 0.430, 0, 1.680, 0.24, HEAD, TRIM, 10, 2)); // turret cap
  p.push(cyl(0.070, 0.98, 0.08, 1.58, 0.80, HEAD, INK, 'z', 8));       // autocannon
  return mergeUnit(p);
}

function buildTank() {
  const p = [];
  pair(p, 0.46, 0.70, 3.40, 0.80, 0.35, 0, BODY, BODY, INK, 0, 0, 0.34); // tracks
  for (const z of [1.15, 0.40, -0.40, -1.15]) {
    wheelPair(p, 0.16, 0.52, 0.80, z, GEAR, 8, 0.46);                  // road wheels
  }
  p.push(box(1.70, 0.46, 3.10, 0, 0.76, 0, BODY, GEAR, 0, 0, 0.34));   // hull
  p.push(box(1.62, 0.34, 0.96, 0, 0.94, 1.32, BODY, PLATE, -0.50, 0, 0.34)); // glacis
  p.push(box(1.52, 0.22, 2.20, 0, 1.07, -0.30, BODY, GEAR, 0, 0, 0.40)); // deck
  p.push(box(1.06, 0.45, 1.34, 0, 1.335, -0.10, HEAD, HELM, 0, 0, 0.34)); // turret
  p.push(cyl(0.370, 0.24, 0, 1.62, -0.34, HEAD, TRIM2, 'y', 10));      // cupola — steel
  p.push(box(1.06, 0.09, 0.44, 0, 1.605, 0.30, HEAD, TRIM2));          // turret band
  p.push(cyl(0.110, 1.90, 0, 1.32, 1.16, HEAD, INK, 'z', 9));          // main gun
  p.push(cyl(0.155, 0.34, 0, 1.32, 1.90, HEAD, INK, 'z', 9));          // muzzle brake
  p.push(cyl(0.055, 0.48, 0.36, 1.60, 0.30, HEAD, INK, 'z', 6));       // coax
  return mergeUnit(p);
}

// The gunship hovers — army.js lifts it off the deck, so the skids are still
// modelled at y = 0 and the whole unit floats as one.
//
// The rotor is aPart 6, which toon.js spins about the model's Y axis through
// the ORIGIN — so the disc has to be centred on x = 0, z = 0 or it orbits
// instead of spinning. The fuselage is shifted forward to put the mast there.
// The tail rotor stays part 5: a part-6 tag at z = -2.4 would swing it around
// the aircraft like a bolas.
function buildGunship() {
  const p = [];
  pair(p, 0.11, 0.11, 1.90, 0.66, 0.06, -0.20, BODY, BODY, INK, 0, 0, 0.45); // skids
  pair(p, 0.09, 0.42, 0.11, 0.60, 0.30, 0.24, BODY, BODY, INK, 0, 0, 0.45);  // struts
  pair(p, 0.09, 0.42, 0.11, 0.60, 0.30, -0.64, BODY, BODY, INK, 0, 0, 0.45);
  p.push(box(1.06, 0.74, 2.10, 0, 0.90, 0, BODY, GEAR, 0, 0, 0.34));   // fuselage
  p.push(box(0.88, 0.52, 0.80, 0, 0.94, 1.14, BODY, INK, -0.38, 0, 0.34)); // canopy
  p.push(ball(0.350, 0.190, 0.230, 0, 0.82, 1.52, BODY, PLATE));       // nose
  p.push(box(0.90, 0.10, 1.30, 0, 1.26, -0.30, BODY, HELM, 0, 0, 0.42)); // spine deck
  p.push(box(0.42, 0.42, 1.70, 0, 1.06, -1.82, BODY, GEAR, 0, 0, 0.40)); // tail boom
  p.push(box(0.15, 0.46, 0.44, 0, 1.29, -2.52, BODY, PLATE, 0, 0, 0.42)); // tail fin
  p.push(box(0.15, 0.18, 0.44, 0, 1.61, -2.52, BODY, TRIM, 0, 0, 0.42)); // fin flash
  pair(p, 0.62, 0.10, 0.26, 0.34, 1.16, -2.40, BODY, BODY, INK, 0, 0, 0.45); // stabiliser
  pair(p, 0.17, 0.26, 0.62, 0.62, 0.86, 0.10, BODY, BODY, GEAR, 0, 0, 0.40); // stub wings
  for (const s of [L, R]) p.push(cyl(0.115, 0.72, 0.94 * s, 0.84, 0.10, BODY, INK, 'z', 8));
  p.push(cyl(0.150, 0.32, 0, 1.40, 0, BODY, INK, 'y', 8));             // rotor mast
  // rotor disc: three crossed blades on the spinner part, centred on the mast
  for (let k = 0; k < 3; k++) {
    p.push(box(2.40, 0.05, 0.17, 0, 1.58, 0, SPIN, INK, 0, k * Math.PI / 3, 0.45));
  }
  p.push(box(0.06, 0.88, 0.16, 0.17, 1.28, -2.52, HEAD, INK, 0, 0, 0.45)); // tail rotor
  return mergeUnit(p);
}

const BUILDERS = {
  rifleman: buildRifleman, ranger: buildRanger, heavy: buildHeavy,
  jeep: buildJeep, humvee: buildHumvee, apc: buildApc,
  tank: buildTank, gunship: buildGunship,
};

// --------------------------------------------------------------------------
// Per-tier layout facts army.js and enemies.js need but should not guess at
// --------------------------------------------------------------------------

// How much road one unit of this tier needs, in metres, across and along. Men
// pack shoulder to shoulder at exactly RUN.formSpacing — that number is what
// makes 300 of them the 11 m x 9 m block the brief describes. Vehicles get
// theirs measured off their own bounding box instead, because a jeep is three
// men wide and four long and no hand-written constant survives someone making
// the tank a bit longer.
//
// SNUG is how much overlap the style tolerates: a crowd of men should touch,
// a column of tanks should not.
const SNUG = { foot: 1, vehicle: 1.06, air: 0.95 };
const spacingCache = new Map();

// Muzzle height in model space — where combat.js should hang a flash.
const MUZZLE = { foot: 1.17, vehicle: 1.36, air: 0.86 };

// Vertical offset. Only the gunship leaves the ground.
const HOVER = { foot: 0, vehicle: 0, air: 1.35 };

const tierIndexOf = (t) => {
  if (typeof t === 'number') return Math.max(0, Math.min(TIERS.length - 1, t | 0));
  const i = TIERS.findIndex((d) => d.id === t);
  return i < 0 ? 0 : i;
};

/** Formation footprint of one unit of this tier, in metres: `{ x, z }`. */
export function tierSpacing(t) {
  const d = TIERS[tierIndexOf(t)];
  let s = spacingCache.get(d.id);
  if (s) return s;
  if (d.kind === 'foot') {
    s = { x: RUN.formSpacing, z: RUN.formSpacing };
  } else {
    const g = tierGeometry(d.id);
    g.computeBoundingBox();
    const b = g.boundingBox, k = d.scale * SNUG[d.kind];
    s = { x: (b.max.x - b.min.x) * k, z: (b.max.z - b.min.z) * k };
  }
  spacingCache.set(d.id, s);
  return s;
}

export const tierMuzzle = (t) => MUZZLE[TIERS[tierIndexOf(t)].kind] ?? 1.17;
export const tierHover = (t) => HOVER[TIERS[tierIndexOf(t)].kind] ?? 0;

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initUnits(ctx) {
  ctxRef = ctx;
  // Geometries are built lazily on first use. A run that never promotes past
  // rifleman should not pay to merge eight units at boot, and boot time is the
  // one budget a phone player actually feels.
  return ctx;
}

/** Master geometry for a tier, by id or index. Cached — never dispose this. */
export function tierGeometry(tierId) {
  const t = TIERS[tierIndexOf(tierId)];
  let g = geoCache.get(t.id);
  if (!g) { g = (BUILDERS[t.id] || buildRifleman)(); geoCache.set(t.id, g); }
  return g;
}

/**
 * An instanced crowd of one tier, wired to the house palette.
 *
 * The geometry is CLONED per crowd on purpose: makeCrowd hangs its own
 * `aPhase`/`aAnim`/`aTint` instanced attributes off the geometry it is given,
 * so two crowds sharing one geometry would animate off each other's buffers and
 * the enemy would inherit your squad's gait. The clone is cheap — a few hundred
 * vertices — and crowd.dispose() then only frees its own copy.
 *
 * The palette texture is NOT cloned: it is cached per colour and shared, so
 * your blue squad's eight tiers are one 8x1 texture between them.
 */
export function makeTierCrowd(tierIndex, opts = {}) {
  const i = tierIndexOf(tierIndex);
  const t = TIERS[i];
  const src = opts.color ?? t.color;
  const hex = typeof src === 'number' ? src : new THREE.Color(src).getHex();
  const cols = shades(hex);

  // A caller that brings its own map is asking for the old behaviour: the tier
  // colour on the material, the map modulating it. Otherwise the colour lives
  // in the palette and the material is white.
  const custom = !!opts.map;
  const crowd = makeCrowd(tierGeometry(t.id).clone(), {
    color: custom ? new THREE.Color(hex).offsetHSL(0, 0.20, 0.04) : 0xffffff,
    map: opts.map ?? paletteTex(hex),
    max: Math.max(1, opts.max ?? 512),
    // Thick, and thicker on vehicles: a bigger unit at the same outline reads
    // as a thinner line, and this look lives or dies on that line staying fat.
    outline: opts.outline ?? (t.kind === 'foot' ? 0.045 : 0.065),
    outlineColor: opts.outlineColor ?? PAL.signStroke,
    castShadow: opts.castShadow !== false,
    // A little self-emission so the away faces are still the unit's own colour
    // instead of a hole. Kept low and taken from the DARKEST body step, not the
    // base colour: emissive is added flat after the map, so a bright emissive
    // lifts the boots and the weapon and washes the contrast straight back out.
    emissive: opts.emissive ?? new THREE.Color().setRGB(
      cols[LIMB][0], cols[LIMB][1], cols[LIMB][2], THREE.SRGBColorSpace),
    emissiveIntensity: opts.emissiveIntensity ?? 0.35,
    tint: opts.tint,
  });
  fixOutlineNormals(crowd);
  // What applyRank() needs to rebuild the palette later. A caller that brought
  // its own map is opting out of the palette entirely, so it opts out of rank
  // shading too rather than having its texture swapped out from under it.
  crowd.userData = { baseColor: hex, rankable: !custom };
  return crowd;
}

// The outline shell in toon.js is pushed along `normalize(objectNormal)`, which
// is the FACE normal — on a box that blows the six faces apart at the corners.
// Every unit here carries an `aShell` attribute holding the mitred corner
// direction instead (see shellDirs), and this swaps the one line that uses it.
// Purely additive: if toon.js's wording ever changes, the fallback leaves the
// stock push in place and the outline is merely blocky, never absent.
function fixOutlineNormals(crowd) {
  const om = crowd?.outline?.material;
  if (!om) return crowd;
  const prev = om.onBeforeCompile;
  const PUSH = 'transformed += normalize(objectNormal) * uThick;';
  om.onBeforeCompile = (s) => {
    if (prev) prev(s);
    if (s.vertexShader.includes(PUSH)) {
      s.vertexShader = 'attribute vec3 aShell;\n' +
        s.vertexShader.replace(PUSH, 'transformed += aShell * uThick;');
    }
  };
  om.needsUpdate = true;
  return crowd;
}

export function disposeUnits() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  spacingCache.clear();
  for (const t of palCache.values()) t.dispose();
  palCache.clear();
  ctxRef = null;
}
