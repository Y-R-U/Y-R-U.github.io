// TARANTULA, rogue artillery spider (epic archer, "Siege Walker"). Brief: docs/ROSTER.md `tarantula`; look: refs/ref_battle_02.png enemy back-near.
// Low armoured hull on four long knee-high legs, a heavy twin-cannon turret on its back with barrels reaching far past the
// sensor head, an orange spider-eye cluster, ammo bins, exhaust stacks and an antenna rack behind the turret.
// VALUE: `accent` = near-black gunmetal armour (most of the surface), `paint` = rust-red plates on the read-shapes only
// (turret cheeks, brow, hull nose, femur tops), `metal` = light brushed joints/pistons/barrels, `trim` = orange hazard markers,
// `glow`/`eye` = orange lamps, vents and eyes.
// Rank tiers (ROSTER): R0-1 stripped (no hull skirts/ammo bins, scrap patch) · R2 base · R3 knee spikes + side armour skirts
//   · R4 third cannon (rear mortar) + extra antenna · R5 glowing orange leg joints + holo targeting ring crown.
// Rarity (o.r): rare+ hull lamps · epic+ turret ammo bins + femur stripes · legendary gold muzzle brakes.
// Technique: quad rig with every anim bespoke (own foot layout, 4-beat gait); feet are kept flat in post(); the two barrels sit
// on aux2/aux3 (re-parented to the aux0 turret) and recoil in tick(); turret aims via aux0 (yaw/pitch).
import { P, PS, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

// Everything is authored in design units and uniformly scaled by G (rig dims, parts via b.scope, anim translations),
// so the footprint fits a board slot at the battle's uniform unit scale.
const G = 0.8;
const F0 = 0.6, T0 = 0.82, HOV0 = 0.62, HX0 = 0.4, HZ0 = 0.34, ANK0 = 0.075;
const FEMUR = F0 * G, TIBIA = T0 * G, HOVER = HOV0 * G, HIPX = HX0 * G, HIPZ = HZ0 * G, ANKLE = ANK0 * G;
const HS = 1.3, TS = 1.3, HDS = 1.35;   // hull / turret / head part scale (design units)
const DIMS = {
  hover: HOVER, femur: FEMUR, tibia: TIBIA, qreach: 0.85, ankle: ANKLE, hipX: HIPX, hipY: 0,
  spine: 0, chest: 0, neck: 0.1, headOff: 0.02, clavX: 0, clavY: 0, shoulder: HIPX,
  offsets: {
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0.08 * G, 0.56 * G], head: [0, 0.02 * G, 0.05 * G],
    clavL: [0, 0, HIPZ], upArmL: [HIPX, 0, 0], foreArmL: [FEMUR, 0, 0], handL: [TIBIA, 0, 0],
    thighL: [HIPX, 0, -HIPZ], shinL: [FEMUR, 0, 0], footL: [TIBIA, 0, 0],
    aux0: [0, 0.31 * G, -0.13 * G], aux1: [0, 0.12 * G, 0], aux2: [0.15 * TS * G, 0.13 * TS * G, 0.12 * TS * G], aux3: [-0.15 * TS * G, 0.13 * TS * G, 0.12 * TS * G],
  },
  parents: { aux2: 'aux0', aux3: 'aux0' },
};
const BL = 1.0;                       // barrel length from the breech (aux2/aux3 origin) to the muzzle face
const LEGS = [
  { up: 'upArmL', lo: 'foreArmL', ft: 'handL', s: 1, front: 1, ph: 0 },
  { up: 'upArmR', lo: 'foreArmR', ft: 'handR', s: -1, front: 1, ph: 0.5 },
  { up: 'thighL', lo: 'shinL', ft: 'footL', s: 1, front: 0, ph: 0.75 },
  { up: 'thighR', lo: 'shinR', ft: 'footR', s: -1, front: 0, ph: 0.25 },
];
// planted foot spots (root space, left side; mirrored by s)
const HOME = [[0.8, 0.66], [0.8, 0.66], [0.82, -0.62], [0.82, -0.62]];
const SIDES = ['L', 'R'];
const TAU = PI * 2;

// knee bend in the home stance (for two-bone pistons that must line up across femur/tibia)
function restKnee(front) {
  const hz = front ? HZ0 : -HZ0, f = HOME[front ? 0 : 2];
  const r = Math.hypot(f[0] - HX0, f[1] - hz), dy = ANK0 - HOV0, L = Math.hypot(r, dy);
  const be = Math.acos((F0 * F0 + T0 * T0 - L * L) / (2 * F0 * T0));
  return -(PI - be);
}

// ---------------- small greebles ----------------
function lamp(b, bone, pos, rot, r = 0.028, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.02, 14), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.03, 14), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false, glow = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, glow ? 'glow' : 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.9, h / (n * 2.2), 0.045, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.012]); });
}
function rivets(b, bone, pts, rot = [PI / 2, 0, 0], mirror = true) {
  if (b.far) return;
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  for (const p of pts) put(b.cyl(0.011, 0.011, 0.014, 6), bone, 'metal', p, rot);
}
// hazard stripes: alternating trim / accent bars across a strip of width w (x), height h
function hazard(b, bone, pos, rot, w, h, n = 6, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  b.scope(pos, rot, 1, () => {
    for (let i = 0; i < n; i++) put(b.box(w / n * 0.55, h, 0.012), bone, i % 2 ? 'accent' : 'trim', [-w / 2 + (i + 0.5) * w / n, 0, 0], [0, 0, 0.5]);
  });
}
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function stencil(b, bone, slot, text, pos, rot3, h = 0.07) {
  const w = h * 0.55, t = h * 0.17, gap = w * 1.45;
  b.scope(pos, rot3, 1, () => {
    [...text].forEach((ch, i) => {
      const cx = (i - (text.length - 1) / 2) * gap;
      for (const s of SEG[ch] || '') {
        const hz = s === 'a' || s === 'd' || s === 'g';
        const x = cx + (s === 'b' || s === 'c' ? w / 2 : s === 'e' || s === 'f' ? -w / 2 : 0);
        const y = s === 'a' ? h / 2 : s === 'd' ? -h / 2 : s === 'g' ? 0 : s === 'b' || s === 'f' ? h / 4 : -h / 4;
        b.add(hz ? b.box(w * 0.8, t, 0.006) : b.box(t, h * 0.42, 0.006), bone, slot, [x, y, 0]);
      }
    });
  });
}
// straight cylinder between two points (local to one bone)
function strut(b, p, q, r, seg = 10) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, L, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}

// ---------------- legs ----------------
// One left leg (mirrored onto the right by b.sym). Bone frames: femur/tibia run along +x; +y = top of the femur,
// on the tibia +y faces away from the body. The foot bone is kept level by post().
function leg(b, o, up, lo, ft, front) {
  const far = b.far, rk = o.rank, F = F0, T = T0, ANKLE = ANK0;
  // hip: ball + armoured dome pod with an orange lamp (the ref's round leg-top pods)
  b.sym(b.sph(14, 10), up, 'metal', [0, 0, 0], [0, 0, 0], 0.12);
  b.sym(b.sph(16, 10, 0, PI * 2, 0, PI / 2), up, 'accent', [0.07, 0.03, 0], [0, 0, -0.25], [0.18, 0.15, 0.18]);
  b.sym(b.cyl(0.185, 0.185, 0.04, 16), up, 'metal', [0.07, 0.02, 0], [0, 0, -0.25]);
  lamp(b, up, [0.16, 0.12, 0], [0, 0, -0.95], 0.034);
  if (rk >= 5) b.sym(b.tor(0.13, 0.014, 18, 5), up, 'glow', [0.0, 0, 0], [0, PI / 2, 0]);
  // femur: tapered armoured beam, rust stripe on top, metal strut + hydraulic underneath
  b.sym(plate(b, 0.2, F * 0.82, 0.17, { c: 0.035, tx: 0.72, tz: 0.82 }), up, 'accent', [F * 0.52, 0, 0], [0, 0, -PI / 2]);
  b.sym(plate(b, 0.035, F * 0.55, 0.1, { c: 0.01, tx: 0.7 }), up, o.r >= 2 ? 'paint' : 'accent', [F * 0.47, 0.105, 0], [0, 0, -PI / 2]);
  b.sym(plate(b, 0.12, F * 0.42, 0.05, { c: 0.012 }), up, 'accent', [F * 0.5, 0.02, 0.095], [0, 0, -PI / 2]);
  b.sym(plate(b, 0.12, F * 0.42, 0.05, { c: 0.012 }), up, 'accent', [F * 0.5, 0.02, -0.095], [0, 0, -PI / 2]);
  rivets(b, up, [[F * 0.3, 0.115, 0.045], [F * 0.5, 0.11, 0.045], [F * 0.68, 0.1, 0.045], [F * 0.3, 0.115, -0.045], [F * 0.5, 0.11, -0.045]], [0, 0, 0]);
  // two-bone knee hydraulic: cylinder on the femur, rod on the tibia, aligned at the home stance
  const z2 = restKnee(front), c = Math.cos(-z2), s = Math.sin(-z2);
  const toLo = (p) => { const x = p[0] - F, y = p[1]; return [x * c - y * s, x * s + y * c, p[2]]; };
  const Q = [0.24, -0.085, 0], cq = Math.cos(z2), sq = Math.sin(z2);
  const Qf = [F + Q[0] * cq - Q[1] * sq, Q[0] * sq + Q[1] * cq, 0];
  const A0 = [0.12, -0.095, 0], d = [Qf[0] - A0[0], Qf[1] - A0[1]], dl = Math.hypot(d[0], d[1]);
  const A1 = [A0[0] + d[0] / dl * dl * 0.55, A0[1] + d[1] / dl * dl * 0.55, 0];
  b.sym(strut(b, A0, A1, 0.036), up, 'metal');
  b.sym(b.cyl(0.046, 0.046, 0.03, 10), up, 'accent', A1, [0, 0, Math.atan2(d[0], -d[1]) + PI]);
  const R0 = toLo([A1[0] - d[0] / dl * 0.08, A1[1] - d[1] / dl * 0.08, 0]);
  b.sym(strut(b, R0, Q, 0.022), lo, 'metal');
  // knee: big joint drum + armoured cap (seen from above) + optional spike
  b.sym(b.cyl(0.1, 0.1, 0.21, 16), lo, 'metal', [0, 0, 0], [PI / 2, 0, 0]);
  b.sym(b.cyl(0.06, 0.06, 0.225, 12), lo, rk >= 5 ? 'glow' : 'accent', [0, 0, 0], [PI / 2, 0, 0]);
  b.sym(b.sph(14, 10, 0, PI * 2, 0, PI / 2), up, 'accent', [F - 0.02, 0.035, 0], [0, 0, -0.5], [0.13, 0.1, 0.135]);
  if (rk >= 5) b.sym(b.tor(0.105, 0.012, 18, 5), lo, 'glow', [0, 0, 0.11]);
  if (rk >= 3) b.sym(fin(b, [[-0.045, 0], [0.045, 0], [0.012, 0.3], [-0.01, 0.31]], 0.035, 0.008), up, 'trim', [F - 0.03, 0.1, 0], [0, PI / 2, -0.6]);
  // tibia: long tapered shell (outer face = +y), rust panel, metal lower strut into a shock collar, then the foot
  b.sym(plate(b, 0.17, T * 0.6, 0.17, { c: 0.035, tx: 0.62, tz: 0.7 }), lo, 'accent', [T * 0.34, 0.01, 0], [0, 0, -PI / 2]);
  b.sym(plate(b, 0.04, T * 0.42, 0.11, { c: 0.01, tx: 0.6 }), lo, 'accent', [T * 0.3, 0.095, 0], [0, 0, -PI / 2]);
  b.sym(plate(b, 0.06, T * 0.3, 0.13, { c: 0.012 }), lo, 'accent', [T * 0.2, -0.08, 0], [0, 0, -PI / 2]);
  if (!far) vent(b, lo, [T * 0.42, -0.035, 0.088], [0, 0, -PI / 2], 0.12, 0.08, 3, true);
  b.sym(b.cyl(0.045, 0.04, T * 0.36, 10), lo, 'metal', [T * 0.78, 0, 0], [0, 0, PI / 2]);
  b.sym(b.cyl(0.062, 0.062, 0.05, 12), lo, 'trim', [T * 0.66, 0, 0], [0, 0, PI / 2]);
  b.sym(b.cyl(0.056, 0.056, 0.03, 12), lo, 'accent', [T * 0.9, 0, 0], [0, 0, PI / 2]);
  lamp(b, lo, [T * 0.12, 0.1, 0], [0, 0, -PI / 2], 0.022);
  // foot (level): ankle ball, wide pad, toe plate, three claws biting forward-out
  b.sym(b.sph(10, 8), ft, 'metal', [0, 0, 0], [0, 0, 0], 0.06);
  b.sym(b.cbox(0.24, 0.055, 0.2, 0.015), ft, 'metal', [0.03, -ANKLE + 0.03, 0]);
  b.sym(plate(b, 0.16, 0.07, 0.15, { c: 0.02, tx: 0.7, tz: 0.7 }), ft, 'accent', [0.02, -ANKLE + 0.085, 0]);
  if (!far) for (const z of [-0.06, 0, 0.06]) b.sym(fin(b, [[0, -0.02], [0, 0.02], [0.1, -0.025]], 0.03, 0.006), ft, 'metal', [0.14, -ANKLE + 0.025, z]);
  b.sym(b.cyl(0.05, 0.05, 0.06, 10), ft, 'accent', [0, 0.02, 0]);
}

// ---------------- hull ----------------
function hull(b, o) {
  const far = b.far, rk = o.rank, r = o.r;
  // frame + flattened carapace (thorax) + belly
  P(b, 'pelvis', 'metal', [0.62, 0.24, 0.74], [0, 0, 0.02], [0, 0, 0], { c: 0.05 });
  P(b, 'pelvis', 'accent', [0.82, 0.17, 0.8], [0, 0.12, 0.02], [0, 0, 0], { c: 0.07, tx: 0.8, tz: 0.84 });
  P(b, 'pelvis', 'accent', [0.64, 0.12, 0.66], [0, -0.13, 0.02], [PI, 0, 0], { c: 0.05, tx: 0.78, tz: 0.8 });
  // nose: sloped glacis with hazard stripes, rust-red nose plates either side of the head
  P(b, 'pelvis', 'accent', [0.6, 0.05, 0.3], [0, 0.17, 0.36], [0.42, 0, 0], { c: 0.02, tx: 0.82 });
  hazard(b, 'pelvis', [0, 0.115, 0.485], [0.42, 0, 0], 0.42, 0.04, 9);
  PS(b, 'pelvis', 'paint', [0.18, 0.04, 0.3], [0.24, 0.205, 0.19], [0.1, 0, -0.12], { c: 0.012, tx: 0.8, tz: 0.85 });
  // flanks: angled armour + (R3) big side skirts, dotted orange lamps
  PS(b, 'pelvis', 'accent', [0.06, 0.16, 0.54], [0.41, 0.04, 0.02], [0, 0, -0.28], { c: 0.02, tz: 0.9 });
  if (rk >= 3) {
    PS(b, 'pelvis', 'paint', [0.05, 0.22, 0.36], [0.475, -0.02, 0.02], [0, 0, -0.18], { c: 0.015, tz: 0.85, bz: 0.95 });
    PS(b, 'pelvis', 'accent', [0.03, 0.08, 0.4], [0.5, 0.11, 0.02], [0, 0, -0.18], { c: 0.008 });
    rivets(b, 'pelvis', [[0.5, 0.06, 0.16], [0.5, 0.06, -0.14], [0.5, -0.08, 0.16], [0.5, -0.08, -0.14]], [0, 0, PI / 2 - 0.18]);
  }
  if (r >= 1) for (const z of [0.18, 0.0, -0.18]) lamp(b, 'pelvis', [0.43, 0.09, z], [0, 0, -PI / 2 + 0.3], 0.022);
  // top deck around the turret ring: light gunmetal deck plates, heat vents, rivets
  PS(b, 'pelvis', 'metal', [0.14, 0.02, 0.5], [0.3, 0.21, 0.0], [0, 0, -0.08], { c: 0.008 });
  vent(b, 'pelvis', [0.25, 0.22, -0.24], [-PI / 2, 0, 0], 0.14, 0.12, 4, true, true);
  rivets(b, 'pelvis', [[0.3, 0.215, 0.18], [0.3, 0.215, -0.1], [0.12, 0.215, 0.3]], [0, 0, 0]);
  // waist + armoured abdomen: the big rounded spider read from above, segment bands, orange hourglass, spinneret exhaust
  b.add(b.cyl(0.18, 0.22, 0.2, 12), 'pelvis', 'metal', [0, 0.03, -0.38], [PI / 2, 0, 0]);
  b.add(b.sph(20, 14), 'pelvis', 'accent', [0, 0.06, -0.66], [0.12, 0, 0], [0.34, 0.24, 0.36]);
  for (const [z, k] of [[-0.48, 0.78], [-0.62, 0.98], [-0.78, 0.88]]) b.add(b.tor(0.33 * k, 0.018, 24, 5), 'pelvis', 'metal', [0, 0.06, z], [0.12, 0, 0], [1, 0.72, 1]);
  P(b, 'pelvis', 'paint', [0.22, 0.04, 0.3], [0, 0.29, -0.6], [0.12, 0, 0], { c: 0.012, tx: 0.7, tz: 0.85 });
  b.add(fin(b, [[-0.07, 0.07], [0.07, 0.07], [0, 0]], 0.02, 0.004), 'pelvis', 'trim', [0, 0.315, -0.56], [-PI / 2 + 0.12, 0, 0]);
  b.add(fin(b, [[-0.07, -0.07], [0.07, -0.07], [0, 0]], 0.02, 0.004), 'pelvis', 'trim', [0, 0.315, -0.56], [-PI / 2 + 0.12, 0, 0]);
  vent(b, 'pelvis', [0, 0.06, -1.0], [0.25, PI, 0], 0.22, 0.1, 3);
  b.add(b.cyl(0.05, 0.06, 0.06, 12), 'pelvis', 'metal', [0, 0.0, -1.0], [PI / 2 - 0.3, 0, 0]);
  b.add(b.cyl(0.035, 0.035, 0.02, 10), 'pelvis', 'glow', [0, -0.01, -1.035], [PI / 2 - 0.3, 0, 0]);
  for (const sx of [1, -1]) {
    const x = sx * 0.2;
    b.add(b.cyl(0.042, 0.05, 0.26, 12), 'pelvis', 'metal', [x, 0.26, -0.74], [-0.55, 0, sx * 0.12]);
    b.add(b.cyl(0.052, 0.052, 0.035, 12), 'pelvis', 'accent', [x * 1.03, 0.33, -0.79], [-0.55, 0, sx * 0.12]);
    b.add(b.cyl(0.032, 0.032, 0.02, 10), 'pelvis', 'glow', [x * 1.06, 0.38, -0.82], [-0.55, 0, sx * 0.12]);
    if (!far) b.add(b.cyl(0.052, 0.052, 0.016, 12), 'pelvis', 'trim', [x, 0.2, -0.71], [-0.55, 0, sx * 0.12]);
    lamp(b, 'pelvis', [sx * 0.31, 0.06, -0.66], [0, 0, -sx * (PI / 2 - 0.2)], 0.022, 'glow', false);
  }
  if (!far) b.add(b.tor(0.04, 0.012, 10, 5), 'pelvis', 'metal', [0, -0.12, -0.95], [0, PI / 2, 0]);
  // belly lamp + underside sensor
  b.add(b.cyl(0.04, 0.04, 0.02, 12), 'pelvis', 'glow', [0, -0.2, 0.15]);
  // R0-1: stripped scrap patch bolted over the left flank
  if (rk < 2) {
    P(b, 'pelvis', 'trim', [0.04, 0.12, 0.2], [0.44, 0.06, 0.12], [0, 0.1, -0.3], { c: 0.01 });
    rivets(b, 'pelvis', [[0.46, 0.1, 0.05], [0.46, 0.1, 0.19]], [0, 0, PI / 2 - 0.3], false);
  }
}

// ---------------- head: sensor block with the orange spider-eye cluster ----------------
function head(b, o) {
  const far = b.far;
  P(b, 'head', 'accent', [0.34, 0.17, 0.26], [0, 0.02, 0.06], [0, 0, 0], { c: 0.04, tx: 0.82, tz: 0.8 });
  P(b, 'head', 'paint', [0.3, 0.045, 0.16], [0, 0.115, 0.08], [0.28, 0, 0], { c: 0.014, tx: 0.7 });
  b.add(b.cbox(0.28, 0.13, 0.04, 0.012), 'head', 'metal', [0, 0.0, 0.185], [0.15, 0, 0]);
  // eyes: 2 big, 2 side, 4 small (all orange)
  const eye = (x, y, z, r, ry = 0) => {
    b.add(b.cyl(r * 1.35, r * 1.35, 0.02, 14), 'head', 'metal', [x, y, z], [PI / 2 + 0.15, ry, 0]);
    b.add(b.cyl(r, r, 0.03, 14), 'head', 'eye', [x, y, z + 0.006], [PI / 2 + 0.15, ry, 0]);
  };
  eye(0.055, 0.025, 0.205, 0.042); eye(-0.055, 0.025, 0.205, 0.042);
  eye(0.125, 0.04, 0.17, 0.028, 0.6); eye(-0.125, 0.04, 0.17, 0.028, -0.6);
  for (const [x, y] of [[0.03, 0.08], [-0.03, 0.08], [0.1, -0.025], [-0.1, -0.025]]) eye(x, y, 0.2, 0.017);
  // chelicerae: two armoured sensor fangs under the face
  PS(b, 'head', 'accent', [0.06, 0.13, 0.07], [0.075, -0.1, 0.17], [-0.35, 0, 0.12], { c: 0.015, tx: 0.6, tz: 0.7 });
  if (!far) b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0.004, -0.09]], 0.03, 0.006), 'head', 'trim', [0.08, -0.16, 0.2], [-0.35, 0, 0.12]);
  b.sym(discX(b, 0.05, 0.05, 12), 'head', 'metal', [0.17, 0.0, 0.04]);
  b.sym(b.cyl(0.022, 0.022, 0.015, 10), 'head', 'glow', [0.198, 0.0, 0.04], [0, 0, PI / 2]);
  if (!far) {
    b.sym(b.cyl(0.006, 0.009, 0.24, 5), 'head', 'metal', [0.1, 0.18, -0.04], [-0.55, 0, -0.25]);
    if (o.rank >= 2) b.sym(b.sph(6, 4), 'head', 'glow', [0.13, 0.28, -0.11], [0, 0, 0], 0.014);
  }
  // neck collar
  b.add(b.cyl(0.12, 0.14, 0.12, 12), 'neck', 'metal', [0, -0.02, -0.02], [PI / 2, 0, 0]);
}

// ---------------- turret: twin heavy cannons, ammo bins, antenna rack, R4 mortar, R5 targeting ring ----------------
function barrel(b, o, bone) {
  const far = b.far, gold = o.r >= 3;
  b.add(b.cbox(0.13, 0.13, 0.24, 0.025), bone, 'metal', [0, 0, 0.02]);
  b.add(b.cyl(0.085, 0.085, 0.32, 14), bone, 'accent', [0, 0, 0.27], [PI / 2, 0, 0]);
  b.add(b.cyl(0.056, 0.06, 0.72, 14), bone, 'metal', [0, 0, 0.62], [PI / 2, 0, 0]);
  // heat jacket ribs
  if (!far) for (let i = 0; i < 5; i++) b.add(b.cyl(0.074, 0.074, 0.026, 12), bone, i === 2 ? 'trim' : 'accent', [0, 0, 0.47 + i * 0.07], [PI / 2, 0, 0]);
  if (o.rank >= 3) b.add(b.cyl(0.05, 0.05, 0.16, 12), bone, 'glow', [0, 0, 0.84], [PI / 2, 0, 0]);
  // muzzle brake with side ports + glowing bore
  b.add(b.cbox(0.16, 0.11, 0.17, 0.025), bone, gold ? 'trim' : 'metal', [0, 0, BL - 0.08]);
  if (!far) for (const z of [BL - 0.12, BL - 0.06]) b.add(b.box(0.17, 0.035, 0.024), bone, 'accent', [0, 0, z]);
  b.add(b.cbox(0.05, 0.012, 0.3, 0.004), bone, 'glow', [0, 0.064, 0.6]);
  b.add(b.cyl(0.038, 0.038, 0.02, 12), bone, 'glow', [0, 0, BL + 0.0], [PI / 2, 0, 0]);
}
function turret(b, o) {
  const far = b.far, rk = o.rank, r = o.r, T = 'aux0';
  b.add(b.cyl(0.28, 0.3, 0.07, 20), T, 'metal', [0, 0.0, 0]);
  if (!far) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.add(b.box(0.04, 0.05, 0.02), T, 'accent', [Math.sin(a) * 0.3, 0.0, Math.cos(a) * 0.3], [0, a, 0]); }
  // armoured housing: sloped front, rust cheeks, top hatch + periscope
  P(b, T, 'accent', [0.54, 0.22, 0.56], [0, 0.14, -0.03], [0, 0, 0], { c: 0.05, tx: 0.84, tz: 0.78, sz: -0.02 });
  P(b, T, 'accent', [0.48, 0.05, 0.22], [0, 0.205, 0.2], [0.55, 0, 0], { c: 0.015, tx: 0.85 });
  PS(b, T, 'paint', [0.03, 0.15, 0.42], [0.272, 0.13, -0.04], [0, 0, -0.14], { c: 0.01, tz: 0.85 });
  stencil(b, T, 'trim', '66', [0.29, 0.13, -0.08], [0, PI / 2, -0.14], 0.075);
  vent(b, T, [0.04, 0.262, -0.16], [-PI / 2, 0, 0], 0.26, 0.14, 4, false, true);
  b.add(b.cyl(0.085, 0.09, 0.05, 14), T, 'metal', [-0.17, 0.27, 0.02]);
  b.add(b.cbox(0.07, 0.06, 0.06, 0.01), T, 'metal', [0.1, 0.27, 0.0]);
  b.add(b.cbox(0.05, 0.022, 0.012, 0.004), T, 'eye', [0.1, 0.275, 0.032]);
  // mantlet the barrels exit through
  b.add(b.cbox(0.48, 0.17, 0.1, 0.025), T, 'metal', [0, 0.13, 0.24]);
  b.add(b.cbox(0.4, 0.04, 0.03, 0.008), T, 'glow', [0, 0.04, 0.27]);
  for (const bone of ['aux2', 'aux3']) barrel(b, o, bone);
  // ammo bins (epic+) with hazard bands and feed chutes into the breech
  if (r >= 2 && rk >= 2) {
    PS(b, T, 'accent', [0.12, 0.17, 0.3], [0.34, 0.11, -0.06], [0, 0, 0], { c: 0.02 });
    hazard(b, T, [0.402, 0.11, -0.06], [0, PI / 2, 0], 0.26, 0.05, 7, true);
    if (!far) b.sym(b.tube([[0.33, 0.2, 0.0], [0.28, 0.26, 0.08], [0.18, 0.2, 0.14]], 0.025, 8, 5), T, 'metal');
  }
  // rear bustle (magazine) + antenna rack (the ref's frame behind the gun)
  P(b, T, 'accent', [0.46, 0.17, 0.2], [0, 0.13, -0.35], [0, 0, 0], { c: 0.025 });
  hazard(b, T, [0, 0.13, -0.452], [0, PI, 0], 0.4, 0.06, 9);
  for (const sx of [1, -1]) {
    b.add(strut(b, [sx * 0.17, 0.2, -0.4], [sx * 0.18, 0.44, -0.44], 0.02), T, 'metal');
    b.add(b.cyl(0.03, 0.03, 0.03, 10), T, 'glow', [sx * 0.18, 0.46, -0.44]);
  }
  b.add(strut(b, [0.19, 0.38, -0.435], [-0.19, 0.38, -0.435], 0.016), T, 'metal');
  b.add(b.cbox(0.14, 0.09, 0.025, 0.006), T, 'paint', [0.06, 0.3, -0.43], [0.06, 0, 0]);
  if (!far) {
    b.add(b.cyl(0.005, 0.009, 0.5, 5), T, 'metal', [-0.18, 0.7, -0.47], [-0.12, 0, 0]);
    if (rk >= 4) b.add(b.cyl(0.005, 0.008, 0.62, 5), T, 'metal', [0.18, 0.76, -0.48], [-0.18, 0, 0.08]);
    if (rk >= 4) b.add(b.sph(6, 4), T, 'glow', [0.205, 1.06, -0.53], [0, 0, 0], 0.016);
  }
  // R4: third cannon (rear mortar) on the bustle, pointing up-forward
  if (rk >= 4) {
    b.add(b.cbox(0.2, 0.08, 0.18, 0.02), T, 'metal', [0, 0.25, -0.28]);
    b.add(b.cyl(0.08, 0.075, 0.34, 14), T, 'accent', [0, 0.38, -0.24], [-0.45, 0, 0]);
    b.add(b.cyl(0.09, 0.09, 0.05, 14), T, 'trim', [0, 0.52, -0.17], [-0.45, 0, 0]);
    b.add(b.cyl(0.055, 0.055, 0.02, 12), T, 'glow', [0, 0.55, -0.155], [-0.45, 0, 0]);
  }
  // R5: holo targeting ring crown above the turret
  if (rk >= 5) {
    b.add(b.tor(0.36, 0.01, 40, 4), T, 'glow', [0, 0.78, 0.05], [PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.add(b.box(0.1, 0.012, 0.02), T, 'glow', [Math.sin(a) * 0.36, 0.78, 0.05 + Math.cos(a) * 0.36], [0, a + PI / 2, 0]); }
  }
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], G, () => {
    b.scope([0, 0, 0], [0, 0, 0], [HS, HS * 0.95, HS], () => hull(b, o));
    b.scope([0, 0, 0], [0, 0, 0], HDS, () => head(b, o));
    b.scope([0, 0, 0], [0, 0, 0], TS, () => turret(b, o));
    leg(b, o, 'upArm', 'foreArm', 'hand', true);
    leg(b, o, 'thigh', 'shin', 'foot', false);
    if (!b.far && o.faction === 'rogue') b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.15]], 0.035, 0.008), 'pelvis', 'trim', [0.4, 0.24, -0.36], [0.3, 0, -0.5]);
    if (!b.far && o.faction === 'experimental') b.sym(b.sph(5, 3), 'pelvis', 'glow', [0.36, 0.3, -0.36], [0, 0, -0.3], [0.03, 0.09, 0.03]);
  });
}

// ---------------- anims ----------------
const L0 = LIB;
// anim feet + body offsets are in design units; plantAll / body scale them by G
const homeFeet = (k = 1, kz = k) => LEGS.map((l, i) => [HOME[i][0] * l.s * k, ANK0, HOME[i][1] * kz]);
function plantAll(Pp, ctx, F) { LEGS.forEach((l, i) => L0.quadIK(Pp, ctx, l, F[i][0] * G, F[i][1] * G, F[i][2] * G)); }
// lift foot i toward [x,z] over window [a,b] of u (arc height h); returns the foot position
function stepFoot(F, i, u, a, bnd, to, h = 0.18) {
  const k = L0.smooth((u - a) / (bnd - a));
  const f = F[i];
  f[0] += (to[0] - f[0]) * k; f[2] += (to[1] - f[2]) * k;
  if (u > a && u < bnd) f[1] += h * Math.sin(PI * (u - a) / (bnd - a));
}
function body(Pp, x, y, z, pitch = 0, yaw = 0, roll = 0) {
  Pp[L0.PX] += x * G; Pp[L0.PX + 1] += y * G; Pp[L0.PX + 2] += z * G;
  L0.A(Pp, 'pelvis', pitch, yaw, roll);
}
// spider head twitches: snap to a new look every ~1.1 s
function headTwitch(Pp, t, k = 1) {
  const n = Math.floor(t / 1.1), f = t / 1.1 - n;
  const h = (i) => { const x = Math.sin(i * 127.1 + 3.7) * 43758.5; return x - Math.floor(x) - 0.5; };
  const e = L0.smooth(f / 0.08);
  const yw = (h(n - 1) + (h(n) - h(n - 1)) * e) * 0.7 * k, pt = (h(n + 50 - 1) + (h(n + 50) - h(n + 50 - 1)) * e) * 0.25 * k;
  L0.A(Pp, 'neck', 0, yw, 0); L0.A(Pp, 'head', pt, 0, yw * 0.2);
}
function base(Pp, t) {
  const br = Math.sin(t * 1.6);
  body(Pp, Math.sin(t * 0.5) * 0.012, br * 0.012 - 0.01, 0, Math.sin(t * 0.7) * 0.012, Math.sin(t * 0.4) * 0.025, Math.sin(t * 0.6) * 0.015);
  L0.R(Pp, 'aux0', -0.02 + Math.sin(t * 0.5) * 0.02, Math.sin(t * 0.35) * 0.22 - Pp[1], 0);
}
// recoil kick shape (seconds since shot)
const kick = (s) => (s < 0 ? 0 : s < 0.035 ? s / 0.035 : Math.exp(-(s - 0.035) * 9));

// fire timings (u) shared by events, body kicks and barrel recoil; [u, barrel] with barrel 0 = right (muzzle), 1 = left (muzzleL)
const OD_DUR = 2.4, OD_REL = 0.4 / OD_DUR;
const OD_SALVO = [0, 0.09, 0.18, 0.5, 0.59, 0.68];
const SHOTS = {
  attack: [[0.32, 0], [0.47, 1]],
  attack_alt: [[0.3, 0], [0.305, 1]],
  overdrive: OD_SALVO.map((s, i) => [OD_REL + s / OD_DUR, i % 2]),
};
const DURS = { attack: 0.95, attack_alt: 1.1, cast: 1.3, overdrive: OD_DUR, hit: 0.42, die: 2.1, deploy: 1.5 };
function kicks(name, u) {
  const L = SHOTS[name]; if (!L) return 0;
  let k = 0; for (const [s] of L) k = Math.max(k, kick((u - s) * DURS[name]));
  return k;
}

const anims = {
  idle(Pp, t, ctx, L) {
    base(Pp, t);
    headTwitch(Pp, t);
    const F = homeFeet();
    // every ~5 s the front-left foot lifts and taps twice; later a rear foot shuffles
    const c = t % 5.4;
    if (c > 3.4 && c < 4.3) F[0][1] += 0.11 * Math.abs(Math.sin((c - 3.4) / 0.9 * PI * 2)), F[0][2] += 0.04 * Math.sin((c - 3.4) / 0.9 * PI);
    if (c > 1.2 && c < 1.6) F[3][1] += 0.08 * Math.sin((c - 1.2) / 0.4 * PI);
    plantAll(Pp, ctx, F);
  },
  advance(Pp, t, ctx, L) {
    const m = ctx.move, duty = 0.75, ph = m.phase;
    const d = Math.max(m.v, 0.6) * duty / 1.0;
    body(Pp, 0, -0.025 + 0.018 * Math.sin(TAU * 4 * ph), 0, 0.04, 0.04 * Math.sin(TAU * ph), 0.03 * Math.sin(TAU * ph + 0.6));
    L.R(Pp, 'aux0', -0.02, -Pp[1] - 0.03 * Math.sin(TAU * ph), 0);
    L.A(Pp, 'neck', 0, -Pp[1] * 0.5, 0); L.A(Pp, 'head', 0.06 + 0.03 * Math.sin(TAU * 4 * ph), 0, 0);
    const F = homeFeet();
    LEGS.forEach((l, i) => {
      const p = (ph + l.ph) % 1;
      if (p < duty) F[i][2] += d / 2 - d * (p / duty);
      else { const s = (p - duty) / (1 - duty); F[i][2] += -d / 2 + d * L.smooth(s); F[i][1] += 0.2 * Math.sin(PI * s); }
    });
    plantAll(Pp, ctx, F);
  },
  attack(Pp, u, ctx, L) {
    base(Pp, ctx.t);
    const aim = L.kf(u, [[0, 0], [0.18, 1], [0.78, 1], [1, 0]]), k = kicks('attack', u);
    const kl = kick((u - 0.32) * DURS.attack), kr = kick((u - 0.47) * DURS.attack);
    body(Pp, 0.02 * (kl - kr), -0.04 * aim - 0.03 * k, -0.07 * k, -0.02 * aim - 0.07 * k, 0, 0.05 * (kr - kl));
    L.R(Pp, 'aux0', -0.08 * aim - 0.05 * k, -Pp[1] * aim, 0);
    L.A(Pp, 'head', 0.1 * aim + 0.08 * k, 0, 0);
    plantAll(Pp, ctx, homeFeet());
  },
  attack_alt(Pp, u, ctx, L) {
    // siege slug: hunker down nose-first, both barrels at once, big rock back, settle
    base(Pp, ctx.t);
    const load = L.kf(u, [[0, 0], [0.24, 1], [0.3, 1], [0.36, 0.2], [1, 0]]), k = kicks('attack_alt', u);
    const rock = L.kf(u, [[0, 0], [0.3, 0], [0.34, 1], [0.5, 0.6], [0.7, -0.15], [0.85, 0.05], [1, 0]]);
    body(Pp, 0, -0.12 * load - 0.05 * k, -0.16 * rock, 0.08 * load - 0.16 * rock, 0, 0);
    L.R(Pp, 'aux0', -0.12 * load - 0.1 * k, -Pp[1], 0);
    L.A(Pp, 'head', 0.2 * load + 0.15 * k, 0, 0);
    plantAll(Pp, ctx, homeFeet());
  },
  cast(Pp, u, ctx, L) {
    // DUG IN: four stomps outward, belly lowers, turret hunkers; re-step home at the end
    base(Pp, ctx.t);
    const low = L.kf(u, [[0, 0], [0.55, 1], [0.82, 1], [1, 0]]);
    const F = homeFeet(), W = homeFeet(1.14, 1.08);
    const order = [0, 3, 1, 2];
    order.forEach((i, j) => {
      stepFoot(F, i, u, 0.05 + j * 0.12, 0.15 + j * 0.12, [W[i][0], W[i][2]], 0.2);
      if (u > 0.8) { F[i][0] = W[i][0]; F[i][2] = W[i][2]; F[i][1] = ANK0; stepFoot(F, i, u, 0.8 + (j % 2) * 0.09, 0.89 + (j % 2) * 0.09, [homeFeet()[i][0], homeFeet()[i][2]], 0.12); }
    });
    let st = 0; for (let j = 0; j < 4; j++) st = Math.max(st, kick((u - 0.15 - j * 0.12) * DURS.cast) * 0.7);
    body(Pp, 0, -0.17 * low - 0.03 * st, 0, 0.02 * st, 0, 0);
    L.R(Pp, 'aux0', 0.06 * low + 0.05 * st, -Pp[1], 0);
    L.A(Pp, 'head', 0.15 * low, 0, 0);
    plantAll(Pp, ctx, F);
  },
  overdrive(Pp, u, ctx, L) {
    // BOMBARD: legs splay and anchor, belly drops, nose up, cannons tilt to the sky, two 3-shell volleys, recover
    base(Pp, ctx.t);
    const anchor = L.kf(u, [[0, 0], [0.13, 1], [0.74, 1], [0.92, 0]]);
    const tilt = L.kf(u, [[0, 0], [0.04, 0], [0.155, 1], [0.72, 1], [0.86, 0]]);
    const k = kicks('overdrive', u);
    const F = homeFeet(), W = homeFeet(1.24, 1.16), H0 = homeFeet();
    [0, 3, 1, 2].forEach((i, j) => {
      const a = 0.005 + (j >> 1) * 0.06;
      stepFoot(F, i, u, a, a + 0.06, [W[i][0], W[i][2]], 0.28);
      if (u > 0.74) { F[i][0] = W[i][0]; F[i][2] = W[i][2]; F[i][1] = ANK0; const b0 = 0.75 + (j >> 1) * 0.08; stepFoot(F, i, u, b0, b0 + 0.08, [H0[i][0], H0[i][2]], 0.16); }
    });
    const sweep = 0.14 * Math.sin((u - OD_REL) * 9) * tilt;
    body(Pp, 0, -0.2 * anchor - 0.06 * k, -0.06 * k, -0.15 * anchor + 0.05 * k, 0, 0.02 * Math.sin(u * 40) * k);
    L.R(Pp, 'aux0', -0.95 * tilt - 0.08 * k, -Pp[1] + sweep, 0);
    L.A(Pp, 'head', 0.3 * anchor, 0, 0); L.A(Pp, 'neck', 0, 0.2 * Math.sin(u * 7) * anchor, 0);
    plantAll(Pp, ctx, F);
  },
  hit(Pp, u, ctx, L) {
    base(Pp, ctx.t);
    const k = L.kf(u, [[0, 0], [0.1, 1], [0.4, 0.35], [1, 0]]), d = ctx.st.hitDir;
    body(Pp, 0.09 * k * d, -0.05 * k, -0.06 * k, -0.06 * k, 0.05 * k * d, 0.13 * k * d);
    L.A(Pp, 'aux0', -0.06 * k, 0.15 * k * d, 0);
    L.A(Pp, 'head', -0.25 * k, 0, 0.2 * k * d); L.A(Pp, 'neck', 0, -0.3 * k * d, 0);
    plantAll(Pp, ctx, homeFeet());
  },
  die(Pp, u, ctx, L) {
    // stagger, near legs buckle, belly slams down (down 0.42), legs splay then curl up and in like a dead spider; turret droops
    const sway = Math.sin(u * 30) * L.kf(u, [[0, 0], [0.06, 1], [0.25, 0]]);
    const drop = L.kf(u, [[0, 0], [0.18, 0.15], [0.42, 1], [0.47, 0.93], [0.52, 1], [1, 1]]);
    const splay = L.kf(u, [[0, 0], [0.42, 1], [0.6, 1.05], [1, 1]]);
    const curl = L.kf(u, [[0, 0], [0.5, 0], [0.88, 1], [1, 1]]);
    body(Pp, 0.06 * sway, -(HOV0 - 0.19) * drop, 0, 0.08 * drop, 0.15 * drop, 0.08 * sway + 0.07 * drop);
    L.R(Pp, 'aux0', 0.22 * L.kf(u, [[0, 0], [0.45, 0.6], [0.6, 1], [1, 1]]), 0.45 * L.kf(u, [[0.3, 0], [0.7, 1]]), 0);
    L.R(Pp, 'neck', 0, 0.3 * drop, 0); L.R(Pp, 'head', 0.4 * drop, 0, 0.2 * drop);
    const F = homeFeet(1 + 0.22 * splay, 1 + 0.1 * splay);
    LEGS.forEach((l, i) => {
      const tw = u > 0.55 ? Math.sin(u * 60 + i * 2.3) * (1 - u) * 0.12 : 0;
      F[i][0] = L.lerp(F[i][0], l.s * 0.62, curl); F[i][2] = L.lerp(F[i][2], F[i][2] * 0.55, curl);
      F[i][1] += (0.42 + tw) * curl;
    });
    plantAll(Pp, ctx, F);
  },
  victory(Pp, t, ctx, L) {
    // threat display: rear up on the back legs, front legs raised and pawing, barrels high and sweeping
    const k = L.smooth(Math.min(1, t / 0.6)), w = Math.sin(t * 5);
    body(Pp, 0, 0.1 * k + 0.015 * Math.sin(t * 2.5), -0.1 * k, -0.34 * k, 0.05 * Math.sin(t * 1.3), 0);
    L.R(Pp, 'aux0', -0.45 * k, 0.45 * Math.sin(t * 1.4) * k - Pp[1], 0);
    L.A(Pp, 'head', -0.25 * k, 0, 0); headTwitch(Pp, t, 0.5);
    const F = homeFeet();
    for (const i of [0, 1]) {
      const ph = i ? PI : 0, l = LEGS[i];
      F[i][0] = L.lerp(F[i][0], l.s * 0.78, k);
      F[i][1] = L.lerp(F[i][1], 0.95 + 0.12 * Math.sin(t * 5 + ph), k);
      F[i][2] = L.lerp(F[i][2], 1.05 + 0.08 * Math.cos(t * 5 + ph), k);
    }
    F[2][2] -= 0.08 * k; F[3][2] -= 0.08 * k;
    plantAll(Pp, ctx, F);
    void w;
  },
  deploy(Pp, u, ctx, L) {
    // falls legs-tucked, slams down (land 0.4) and absorbs, turret swings up and scans, eyes snap on
    base(Pp, ctx.t);
    const tuck = L.kf(u, [[0, 1], [0.37, 1], [0.41, 0], [1, 0]]);
    const comp = L.kf(u, [[0, 0], [0.4, 0], [0.45, 1], [0.62, 0.65], [0.82, 0], [1, 0]]);
    body(Pp, 0, -0.26 * comp, 0, 0.1 * comp, 0, 0);
    L.R(Pp, 'aux0', L.kf(u, [[0, 0.35], [0.6, 0.3], [0.75, -0.12], [0.85, 0]]), 0.5 * L.kf(u, [[0.78, 0], [0.88, 1], [0.96, -0.6], [1, -0.4]]) - Pp[1], 0);
    L.A(Pp, 'head', L.kf(u, [[0, 0.45], [0.7, 0.4], [0.78, -0.2], [0.9, 0]]), 0, 0);
    const F = homeFeet();
    LEGS.forEach((l, i) => { F[i][0] = L.lerp(F[i][0], l.s * 0.5, tuck); F[i][1] += 0.4 * tuck; F[i][2] *= 1 - 0.45 * tuck; });
    plantAll(Pp, ctx, F);
  },
};

export default {
  id: 'tarantula', name: 'TARANTULA', role: 'archer', faction: 'rogue', rarity: 'epic', realm: 'scifi',
  rig: 'quad', dims: DIMS, height: 1.3 * G, radius: 0.85 * G, walkSpeed: 0.75, cadence: 1.0, scheme: 'bold',
  style: { weapon: 'cannon' },
  // black gunmetal armour, rust-red plates, orange hazard trim; other factions keep their bold palette
  paint: { rogue: { paint: 0xa8301c, accent: 0x24262c, trim: 0xff7a1a } },
  mats: {
    all: {
      paint: { rough: 0.45, coat: 0.3 },
      accent: { color: 0x2c2f36, rough: 0.46, metal: 0.55, coat: 0.15 },
      metal: { color: 0x737a85, rough: 0.38 },
      eye: { ei: 3.4 },
    },
  },
  sockets: {
    muzzle: ['aux3', [0, 0, (BL + 0.04) * TS * G]], muzzleL: ['aux2', [0, 0, (BL + 0.04) * TS * G]],
    core: [0, 0.2 * G, 0.05 * G], head: [0, 0.12 * G, 0.15 * G], hand: ['aux0', [0, 0.6 * G, -0.3 * G]],
  },
  events: {
    attack: SHOTS.attack.map(([u]) => ['fire', u]),
    attack_alt: SHOTS.attack_alt.map(([u]) => ['fire', u]),
    cast: [['cast', 0.55]],
    overdrive: [['cast', 0.04], ...SHOTS.overdrive.map(([u]) => ['fire', u])],
    die: [['down', 0.42]],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) {
    ctx.su = act ? Math.min(1, act.t / act.dur) : 0;
    // keep every foot level with the floor
    for (const l of LEGS) {
      const iu = BI[l.up] * 3, il = BI[l.lo] * 3, f = BI[l.ft] * 3;
      Pp[f] = 0; Pp[f + 1] = 0; Pp[f + 2] = -(Pp[iu + 2] + Pp[il + 2]) - Pp[2] * Math.cos(Pp[iu + 1]);
    }
  },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, off = ctx.rig.off, list = st.action && SHOTS[st.action];
    const rec = [0, 0];
    if (list) for (const [s, i] of list) rec[i] = Math.max(rec[i], kick((ctx.su - s) * DURS[st.action]));
    bones[BI.aux3].position.z = off.aux3[2] - 0.17 * G * rec[0];
    bones[BI.aux2].position.z = off.aux2[2] - 0.17 * G * rec[1];
  },
  fxHints: { projectile: 'shell', muzzleColor: 0xff7a1a, impact: 'shell_burst', overdrive: 'bombard', color: 0xff6a1a },
  build,
};
