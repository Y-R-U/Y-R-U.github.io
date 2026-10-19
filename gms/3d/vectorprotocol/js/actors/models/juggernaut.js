// JUGGERNAUT, rogue demolition rig (epic tank). Brief: docs/ROSTER.md `juggernaut`. Also map 1's boss BIG RUSTY (legendary x1.35).
// XL tracked bulldozer: wide rusted tread hull, a curved hazard-striped front plough on lift rams, an engine house with a raised
// cab-head (caged windshield, red lamp bar) on a hydraulic lift, twin exhaust stacks, and the signature: a giant spinning
// circular saw on a short hydraulic boom carried over the plough.
// VALUE: `accent` = black/gunmetal armour base, `paint` = hazard orange plates (skirts, plough, boom, cab, engine panels),
// `metal` = steel frame, treads' grousers, saw disc, pistons, `trim` = amber markers + bolts, `glow` = orange heat, `eye` = red lamps.
// Rank tiers (ROSTER R2 base): R0 battered (left skirt torn off, bent stack, bare plough) · R1 plain plough, no cage
//   · R2 hazard bands, roll cage, cab armour · R3 plough spikes + ripper teeth + chains · R4 saw glows orange-hot + ram horns
//   + taller flame-cut stacks · R5 flame vents along the hull + spinning beacon crown on the cab.
// Rarity: legendary (r 3) = BIG RUSTY boss look: wrecking-ball crane between the stacks, skull plates, armoured cab, beacon.
// Bones (tracked rig, leg bones carry no geometry so they are re-used): aux0/aux1 = front/rear sprocket axles (roll in tick),
// aux2 = saw disc (on handR, spins), aux3 = plough pivot (lifts), thighL/R = stack flames (chest), shinL/R = hull flame vents
// (R5, pelvis), footR = beacon (head), clavL..handL = crane jib + wrecking-ball pendulum (boss), right arm = saw boom.
import { P, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const HOV = 0.42;                 // pelvis (hull centre) height
const AX = -0.21, R0 = 0.2, ZF = 0.42, TX = 0.4, TW = 0.26;   // treads: axle y (pelvis local), radius, half run, x, width
const SAW_R = 0.34, BOOM_U = 0.34, BOOM_F = 0.3;
const G = 1.03;                   // whole unit authored in design units, scaled up to XL (dims, parts, sockets, pose offsets)
const D0 = {
  hover: HOV, thigh: 0.2, shin: 0.2, ankle: 0.02, hipX: 0.2, hipY: 0,
  spine: 0.26, chest: 0.14, neck: 0.3, headOff: 0.06, clavX: 0.12, clavY: 0.08, shoulder: 0.04, upArm: BOOM_U, foreArm: BOOM_F,
  offsets: {
    spine: [0, 0.26, -0.12], chest: [0, 0.14, 0], neck: [0, 0.36, 0.08], head: [0, 0.06, 0],
    clavR: [-0.12, 0.08, 0.3], upArmR: [-0.04, 0, 0], foreArmR: [0, -BOOM_U, 0], handR: [0, -BOOM_F, 0],
    clavL: [0, 0.2, -0.3], upArmL: [0, 0, 0], foreArmL: [0, 1.03, -0.48], handL: [0, -0.72, 0],
    thighL: [0.28, 1.2, -0.5], thighR: [-0.28, 1.2, -0.5],
    shinL: [0.56, 0.0, -0.05], shinR: [-0.56, 0.0, -0.05],
    footL: [0, 0, 0], footR: [0.13, 0.43, -0.1],
    aux0: [0, AX, ZF], aux1: [0, AX, -ZF], aux2: [0, -0.02, 0], aux3: [0, -0.2, 0],
  },
  parents: { thighL: 'chest', thighR: 'chest', shinL: 'pelvis', shinR: 'pelvis', footL: 'chest', footR: 'head', aux0: 'pelvis', aux1: 'pelvis', aux2: 'handR', aux3: 'pelvis' },
};
const sc3 = (p) => p.map((x) => x * G);
const DIMS = Object.fromEntries(Object.entries(D0).map(([k, v]) => [k, typeof v === 'number' ? v * G : k === 'offsets' ? Object.fromEntries(Object.entries(v).map(([n, p]) => [n, sc3(p)])) : v]));
const WD = (b, bone) => b.rig.world[bone].map((x) => x / G);   // a bone's rest joint in design units

// ---------------- helpers ----------------
// world rest point -> position relative to a bone's joint (lets us author pistons that cross bones)
const rel = (b, bone, p) => { const w = WD(b, bone); return [p[0] - w[0], p[1] - w[1], p[2] - w[2]]; };
function strut(b, p, q, r, seg = 8) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, L, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
// hydraulic ram between two bones, given in world rest space: barrel on boneA, rod on boneB
function ram(b, boneA, pa, boneB, pb, r = 0.035) {
  const m = [pa[0] + (pb[0] - pa[0]) * 0.6, pa[1] + (pb[1] - pa[1]) * 0.6, pa[2] + (pb[2] - pa[2]) * 0.6];
  const n = [pb[0] + (pa[0] - pb[0]) * 0.75, pb[1] + (pa[1] - pb[1]) * 0.75, pb[2] + (pa[2] - pb[2]) * 0.75];
  b.add(strut(b, rel(b, boneA, pa), rel(b, boneA, m), r, 10), boneA, 'accent');
  b.add(b.cyl(r * 1.25, r * 1.25, 0.03, 10), boneA, 'paint', rel(b, boneA, m), [Math.atan2(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]), pb[1] - pa[1]), 0, 0]);
  b.add(strut(b, rel(b, boneB, pb), rel(b, boneB, n), r * 0.55, 8), boneB, 'metal');
  b.add(b.sph(8, 6), boneA, 'metal', rel(b, boneA, pa), [0, 0, 0], r * 1.15);
  b.add(b.sph(8, 6), boneB, 'metal', rel(b, boneB, pb), [0, 0, 0], r * 0.95);
}
function lamp(b, bone, pos, rot, r = 0.03, slot = 'eye', mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.02, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.03, 12), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false, slat = 'metal') {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.025, 0.006), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.3), 0.035, 0.003), bone, slat, [0, -h / 2 + (i + 0.5) * h / n, 0.01]); });
}
function rivets(b, bone, pts, rot = [PI / 2, 0, 0], r = 0.011) { if (!b.far) for (const p of pts) b.add(b.cyl(r, r, 0.014, 6), bone, 'metal', p, rot); }
// diagonal hazard stripes over a flat band (in the scope's x-y plane, facing +z); black bars on the orange band
function hazard(b, bone, w, h, n, slot = 'accent') {
  const step = w / n, t = step * 0.42;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * step + step * 0.25;
    const pts = [[x0, -h / 2], [x0 + t, -h / 2], [Math.min(w / 2, x0 + t + h * 0.6), h / 2], [Math.min(w / 2, x0 + h * 0.6), h / 2]];
    if (pts[3][0] >= w / 2 - 0.004) continue;
    b.add(fin(b, pts, 0.008, 0.001), bone, slot, [0, 0, 0.004]);
  }
}
function skull(b, bone, pos, rot, k = 1, slot = 'trim') {
  b.scope(pos, rot, k, () => {
    b.add(b.cbox(0.1, 0.085, 0.012, 0.025), bone, slot, [0, 0.025, 0]);
    b.add(b.box(0.064, 0.03, 0.012), bone, slot, [0, -0.03, 0]);
    for (const x of [-0.024, 0.024]) b.add(b.cbox(0.026, 0.026, 0.01, 0.006), bone, 'accent', [x, 0.03, 0.006]);
    for (const a of [0.75, -0.75]) b.add(b.box(0.17, 0.018, 0.01), bone, slot, [0, -0.055, -0.003], [0, 0, a]);
  });
}

// ---------------- treads + hull (pelvis) ----------------
function treads(b, o) {
  const far = b.far, n = far ? 22 : 36, L = 4 * ZF + TAU * R0;
  for (const sx of [1, -1]) {
    if (o.rank === 0 && sx === 1) { /* battered: exposed wheels still have links */ }
    const x = sx * TX;
    for (let i = 0; i < n; i++) {
      let d = (i / n) * L, y, z, a;
      if (d < 2 * ZF) { z = ZF - d; y = R0; a = 0; }
      else if ((d -= 2 * ZF) < PI * R0) { const t = d / R0; z = -ZF - Math.sin(t) * R0; y = Math.cos(t) * R0; a = -t; }
      else if ((d -= PI * R0) < 2 * ZF) { z = -ZF + d; y = -R0; a = -PI; }
      else { d -= 2 * ZF; const t = d / R0; z = ZF + Math.sin(t) * R0; y = -Math.cos(t) * R0; a = -PI - t; }
      b.add(b.cbox(TW, 0.034, 0.082, 0.01), 'pelvis', 'accent', [x, y + AX, z], [a, 0, 0]);
      if (!far) b.add(b.box(TW * 1.04, 0.022, 0.024), 'pelvis', 'metal', [x, y + AX + Math.cos(a) * 0.024, z + Math.sin(a) * 0.024], [a, 0, 0]);
    }
    // road wheels + return rollers + inner frame
    for (const z of [-0.24, -0.08, 0.08, 0.24]) {
      b.add(discX(b, 0.105, TW * 0.7, 14), 'pelvis', 'metal', [x, AX - 0.08, z]);
      b.add(discX(b, 0.05, TW * 0.78, 10), 'pelvis', 'accent', [x, AX - 0.08, z]);
      if (!far) b.add(discX(b, 0.022, TW * 0.84, 8), 'pelvis', 'trim', [x, AX - 0.08, z]);
    }
    if (!far) for (const z of [-0.2, 0.2]) b.add(discX(b, 0.04, TW * 0.5, 10), 'pelvis', 'metal', [x, AX + 0.15, z]);
    b.add(b.cbox(0.06, 0.08, 0.86, 0.015), 'pelvis', 'metal', [x - sx * 0.02, AX + 0.02, 0]);
  }
  // sprockets / idlers (aux0 front, aux1 rear) spin in tick; both sides share an axle
  for (const bone of ['aux0', 'aux1']) for (const sx of [1, -1]) {
    const x = sx * TX;
    b.add(discX(b, R0 - 0.025, TW * 0.82, 18), bone, 'metal', [x, 0, 0]);
    b.add(discX(b, 0.085, TW * 0.9, 14), bone, 'accent', [x, 0, 0]);
    b.add(discX(b, 0.035, TW * 0.98, 10), bone, 'glow', [x, 0, 0]);
    if (!b.far) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(b.box(TW * 0.86, 0.03, 0.06), bone, 'accent', [x, Math.cos(a) * 0.12, Math.sin(a) * 0.12], [a, 0, 0]); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.add(b.box(TW * 0.6, 0.035, 0.035), bone, 'metal', [x, Math.cos(a) * (R0 - 0.015), Math.sin(a) * (R0 - 0.015)], [a, 0, 0]); }
  }
}
function hull(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3;
  // body between the treads: dark armoured tub, sloped glacis, engine deck
  P(b, 'pelvis', 'accent', [0.56, 0.4, 1.12], [0, -0.07, -0.02], [0, 0, 0], { c: 0.05, tx: 0.95, tz: 0.92 });
  P(b, 'pelvis', 'paint', [0.54, 0.05, 0.3], [0, 0.07, 0.47], [0.62, 0, 0], { c: 0.015, tx: 0.88 });
  P(b, 'pelvis', 'accent', [0.6, 0.06, 0.62], [0, 0.135, -0.2], [0, 0, 0], { c: 0.02 });
  for (const sx of [1, -1]) lamp(b, 'pelvis', [sx * 0.17, 0.05, 0.585], [PI / 2 - 0.62, 0, 0], 0.045, 'glow');
  if (!far) for (const sx of [1, -1]) b.add(b.tor(0.035, 0.012, 10, 4), 'pelvis', 'metal', [sx * 0.08, -0.12, 0.6], [0, PI / 2, 0]);
  // fenders over the treads + side skirts (R0: left skirt torn off, a bent bracket left behind)
  for (const sx of [1, -1]) {
    b.add(plate(b, 0.3, 0.04, 1.22, { c: 0.012, tz: 0.96 }), 'pelvis', 'accent', [sx * TX, 0.03, 0]);
    b.add(b.cbox(0.3, 0.025, 0.1, 0.006), 'pelvis', 'metal', [sx * TX, 0.03, 0.62], [0.35, 0, 0]);
    if (rk === 0 && sx === 1) {
      b.add(b.cbox(0.02, 0.2, 0.04, 0.005), 'pelvis', 'metal', [0.55, -0.07, 0.3], [0, 0, 0.25]);
      b.add(plate(b, 0.024, 0.13, 0.3, { c: 0.008 }), 'pelvis', 'paint', [0.56, -0.03, -0.38], [0.2, 0, 0.12]);
      continue;
    }
    b.add(plate(b, 0.03, 0.22, 1.06, { c: 0.01, tz: 0.95, bz: 0.9 }), 'pelvis', 'paint', [sx * 0.555, -0.08, 0], [0, 0, sx * 0.06]);
    b.add(b.cbox(0.034, 0.03, 1.0, 0.008), 'pelvis', 'accent', [sx * 0.548, -0.185, 0], [0, 0, sx * 0.06]);
    if (rk >= 2) b.scope([sx * 0.574, -0.08, 0.36], [0, sx * PI / 2, -sx * 0.06], 1, () => hazard(b, 'pelvis', 0.3, 0.2, 5));
    rivets(b, 'pelvis', [-0.42, -0.21, 0, 0.21].map((z) => [sx * 0.574, 0.0, z]), [0, 0, PI / 2]);
    if (o.r >= 2 && !far) P(b, 'pelvis', 'accent', [0.03, 0.12, 0.42], [sx * 0.58, -0.07, -0.25], [0, 0, sx * 0.08], { c: 0.01 });
    // R5: flame vents along the hull (glowing slots; the jets live on shinL/R)
    if (rk >= 5) for (const z of [-0.3, -0.1, 0.1]) {
      b.add(b.cbox(0.04, 0.05, 0.12, 0.01), 'pelvis', 'metal', [sx * 0.585, -0.04, z]);
      b.add(b.box(0.02, 0.025, 0.09), 'pelvis', 'glow', [sx * 0.606, -0.04, z]);
    }
  }
  // rear: engine grille, bumper with hazard band, tail lamps, tow hook
  vent(b, 'pelvis', [0, 0.0, -0.585], [0, PI, 0], 0.38, 0.18, 5);
  P(b, 'pelvis', 'paint', [0.66, 0.08, 0.08], [0, -0.17, -0.6], [0, 0, 0], { c: 0.015 });
  if (rk >= 2) b.scope([0, -0.17, -0.645], [0, PI, 0], 1, () => hazard(b, 'pelvis', 0.62, 0.075, 8));
  for (const sx of [1, -1]) lamp(b, 'pelvis', [sx * 0.26, 0.05, -0.59], [-PI / 2, 0, 0], 0.03, 'eye');
  if (!far) b.add(b.tor(0.04, 0.013, 10, 4), 'pelvis', 'metal', [0, -0.25, -0.62], [0, PI / 2, 0]);
  // turret ring the upper works sit on
  b.add(b.cyl(0.33, 0.35, 0.06, 20), 'spine', 'metal', [0, -0.09, 0]);
  b.add(b.cyl(0.29, 0.31, 0.08, 16), 'spine', 'accent', [0, -0.02, 0]);
  if (!far) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.add(b.cyl(0.012, 0.012, 0.02, 6), 'spine', 'trim', [Math.cos(a) * 0.335, -0.06, Math.sin(a) * 0.335]); }
  void boss;
}

// ---------------- plough (aux3, pivots at the hull centre) ----------------
function plough(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 1.22 : 1.14, Z = 0.64, bn = 'aux3';
  // moldboard: lower facet leans back, middle band upright (hazard), top curl leans forward
  b.add(b.cbox(W, 0.06, 0.06, 0.012), bn, 'metal', [0, -0.17, Z + 0.04]);
  b.add(plate(b, W, 0.15, 0.06, { c: 0.012 }), bn, 'paint', [0, -0.07, Z + 0.01], [-0.32, 0, 0]);
  b.add(plate(b, W, 0.16, 0.06, { c: 0.012 }), bn, 'paint', [0, 0.08, Z - 0.02]);
  b.add(plate(b, W, 0.12, 0.06, { c: 0.012, tz: 1 }), bn, 'paint', [0, 0.21, Z + 0.0], [0.55, 0, 0]);
  b.add(b.cbox(W + 0.02, 0.03, 0.05, 0.008), bn, 'accent', [0, 0.27, Z + 0.05], [0.55, 0, 0]);
  if (rk >= 2) b.scope([0, 0.08, Z + 0.012], [0, 0, 0], 1, () => hazard(b, bn, W - 0.04, 0.14, 11));
  else if (rk === 0 && !far) {
    // dented, mismatched patch plate
    b.add(plate(b, 0.3, 0.13, 0.03, { c: 0.008 }), bn, 'accent', [0.28, 0.06, Z + 0.02], [0.05, 0.1, 0.08]);
    rivets(b, bn, [[0.16, 0.11, Z + 0.035], [0.4, 0.11, Z + 0.035], [0.16, 0.0, Z + 0.035], [0.4, 0.0, Z + 0.035]]);
  }
  // end plates, back frame, push arms to the pivot (outside the treads)
  for (const sx of [1, -1]) {
    b.add(fin(b, [[0, -0.2], [0.1, -0.2], [0.07, 0.3], [-0.04, 0.3]], 0.04, 0.008), bn, 'accent', [sx * (W / 2 + 0.01), 0, Z - 0.06], [0, PI / 2, 0]);
    b.add(b.cbox(0.07, 0.07, Z - 0.02, 0.012), bn, 'metal', [sx * 0.56, -0.06, Z / 2 - 0.02]);
    b.add(b.cbox(0.09, 0.05, Z * 0.6, 0.012), bn, 'paint', [sx * 0.56, -0.015, Z / 2 + 0.02]);
    b.add(discX(b, 0.06, 0.1, 12), bn, 'metal', [sx * 0.56, -0.06, 0]);
    b.add(discX(b, 0.03, 0.12, 10), bn, 'trim', [sx * 0.56, -0.06, 0]);
  }
  for (const x of [-0.36, 0, 0.36]) b.add(b.cbox(0.05, 0.36, 0.05, 0.01), bn, 'metal', [x, 0.04, Z - 0.06], [-0.1, 0, 0]);
  b.add(b.cbox(W * 0.9, 0.05, 0.05, 0.01), bn, 'metal', [0, -0.04, Z - 0.07]);
  // lift rams: barrel on the hull, rod on the plough
  for (const sx of [1, -1]) ram(b, 'pelvis', [sx * 0.2, HOV + 0.12, 0.42], bn, [sx * 0.2, HOV - 0.12, Z - 0.08], 0.032);
  // R3: spikes along the top edge + ripper teeth + chains draped across the face
  if (rk >= 3) {
    const n = far ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.08 + i * (W - 0.16) / (n - 1);
      b.add(b.cyl(0.0, 0.035, 0.15, 8), bn, 'metal', [x, 0.29, Z + 0.1], [PI / 2 + 0.55, 0, 0]);
      b.add(b.cyl(0.04, 0.04, 0.02, 8), bn, 'trim', [x, 0.27, Z + 0.06], [PI / 2 + 0.55, 0, 0]);
    }
    for (let i = 0; i < 5; i++) b.add(fin(b, [[-0.03, 0], [0.03, 0], [0.012, -0.1], [-0.012, -0.1]], 0.04, 0.006), bn, 'metal', [-0.4 + i * 0.2, -0.19, Z + 0.06], [-0.4, 0, 0]);
    if (!far) for (const [x0, x1] of [[-0.5, 0.05], [0.0, 0.52]]) {
      const m = 9;
      for (let i = 0; i < m; i++) {
        const u = i / (m - 1), x = x0 + (x1 - x0) * u, y = 0.2 - Math.sin(u * PI) * 0.12;
        b.add(b.tor(0.026, 0.008, 8, 4), bn, 'metal', [x, y, Z + 0.055], [0, i % 2 ? PI / 2 : 0, 0.5 * Math.cos(u * PI)]);
      }
    }
  }
  // R4: ram horns on the plough corners
  if (rk >= 4) for (const sx of [1, -1]) {
    b.add(fin(b, [[0, 0], [0.12, 0], [0.1, 0.18], [0.02, 0.36], [-0.02, 0.16]], 0.07, 0.012), bn, 'accent', [sx * (W / 2 - 0.06), 0.2, Z + 0.06], [0.9, sx * 0.25, 0]);
    b.add(b.cyl(0.0, 0.03, 0.12, 8), bn, 'glow', [sx * (W / 2 - 0.05), 0.42, Z + 0.32], [0.9, 0, 0]);
  }
  // boss: skull plate in the middle, extra armour skirts
  if (boss) {
    b.add(b.cbox(0.26, 0.2, 0.03, 0.03), bn, 'accent', [0, 0.08, Z + 0.03]);
    skull(b, bn, [0, 0.085, Z + 0.05], [0, 0, 0], 1.25);
  }
}

// ---------------- upper works: engine house, stacks (chest) ----------------
function upper(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3;
  // engine house: dark block, orange side panels, top grille, air cleaner, toolbox
  P(b, 'chest', 'accent', [0.66, 0.28, 0.72], [0, 0.06, -0.06], [0, 0, 0], { c: 0.04, tx: 0.94, tz: 0.94 });
  for (const sx of [1, -1]) {
    P(b, 'chest', 'paint', [0.03, 0.22, 0.56], [sx * 0.34, 0.06, -0.08], [0, 0, sx * 0.04], { c: 0.01, bz: 0.94 });
    vent(b, 'chest', [sx * 0.357, 0.07, -0.2], [0, sx * PI / 2, 0], 0.22, 0.14, 4);
    if (o.r >= 2) P(b, 'chest', 'accent', [0.03, 0.08, 0.3], [sx * 0.36, -0.07, 0.08], [0, 0, sx * 0.1], { c: 0.008 });
  }
  vent(b, 'chest', [0, 0.205, -0.22], [-PI / 2, 0, 0], 0.42, 0.26, 6);
  P(b, 'chest', 'paint', [0.6, 0.035, 0.2], [0, 0.205, 0.2], [0.08, 0, 0], { c: 0.012, tx: 0.95 });
  b.add(b.cyl(0.07, 0.07, 0.18, 14), 'chest', 'metal', [0.23, 0.29, 0.14]);
  b.add(b.cyl(0.075, 0.075, 0.03, 14), 'chest', 'accent', [0.23, 0.39, 0.14]);
  if (!far) b.add(b.tube([[0.23, 0.22, 0.14], [0.2, 0.2, 0.0], [0.08, 0.21, -0.05]], 0.022, 8, 5), 'chest', 'metal');
  P(b, 'chest', 'paint', [0.2, 0.1, 0.12], [-0.2, 0.25, -0.32], [0, 0.1, 0], { c: 0.015 });
  // front: boom mount (right) + a heavy bracket, front lamps
  P(b, 'chest', 'metal', [0.2, 0.2, 0.14], [-0.12, 0.06, 0.32], [0, 0, 0], { c: 0.025 });
  b.add(discX(b, 0.075, 0.24, 14), 'chest', 'accent', [-0.15, 0.08, 0.34]);
  b.add(discX(b, 0.035, 0.27, 10), 'chest', 'trim', [-0.15, 0.08, 0.34]);
  lamp(b, 'chest', [0.2, 0.08, 0.31], [PI / 2, 0, 0], 0.035, 'glow');
  // twin exhaust stacks: elbow, heat-shield wrap, rain cap; glow ring in the mouth
  for (const sx of [1, -1]) {
    const x = sx * 0.25, z = -0.5, y0 = -0.24, y1 = 1.18 + (rk >= 4 ? 0.1 : 0) - (rk === 0 && sx === -1 ? 0.12 : 0);
    const tilt = rk === 0 && sx === -1 ? 0.18 : 0;
    b.add(b.cyl(0.072, 0.08, y1 - y0, 16), 'chest', 'metal', [x, (y0 + y1) / 2, z], [-tilt, 0, sx * 0.03]);
    b.add(b.cyl(0.088, 0.088, 0.5, 16, true), 'chest', 'paint', [x, y0 + 0.85, z - tilt * 0.6], [-tilt, 0, sx * 0.03]);
    if (!far) for (const y of [0.62, 0.85, 1.08]) b.add(b.cyl(0.092, 0.092, 0.02, 16), 'chest', 'accent', [x, y0 + y, z - tilt * (y / 1.2)], [-tilt, 0, sx * 0.03]);
    b.add(b.cyl(0.085, 0.085, 0.05, 16), 'chest', 'trim', [x + sx * 0.03, y1 - 0.02, z - tilt * 1.0], [-tilt, 0, sx * 0.03]);
    b.add(b.cyl(0.058, 0.058, 0.02, 12), 'chest', 'glow', [x + sx * 0.032, y1 + 0.005, z - tilt * 1.0], [-tilt, 0, sx * 0.03]);
    if (rk >= 4) for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; b.add(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.08]], 0.012, 0.003), 'chest', 'accent', [x + sx * 0.03 + Math.cos(a) * 0.06, y1 + 0.01, z - tilt + Math.sin(a) * 0.06], [0, -a + PI / 2, 0]); }
    else b.add(b.cbox(0.16, 0.014, 0.16, 0.004), 'chest', 'accent', [x + sx * 0.03, y1 + 0.06, z - tilt - 0.06], [-0.9, 0, 0]);
    b.add(b.cbox(0.08, 0.12, 0.08, 0.015), 'chest', 'accent', [x, y0, z + 0.02]);
  }
  // stack flames (thighL/R, scaled in tick)
  for (const bone of ['thighL', 'thighR']) {
    b.add(b.cyl(0.0, 0.05, 0.28, 8), bone, 'glow', [0.03 * (bone === 'thighL' ? 1 : -1), (rk >= 4 ? 0.1 : 0) + 0.15, 0]);
    b.add(b.cyl(0.0, 0.03, 0.4, 6), bone, 'eye', [0.03 * (bone === 'thighL' ? 1 : -1), (rk >= 4 ? 0.1 : 0) + 0.21, 0]);
  }
  // R5 hull flame jets (shinL/R): point outward
  if (rk >= 5) for (const [bone, sx] of [['shinL', 1], ['shinR', -1]]) for (const z of [-0.25, -0.05, 0.15]) {
    b.add(b.cyl(0.0, 0.032, 0.2, 6), bone, 'glow', [0.1 * sx, -0.04, z], [0, 0, -sx * PI / 2]);
    b.add(b.cyl(0.0, 0.018, 0.26, 5), bone, 'eye', [0.13 * sx, -0.04, z], [0, 0, -sx * PI / 2]);
  }
  // rogue flair: scrap spikes on the engine house corners
  if (!far && o.faction === 'rogue') b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.14]], 0.03, 0.006), 'chest', 'metal', [0.32, 0.2, 0.22], [0.2, 0, -0.6]);
  if (!far && o.faction === 'experimental') b.sym(b.sph(5, 3), 'chest', 'glow', [0.3, 0.32, 0.2], [0, 0, -0.3], [0.03, 0.09, 0.03]);
  void boss;
}

// ---------------- cab-head on a hydraulic lift (neck + head) ----------------
function cab(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3;
  // lift: central column + twin rams from the engine deck to the cab floor
  b.add(b.cyl(0.08, 0.1, 0.3, 12), 'neck', 'accent', [0, -0.17, 0]);
  b.add(b.cyl(0.055, 0.055, 0.36, 10), 'neck', 'metal', [0, 0.0, 0]);
  for (const sx of [1, -1]) {
    b.add(b.cyl(0.03, 0.03, 0.2, 8), 'chest', 'accent', [sx * 0.15, 0.3, -0.02]);
    b.add(b.cyl(0.017, 0.017, 0.28, 8), 'head', 'metal', [sx * 0.15, -0.12, -0.06]);
  }
  // cab body: orange lower, dark roof, caged windshield + visor slit, side windows
  const cy = 0.2, cz = 0.02, w = 0.56, h = 0.38, d = 0.46;
  P(b, 'head', 'paint', [w, h * 0.55, d], [0, cy - h * 0.22, cz], [0, 0, 0], { c: 0.03, tx: 0.98 });
  P(b, 'head', 'accent', [w * 0.94, h * 0.5, d * 0.9], [0, cy + h * 0.25, cz - 0.01], [0, 0, 0], { c: 0.035, tx: 0.88, tz: 0.86 });
  P(b, 'head', 'accent', [w * 0.82, h * 0.42, 0.04], [0, cy + h * 0.18, cz + d / 2 - 0.01], [-0.28, 0, 0], { c: 0.01, tx: 0.9 });
  b.add(b.cbox(w * 0.7, 0.04, 0.03, 0.008), 'head', 'eye', [0, cy + h * 0.14, cz + d / 2 + 0.02], [-0.28, 0, 0]);
  if (!far) for (let i = 0; i < 5; i++) b.add(b.cbox(0.014, h * 0.46, 0.014, 0.003), 'head', 'metal', [-0.16 + i * 0.08, cy + h * 0.2, cz + d / 2 + 0.04], [-0.28, 0, 0]);
  b.add(b.cbox(w * 0.84, 0.016, 0.016, 0.004), 'head', 'metal', [0, cy + h * 0.36, cz + d / 2 - 0.01], [-0.28, 0, 0]);
  for (const sx of [1, -1]) {
    b.add(b.cbox(0.02, h * 0.3, d * 0.6, 0.006), 'head', 'accent', [sx * (w / 2 + 0.003), cy + h * 0.22, cz]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.012, h * 0.32, 0.012, 0.003), 'head', 'metal', [sx * (w / 2 + 0.014), cy + h * 0.22, cz - 0.08 + i * 0.08]);
    // side mirror on a stalk
    if (!far) { b.add(b.cyl(0.008, 0.008, 0.1, 5), 'head', 'metal', [sx * (w / 2 + 0.04), cy + 0.02, cz + 0.18], [0, 0, sx * 1.1]); b.add(b.cbox(0.02, 0.07, 0.05, 0.008), 'head', 'accent', [sx * (w / 2 + 0.09), cy + 0.05, cz + 0.18]); }
  }
  // cab front grille + armoured chin
  P(b, 'head', 'accent', [w * 0.9, 0.1, 0.06], [0, cy - h * 0.38, cz + d / 2], [0.2, 0, 0], { c: 0.015, bx: 0.85 });
  if (!far) for (let i = 0; i < 6; i++) b.add(b.box(0.018, 0.07, 0.02), 'head', 'metal', [-0.15 + i * 0.06, cy - h * 0.38, cz + d / 2 + 0.035], [0.2, 0, 0]);
  // red lamp bar on the roof
  b.add(b.cbox(0.4, 0.04, 0.07, 0.012), 'head', 'metal', [0, cy + h / 2 + 0.03, cz + 0.13]);
  for (let i = 0; i < 4; i++) lamp(b, 'head', [-0.15 + i * 0.1, cy + h / 2 + 0.035, cz + 0.17], [PI / 2, 0, 0], 0.022, 'eye');
  // antenna whip + exhaust-side horn
  if (!far) {
    b.add(b.cyl(0.004, 0.007, 0.5, 5), 'head', 'metal', [-0.21, cy + h / 2 + 0.25, cz - 0.16], [-0.15, 0, 0.1]);
    b.add(b.sph(6, 4), 'head', 'eye', [-0.235, cy + h / 2 + 0.5, cz - 0.2], [0, 0, 0], 0.014);
  }
  // R2+: roll cage + cab side armour
  if (rk >= 2) {
    for (const zz of [0.18, -0.18]) b.add(b.tor(0.3, 0.017, 16, 5, PI), 'head', 'metal', [0, cy + h * 0.12, cz + zz]);
    for (const sx of [1, -1]) b.add(b.cyl(0.017, 0.017, 0.36, 6), 'head', 'metal', [sx * 0.21, cy + h * 0.12 + 0.21, cz], [PI / 2, 0, 0]);
    for (const sx of [1, -1]) P(b, 'head', 'paint', [0.03, 0.12, d * 0.8], [sx * (w / 2 + 0.02), cy - h * 0.15, cz], [0, 0, sx * 0.06], { c: 0.008 });
  }
  // door markings: amber chevrons / boss skull
  if (boss) for (const sx of [1, -1]) skull(b, 'head', [sx * (w / 2 + 0.04), cy - h * 0.15, cz], [0, sx * PI / 2, 0], 0.75);
  else for (const sx of [1, -1]) b.add(fin(b, [[0, 0], [0.04, 0], [0.09, 0.04], [0.04, 0.08], [0, 0.08], [0.05, 0.04]], 0.006, 0.001), 'head', 'trim', [sx * (w / 2 + (rk >= 2 ? 0.037 : 0.004)), cy - h * 0.2, cz - 0.03], [0, sx * PI / 2, 0]);
  // R5 / boss: beacon crown (footR spins it)
  if (rk >= 5 || boss) {
    b.add(b.cyl(0.06, 0.07, 0.035, 14), 'head', 'metal', [0.13, cy + h / 2 + 0.03, cz - 0.12]);
    b.add(b.cyl(0.048, 0.055, 0.1, 14, true), 'footR', 'eye', [0, 0.04, 0]);
    b.add(b.cbox(0.09, 0.05, 0.012, 0.004), 'footR', 'glow', [0, 0.04, 0.0]);
    b.add(b.sph(12, 6, 0, TAU, 0, PI / 2), 'footR', 'metal', [0, 0.09, 0], [0, 0, 0], 0.05);
  }
  void far;
}

// ---------------- saw boom (right arm) + saw disc (aux2) ----------------
function boom(b, o) {
  const far = b.far, rk = o.rank, ua = BOOM_U, fa = BOOM_F, hot = rk >= 4;
  // shoulder knuckle + upper boom (box beam, hazard band, hydraulic on the inside)
  b.add(discX(b, 0.08, 0.2, 14), 'upArmR', 'metal', [0, 0, 0]);
  b.add(b.cbox(0.13, ua + 0.06, 0.15, 0.025), 'upArmR', 'paint', [0, -ua / 2, 0]);
  b.add(b.cbox(0.14, 0.05, 0.16, 0.012), 'upArmR', 'accent', [0, -ua * 0.8, 0]);
  if (rk >= 2) b.scope([-0.072, -ua * 0.45, 0], [0, -PI / 2, 0], 1, () => hazard(b, 'upArmR', 0.14, 0.12, 3));
  b.add(b.cbox(0.06, ua * 0.7, 0.03, 0.01), 'upArmR', 'accent', [0.0, -ua * 0.45, 0.08]);
  // elbow + stick
  b.add(discX(b, 0.07, 0.18, 14), 'foreArmR', 'metal', [0, 0, 0]);
  b.add(discX(b, 0.032, 0.21, 10), 'foreArmR', 'trim', [0, 0, 0]);
  b.add(b.cbox(0.11, fa, 0.12, 0.02), 'foreArmR', 'paint', [0.02, -fa / 2, 0]);
  b.add(b.cbox(0.12, 0.04, 0.13, 0.01), 'foreArmR', 'accent', [0.02, -fa * 0.3, 0]);
  // boom hydraulic: barrel on the shoulder bracket (clavR), rod on the stick
  {
    const s = WD(b, 'upArmR'), e = WD(b, 'foreArmR');
    ram(b, 'upArmR', [s[0] + 0.07, s[1] - 0.04, s[2] + 0.07], 'foreArmR', [e[0] + 0.07, e[1] + 0.06, e[2] + 0.06], 0.026);
  }
  // saw hub housing + guard over the half toward the elbow (does not spin)
  b.add(discX(b, 0.075, 0.12, 14), 'handR', 'metal', [0.02, -0.02, 0]);
  b.add(discX(b, 0.04, 0.15, 10), 'handR', 'accent', [0.02, -0.02, 0]);
  b.scope([-0.045, -0.02, 0], [0, 0, PI / 2], 1, () => {
    const g = b.cyl(SAW_R + 0.05, SAW_R + 0.05, 0.03, 24, false, 0.25, PI - 0.5);
    b.add(g, 'handR', 'paint', [0, 0, 0]);
    b.add(b.cyl(SAW_R + 0.06, SAW_R + 0.06, 0.07, 24, true, 0.25, PI - 0.5), 'handR', 'accent', [0, 0.02, 0]);
  });
  if (hot && !far) for (let i = 0; i < 3; i++) b.add(b.box(0.02, 0.06, 0.012), 'handR', 'glow', [-0.064, -0.02 + Math.cos(0.6 + i * 0.5) * 0.25, Math.sin(0.6 + i * 0.5) * 0.25 * -1], [0.6 + i * 0.5, 0, 0]);
  // the saw: disc on aux2 (spins about x), fake lightening holes, hub bolts, teeth (R4: orange-hot)
  const bn = 'aux2', X = -0.1;
  b.add(discX(b, SAW_R, 0.022, 40), bn, 'metal', [X, 0, 0]);
  b.add(discX(b, SAW_R * 0.9, 0.026, 36), bn, 'metal', [X, 0, 0]);
  if (!far) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(discX(b, 0.045, 0.03, 12), bn, 'accent', [X, Math.cos(a) * SAW_R * 0.56, Math.sin(a) * SAW_R * 0.56]); }
  b.add(discX(b, 0.09, 0.05, 16), bn, 'accent', [X, 0, 0]);
  b.add(discX(b, 0.05, 0.06, 12), bn, 'trim', [X, 0, 0]);
  if (!far) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5; b.add(b.cyl(0.011, 0.011, 0.07, 6), bn, 'metal', [X, Math.cos(a) * 0.07, Math.sin(a) * 0.07], [0, 0, PI / 2]); }
  const nt = far ? 16 : 28, tooth = hot ? 'glow' : 'trim';
  for (let i = 0; i < nt; i++) {
    const a = (i / nt) * TAU;
    b.add(fin(b, [[-0.03, 0], [0.025, 0], [0.032, 0.05]], 0.034, 0.004), bn, tooth, [X, Math.cos(a) * (SAW_R - 0.012), Math.sin(a) * (SAW_R - 0.012)], [a, PI / 2, 0]);
  }
  if (hot) b.add(b.tor(SAW_R * 0.93, 0.008, 40, 4), bn, 'glow', [X + 0.016, 0, 0], [0, PI / 2, 0]);
}

// ---------------- boss: wrecking-ball crane (left arm chain) ----------------
function crane(b, o) {
  if (o.r < 3) return;
  const far = b.far, base = WD(b, 'clavL'), tip = WD(b, 'foreArmL');
  // jib: lattice of two rails + rungs from the deck to the tip (on clavL), slewing ring
  b.add(b.cyl(0.11, 0.12, 0.06, 14), 'clavL', 'metal', [0, -0.02, 0]);
  P(b, 'clavL', 'paint', [0.18, 0.1, 0.18], [0, 0.04, 0], [0, 0, 0], { c: 0.02 });
  const t = rel(b, 'clavL', tip);
  for (const sx of [1, -1]) b.add(strut(b, [sx * 0.06, 0.06, 0.02], [sx * 0.025, t[1] - 0.02, t[2] + 0.02], 0.022, 8), 'clavL', 'paint');
  b.add(strut(b, [0, 0.06, -0.07], [0, t[1] - 0.04, t[2] - 0.01], 0.02, 8), 'clavL', 'paint');
  if (!far) for (let i = 1; i < 6; i++) {
    const u = i / 6, y = 0.06 + (t[1] - 0.08) * u, z = 0.02 + (t[2]) * u, hw = 0.06 - 0.035 * u;
    b.add(b.box(hw * 2, 0.012, 0.012), 'clavL', 'metal', [0, y, z]);
    b.add(strut(b, [hw, y, z], [0, y + 0.08, z - 0.07], 0.007, 5), 'clavL', 'metal');
  }
  // tip sheave + hook block, chain, ball (on foreArmL which swings; ball on it too)
  b.add(discX(b, 0.06, 0.05, 14), 'clavL', 'metal', [0, t[1], t[2]]);
  b.add(discX(b, 0.025, 0.07, 10), 'clavL', 'trim', [0, t[1], t[2]]);
  b.add(b.cyl(0.018, 0.018, 0.03, 8), 'clavL', 'glow', [0.04, t[1] + 0.04, t[2]], [0, 0, PI / 2]);
  const L = 0.72, n = far ? 7 : 12;
  for (let i = 0; i < n; i++) b.add(b.tor(0.028, 0.008, 8, 4), 'foreArmL', 'metal', [0, -0.04 - i * (L - 0.22) / (n - 1), 0], [0, i % 2 ? PI / 2 : 0, 0]);
  b.add(b.cbox(0.07, 0.06, 0.05, 0.012), 'foreArmL', 'paint', [0, -L + 0.16, 0]);
  // wrecking ball: rusty sphere with a band, studs, red warning lamp
  b.add(b.sph(18, 14), 'handL', 'accent', [0, -0.03, 0], [0, 0, 0], 0.17);
  b.add(b.tor(0.17, 0.014, 22, 5), 'handL', 'metal', [0, -0.03, 0], [PI / 2, 0, 0]);
  b.add(b.cyl(0.045, 0.06, 0.06, 10), 'handL', 'metal', [0, 0.14, 0]);
  if (!far) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; b.add(b.cyl(0.0, 0.025, 0.06, 6), 'handL', 'metal', [Math.cos(a) * 0.17, -0.03 + (i % 2 ? 0.07 : -0.07), Math.sin(a) * 0.17], [Math.sin(a) * PI / 2, 0, -Math.cos(a) * PI / 2]); }
  void base;
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], G, () => {
    treads(b, o);
    hull(b, o);
    plough(b, o);
    upper(b, o);
    cab(b, o);
    boom(b, o);
    crane(b, o);
  });
}

// ---------------- anims ----------------
const SIDES = ['L', 'R'];
const dampOsc = (s, f = 30, d = 6) => (s <= 0 ? 0 : Math.exp(-s * d) * Math.sin(s * f));
// rear (a > 0: nose up about the rear tread bottom; a < 0: nose down about the front)
function tilt(Pp, L, a) {
  const pz = a >= 0 ? -0.62 : 0.62, py = -HOV;
  const th = -a, c = Math.cos(th), s = Math.sin(th);
  const y1 = py * c - pz * s, z1 = py * s + pz * c;
  Pp[L.PX + 1] += py - y1; Pp[L.PX + 2] += pz - z1;
  L.A(Pp, 'pelvis', th, 0, 0);
}
// boom pose by "reach" (0 = carried over the plough, 1 = raised high, -1 = chopping down / forward)
function boomPose(Pp, L, k, extra = 0) {
  const up = Math.max(0, k), dn = Math.max(0, -k);
  const ua = -1.45 - 0.85 * up + 0.45 * dn + extra, fa = -1.15 - 0.05 * up + 0.95 * dn;
  L.R(Pp, 'clavR', 0, 0, 0); L.R(Pp, 'upArmR', ua, 0, 0); L.R(Pp, 'foreArmR', fa, 0, 0); L.R(Pp, 'handR', 0, 0, 0);
}
// common: engine rumble, cab glance, boom breathing, plough height
function base(Pp, t, ctx, L, k = 1) {
  Pp[L.PX + 1] += 0.004 * Math.sin(t * 41) * k;
  L.A(Pp, 'pelvis', 0.003 * Math.sin(t * 33) * k, 0, 0.003 * Math.sin(t * 29) * k);
  L.R(Pp, 'spine', 0, 0.05 * Math.sin(t * 0.35), 0);
  L.R(Pp, 'chest', 0.004 * Math.sin(t * 37), 0, 0);
  L.R(Pp, 'neck', 0, 0, 0);
  L.R(Pp, 'head', 0.02 + ctx.st.gp * 0.15, ctx.st.gy * 0.5, 0.006 * Math.sin(t * 23));
  boomPose(Pp, L, 0.06 * Math.sin(t * 0.9));
  L.R(Pp, 'aux3', -0.04 + 0.01 * Math.sin(t * 0.7), 0, 0);
}
const PL = (Pp, L, v) => L.R(Pp, 'aux3', v, 0, 0);

const OD_DUR = 2.4, OD_REL = 0.4 / OD_DUR;
const DURS = { attack: 1.0, attack_alt: 1.1, cast: 1.2, overdrive: OD_DUR, hit: 0.45, die: 2.1, deploy: 1.5 };
const anims = {
  idle(Pp, t, ctx, L) {
    base(Pp, t, ctx, L);
    // every ~6.5 s: revs (stacks puff in tick), the cab checks left and right, the boom lifts the saw to admire it
    const c = t % 6.6, k = L.kf(c, [[0, 0], [3.8, 0], [4.3, 1], [5.4, 1], [5.9, 0]]);
    boomPose(Pp, L, 0.5 * k + 0.06 * Math.sin(t * 0.9));
    L.A(Pp, 'head', -0.05 * k, 0.35 * Math.sin(c * 2.2) * k, 0);
    tilt(Pp, L, 0.025 * k * (0.6 + 0.4 * Math.sin(c * 14)));
  },
  advance(Pp, t, ctx, L) {
    base(Pp, t, ctx, L, 1.6);
    Pp[L.PX + 1] += 0.008 * Math.abs(Math.sin(t * 7));
    tilt(Pp, L, 0.02 + 0.008 * Math.sin(t * 5));
    PL(Pp, L, -0.16);
    boomPose(Pp, L, 0.15 + 0.05 * Math.sin(t * 3));
    L.R(Pp, 'spine', 0, 0, 0);
  },
  attack(Pp, u, ctx, L) {
    // SAW RAM: rears + raises the saw, lurches forward with the plough down, saw bites (impact 0.42), grinds, backs off
    base(Pp, ctx.t, ctx, L);
    const wind = L.kf(u, [[0, 0], [0.28, 1], [0.38, 0.2], [0.45, 0], [1, 0]]);
    const ram = L.kf(u, [[0, 0], [0.3, -0.05], [0.42, 1], [0.66, 0.9], [0.92, 0], [1, 0]]);
    const bite = L.kf(u, [[0, 0], [0.3, 0], [0.42, 1], [0.7, 1], [0.9, 0]]);
    tilt(Pp, L, 0.09 * wind - 0.08 * ram);
    Pp[L.PX + 2] += 0.22 * ram;
    Pp[L.PX + 1] += 0.012 * Math.sin(u * 160) * bite;
    PL(Pp, L, L.lerp(-0.04, -0.22, wind) + 0.06 * ram);
    boomPose(Pp, L, L.lerp(0, 1, wind) - 0.9 * bite, 0.03 * Math.sin(u * 200) * bite);
    L.A(Pp, 'head', -0.1 * wind + 0.08 * ram, 0, 0);
  },
  attack_alt(Pp, u, ctx, L) {
    // OVERHEAD CHOP: boom hoists the saw high over the cab, slams it down (impact 0.5), bounce, recovers
    base(Pp, ctx.t, ctx, L);
    const up = L.kf(u, [[0, 0], [0.34, 1], [0.44, 1.05], [0.5, 0], [1, 0]]);
    const dn = L.kf(u, [[0, 0], [0.45, 0], [0.5, 1], [0.58, 0.8], [0.66, 0.95], [0.9, 0], [1, 0]]);
    const s = (u - 0.5) * DURS.attack_alt;
    boomPose(Pp, L, up * 1.25 - dn * 1.05);
    L.A(Pp, 'spine', 0, -0.12 * up + 0.06 * dn, 0);
    tilt(Pp, L, -0.05 * dn + 0.04 * up + 0.05 * dampOsc(s, 26, 7));
    Pp[L.PX + 2] += 0.1 * dn;
    PL(Pp, L, -0.04 - 0.12 * up);
    L.A(Pp, 'head', 0.08 * dn - 0.12 * up, 0, 0);
  },
  cast(Pp, u, ctx, L) {
    // ENGINE REV (taunt): front rocks up three times, stacks belch, saw revs high, cab roars
    base(Pp, ctx.t, ctx, L, 2);
    const k = L.kf(u, [[0, 0], [0.12, 1], [0.8, 1], [1, 0]]);
    const rev = Math.max(0, Math.sin(u * PI * 6)) * k;
    tilt(Pp, L, 0.07 * rev);
    boomPose(Pp, L, 0.9 * k + 0.1 * rev);
    PL(Pp, L, -0.04 - 0.1 * rev);
    L.A(Pp, 'head', -0.15 * k, 0.2 * Math.sin(u * 9) * k, 0);
  },
  overdrive(Pp, u, ctx, L) {
    // RAM RUSH: rears up hard (engines roar), crashes forward one lunge (impact = release 0.167), grinds the column with the
    // saw down and the plough driving, second slam at 0.45, then reverses back onto the plate
    base(Pp, ctx.t, ctx, L, 2.5);
    const rear = L.kf(u, [[0, 0], [0.1, 1], [0.14, 1], [0.17, -0.5], [0.22, -0.2], [0.38, -0.25], [0.45, -0.6], [0.52, -0.1], [0.75, 0], [1, 0]]);
    const rush = L.kf(u, [[0, 0], [0.12, -0.1], [0.17, 1], [0.72, 1], [0.9, 0], [1, 0]]);
    const grind = L.kf(u, [[0, 0], [0.16, 0], [0.18, 1], [0.6, 1], [0.7, 0]]);
    tilt(Pp, L, rear > 0 ? 0.28 * rear : 0.08 * rear);
    Pp[L.PX + 2] += 0.36 * rush;
    Pp[L.PX + 1] += 0.014 * Math.sin(u * 230) * grind;
    L.A(Pp, 'pelvis', 0, 0, 0.02 * Math.sin(u * 170) * grind);
    PL(Pp, L, rear > 0 ? -0.35 * rear : -0.04 + 0.08 * grind);
    boomPose(Pp, L, rear > 0 ? 1.2 * rear : -1.0 * grind - 0.2 * Math.max(0, -rear), 0.04 * Math.sin(u * 260) * grind);
    L.A(Pp, 'head', -0.25 * Math.max(0, rear) + 0.1 * grind, 0, 0);
  },
  hit(Pp, u, ctx, L) {
    base(Pp, ctx.t, ctx, L);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir, s = u * DURS.hit;
    tilt(Pp, L, 0.06 * k);
    Pp[L.PX + 2] -= 0.06 * k;
    L.A(Pp, 'pelvis', 0, 0, 0.03 * k * d);
    L.A(Pp, 'spine', 0, 0.08 * k * d, 0);
    L.A(Pp, 'neck', -0.15 * k, 0, 0.1 * k * d); L.A(Pp, 'head', -0.12 * dampOsc(s, 30, 6), 0, 0.08 * d * dampOsc(s, 24, 5));
    L.A(Pp, 'upArmR', 0.25 * dampOsc(s, 22, 5), 0, 0);
  },
  die(Pp, u, ctx, L) {
    // engine chokes (stutter), the left track snaps: hull lists, boom drops the saw onto the floor, cab slumps, settles
    base(Pp, ctx.t * (1 - u), ctx, L, 1 - u);
    const chk = Math.sin(u * 80) * L.kf(u, [[0, 0], [0.05, 1], [0.3, 1], [0.35, 0]]);
    const sag = L.kf(u, [[0, 0], [0.32, 0.1], [0.55, 1], [0.6, 0.9], [0.66, 1], [1, 1]]);
    Pp[L.PX + 1] += 0.01 * chk - 0.08 * sag;
    L.A(Pp, 'pelvis', 0.04 * sag, 0, 0.13 * sag);
    L.A(Pp, 'spine', 0, 0.25 * sag, 0);
    L.R(Pp, 'neck', 0.35 * sag, 0, -0.15 * sag); L.A(Pp, 'head', 0.3 * sag, 0, 0.1 * sag);
    boomPose(Pp, L, L.lerp(0, -1.3, sag));
    L.A(Pp, 'upArmR', 0.0, 0, 0.12 * sag);
    PL(Pp, L, L.lerp(-0.04, 0.12, sag));
  },
  victory(Pp, t, ctx, L) {
    // wheelies: rears the nose up to the beat, saw held high and revving, cab bobs
    base(Pp, t, ctx, L, 1.5);
    const k = L.smooth(Math.min(1, t / 0.6)), w = t * TAU * 0.6, beat = Math.max(0, Math.sin(w));
    tilt(Pp, L, (0.04 + 0.16 * beat) * k);
    boomPose(Pp, L, (1.1 + 0.15 * Math.sin(w * 2)) * k);
    PL(Pp, L, -0.04 - 0.25 * beat * k);
    L.A(Pp, 'spine', 0, 0.2 * Math.sin(w * 0.5) * k, 0);
    L.A(Pp, 'head', -0.12 * beat * k, 0, 0.06 * Math.sin(w) * k);
  },
  deploy(Pp, u, ctx, L) {
    // drops with the plough raised + saw tucked high; suspension crunch on landing (0.4), plough slams down (0.7), saw swings out
    base(Pp, ctx.t, ctx, L);
    const land = L.kf(u, [[0, 0], [0.4, 0], [0.44, 1], [0.52, -0.35], [0.6, 0.15], [0.7, 0], [1, 0]]);
    const tuck = L.kf(u, [[0, 1], [0.62, 1], [0.7, 0], [1, 0]]);
    const slam = dampOsc((u - 0.7) * DURS.deploy, 24, 6);
    Pp[L.PX + 1] -= 0.07 * land;
    tilt(Pp, L, 0.04 * land - 0.03 * slam);
    PL(Pp, L, -0.4 * tuck + 0.05 * slam);
    boomPose(Pp, L, 1.3 * tuck + 0.1 * slam);
    L.A(Pp, 'head', 0.15 * land, 0, 0);
  },
};

// saw spin rate (rad/s) and stack flame size per action phase
function sawRate(name, u) {
  switch (name) {
    case 'attack': return kf(u, [[0, 6], [0.25, 45], [0.75, 45], [1, 10]]);
    case 'attack_alt': return kf(u, [[0, 6], [0.3, 40], [0.8, 40], [1, 10]]);
    case 'cast': return kf(u, [[0, 6], [0.15, 50], [0.8, 50], [1, 8]]);
    case 'overdrive': return kf(u, [[0, 10], [0.1, 70], [0.75, 70], [1, 10]]);
    case 'die': return kf(u, [[0, 6], [0.3, 2], [0.55, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.7, 0], [0.85, 20], [1, 6]]);
    case 'hit': return 4;
    default: return 3;
  }
}
function flameK(name, u, rank) {
  const idle = rank >= 3 ? 0.35 : 0;
  switch (name) {
    case 'overdrive': return kf(u, [[0, idle], [0.04, 2.0], [0.15, 2.4], [0.2, 1.2], [0.6, 1.0], [0.85, idle]]);
    case 'cast': return Math.max(idle, Math.max(0, Math.sin(u * PI * 6)) * 1.6 * kf(u, [[0, 0], [0.1, 1], [0.85, 1], [1, 0]]));
    case 'attack': return kf(u, [[0, idle], [0.25, 1.2], [0.42, 1.5], [0.7, idle]]);
    case 'attack_alt': return kf(u, [[0, idle], [0.35, 1.1], [0.5, 1.4], [0.75, idle]]);
    case 'die': return kf(u, [[0, idle], [0.06, 1.4], [0.12, 0.2], [0.2, 1.0], [0.3, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.42, 0], [0.46, 1.4], [0.7, 0.3], [1, idle]]);
    case 'idle': { const c = u % 6.6; return Math.max(idle, kf(c, [[0, 0], [3.8, 0], [3.9, 1.1], [4.3, 0.2], [4.4, 0.9], [4.8, 0]])); }
    case 'victory': return 0.6 + 0.6 * Math.max(0, Math.sin(u * TAU * 0.6));
    default: return idle;
  }
}

export default {
  id: 'juggernaut', name: 'JUGGERNAUT', role: 'tank', faction: 'rogue', rarity: 'epic', realm: 'scifi',
  rig: 'tracked', dims: DIMS, height: 2.15 * G, radius: 0.72 * G, walkSpeed: 0.85, scheme: 'bold',
  style: { weapon: 'fists', tracked: true },
  // hazard orange + black, amber markers, red lamps (rogue); other factions keep their bold palette
  paint: { rogue: { paint: 0xd8601a, accent: 0x222327, trim: 0xe8ae32, eye: 0xff2a1a } },
  mats: {
    all: {
      paint: { rough: 0.48, coat: 0.25, detail: { map: rustMap, scale: 1.6, albedo: 0.75, rough: 0.6, scratch: 0.35 } },
      accent: { rough: 0.5, metal: 0.55, coat: 0.15, detail: { map: rustMap, scale: 2.2, albedo: 0.45, rough: 0.5, scratch: 0.3 } },
      metal: { color: 0x7a7f87, rough: 0.36 },
      trim: { rough: 0.35 },
    },
  },
  sockets: {
    muzzle: ['handR', sc3([-0.1, -0.02 - SAW_R * 0.8, 0])], core: sc3([0, 0.1, 0.36]), head: sc3([0, 0.3, 0.1]),
    hand: ['handR', sc3([-0.1, -0.02 - SAW_R, 0])], handL: ['aux3', sc3([0, 0.05, 0.7])],
  },
  events: {
    attack: [['impact', 0.42]], attack_alt: [['impact', 0.5]], cast: [['cast', 0.35]],
    overdrive: [['cast', 0.04], ['impact', OD_REL], ['impact', 0.45]], die: [['down', 0.55]],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) {
    ctx.su = act ? Math.min(1, act.t / act.dur) : 0;
    for (let i = 0; i < 3; i++) Pp[LIB.PX + i] *= G;   // anims are written in design units
  },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, a = st.action, u = ctx.su, t = ctx.t, dead = unit.dead;
    // treads: sprockets roll with the treadmill (OD rush + attack lurch roll too)
    let v = ctx.move.v;
    if (a === 'overdrive') v += kf(u, [[0, 0], [0.12, 0], [0.15, 6], [0.2, 1], [0.7, 0], [0.75, -2], [0.88, -2], [0.92, 0]]);
    if (a === 'attack') v += kf(u, [[0, 0], [0.3, 0], [0.36, 3], [0.45, 0], [0.75, 0], [0.82, -2], [0.92, 0]]);
    if (st.loop === 'victory' && !a) v += 0.6 * Math.sin(t * TAU * 0.6);
    ctx.roll = ((ctx.roll || 0) + v * dt / R0) % TAU;
    bones[BI.aux0].rotation.x = ctx.roll; bones[BI.aux1].rotation.x = ctx.roll;
    // saw spin (eased)
    const w = dead ? 0 : (a ? sawRate(a, u) : st.loop === 'advance' ? 14 : st.loop === 'victory' ? 40 : 3);
    ctx.sw = (ctx.sw ?? 3) + (w - (ctx.sw ?? 3)) * (1 - Math.exp(-dt * 5));
    ctx.saw = ((ctx.saw || 0) + ctx.sw * dt) % TAU;
    bones[BI.aux2].rotation.x = -ctx.saw;
    // stack flames
    let f = dead ? 0 : flameK(a || st.loop, a ? u : t, unit.rank);
    ctx.fl = (ctx.fl || 0) + (f - (ctx.fl || 0)) * (1 - Math.exp(-dt * 14));
    [BI.thighL, BI.thighR].forEach((bi, i) => {
      const k = ctx.fl * (0.85 + 0.2 * Math.sin(t * 37 + i * 2) + 0.1 * Math.sin(t * 61 + i)), s = Math.max(0.001, k);
      bones[bi].scale.set(Math.max(0.001, 0.6 + 0.4 * Math.min(1, k)), s, Math.max(0.001, 0.6 + 0.4 * Math.min(1, k)));
    });
    // R5 hull jets flicker (bigger in overdrive)
    const hj = dead ? 0.001 : (a === 'overdrive' ? 1.6 : 0.7) * (0.75 + 0.25 * Math.sin(t * 43));
    bones[BI.shinL].scale.setScalar(Math.max(0.001, hj)); bones[BI.shinR].scale.setScalar(Math.max(0.001, hj * (0.9 + 0.1 * Math.sin(t * 29))));
    // beacon spins
    bones[BI.footR].rotation.y = dead ? bones[BI.footR].rotation.y : (t * (a === 'overdrive' ? 14 : 6)) % TAU;
    // wrecking ball pendulum driven by the hull's pitch/surge (simple damped spring on foreArmL)
    const pr = bones[BI.pelvis].rotation.x, pz = bones[BI.pelvis].position.z;
    const drive = -pr * 2.2 - ((pz - (ctx.pz0 ?? pz)) / Math.max(dt, 1e-3)) * 0.12;
    ctx.pz0 = pz;
    ctx.bv = (ctx.bv || 0) + ((drive - (ctx.ba || 0)) * 40 - (ctx.bv || 0) * 2.2) * dt;
    ctx.ba = Math.max(-0.9, Math.min(0.9, (ctx.ba || 0) + ctx.bv * dt));
    bones[BI.foreArmL].rotation.set(ctx.ba, 0, 0.12 * Math.sin(t * 1.3) * (dead ? 0 : 1));
  },
  fxHints: { impact: 'saw_ram', overdrive: 'ram_rush', color: 0xff6a1a },
  build,
};

// rust: brown blotches + run-down streaks + bright chips (rgb 0.5 = neutral; tints the slot)
function rustMap(g, w, h, r) {
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    const x = r() * w, y = r() * h, R = 10 + r() * 46;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(${92 + r() * 20 | 0},${54 + r() * 12 | 0},${36 + r() * 8 | 0},${0.55 + r() * 0.35})`);
    gr.addColorStop(0.6, `rgba(${100 | 0},${70},${52},${0.25 + r() * 0.2})`);
    gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * w, y = r() * h, L = 25 + r() * 110;
    const gr = g.createLinearGradient(x, y, x, y + L);
    gr.addColorStop(0, `rgba(96,58,38,${0.35 + r() * 0.3})`); gr.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = gr; g.fillRect(x, y, 1 + r() * 3.5, L);
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, R = 1.5 + r() * 5;
    g.fillStyle = r() < 0.6 ? 'rgba(205,205,205,0.85)' : 'rgba(60,40,30,0.7)';
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(x + Math.cos(a) * R * (0.5 + r() * 0.7), y + Math.sin(a) * R * (0.5 + r() * 0.7)); } g.fill();
  }
}
