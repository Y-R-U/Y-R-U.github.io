// PHASE, experimental rare tank "Blink Guard" (sculptor-5). Brief: docs/ROSTER.md `phase`; look: refs/ref_battle_02.png (purple units).
// A heavy hovering wedge: broad flat-topped chest tapering to a wasp waist over a flared thruster skirt, no legs, two huge
// gauntlet arms ending in segmented "phase fists". Every major segment floats a hair apart from the next (head, pauldrons,
// back drive, chest core, skirt core) joined only by magenta hardlight, so it can scatter and reassemble when it blinks.
// VALUE: `accent` = near-black armour (most of it), `paint` = deep violet on the read-plates (pauldrons, pecs, gauntlets,
// skirt), `metal` = dark chrome joints, `trim` = magenta markers, `glow` = magenta-violet seams/cores, `eye` = three eyes.
// Rank tiers: R0 battered (cracked back ring, no crest) · R1 base · R2 hardlight arm blades · R3 constant faint afterimage
//   (a lagging ghost) + glowing knuckles · R4 floating crystal shards orbit · R5 crown sigil behind the head + double drive ring.
// Rarity: rare+ second pauldron layer · epic+ skirt glow ring + forearm strips · legendary horns (gold trim from the kit).
// Technique: segments live on separate bones and are pushed apart in tick() (scatter offsets on rest positions);
// afterimages are extra SkinnedMeshes sharing the geometry with their own cloned skeleton (pose snapshots), additive
// fresnel material, parented to the unit root so they stay behind when the body blinks (body.position offset in tick).
import { THREE, P, PS, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const L = LIB;
const SIDES = ['L', 'R'];
const DIMS = {
  hover: 0.8, thigh: 0.22, shin: 0.2, ankle: 0.04, hipX: 0.17, hipY: -0.05, spine: 0.14, chest: 0.26, neck: 0.2, headOff: 0.03,
  clavX: 0.08, clavY: 0.22, shoulder: 0.3, upArm: 0.32, foreArm: 0.3, aux0: [0, 0.2, -0.27],
  parents: { aux1: 'pelvis', aux3: 'chest' }, aux1: [0, 0.48, 0], aux2: [0, -0.16, 0], aux3: [0, 0.1, 0.25],
};

// ---------- greebles ----------
function lamp(b, bone, pos, rot, r = 0.022, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.018, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.026, 12), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w = 0.12, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w + 0.03, n * 0.022 + 0.02, 0.02, 0.006), bone, 'metal', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.box(w, 0.008, 0.016), bone, 'accent', [0, (i - (n - 1) / 2) * 0.022, 0.008]); });
}
function piston(b, bone, a, c, r = 0.018) {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
  const rx = Math.atan2(dz, -dy), m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  b.sym(b.cyl(r * 1.4, r * 1.4, len * 0.55, 8), bone, 'metal', [a[0] + dx * 0.27, a[1] + dy * 0.27, a[2] + dz * 0.27], [rx + PI, 0, 0]);
  b.sym(b.cyl(r * 0.7, r * 0.7, len, 6), bone, 'trim', m, [rx + PI, 0, 0]);
}
// faceted crystal (stretched octahedron)
const crystal = (b) => b.sph(4, 2);
// a plan-view polygon (x, z) extruded upward by h, centred on y; the bottom is scaled by `bot` (taper)
function slabXZ(b, pts, h, bot = 1, c = 0.01) {
  const g = b.ext(pts.map(([x, z]) => [x, z]), h, c);
  g.rotateX(PI / 2);
  return deformY(g, (v, k) => { const s = bot + (1 - bot) * k; v.x *= s; v.z *= s; });
}
function deformY(g, fn) {
  g.computeBoundingBox();
  const bb = g.boundingBox, H = Math.max(1e-6, bb.max.y - bb.min.y), A = g.attributes.position;
  for (let i = 0; i < A.count; i++) { _d.fromBufferAttribute(A, i); fn(_d, (_d.y - bb.min.y) / H); A.setXYZ(i, _d.x, _d.y, _d.z); }
  g.computeVertexNormals();
  return g;
}
const _d = new THREE.Vector3();
const PROW = [[0, 0.31], [0.2, 0.2], [0.36, 0.03], [0.32, -0.2], [0.13, -0.25], [-0.13, -0.25], [-0.32, -0.2], [-0.36, 0.03], [-0.2, 0.2]];

// ---------- parts ----------
function head(b, o) { b.scope([0, 0.02, 0.01], [0, 0, 0], 1.22, () => head0(b, o)); neckRing(b); }
function head0(b, o) {
  const rk = o.rank, y = 0.05, z = 0.03, far = b.far;
  // low wedge helm sunk between the pauldrons: black dome + violet prow chevron
  b.add(plate(b, 0.24, 0.16, 0.25, { c: 0.03, tx: 0.72, tz: 0.8, bx: 1.0 }), 'head', 'accent', [0, y, z - 0.01]);
  b.add(b.ext([[-0.13, 0.07], [0.13, 0.07], [0.1, -0.02], [0.0, -0.1], [-0.1, -0.02]], 0.05, 0.01), 'head', 'paint', [0, y + 0.0, z + 0.12], [-0.25, 0, 0]);
  b.add(b.cbox(0.2, 0.03, 0.2, 0.008), 'head', 'paint', [0, y + 0.085, z - 0.02], [0.08, 0, 0]);
  // three eyes: a main visor slit and two smaller "liars" below it, offset
  b.add(b.cbox(0.16, 0.026, 0.03, 0.008), 'head', 'eye', [0, y + 0.035, z + 0.135], [-0.2, 0, 0]);
  b.add(b.cbox(0.035, 0.022, 0.02, 0.006), 'head', 'eye', [0.06, y - 0.01, z + 0.15], [-0.2, 0, 0.3]);
  b.add(b.cbox(0.035, 0.022, 0.02, 0.006), 'head', 'eye', [-0.06, y - 0.01, z + 0.15], [-0.2, 0, -0.3]);
  b.add(b.cbox(0.19, 0.012, 0.02, 0.004), 'head', 'trim', [0, y + 0.06, z + 0.13], [-0.2, 0, 0]);
  // cheek blades + jaw
  b.sym(fin(b, [[0, 0.04], [0.05, 0.03], [0.07, -0.08], [0.02, -0.06]], 0.025, 0.006), 'head', 'accent', [0.09, y - 0.01, z + 0.06], [0, -0.35, 0]);
  b.add(b.cbox(0.1, 0.04, 0.06, 0.012), 'head', 'metal', [0, y - 0.07, z + 0.08]);
  // crest fin sweeping back (paint, glow edge); legendary gets twin horns
  if (rk >= 1) {
    b.add(fin(b, [[0, 0], [0.1, 0], [-0.1, 0.13], [-0.16, 0.12]], 0.022, 0.006), 'head', 'paint', [0, y + 0.09, z + 0.02], [0, PI / 2, 0]);
    if (!far) b.add(b.cbox(0.008, 0.008, 0.16, 0.002), 'head', 'glow', [0, y + 0.16, z - 0.08], [0.75, 0, 0]);
  }
  if (o.r >= 3) b.sym(fin(b, [[0, 0], [0.03, 0], [0.09, 0.16], [0.07, 0.17]], 0.02, 0.005), 'head', 'trim', [0.09, y + 0.07, z - 0.02], [-0.4, 0.2, -0.5]);
}
function neckRing(b) {
  // hardlight neck ring: the head floats on it
  b.add(b.tor(0.075, 0.01, 18, 4), 'neck', 'glow', [0, 0.02, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.05, 0.065, 0.12, 10), 'neck', 'metal', [0, -0.03, 0]);
}

function torso(b, o) {
  const far = b.far, r = o.r;
  // wedge chest: wide flat top deck, tapers hard toward the waist
  P(b, 'chest', 'metal', [0.42, 0.34, 0.34], [0, 0.04, -0.02], [0, 0, 0], { c: 0.04 });
  // arrowhead hull seen from above (prow forward), tapering hard to the waist
  b.add(slabXZ(b, PROW, 0.42, 0.5, 0.012), 'chest', 'accent', [0, 0.1, 0.0], [0.05, 0, 0]);
  b.add(slabXZ(b, PROW.map(([x, z]) => [x * 0.78, z * 0.8 - 0.01]), 0.03, 1, 0.006), 'chest', 'paint', [0, 0.32, 0.0], [0.05, 0, 0]);
  for (const s of [1, -1]) {
    b.add(b.box(0.24, 0.012, 0.012), 'chest', 'glow', [s * 0.13, 0.318, 0.235], [0.05, s * 0.55, 0]);
    b.add(b.box(0.2, 0.012, 0.012), 'chest', 'glow', [s * 0.275, 0.31, 0.09], [0.05, s * 0.95, 0]);
  }
  // violet pec chevrons (two layers) + magenta seam under them
  b.sym(plate(b, 0.28, 0.24, 0.07, { c: 0.025, tx: 1.1, bx: 0.55 }), 'chest', 'paint', [0.15, 0.13, 0.215], [0.28, 0.32, 0.1]);
  b.sym(plate(b, 0.2, 0.12, 0.05, { c: 0.018, tx: 1.0, bx: 0.6 }), 'chest', 'accent', [0.13, 0.0, 0.215], [0.15, 0.3, 0.25]);
  b.sym(b.cbox(0.2, 0.012, 0.016, 0.004), 'chest', 'glow', [0.15, 0.025, 0.245], [0.3, 0.3, 0.32]);
  // keel down the sternum + chest core housing (the core itself floats on aux3)
  b.add(b.ext([[-0.03, 0.2], [0.03, 0.2], [0.04, -0.12], [0, -0.2], [-0.04, -0.12]], 0.04, 0.008), 'chest', 'metal', [0, 0.06, 0.235], [0.12, 0, 0]);
  b.add(b.tor(0.075, 0.016, 20, 5), 'chest', 'trim', [0, 0.1, 0.25], [0.2, 0, 0]);
  // top deck (what the battle camera sees): black inlay chevron, glow spine, vents either side
  b.add(slabXZ(b, [[0, 0.16], [0.12, 0.06], [0.12, -0.14], [-0.12, -0.14], [-0.12, 0.06]], 0.02, 1, 0.004), 'chest', 'accent', [0, 0.345, -0.02], [0.05, 0, 0]);
  b.add(b.cbox(0.025, 0.012, 0.28, 0.005), 'chest', 'glow', [0, 0.36, -0.01], [0.05, 0, 0]);
  vent(b, 'chest', [0.17, 0.34, -0.08], [-PI / 2 + 0.05, 0, 0], 0.06, 4, true);
  // collar ridge behind the head
  P(b, 'chest', 'accent', [0.5, 0.1, 0.12], [0, 0.31, -0.17], [-0.3, 0, 0], { c: 0.02, tx: 0.85 });
  // back slab, vents, twin thrusters, cable runs to the shoulders
  P(b, 'chest', 'accent', [0.5, 0.36, 0.08], [0, 0.1, -0.22], [-0.08, 0, 0], { c: 0.025, bx: 0.7 });
  vent(b, 'chest', [0, 0.02, -0.265], [0, PI, 0], 0.18, 4);
  for (const x of [0.15, -0.15]) {
    b.add(b.cyl(0.05, 0.065, 0.12, 12), 'chest', 'metal', [x, -0.06, -0.25], [PI / 2 + 0.5, 0, 0]);
    b.add(b.cyl(0.04, 0.04, 0.02, 12), 'chest', 'glow', [x, -0.09, -0.3], [PI / 2 + 0.5, 0, 0]);
  }
  if (!far) for (const s of [1, -1]) b.add(b.tube([[s * 0.12, 0.25, -0.2], [s * 0.24, 0.3, -0.14], [s * 0.31, 0.26, -0.05]], 0.016, 8, 5), 'chest', 'metal');
  // side lamps + rivets
  lamp(b, 'chest', [0.25, 0.16, 0.12], [PI / 2, 0.9, 0], 0.018);
  if (!far) for (const [x, yy] of [[0.27, 0.25], [0.24, 0.0], [0.07, 0.27]]) b.sym(b.cyl(0.01, 0.01, 0.02, 6), 'chest', 'trim', [x, yy, 0.17], [PI / 2, 0, 0]);
  if (r >= 2) b.sym(b.cbox(0.012, 0.14, 0.012, 0.003), 'chest', 'glow', [0.27, 0.12, 0.05], [0, 0, -0.35]);

  // floating chest core (aux3): faceted crystal in a cage
  b.add(crystal(b), 'aux3', 'glow', [0, 0, 0.0], [0, PI / 4, 0], [0.055, 0.08, 0.04]);
  if (!far) for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.add(b.cbox(0.012, 0.012, 0.03, 0.003), 'aux3', 'trim', [Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0.01], [0, 0, a]); }

  // waist: narrow, segmented, a hardlight ring between it and the skirt
  b.add(b.cyl(0.12, 0.16, 0.2, 12), 'spine', 'metal', [0, 0.04, 0]);
  for (let i = 0; i < 2; i++) b.add(b.tor(0.15 - i * 0.015, 0.016, 18, 4), 'spine', 'accent', [0, 0.0 + i * 0.075, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'paint', [0.22, 0.12, 0.08], [0, 0.05, 0.12], [0.12, 0, 0], { c: 0.02, tx: 1.15, bx: 0.7 });
  b.add(b.tor(0.19, 0.008, 24, 3), 'spine', 'glow', [0, -0.08, 0], [PI / 2, 0, 0]);

  // hips + thruster skirt: eight angled plates round a chrome thruster bell
  P(b, 'pelvis', 'accent', [0.36, 0.14, 0.3], [0, -0.0, 0], [0, 0, 0], { c: 0.03 });
  const n = far ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + PI / n, front = Math.cos(a) > 0.3;
    const len = front ? 0.3 : 0.36;
    b.add(plate(b, 0.17, len, 0.035, { c: 0.01, tx: 1.15, bx: 0.75 }), 'pelvis', i % 2 ? 'accent' : 'paint',
      [Math.sin(a) * 0.22, -0.06 - len / 2, Math.cos(a) * 0.2], [0.3 * Math.cos(a), a, -0.3 * Math.sin(a)]);
  }
  // skirt core (aux2): thruster bell, glowing nozzle, inner ring
  b.add(b.lathe([[0.02, 0.06], [0.14, 0.04], [0.17, -0.06], [0.2, -0.16], [0.17, -0.17]], 16), 'aux2', 'metal', [0, 0, 0]);
  b.add(b.cyl(0.15, 0.15, 0.02, 18), 'aux2', 'glow', [0, -0.15, 0]);
  b.add(b.tor(0.18, 0.012, 20, 4), 'aux2', 'trim', [0, -0.13, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.06, 0.03, 0.08, 10), 'aux2', 'glow', [0, -0.2, 0]);
  b.add(b.tor(0.29, 0.009, 30, 3), 'pelvis', 'glow', [0, -0.33, 0], [PI / 2, 0, 0]);
  if (r >= 2) b.add(b.tor(0.34, 0.007, 30, 3), 'pelvis', 'glow', [0, -0.27, 0], [PI / 2, 0, 0]);
  // side skirt flaps + pods on the thigh bones (they swing a little)
  PS(b, 'thigh', 'paint', [0.05, 0.3, 0.26], [0.07, -0.14, 0.02], [0, 0, 0.18], { c: 0.012, tz: 0.8, bz: 1.1 });
  b.sym(b.cyl(0.05, 0.06, 0.16, 10), 'thigh', 'metal', [0.02, -0.12, -0.05]);
  b.sym(b.cyl(0.04, 0.04, 0.02, 10), 'thigh', 'glow', [0.02, -0.205, -0.05]);
  PS(b, 'thigh', 'trim', [0.012, 0.18, 0.02], [0.1, -0.12, 0.12], [0, 0, 0.18]);
}

function arm(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, rk = o.rank, r = o.r, far = b.far;
  // shoulder joint + clav bar
  b.sym(b.cyl(0.07, 0.07, D.shoulder, 10), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(14, 10), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.11);
  b.sym(b.tor(0.115, 0.01, 18, 4), 'upArm', 'glow', [0, 0, 0], [0, 0, PI / 2]);
  // floating pauldron: black dome under a big swept violet wedge, magenta rim, lifted off the shoulder ball
  b.sym(b.sph(18, 10, 0, PI * 2, 0, PI * 0.5), 'upArm', 'accent', [0.04, 0.05, 0], [0, 0, -0.32], [0.2, 0.15, 0.23]);
  // swept blade pauldron (plan view: an arrowhead raked back, so the whole top reads as a wedge), three layers deep
  const BLADE = [[-0.08, 0.19], [0.12, 0.17], [0.25, 0.04], [0.27, -0.3], [0.1, -0.15], [-0.08, -0.1]];
  b.sym(slabXZ(b, BLADE, 0.12, 0.8, 0.02), 'upArm', 'paint', [0.05, 0.15, 0.0], [0, 0, -0.42]);
  b.sym(slabXZ(b, BLADE.map(([x, z]) => [x * 0.62 + 0.02, z * 0.6 - 0.02]), 0.03, 1, 0.006), 'upArm', 'accent', [0.04, 0.215, 0.01], [0, 0, -0.42]);
  b.sym(b.box(0.014, 0.014, 0.34), 'upArm', 'glow', [0.24, 0.05, -0.05], [0.02, -0.1, -0.42]);
  b.sym(b.box(0.18, 0.016, 0.016), 'upArm', 'trim', [0.05, 0.17, 0.19], [0, -0.15, -0.42]);
  if (r >= 1) b.sym(slabXZ(b, BLADE.map(([x, z]) => [x * 0.9 + 0.05, z * 0.9 - 0.06]), 0.08, 0.9, 0.012), 'upArm', 'accent', [0.09, 0.05, 0], [0, 0, -0.72]);
  if (r >= 1 && !far) b.sym(slabXZ(b, BLADE.map(([x, z]) => [x * 0.7 + 0.08, z * 0.75 - 0.08]), 0.06, 0.9, 0.01), 'upArm', 'paint', [0.13, -0.05, 0], [0, 0, -0.95]);
  lamp(b, 'upArm', [0.08, 0.2, 0.16], [1.1, 0, -0.38], 0.018);
  // upper arm: chrome core + black sleeve plates + piston
  b.sym(b.cyl(0.07, 0.06, ua, 10), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.17, ua * 0.6, 0.17], [0.01, -ua * 0.55, 0], [0, 0, 0], { c: 0.025, tx: 1.1, tz: 1.1 });
  piston(b, 'upArm', [0.0, -0.08, -0.09], [0.0, -ua + 0.02, -0.08], 0.016);
  // elbow
  b.sym(discX(b, 0.09, 0.17, 14), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(discX(b, 0.05, 0.19, 10), 'foreArm', 'glow', [0, 0, 0]);
  // gauntlet: huge, widening toward the fist; black armour with a violet cuff, magenta seams, rear piston
  PS(b, 'foreArm', 'accent', [0.24, fa * 0.9, 0.26], [0.0, -fa * 0.52, 0], [0, 0, 0], { c: 0.035, tx: 0.82, tz: 0.8, bx: 1.08, bz: 1.08 });
  PS(b, 'foreArm', 'paint', [0.27, fa * 0.36, 0.29], [0.0, -fa * 0.78, 0], [0, 0, 0], { c: 0.03, tx: 0.95, bx: 1.05 });
  PS(b, 'foreArm', 'paint', [0.06, fa * 0.6, 0.2], [0.125, -fa * 0.45, 0], [0, 0, 0.04], { c: 0.015 });
  b.sym(b.box(0.012, fa * 0.5, 0.012), 'foreArm', 'glow', [0.158, -fa * 0.45, 0.07]);
  b.sym(b.box(0.27, 0.012, 0.012), 'foreArm', 'glow', [0, -fa * 0.6, 0.142]);
  piston(b, 'foreArm', [0.0, -0.05, -0.13], [0.0, -fa * 0.9, -0.14], 0.018);
  if (r >= 2) PS(b, 'foreArm', 'glow', [0.02, fa * 0.32, 0.02], [0.08, -fa * 0.42, 0.135], [0, 0, 0]);
  // phase fist: chrome palm block, four floating knuckle segments with hardlight between them, thumb
  b.sym(b.rbox(0.23, 0.14, 0.23, 0.035), 'hand', 'accent', [0, -0.05, 0.0]);
  b.sym(b.cbox(0.2, 0.05, 0.2, 0.01), 'hand', rk >= 3 ? 'glow' : 'trim', [0, -0.125, 0.0]);
  for (let i = 0; i < 4; i++) b.sym(b.rbox(0.054, 0.08, 0.24, 0.018), 'hand', 'paint', [-0.084 + i * 0.056, -0.165, 0.0]);
  b.sym(b.rbox(0.07, 0.11, 0.08, 0.02), 'hand', 'metal', [-0.11, -0.06, 0.1], [0.3, 0, -0.3]);
  b.sym(b.cbox(0.24, 0.02, 0.24, 0.006), 'hand', 'metal', [0, -0.02, 0.0]);
  if (!far) for (let i = 0; i < 4; i++) b.sym(b.cbox(0.04, 0.012, 0.012, 0.003), 'hand', 'glow', [-0.084 + i * 0.056, -0.2, 0.118]);
  // R2: hardlight arm blades along the outer gauntlet, past the fist
  if (rk >= 2) {
    b.sym(b.cbox(0.03, fa * 0.6, 0.05, 0.01), 'foreArm', 'metal', [0.16, -fa * 0.55, -0.04]);
    b.sym(fin(b, [[0, 0.06], [0.05, 0.0], [0.04, -0.44], [0.0, -0.56], [-0.01, -0.3]], 0.016, 0.004), 'foreArm', 'glow', [0.175, -fa * 0.35, -0.04], [0, PI / 2, 0]);
    b.sym(fin(b, [[0, 0.04], [0.03, 0.0], [0.025, -0.3], [0.0, -0.38]], 0.018, 0.004), 'foreArm', 'trim', [0.17, -fa * 0.35, -0.02], [0, PI / 2, 0]);
  }
}

function back(b, o) {
  const rk = o.rank, far = b.far, S = 'aux0';
  // phase drive: an upright hardlight ring in a chrome frame, a crystal floating inside, swept fins
  b.add(b.cbox(0.2, 0.16, 0.08, 0.02), S, 'metal', [0, -0.06, 0.05]);
  const ringSlot = rk === 0 ? 'metal' : 'glow';
  if (rk === 0) b.add(b.tor(0.24, 0.016, 32, 4, PI * 1.4), S, ringSlot, [0, 0.12, -0.02], [0, 0, -0.5]);
  else b.add(b.tor(0.24, 0.014, 36, 4), S, ringSlot, [0, 0.12, -0.02]);
  b.add(b.tor(0.27, 0.012, 36, 4), S, 'accent', [0, 0.12, -0.0]);
  if (!far) for (let i = 0; i < 6; i++) { const a = i * PI / 3 + PI / 6; b.add(b.cbox(0.03, 0.05, 0.04, 0.008), S, 'trim', [Math.cos(a) * 0.275, 0.12 + Math.sin(a) * 0.275, 0], [0, 0, a]); }
  b.add(crystal(b), S, 'glow', [0, 0.12, -0.02], [0, 0, 0], [0.05, 0.1, 0.05]);
  b.sym(fin(b, [[0, 0], [0.07, 0.02], [0.3, 0.36], [0.24, 0.38], [0.03, 0.12]], 0.03, 0.008), S, 'paint', [0.08, -0.04, 0.04], [-0.35, 0.15, -0.1]);
  b.sym(b.box(0.01, 0.3, 0.012), S, 'glow', [0.2, 0.12, 0.02], [-0.35, 0.15, -0.75]);
  if (rk >= 5) {
    // crown: second (outer) ring + a triangular sigil standing above the head
    b.add(b.tor(0.34, 0.01, 40, 3), S, 'glow', [0, 0.12, -0.04]);
    b.scope([0, 0.5, 0.12], [-0.35, 0, 0], 1, () => {
      b.add(b.tor(0.13, 0.008, 30, 3), S, 'glow', [0, 0, 0]);
      for (let i = 0; i < 3; i++) { const a = PI / 2 + i * 2 * PI / 3; b.add(b.cbox(0.2, 0.016, 0.016, 0.004), S, 'trim', [Math.cos(a + PI / 3) * 0.065, Math.sin(a + PI / 3) * 0.065, 0], [0, 0, a + PI / 3 + PI / 2]); }
      b.add(crystal(b), S, 'glow', [0, 0, 0], [0, 0, 0], [0.03, 0.05, 0.03]);
    });
  }
}

function shards(b, o) {
  if (o.rank < 4) return;
  // R4: crystal shards orbiting at chest height (aux1 on the pelvis spins in post)
  const n = b.far ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2, R = 0.62 + (i % 2) * 0.06, y = (i % 2 ? 0.08 : -0.04);
    b.add(crystal(b), 'aux1', i % 3 ? 'glow' : 'trim', [Math.cos(a) * R, y, Math.sin(a) * R], [0.4, -a, 0.3], [0.065, 0.16, 0.065]);
  }
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  arm(b, o);
  back(b, o);
  shards(b, o);
}

// ---------- afterimages ----------
const GHOST_VS = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  #include <skinbase_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(normalMatrix * objectNormal); vV = -mvPosition.xyz; vY = transformed.y;
}`;
const GHOST_FS = /* glsl */`
uniform vec3 uColor; uniform float uA, uTime, uSeed, uCut;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float band = floor(vY * 26.0 + uSeed * 13.0);
  if (fract(sin(band * 91.7 + floor(uTime * 14.0) + uSeed) * 437.58) < uCut) discard;
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
  float scan = 0.75 + 0.25 * sin(vY * 120.0 - uTime * 18.0);
  gl_FragColor = vec4(uColor * (0.12 + f * 1.5) * scan * uA, 1.0);
}`;
function ghostMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 0 }, uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uCut: { value: 0.15 } },
    vertexShader: GHOST_VS, fragmentShader: GHOST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
function makeGhost(unit) {
  const src = unit.mesh, sk = src.skeleton;
  const root = sk.bones[0].clone(true);
  const byName = {};
  root.traverse((n) => { if (n.isBone) byName[n.name] = n; });
  const bones = sk.bones.map((bn) => byName[bn.name]);
  const m = new THREE.SkinnedMesh(src.geometry, ghostMat(0xd04dff));
  m.add(root);
  m.bind(new THREE.Skeleton(bones, sk.boneInverses), src.bindMatrix.clone());
  m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; m.renderOrder = 4; m.visible = false;
  m.name = 'phase-ghost';
  unit.root.add(m);
  return { m, bones, life: 0, max: 1, a0: 0, mode: 'off', drift: new THREE.Vector3() };
}
function snap(g, unit, off) {
  const src = unit.mesh.skeleton.bones;
  for (let i = 0; i < src.length; i++) { g.bones[i].position.copy(src[i].position); g.bones[i].quaternion.copy(src[i].quaternion); g.bones[i].scale.copy(src[i].scale); }
  g.m.position.copy(unit.body.position).add(off || _zero);
}
const _zero = new THREE.Vector3();
function ghosts(unit, ctx) {
  if (!ctx.gh) {
    ctx.gh = [makeGhost(unit), makeGhost(unit), makeGhost(unit)];
    const dis = unit.dispose.bind(unit);
    unit.dispose = () => { for (const g of ctx.gh) { g.m.material.dispose(); g.m.removeFromParent(); } dis(); };
  }
  return ctx.gh;
}
// one-shot afterimage left at the current pose: off = offset (model space), life (s), alpha, drift (m/s)
function echo(unit, ctx, off, life = 0.5, a = 0.9, drift) {
  const gs = ghosts(unit, ctx);
  let g = gs.find((x) => x.mode === 'off') || gs.filter((x) => x.mode === 'echo').sort((p, q) => p.life - q.life)[0];
  if (!g) return;
  snap(g, unit, off);
  g.mode = 'echo'; g.life = life; g.max = life; g.a0 = a; g.drift.set(...(drift || [0, 0, 0]));
  g.m.visible = true;
}

// ---------- segment scatter ----------
// outward directions per floating segment (parent-local), applied as offsets on the bones' rest positions
const SEG = [
  ['head', [0, 1, 0.35]], ['clavL', [1, 0.35, 0]], ['clavR', [-1, 0.35, 0]], ['aux0', [0, 0.35, -1]], ['aux2', [0, -1, 0.1]],
  ['aux3', [0, 0.1, 1]], ['handL', [0.4, -0.5, 0.6]], ['handR', [-0.4, -0.5, 0.6]], ['thighL', [0.8, -0.5, 0]], ['thighR', [-0.8, -0.5, 0]],
  ['aux1', [0, 0.3, 0]],
];
const _v = new THREE.Vector3();
function scatter(ctx, bones, k, jitter = 0, t = 0) {
  if (!ctx.rest) ctx.rest = SEG.map(([n]) => bones[BI[n]].position.clone());
  SEG.forEach(([n, d], i) => {
    const bn = bones[BI[n]], j = jitter ? Math.sin(t * 37 + i * 11.3) * jitter : 0;
    _v.set(d[0], d[1], d[2]).normalize().multiplyScalar(k * (1 + 0.35 * Math.sin(i * 2.7)) + j);
    bn.position.copy(ctx.rest[i]).add(_v);
  });
}

// ---------- anims ----------
// the base hover stance: heavy, hunched, fists hanging forward under the chest
function base(P, ctx, t) {
  L.hoverIdle(P, ctx, t);
  P[L.PX + 1] *= 0.55;
  L.A(P, 'pelvis', 0.02, 0, 0); L.A(P, 'spine', 0.05, 0, 0); L.A(P, 'chest', 0.07, 0, 0);
  L.A(P, 'neck', -0.06, 0, 0); L.A(P, 'head', -0.06, 0, 0);
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.7, br = Math.sin(t * 1.4 + ph);
    L.RS(P, 'clav', s, 0, 0, 0.03 * Math.sin(t * 1.8));
    L.RS(P, 'upArm', s, -0.42 + br * 0.04, -0.1, 0.34 + br * 0.03);
    L.RS(P, 'foreArm', s, -1.3 + br * 0.05, 0.15, 0);
    L.RS(P, 'hand', s, 0.35, 0, -0.08);
    L.RS(P, 'thigh', s, 0.04 + Math.sin(t * 1.2 + ph) * 0.03, 0, 0.06);
    L.RS(P, 'shin', s, 0, 0, 0); L.RS(P, 'foot', s, 0, 0, 0);
  }
}
const _ik = new THREE.Vector3();
function fists(P, ctx, l, r, out = 0.3) {
  if (l) L.armIK(P, ctx, 'L', _ik.set(l[0], l[1], l[2]), out);
  if (r) L.armIK(P, ctx, 'R', _ik.set(r[0], r[1], r[2]), out);
}
const OD_OUT = 0.23, OD_BACK = 0.58, OD_HIT = 0.38;

const anims = {
  idle(P, t, ctx) {
    base(P, ctx, t);
    // every ~7 s: rolls the shoulders and grinds the fists together
    const c = t % 7.2, k = L.kf(c, [[0, 0], [4.8, 0], [5.2, 1], [6.2, 1], [6.7, 0]]);
    if (k > 0) {
      const g = Math.sin(t * 9) * 0.03 * k;
      for (const s of SIDES) L.AS(P, 'upArm', s, -0.45 * k, 0.25 * k, -0.15 * k), L.AS(P, 'foreArm', s, -0.45 * k + g, 0.3 * k, 0);
      L.A(P, 'chest', -0.06 * k, 0, 0); L.A(P, 'head', 0.12 * k, 0, 0);
    }
  },
  advance(P, t, ctx) {
    base(P, ctx, t);
    L.A(P, 'pelvis', 0.24, 0, 0); L.A(P, 'spine', 0.04, 0, 0); L.A(P, 'neck', -0.15, 0, 0); L.A(P, 'head', -0.12, 0, 0);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.35, 0, -0.08), L.AS(P, 'foreArm', s, 0.2, 0, 0), L.AS(P, 'thigh', s, 0.3, 0, 0);
  },
  // PHASE STRIKE: right fist draws back, then a blink-jab (the arm smears through an afterimage), impact 0.42
  attack(P, u, ctx) {
    base(P, ctx, ctx.t);
    const wind = L.kf(u, [[0, 0], [0.3, 1], [0.36, 0], [1, 0]]), hit = L.kf(u, [[0, 0], [0.33, 0], [0.4, 1], [0.62, 1], [1, 0]]);
    P[L.PX + 2] += 0.14 * hit - 0.06 * wind; P[L.PX + 1] -= 0.04 * wind;
    L.A(P, 'pelvis', 0.1 * hit, 0.25 * hit - 0.3 * wind, 0);
    L.A(P, 'chest', 0.08 * hit - 0.05 * wind, 0.3 * hit - 0.35 * wind, 0);
    L.A(P, 'head', -0.05 * hit, -0.4 * hit + 0.3 * wind, 0);
    L.RS(P, 'upArm', 'R', L.lerp(L.lerp(-0.32, 0.55, wind), -1.5, hit), L.lerp(0, 0.25, hit), L.lerp(0.3, 0.12, hit));
    L.RS(P, 'foreArm', 'R', L.lerp(L.lerp(-0.9, -1.9, wind), -0.08, hit), 0, 0);
    L.RS(P, 'hand', 'R', L.lerp(0.15, -0.1, hit), 0, 0);
    // guard: left fist up in front of the chest
    const g = Math.max(wind, hit);
    L.RS(P, 'upArm', 'L', L.lerp(-0.32, -0.75, g), -0.25 * g, L.lerp(0.3, 0.2, g));
    L.RS(P, 'foreArm', 'L', L.lerp(-0.9, -1.75, g), 0.3 * g, 0);
  },
  // double-fist hammer: both arms overhead, blink down, impact 0.52
  attack_alt(P, u, ctx) {
    base(P, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.38, 1], [0.46, 0], [1, 0]]), dn = L.kf(u, [[0, 0], [0.44, 0], [0.5, 1], [0.72, 1], [1, 0]]);
    P[L.PX + 1] += 0.16 * up - 0.14 * dn; P[L.PX + 2] += 0.12 * dn;
    L.A(P, 'pelvis', -0.12 * up + 0.2 * dn, 0, 0); L.A(P, 'chest', -0.2 * up + 0.3 * dn, 0, 0); L.A(P, 'head', -0.25 * up + 0.1 * dn, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(L.lerp(-0.32, -2.7, up), -1.0, dn), L.lerp(0, 0.35, up + dn), L.lerp(0.3, 0.12, Math.max(up, dn)));
      L.RS(P, 'foreArm', s, L.lerp(L.lerp(-0.9, -0.9, up), -0.2, dn), 0, 0);
      L.AS(P, 'thigh', s, -0.15 * up + 0.25 * dn, 0, 0.1 * dn);
    }
  },
  // fortify: fists crash together in front of the core, the core flares (cast 0.45)
  cast(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.35, 1], [0.45, 1.1], [0.8, 1], [1, 0]]), slam = L.kf(u, [[0, 0], [0.4, 0], [0.45, 1], [0.7, 0]]);
    P[L.PX + 1] -= 0.06 * slam;
    L.A(P, 'chest', -0.12 * k + 0.1 * slam, 0, 0); L.A(P, 'head', -0.15 * k, 0, 0);
    const y = 1.18 - 0.05 * slam, z = 0.5 * k + 0.1;
    if (k > 0.02) {
      const lp = [0.11 + 0.25 * (1 - k), y, z], rp = [-0.11 - 0.25 * (1 - k), y, z];
      const P0 = P.slice(); fists(P, ctx, lp, rp, 0.45);
      for (let i = 0; i < P.length; i++) P[i] = L.lerp(P0[i], P[i], Math.min(1, k));
    }
  },
  // PHASE SHIFT: crouch + cross arms, blink through the enemy front line (body offset in tick), wide sweep, blink back, taunt
  overdrive(P, u, ctx) {
    base(P, ctx, ctx.t);
    const cr = L.kf(u, [[0, 0], [0.12, 1], [OD_OUT, 1], [OD_OUT + 0.02, 0], [1, 0]]);
    const dash = L.kf(u, [[OD_OUT - 0.01, 0], [OD_OUT + 0.02, 1], [0.3, 0.2], [OD_BACK - 0.02, 0.1], [OD_BACK + 0.01, 1], [0.62, 0], [1, 0]]);
    const sweep = L.kf(u, [[0.24, 0], [0.31, 1], [0.44, 1.1], [0.52, 0.2], [OD_BACK, 0]]);
    const taunt = L.kf(u, [[0.6, 0], [0.7, 1], [0.88, 1], [1, 0]]);
    P[L.PX + 1] += -0.16 * cr + 0.12 * sweep + 0.1 * taunt;
    L.A(P, 'pelvis', 0.25 * cr + 0.45 * dash - 0.15 * taunt, 0.5 * sweep * Math.sin(u * 30), 0);
    L.A(P, 'chest', 0.2 * cr + 0.2 * dash - 0.3 * taunt, 0.6 * sweep - 0.6 * L.kf(u, [[0.36, 0], [0.46, 1], [0.52, 0]]), 0);
    L.A(P, 'head', 0.25 * cr - 0.35 * taunt, 0, 0);
    for (const s of SIDES) {
      // crossed guard -> trailing arms -> sweep wide -> spread taunt
      const ux = -1.25 * cr + 0.7 * dash - 0.9 * sweep - 0.25 * taunt, uy = 0.6 * cr, uz = 0.3 - 0.25 * cr + 1.2 * sweep + 0.9 * taunt;
      L.RS(P, 'upArm', s, L.lerp(-0.32, 0, cr + dash + sweep + taunt > 0 ? 1 : 0) + ux, uy, uz);
      L.RS(P, 'foreArm', s, -0.9 - 0.85 * cr + 0.6 * dash + 0.7 * sweep - 0.5 * taunt, 0.12, 0);
      L.AS(P, 'thigh', s, 0.3 * dash - 0.1 * cr, 0, 0.35 * taunt + 0.2 * sweep);
    }
  },
  // hit: recoil, segments scatter and snap back (tick)
  hit(P, u, ctx) {
    base(P, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir;
    L.A(P, 'pelvis', -0.25 * k, 0.12 * k * d, 0.12 * k * d); P[L.PX + 2] -= 0.12 * k;
    L.A(P, 'chest', -0.15 * k, 0, 0); L.A(P, 'head', -0.3 * k, 0, 0.2 * k * d);
    for (const s of SIDES) L.AS(P, 'upArm', s, 0.3 * k, 0, 0.2 * k);
  },
  // die: glitches, thrusters cut, drops onto the skirt and its fists, segments drift apart and the head rolls off (tick)
  die(P, u, ctx) {
    base(P, ctx, ctx.t * (1 - u * 0.8));
    const g = L.kf(u, [[0, 0], [0.3, 0.1], [0.6, 1], [0.66, 0.92], [0.72, 1], [1, 1]]);
    const gl = u < 0.3 ? Math.sin(u * 160) * 0.05 * (1 - u / 0.3) : 0;
    P[L.PX + 1] = -0.48 * g + gl; P[L.PX + 2] += 0.1 * g;
    L.A(P, 'pelvis', 0.45 * g + gl * 2, 0.15 * g, 0.12 * g);
    L.A(P, 'chest', 0.3 * g, 0, 0); L.A(P, 'neck', 0.3 * g, 0, 0); L.A(P, 'head', 0.4 * g, 0.4 * g, 0.5 * g);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.32, -0.9, g), 0, L.lerp(0.3, 0.55, g));
      L.RS(P, 'foreArm', s, L.lerp(-0.9, -0.2, g), 0, 0);
      L.AS(P, 'thigh', s, -0.3 * g, 0, 0.5 * g);
    }
  },
  // victory: fists slam overhead, then a slow hover with arms raised in a V and segments floating apart (tick)
  victory(P, t, ctx) {
    base(P, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.7)), pump = Math.max(0, Math.sin(t * 2.6)) ** 3;
    P[L.PX + 1] += 0.16 * k + 0.04 * Math.sin(t * 2);
    L.A(P, 'chest', -0.2 * k, 0, 0); L.A(P, 'head', -0.3 * k, 0, 0);
    for (const s of SIDES) {
      L.RS(P, 'upArm', s, L.lerp(-0.32, -2.5, k) - 0.25 * pump, 0, L.lerp(0.3, 0.55, k));
      L.RS(P, 'foreArm', s, L.lerp(-0.9, -0.5, k) - 0.4 * pump, 0, 0);
      L.AS(P, 'thigh', s, 0, 0, 0.25 * k);
    }
  },
  // deploy: blinks in as scattered segments that converge and lock (land 0.4), then unfurls and knocks its fists (ready 0.85)
  deploy(P, u, ctx) {
    base(P, ctx, ctx.t);
    const curl = L.kf(u, [[0, 1], [0.4, 1], [0.6, 0], [1, 0]]), knock = L.kf(u, [[0.62, 0], [0.75, 1], [0.86, 1.1], [1, 0]]);
    L.A(P, 'pelvis', 0.3 * curl, 0, 0); L.A(P, 'chest', 0.25 * curl, 0, 0); L.A(P, 'head', 0.3 * curl - 0.15 * knock, 0, 0);
    P[L.PX + 1] -= 0.12 * curl;
    for (const s of SIDES) { L.AS(P, 'upArm', s, -0.4 * curl - 0.6 * knock, 0.3 * knock, -0.2 * curl - 0.15 * knock); L.AS(P, 'foreArm', s, -0.5 * curl - 0.6 * knock, 0.3 * knock, 0); }
  },
};

// scatter amount wanted per action phase (m) + jitter
function scatterFor(name, u, t) {
  switch (name) {
    case 'hit': return [kf(u, [[0, 0], [0.08, 0.13], [0.45, 0.02], [0.6, 0], [1, 0]]), 0.012];
    case 'overdrive': return [kf(u, [[0, 0], [0.12, 0.04], [OD_OUT - 0.01, 0.06], [OD_OUT + 0.02, 0.22], [0.27, 0], [OD_BACK - 0.01, 0], [OD_BACK + 0.02, 0.2], [0.64, 0], [1, 0]]), 0.01];
    case 'deploy': return [kf(u, [[0, 0.9], [0.38, 0.05], [0.42, 0], [1, 0]]), 0.02];
    case 'die': return [kf(u, [[0, 0], [0.25, 0.05], [0.65, 0.12], [1, 0.16]]), u < 0.3 ? 0.03 : 0];
    case 'attack': return [kf(u, [[0.3, 0], [0.36, 0.04], [0.5, 0]]), 0];
    case 'attack_alt': return [kf(u, [[0.42, 0], [0.47, 0.05], [0.6, 0]]), 0];
    case 'cast': return [kf(u, [[0.3, 0], [0.45, -0.02], [0.55, 0.04], [0.8, 0]]), 0];
    default: return [0, 0];
  }
}

export default {
  id: 'phase', name: 'PHASE', role: 'tank', faction: 'experimental', rarity: 'rare', realm: 'scifi', noDrop: true,
  rig: 'hover', dims: DIMS, height: 1.92, radius: 0.72, walkSpeed: 1.0, scheme: 'bold',
  style: { weapon: 'fists', heavy: 1 },
  paint: { experimental: { paint: 0x5a1cb4, accent: 0x0d0c12, trim: 0xff4fd2, glow: 0xd34dff, eye: 0xffb4f2 } },
  mats: {
    all: {
      paint: { rough: 0.26, coat: 1, panel: { groove: 0.35 }, detail: { map: 'scratch', scale: 2.5, albedo: 0.25, rough: 0.4 } },
      accent: { rough: 0.36, metal: 0.3, env: 0.6, panel: { groove: 0.22, scale: 5 } },
      metal: { color: 0x8d93a3, metal: 0.95, rough: 0.2, panel: { groove: 0.1, scale: 9 } },
    },
  },
  sockets: { muzzle: ['handR', [0, -0.2, 0.02]], muzzleL: ['handL', [0, -0.2, 0.02]], hand: ['handR', [0, -0.18, 0]], core: [0, 0.1, 0.3], head: [0, 0.08, 0.12] },
  events: {
    attack: [['impact', 0.42]], attack_alt: [['impact', 0.52]], cast: [['cast', 0.45]],
    overdrive: [['cast', 0.04], ['impact', OD_HIT]], die: [['down', 0.62]], deploy: [['land', 0.4], ['ready', 0.85]], hit: [],
  },
  durs: { attack: 0.95, attack_alt: 1.15, cast: 1.1, overdrive: 2.6, hit: 0.45, die: 2.0, deploy: 1.5 },
  anims,
  post(P, ctx, act) {
    ctx.act = act ? act.name : null;
    ctx.au = act ? Math.min(1, act.t / act.dur) : 0;
    // R4 shard orbit
    const i = BI.aux1 * 3, fast = act && act.name === 'overdrive' ? 3 : 1;
    P[i] = 0.25 * Math.sin(ctx.t * 0.6); P[i + 1] = ctx.t * 0.8 * fast; P[i + 2] = 0.15 * Math.cos(ctx.t * 0.45);
    // the back crystal spins
    P[BI.aux3 * 3 + 1] = ctx.t * 1.5;
  },
  tick(unit, dt, ctx, bones) {
    const a = ctx.act, u = ctx.au, t = ctx.t, rk = unit.rank;
    // floating segments: a slow uncanny breathing apart, plus the per-action scatter
    let [k, j] = a ? scatterFor(a, u, t) : [0, 0];
    if (!a && unit.state.loop === 'victory') k = 0.05 + 0.03 * Math.sin(t * 2.2);
    scatter(ctx, bones, k + 0.03 + 0.012 * Math.sin(t * 1.7), j, t);
    // body blink offsets (overdrive dash; deploy has no drop, it materialises in place)
    const body = unit.body;
    if (a === 'overdrive') {
      const d = unit.phaseDist ?? 2.4;
      const out = kf(u, [[OD_OUT, 0], [OD_OUT + 0.015, 1], [OD_BACK, 1], [OD_BACK + 0.015, 0]]);
      body.position.z = out * d;
    } else body.position.z = 0;
    if (a === 'deploy') body.position.y = 0;
    // afterimages
    const fire = (key, at, fn) => { if (a === key && u >= at && (ctx.fired?.[key + at] !== ctx.actId)) { (ctx.fired ||= {})[key + at] = ctx.actId; fn(); } };
    if (a !== ctx.lastAct || (a && u < (ctx.lastU ?? 0))) ctx.actId = (ctx.actId || 0) + 1;
    ctx.lastAct = a; ctx.lastU = u;
    fire('overdrive', OD_OUT, () => {
      echo(unit, ctx, _v.set(0.45, 0, -0.1), 0.9, 0.9, [0.3, 0, 0]);
      echo(unit, ctx, _v.set(-0.45, 0, -0.1), 0.9, 0.9, [-0.3, 0, 0]);
    });
    fire('overdrive', 0.4, () => echo(unit, ctx, _v.set(0, 0, 0), 0.7, 0.8, [0, 0, -0.6]));
    fire('overdrive', OD_BACK - 0.005, () => echo(unit, ctx, _v.set(0, 0, 0), 0.6, 0.8));
    fire('attack', 0.32, () => echo(unit, ctx, _v.set(0, 0, -0.08), 0.35, 0.7));
    fire('attack_alt', 0.44, () => echo(unit, ctx, _v.set(0, 0.08, -0.05), 0.35, 0.7));
    fire('hit', 0.0, () => echo(unit, ctx, _v.set(ctx.st.hitDir * 0.12, 0, -0.18), 0.35, 0.8, [ctx.st.hitDir * 0.4, 0, -0.5]));
    fire('deploy', 0.38, () => { echo(unit, ctx, _v.set(0.5, 0, 0), 0.5, 1, [0.6, 0, 0]); echo(unit, ctx, _v.set(-0.5, 0, 0), 0.5, 1, [-0.6, 0, 0]); });
    fire('cast', 0.45, () => echo(unit, ctx, _v.set(0, 0, 0), 0.4, 0.6));
    if (ctx.gh || rk >= 3) {
      const gs = ghosts(unit, ctx);
      // R3+: one lagging afterimage always trails the body (re-snapped a beat behind)
      const tr = gs[2];
      if (rk >= 3 && !unit.state.dead && tr.mode !== 'echo') {
        tr.mode = 'trail';
        ctx.trT = (ctx.trT || 0) - dt;
        if (ctx.trT <= 0) { ctx.trT = 0.16; snap(tr, unit, _v.set(0.05 * Math.sin(t * 1.3), 0.01, -0.07)); }
        tr.m.visible = true;
        tr.m.material.uniforms.uA.value = 0.2 + 0.08 * Math.sin(t * 5.1);
        tr.m.material.uniforms.uCut.value = 0.35;
      } else if (tr.mode === 'trail') { tr.mode = 'off'; tr.m.visible = false; }
      for (const g of gs) {
        const U = g.m.material.uniforms;
        U.uTime.value = t;
        if (g.mode !== 'echo') continue;
        g.life -= dt;
        g.m.position.addScaledVector(g.drift, dt);
        const f = Math.max(0, g.life / g.max);
        U.uA.value = g.a0 * f * f; U.uCut.value = 0.12 + 0.6 * (1 - f);
        if (g.life <= 0) { g.mode = 'off'; g.m.visible = false; }
      }
    }
    unit.phaseEcho = (off, life, alpha, drift) => echo(unit, ctx, _v.set(...(off || [0, 0, 0])), life, alpha, drift);
  },
  fxHints: { projectile: 'phase_fist', impact: 'phase_scar', overdrive: 'phase_shift', color: 0xd34dff },
  build,
};
