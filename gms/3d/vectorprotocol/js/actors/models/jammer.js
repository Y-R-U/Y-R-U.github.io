// JAMMER, rogue signal pirate (rare mage). Brief: docs/ROSTER.md `jammer`.
// Pirate radio on treads: a small orange tracked chassis with loudspeaker horns and skirt armour, a squat radio-operator torso
// (headphone ear cups, orange visor, a hand mic, VU meters, a chalk skull), and the roster's tallest thin silhouette: a
// hazard-banded telescoping mast with a swallowtail pennant, a white dish on top and a Yagi needle above it.
// VALUE: `accent` = black armour, `paint` = orange plates (skirts, glacis, chest, arm pads, mast bands), `metal` = light
// gunmetal frame/wheels, `trim` = off-white dish + markings, `glow` = white-blue static (rogue) lamps, `eye` = orange visor.
// Rank tiers (ROSTER): R0 battered (bare left skirt) · R1 base · R2 second dish · R3 holo static rings around the mast
//   · R4 mast stands higher + blinking beacons · R5 (beyond the brief) broadcast crown: a ringed halo round the needle.
// Rarity (o.r): epic+ extra skirt armour + hull vents · legendary gold dish (trim) with the crown.
// Technique (tracked rig: leg bones carry no geometry, so they are re-used): thighL = mast base (on the chest),
// shinL = upper telescoping section (slides up in tick, yaws to spin/aim the dish), footL = dish pitch, thighR = second dish,
// shinR = beacon cluster (blinks via scale), footR = dish emitter core (pulses). aux0..3 = sprockets/idlers spun in tick.
import { P, PS, plate, fin, discX, LIB, kf, PI, BI } from '../kit.js';

const NZ = -0.2;   // the Yagi needle stands behind the tilted dish
const MAST0 = 0.6, MAST1 = 0.5, FOCUS = 0.22, DISH_R = 0.26, WHEEL_R = 0.15;
const DIMS = {
  hover: 0.34, thigh: 0.2, shin: 0.2, ankle: 0.02, hipX: 0.3, hipY: -0.17,
  spine: 0.2, chest: 0.13, neck: 0.2, headOff: 0.03, clavX: 0.16, clavY: 0.08, shoulder: 0.1, upArm: 0.15, foreArm: 0.14,
  offsets: {
    spine: [0, 0.2, -0.04], chest: [0, 0.13, 0], neck: [0, 0.18, 0.06], head: [0, 0.03, 0],
    clavL: [0.16, 0.06, 0.02], upArmL: [0.1, 0, 0], foreArmL: [0, -0.15, 0], handL: [0, -0.14, 0],
    thighL: [0, 0.06, -0.21], shinL: [0, MAST0, 0], footL: [0, MAST1, 0.035],
    thighR: [0, 0.36, 0], shinR: [0, MAST1 + 0.36, NZ], footR: [0, 0, FOCUS],
    aux0: [0.31, -0.17, 0.33], aux1: [-0.31, -0.17, 0.33], aux2: [0.31, -0.17, -0.33], aux3: [-0.31, -0.17, -0.33],
  },
  parents: { thighL: 'chest', thighR: 'thighL', shinR: 'shinL', footR: 'footL', aux0: 'pelvis', aux1: 'pelvis', aux2: 'pelvis', aux3: 'pelvis' },
};
const SIDES = ['L', 'R'];
const TAU = PI * 2;

// ---------------- greebles ----------------
function lamp(b, bone, pos, rot, r = 0.022, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.45, r * 1.45, 0.016, 12), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.024, 12), bone, slot, pos, rot);
}
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.025, 0.006), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.88, h / (n * 2.2), 0.035, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.01]); });
}
function strut(b, p, q, r, seg = 8) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
  const g = b.cyl(r, r, L, seg);
  g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
  g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
  return g;
}
// thick parabolic dish (concave side faces +y before rotation)
function dishGeo(b, R, depth, t = 0.012, seg = 22) {
  const n = 6, pts = [[0, -t]];
  for (let i = 1; i <= n; i++) { const x = (i / n) * R; pts.push([x, depth * (x / R) ** 2 - t]); }
  pts.push([R, depth]);
  for (let i = n - 1; i >= 1; i--) { const x = (i / n) * R; pts.push([x, depth * (x / R) ** 2]); }
  pts.push([0, 0.0005]);
  return b.lathe(pts, seg);
}
// small chalk skull & crossbones (trim), drawn in the x-y plane of the scope
function skull(b, bone, pos, rot, k = 1) {
  b.scope(pos, rot, k, () => {
    b.add(b.cbox(0.05, 0.042, 0.006, 0.012), bone, 'trim', [0, 0.012, 0]);
    b.add(b.box(0.032, 0.014, 0.006), bone, 'trim', [0, -0.016, 0]);
    for (const x of [-0.012, 0.012]) b.add(b.box(0.012, 0.012, 0.004), bone, 'accent', [x, 0.014, 0.003]);
    for (const a of [0.7, -0.7]) b.add(b.box(0.085, 0.01, 0.005), bone, 'trim', [0, -0.03, -0.001], [0, 0, a]);
  });
}

// ---------------- chassis ----------------
function tracks(b, o) {
  const far = b.far, r0 = 0.16, zf = 0.33, n = far ? 18 : 30;
  for (const sx of [1, -1]) {
    const x = sx * 0.31;
    // tread links around a stadium path (top run hidden under the skirt)
    const L = 2 * (2 * zf) + TAU * r0;
    for (let i = 0; i < n; i++) {
      let d = (i / n) * L, y, z, a;
      if (d < 2 * zf) { z = zf - d; y = r0; a = 0; }
      else if ((d -= 2 * zf) < PI * r0) { const t = d / r0; z = -zf - Math.sin(t) * r0; y = Math.cos(t) * r0; a = -t; }
      else if ((d -= PI * r0) < 2 * zf) { z = -zf + d; y = -r0; a = -PI; }
      else { d -= 2 * zf; const t = d / r0; z = zf + Math.sin(t) * r0; y = -Math.cos(t) * r0; a = -PI - t; }
      b.add(b.cbox(0.16, 0.026, 0.066, 0.008), 'pelvis', 'accent', [x, y - 0.17, z], [a, 0, 0]);
      if (!far && i % 2 === 0) b.add(b.box(0.17, 0.014, 0.018), 'pelvis', 'metal', [x, y - 0.17 + Math.cos(a) * 0.018, z + Math.sin(a) * 0.018], [a, 0, 0]);
    }
    // road wheels (static) + return rollers
    for (const z of [-0.17, 0, 0.17]) {
      b.add(discX(b, 0.075, 0.12, 14), 'pelvis', 'metal', [x, -0.25, z]);
      b.add(discX(b, 0.03, 0.135, 10), 'pelvis', 'accent', [x, -0.25, z]);
    }
  }
  // sprockets / idlers on aux0..3 (spun in tick)
  for (const bone of ['aux0', 'aux1', 'aux2', 'aux3']) {
    b.add(discX(b, WHEEL_R - 0.02, 0.13, 18), bone, 'metal', [0, 0, 0]);
    b.add(discX(b, 0.07, 0.145, 14), bone, 'accent', [0, 0, 0]);
    b.add(discX(b, 0.03, 0.155, 10), bone, 'glow', [0, 0, 0]);
    if (!b.far) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(b.box(0.14, 0.022, 0.05), bone, 'accent', [0, Math.cos(a) * 0.1, Math.sin(a) * 0.1], [a, 0, 0]); }
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; b.add(b.box(0.1, 0.03, 0.03), bone, 'metal', [0, Math.cos(a) * (WHEEL_R - 0.01), Math.sin(a) * (WHEEL_R - 0.01)], [a, 0, 0]); }
  }
}
function hull(b, o) {
  const far = b.far, rk = o.rank, r = o.r;
  // body between the treads, sloped orange glacis, rear deck
  P(b, 'pelvis', 'accent', [0.46, 0.22, 0.86], [0, -0.01, 0], [0, 0, 0], { c: 0.04, tx: 0.92, tz: 0.9 });
  P(b, 'pelvis', 'paint', [0.42, 0.04, 0.24], [0, 0.07, 0.41], [0.55, 0, 0], { c: 0.015, tx: 0.85 });
  P(b, 'pelvis', 'accent', [0.36, 0.1, 0.06], [0, -0.06, 0.45], [-0.3, 0, 0], { c: 0.015 });
  for (const x of [0.11, -0.11]) lamp(b, 'pelvis', [x, -0.03, 0.48], [PI / 2 - 0.3, 0, 0], 0.026, 'eye', false);
  vent(b, 'pelvis', [0, 0.106, -0.26], [-PI / 2, 0, 0], 0.3, 0.2, 5);
  if (r >= 2) vent(b, 'pelvis', [0.15, 0.106, 0.12], [-PI / 2, 0, 0], 0.08, 0.14, 3, true);
  // skirts over the tread tops: orange armour, black lower lip, hazard chevrons, rivets (R0: left skirt missing)
  for (const sx of [1, -1]) {
    if (rk === 0 && sx === 1) {
      for (const z of [0.3, 0, -0.3]) b.add(b.cbox(0.02, 0.15, 0.03, 0.005), 'pelvis', 'metal', [0.41, -0.07, z]);
      b.add(b.cbox(0.02, 0.025, 0.8, 0.006), 'pelvis', 'metal', [0.41, 0.0, 0]);
      continue;
    }
    b.add(plate(b, 0.03, 0.15, 0.86, { c: 0.01, tz: 0.94 }), 'pelvis', 'paint', [sx * 0.405, -0.06, 0], [0, 0, sx * 0.08]);
    b.add(b.cbox(0.034, 0.03, 0.84, 0.008), 'pelvis', 'accent', [sx * 0.402, -0.135, 0], [0, 0, sx * 0.08]);
    if (!far) for (let i = 0; i < 5; i++) b.add(b.box(0.036, 0.05, 0.022), 'pelvis', 'accent', [sx * 0.414, -0.06, -0.28 + i * 0.14], [0.6, 0, sx * 0.08]);
    if (!far) for (const z of [-0.36, -0.12, 0.12, 0.36]) b.add(b.cyl(0.01, 0.01, 0.012, 6), 'pelvis', 'metal', [sx * 0.423, 0.0, z], [0, 0, PI / 2]);
    if (r >= 2) b.add(plate(b, 0.024, 0.08, 0.5, { c: 0.008 }), 'pelvis', 'accent', [sx * 0.43, 0.03, -0.1], [0, 0, sx * 0.14]);
  }
  // loudspeaker horns on the front corners (pirate broadcast)
  for (const sx of [1, -1]) {
    b.add(b.cyl(0.075, 0.03, 0.14, 14, true), 'pelvis', 'metal', [sx * 0.18, 0.14, 0.33], [PI / 2 - 0.15, 0, 0]);
    b.add(b.cyl(0.032, 0.032, 0.02, 12), 'pelvis', 'glow', [sx * 0.18, 0.135, 0.27], [PI / 2 - 0.15, 0, 0]);
    b.add(b.tor(0.075, 0.008, 16, 4), 'pelvis', 'paint', [sx * 0.18, 0.15, 0.4], [-0.15, 0, 0]);
    b.add(b.cbox(0.05, 0.08, 0.06, 0.01), 'pelvis', 'accent', [sx * 0.18, 0.08, 0.26]);
  }
  // rear: bent exhaust stack, tow ring, aerial whip
  b.add(strut(b, [-0.16, 0.08, -0.4], [-0.17, 0.32, -0.44], 0.028), 'pelvis', 'metal');
  b.add(b.cyl(0.036, 0.036, 0.04, 10), 'pelvis', 'accent', [-0.17, 0.33, -0.445], [-0.2, 0, 0]);
  b.add(b.cyl(0.022, 0.022, 0.015, 10), 'pelvis', 'glow', [-0.17, 0.355, -0.45], [-0.2, 0, 0]);
  if (!far) {
    b.add(b.tor(0.035, 0.01, 10, 4), 'pelvis', 'metal', [0, -0.08, -0.46], [0, PI / 2, 0]);
    b.add(b.cyl(0.004, 0.007, 0.55, 5), 'pelvis', 'metal', [0.17, 0.36, -0.42], [-0.25, 0, -0.12]);
    b.add(b.sph(6, 4), 'pelvis', 'glow', [0.205, 0.62, -0.49], [0, 0, 0], 0.012);
  }
  // turret ring the torso sits on
  b.add(b.cyl(0.2, 0.22, 0.06, 18), 'spine', 'metal', [0, -0.07, 0]);
  b.add(b.cyl(0.15, 0.17, 0.08, 14), 'spine', 'accent', [0, 0.0, 0]);
}

// ---------------- torso / head / arms ----------------
function torso(b, o) {
  const far = b.far;
  P(b, 'chest', 'accent', [0.42, 0.27, 0.34], [0, 0.03, -0.01], [0, 0, 0], { c: 0.04, tx: 0.88, tz: 0.86 });
  P(b, 'chest', 'paint', [0.34, 0.17, 0.04], [0, 0.06, 0.17], [-0.08, 0, 0], { c: 0.012, tx: 0.9 });
  skull(b, 'chest', [0.07, 0.08, 0.195], [-0.08, 0, 0], 1);
  // radio console: tuning dials + VU meter + speaker grille
  for (const [x, rr] of [[-0.09, 0.03], [-0.03, 0.022]]) {
    b.add(b.cyl(rr, rr, 0.025, 12), 'chest', 'trim', [x, 0.09, 0.195], [PI / 2 - 0.08, 0, 0]);
    b.add(b.box(0.005, rr * 1.4, 0.03), 'chest', 'accent', [x, 0.09, 0.2], [-0.08, 0, 0.6]);
  }
  for (let i = 0; i < 5; i++) b.add(b.box(0.016, 0.014 + i * 0.008, 0.012), 'chest', 'glow', [-0.1 + i * 0.024, -0.02 + i * 0.004, 0.19], [-0.08, 0, 0]);
  vent(b, 'chest', [0.08, -0.03, 0.18], [-0.08, 0, 0], 0.12, 0.06, 3);
  // shoulder speaker pods
  b.sym(discX(b, 0.07, 0.06, 14), 'chest', 'accent', [0.22, 0.09, 0.0]);
  b.sym(discX(b, 0.045, 0.064, 12), 'chest', 'metal', [0.225, 0.09, 0.0]);
  b.sym(b.tor(0.05, 0.007, 14, 4), 'chest', 'glow', [0.258, 0.09, 0.0], [0, PI / 2, 0]);
  // back: radio pack + mast base housing
  P(b, 'chest', 'accent', [0.3, 0.2, 0.1], [0, 0.04, -0.2], [0, 0, 0], { c: 0.02 });
  if (!far) for (let i = 0; i < 3; i++) b.add(b.box(0.22, 0.012, 0.02), 'chest', 'metal', [0, -0.02 + i * 0.045, -0.255]);
  if (!far) b.add(b.tube([[0.1, 0.12, -0.2], [0.14, 0.2, -0.16], [0.08, 0.24, -0.08]], 0.012, 8, 4), 'chest', 'metal');
}
function head(b, o) {
  b.add(b.rbox(0.2, 0.13, 0.17, 0.035), 'head', 'accent', [0, 0.05, 0.01]);
  P(b, 'head', 'paint', [0.2, 0.035, 0.12], [0, 0.12, 0.02], [0.2, 0, 0], { c: 0.01, tx: 0.8 });
  b.add(b.cbox(0.16, 0.045, 0.03, 0.01), 'head', 'eye', [0, 0.055, 0.095]);
  b.add(b.cbox(0.12, 0.03, 0.02, 0.006), 'head', 'metal', [0, 0.008, 0.09]);
  // headphones: ear cups + headband
  b.sym(discX(b, 0.06, 0.05, 16), 'head', 'metal', [0.12, 0.05, 0.0]);
  b.sym(discX(b, 0.04, 0.054, 14), 'head', 'accent', [0.124, 0.05, 0.0]);
  b.sym(b.tor(0.038, 0.006, 14, 4), 'head', 'glow', [0.152, 0.05, 0.0], [0, PI / 2, 0]);
  b.add(b.tor(0.125, 0.012, 16, 5, PI), 'head', 'metal', [0, 0.06, -0.01]);
  if (!b.far) b.add(b.cyl(0.004, 0.006, 0.22, 5), 'head', 'metal', [0.15, 0.17, -0.02], [0.2, 0, -0.35]);
  b.add(b.cyl(0.07, 0.08, 0.06, 12), 'neck', 'metal', [0, -0.05, 0]);
}
function armsAll(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm;
  b.sym(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.06);
  b.sym(b.cyl(0.03, 0.03, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'paint', [0.1, ua * 0.7, 0.1], [0.01, -ua * 0.5, 0], [0, 0, 0], { c: 0.015, tx: 1.1, tz: 1.1 });
  b.sym(discX(b, 0.04, 0.08, 10), 'foreArm', 'metal', [0, 0, 0]);
  PS(b, 'foreArm', 'accent', [0.1, fa * 0.85, 0.11], [0, -fa * 0.5, 0], [0, 0, 0], { c: 0.02, tx: 0.85, tz: 0.85 });
  b.sym(b.cbox(0.02, fa * 0.4, 0.02, 0.005), 'foreArm', 'glow', [0.052, -fa * 0.5, 0.03]);
  // left: hand mic (grip + mesh head + glow ring); right: two-prong clamp
  b.add(b.cbox(0.06, 0.06, 0.06, 0.012), 'handL', 'metal', [0, -0.03, 0]);
  b.add(b.cyl(0.016, 0.016, 0.1, 8), 'handL', 'accent', [0, -0.06, 0.03], [PI / 2 - 0.4, 0, 0]);
  b.add(b.sph(12, 8), 'handL', 'metal', [0, -0.08, 0.09], [0, 0, 0], 0.034);
  b.add(b.tor(0.03, 0.006, 12, 4), 'handL', 'glow', [0, -0.075, 0.075], [-0.4, 0, 0]);
  b.add(b.cbox(0.06, 0.05, 0.06, 0.012), 'handR', 'metal', [0, -0.025, 0]);
  for (const z of [0.022, -0.022]) b.add(fin(b, [[-0.012, 0], [0.012, 0], [0.006, -0.07], [-0.004, -0.07]], 0.016, 0.004), 'handR', 'accent', [0, -0.05, z], [0, PI / 2, 0]);
}

// ---------------- mast + dishes ----------------
function mast(b, o) {
  const far = b.far, rk = o.rank, r = o.r;
  // lower section (thighL): housing, hazard-banded tube, collar, pennant
  b.add(b.cbox(0.13, 0.12, 0.12, 0.02), 'thighL', 'metal', [0, 0.02, 0]);
  b.add(b.cyl(0.06, 0.06, 0.04, 12), 'thighL', 'accent', [0, 0.1, 0]);
  b.add(b.cyl(0.03, 0.034, MAST0, 10), 'thighL', 'metal', [0, MAST0 / 2 + 0.1, 0]);
  for (let i = 0; i < 4; i++) b.add(b.cyl(0.037, 0.037, 0.05, 10), 'thighL', i % 2 ? 'accent' : 'paint', [0, 0.2 + i * 0.1, 0]);
  b.add(b.cyl(0.045, 0.045, 0.03, 12), 'thighL', 'trim', [0, MAST0 - 0.01, 0]);
  if (!far) b.add(b.tube([[0.03, 0.12, -0.03], [0.045, 0.35, -0.035], [0.035, MAST0 - 0.05, -0.03]], 0.008, 8, 4), 'thighL', 'accent');
  b.add(fin(b, [[0, 0], [0, 0.13], [0.24, 0.1], [0.17, 0.065], [0.24, 0.03]], 0.008, 0.002), 'thighL', 'accent', [0, 0.36, -0.035], [0, PI / 2, 0]);
  b.add(fin(b, [[0, 0.045], [0, 0.085], [0.2, 0.08], [0.2, 0.05]], 0.01, 0.002), 'thighL', 'paint', [0, 0.36, -0.035], [0, PI / 2, 0]);
  // upper telescoping section (shinL): extends down inside the lower tube so it never shows a gap when raised
  b.add(b.cyl(0.02, 0.022, MAST1 + 0.5, 8), 'shinL', 'metal', [0, (MAST1 - 0.5) / 2, 0]);
  b.add(b.cyl(0.03, 0.03, 0.03, 10), 'shinL', 'accent', [0, 0.02, 0]);
  b.add(b.cyl(0.028, 0.028, 0.025, 10), 'shinL', 'paint', [0, MAST1 * 0.55, 0]);
  if (rk >= 3) for (const [y, R] of [[0.14, 0.11], [0.26, 0.085], [0.38, 0.07]]) b.add(b.tor(R, 0.005, 24, 4), 'shinL', 'glow', [0, y, 0], [PI / 2, 0, 0.2]);
  // Yagi needle above the dish
  b.add(strut(b, [0, MAST1 - 0.1, 0], [0, MAST1 - 0.06, NZ], 0.012), 'shinL', 'metal');
  b.add(b.cyl(0.006, 0.011, 0.6, 6), 'shinL', 'metal', [0, MAST1 + 0.22, NZ]);
  if (!far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.004, 0.004, 0.16 - i * 0.025, 4), 'shinL', 'metal', [0, MAST1 + 0.14 + i * 0.09, NZ], [0, 0, PI / 2]);
  b.add(b.sph(8, 6), 'shinL', 'glow', [0, MAST1 + 0.54, NZ], [0, 0, 0], 0.016);
  if (rk >= 5) {
    b.add(b.tor(0.14, 0.008, 28, 4), 'shinL', 'glow', [0, MAST1 + 0.48, NZ], [PI / 2, 0, 0]);
    b.add(b.tor(0.19, 0.005, 32, 4), 'shinL', 'trim', [0, MAST1 + 0.48, NZ], [PI / 2, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(b.box(0.012, 0.04, 0.012), 'shinL', 'glow', [Math.cos(a) * 0.165, MAST1 + 0.48, NZ + Math.sin(a) * 0.165]); }
  }
  // beacons (shinR, R4+): blink in tick
  if (rk >= 4) for (const sx of [1, -1]) {
    b.add(b.cyl(0.012, 0.012, 0.03, 6), 'shinR', 'metal', [sx * 0.03, -0.015, 0], [0, 0, PI / 2]);
    b.add(b.sph(8, 6), 'shinR', 'glow', [sx * 0.055, 0, 0], [0, 0, 0], 0.022);
  }
  // main dish (footL): yoke, white parabolic bowl, orange rim, ribs, feed struts to the emitter (footR)
  b.add(b.cbox(0.06, 0.05, 0.06, 0.01), 'footL', 'metal', [0, 0, -0.01]);
  b.add(b.cyl(0.04, 0.05, 0.05, 12), 'footL', 'accent', [0, 0, 0.0], [PI / 2, 0, 0]);
  b.add(dishGeo(b, DISH_R, 0.075), 'footL', 'trim', [0, 0, 0.025], [PI / 2, 0, 0]);
  b.add(b.tor(DISH_R, 0.011, 28, 5), 'footL', 'paint', [0, 0, 0.1], [0, 0, 0]);
  if (!far) for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.add(b.box(0.008, DISH_R * 0.85, 0.01), 'footL', 'metal', [Math.cos(a) * DISH_R * 0.5, Math.sin(a) * DISH_R * 0.5, 0.045], [0.0, 0, a - PI / 2]); }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + PI / 2; b.add(strut(b, [Math.cos(a) * DISH_R * 0.95, Math.sin(a) * DISH_R * 0.95, 0.1], [0, 0, FOCUS - 0.02], 0.005, 5), 'footL', 'metal'); }
  b.add(b.cyl(0.022, 0.028, 0.05, 10), 'footL', 'metal', [0, 0, FOCUS - 0.03], [PI / 2, 0, 0]);
  b.add(b.sph(10, 8), 'footR', 'glow', [0, 0, 0], [0, 0, 0], 0.026);
  b.add(b.tor(DISH_R * 0.55, 0.008, 24, 4), 'footL', 'glow', [0, 0, 0.05]);
  // second dish (thighR, R2+): smaller, on a side arm
  if (rk >= 2) {
    b.add(strut(b, [0, 0, 0], [-0.12, 0.03, 0.0], 0.012), 'thighR', 'metal');
    b.add(b.cyl(0.03, 0.03, 0.04, 10), 'thighR', 'accent', [0, 0, 0]);
    b.scope([-0.15, 0.04, 0.02], [0, -0.5, 0], 1, () => {
      b.add(dishGeo(b, 0.11, 0.04, 0.01, 16), 'thighR', 'trim', [0, 0, 0], [PI / 2, 0, 0]);
      b.add(b.tor(0.11, 0.007, 20, 4), 'thighR', 'paint', [0, 0, 0.04]);
      b.add(strut(b, [0, 0, 0.0], [0, 0, 0.1], 0.005, 5), 'thighR', 'metal');
      b.add(b.sph(8, 6), 'thighR', 'glow', [0, 0, 0.1], [0, 0, 0], 0.016);
    });
  }
  void r;
}

function build(b, o) {
  tracks(b, o);
  hull(b, o);
  torso(b, o);
  head(b, o);
  armsAll(b, o);
  mast(b, o);
  if (!b.far && o.faction === 'rogue') b.sym(fin(b, [[-0.025, 0], [0.025, 0], [0, 0.12]], 0.03, 0.006), 'chest', 'accent', [0.17, 0.17, -0.1], [-0.3, 0, -0.5]);
  if (!b.far && o.faction === 'experimental') b.sym(b.sph(5, 3), 'chest', 'glow', [0.16, 0.2, -0.1], [0, 0, -0.3], [0.025, 0.08, 0.025]);
}

// ---------------- anims ----------------
const REST_P = -0.7;   // dish pitch at rest: tilted skyward so the bowl reads as a disc from the battle camera
const dampOsc = (s, f = 30, d = 6) => (s <= 0 ? 0 : Math.exp(-s * d) * Math.sin(s * f));
// common upper body: engine rumble, torso scan, head nodding to the broadcast beat, arms in the console hold, mast sway, dish scan
function base(Pp, t, L, scan = 1) {
  Pp[L.PX + 1] += 0.003 * Math.sin(t * 38);
  L.A(Pp, 'pelvis', 0.004 * Math.sin(t * 31), 0, 0.003 * Math.sin(t * 27));
  const yaw = 0.22 * Math.sin(t * 0.3) * scan;
  L.R(Pp, 'spine', 0, yaw, 0);
  L.R(Pp, 'chest', 0.02, 0, 0);
  const beat = Math.max(0, Math.sin(t * TAU * 1.05));
  L.R(Pp, 'neck', 0.05 * beat, -yaw * 0.3, 0); L.R(Pp, 'head', 0.03 * beat, 0, 0.04 * Math.sin(t * TAU * 0.525));
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.4;
    L.RS(Pp, 'clav', s, 0, 0, 0);
    L.RS(Pp, 'upArm', s, -0.45 + 0.04 * Math.sin(t * 1.3 + ph), 0.1, 0.3);
    L.RS(Pp, 'foreArm', s, -1.25, 0, 0);
    L.RS(Pp, 'hand', s, 0.1, 0, 0);
  }
  L.R(Pp, 'thighL', 0.03 * Math.sin(t * 1.1), 0, 0.025 * Math.sin(t * 0.8));
  L.R(Pp, 'shinL', 0, 0.7 * Math.sin(t * 0.4) * scan - yaw * (1 - scan), 0);
  L.R(Pp, 'footL', REST_P + 0.08 * Math.sin(t * 0.7), 0, 0);
  L.R(Pp, 'thighR', 0, -t * 0.5, 0);
  return yaw;
}
// dish faces forward (cancel the torso yaw), pitch p
function aimDish(Pp, L, k, p = 0) {
  const sy = Pp[BI.spine * 3 + 1];
  const i = BI.shinL * 3 + 1, j = BI.footL * 3;
  Pp[i] = L.lerp(Pp[i], -sy, k); Pp[j] = L.lerp(Pp[j], p, k);
}

const OD_DUR = 2.4, OD_REL = 0.4 / OD_DUR;
const DURS = { attack: 0.95, attack_alt: 1.1, cast: 1.2, overdrive: OD_DUR, hit: 0.42, die: 2.0, deploy: 1.5 };
// dish spin angle during the overdrive: rate ramps 0 -> W (u 0.03..0.16), holds, ramps down (0.62..0.92)
function odSpin(u) {
  const W = 62, a = 0.03, b = 0.16, c = 0.62, d = 0.92;
  const seg = (x0, x1, r0, r1, x) => { const t = Math.min(Math.max(x, x0), x1) - x0; const rs = r0 + (r1 - r0) * t / (x1 - x0); return (r0 + rs) / 2 * t; };
  return seg(a, b, 0, W, u) + seg(b, c, W, W, u) + seg(c, d, W, 0, u);
}

const anims = {
  idle(Pp, t, ctx, L) {
    base(Pp, t, L);
    // every ~6 s it presses an ear cup (listening in), then fiddles the console dial
    const c = t % 6.2, k = L.kf(c, [[0, 0], [3.4, 0], [3.7, 1], [4.6, 1], [4.9, 0]]), f = L.kf(c, [[0, 0], [5.0, 0], [5.25, 1], [5.9, 1], [6.1, 0]]);
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.45, -1.2, k), L.lerp(0.1, -0.3, k), L.lerp(0.3, 1.0, k));
    L.RS(Pp, 'foreArm', 'R', L.lerp(-1.25, -1.9, k), 0, 0);
    L.A(Pp, 'head', 0.08 * k, 0, -0.12 * k);
    L.AS(Pp, 'upArm', 'L', -0.25 * f, 0, -0.15 * f); L.AS(Pp, 'hand', 'L', 0, 0.6 * Math.sin(c * 9) * f, 0);
  },
  advance(Pp, t, ctx, L) {
    base(Pp, t, L, 0.2);
    Pp[L.PX + 1] += 0.006 * Math.sin(t * 14);
    L.A(Pp, 'pelvis', -0.025 + 0.006 * Math.sin(t * 9), 0, 0);
    L.R(Pp, 'spine', 0, 0, 0);
    L.R(Pp, 'thighL', -0.07 + 0.025 * Math.sin(t * 7), 0, 0.02 * Math.sin(t * 3.1));
    aimDish(Pp, L, 0.7, -0.5);
    for (const s of SIDES) { L.RS(Pp, 'upArm', s, -0.3, 0.1, 0.22); L.RS(Pp, 'foreArm', s, -1.45, 0, 0); }
  },
  attack(Pp, u, ctx, L) {
    // dish snap shot: dish whips onto the target, right arm thrusts, one static pulse (fire 0.32), mast whips back
    base(Pp, ctx.t, L);
    const aim = L.kf(u, [[0, 0], [0.2, 1], [0.75, 1], [1, 0]]), s = (u - 0.32) * DURS.attack;
    L.A(Pp, 'spine', 0, -Pp[BI.spine * 3 + 1] * aim, 0);
    aimDish(Pp, L, aim, -0.15);
    L.A(Pp, 'footL', -0.15 * dampOsc(s, 40, 9), 0, 0);
    L.A(Pp, 'thighL', 0.08 * aim - 0.16 * dampOsc(s, 26, 5), 0, 0.04 * dampOsc(s, 19, 5));
    L.A(Pp, 'pelvis', -0.03 * Math.max(0, dampOsc(s, 20, 9)), 0, 0);
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.45, -1.35, aim), 0.1, L.lerp(0.3, 0.12, aim));
    L.RS(Pp, 'foreArm', 'R', L.lerp(-1.25, -0.25, aim), 0, 0);
  },
  attack_alt(Pp, u, ctx, L) {
    // double broadcast: main dish (fire 0.3) then the side dish swings round (fire 0.5)
    base(Pp, ctx.t, L);
    const aim = L.kf(u, [[0, 0], [0.18, 1], [0.8, 1], [1, 0]]), s1 = (u - 0.3) * DURS.attack_alt, s2 = (u - 0.5) * DURS.attack_alt;
    L.A(Pp, 'spine', 0, -Pp[BI.spine * 3 + 1] * aim, 0);
    aimDish(Pp, L, aim, -0.15);
    L.R(Pp, 'thighR', 0, L.lerp(Pp[BI.thighR * 3 + 1], 0.55, L.kf(u, [[0, 0], [0.4, 1], [0.85, 1], [1, 0]])), 0);
    L.A(Pp, 'thighL', 0.06 * aim - 0.13 * dampOsc(s1, 26, 5) - 0.1 * dampOsc(s2, 26, 5), 0, 0.05 * dampOsc(s2, 20, 5));
    L.A(Pp, 'pelvis', -0.025 * Math.max(0, dampOsc(s1, 20, 9) + dampOsc(s2, 20, 9)), 0, 0);
    for (const sd of SIDES) { L.RS(Pp, 'upArm', sd, L.lerp(-0.45, -1.0, aim), 0.1, L.lerp(0.3, 0.55, aim)); L.RS(Pp, 'foreArm', sd, L.lerp(-1.25, -0.6, aim), 0, 0); }
  },
  cast(Pp, u, ctx, L) {
    // STATIC BURST (its basic attack in battle): mic to the visor, right arm points, dish locks on, burst at 0.25,
    // mast whips back and rings out
    base(Pp, ctx.t, L);
    const aim = L.kf(u, [[0, 0], [0.16, 1], [0.7, 1], [1, 0]]), s = (u - 0.25) * DURS.cast;
    L.A(Pp, 'spine', 0, -Pp[BI.spine * 3 + 1] * aim, 0);
    aimDish(Pp, L, aim, -0.12);
    L.A(Pp, 'footL', -0.18 * dampOsc(s, 42, 8), 0, 0);
    L.A(Pp, 'thighL', 0.1 * aim * L.kf(u, [[0, 0], [0.22, 1], [0.26, 0]]) - 0.2 * dampOsc(s, 24, 4.5), 0, 0.05 * dampOsc(s, 17, 4.5));
    L.A(Pp, 'pelvis', -0.035 * Math.max(0, dampOsc(s, 18, 8)), 0, 0);
    L.RS(Pp, 'upArm', 'L', L.lerp(-0.45, -1.15, aim), L.lerp(0.1, -0.35, aim), L.lerp(0.3, 0.45, aim));
    L.RS(Pp, 'foreArm', 'L', L.lerp(-1.25, -2.15, aim), 0, 0);
    L.RS(Pp, 'hand', 'L', L.lerp(0.1, 0.5, aim), 0, 0);
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.45, -1.45, aim), 0.1, L.lerp(0.3, 0.15, aim));
    L.RS(Pp, 'foreArm', 'R', L.lerp(-1.25, -0.15, aim), 0, 0);
    L.A(Pp, 'neck', 0.12 * aim, 0, 0); L.A(Pp, 'head', 0.1 * aim, 0, 0.12 * aim);
  },
  overdrive(Pp, u, ctx, L) {
    // BLACKOUT: mast telescopes up (tick), dish spins up, arms thrown wide, burst at the release (0.167), spin down + retract
    base(Pp, ctx.t, L, 0);
    const wide = L.kf(u, [[0, 0], [0.12, 1], [0.78, 1], [0.95, 0]]), s = (u - OD_REL) * OD_DUR;
    L.R(Pp, 'spine', 0, 0, 0);
    L.R(Pp, 'shinL', 0, odSpin(u), 0);
    L.R(Pp, 'footL', L.lerp(REST_P, -0.25, wide), 0, 0);
    L.R(Pp, 'thighR', 0, -odSpin(u) * 1.3, 0);
    const buzz = 0.012 * Math.sin(u * 300) * L.kf(u, [[0, 0], [0.12, 1], [0.62, 1], [0.8, 0]]);
    L.R(Pp, 'thighL', -0.22 * dampOsc(s, 22, 3.5) + buzz, 0, 0.1 * dampOsc(s, 15, 3.5) + buzz);
    Pp[L.PX + 1] -= 0.03 * wide;
    L.A(Pp, 'pelvis', -0.05 * Math.max(0, dampOsc(s, 16, 5)), 0, 0.02 * Math.sin(u * 120) * wide);
    for (const sd of SIDES) {
      L.RS(Pp, 'upArm', sd, L.lerp(-0.45, -2.2, wide), 0, L.lerp(0.3, 0.75, wide));
      L.RS(Pp, 'foreArm', sd, L.lerp(-1.25, -0.4, wide), 0, 0);
      L.RS(Pp, 'hand', sd, -0.3 * wide, 0, 0);
    }
    L.A(Pp, 'neck', -0.15 * wide, 0, 0); L.A(Pp, 'head', -0.3 * wide, 0, 0);
  },
  hit(Pp, u, ctx, L) {
    base(Pp, ctx.t, L);
    const k = L.kf(u, [[0, 0], [0.1, 1], [1, 0]]), d = ctx.st.hitDir, s = u * DURS.hit;
    L.A(Pp, 'pelvis', -0.04 * k, 0, 0.07 * k * d);
    L.A(Pp, 'spine', 0, 0.2 * k * d, 0); L.A(Pp, 'head', -0.25 * k, 0, 0.25 * k * d);
    L.A(Pp, 'thighL', -0.1 * dampOsc(s, 28, 5), 0, 0.2 * d * dampOsc(s, 24, 4.5));
    L.A(Pp, 'footL', 0.3 * dampOsc(s, 36, 6), 0, 0);
    for (const sd of SIDES) L.AS(Pp, 'upArm', sd, 0.3 * k, 0, 0.3 * k);
  },
  die(Pp, u, ctx, L) {
    // sparks out: hull sags onto a broken track, torso slumps, mast topples sideways (down 0.55), dish droops
    base(Pp, ctx.t * (1 - u), L);
    const sag = L.kf(u, [[0, 0], [0.12, 0.3], [0.2, 0.1], [0.5, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.18, 0.04], [0.52, 1.0], [0.58, 0.9], [0.66, 0.97], [1, 0.96]]);
    Pp[L.PX + 1] -= 0.06 * sag;
    L.A(Pp, 'pelvis', 0.05 * sag, 0, -0.12 * sag);
    L.R(Pp, 'spine', 0.25 * sag, 0.35 * sag, -0.1 * sag); L.R(Pp, 'chest', 0.2 * sag, 0, 0);
    L.R(Pp, 'neck', 0.3 * sag, 0, 0); L.R(Pp, 'head', 0.45 * sag, 0, -0.3 * sag);
    for (const sd of SIDES) { L.RS(Pp, 'upArm', sd, L.lerp(-0.45, 0.25, sag), 0, L.lerp(0.3, 0.12, sag)); L.RS(Pp, 'foreArm', sd, L.lerp(-1.25, -0.35, sag), 0, 0); }
    L.R(Pp, 'thighL', 0.25 * fall, 0, -1.4 * fall);
    L.A(Pp, 'footL', 0.9 * sag, 0, 0);
  },
  victory(Pp, t, ctx, L) {
    // pirate broadcast party: hull rocks to the beat, torso twists, arms pump in turn, dish spins, beacons strobe
    base(Pp, t, L, 0);
    const k = L.smooth(Math.min(1, t / 0.5)), w = t * TAU * 1.1, beat = Math.max(0, Math.sin(w));
    Pp[L.PX + 1] += 0.015 * beat * k;
    L.A(Pp, 'pelvis', 0, 0, 0.05 * Math.sin(w / 2) * k);
    L.R(Pp, 'spine', 0, 0.3 * Math.sin(w / 2) * k, 0);
    L.R(Pp, 'shinL', 0, t * 2.2, 0);
    L.R(Pp, 'thighL', 0.04 * beat * k, 0, -0.06 * Math.sin(w / 2) * k);
    const pl = Math.max(0, Math.sin(w / 2)), pr = Math.max(0, -Math.sin(w / 2));
    L.RS(Pp, 'upArm', 'L', L.lerp(-0.45, -2.7 * pl - 0.6 * (1 - pl), k), 0, L.lerp(0.3, 0.35, k)); L.RS(Pp, 'foreArm', 'L', L.lerp(-1.25, -0.5, k), 0, 0);
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.45, -2.7 * pr - 0.6 * (1 - pr), k), 0, L.lerp(0.3, 0.35, k)); L.RS(Pp, 'foreArm', 'R', L.lerp(-1.25, -0.5, k), 0, 0);
    L.A(Pp, 'neck', 0.12 * beat * k, 0, 0);
  },
  deploy(Pp, u, ctx, L) {
    // drops with the mast stowed + dish folded, suspension bounce on landing (0.4), mast shoots up (tick), dish unfolds, head pops
    base(Pp, ctx.t, L, 0);
    const land = L.kf(u, [[0, 0], [0.4, 0], [0.44, 1], [0.52, -0.4], [0.6, 0.2], [0.7, 0], [1, 0]]);
    const fold = L.kf(u, [[0, 1], [0.66, 1], [0.84, 0], [1, 0]]);
    Pp[L.PX + 1] -= 0.05 * land;
    L.A(Pp, 'pelvis', 0.03 * land, 0, 0);
    L.R(Pp, 'footL', L.lerp(REST_P, 1.25, fold), 0, 0);
    L.R(Pp, 'shinL', 0, 0, 0);
    L.A(Pp, 'thighL', 0.12 * dampOsc((u - 0.72) * DURS.deploy, 22, 4), 0, 0);
    const head = L.kf(u, [[0, 1], [0.76, 1], [0.86, -0.3], [0.95, 0], [1, 0]]);
    L.A(Pp, 'spine', 0.2 * head, 0, 0); L.A(Pp, 'head', 0.4 * head, 0, 0);
    for (const sd of SIDES) L.AS(Pp, 'upArm', sd, 0.3 * head, 0, -0.15 * head);
  },
};

// mast extension (m) wanted per action phase; rank 4+ stands 0.2 higher
function mastExt(name, u) {
  switch (name) {
    case 'overdrive': return kf(u, [[0, 0], [0.03, 0], [0.13, 0.55], [0.17, 0.48], [0.8, 0.5], [0.95, 0]]);
    case 'deploy': return kf(u, [[0, -0.45], [0.58, -0.45], [0.7, 0.06], [0.76, -0.02], [0.82, 0]]);
    case 'die': return kf(u, [[0, 0], [0.3, 0], [0.5, -0.22], [1, -0.22]]);
    case 'cast': return kf(u, [[0, 0], [0.22, 0.06], [0.28, 0.0], [1, 0]]);
    default: return 0;
  }
}
// emitter core pulse (scale) per action phase
function emitter(name, u) {
  switch (name) {
    case 'cast': return kf(u, [[0, 1], [0.22, 1.8], [0.25, 2.6], [0.32, 1.1], [1, 1]]);
    case 'attack': return kf(u, [[0, 1], [0.28, 2], [0.32, 3], [0.4, 1], [1, 1]]);
    case 'attack_alt': return kf(u, [[0, 1], [0.27, 2], [0.3, 3], [0.38, 1.3], [0.47, 2.4], [0.52, 1], [1, 1]]);
    case 'overdrive': return kf(u, [[0, 1], [0.15, 3.5], [0.17, 5], [0.3, 2], [0.62, 2], [0.85, 1]]);
    case 'die': return kf(u, [[0, 1], [0.1, 2], [0.2, 0.3], [0.3, 1.5], [0.45, 0.001], [1, 0.001]]);
    default: return 1;
  }
}

export default {
  id: 'jammer', name: 'JAMMER', role: 'mage', faction: 'rogue', rarity: 'rare', realm: 'scifi',
  rig: 'tracked', dims: DIMS, height: 2.2, radius: 0.56, walkSpeed: 0.9, scheme: 'bold',
  style: { weapon: 'fists', tracked: true },
  // orange + black, off-white dish/markings, white-blue static glow (rogue); other factions keep their bold palette
  paint: { rogue: { paint: 0xd8541a, accent: 0x1f2126, trim: 0xe6e0d6 } },
  mats: {
    all: {
      paint: { rough: 0.4, coat: 0.4 },
      accent: { rough: 0.48, metal: 0.55, coat: 0.15 },
      metal: { color: 0x707782, rough: 0.38 },
      trim: { rough: 0.32 },
    },
    rogue: { glow: { color: 0xa8dcff } },
  },
  sockets: {
    muzzle: ['footR', [0, 0, 0.02]], muzzleL: ['thighR', [-0.15, 0.04, 0.12]],
    core: [0, 0.06, 0.2], head: [0, 0.08, 0.06], hand: ['handL', [0, -0.08, 0.09]], handL: ['handL', [0, -0.08, 0.09]],
  },
  events: {
    attack: [['fire', 0.32]], attack_alt: [['fire', 0.3], ['fire', 0.5]], cast: [['cast', 0.25]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.55]],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, off = ctx.rig.off, a = st.action, u = ctx.su, t = ctx.t;
    // mast telescope
    const base = unit.rank >= 4 ? 0.2 : 0;
    const e = (a ? mastExt(a, u) : 0) + base;
    ctx.ext = ctx.ext === undefined ? e : ctx.ext + (e - ctx.ext) * (1 - Math.exp(-dt * 30));
    bones[BI.shinL].position.y = off.shinL[1] + ctx.ext;
    // tread wheels roll with the treadmill speed (victory: shuffle back and forth)
    let v = ctx.move.v;
    if (st.loop === 'victory' && !a) v += 0.5 * Math.sin(t * TAU * 0.55);
    ctx.roll = ((ctx.roll || 0) + v * dt / WHEEL_R) % TAU;
    for (const n of ['aux0', 'aux1', 'aux2', 'aux3']) bones[BI[n]].rotation.x = ctx.roll;
    // emitter pulse + beacon strobe
    const pz = Math.max(0.001, (a ? emitter(a, u) : 1) * (unit.dead ? 0 : 1) * (1 + 0.08 * Math.sin(t * 23)));
    bones[BI.footR].scale.setScalar(pz);
    const fast = a === 'overdrive' || st.loop === 'victory';
    const on = (Math.sin(t * TAU * (fast ? 4 : 0.9)) > 0.2) && !unit.dead;
    bones[BI.shinR].scale.setScalar(on ? 1 : 0.001);
  },
  fxHints: { projectile: 'static', impact: 'static_burst', overdrive: 'blackout', color: 0xa8dcff },
  build,
};
