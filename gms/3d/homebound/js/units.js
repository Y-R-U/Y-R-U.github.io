// The tier ladder's geometry. One BufferGeometry per entry in config.js:TIERS,
// built entirely out of tagged boxes so `toon.js`'s crowd shader can walk a
// soldier with no bones, no skinning and no per-unit CPU work.
//
// The `aPart` tag on every vertex is the whole rig:
//
//   0 body   1 leg-left   2 leg-right   3 arm-left   4 arm-right   5 head
//
// The shader pivots legs at y = 0.78 and arms at y = 1.28, so every foot unit
// is built to human proportion at ~1.7 m with its hips and shoulders on those
// two lines. Move a soldier's hips and his legs start swinging from his knees.
//
// A tier gets ONE material and one colour, because 400 men have to be two draw
// calls. That leaves silhouette as the only way to tell a ranger from a heavy —
// hence the pack, the antenna, the shield slab — and it leaves a man in a crowd
// of 400 with no internal contrast at all, which is the difference between the
// reference frames and a field of blue lumps. So there is a second channel:
// every box is also tagged with a SHADE, written into its uv, and the material
// samples a five-step grey ramp with it. Helmet bright, torso base, legs mid,
// boots and weapon nearly black — per-part shading, still one draw call.

import * as THREE from 'three';
import { TIERS, PAL, RUN } from './config.js';
import { partBox, mergeParts, makeCrowd } from './toon.js';

const BODY = 0, LEG_L = 1, LEG_R = 2, ARM_L = 3, ARM_R = 4, HEAD = 5;

// Facing +Z (the road runs away from the camera), +Y up. Facing that way the
// unit's own left hand is at +X, so parts 1/3 live at +X and 2/4 at -X — the
// shader swings left-leg against left-arm, which is only a correct gait if the
// two are on the same side of the body.
const L = 1, R = -1;

// Shade slots. Index into the ramp below; multiplies the tier colour.
const LIGHT = 0, BASE = 1, MID = 2, DARK = 3, INK = 4;
const RAMP = [255, 214, 168, 118, 62];

let ctxRef = null;
const geoCache = new Map();     // tier id -> master BufferGeometry
let rampTex = null;

// The ramp is a 5x1 nearest-filtered texture, shared by every crowd in the
// game. Nearest and no mipmaps on purpose: a linear filter would blend the
// five steps into one grey the moment the crowd is more than 30 m out, which
// is exactly when the contrast is doing the most work.
function ramp() {
  if (rampTex) return rampTex;
  const px = new Uint8Array(RAMP.length * 4);
  for (let i = 0; i < RAMP.length; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = RAMP[i];
    px[i * 4 + 3] = 255;
  }
  rampTex = new THREE.DataTexture(px, RAMP.length, 1, THREE.RGBAFormat);
  rampTex.colorSpace = THREE.SRGBColorSpace;
  rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter;
  rampTex.generateMipmaps = false;
  rampTex.needsUpdate = true;
  return rampTex;
}

// --------------------------------------------------------------------------
// Box helpers
// --------------------------------------------------------------------------

/**
 * partBox, plus a shade slot and an optional turn. partBox can only translate,
 * and a rifle lying across a chest or a sloped glacis plate has to be turned
 * first; the uv rewrite is what carries the shade into the fragment shader.
 */
function box(w, h, d, x, y, z, part = BODY, sh = BASE, rx = 0, ry = 0) {
  let g;
  if (rx || ry) {
    g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  } else {
    g = partBox(w, h, d, x, y, z, part);
  }
  const uv = g.attributes.uv.array;
  const u = (sh + 0.5) / RAMP.length;
  for (let i = 0; i < uv.length; i += 2) { uv[i] = u; uv[i + 1] = 0.5; }
  g.userData.shell = shellDirs(g);
  return g;
}

/**
 * The mitre direction for the outline shell, one vector per vertex.
 *
 * An inverted hull pushed along the FACE normal tears a box apart: each of the
 * six faces slides out on its own axis and the corners come away as loose
 * quads, which at any outline thick enough to read looks like the model exploded. Summing the
 * three face normals that meet at a corner gives (+/-1, +/-1, +/-1) instead —
 * push along that, unnormalised, and every face plane moves out by exactly
 * uThick while the corners mitre and the shell stays closed. Summing normals
 * rather than using the corner's sign also gets rotated boxes right for free.
 */
function shellDirs(g) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  const n = g.attributes.position.count;
  const out = new Float32Array(n * 3);
  const corners = new Map();
  const key = (i) => `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let a = corners.get(k);
    if (!a) corners.set(k, a = [0, 0, 0]);
    a[0] += nor[i * 3]; a[1] += nor[i * 3 + 1]; a[2] += nor[i * 3 + 2];
  }
  for (let i = 0; i < n; i++) {
    const a = corners.get(key(i));
    out[i * 3] = a[0]; out[i * 3 + 1] = a[1]; out[i * 3 + 2] = a[2];
  }
  return out;
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
// everything limbed: legs, arms, wheels, skids.
function pair(out, w, h, d, x, y, z, partL, partR, sh = BASE, rx = 0, ry = 0) {
  out.push(box(w, h, d, x * L, y, z, partL, sh, rx, ry * L));
  out.push(box(w, h, d, x * R, y, z, partR, sh, rx, ry * R));
}

// --------------------------------------------------------------------------
// Foot tiers
// --------------------------------------------------------------------------

// The common man. Everything below is this silhouette with things bolted on or
// cut away, which is deliberate: three foot tiers that share a stance read as
// one army at three ranks, not as three different games.
function buildRifleman() {
  const p = [];
  // legs — top at 0.78, exactly the shader's hip line
  pair(p, 0.16, 0.78, 0.19, 0.115, 0.39, 0, LEG_L, LEG_R, MID);
  pair(p, 0.19, 0.13, 0.29, 0.115, 0.065, 0.05, LEG_L, LEG_R, INK);   // boots
  // torso
  p.push(box(0.44, 0.58, 0.30, 0, 1.07, 0, BODY, BASE));
  p.push(box(0.48, 0.13, 0.34, 0, 0.83, 0, BODY, DARK));              // belt + pouches
  p.push(box(0.36, 0.30, 0.11, 0, 1.11, 0.19, BODY, DARK));           // chest rig
  p.push(box(0.46, 0.14, 0.30, 0, 1.32, 0, BODY, DARK));              // shoulder yoke
  // arms — the swing pivot is 1.28, so the shoulder sits right under the yoke
  pair(p, 0.14, 0.40, 0.16, 0.29, 1.10, 0.01, ARM_L, ARM_R, BASE);
  pair(p, 0.15, 0.13, 0.18, 0.28, 0.90, 0.06, ARM_L, ARM_R, INK);     // gloves
  // head
  p.push(box(0.15, 0.09, 0.15, 0, 1.42, 0, HEAD, DARK));              // neck
  p.push(box(0.25, 0.23, 0.25, 0, 1.55, 0, HEAD, MID));
  p.push(box(0.33, 0.17, 0.35, 0, 1.66, -0.01, HEAD, LIGHT));         // helmet
  p.push(box(0.33, 0.05, 0.11, 0, 1.585, 0.20, HEAD, DARK));          // brim
  // rifle, carried by the right arm so it rides the swing
  p.push(box(0.07, 0.11, 0.60, -0.11, 1.13, 0.20, ARM_R, INK, 0.05));
  p.push(box(0.06, 0.17, 0.10, -0.11, 1.01, 0.14, ARM_R, INK));       // magazine
  p.push(box(0.08, 0.14, 0.18, -0.11, 1.10, -0.16, ARM_R, INK));      // stock
  return mergeUnit(p);
}

// Longer gun, bigger load. The pack and the antenna are what you actually see
// at 40 m — a ranger in a crowd of riflemen has to be legible from behind.
function buildRanger() {
  const p = [];
  pair(p, 0.15, 0.80, 0.18, 0.11, 0.40, 0, LEG_L, LEG_R, MID);
  pair(p, 0.18, 0.13, 0.30, 0.11, 0.065, 0.05, LEG_L, LEG_R, INK);
  p.push(box(0.42, 0.58, 0.28, 0, 1.08, 0.01, BODY, BASE));
  p.push(box(0.46, 0.12, 0.32, 0, 0.84, 0, BODY, DARK));
  p.push(box(0.34, 0.34, 0.11, 0, 1.12, 0.18, BODY, DARK));
  p.push(box(0.44, 0.13, 0.28, 0, 1.33, 0, BODY, DARK));
  // the pack: the tier's whole read from the camera's angle
  p.push(box(0.40, 0.50, 0.26, 0, 1.10, -0.26, BODY, MID));
  p.push(box(0.44, 0.14, 0.15, 0, 1.39, -0.27, BODY, INK));           // bedroll
  p.push(box(0.05, 0.52, 0.05, -0.16, 1.62, -0.28, BODY, INK));       // antenna
  pair(p, 0.13, 0.40, 0.15, 0.275, 1.10, 0.02, ARM_L, ARM_R, BASE);
  pair(p, 0.14, 0.13, 0.17, 0.265, 0.90, 0.07, ARM_L, ARM_R, INK);
  p.push(box(0.15, 0.09, 0.15, 0, 1.43, 0, HEAD, DARK));
  p.push(box(0.24, 0.23, 0.24, 0, 1.56, 0, HEAD, MID));
  p.push(box(0.40, 0.05, 0.40, 0, 1.665, 0, HEAD, LIGHT));            // boonie brim
  p.push(box(0.25, 0.11, 0.25, 0, 1.72, 0, HEAD, LIGHT));             // crown
  // marksman rifle: longer barrel, a scope, and a bipod hanging off the front
  p.push(box(0.06, 0.10, 0.92, -0.11, 1.14, 0.30, ARM_R, INK, 0.04));
  p.push(box(0.06, 0.11, 0.26, -0.11, 1.24, 0.20, ARM_R, INK));       // scope
  p.push(box(0.06, 0.16, 0.09, -0.11, 1.02, 0.16, ARM_R, INK));
  p.push(box(0.08, 0.13, 0.18, -0.11, 1.11, -0.16, ARM_R, INK));
  p.push(box(0.17, 0.14, 0.05, -0.11, 1.04, 0.68, ARM_R, INK));       // bipod
  return mergeUnit(p);
}

// Squat, wide, plated. The shield is a slab on the left arm and the LMG is a
// drum-fed brick on the right, so the heavy's outline is asymmetric — that is
// how you pick him out of 300 blue men at a glance.
function buildHeavy() {
  const p = [];
  pair(p, 0.19, 0.74, 0.21, 0.135, 0.37, 0, LEG_L, LEG_R, MID);
  pair(p, 0.22, 0.14, 0.31, 0.135, 0.07, 0.05, LEG_L, LEG_R, INK);
  p.push(box(0.54, 0.56, 0.36, 0, 1.04, 0, BODY, BASE));
  p.push(box(0.58, 0.15, 0.40, 0, 0.82, 0, BODY, DARK));
  p.push(box(0.50, 0.46, 0.13, 0, 1.08, 0.23, BODY, LIGHT));          // breastplate
  p.push(box(0.44, 0.30, 0.11, 0, 1.06, -0.22, BODY, DARK));          // backplate
  p.push(box(0.58, 0.16, 0.36, 0, 1.30, 0, BODY, DARK));              // yoke
  pair(p, 0.18, 0.21, 0.28, 0.33, 1.32, 0, ARM_L, ARM_R, MID);        // pauldrons
  pair(p, 0.16, 0.38, 0.18, 0.325, 1.08, 0.01, ARM_L, ARM_R, BASE);
  pair(p, 0.17, 0.14, 0.19, 0.315, 0.89, 0.06, ARM_L, ARM_R, INK);
  // shield, left arm — swings with the arm, which reads as bracing
  p.push(box(0.11, 0.66, 0.52, 0.46, 1.06, 0.06, ARM_L, MID));
  p.push(box(0.07, 0.22, 0.20, 0.535, 1.06, 0.06, ARM_L, INK));       // boss
  p.push(box(0.16, 0.10, 0.16, 0, 1.38, 0, HEAD, DARK));
  p.push(box(0.27, 0.22, 0.27, 0, 1.50, 0, HEAD, MID));
  p.push(box(0.36, 0.20, 0.38, 0, 1.62, -0.01, HEAD, LIGHT));         // heavy helmet
  p.push(box(0.32, 0.10, 0.10, 0, 1.53, 0.20, HEAD, INK));            // visor slit
  p.push(box(0.34, 0.14, 0.10, 0, 1.47, -0.20, HEAD, DARK));          // nape guard
  // LMG
  p.push(box(0.10, 0.13, 0.78, -0.13, 1.12, 0.28, ARM_R, INK, 0.03));
  p.push(box(0.19, 0.26, 0.25, -0.13, 1.02, 0.06, ARM_R, INK));       // drum
  p.push(box(0.10, 0.16, 0.20, -0.13, 1.09, -0.20, ARM_R, INK));
  p.push(box(0.09, 0.09, 0.22, -0.13, 1.21, 0.22, ARM_R, DARK));      // top rail
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
// Every vehicle is built no taller than a soldier (~1.7 m) on purpose: TIERS
// scales them up to 1.30x and the brief's ceiling is 1.3x a man. The moment one
// unit dwarfs the rest the crowd stops reading as a crowd.

function wheels(p, r, x, zs, w = 0.30) {
  for (const z of zs) pair(p, w, r * 2, r * 2, x, r, z, BODY, BODY, INK);
}

function buildJeep() {
  const p = [];
  wheels(p, 0.32, 0.74, [0.88, -0.86]);
  p.push(box(1.52, 0.46, 2.50, 0, 0.72, 0, BODY, BASE));              // hull
  p.push(box(1.40, 0.28, 0.94, 0, 1.03, 0.76, BODY, LIGHT));          // bonnet
  p.push(box(1.30, 0.36, 0.92, 0, 1.11, -0.28, BODY, DARK));          // crew bay
  p.push(box(1.34, 0.10, 0.06, 0, 1.36, 0.28, BODY, INK));            // screen frame
  pair(p, 0.10, 0.52, 0.10, 0.60, 1.45, -0.60, BODY, BODY, INK);      // roll bar
  p.push(box(1.32, 0.10, 0.10, 0, 1.66, -0.60, BODY, INK));
  p.push(box(1.56, 0.32, 0.14, 0, 0.76, 1.32, BODY, DARK));           // bull bar
  pair(p, 0.14, 0.30, 0.14, 0.66, 1.10, 1.28, BODY, BODY, LIGHT);     // headlamps
  p.push(box(0.24, 0.20, 0.24, 0, 1.36, -0.42, HEAD, DARK));          // pintle mount
  p.push(box(0.12, 0.12, 0.86, 0, 1.50, -0.10, HEAD, INK));           // mounted MG
  return mergeUnit(p);
}

function buildHumvee() {
  const p = [];
  wheels(p, 0.36, 0.86, [1.02, -1.00], 0.34);
  p.push(box(1.80, 0.52, 2.90, 0, 0.70, 0, BODY, BASE));
  p.push(box(1.70, 0.34, 1.02, 0, 1.02, 0.98, BODY, LIGHT));          // bonnet
  p.push(box(1.62, 0.56, 1.70, 0, 1.20, -0.35, BODY, BASE));          // cab
  p.push(box(1.66, 0.10, 1.74, 0, 1.50, -0.35, BODY, LIGHT));         // roof
  p.push(box(1.56, 0.34, 0.08, 0, 1.28, 0.50, BODY, INK, -0.32));     // raked screen
  p.push(box(1.84, 0.36, 0.16, 0, 0.74, 1.52, BODY, DARK));           // brush guard
  pair(p, 0.16, 0.30, 0.12, 0.74, 1.06, 1.50, BODY, BODY, LIGHT);
  p.push(box(0.60, 0.24, 0.60, 0, 1.63, -0.30, HEAD, DARK));          // cupola ring
  p.push(box(0.14, 0.14, 0.80, 0.10, 1.70, 0.10, HEAD, INK));         // turret gun
  return mergeUnit(p);
}

function buildApc() {
  const p = [];
  wheels(p, 0.34, 0.90, [1.14, 0.02, -1.12], 0.32);
  p.push(box(1.86, 0.62, 3.20, 0, 0.66, 0, BODY, MID));               // lower hull
  p.push(box(1.76, 0.46, 2.60, 0, 1.14, -0.20, BODY, BASE));          // upper hull
  p.push(box(1.70, 0.52, 0.90, 0, 1.02, 1.28, BODY, LIGHT, -0.42));   // sloped glacis
  p.push(box(1.30, 0.12, 1.30, 0, 1.38, -0.30, BODY, LIGHT));         // roof deck
  pair(p, 0.10, 0.28, 2.40, 0.94, 1.20, -0.20, BODY, BODY, INK);      // side skirts
  p.push(box(1.40, 0.60, 0.12, 0, 1.00, -1.60, BODY, DARK));          // ramp
  pair(p, 0.16, 0.26, 0.12, 0.72, 1.00, 1.68, BODY, BODY, LIGHT);     // lamps
  p.push(box(0.72, 0.30, 0.78, 0, 1.55, 0.10, HEAD, LIGHT));          // turret
  p.push(box(0.13, 0.13, 0.94, 0.08, 1.58, 0.66, HEAD, INK));         // autocannon
  return mergeUnit(p);
}

function buildTank() {
  const p = [];
  pair(p, 0.44, 0.66, 3.40, 0.80, 0.33, 0, BODY, BODY, INK);          // tracks
  for (const z of [1.15, 0.40, -0.40, -1.15]) {
    pair(p, 0.50, 0.30, 0.30, 0.80, 0.44, z, BODY, BODY, DARK);       // road wheels
  }
  p.push(box(1.70, 0.44, 3.10, 0, 0.76, 0, BODY, BASE));              // hull
  p.push(box(1.62, 0.34, 0.96, 0, 0.94, 1.32, BODY, LIGHT, -0.50));   // glacis
  p.push(box(1.50, 0.20, 2.20, 0, 1.06, -0.30, BODY, MID));           // deck
  p.push(box(0.96, 0.42, 1.20, 0, 1.32, -0.10, HEAD, LIGHT));         // turret
  p.push(box(0.70, 0.22, 0.70, 0, 1.60, -0.20, HEAD, BASE));          // cupola
  p.push(box(0.20, 0.20, 1.90, 0, 1.34, 1.16, HEAD, INK));            // main gun
  p.push(box(0.28, 0.26, 0.34, 0, 1.34, 1.90, HEAD, INK));            // muzzle brake
  p.push(box(0.10, 0.10, 0.46, 0.34, 1.56, 0.30, HEAD, INK));         // coax
  return mergeUnit(p);
}

// The gunship hovers — army.js lifts it off the deck, so the skids are still
// modelled at y = 0 and the whole unit floats as one.
//
// MANAGER: the brief asks for "rotor as a part that can spin". The frozen crowd
// shader only translates (`transformed.z += dz`, `transformed.y += dy`), so no
// aPart can rotate. The rotor is instead three crossed blades — a six-armed
// star that reads as a blur disc while standing still — tagged HEAD so it takes
// the counter-bob and shimmers. If a real spin is wanted, toon.js needs a yaw
// term on part 6; happy to use it the moment it exists.
function buildGunship() {
  const p = [];
  pair(p, 0.10, 0.10, 1.90, 0.66, 0.06, -0.10, BODY, BODY, INK);      // skids
  pair(p, 0.08, 0.42, 0.10, 0.60, 0.30, 0.34, BODY, BODY, INK);       // struts
  pair(p, 0.08, 0.42, 0.10, 0.60, 0.30, -0.54, BODY, BODY, INK);
  p.push(box(1.02, 0.72, 2.10, 0, 0.90, 0.10, BODY, BASE));           // fuselage
  p.push(box(0.86, 0.52, 0.80, 0, 0.94, 1.24, BODY, INK, -0.38));     // canopy
  p.push(box(0.66, 0.36, 0.36, 0, 0.82, 1.60, BODY, LIGHT));          // nose
  p.push(box(0.42, 0.40, 1.70, 0, 1.06, -1.72, BODY, MID));           // tail boom
  p.push(box(0.14, 0.62, 0.44, 0, 1.36, -2.42, BODY, LIGHT));         // tail fin
  pair(p, 0.60, 0.10, 0.26, 0.34, 1.16, -2.30, BODY, BODY, DARK);     // stabiliser
  pair(p, 0.16, 0.26, 0.62, 0.62, 0.86, 0.20, BODY, BODY, DARK);      // stub wings
  pair(p, 0.20, 0.22, 0.70, 0.92, 0.84, 0.20, BODY, BODY, INK);       // rocket pods
  p.push(box(0.28, 0.30, 0.28, 0, 1.38, 0.10, BODY, DARK));           // rotor mast
  // rotor disc: three crossed blades. Static geometry that reads as motion.
  for (let k = 0; k < 3; k++) {
    p.push(box(2.30, 0.045, 0.16, 0, 1.56, 0.10, HEAD, INK, 0, k * Math.PI / 3));
  }
  p.push(box(0.05, 0.90, 0.14, 0.16, 1.36, -2.42, HEAD, INK));        // tail rotor
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
const SNUG = { foot: 1, vehicle: 0.92, air: 0.85 };
const spacingCache = new Map();

// Muzzle height in model space — where combat.js should hang a flash.
const MUZZLE = { foot: 1.16, vehicle: 1.34, air: 0.86 };

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

export const tierMuzzle = (t) => MUZZLE[TIERS[tierIndexOf(t)].kind] ?? 1.16;
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
 */
export function makeTierCrowd(tierIndex, opts = {}) {
  const i = tierIndexOf(tierIndex);
  const t = TIERS[i];
  // The ramp only ever darkens, and a hemisphere fill this strong pulls every
  // mid-tone toward the sky, so the tier colour goes in over-saturated. The
  // helmet — ramp step 1.0 — is the one that lands on config's actual colour.
  const color = new THREE.Color(opts.color ?? t.color).offsetHSL(0, 0.20, 0.04);
  const crowd = makeCrowd(tierGeometry(t.id).clone(), {
    color,
    map: opts.map ?? ramp(),
    max: Math.max(1, opts.max ?? 512),
    // Thick, and thicker on vehicles: a bigger unit at the same outline reads
    // as a thinner line, and this look lives or dies on that line staying fat.
    outline: opts.outline ?? (t.kind === 'foot' ? 0.045 : 0.065),
    outlineColor: opts.outlineColor ?? PAL.signStroke,
    castShadow: opts.castShadow !== false,
    // A little self-emission so the away faces are still the unit's own colour
    // instead of a hole. Kept low — emissive is added flat, after the ramp, so
    // too much of it washes the per-part shading straight back out.
    emissive: opts.emissive ?? color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.06,
    tint: opts.tint,
  });
  fixOutlineNormals(crowd);
  return crowd;
}

// MANAGER: `toon.js:outlineMat` pushes the shell out along `objectNormal`, but
// a MeshBasicMaterial only computes objectNormal when it has an env map or a
// skeleton — so the outline program fails to link with
//   ERROR: 'objectNormal' : undeclared identifier
// and every crowd in the game renders untextured black. It is one line in the
// frozen file (`#include <beginnormal_vertex>` ahead of `<begin_vertex>` inside
// outlineMat's replace); until that lands, every crowd gets patched here, which
// is also why enemies.js should go through makeTierCrowd rather than makeCrowd.
function fixOutlineNormals(crowd) {
  const om = crowd?.outline?.material;
  if (!om) return crowd;
  const prev = om.onBeforeCompile;
  const PUSH = 'transformed += normalize(objectNormal) * uThick;';
  om.onBeforeCompile = (s) => {
    if (prev) prev(s);
    s.vertexShader = s.vertexShader.includes(PUSH)
      ? 'attribute vec3 aShell;\n' + s.vertexShader.replace(PUSH, 'transformed += aShell * uThick;')
      // Fallback if toon.js's wording changes: at least make objectNormal exist
      // so the program links and the outline is merely ugly instead of absent.
      : s.vertexShader.replace('#include <begin_vertex>', '#include <beginnormal_vertex>\n#include <begin_vertex>');
  };
  om.needsUpdate = true;
  return crowd;
}

export function disposeUnits() {
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  spacingCache.clear();
  rampTex?.dispose();
  rampTex = null;
  ctxRef = null;
}
