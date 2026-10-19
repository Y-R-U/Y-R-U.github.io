// CITADEL, corporate epic tank "Mobile Fortress" (sculptor-11). Brief: docs/ROSTER.md `citadel`. Also the weekly raid boss
// DREADNOUGHT (`raid_dreadnought`, legendary x1.9): the legendary build becomes a Halvorsen siege platform.
// XL tracked walking fortress: a low, wide tread hull with a hazard-striped dozer plough, a raised turret-torso on a pedestal with a
// short twin flak cannon in a mantlet, two big hinged shield walls on the turret flanks (each carrying a point-defence emplacement
// on top), a commander's cupola, two folded stabiliser legs at the back that slam down in Fortress Mode, and the signature: a dome
// of white hex tiles over a glowing core on the roof (the hex emitter).
// VALUE: `paint` = gloss white armour (turret, walls, fenders, plough), `accent` = deep navy hull + inserts, `metal` = dark gunmetal
// treads / frame / barrels, `trim` = amber hazard band + markers, `glow` = cyan dome core, track lights, seams, `eye` = cyan optics.
// Rank tiers (ROSTER, epic R2 base): R0 battered (left wall missing its outer plate, dented plough, dome tiles missing) · R1 plain
//   (no wall emplacements, short legs covers) · R2 base: PD emplacements, hazard plough, wall ribs · R3 side skirts over the treads +
//   whip antenna · R4 emitter halo spinning above the dome + glowing wall edges (silhouette) · R5 animated cyan track lights
//   (on the sprockets) + a hardlight skirt round the hull + a second halo.
// Legendary = DREADNOUGHT: vertical-launch missile battery on the rear deck, a long siege rail between the flak barrels, heavier
//   plough with ram horns, a sensor mast on the cupola, gold trim (kit).
// Bones (tracked rig): pelvis hull + treads + plough, aux0/aux1 = sprocket axles (roll in tick), spine = turret ring on the pedestal
// (traverse), chest = turret, neck = gun mantlet (elevation), footL/R = flak barrels (neck; recoil in tick), head = cupola (chest),
// aux2 = dome emitter (chest; rises in tick), aux3 = halo (aux2; spins), clavL/R + upArmL/R = shield-wall hinges + walls (chest),
// foreArm/hand = point-defence emplacements on the walls, thighL/R + shinL/R = rear stabiliser legs.
import { THREE, P, PS, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const G = 1.15;
const HOV = 0.42;
const AX = -0.21, R0 = 0.2, ZF = 0.5, TX = 0.5, TW = 0.28;
const BAR = 0.5;
const D0 = {
  hover: HOV, thigh: 0.32, shin: 0.3, ankle: 0.02, hipX: 0.34, hipY: 0,
  spine: 0.22, chest: 0.24, neck: 0.12, headOff: 0.38, clavX: 0.4, clavY: 0.1, shoulder: 0.06, upArm: 0.38, foreArm: 0.05,
  offsets: {
    spine: [0, 0.22, -0.06], chest: [0, 0.24, 0], neck: [0, 0.12, 0.42], head: [-0.24, 0.39, 0.12],
    clavL: [0.4, 0.1, -0.32], upArmL: [0.06, 0, 0], foreArmL: [0.04, 0.38, 0.6], handL: [0, 0.045, 0],
    thighL: [0.34, 0.08, -0.6], shinL: [0, -0.32, 0], footL: [0.13, 0, 0.04],
    aux0: [0, AX, ZF], aux1: [0, AX, -ZF], aux2: [0.05, 0.39, -0.15], aux3: [0, 0.42, 0],
  },
  parents: { head: 'chest', footL: 'neck', footR: 'neck', aux0: 'pelvis', aux1: 'pelvis', aux2: 'chest', aux3: 'aux2' },
};
const sc3 = (p) => p.map((x) => x * G);
const DIMS = Object.fromEntries(Object.entries(D0).map(([k, v]) => [k, typeof v === 'number' ? v * G : k === 'offsets' ? Object.fromEntries(Object.entries(v).map(([n, q]) => [n, sc3(q)])) : v]));
const OFF = DIMS.offsets;

// ---------------- greebles ----------------
function lamp(b, bone, pos, rot, r = 0.025, slot = 'glow', mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.018, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.026, 12), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.022, 0.005), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.3), 0.032, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.01]); });
}
function rivets(b, bone, pts, rot = [PI / 2, 0, 0], r = 0.01) { if (!b.far) for (const p of pts) b.add(b.cyl(r, r, 0.014, 6), bone, 'metal', p, rot); }
function hazard(b, bone, w, h, n, slot = 'accent') {
  const step = w / n, t = step * 0.42;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * step + step * 0.25;
    const pts = [[x0, -h / 2], [x0 + t, -h / 2], [Math.min(w / 2, x0 + t + h * 0.6), h / 2], [Math.min(w / 2, x0 + h * 0.6), h / 2]];
    if (pts[3][0] >= w / 2 - 0.004) continue;
    b.add(fin(b, pts, 0.008, 0.001), bone, slot, [0, 0, 0.004]);
  }
}
const _q = new THREE.Quaternion(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// geometry whose +y axis is turned onto the unit vector n, then moved to p
function along(g, n, p) { _q.setFromUnitVectors(_up, _n.set(n[0], n[1], n[2]).normalize()); g.applyQuaternion(_q); g.translate(p[0], p[1], p[2]); return g; }

// ---------------- treads + hull (pelvis) ----------------
function treads(b, o) {
  const far = b.far, n = far ? 22 : 38, L = 4 * ZF + TAU * R0;
  for (const sx of [1, -1]) {
    const x = sx * TX;
    for (let i = 0; i < n; i++) {
      let d = (i / n) * L, y, z, a;
      if (d < 2 * ZF) { z = ZF - d; y = R0; a = 0; }
      else if ((d -= 2 * ZF) < PI * R0) { const t = d / R0; z = -ZF - Math.sin(t) * R0; y = Math.cos(t) * R0; a = -t; }
      else if ((d -= PI * R0) < 2 * ZF) { z = -ZF + d; y = -R0; a = -PI; }
      else { d -= 2 * ZF; const t = d / R0; z = ZF + Math.sin(t) * R0; y = -Math.cos(t) * R0; a = -PI - t; }
      b.add(b.cbox(TW, 0.034, 0.084, 0.01), 'pelvis', 'metal', [x, y + AX, z], [a, 0, 0]);
      if (!far) b.add(b.box(TW * 0.5, 0.02, 0.026), 'pelvis', 'accent', [x, y + AX + Math.cos(a) * 0.024, z + Math.sin(a) * 0.024], [a, 0, 0]);
    }
    for (const z of [-0.27, -0.09, 0.09, 0.27]) {
      b.add(discX(b, 0.11, TW * 0.72, 14), 'pelvis', 'metal', [x, AX - 0.08, z]);
      b.add(discX(b, 0.06, TW * 0.8, 10), 'pelvis', 'accent', [x, AX - 0.08, z]);
    }
    b.add(b.cbox(0.06, 0.08, 0.96, 0.015), 'pelvis', 'metal', [x - sx * 0.02, AX + 0.02, 0]);
  }
  // sprockets / idlers (aux0 front, aux1 rear) roll in tick; R5: their cyan track lights chase as they roll
  for (const bone of ['aux0', 'aux1']) for (const sx of [1, -1]) {
    const x = sx * TX;
    b.add(discX(b, R0 - 0.025, TW * 0.82, 18), bone, 'metal', [x, 0, 0]);
    b.add(discX(b, 0.09, TW * 0.9, 14), bone, 'paint', [x, 0, 0]);
    b.add(discX(b, 0.04, TW * 0.98, 10), bone, 'glow', [x, 0, 0]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.add(b.box(TW * 0.6, 0.035, 0.035), bone, 'metal', [x, Math.cos(a) * (R0 - 0.015), Math.sin(a) * (R0 - 0.015)], [a, 0, 0]); }
    if (o.rank >= 5) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(b.cbox(0.012, 0.05, 0.03, 0.004), bone, 'glow', [x + sx * (TW * 0.45 + 0.004), Math.cos(a) * 0.13, Math.sin(a) * 0.13], [a, 0, 0]); }
  }
}
function hull(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3;
  // tub between the treads: navy body, white glacis, engine deck with grilles
  P(b, 'pelvis', 'accent', [0.7, 0.38, 1.3], [0, -0.06, -0.02], [0, 0, 0], { c: 0.05, tx: 0.95, tz: 0.92 });
  P(b, 'pelvis', 'paint', [0.68, 0.05, 0.36], [0, 0.08, 0.52], [0.55, 0, 0], { c: 0.016, tx: 0.86 });
  P(b, 'pelvis', 'accent', [0.74, 0.07, 0.6], [0, 0.15, -0.1], [0, 0, 0], { c: 0.022, tx: 0.95 });
  vent(b, 'pelvis', [0.2, 0.19, -0.42], [-PI / 2, 0, 0], 0.2, 0.22, 5, true);
  for (const sx of [1, -1]) lamp(b, 'pelvis', [sx * 0.24, 0.05, 0.66], [PI / 2 - 0.55, 0, 0], 0.04, 'eye');
  // fenders + side skirts (R3) + hardlight skirt (R5)
  for (const sx of [1, -1]) {
    b.add(plate(b, 0.34, 0.05, 1.38, { c: 0.014, tz: 0.96 }), 'pelvis', 'accent', [sx * TX, 0.035, 0]);
    b.add(plate(b, 0.2, 0.03, 0.6, { c: 0.01, tz: 0.9 }), 'pelvis', 'paint', [sx * (TX - 0.03), 0.07, 0.3]);
    b.add(b.cbox(0.34, 0.03, 0.12, 0.008), 'pelvis', 'accent', [sx * TX, 0.035, 0.68], [0.4, 0, 0]);
    b.add(b.cbox(0.34, 0.03, 0.12, 0.008), 'pelvis', 'accent', [sx * TX, 0.035, -0.68], [-0.4, 0, 0]);
    if (!far) for (let i = 0; i < 5; i++) b.add(b.cbox(0.05, 0.012, 0.12, 0.004), 'pelvis', i === 2 ? 'trim' : 'accent', [sx * (TX + 0.11), 0.065, -0.48 + i * 0.24]);
    if (rk >= 3) {
      b.add(plate(b, 0.035, 0.2, 1.18, { c: 0.01, tz: 0.95, bz: 0.9 }), 'pelvis', 'paint', [sx * (TX + TW / 2 + 0.035), -0.07, 0], [0, 0, sx * 0.05]);
      b.add(b.cbox(0.04, 0.03, 1.12, 0.008), 'pelvis', 'accent', [sx * (TX + TW / 2 + 0.04), -0.17, 0], [0, 0, sx * 0.05]);
      for (const z of [-0.36, 0, 0.36]) b.add(b.cbox(0.012, 0.012, 0.2, 0.003), 'pelvis', 'glow', [sx * (TX + TW / 2 + 0.055), -0.03, z]);
      rivets(b, 'pelvis', [-0.5, -0.18, 0.18, 0.5].map((z) => [sx * (TX + TW / 2 + 0.054), -0.12, z]), [0, 0, PI / 2]);
    }
    if (rk >= 5) for (let i = 0; i < 6; i++) b.add(b.cbox(0.008, 0.025, 0.15, 0.002), 'pelvis', 'glow', [sx * (TX + TW / 2 + 0.07), -0.2, -0.5 + i * 0.2], [0, 0, sx * 0.25]);
  }
  // rear: engine block, tail lamps, tow hooks
  P(b, 'pelvis', 'accent', [0.72, 0.16, 0.08], [0, 0.0, -0.68], [0, 0, 0], { c: 0.02 });
  vent(b, 'pelvis', [0, 0.0, -0.725], [0, PI, 0], 0.4, 0.12, 4);
  for (const sx of [1, -1]) lamp(b, 'pelvis', [sx * 0.3, 0.02, -0.72], [-PI / 2, 0, 0], 0.025, 'glow');
  // the raised pedestal under the turret ring (spine) + ring
  b.add(b.cyl(0.26, 0.32, 0.2, 16), 'spine', 'accent', [0, -0.07, 0]);
  b.add(b.cyl(0.33, 0.33, 0.04, 20), 'spine', 'metal', [0, 0.04, 0]);
  if (!far) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.add(b.cyl(0.012, 0.012, 0.02, 6), 'spine', 'trim', [Math.cos(a) * 0.335, 0.06, Math.sin(a) * 0.335]); }
  // pedestal braces + hydraulics
  if (!far) for (const sx of [1, -1]) b.add(b.cyl(0.03, 0.03, 0.22, 8), 'pelvis', 'metal', [sx * 0.24, 0.27, 0.06], [0.3, 0, sx * 0.25]);
  void boss;
}

// ---------------- dozer plough (pelvis), hazard band ----------------
function plough(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3, W = boss ? 1.4 : 1.3, Z = 0.76, bn = 'pelvis';
  b.add(b.cbox(W, 0.05, 0.06, 0.012), bn, 'metal', [0, -0.37, Z + 0.04]);
  b.add(plate(b, W, 0.15, 0.06, { c: 0.012 }), bn, 'paint', [0, -0.27, Z + 0.01], [-0.3, 0, 0]);
  b.add(plate(b, W, 0.14, 0.06, { c: 0.012 }), bn, 'trim', [0, -0.13, Z - 0.02]);
  if (rk >= 2) b.scope([0, -0.13, Z + 0.012], [0, 0, 0], 1, () => hazard(b, bn, W - 0.04, 0.13, 13));
  b.add(plate(b, W, 0.1, 0.06, { c: 0.012, tz: 1 }), bn, 'paint', [0, -0.02, Z - 0.0], [0.55, 0, 0]);
  b.add(b.cbox(W + 0.02, 0.03, 0.05, 0.008), bn, 'accent', [0, 0.03, Z + 0.03], [0.55, 0, 0]);
  if (rk === 0 && !far) {
    b.add(plate(b, 0.32, 0.12, 0.03, { c: 0.008 }), bn, 'accent', [-0.3, -0.14, Z + 0.025], [0.05, -0.1, -0.06]);
    rivets(b, bn, [[-0.42, -0.1, Z + 0.04], [-0.18, -0.1, Z + 0.04], [-0.42, -0.18, Z + 0.04], [-0.18, -0.18, Z + 0.04]]);
  }
  for (const sx of [1, -1]) {
    b.add(fin(b, [[0, -0.2], [0.1, -0.2], [0.07, 0.24], [-0.04, 0.24]], 0.04, 0.008), bn, 'accent', [sx * (W / 2 + 0.01), -0.17, Z - 0.06], [0, PI / 2, 0]);
    b.add(b.cbox(0.08, 0.08, 0.3, 0.012), bn, 'metal', [sx * 0.3, -0.2, Z - 0.18]);
    if (!far) b.add(b.cyl(0.028, 0.028, 0.3, 8), bn, 'metal', [sx * 0.15, -0.08, Z - 0.16], [PI / 2 - 0.35, 0, 0]);
  }
  // boss: ram horns + armour slab with a gold Halvorsen chevron
  if (boss) for (const sx of [1, -1]) {
    b.add(fin(b, [[0, 0], [0.13, 0], [0.11, 0.18], [0.03, 0.36], [-0.02, 0.16]], 0.07, 0.012), bn, 'accent', [sx * (W / 2 - 0.08), -0.02, Z + 0.08], [0.9, sx * 0.25, 0]);
    b.add(b.cyl(0.0, 0.03, 0.12, 8), bn, 'trim', [sx * (W / 2 - 0.07), 0.2, Z + 0.34], [0.9, 0, 0]);
  }
}

// ---------------- turret (chest), mantlet (neck), flak barrels (footL/R) ----------------
function turret(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3;
  // body: faceted white turret with a navy base course and a sloped front
  P(b, 'chest', 'accent', [0.8, 0.12, 0.78], [0, -0.03, 0.0], [0, 0, 0], { c: 0.03, tx: 0.98 });
  P(b, 'chest', 'paint', [0.76, 0.3, 0.74], [0, 0.17, -0.02], [0, 0, 0], { c: 0.04, tx: 0.86, tz: 0.82 });
  P(b, 'chest', 'paint', [0.62, 0.12, 0.2], [0, 0.12, 0.38], [0.55, 0, 0], { c: 0.02, tx: 0.86 });
  P(b, 'chest', 'accent', [0.48, 0.04, 0.42], [0, 0.335, -0.06], [0, 0, 0], { c: 0.012, tx: 0.9 });
  // turret bustle at the back: ammo bin + vents
  P(b, 'chest', 'paint', [0.6, 0.22, 0.2], [0, 0.12, -0.46], [-0.1, 0, 0], { c: 0.025, tx: 0.9 });
  vent(b, 'chest', [0, 0.12, -0.565], [0, PI, 0], 0.4, 0.13, 4);
  for (const sx of [1, -1]) {
    vent(b, 'chest', [sx * 0.385, 0.16, -0.2], [0, sx * PI / 2, 0], 0.16, 0.12, 3);
    if (!far) PS(b, 'chest', 'trim', [0.01, 0.02, 0.18], [0.39, 0.27, 0.1], [0, 0, -0.1]);
    lamp(b, 'chest', [sx * 0.3, 0.24, 0.33], [PI / 2 - 0.55, 0, 0], 0.018, 'glow');
  }
  rivets(b, 'chest', [-0.25, -0.1, 0.05, 0.2].map((x) => [x, 0.025, 0.395]));
  // R3: whip antenna (left rear) with a lamp
  if (rk >= 3 && !far) {
    b.add(b.cyl(0.02, 0.025, 0.05, 8), 'chest', 'metal', [0.3, 0.335, -0.36]);
    b.add(b.cyl(0.004, 0.008, 0.62, 5), 'chest', 'metal', [0.31, 0.66, -0.4], [-0.08, 0, -0.04]);
    b.add(b.sph(6, 4), 'chest', 'glow', [0.322, 0.97, -0.425], [0, 0, 0], 0.016);
  }
  // mantlet: rounded gun shield on trunnions
  b.add(discX(b, 0.13, 0.5, 16), 'neck', 'metal', [0, 0, -0.04]);
  P(b, 'neck', 'paint', [0.46, 0.22, 0.14], [0, 0.0, 0.04], [0, 0, 0], { c: 0.04, tx: 0.85, tz: 0.8 });
  P(b, 'neck', 'accent', [0.34, 0.06, 0.06], [0, 0.0, 0.11], [0, 0, 0], { c: 0.012 });
  lamp(b, 'neck', [0, 0.065, 0.11], [PI / 2, 0, 0], 0.02, 'eye');
  // flak barrels: thick perforated jacket, cooling rings, flash hider; recoil on footL/R
  for (const bone of ['footL', 'footR']) {
    b.add(b.cyl(0.05, 0.05, 0.16, 12), bone, 'metal', [0, 0, 0.12], [PI / 2, 0, 0]);
    b.add(b.cyl(0.062, 0.062, 0.16, 10), bone, 'paint', [0, 0, 0.14], [PI / 2, 0, 0]);
    b.add(b.cyl(0.036, 0.036, BAR, 12), bone, 'metal', [0, 0, 0.22 + BAR / 2 - 0.08], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 3; i++) b.add(b.cyl(0.045, 0.045, 0.025, 10), bone, i === 1 ? 'accent' : 'metal', [0, 0, 0.32 + i * 0.09], [PI / 2, 0, 0]);
    b.add(b.cyl(0.05, 0.044, 0.1, 10), bone, 'accent', [0, 0, 0.6], [PI / 2, 0, 0]);
    if (!far) for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + PI / 4; b.add(b.box(0.012, 0.03, 0.07), bone, 'metal', [Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.6], [0, 0, a]); }
    b.add(b.cyl(0.026, 0.026, 0.012, 10), bone, 'glow', [0, 0, 0.652], [PI / 2, 0, 0]);
    if (rk >= 3) b.add(b.cyl(0.048, 0.048, 0.012, 10), bone, 'glow', [0, 0, 0.5], [PI / 2, 0, 0]);
  }
  // boss: long siege rail between the flak barrels
  if (boss) {
    b.add(b.cbox(0.08, 0.07, 1.0, 0.012), 'neck', 'metal', [0, 0.1, 0.55]);
    b.add(b.cbox(0.012, 0.01, 0.9, 0.003), 'neck', 'glow', [0, 0.137, 0.56]);
    for (const z of [0.25, 0.55, 0.85]) b.add(b.cbox(0.12, 0.1, 0.05, 0.012), 'neck', 'paint', [0, 0.1, z]);
    b.add(b.cbox(0.1, 0.09, 0.08, 0.012), 'neck', 'trim', [0, 0.1, 1.06]);
  }
  // cupola (head): hatch ring, periscope blocks, optic slit, R2 machine gun
  b.add(b.cyl(0.1, 0.11, 0.08, 12), 'head', 'paint', [0, -0.0, 0]);
  b.add(b.cyl(0.112, 0.112, 0.02, 12), 'head', 'metal', [0, -0.045, 0]);
  b.add(b.cyl(0.08, 0.09, 0.03, 12), 'head', 'accent', [0, 0.055, 0]);
  b.add(b.cbox(0.1, 0.03, 0.03, 0.006), 'head', 'eye', [0, 0.02, 0.1]);
  if (!far) for (const a of [0.9, -0.9, PI]) b.add(b.cbox(0.03, 0.025, 0.02, 0.005), 'head', 'eye', [Math.sin(a) * 0.1, 0.02, Math.cos(a) * 0.1], [0, a, 0]);
  if (rk >= 2) {
    b.add(b.cyl(0.012, 0.012, 0.22, 8), 'head', 'metal', [0.05, 0.1, 0.12], [PI / 2, 0, 0]);
    b.add(b.cbox(0.05, 0.05, 0.09, 0.01), 'head', 'accent', [0.05, 0.1, 0.0]);
  }
  if (boss) {
    b.add(b.cyl(0.015, 0.02, 0.5, 8), 'head', 'metal', [-0.05, 0.3, -0.03]);
    b.add(b.cbox(0.2, 0.02, 0.05, 0.005), 'head', 'trim', [-0.05, 0.5, -0.03]);
    for (const sx of [1, -1]) b.add(b.sph(6, 4), 'head', 'glow', [-0.05 + sx * 0.1, 0.52, -0.03], [0, 0, 0], 0.016);
  }
}

// ---------------- hex dome emitter (aux2) + halo (aux3) ----------------
function dome(b, o) {
  const far = b.far, rk = o.rank, R = 0.27;
  // base: collar + skirt of emitter fins
  b.add(b.cyl(R + 0.03, R + 0.05, 0.07, 22), 'aux2', 'metal', [0, -0.02, 0]);
  b.add(b.cyl(R + 0.035, R + 0.035, 0.02, 22), 'aux2', 'trim', [0, 0.02, 0]);
  if (!far) for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; b.add(b.cbox(0.03, 0.05, 0.05, 0.008), 'aux2', 'accent', [Math.cos(a) * (R + 0.05), -0.01, Math.sin(a) * (R + 0.05)], [0, -a, 0]); }
  // glowing core under the tiles
  b.add(b.sph(20, 10, 0, TAU, 0, PI / 2), 'aux2', 'glow', [0, 0.02, 0], [0, 0, 0], R - 0.015);
  // white hex tiles (R0: a few missing)
  const rows = far ? [[0, 1], [0.5, 6], [1.0, 10], [1.38, 13]] : [[0, 1], [0.42, 6], [0.82, 11], [1.2, 14], [1.48, 16]];
  const tr = far ? 0.064 : 0.052;
  let idx = 0;
  for (const [pol, n] of rows) for (let i = 0; i < n; i++, idx++) {
    if (rk === 0 && (idx % 7 === 3)) continue;
    const az = (i / n) * TAU + (rows.indexOf(rows.find((r) => r[0] === pol)) % 2) * PI / n;
    const nv = [Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az)];
    const g = along(b.cyl(tr, tr * 0.92, 0.03, 6), nv, [nv[0] * R, 0.02 + nv[1] * R, nv[2] * R]);
    b.add(g, 'aux2', 'paint');
  }
  // R4+: halo above the dome; R5 second, counter-tilted ring
  if (rk >= 4) {
    b.add(b.tor(0.3, 0.014, 40, 5), 'aux3', 'glow', [0, 0, 0], [PI / 2, 0, 0]);
    b.add(b.tor(0.34, 0.008, 40, 4), 'aux3', 'trim', [0, 0, 0], [PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(along(b.cyl(0.04, 0.04, 0.02, 6), [0, 1, 0], [Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32]), 'aux3', 'paint'); }
  }
  if (rk >= 5) b.add(b.tor(0.4, 0.008, 44, 4), 'aux3', 'glow', [0, -0.06, 0], [PI / 2 + 0.25, 0, 0.2]);
}

// ---------------- shield walls (clav hinge, upArm wall) + PD emplacements (foreArm mount, hand gun) ----------------
function walls(b, o) {
  const far = b.far, rk = o.rank, boss = o.r >= 3;
  const H = 0.58, Lz = 0.8, T = 0.08, y0 = 0.08;   // wall height, length (forward from the hinge), thickness, centre y
  for (const side of ['L', 'R']) {
    const k = side === 'L' ? 1 : -1, ua = 'upArm' + side;
    const put = (g, bone, slot, p, r) => b.add(g, bone, slot, [p[0] * k, p[1], p[2]], r ? [r[0], r[1] * k, r[2] * k] : undefined);
    // hinge knuckles on the turret (clav)
    put(b.cyl(0.05, 0.05, 0.36, 12), 'clav' + side, 'metal', [0.0, 0.05, 0]);
    put(b.cbox(0.08, 0.08, 0.12, 0.015), 'clav' + side, 'accent', [-0.03, 0.05, 0.06]);
    // the wall: navy core slab, white outer armour face (two layers), top cap, hex bosses, cyan edge strip
    const zc = Lz / 2 - 0.02;
    put(plate(b, T, H, Lz, { c: 0.02, tz: 0.92, bz: 0.98 }), ua, 'accent', [0.05, y0, zc]);
    const torn = rk === 0 && side === 'L';
    if (!torn) {
      put(plate(b, 0.04, H * 0.9, Lz * 0.94, { c: 0.015, tz: 0.9 }), ua, 'paint', [0.105, y0 + 0.01, zc + 0.01]);
      if (rk >= 2) put(plate(b, 0.03, H * 0.42, Lz * 0.6, { c: 0.012, tz: 0.85 }), ua, 'paint', [0.135, y0 + 0.1, zc + 0.04]);
    }
    put(b.cbox(T + 0.06, 0.05, Lz * 0.96, 0.012), ua, 'paint', [0.07, y0 + H / 2 + 0.01, zc]);
    put(b.cbox(T + 0.02, 0.04, Lz * 0.9, 0.01), ua, 'metal', [0.05, y0 - H / 2 + 0.02, zc]);
    // front edge: angled ram blade
    put(fin(b, [[0, -H / 2], [0.1, -H / 2 + 0.06], [0.1, H / 2 - 0.04], [0, H / 2]], T + 0.03, 0.01), ua, 'accent', [0.05, y0, Lz - 0.02], [0, -PI / 2, 0]);
    if (!far && !torn) for (let i = 0; i < 3; i++) {
      put(along(b.cyl(0.05, 0.05, 0.02, 6), [1, 0, 0], [0, 0, 0]), ua, 'accent', [0.155, y0 - 0.12, 0.16 + i * 0.22]);
      put(along(b.cyl(0.026, 0.026, 0.024, 6), [1, 0, 0], [0, 0, 0]), ua, 'glow', [0.162, y0 - 0.12, 0.16 + i * 0.22]);
    }
    if (!far) put(b.cbox(0.012, 0.03, Lz * 0.5, 0.003), ua, 'trim', [0.13, y0 + H / 2 - 0.05, zc]);
    if (rk >= 4) {
      put(b.cbox(0.02, 0.02, Lz * 0.94, 0.004), ua, 'glow', [0.12, y0 + H / 2 + 0.04, zc]);
      put(b.cbox(0.02, H * 0.9, 0.02, 0.004), ua, 'glow', [0.12, y0, Lz - 0.005]);
      put(fin(b, [[0, 0], [0.32, 0], [0.24, 0.12], [0.04, 0.1]], 0.012, 0.003), ua, 'glow', [0.09, y0 + H / 2 + 0.03, 0.05], [0, -PI / 2, 0]);
    }
    if (boss) put(plate(b, 0.03, 0.2, Lz * 0.7, { c: 0.01 }), ua, 'trim', [0.14, y0 - 0.17, zc]);
    // point-defence emplacement on the wall top-front (R2+): ring mount (foreArm) + twin gun (hand, tracks)
    if (rk >= 2 || boss) {
      const fa = 'foreArm' + side, hd = 'hand' + side;
      b.add(b.cyl(0.07, 0.08, 0.04, 12), fa, 'metal', [0, 0, 0]);
      b.add(b.cbox(0.11, 0.07, 0.12, 0.018), hd, 'paint', [0, 0.02, 0]);
      b.add(b.cbox(0.08, 0.02, 0.08, 0.006), hd, 'accent', [0, 0.06, -0.01]);
      for (const sx of [1, -1]) b.add(b.cyl(0.012, 0.012, 0.2, 8), hd, 'metal', [sx * 0.025, 0.02, 0.15], [PI / 2, 0, 0]);
      b.add(b.cbox(0.03, 0.02, 0.012, 0.004), hd, 'eye', [0, 0.04, 0.062]);
    }
  }
}

// ---------------- rear stabiliser legs (thigh, shin) ----------------
function legs(b, o) {
  const far = b.far, rk = o.rank;
  const th = 0.32, sh = 0.3;
  b.sym(discX(b, 0.07, 0.12, 14), 'thigh', 'metal', [0, 0, 0]);
  b.sym(b.cbox(0.1, th, 0.1, 0.018), 'thigh', 'accent', [0, -th / 2, 0]);
  b.sym(plate(b, 0.12, th * 0.75, 0.04, { c: 0.01, tx: 0.8 }), 'thigh', rk >= 1 ? 'paint' : 'accent', [0, -th * 0.45, -0.06]);
  b.sym(b.cyl(0.024, 0.024, th * 0.8, 8), 'thigh', 'metal', [0.0, -th * 0.45, 0.065]);
  b.sym(discX(b, 0.06, 0.13, 12), 'shin', 'metal', [0, 0, 0]);
  b.sym(b.cbox(0.08, sh, 0.08, 0.015), 'shin', 'metal', [0, -sh / 2, 0]);
  b.sym(plate(b, 0.1, sh * 0.6, 0.03, { c: 0.008 }), 'shin', 'accent', [0, -sh * 0.45, -0.05]);
  // spade foot with teeth + amber hazard tab
  b.sym(plate(b, 0.22, 0.05, 0.18, { c: 0.012, tx: 0.8 }), 'shin', 'paint', [0, -sh - 0.01, -0.02]);
  if (!far) for (let i = 0; i < 3; i++) b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, -0.05]], 0.03, 0.004), 'shin', 'metal', [-0.06 + i * 0.06, -sh - 0.035, 0.05]);
  b.sym(b.cbox(0.1, 0.02, 0.012, 0.004), 'shin', 'trim', [0, -sh + 0.03, -0.06]);
  b.sym(b.cyl(0.02, 0.02, 0.012, 10), 'shin', 'glow', [0.07, -sh * 0.3, -0.07], [PI / 2, 0, 0]);
}

// ---------------- boss: vertical-launch missile battery on the rear deck (pelvis) ----------------
function battery(b, o) {
  if (o.r < 3) return;
  for (const sx of [1, -1]) {
    P(b, 'chest', 'accent', [0.18, 0.2, 0.3], [sx * 0.22, 0.35, -0.38], [0, 0, 0], { c: 0.02 });
    b.add(b.cbox(0.19, 0.02, 0.31, 0.005), 'chest', 'trim', [sx * 0.22, 0.455, -0.38]);
    for (let i = 0; i < 6; i++) b.add(b.cyl(0.026, 0.026, 0.02, 8), 'chest', 'eye', [sx * 0.22 + ((i % 2) - 0.5) * 0.08, 0.465, -0.48 + Math.floor(i / 2) * 0.1]);
  }
}

function build(b, o) {
  b.scope([0, 0, 0], [0, 0, 0], G, () => {
    treads(b, o);
    hull(b, o);
    plough(b, o);
    turret(b, o);
    dome(b, o);
    walls(b, o);
    legs(b, o);
    battery(b, o);
  });
}

// ---------------- anims ----------------
const SIDES = ['L', 'R'];
const dampOsc = (s, f = 30, d = 6) => (s <= 0 ? 0 : Math.exp(-s * d) * Math.sin(s * f));
// hull pitch about the rear (a > 0 nose up) or front (a < 0) tread bottom
function tilt(Pp, L, a) {
  const pz = a >= 0 ? -0.7 : 0.7, py = -HOV;
  const th = -a, c = Math.cos(th), s = Math.sin(th);
  const y1 = py * c - pz * s, z1 = py * s + pz * c;
  Pp[L.PX + 1] += py - y1; Pp[L.PX + 2] += pz - z1;
  L.A(Pp, 'pelvis', th, 0, 0);
}
// stabiliser legs: 0 = folded up the back, 1 = planted on the floor
function legPose(Pp, L, k) {
  for (const s of SIDES) { L.RS(Pp, 'thigh', s, L.lerp(2.5, 0.95, k), 0, L.lerp(0, -0.12, k)); L.RS(Pp, 'shin', s, L.lerp(-2.35, -0.95, k), 0, 0); }
}
// walls: 0 = flank armour along the turret, k = 1 swung out ~60 deg into flanking shield walls (fortress), open = extra flare
function wallPose(Pp, L, k, open = 0) {
  for (const s of SIDES) { L.RS(Pp, 'clav', s, 0, 0, 0); L.RS(Pp, 'upArm', s, 0.08 * k, 1.05 * k + 0.5 * open, -0.12 * k); }
}
function base(Pp, t, ctx, L, k = 1) {
  Pp[L.PX + 1] += 0.003 * Math.sin(t * 39) * k;
  L.A(Pp, 'pelvis', 0.002 * Math.sin(t * 31) * k, 0, 0.002 * Math.sin(t * 27) * k);
  L.R(Pp, 'spine', 0, 0.1 * Math.sin(t * 0.3), 0);
  L.R(Pp, 'chest', 0.003 * Math.sin(t * 35), 0, 0);
  L.R(Pp, 'neck', -0.06 + 0.03 * Math.sin(t * 0.8), 0, 0);
  L.R(Pp, 'head', 0, ctx.st.gy * 0.8 + 0.3 * Math.sin(t * 0.5), 0);
  wallPose(Pp, L, 0);
  legPose(Pp, L, 0);
  // point-defence guns sweep the sky independently
  for (const s of SIDES) { const ph = s === 'L' ? 0 : 2.1; L.RS(Pp, 'foreArm', s, 0, 0, 0); L.RS(Pp, 'hand', s, -0.2 + 0.12 * Math.sin(t * 0.9 + ph), 0.6 * Math.sin(t * 0.43 + ph), 0); }
}
const OD_DUR = 2.6, OD_REL = 0.6 / OD_DUR;
const DURS = { attack: 1.0, attack_alt: 1.3, cast: 1.3, overdrive: OD_DUR, hit: 0.45, die: 2.1, deploy: 1.5 };
// barrel recoil shots per action (u, side 'L'|'R')
const SHOTS = { attack: [[0.35, 'R'], [0.47, 'L']], attack_alt: [[0.3, 'R'], [0.4, 'L'], [0.5, 'R'], [0.6, 'L']] };
function kick(name, u, dur, side) {
  let k = 0;
  for (const [u0, sd] of SHOTS[name] || []) { if (sd !== side) continue; const s = (u - u0) * dur; if (s >= 0) k = Math.max(k, Math.exp(-s * 9) * Math.min(1, s * 70)); }
  return k;
}
function salvo(name, u, dur) { return Math.max(kick(name, u, dur, 'L'), kick(name, u, dur, 'R')); }
const anims = {
  idle(Pp, t, ctx, L) {
    base(Pp, t, ctx, L);
    // every ~8 s: turret swings to check a flank, mantlet lifts, walls flex once
    const c = t % 8.4, k = L.kf(c, [[0, 0], [5.0, 0], [5.6, 1], [6.8, 1], [7.4, 0]]);
    L.A(Pp, 'spine', 0, 0.5 * k, 0);
    L.A(Pp, 'neck', -0.15 * k, 0, 0);
    wallPose(Pp, L, 0, 0.12 * Math.sin((c - 5) * 3) * k);
  },
  advance(Pp, t, ctx, L) {
    base(Pp, t, ctx, L, 1.6);
    Pp[L.PX + 1] += 0.006 * Math.abs(Math.sin(t * 6));
    tilt(Pp, L, 0.012 + 0.006 * Math.sin(t * 4.5));
    L.R(Pp, 'spine', 0, 0, 0);
    L.A(Pp, 'neck', -0.04, 0, 0);
  },
  attack(Pp, u, ctx, L) {
    // FLAK CANNON: turret settles, mantlet lifts, right then left barrel fire (0.35 / 0.47 = sim windup), hull rocks back
    base(Pp, ctx.t, ctx, L, 0.5);
    const k = L.kf(u, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]), r = salvo('attack', u, DURS.attack);
    L.R(Pp, 'spine', 0, 0, 0);
    L.R(Pp, 'neck', -0.12 * k - 0.1 * r, 0, 0);
    L.A(Pp, 'chest', -0.03 * r, 0, 0);
    tilt(Pp, L, 0.025 * r + 0.012 * dampOsc((u - 0.35) * DURS.attack, 22, 5));
    Pp[L.PX + 2] -= 0.02 * r;
  },
  attack_alt(Pp, u, ctx, L) {
    // FULL SALVO: walls brace forward a little, four alternating shots, the turret twitches between them
    base(Pp, ctx.t, ctx, L, 0.5);
    const k = L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]), r = salvo('attack_alt', u, DURS.attack_alt);
    L.R(Pp, 'spine', 0, 0.06 * Math.sin(u * 30) * k, 0);
    L.R(Pp, 'neck', -0.18 * k - 0.08 * r, 0, 0);
    wallPose(Pp, L, 0.15 * k);
    tilt(Pp, L, 0.03 * r);
  },
  cast(Pp, u, ctx, L) {
    // HARDPOINT PULSE: legs half-drop, the dome lifts and pulses (cast 0.5), walls flare out and back
    base(Pp, ctx.t, ctx, L, 0.7);
    const k = L.kf(u, [[0, 0], [0.3, 1], [0.75, 1], [1, 0]]), p = L.kf(u, [[0, 0], [0.45, 0], [0.5, 1], [0.7, 0]]);
    legPose(Pp, L, 0.35 * k);
    wallPose(Pp, L, 0, 0.35 * k - 0.15 * p);
    L.A(Pp, 'neck', -0.2 * k, 0, 0);
    tilt(Pp, L, -0.015 * p);
  },
  overdrive(Pp, u, ctx, L) {
    // FORTRESS MODE: stabiliser legs unfold and slam down (0.17), the walls swing into a V in front, the dome rises on its mast
    // (tick) and fires the hex dome over the squad at the release (0.6 s), hull squats under the slam, hold, then folds back up
    base(Pp, ctx.t, ctx, L, 0.4);
    const leg = L.kf(u, [[0, 0], [0.12, 0.6], [0.17, 1], [0.8, 1], [0.95, 0]]);
    const wall = L.kf(u, [[0, 0], [0.08, -0.08], [0.2, 1.08], [0.26, 1], [0.8, 1], [0.95, 0]]);
    const s = (u - 0.17) * OD_DUR;
    legPose(Pp, L, leg);
    wallPose(Pp, L, wall);
    Pp[L.PX + 1] -= 0.035 * L.kf(u, [[0, 0], [0.16, 0], [0.19, 1], [0.8, 0.6], [0.95, 0]]) + 0.01 * dampOsc(s, 30, 6);
    tilt(Pp, L, 0.035 * L.kf(u, [[0, 0], [0.1, 1], [0.17, 0], [1, 0]]) - 0.02 * dampOsc(s, 26, 5));
    L.R(Pp, 'spine', 0, 0, 0);
    L.A(Pp, 'neck', -0.3 * L.kf(u, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]), 0, 0);
  },
  hit(Pp, u, ctx, L) {
    base(Pp, ctx.t, ctx, L);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir, s = u * DURS.hit;
    tilt(Pp, L, 0.035 * k);
    Pp[L.PX + 2] -= 0.04 * k;
    L.A(Pp, 'pelvis', 0, 0, 0.015 * k * d);
    L.A(Pp, 'spine', 0, 0.1 * k * d, 0);
    L.A(Pp, 'neck', 0.1 * dampOsc(s, 28, 6), 0, 0);
    for (const sd of SIDES) L.AS(Pp, 'upArm', sd, 0, 0.08 * dampOsc(s, 24, 5), 0);
  },
  die(Pp, u, ctx, L) {
    // systems fail: the dome cracks and sinks (tick), barrels droop, walls fall open, a tread snaps (hull lists), legs slump
    base(Pp, ctx.t * (1 - u), ctx, L, 1 - u);
    const sag = L.kf(u, [[0, 0], [0.3, 0.1], [0.55, 1], [0.6, 0.9], [0.66, 1], [1, 1]]);
    const chk = Math.sin(u * 70) * L.kf(u, [[0, 0], [0.05, 1], [0.3, 1], [0.35, 0]]);
    Pp[L.PX + 1] += 0.008 * chk - 0.07 * sag;
    L.A(Pp, 'pelvis', 0.03 * sag, 0, -0.11 * sag);
    L.R(Pp, 'spine', 0, -0.35 * sag, 0);
    L.R(Pp, 'neck', 0.35 * sag, 0, 0);
    L.R(Pp, 'head', 0.2 * sag, 0.4 * sag, 0);
    for (const s of SIDES) { L.RS(Pp, 'upArm', s, 0, 0.45 * sag, -0.3 * sag); L.RS(Pp, 'hand', s, 0.6 * sag, 0, 0); }
    legPose(Pp, L, 0.4 * sag);
  },
  victory(Pp, t, ctx, L) {
    // a full turret pirouette, walls drum open/closed to the beat, mantlet salutes high
    base(Pp, t, ctx, L, 1.2);
    const k = L.smooth(Math.min(1, t / 0.6)), w = t * TAU * 0.5, beat = Math.max(0, Math.sin(w * 2));
    L.R(Pp, 'spine', 0, (t * 1.6) % TAU * k, 0);
    L.R(Pp, 'neck', -0.45 * k, 0, 0);
    wallPose(Pp, L, 0, 0.35 * beat * k);
    tilt(Pp, L, 0.02 * beat * k);
    legPose(Pp, L, 0.2 * k * (0.5 + 0.5 * Math.sin(w)));
  },
  deploy(Pp, u, ctx, L) {
    // falls in with the legs out and walls flared; slams onto the plate (land 0.42), legs fold up, walls close, dome lifts
    base(Pp, ctx.t, ctx, L);
    const land = L.kf(u, [[0, 0], [0.4, 0], [0.44, 1], [0.52, -0.3], [0.6, 0.12], [0.7, 0], [1, 0]]);
    const open = L.kf(u, [[0, 1], [0.5, 1], [0.8, 0], [1, 0]]);
    Pp[L.PX + 1] -= 0.06 * land;
    tilt(Pp, L, 0.03 * land);
    legPose(Pp, L, open);
    wallPose(Pp, L, 0, 0.5 * open);
    L.A(Pp, 'neck', 0.15 * land, 0, 0);
  },
};

// dome lift (m, design units) + halo spin rate per action
function domeLift(name, u) {
  switch (name) {
    case 'overdrive': return kf(u, [[0, 0], [0.12, 0], [0.22, 0.24], [0.8, 0.24], [0.95, 0]]);
    case 'cast': return kf(u, [[0, 0], [0.3, 0.12], [0.75, 0.12], [1, 0]]);
    case 'die': return kf(u, [[0, 0], [0.2, 0.03], [0.6, -0.12], [1, -0.12]]);
    case 'deploy': return kf(u, [[0, -0.1], [0.6, -0.1], [0.85, 0.04], [1, 0]]);
    default: return 0;
  }
}

export default {
  id: 'citadel', name: 'CITADEL', role: 'tank', faction: 'corporate', rarity: 'epic', realm: 'scifi',
  rig: 'tracked', dims: DIMS, height: 1.95 * G, radius: 0.8 * G, walkSpeed: 0.8, scheme: 'light',
  style: { weapon: 'cannon', tracked: true },
  paint: { corporate: { paint: 0xe6ebf1, accent: 0x1a2642, trim: 0xf2a21c } },
  mats: {
    all: {
      paint: { rough: 0.24, coat: 1, panel: { groove: 0.45, scale: 3.2 } },
      accent: { rough: 0.36, metal: 0.45, coat: 0.6 },
      metal: { color: 0x5f6672, rough: 0.38 },
      trim: { rough: 0.32 },
    },
    corporate: { trim: { emissive: 0xff8a10, ei: 0.3 } },
  },
  sockets: {
    muzzle: ['footR', sc3([0, 0, 0.67])], muzzleL: ['footL', sc3([0, 0, 0.67])], core: sc3([0, 0.18, 0.3]), head: sc3([0, 0.06, 0.05]),
    hand: ['footR', sc3([0, 0, 0.67])], handL: ['aux2', sc3([0, 0.28, 0])], dome: ['aux2', sc3([0, 0.3, 0])],
  },
  events: {
    attack: [['fire', 0.35], ['fire', 0.47]], attack_alt: [['fire', 0.3], ['fire', 0.4], ['fire', 0.5], ['fire', 0.6]],
    cast: [['cast', 0.5]], overdrive: [['cast', 0.04], ['impact', 0.17], ['cast', OD_REL]], die: [['down', 0.55]],
    deploy: [['land', 0.42], ['ready', 0.85]],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) {
    ctx.su = act ? Math.min(1, act.t / act.dur) : 0;
    for (let i = 0; i < 3; i++) Pp[LIB.PX + i] *= G;
  },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, a = st.action, u = a ? ctx.su : 0, t = ctx.t, dead = unit.dead;
    // treads roll with the treadmill (+ recoil shove)
    let v = ctx.move.v;
    if (a === 'attack' || a === 'attack_alt') v -= 0.6 * salvo(a, u, DURS[a]);
    ctx.roll = ((ctx.roll || 0) + v * dt / (R0 * G)) % TAU;
    bones[BI.aux0].rotation.x = ctx.roll; bones[BI.aux1].rotation.x = ctx.roll;
    // flak barrel recoil
    bones[BI.footL].position.z = OFF.footL[2] - (a ? 0.12 * G * kick(a, u, DURS[a] || 1, 'L') : 0);
    bones[BI.footR].position.z = OFF.footL[2] - (a ? 0.12 * G * kick(a, u, DURS[a] || 1, 'R') : 0);
    // dome rises on its mast, halo spins (fast in the overdrive), whole emitter shrinks into the roof on death
    const lift = a ? domeLift(a, u) : dead ? -0.12 : 0;
    ctx.dl = (ctx.dl ?? 0) + (lift - (ctx.dl ?? 0)) * (1 - Math.exp(-dt * 10));
    bones[BI.aux2].position.y = OFF.aux2[1] + ctx.dl * G;
    const hw = dead ? 0 : a === 'overdrive' ? 9 : a === 'cast' ? 5 : 1.4;
    ctx.hw = (ctx.hw ?? 1.4) + (hw - (ctx.hw ?? 1.4)) * (1 - Math.exp(-dt * 4));
    ctx.ha = ((ctx.ha || 0) + ctx.hw * dt) % TAU;
    bones[BI.aux3].rotation.set(0.06 * Math.sin(t * 0.7), ctx.ha, 0.06 * Math.cos(t * 0.6));
    const hs = a === 'overdrive' ? 1 + 0.7 * kf(u, [[0, 0], [0.18, 0], [0.24, 1], [0.8, 1], [0.95, 0]]) : 1;
    bones[BI.aux3].scale.setScalar(dead ? 0.3 : hs);
  },
  fxHints: { projectile: 'flak', impact: 'flak_burst', overdrive: 'fortress_dome', color: 0x22d3ff },
  build,
};
