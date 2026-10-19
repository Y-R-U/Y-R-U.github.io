// HUSK, experimental common tank "Prototype Shell" (sculptor-10). Brief: docs/ROSTER.md `husk`.
// An early, unfinished prototype of the experimental line (humbler than PHASE): a legless black-glass barrel torso that
// hovers on a single grav emitter, a crude boxy sensor head with one violet eye and a bolted-on test camera, and gorilla arms
// made of SEPARATE floating segments (shoulder dome, upper arm, forearm, huge gravity fist) joined only by violet light.
// Lab-rig tells: exposed frame ribs where a plate was never fitted, amber calibration markers + a barcode asset tag, clamps,
// a cable loom. It keeps falling slightly apart and pulling itself back together (tick drives the segment gaps).
// VALUE: `accent` = black glass (most of the surface), `paint` = bright violet on the big read-plates (shoulder domes, yoke, fist
// tops, forearm outer plates, breastplate V), `metal` = chrome frame/clamps, `trim` = one amber asset tag, `glow` = soft violet
// rings, `eye` = the visor AND the bright seam lines + light spines in the arm gaps (eye ei is 3.6+ even at R0, glow only 1.3).
// Polish pass (sculptor-21): fewer, bigger parts; light spines fill every arm gap so the floating segments read at 90 px.
// Rank tiers: R0 battered (wider gaps, a missing side plate shows the ribs, taped head) · R1 base · R2 more segments
//   (split knuckles, forearm rings, side plates fitted) + tighter gaps · R3 violet crystal growths on the shoulders
//   · R4 an orbiting debris belt (aux2 spins) · R5 a floating crystal crown + halo ring over the head.
// Rarity: rare+ glow seams on the breastplate · epic+ back fins + second emitter ring; legendary = kit gold.
// Rig: hover. aux0 (chest) = floating back segment, aux1 (head) = R5 crown, aux2 (pelvis) = grav emitter tail (+R4 belt),
// aux3 (re-parented to chest) = the exposed reassembly core floating in the chest cavity.
import { THREE, P, PS, plate, fin, discX, LIB, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const K = 1.15;   // whole-unit scale (bones + parts)
const DIMS0 = {
  hover: 0.64, thigh: 0.16, shin: 0.14, ankle: 0.02, hipX: 0.15, hipY: -0.02, spine: 0.12, chest: 0.22, neck: 0.18, headOff: 0.05,
  clavX: 0.08, clavY: 0.2, shoulder: 0.27, upArm: 0.27, foreArm: 0.26,
  parents: { aux3: 'chest' }, aux0: [0, 0.08, -0.26], aux1: [0, 0.3, 0], aux2: [0, -0.2, 0], aux3: [0, 0.02, 0.17],
};
const DIMS = Object.fromEntries(Object.entries(DIMS0).map(([k, v]) => [k, typeof v === 'number' ? v * K : Array.isArray(v) ? v.map((x) => x * K) : v]));
const OD_REL = 0.167;

// ---------- greebles ----------
const crystal = (b) => b.sph(4, 2);
// violet light spine: a glowing rod on a child segment reaching up into the gap above it (fills the gap at any gap width)
function spine(b, bone, y0, y1, r, slot = 'eye') {
  b.sym(b.cyl(r, r, y1 - y0, 10), bone, slot, [0, (y0 + y1) / 2, 0]);
}
// a seam line: a bright emissive strip on a plate face
const seam = (b, bone, len, pos, rot = [0, 0, 0], w = 0.014) => b.sym(b.cbox(w, len, w, 0.004), bone, 'eye', pos, rot);

// ---------- parts ----------
function head(b, o) { b.scope([0, 0.0, 0.01], [0, 0, 0], 1.25, () => head0(b, o)); neck(b, o); }
function head0(b, o) {
  const H = 'head', rk = o.rank, y = 0.07;
  // crude boxy sensor head: black glass block, big violet lid + brow, ONE wide visor, a bolted-on test camera
  b.add(b.rbox(0.21, 0.15, 0.19, 0.04), H, 'accent', [0, y, 0.01]);
  b.add(plate(b, 0.2, 0.04, 0.19, { c: 0.014, tx: 0.82, tz: 0.85 }), H, 'paint', [0, y + 0.078, 0.0]);
  b.add(plate(b, 0.19, 0.06, 0.035, { c: 0.012, tx: 0.88 }), H, 'paint', [0, y + 0.045, 0.1], [-0.12, 0, 0]);
  b.add(b.cbox(0.15, 0.034, 0.03, 0.01), H, 'eye', [0, y - 0.005, 0.11], [-0.05, 0, 0]);
  b.add(b.cbox(0.17, 0.014, 0.02, 0.005), H, 'metal', [0, y - 0.04, 0.106]);
  b.add(b.cbox(0.06, 0.06, 0.08, 0.012), H, 'metal', [-0.125, y + 0.025, 0.035]);
  b.add(b.cyl(0.026, 0.028, 0.04, 14), H, 'accent', [-0.125, y + 0.025, 0.09], [PI / 2, 0, 0]);
  b.add(b.cyl(0.017, 0.017, 0.01, 12), H, 'eye', [-0.125, y + 0.025, 0.112], [PI / 2, 0, 0]);
  b.add(b.cbox(0.05, 0.02, 0.012, 0.004), H, 'trim', [0.06, y + 0.1, -0.02], [0, 0.3, 0]);
  if (rk === 0) b.add(b.cbox(0.13, 0.03, 0.006, 0.003), H, 'metal', [0.06, y + 0.05, 0.12], [-0.12, 0, -0.6]);
  b.add(b.cyl(0.045, 0.055, 0.03, 12), H, 'metal', [0, y - 0.085, 0]);
  b.add(b.cyl(0.035, 0.035, 0.014, 12), H, 'glow', [0, y - 0.102, 0]);
}
function neck(b, o) {
  const rk = o.rank;
  b.add(b.cyl(0.05, 0.065, 0.08, 12), 'neck', 'metal', [0, -0.04, 0]);
  b.add(b.cyl(0.03, 0.03, 0.09, 10), 'neck', 'eye', [0, 0.03, 0]);
  // R5: floating crystal crown + halo ring (aux1)
  if (rk >= 5) {
    b.add(b.tor(0.15, 0.01, 32, 3), 'aux1', 'eye', [0, 0, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      b.add(crystal(b), 'aux1', i % 2 ? 'glow' : 'paint', [Math.cos(a) * 0.11, 0.04 + (i % 2) * 0.02, Math.sin(a) * 0.11], [0.2, -a, 0.15], [0.035, 0.1, 0.035]);
    }
    b.add(crystal(b), 'aux1', 'eye', [0, 0.06, 0], [0, 0, 0], [0.04, 0.13, 0.04]);
  }
}

function torso(b, o) {
  const rk = o.rank, r = o.r, far = b.far;
  // one big black-glass barrel with an open core window; frame shows only where a plate is missing (R0)
  b.add(b.cyl(0.08, 0.1, 0.36, 10), 'chest', 'metal', [0, 0.02, -0.03]);
  b.add(b.sph(26, 16, PI * 0.62, PI * 1.76, 0, PI), 'chest', 'accent', [0, 0.04, -0.02], [0, 0, 0], [0.29, 0.27, 0.25]);
  // breastplate: two big violet slabs framing the core window (a V that reads from the battle camera), seam lines on their edges
  PS(b, 'chest', 'paint', [0.18, 0.27, 0.06], [0.12, 0.06, 0.195], [0.1, 0.4, 0.08], { c: 0.03, tx: 0.95, bx: 0.7 });
  seam(b, 'chest', 0.22, [0.05, 0.06, 0.24], [0.1, 0.4, 0.08]);
  P(b, 'chest', 'accent', [0.34, 0.075, 0.18], [0, 0.225, 0.04], [0.15, 0, 0], { c: 0.03, tx: 0.82 });
  // the core window: thick glow rim
  b.add(b.tor(0.08, 0.016, 20, 6), 'chest', 'glow', [0, 0.06, 0.125], [0.1, 0, 0]);
  // side plates: R0 the left one is missing (two bare rib hoops show), R2+ a violet layer over both
  if (rk >= 1) PS(b, 'chest', 'accent', [0.06, 0.24, 0.22], [0.245, 0.04, -0.01], [0, 0, 0.12], { c: 0.025 });
  else {
    b.add(plate(b, 0.06, 0.24, 0.22, { c: 0.025 }), 'chest', 'accent', [-0.245, 0.04, -0.01], [0, 0, -0.12]);
    for (let i = 0; i < 2; i++) b.add(b.tor(0.08, 0.012, 14, 4, PI), 'chest', 'metal', [0.22, -0.04 + i * 0.1, -0.01], [PI / 2, 0, PI / 2]);
  }
  if (rk >= 2) PS(b, 'chest', 'paint', [0.04, 0.16, 0.16], [0.28, 0.06, -0.01], [0, 0, 0.18], { c: 0.014 });
  // amber asset tag: the one warm marker
  b.add(b.cbox(0.1, 0.055, 0.014, 0.005), 'chest', 'trim', [-0.16, 0.18, 0.15], [0.1, -0.5, 0]);
  if (r >= 1 && !far) seam(b, 'chest', 0.16, [0.2, 0.0, 0.14], [0, 0.6, 0.15], 0.014);
  // waist: chrome spine, thick glow ring in the gap the pelvis hovers in
  b.add(b.cyl(0.07, 0.09, 0.14, 10), 'spine', 'metal', [0, 0.05, 0]);
  b.add(b.tor(0.11, 0.02, 20, 6), 'spine', 'glow', [0, 0.1, 0], [PI / 2, 0, 0]);
  b.add(b.lathe([[0.05, -0.32], [0.12, -0.2], [0.2, -0.04], [0.21, 0.04], [0.16, 0.08]], 16), 'pelvis', 'accent', [0, 0, 0]);
  b.add(b.cyl(0.215, 0.205, 0.05, 24), 'pelvis', 'paint', [0, 0.0, 0]);
  b.add(b.tor(0.212, 0.008, 24, 4), 'pelvis', 'eye', [0, -0.03, 0], [PI / 2, 0, 0]);
  // floating hip plates
  PS(b, 'thigh', 'accent', [0.06, 0.22, 0.22], [0.05, -0.06, 0.0], [0, 0, 0.3], { c: 0.025, tz: 0.8 });
  seam(b, 'thigh', 0.15, [0.085, -0.06, 0.0], [0, 0, 0.3], 0.016);
  // the floating back segment (aux0)
  b.add(plate(b, 0.32, 0.28, 0.07, { c: 0.025, tx: 0.85 }), 'aux0', 'accent', [0, 0, 0]);
  b.add(plate(b, 0.22, 0.12, 0.03, { c: 0.01, tx: 0.9 }), 'aux0', 'paint', [0, 0.05, -0.045]);
  b.add(b.cyl(0.035, 0.035, 0.014, 12), 'aux0', 'eye', [0, -0.06, -0.04], [PI / 2, 0, 0]);
  if (r >= 2) b.sym(fin(b, [[0, 0], [0.05, 0], [0.16, 0.2], [0.13, 0.22]], 0.02, 0.005), 'aux0', 'paint', [0.09, 0.08, -0.01], [-0.3, 0, -0.25]);
  // exposed reassembly core (aux3): a big violet crystal in a chrome cage
  b.add(crystal(b), 'aux3', 'glow', [0, 0, 0], [0, PI / 4, 0], [0.065, 0.095, 0.065]);
  if (!far) for (let i = 0; i < 2; i++) b.add(b.tor(0.075, 0.007, 16, 3), 'aux3', 'metal', [0, 0, 0], [PI / 2 + i * 1.2, i * 1.3, 0]);
}

function emitter(b, o) {
  const A = 'aux2', r = o.r, rk = o.rank, far = b.far;
  b.add(b.lathe([[0.02, 0.04], [0.09, 0.03], [0.12, -0.03], [0.1, -0.07]], 16), A, 'metal', [0, 0, 0]);
  b.add(b.cyl(0.085, 0.085, 0.016, 18), A, 'eye', [0, -0.066, 0]);
  b.add(b.tor(0.15, 0.014, 24, 4), A, 'glow', [0, -0.04, 0], [PI / 2, 0, 0]);
  if (r >= 2) b.add(b.tor(0.2, 0.008, 26, 3), A, 'glow', [0, -0.02, 0], [PI / 2, 0, 0]);
  // R4: debris belt orbiting the waist (aux2 spins in post): fewer, bigger chunks
  if (rk >= 4) {
    const n = far ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2, R = 0.44 + (i % 2) * 0.04;
      const g = i % 2 === 0 ? crystal(b) : b.rbox(0.09, 0.07, 0.11, 0.02);
      b.add(g, A, i % 2 === 0 ? 'eye' : 'paint', [Math.cos(a) * R, 0.33 + (i % 2) * 0.05, Math.sin(a) * R], [0.4 * i, -a, 0.3], i % 2 === 0 ? [0.04, 0.1, 0.04] : 1);
    }
  }
}

function arm(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, r = o.r, far = b.far;
  // clav: chrome bar ending in a glow disc (the shoulder segment floats off it)
  b.sym(b.cyl(0.05, 0.05, D.shoulder * 0.7, 8), 'clav', 'metal', [D.shoulder * 0.35, 0, 0], [0, 0, PI / 2]);
  b.sym(discX(b, 0.055, 0.024, 14), 'clav', 'glow', [D.shoulder * 0.72, 0, 0]);
  // shoulder segment: the big violet dome (main read) over a black rim, one bright seam ring
  b.sym(b.sph(36, 14, 0, PI * 2, 0, PI * 0.55), 'upArm', 'paint', [0.03, 0.02, 0], [0, 0, -0.35], [0.18, 0.17, 0.18]);
  b.sym(b.cyl(0.18, 0.16, 0.055, 24), 'upArm', 'accent', [0.03, -0.005, 0], [0, 0, -0.35]);
  b.sym(b.tor(0.18, 0.01, 26, 4), 'upArm', 'eye', [0.03, 0.025, 0], [PI / 2, 0, -0.35]);
  // R3: violet crystal growths bursting from the domes (fewer, bigger)
  if (rk >= 3) for (const [x, yy, z, rx, rz, s] of [[0.07, 0.15, 0.02, 0.2, -0.3, 1.35], [0.13, 0.1, -0.07, -0.4, -0.8, 1], [0.01, 0.14, -0.08, -0.6, 0.1, 0.85]]) {
    b.sym(crystal(b), 'upArm', s > 0.9 ? 'eye' : 'paint', [x, yy, z], [rx, 0, rz], [0.04 * s, 0.12 * s, 0.04 * s]);
  }
  // upper arm: one black block with a violet band; the seam line runs down its outer face
  PS(b, 'upArm', 'accent', [0.13, ua * 0.76, 0.13], [0.0, -ua * 0.55, 0], [0, 0, 0], { c: 0.022, tx: 1.1, tz: 1.08 });
  b.sym(b.cyl(0.08, 0.08, 0.035, 16), 'upArm', 'paint', [0, -ua * 0.4, 0]);
  seam(b, 'upArm', ua * 0.66, [0.068, -ua * 0.56, 0]);
  // forearm: the light spine fills the elbow gap; a heavy block widening to the wrist, violet outer plate + seam
  spine(b, 'foreArm', -0.04, 0.06, 0.024);
  PS(b, 'foreArm', 'accent', [0.15, fa * 0.78, 0.16], [0.0, -fa * 0.45, 0], [0, 0, 0], { c: 0.024, tx: 0.8, tz: 0.82, bx: 1.12, bz: 1.1 });
  PS(b, 'foreArm', 'paint', [0.04, fa * 0.56, 0.16], [0.09, -fa * 0.5, 0], [0, 0, -0.06], { c: 0.012, tz: 0.82 });
  seam(b, 'foreArm', fa * 0.5, [0.113, -fa * 0.5, 0], [0, 0, -0.06]);
  if (rk >= 2) b.sym(b.tor(0.1, 0.016, 20, 4), 'foreArm', 'paint', [0, -fa * 0.25, 0], [PI / 2, 0, 0]);
  // gravity fist: spine fills the wrist gap; huge black block, violet top + side plates, glowing knuckle line, grav lens
  spine(b, 'hand', -0.06, 0.06, 0.026);
  b.sym(b.rbox(0.22, 0.2, 0.24, 0.055), 'hand', 'accent', [0, -0.155, 0.01]);
  b.sym(plate(b, 0.19, 0.045, 0.22, { c: 0.016, tx: 0.86, tz: 0.86 }), 'hand', 'paint', [0, -0.05, 0.01]);
  PS(b, 'hand', 'paint', [0.06, 0.16, 0.21], [0.105, -0.155, 0.01], [0, 0, 0], { c: 0.022 });
  seam(b, 'hand', 0.12, [0.138, -0.155, 0.0]);
  b.sym(b.cyl(0.075, 0.08, 0.03, 18), 'hand', 'metal', [0, -0.26, 0.01]);
  b.sym(b.cyl(0.06, 0.06, 0.02, 18), 'hand', 'eye', [0, -0.272, 0.01]);
  if (rk >= 2) {
    for (let i = 0; i < 3; i++) b.sym(b.rbox(0.065, 0.075, 0.075, 0.02), 'hand', 'paint', [-0.068 + i * 0.068, -0.2, 0.155]);
    b.sym(b.cbox(0.2, 0.014, 0.014, 0.004), 'hand', 'eye', [0, -0.2, 0.196]);
  } else {
    b.sym(b.rbox(0.2, 0.075, 0.075, 0.022), 'hand', 'paint', [0, -0.2, 0.135]);
    b.sym(b.cbox(0.16, 0.014, 0.014, 0.004), 'hand', 'eye', [0, -0.2, 0.175]);
  }
  b.sym(b.rbox(0.075, 0.1, 0.085, 0.022), 'hand', 'metal', [-0.115, -0.11, 0.085], [0.3, 0, -0.25]);
  if (r >= 1 && !far) b.sym(b.cbox(0.012, 0.012, 0.16, 0.003), 'hand', 'eye', [0.06, -0.025, 0.01]);
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], K, () => { head(b, o); torso(b, o); yoke(b, o); emitter(b, o); arm(b, o); });
}
// violet yoke over the shoulders + top of the back: the faction read from the elevated battle camera
function yoke(b, o) {
  b.add(plate(b, 0.38, 0.055, 0.32, { c: 0.024, tx: 0.8, tz: 0.85 }), 'chest', 'accent', [0, 0.235, -0.04], [0.05, 0, 0]);
  b.add(b.cbox(0.22, 0.016, 0.016, 0.004), 'chest', 'eye', [0, 0.268, 0.11], [0.05, 0, 0]);
  for (const s of [1, -1]) b.add(b.cbox(0.016, 0.016, 0.22, 0.004), 'chest', 'eye', [s * 0.16, 0.266, -0.05], [0.05, 0, 0]);
}

// ---------- segment gaps (tick) ----------
// parent-local outward directions; w = how much each segment takes of the gap
const SEG = [
  ['head', [0, 1, 0.15], 1], ['clavL', [1, 0.25, 0], 0.9], ['clavR', [-1, 0.25, 0], 0.9],
  ['foreArmL', [0, -1, 0], 1.2], ['foreArmR', [0, -1, 0], 1.2], ['handL', [0, -1, 0], 1.3], ['handR', [0, -1, 0], 1.3],
  ['aux3', [0, 0, 1], 0.7], ['aux2', [0, -1, 0], 1.1], ['aux0', [0, 0.2, -1], 0.9], ['thighL', [1, -0.3, 0], 0.8], ['thighR', [-1, -0.3, 0], 0.8],
];
const _v = new THREE.Vector3();
function gaps(ctx, bones, g, jit, t, ext) {
  if (!ctx.rest) ctx.rest = SEG.map(([n]) => bones[BI[n]].position.clone());
  SEG.forEach(([n, d, w], i) => {
    const j = jit ? Math.sin(t * 41 + i * 7.3) * jit : 0;
    let k = g * w + j + (ext[n] || 0);
    _v.set(d[0], d[1], d[2]).normalize().multiplyScalar(k);
    bones[BI[n]].position.copy(ctx.rest[i]).add(_v);
  });
}
// per-action gap envelope: [gap, jitter, per-segment extras]
function gapFor(a, u, t, base, ctx) {
  const ext = {};
  switch (a) {
    case 'attack': {
      const s = L.kf(u, [[0, 0], [0.3, 1], [0.42, 1.3], [0.5, 0.2], [0.8, 0]]);
      ext.foreArmR = 0.07 * s; ext.handR = 0.09 * s;
      return [base + 0.03 * L.kf(u, [[0.4, 0], [0.46, 1], [0.6, 0]]), 0, ext];
    }
    case 'attack_alt': {
      const s = L.kf(u, [[0, 0], [0.38, 1], [0.5, 1.2], [0.58, 0.2], [0.85, 0]]);
      for (const sd of SIDES) { ext['foreArm' + sd] = 0.06 * s; ext['hand' + sd] = 0.08 * s; }
      return [base + 0.04 * L.kf(u, [[0.48, 0], [0.54, 1], [0.7, 0]]), 0, ext];
    }
    case 'cast': return [base * L.kf(u, [[0, 1], [0.35, 0.05], [0.6, 0.05], [0.9, 1]]), 0.004 * L.kf(u, [[0.3, 0], [0.5, 1], [0.6, 0]]), ext];
    case 'hit': return [base + L.kf(u, [[0, 0], [0.08, 0.14], [0.4, 0.03], [0.65, 0]]), 0.012, ext];
    case 'overdrive': return [L.kf(u, [[0, base], [0.12, -0.035], [0.48, -0.035], [0.53, 0.32], [0.62, 0.05], [0.72, base]]), u > 0.12 && u < 0.5 ? 0.006 : 0, ext];
    case 'die': return [L.kf(u, [[0, base], [0.2, base + 0.04], [0.55, base + 0.12], [1, base + 0.14]]), u < 0.35 ? 0.025 : 0, ext];
    case 'deploy': return [L.kf(u, [[0, 1.1], [0.38, 0.12], [0.45, -0.01], [0.6, base]]), u < 0.4 ? 0.02 : 0, ext];
    default: {
      // idle: breathing gaps; every ~6.3 s the left forearm + fist drift away and snap back (it keeps reassembling)
      const c = t % 6.3, dr = L.kf(c, [[0, 0], [4.0, 0], [4.8, 1], [5.2, 1], [5.32, -0.2], [5.45, 0]]);
      ext.foreArmL = 0.1 * dr; ext.handL = 0.12 * dr; ext.head = 0.03 * L.kf(c, [[5.25, 0], [5.32, 1], [5.5, 0]]);
      ctx.glitch = dr;
      return [base + 0.012 * Math.sin(t * 1.9), c > 5.25 && c < 5.45 ? 0.01 : 0, ext];
    }
  }
}

// ---------- anims ----------
function base(P, ctx, t) {
  L.hoverIdle(P, ctx, t);
  P[L.PX + 1] *= 0.5;
  L.A(P, 'pelvis', 0.04, 0, 0); L.A(P, 'spine', 0.08, 0, 0); L.A(P, 'chest', 0.1, 0, 0);
  L.A(P, 'neck', -0.1, 0, 0); L.A(P, 'head', -0.06, 0, 0);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.9, br = Math.sin(t * 1.3 + ph);
    L.RS(P, 'clav', s, 0, 0, 0.03 * Math.sin(t * 1.6));
    // gorilla arms: fists hang forward and low, slowly rolling
    L.RS(P, 'upArm', s, -0.3 + br * 0.04, -0.15, 0.17 + br * 0.03);
    L.RS(P, 'foreArm', s, -0.55 + br * 0.05, 0.1, 0);
    L.RS(P, 'hand', s, 0.15, Math.sin(t * 0.7 + ph) * 0.25, 0);
    L.RS(P, 'thigh', s, 0.05 + Math.sin(t * 1.1 + ph) * 0.04, 0, 0.08);
    L.RS(P, 'shin', s, 0, 0, 0); L.RS(P, 'foot', s, 0, 0, 0);
  }
}

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // the drifting left arm sags as it floats away, then jerks back with a head twitch
    const g = ctx.glitch || 0;
    if (g) { L.AS(P, 'upArm', 'L', 0.2 * g, 0, 0.15 * g); L.A(P, 'head', 0, 0.3 * g, 0.15 * g); }
  },
  advance(P, t, ctx) {
    base(P, ctx, t);
    L.A(P, 'pelvis', 0.22, 0, 0); L.A(P, 'chest', 0.08, 0, 0); L.A(P, 'neck', -0.15, 0, 0); L.A(P, 'head', -0.1, 0, 0);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.4, 0, -0.05), L.AS(P, 'foreArm', s, 0.25, 0, 0), L.AS(P, 'thigh', s, 0.3, 0, 0);
  },
  // GRAV SLAM: the right arm lifts overhead (segments stretch apart), body rears back, then the fist crashes down (impact 0.45)
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.32, 1], [0.4, 0.4], [0.44, 0], [1, 0]]), dn = L.kf(u, [[0, 0], [0.38, 0], [0.45, 1], [0.66, 1], [1, 0]]);
    P[L.PX + 1] += 0.1 * up - 0.12 * dn; P[L.PX + 2] += 0.24 * dn - 0.05 * up;
    L.A(P, 'pelvis', -0.15 * up + 0.2 * dn, 0.2 * up - 0.15 * dn, 0);
    L.A(P, 'chest', -0.22 * up + 0.3 * dn, 0.25 * up - 0.2 * dn, 0);
    L.A(P, 'head', 0.1 * up - 0.15 * dn, -0.15 * up, 0);
    L.RS(P, 'upArm', 'R', L.lerp(L.lerp(-0.3, -2.8, up), -0.95, dn), L.lerp(-0.15, 0.1, up + dn), L.lerp(0.3, 0.15, Math.max(up, dn)));
    L.RS(P, 'foreArm', 'R', L.lerp(L.lerp(-0.55, -0.4, up), -0.15, dn), 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(0.15, -0.3, dn), 0, 0);
    // left fist braces on the floor in front
    L.AS(P, 'upArm', 'L', -0.25 * Math.max(up, dn), 0, 0.05);
  },
  // double-fist hammer: both arms overhead, crash down together (impact 0.52)
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.4, 1], [0.48, 0.3], [0.5, 0], [1, 0]]), dn = L.kf(u, [[0, 0], [0.46, 0], [0.52, 1], [0.74, 1], [1, 0]]);
    P[L.PX + 1] += 0.16 * up - 0.16 * dn; P[L.PX + 2] += 0.2 * dn;
    L.A(P, 'pelvis', -0.18 * up + 0.22 * dn, 0, 0); L.A(P, 'chest', -0.3 * up + 0.32 * dn, 0, 0); L.A(P, 'head', -0.2 * up + 0.1 * dn, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(L.lerp(-0.3, -2.9, up), -1.05, dn), L.lerp(-0.15, 0.3, up + dn), L.lerp(0.3, 0.08, Math.max(up, dn)));
      L.RS(P, 'foreArm', s, L.lerp(L.lerp(-0.55, -0.6, up), -0.1, dn), 0, 0);
      L.RS(P, 'hand', s, -0.3 * dn, 0, 0);
    }
  },
  // RECONSTITUTE: pulls every segment in tight (tick), fists clasp over the core, the core flares (cast 0.5)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.35, 1], [0.7, 1], [1, 0]]), pulse = L.kf(u, [[0.42, 0], [0.5, 1], [0.65, 0]]);
    P[L.PX + 1] += 0.05 * k;
    L.A(P, 'chest', -0.12 * k + 0.06 * pulse, 0, 0); L.A(P, 'head', -0.2 * k, 0, 0);
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.45 * k, 0.4 * k, -0.15 * k); L.AS(P, 'foreArm', s, -1.15 * k, 0.4 * k, 0); L.AS(P, 'hand', s, -0.2 * k, 0, 0); }
  },
  // FOLD IN: curls into a ball (arms wrap the core, head tucks, segments collapse inward in tick), hangs as a glowing knot,
  // then bursts back out (0.53) into a wide taunt with fists pounding together
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const ball = L.kf(u, [[0, 0], [0.12, 1], [0.48, 1], [0.53, 0]]);
    const burst = L.kf(u, [[0.48, 0], [0.55, 1], [0.66, 0.85], [0.78, 0]]);
    const taunt = L.kf(u, [[0.62, 0], [0.72, 1], [0.9, 1], [1, 0]]);
    const pound = Math.max(0, Math.sin(u * 46)) * L.kf(u, [[0.7, 0], [0.74, 1], [0.88, 1], [0.92, 0]]);
    const quiver = Math.sin(u * 90) * 0.03 * L.kf(u, [[0.15, 0], [0.2, 1], [0.45, 1], [0.48, 0]]);
    P[L.PX + 1] += 0.3 * ball + 0.12 * burst;
    L.A(P, 'pelvis', 0.45 * ball - 0.2 * burst, quiver, quiver);
    L.A(P, 'spine', 0.35 * ball - 0.15 * burst, 0, 0); L.A(P, 'chest', 0.35 * ball - 0.25 * burst - 0.1 * taunt, 0, 0);
    L.A(P, 'neck', 0.4 * ball - 0.2 * burst, 0, 0); L.A(P, 'head', 0.4 * ball - 0.25 * burst - 0.2 * taunt, 0, 0);
    for (const s of SIDES) {
      const ux = L.lerp(-0.3, -0.9, ball) - 1.5 * burst + 0.3 * taunt, uy = 0.9 * ball - 0.3 * burst, uz = L.lerp(0.3, -0.25, ball) + 1.3 * burst + 0.3 * taunt;
      L.RS(P, 'upArm', s, ux, uy, uz);
      L.RS(P, 'foreArm', s, L.lerp(-0.55, -2.1, ball) + 0.4 * burst - 1.2 * taunt - 0.3 * pound, 0.3 * ball, 0);
      L.RS(P, 'hand', s, 0.15 + 0.5 * ball, 0, 0);
      L.AS(P, 'thigh', s, 0.6 * ball - 0.3 * burst, 0, -0.1 * ball + 0.5 * burst);
    }
  },
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.3 * k, 0.15 * k * d, 0.15 * k * d); P[L.PX + 2] -= 0.12 * k;
    L.A(P, 'chest', -0.15 * k, 0, 0); L.A(P, 'head', -0.35 * k, 0.2 * k * d, 0.25 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.35 * k, 0, 0.25 * k);
  },
  // grav emitter cuts out: it drops, the arms go limp, every segment slumps apart onto the floor and the eye fades
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u * 0.85));
    const f = L.kf(u, [[0, 0], [0.12, 0.05], [0.3, 0.1], [0.55, 1], [0.6, 0.94], [0.66, 1], [1, 1]]);
    const gl = u < 0.3 ? Math.sin(u * 140) * 0.04 * (1 - u / 0.3) : 0;
    P[L.PX + 1] = -0.4 * f + gl; P[L.PX + 2] += 0.08 * f;
    L.A(P, 'pelvis', 0.4 * f, 0.2 * f, 0.25 * f);
    L.A(P, 'chest', 0.35 * f, 0, 0.1 * f); L.A(P, 'neck', 0.4 * f, 0, 0); L.A(P, 'head', 0.5 * f, 0.4 * f, 0.6 * f);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.3, 0.1, f), 0, L.lerp(0.3, 0.75, f));
      L.RS(P, 'foreArm', s, L.lerp(-0.55, -0.05, f), 0, 0);
      L.RS(P, 'hand', s, L.lerp(0.15, 0.6, f), 0, 0);
      L.AS(P, 'thigh', s, -0.3 * f, 0, 0.6 * f);
    }
  },
  // fists pumped overhead in turns, segments pulsing apart on each pump (tick)
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.6));
    P[L.PX + 1] += 0.1 * k + 0.04 * Math.sin(t * 2.4);
    L.A(P, 'chest', -0.2 * k, 0, 0); L.A(P, 'head', -0.25 * k, 0, 0);
    for (const s of SIDES) {
      const p = Math.max(0, Math.sin(t * 3.4 + (s === 'L' ? 0 : PI))) ** 2;
      L.RS(P, 'upArm', s, L.lerp(-0.3, -2.3, k) - 0.5 * p * k, 0, L.lerp(0.3, 0.45, k));
      L.RS(P, 'foreArm', s, L.lerp(-0.55, -0.7, k) + 0.4 * p * k, 0, 0);
    }
    ctx.vpump = k * (Math.max(0, Math.sin(t * 6.8)) ** 4);
  },
  // arrives in pieces: scattered segments converge and lock (land 0.4), it hunches, then knocks its fists together (ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const curl = L.kf(u, [[0, 1], [0.4, 1], [0.6, 0], [1, 0]]), knock = L.kf(u, [[0.62, 0], [0.75, 1], [0.86, 1.1], [1, 0]]);
    L.A(P, 'pelvis', 0.25 * curl, 0, 0); L.A(P, 'chest', 0.25 * curl, 0, 0); L.A(P, 'head', 0.35 * curl - 0.15 * knock, 0, 0);
    P[L.PX + 1] -= 0.08 * curl;
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.5 * knock, 0.35 * knock, -0.2 * knock); L.AS(P, 'foreArm', s, -0.7 * knock, 0.3 * knock, 0); }
  },
};

export default {
  id: 'husk', name: 'HUSK', role: 'tank', faction: 'experimental', rarity: 'common', realm: 'scifi',
  noDrop: true,
  rig: 'hover', dims: DIMS, height: 1.45 * K, radius: 0.62 * K, walkSpeed: 0.95, scheme: 'bold',
  style: { weapon: 'fists', heavy: 1 },
  paint: {
    experimental: { paint: 0x5a2ad8, accent: 0x15131d, trim: 0xe0a83a, glow: 0xb45cff, eye: 0xc47cff },
    corporate: { paint: 0x2f6ae0, accent: 0x14181f, trim: 0xd9a33a },
    rogue: { paint: 0xc9301e, accent: 0x17131a, trim: 0xd9a33a },
  },
  mats: {
    all: {
      // touch-up 2: the domes went lavender under arena light: the kit's R0 primer desaturates paint x0.78 (HUSK ships at R0) and the
      // clearcoat/env picked up the blue rig. Satin, low env, and a dark grime detail instead of the bright R0 scuff chips.
      paint: { rough: 0.5, coat: 0.15, env: 0.35, panel: { groove: 0.2, grime: 0.05 }, detail: { map: 'grime', scale: 2, albedo: 0.5, rough: 0.4, scratch: 0.1 } },
      accent: { rough: 0.2, metal: 0.4, env: 1.0, coat: 1, panel: { groove: 0.05, scale: 3, grime: 0.03 } },
      metal: { color: 0x7f8596, metal: 0.95, rough: 0.26, panel: { groove: 0.08, scale: 9 } },
      trim: { rough: 0.4 },
    },
    // slot colour set here bypasses the finish ladder's desaturation: deep violet at every rank
    experimental: { paint: { color: 0x4116b4 } },
  },
  sockets: { muzzle: ['handR', [0, -0.3, 0.01]], muzzleL: ['handL', [0, -0.3, 0.01]], hand: ['handR', [0, -0.23, 0]], core: [0, 0.05, 0.23], head: [0, 0.12, 0.12] },
  events: {
    attack: [['impact', 0.45]], attack_alt: [['impact', 0.52]], cast: [['cast', 0.5]],
    overdrive: [['cast', 0.04], ['impact', 0.53]], die: [['down', 0.55]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 1.0, attack_alt: 1.2, cast: 1.2, overdrive: 2.4, hit: 0.45, die: 2.0, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
    // aux2 (emitter + R4 debris belt) spins; fast while folding
    const sp = act && act.name === 'overdrive' ? 5 : 0.7;
    ctx.spin = (ctx.spin || 0) + (ctx.dtc || 0.016) * sp;
    const i = BI.aux2 * 3; P[i] = -P[0] * 0.6; P[i + 1] = ctx.spin; P[i + 2] = -P[2] * 0.6;
    // the core turns slowly; R5 crown counter-turns
    P[BI.aux3 * 3 + 1] = ctx.t * 1.3;
    P[BI.aux1 * 3 + 1] = -ctx.t * 0.6;
  },
  tick(unit, dt, ctx, bones) {
    ctx.dtc = dt;
    const a = ctx.act, u = ctx.au, t = ctx.t;
    const gBase = unit.rank >= 2 ? 0.028 : unit.rank === 0 ? 0.055 : 0.042;
    let [g, j, ext] = gapFor(a || (unit.state.loop === 'victory' ? 'victory' : null), u, t, gBase, ctx);
    if (!a && unit.state.loop === 'victory') g += 0.06 * (ctx.vpump || 0);
    if (a !== null && a !== undefined) ctx.glitch = 0;
    if (unit.state.dead) { g = gBase + 0.14; j = 0; }
    gaps(ctx, bones, g, j, t, ext);
    // the core swells while reconstituting / folding
    let cs = 1;
    if (a === 'cast') cs = 1 + 0.6 * L.kf(u, [[0.3, 0], [0.5, 1], [0.75, 0]]);
    else if (a === 'overdrive') cs = 1 + 1.2 * L.kf(u, [[0.05, 0], [0.15, 1], [0.48, 1], [0.53, 1.6], [0.62, 0]]);
    bones[BI.aux3].scale.setScalar(cs);
  },
  fxHints: { projectile: 'grav_fist', impact: 'grav_crush', overdrive: 'fold_in', color: 0xb050ff },
  build,
};
