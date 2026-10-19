// SPARKPLUG, rogue back-alley tesla (common mage). Brief: docs/ROSTER.md `sparkplug`.
// Hunched scrap biped wired to a stolen substation: a rusty transformer backpack with two tall copper tesla coils (toroid caps,
// blue-white arcs jumping between them), jumper cables trailing from the pack to the floor, welding-goggle head sunk between
// the shoulders, copper-wound forearms and forked hand electrodes.
// VALUE: `accent` = black frame + soot, `paint` = rust-orange plates (pack, chest, shoulders, shins), `metal` = gunmetal joints,
// `trim` = copper coils / windings / electrodes, `glow` = blue-white electricity, `eye` = amber goggles.
// Rank tiers (ROSTER): R0 battered (left coil snapped short + taped, bare left shoulder) · R1 base · R2 third coil (centre, tallest)
//   · R3 constant idle arcs · R4 (beyond brief) coils stand taller + spark-gap horns on the head · R5 ball-lightning crown orb.
// Rarity: rare+ forearm capacitor cans · epic+ shoulder insulator stacks · legendary gold windings (kit gold trim).
// Bones: aux0 = backpack (on chest), aux2/aux3 = two arc sets between the coil tops (re-parented to aux0; flicker via scale in
// tick), aux1 = crown orb (re-parented to aux0, R5).
import { P, PS, plate, fin, discX, legs, LIB, kf, PI, BI } from '../kit.js';

const TAU = PI * 2;
const CX = 0.15, CY0 = 0.12, CH = 0.5;            // coil x, base y, height (aux0 local)
const DIMS = {
  thigh: 0.31, shin: 0.31, ankle: 0.09, hipX: 0.13, hipY: -0.04, spine: 0.12, chest: 0.22, neck: 0.2, headOff: 0.03,
  clavX: 0.08, clavY: 0.18, shoulder: 0.17, upArm: 0.28, foreArm: 0.28,
  aux0: [0, 0.08, -0.2], aux2: [0, CY0 + CH + 0.08, -0.02], aux3: [0, CY0 + CH + 0.08, -0.02], aux1: [0, CY0 + CH + 0.42, -0.02],
  parents: { aux1: 'aux0', aux2: 'aux0', aux3: 'aux0' },
};
const SIDES = ['L', 'R'];
const HUNCH = { spine: 0.22, chest: 0.16, neck: 0.3, head: -0.5 };

function side(b, s, fn) {
  const put = (g, bone, slot, p = [0, 0, 0], r = [0, 0, 0], sc) => s === 'L'
    ? b.add(g, bone + 'L', slot, p, r, sc) : b.add(g, bone + 'R', slot, [-p[0], p[1], p[2]], [r[0], -r[1], -r[2]], sc);
  fn(put);
}
function rivets(b, bone, pts, rot = [PI / 2, 0, 0]) { if (!b.far) for (const p of pts) b.add(b.cyl(0.01, 0.01, 0.014, 6), bone, 'metal', p, rot); }
// zig-zag bolt glyph (x-y plane)
const BOLT = [[0.012, 0.05], [-0.022, 0.0], [0.0, 0.0], [-0.014, -0.05], [0.024, 0.008], [0.002, 0.008]];
// jagged arc from a to b in the bone's frame, thin glow boxes
function arc(b, bone, a, c, n, amp, seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  const pts = [a];
  for (let i = 1; i < n; i++) {
    const u = i / n;
    pts.push([a[0] + (c[0] - a[0]) * u + r() * amp * 0.4, a[1] + (c[1] - a[1]) * u + r() * amp + Math.sin(u * PI) * amp * 0.6, a[2] + (c[2] - a[2]) * u + r() * amp]);
  }
  pts.push(c);
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
    const g = b.cyl(0.006, 0.006, L, 4);
    g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
    g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    b.add(g, bone, 'glow');
  }
}

function coil(b, x, z, h, o, broken = false) {
  const far = b.far, bn = 'aux0';
  b.add(b.cyl(0.055, 0.065, 0.06, 12), bn, 'accent', [x, CY0, z]);
  b.add(b.cyl(0.042, 0.042, h, 12), bn, 'metal', [x, CY0 + h / 2, z]);
  b.add(b.cyl(0.05, 0.05, h * 0.78, 14), bn, 'trim', [x, CY0 + h * 0.46, z]);
  if (!far) for (let i = 0; i < 9; i++) b.add(b.tor(0.052, 0.005, 14, 3), bn, 'accent', [x, CY0 + 0.07 + i * h * 0.085, z], [PI / 2, 0, 0]);
  if (broken) {
    // snapped coil: jagged top, tape wrap, no toroid
    b.add(fin(b, [[-0.04, 0], [0.04, 0], [0.03, 0.04], [0.01, 0.015], [-0.01, 0.05], [-0.03, 0.02]], 0.08, 0.004), bn, 'metal', [x, CY0 + h, z], [0, 0, 0]);
    b.add(b.cyl(0.056, 0.056, 0.05, 12), bn, 'accent', [x, CY0 + h * 0.6, z], [0.1, 0, 0.05]);
    return;
  }
  b.add(b.cyl(0.02, 0.02, 0.08, 8), bn, 'metal', [x, CY0 + h + 0.03, z]);
  b.add(b.tor(0.075, 0.032, 18, 8), bn, 'metal', [x, CY0 + h + 0.07, z], [PI / 2, 0, 0]);
  b.add(b.tor(0.058, 0.008, 18, 4), bn, 'glow', [x, CY0 + h + 0.045, z], [PI / 2, 0, 0]);
  b.add(b.sph(10, 8), bn, 'glow', [x, CY0 + h + 0.1, z], [0, 0, 0], 0.022);
}

function pack(b, o) {
  const far = b.far, rk = o.rank, bn = 'aux0', hx = rk >= 4 ? 0.12 : 0;
  // transformer box: rusty orange shell, dark fins, warning bolt, straps
  P(b, bn, 'paint', [0.4, 0.3, 0.2], [0, 0.0, 0], [0, 0, 0], { c: 0.03, tx: 0.92 });
  P(b, bn, 'accent', [0.36, 0.06, 0.18], [0, 0.17, 0], [0, 0, 0], { c: 0.015 });
  if (!far) for (let i = 0; i < 5; i++) b.add(b.box(0.36, 0.02, 0.03), bn, 'accent', [0, -0.11 + i * 0.05, -0.11]);
  b.add(fin(b, BOLT, 0.008, 0.001), bn, 'glow', [0.1, 0.02, 0.105], [0, 0, 0], 1.3);
  b.add(b.cbox(0.11, 0.12, 0.006, 0.01), bn, 'accent', [0.1, 0.02, 0.1]);
  for (const sx of [1, -1]) b.add(b.cbox(0.04, 0.34, 0.03, 0.008), bn, 'accent', [sx * 0.13, 0.0, 0.11]);
  rivets(b, bn, [[-0.17, 0.12, 0.105], [0.17, 0.12, 0.105], [-0.17, -0.12, 0.105], [0.17, -0.12, 0.105]]);
  // bushings + dials on top
  for (const sx of [1, -1]) b.add(b.cyl(0.035, 0.04, 0.06, 10), bn, 'metal', [sx * 0.06, 0.21, 0.06]);
  b.add(b.cyl(0.03, 0.03, 0.02, 12), bn, 'trim', [-0.13, 0.17, 0.095], [PI / 2, 0, 0]);
  // coils (R0: left snapped); R2 third coil, R4 taller
  coil(b, CX, 0, CH + hx, o, rk === 0);
  coil(b, -CX, 0, CH + hx, o);
  if (rk >= 2) coil(b, 0, -0.07, CH + 0.16 + hx, o);
  // arcs between the coil tops (two variants flickered in tick); R2+: also up to the centre coil
  const yT = CY0 + CH + hx + 0.08, A = [CX - 0.06, 0, 0.02], B = [-CX + 0.06, 0, 0.02];
  const base = [0, -yT + (CY0 + CH + 0.08), 0.02];  // aux2/aux3 sit at the nominal coil-top height
  const off = (p) => [p[0], p[1] + yT - (CY0 + CH + 0.08) - base[1] + base[1], p[2]];
  arc(b, 'aux2', off(A), off(B), 6, 0.05, 11);
  arc(b, 'aux3', off(A), off(B), 7, 0.06, 977);
  if (rk >= 2) { arc(b, 'aux2', off([-CX + 0.04, 0, 0]), off([0, 0.16, -0.08]), 4, 0.04, 31); arc(b, 'aux3', off([CX - 0.04, 0, 0]), off([0, 0.16, -0.08]), 4, 0.04, 53); }
  // crown orb (R5)
  if (rk >= 5) {
    b.add(b.sph(14, 10), 'aux1', 'glow', [0, 0, 0], [0, 0, 0], 0.06);
    b.add(b.tor(0.11, 0.006, 24, 4), 'aux1', 'glow', [0, 0, 0], [PI / 2 + 0.3, 0, 0]);
    b.add(b.tor(0.14, 0.005, 24, 4), 'aux1', 'trim', [0, 0, 0], [PI / 2 - 0.4, 0.5, 0]);
  }
  // jumper cables: pack -> floor behind (pelvis-held), red + black clamps on the floor
  {
    const W = b.rig.world, pl = W.pelvis;
    const pb = W.aux0;
    const tube = (pts, r) => b.tube(pts.map((p) => [p[0] - pl[0], p[1] - pl[1], p[2] - pl[2]]), r, far ? 8 : 16, 5);
    for (const [sx, slot] of [[1, 'paint'], [-1, 'accent']]) {
      const p0 = [pb[0] + sx * 0.12, pb[1] - 0.16, pb[2] - 0.06];
      const end = [sx * 0.22, 0.02, -0.62];
      b.add(tube([p0, [sx * 0.16, pb[1] - 0.45, pb[2] - 0.2], [sx * 0.2, 0.25, -0.5], [sx * 0.21, 0.04, -0.58], end], 0.016), 'pelvis', 'accent');
      b.scope([end[0] - pl[0], end[1] - pl[1], end[2] - pl[2] - 0.05], [0, sx * 0.4, 0], 1, () => {
        b.add(b.cbox(0.05, 0.03, 0.1, 0.01), 'pelvis', slot, [0, 0, 0]);
        b.add(b.cbox(0.045, 0.012, 0.06, 0.004), 'pelvis', 'trim', [0, 0.02, -0.04], [0.25, 0, 0]);
        b.add(b.cbox(0.045, 0.012, 0.06, 0.004), 'pelvis', 'trim', [0, -0.012, -0.04], [-0.1, 0, 0]);
      });
    }
  }
}

function head(b, o) {
  const y = 0.05, z = 0.1, rk = o.rank;
  b.add(b.rbox(0.19, 0.15, 0.19, 0.04), 'head', 'accent', [0, y, z - 0.02]);
  P(b, 'head', 'paint', [0.2, 0.05, 0.17], [0, y + 0.08, z - 0.02], [0.1, 0, 0], { c: 0.015, tx: 0.82 });
  // welding goggles: strap, two lens cans, amber lenses
  b.add(b.tor(0.1, 0.012, 14, 4), 'head', 'metal', [0, y + 0.02, z - 0.02], [PI / 2, 0, 0]);
  for (const x of [0.045, -0.045]) {
    b.add(b.cyl(0.036, 0.04, 0.05, 12), 'head', 'metal', [x, y + 0.02, z + 0.085], [PI / 2, 0, 0]);
    b.add(b.cyl(0.027, 0.027, 0.02, 12), 'head', 'eye', [x, y + 0.02, z + 0.11], [PI / 2, 0, 0]);
  }
  // jaw grille + respirator can
  b.add(b.cbox(0.12, 0.05, 0.05, 0.012), 'head', 'metal', [0, y - 0.05, z + 0.07]);
  if (!b.far) for (let i = 0; i < 4; i++) b.add(b.box(0.012, 0.035, 0.012), 'head', 'trim', [-0.03 + i * 0.02, y - 0.05, z + 0.097]);
  b.add(b.cyl(0.03, 0.03, 0.06, 10), 'head', 'accent', [0.07, y - 0.06, z + 0.06], [PI / 2, 0, 0.3]);
  // R4+: spark-gap horns
  if (rk >= 4) for (const sx of [1, -1]) {
    b.add(b.cyl(0.006, 0.01, 0.22, 6), 'head', 'trim', [sx * 0.07, y + 0.17, z - 0.06], [0, 0, -sx * 0.45]);
    b.add(b.sph(8, 6), 'head', 'glow', [sx * 0.12, y + 0.27, z - 0.06], [0, 0, 0], 0.018);
  }
  b.add(b.cyl(0.05, 0.06, 0.1, 10), 'neck', 'metal', [0, -0.04, 0.0]);
}

function torso(b, o) {
  const far = b.far;
  // hunched rusty chest: frame, orange chest plate with a bolt glyph, belly transformer windings
  P(b, 'chest', 'accent', [0.36, 0.28, 0.28], [0, 0.1, -0.01], [0, 0, 0], { c: 0.04, tx: 1.05, bx: 0.85 });
  P(b, 'chest', 'paint', [0.32, 0.2, 0.06], [0, 0.12, 0.14], [0.2, 0, 0], { c: 0.02, tx: 1.1, bx: 0.85 });
  b.add(fin(b, BOLT, 0.008, 0.001), 'chest', 'glow', [-0.07, 0.13, 0.18], [0.2, 0, 0], 1.0);
  rivets(b, 'chest', [[0.12, 0.2, 0.17], [-0.12, 0.2, 0.17]], [PI / 2 + 0.2, 0, 0]);
  b.add(b.cyl(0.12, 0.13, 0.15, 12), 'spine', 'metal', [0, 0.04, 0]);
  if (!far) for (let i = 0; i < 4; i++) b.add(b.tor(0.13, 0.01, 16, 4), 'spine', 'trim', [0, -0.01 + i * 0.03, 0], [PI / 2, 0, 0]);
  // pelvis + loin plates
  P(b, 'pelvis', 'accent', [0.3, 0.13, 0.22], [0, -0.01, 0], [0, 0, 0], { c: 0.03 });
  P(b, 'pelvis', 'paint', [0.16, 0.14, 0.05], [0, -0.08, 0.12], [-0.12, 0, 0], { c: 0.015, bx: 0.7 });
  // pack harness
  for (const sx of [1, -1]) b.add(b.cbox(0.04, 0.3, 0.03, 0.008), 'chest', 'accent', [sx * 0.1, 0.12, 0.15], [0.2, 0, 0]);
}

function armSide(b, o, s) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm, far = b.far, bare = s === 'L' && o.rank === 0;
  side(b, s, (put) => {
    put(b.cyl(0.045, 0.045, D.shoulder, 8), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
    put(b.sph(12, 8), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.075);
    put(b.cyl(0.04, 0.035, ua, 8), 'upArm', 'metal', [0, -ua / 2, 0]);
    if (!bare) {
      put(b.sph(14, 8, 0, TAU, 0, PI * 0.5), 'upArm', 'paint', [0.02, 0.02, 0], [0, 0, -0.3], [0.13, 0.11, 0.13]);
      put(plate(b, 0.17, 0.04, 0.2, { c: 0.012, tx: 0.9 }), 'upArm', 'accent', [0.05, -0.06, 0], [0, 0, -0.38]);
    } else rivets(b, 'upArmL', [[0.05, 0.02, 0.05], [0.05, 0.02, -0.05]], [0, 0, PI / 2]);
    put(plate(b, 0.09, ua * 0.5, 0.09, { c: 0.012 }), 'upArm', 'accent', [0.01, -ua * 0.55, 0]);
    // forearm: dark block wound with copper, a glow strip, cable to the elbow
    put(discX(b, 0.045, 0.1, 10), 'foreArm', 'metal', [0, 0, 0]);
    put(plate(b, 0.12, fa * 0.75, 0.12, { c: 0.02, tx: 0.85, tz: 0.85 }), 'foreArm', 'accent', [0, -fa * 0.5, 0]);
    put(b.cyl(0.07, 0.07, fa * 0.4, 12), 'foreArm', 'trim', [0, -fa * 0.55, 0]);
    if (!far) for (let i = 0; i < 4; i++) put(b.tor(0.071, 0.005, 12, 3), 'foreArm', 'accent', [0, -fa * 0.38 - i * fa * 0.1, 0], [PI / 2, 0, 0]);
    put(b.cbox(0.015, fa * 0.35, 0.015, 0.004), 'foreArm', 'glow', [0.07, -fa * 0.55, 0.03]);
    if (o.r >= 1) { put(b.cyl(0.03, 0.03, 0.1, 10), 'foreArm', 'metal', [-0.07, -fa * 0.45, -0.04]); put(b.cyl(0.031, 0.031, 0.02, 10), 'foreArm', 'paint', [-0.07, -fa * 0.4, -0.04]); }
    // hand: clamp grip + forked copper electrode, glowing tips (oversized so they read at battle size)
    put(b.cbox(0.09, 0.08, 0.09, 0.016), 'hand', 'metal', [0, -0.04, 0]);
    put(b.cyl(0.02, 0.026, 0.17, 8), 'hand', 'trim', [0, -0.16, 0.01]);
    put(b.cyl(0.04, 0.04, 0.025, 10), 'hand', 'accent', [0, -0.09, 0.01]);
    for (let i = 0; i < 3; i++) put(b.tor(0.028, 0.006, 10, 3), 'hand', 'trim', [0, -0.13 - i * 0.03, 0.01], [PI / 2, 0, 0]);
    for (const zz of [0.045, -0.025]) {
      put(b.cyl(0.009, 0.012, 0.12, 6), 'hand', 'trim', [0, -0.29, zz], [zz > 0 ? 0.25 : -0.25, 0, 0]);
      put(b.sph(8, 6), 'hand', 'glow', [0, -0.35, zz + (zz > 0 ? 0.016 : -0.016)], [0, 0, 0], 0.02);
    }
  });
  // short jumper cable from each forearm back to the pack side
  if (!far) side(b, s, (put) => put(b.tube([[0.05, -0.05, -0.05], [0.09, 0.05, -0.1], [0.06, 0.18, -0.08]], 0.011, 8, 4), 'upArm', 'accent'));
  // epic+: insulator stack on the shoulder
  if (o.r >= 2) side(b, s, (put) => { for (let i = 0; i < 3; i++) put(b.cyl(0.04 - i * 0.008, 0.045 - i * 0.008, 0.02, 12), 'clav', i % 2 ? 'metal' : 'trim', [D.shoulder * 0.7, 0.06 + i * 0.025, -0.02]); });
}

function build(b, o) {
  torso(b, o);
  head(b, o);
  pack(b, o);
  for (const s of SIDES) armSide(b, o, s);
  legs(b, o, { w: 0.82, foot: 'wide', thighSlot: 'accent', shellSlot: 'metal', shinPlateSlot: 'paint', kneeSlot: 'paint', footSlot: 'accent', outerSlot: 'metal', heelSlot: 'metal' });
  b.sym(b.tor(0.06, 0.006, 12, 3), 'shin', 'trim', [0, -0.12, 0.0], [PI / 2, 0, 0]);
  if (!b.far && o.faction === 'rogue') b.sym(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.09]], 0.025, 0.005), 'upArm', 'metal', [0.08, 0.1, 0], [0, 0, -0.5]);
}

// ---------------- anims ----------------
function hunch(Pp, k = 1) {
  LIB.A(Pp, 'spine', HUNCH.spine * k, 0, 0); LIB.A(Pp, 'chest', HUNCH.chest * k, 0, 0);
  LIB.A(Pp, 'neck', HUNCH.neck * k, 0, 0); LIB.A(Pp, 'head', HUNCH.head * k, 0, 0);
}
// electrodes held forward at the waist, prongs pointing ahead
function ready(Pp, t = 0, k = 1) {
  for (const s of SIDES) {
    const ph = s === 'L' ? 0 : 1.9, tw = Math.sin(t * 1.7 + ph);
    LIB.RS(Pp, 'clav', s, 0, 0, 0.03 * tw);
    LIB.RS(Pp, 'upArm', s, -0.45 * k + 0.04 * tw, 0.15, 0.32);
    LIB.RS(Pp, 'foreArm', s, -1.0 * k, -0.25, 0);
    LIB.RS(Pp, 'hand', s, -0.35, 0, 0);
  }
}
function stance(Pp, ctx, t) {
  LIB.idle(Pp, ctx, t);
  hunch(Pp);
  Pp[LIB.PX + 1] -= 0.03;
  ready(Pp, t);
}
// arm reach: k 0 ready, 1 thrust forward (prongs at the target), -1 pulled back to the coils
function reach(Pp, L, s, k) {
  const f = Math.max(0, k), b = Math.max(0, -k);
  L.RS(Pp, 'upArm', s, -0.45 - 0.95 * f + 0.55 * b, 0.15 - 0.1 * f + 0.3 * b, 0.32 - 0.15 * f + 0.25 * b);
  L.RS(Pp, 'foreArm', s, -1.0 + 0.75 * f - 0.9 * b, -0.25 + 0.2 * f, 0);
  L.RS(Pp, 'hand', s, -0.35 - 0.6 * f + 0.2 * b, 0, 0);
}

const OD_DUR = 2.2, OD_REL = 0.4 / OD_DUR;
const DURS = { attack: 0.9, attack_alt: 1.0, cast: 1.1, overdrive: OD_DUR, hit: 0.4, die: 2.0, deploy: 1.5 };
const anims = {
  idle(Pp, t, ctx, L) {
    stance(Pp, ctx, t);
    // twitchy: every ~4.4 s a self-zap spasm (shoulders jerk, head tic), otherwise rubs the electrodes together
    const c = t % 4.4, z = L.kf(c, [[0, 0], [3.2, 0], [3.25, 1], [3.5, 0.7], [3.55, 1], [3.9, 0]]);
    const jit = Math.sin(t * 70) * z;
    L.A(Pp, 'chest', -0.12 * z, 0.08 * jit, 0.06 * jit); L.A(Pp, 'head', -0.25 * z, 0.2 * jit, 0.15 * jit);
    for (const s of SIDES) L.AS(Pp, 'upArm', s, -0.2 * z, 0, 0.35 * z);
    const rub = (1 - z) * Math.sin(t * 5);
    L.AS(Pp, 'foreArm', 'L', 0, 0.12 * rub, 0); L.AS(Pp, 'foreArm', 'R', 0, -0.12 * rub, 0);
    L.plant(Pp, ctx, 0.08, -0.08, 1.05);
  },
  advance(Pp, t, ctx, L) {
    L.gait(Pp, ctx);
    hunch(Pp, 1.15);
    const ph = ctx.move.phase * TAU, sw = Math.sin(ph);
    ready(Pp, t, 0.9);
    L.A(Pp, 'chest', 0, 0.1 * sw, 0.04 * sw);
    L.A(Pp, 'head', 0, -0.08 * sw, 0);
  },
  attack(Pp, u, ctx, L) {
    // jab: right electrode lunges forward, zap at 0.36, recoil
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.22, -0.6], [0.36, 1], [0.55, 0.9], [1, 0]]);
    reach(Pp, L, 'R', k);
    reach(Pp, L, 'L', -0.3 * Math.max(0, k));
    L.A(Pp, 'chest', 0.08 * Math.max(0, k), -0.3 * k, 0); L.A(Pp, 'spine', 0, -0.15 * k, 0);
    Pp[L.PX + 2] += 0.06 * Math.max(0, k);
    L.plant(Pp, ctx, 0.14, -0.12, 1.15);
  },
  attack_alt(Pp, u, ctx, L) {
    // one-two: left zap 0.32, right zap 0.46
    stance(Pp, ctx, ctx.t);
    const l = L.kf(u, [[0, 0], [0.2, -0.5], [0.32, 1], [0.5, 0.2], [1, 0]]), r = L.kf(u, [[0, 0], [0.3, -0.5], [0.46, 1], [0.66, 0.7], [1, 0]]);
    reach(Pp, L, 'L', l); reach(Pp, L, 'R', r);
    L.A(Pp, 'chest', 0, 0.25 * (l - r), 0);
    L.plant(Pp, ctx, 0.12, -0.1, 1.15);
  },
  cast(Pp, u, ctx, L) {
    // ARC ZAP (its basic in battle): both electrodes pulled back to the coils to charge (arcs jump), then thrust (fire 0.42)
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.26, -1], [0.34, -1], [0.42, 1], [0.66, 0.85], [1, 0]]);
    const jit = Math.sin(u * 140) * L.kf(u, [[0, 0], [0.2, 1], [0.38, 1], [0.42, 0]]);
    reach(Pp, L, 'L', k); reach(Pp, L, 'R', k);
    L.A(Pp, 'chest', -0.15 * Math.max(0, -k) + 0.1 * Math.max(0, k) + 0.03 * jit, 0.04 * jit, 0);
    L.A(Pp, 'head', -0.2 * Math.max(0, -k) + 0.1 * jit, 0, 0);
    Pp[L.PX + 2] += 0.05 * Math.max(0, k);
    L.plant(Pp, ctx, 0.16, -0.14, 1.2);
  },
  overdrive(Pp, u, ctx, L) {
    // ARC SURGE: wide stance, arms flung overhead (coils arc wildly), slam both electrodes forward at the release (0.18),
    // hold them out shaking while the chain jumps, stagger back
    stance(Pp, ctx, ctx.t);
    const up = L.kf(u, [[0, 0], [0.12, 1], [0.15, 1], [0.18, 0], [1, 0]]);
    const out = L.kf(u, [[0, 0], [0.15, 0], [0.18, 1], [0.7, 1], [0.85, 0], [1, 0]]);
    const shake = Math.sin(u * 260) * out;
    for (const s of SIDES) {
      L.RS(Pp, 'upArm', s, L.lerp(-0.45, -2.9, up) - 1.1 * out + 0.05 * shake, 0.1, L.lerp(0.32, 0.55, up) - 0.1 * out);
      L.RS(Pp, 'foreArm', s, L.lerp(-1.0, -0.3, up) + 0.6 * out, -0.1, 0);
      L.RS(Pp, 'hand', s, -0.9 * out, 0, 0);
    }
    L.A(Pp, 'spine', -0.35 * up + 0.12 * out, 0, 0); L.A(Pp, 'chest', -0.25 * up + 0.1 * out + 0.03 * shake, 0.04 * shake, 0);
    L.A(Pp, 'head', -0.35 * up + 0.2 * out, 0, 0);
    Pp[L.PX + 1] += 0.04 * up - 0.12 * out; Pp[L.PX + 2] += 0.08 * out - 0.1 * L.kf(u, [[0.7, 0], [0.85, 1], [1, 0]]);
    L.plant(Pp, ctx, 0.2, -0.2, 1.5);
  },
  hit(Pp, u, ctx, L) {
    stance(Pp, ctx, ctx.t);
    const k = L.kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir, jit = Math.sin(u * 90) * k;
    Pp[L.PX + 2] -= 0.06 * k;
    L.A(Pp, 'spine', -0.2 * k, 0.1 * k * d, 0); L.A(Pp, 'chest', -0.15 * k + 0.05 * jit, 0.08 * jit, 0);
    L.A(Pp, 'head', -0.3 * k, -0.2 * k * d, 0.2 * k * d);
    for (const s of SIDES) L.AS(Pp, 'upArm', s, -0.3 * k, 0, 0.4 * k);
    L.plant(Pp, ctx, 0.06, -0.1, 1.05);
  },
  die(Pp, u, ctx, L) {
    // overload: violent spasm, knees buckle, slumps forward onto the floor
    stance(Pp, ctx, ctx.t);
    const sp = L.kf(u, [[0, 0], [0.05, 1], [0.32, 1], [0.38, 0]]), jit = Math.sin(u * 160) * sp;
    const kneel = L.kf(u, [[0, 0], [0.3, 0], [0.52, 1], [1, 1]]);
    const fall = L.kf(u, [[0, 0], [0.5, 0], [0.62, 0.3], [0.82, 1], [0.88, 0.92], [1, 0.95]]);
    L.A(Pp, 'chest', -0.3 * sp + 0.1 * jit, 0.2 * jit, 0.1 * jit); L.A(Pp, 'head', -0.5 * sp + 0.2 * jit + 0.4 * fall, 0.3 * jit, 0);
    for (const s of SIDES) { L.AS(Pp, 'upArm', s, -0.6 * sp + 0.15 * jit + 0.3 * fall, 0, 0.6 * sp); L.AS(Pp, 'foreArm', s, 0.5 * sp + 0.4 * kneel, 0, 0); }
    Pp[L.PX + 1] -= 0.36 * kneel + 0.2 * fall; Pp[L.PX + 2] += 0.12 * kneel + 0.25 * fall;
    L.A(Pp, 'pelvis', 1.1 * fall, 0, 0);
    L.A(Pp, 'spine', 0.2 * kneel, 0, 0);
    if (fall < 0.5) L.plant(Pp, ctx, 0.12 * kneel + 0.05, -0.2 * kneel - 0.05, 1.15, 0, 0.6 * kneel);
    else for (const s of SIDES) {
      const i = BI['thigh' + s] * 3, j = BI['shin' + s] * 3, f = BI['foot' + s] * 3;
      Pp[i] = -0.3 - 0.9 * fall; Pp[i + 2] = (s === 'L' ? 1 : -1) * 0.12; Pp[j] = 0.6 + 0.6 * fall; Pp[f] = 0.6;
    }
  },
  victory(Pp, t, ctx, L) {
    // fists of lightning: electrodes raised alternately, a crackling little jig
    stance(Pp, ctx, t);
    const k = L.smooth(Math.min(1, t / 0.5)), w = t * TAU * 0.9, l = Math.max(0, Math.sin(w)), r = Math.max(0, -Math.sin(w));
    L.RS(Pp, 'upArm', 'L', L.lerp(-0.45, -2.6 * l - 1.2 * (1 - l), k), 0.1, 0.45); L.RS(Pp, 'foreArm', 'L', L.lerp(-1.0, -0.5, k), 0, 0);
    L.RS(Pp, 'upArm', 'R', L.lerp(-0.45, -2.6 * r - 1.2 * (1 - r), k), 0.1, 0.45); L.RS(Pp, 'foreArm', 'R', L.lerp(-1.0, -0.5, k), 0, 0);
    L.A(Pp, 'chest', -0.2 * k, 0.2 * Math.sin(w) * k, 0); L.A(Pp, 'head', -0.25 * k, 0, 0.12 * Math.sin(w) * k);
    Pp[L.PX + 1] += 0.03 * Math.abs(Math.sin(w)) * k;
    L.plant(Pp, ctx, 0.1, -0.1, 1.1);
  },
  deploy(Pp, u, ctx, L) {
    // lands in a crouch (0.4), electrodes on the floor, then straightens and sparks them together
    stance(Pp, ctx, ctx.t);
    const land = L.kf(u, [[0, 0], [0.34, 0], [0.42, 1], [0.68, 0.9], [0.86, 0], [1, 0]]);
    const clap = L.kf(u, [[0, 0], [0.82, 0], [0.9, 1], [1, 0]]);
    Pp[L.PX + 1] -= 0.28 * land;
    L.A(Pp, 'spine', 0.35 * land, 0, 0); L.A(Pp, 'head', -0.3 * land, 0, 0);
    for (const s of SIDES) {
      L.AS(Pp, 'upArm', s, 0.3 * land - 0.6 * clap, 0, 0.25 * land - 0.3 * clap);
      L.AS(Pp, 'foreArm', s, 0.6 * land + 0.3 * clap, 0.25 * clap, 0);
    }
    L.plant(Pp, ctx, 0.2 * land + 0.08, -0.22 * land - 0.06, 1 + 0.35 * land, 0, 0.5 * land);
  },
};

// how lively the coil arcs are per action phase (0 = off, 1 = full flicker)
function arcK(name, u, rank) {
  const idle = rank >= 3 ? 0.55 : 0;
  switch (name) {
    case 'cast': return kf(u, [[0, idle], [0.12, 1], [0.42, 1], [0.6, 0.6], [1, idle]]);
    case 'overdrive': return kf(u, [[0, 0.7], [0.05, 1], [0.8, 1], [1, idle]]);
    case 'attack': case 'attack_alt': return kf(u, [[0, idle], [0.2, 0.8], [0.5, 0.8], [1, idle]]);
    case 'die': return kf(u, [[0, 1], [0.35, 1], [0.42, 0.2], [0.5, 0.6], [0.6, 0]]);
    case 'deploy': return kf(u, [[0, 0], [0.86, 0], [0.9, 1], [1, idle]]);
    case 'hit': return 0.9;
    case 'victory': return 0.8;
    case 'idle': { const c = u % 4.4; return Math.max(idle, kf(c, [[0, 0], [3.2, 0], [3.25, 1], [3.9, 0.4], [4.0, 0]])); }
    default: return idle;
  }
}

export default {
  id: 'sparkplug', name: 'SPARKPLUG', role: 'mage', faction: 'rogue', rarity: 'common', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 1.62, radius: 0.5, walkSpeed: 1.0, cadence: 1.0, scheme: 'bold',
  style: { weapon: 'fists', heavy: 0.3, stance: 1.15 },
  // rust + orange, copper coils, blue-white electricity, amber goggles (rogue); other factions keep their bold palette
  paint: { rogue: { paint: 0xb8501f, accent: 0x26221f, trim: 0xc8783a, glow: 0x9fd8ff, eye: 0xffa030 } },
  mats: {
    all: {
      paint: { rough: 0.55, coat: 0.15, detail: { map: 'grime', scale: 2.4, albedo: 0.7, rough: 0.5, scratch: 0.3 } },
      accent: { rough: 0.55, metal: 0.5, coat: 0.1 },
      metal: { color: 0x666c75, rough: 0.4 },
      trim: { metal: 0.9, rough: 0.3 },
    },
    rogue: { glow: { color: 0x9fd8ff } },
  },
  sockets: {
    muzzle: ['handR', [0, -0.36, 0.01]], muzzleL: ['handL', [0, -0.36, 0.01]],
    core: [0, 0.12, 0.2], head: [0, 0.08, 0.12], hand: ['handR', [0, -0.36, 0.01]], handL: ['handL', [0, -0.36, 0.01]],
  },
  events: {
    attack: [['fire', 0.36]], attack_alt: [['fire', 0.32], ['fire', 0.46]], cast: [['fire', 0.42]],
    overdrive: [['cast', 0.04], ['fire', OD_REL]], die: [['down', 0.8]],
  },
  durs: DURS,
  anims,
  post(Pp, ctx, act) { ctx.su = act ? Math.min(1, act.t / act.dur) : 0; },
  tick(unit, dt, ctx, bones) {
    const st = unit.state, a = st.action, t = ctx.t;
    const k = unit.dead ? 0 : arcK(a || st.loop, a ? ctx.su : t, unit.rank);
    // arcs: re-roll every ~50 ms; a set shows with probability k, flips for variety
    ctx.at = (ctx.at || 0) - dt;
    if (ctx.at <= 0) {
      ctx.at = 0.03 + Math.random() * 0.05;
      ctx.a2 = Math.random() < k ? (Math.random() < 0.5 ? 1 : -1) : 0;
      ctx.a3 = Math.random() < k * 0.8 ? (Math.random() < 0.5 ? 1 : -1) : 0;
    }
    const s2 = ctx.a2 || 0, s3 = ctx.a3 || 0;
    bones[BI.aux2].scale.set(s2 ? 1 : 0.001, s2 ? 0.8 + 0.4 * Math.random() : 0.001, s2 ? s2 : 0.001);
    bones[BI.aux3].scale.set(s3 ? -1 : 0.001, s3 ? 0.8 + 0.4 * Math.random() : 0.001, s3 ? s3 : 0.001);
    // crown orb bobs + spins (R5)
    const o = bones[BI.aux1];
    o.position.y = ctx.D.aux1[1] + 0.04 * Math.sin(t * 2.1);
    o.rotation.y = t * 2.5;
    o.scale.setScalar(unit.dead ? 0.001 : 1 + 0.1 * Math.sin(t * 17) + (a === 'overdrive' ? 0.4 : 0));
  },
  fxHints: { projectile: 'arc', impact: 'shock', overdrive: 'chain_lightning', color: 0x9fd8ff },
  build,
};
