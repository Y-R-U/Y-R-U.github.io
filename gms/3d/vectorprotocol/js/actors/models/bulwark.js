// BULWARK, corporate siege guard (EXEMPLAR: copy its structure). Brief: docs/ROSTER.md `bulwark`; look: refs/ref_battle_02.png player front.
// Hunched gorilla-heavy, huge domed pauldrons, small head sunk low between them, long arms with big fists,
// tower shield taller than the torso on the left forearm (yellow-orange chevrons + cyan core slit).
//
// VALUE STRUCTURE (the most important lesson): `accent` = dark gunmetal armour (most of the surface), `paint` = saturated
// blue panels on the big read-shapes only (domes, chest plate, brow, shin fronts, shield face), `metal` = bare brushed joints,
// pistons and greebles, `trim` = warm orange markers/chevrons (slightly emissive), `glow`/`eye` = cyan lights.
//
// Rank ladder (o.rank, default from rarity: common 0 · rare 1 · epic 2 · legendary 3):
//   R0 battered (kit grime) · R1 base · R2 extra shoulder plates + back vents + brow crest · R3 shield edge light, shoulder
//   cores, glowing exhausts · R4 hex hardlight projector, cyan rim strips, crest fins · R5 hardlight banner + halo crown.
import { P, PS, plate, fin, discX, legs, poseFrame, PI } from '../kit.js';

const DIMS = {
  thigh: 0.38, shin: 0.38, ankle: 0.14, hipX: 0.22, hipY: -0.06, spine: 0.14, chest: 0.3, neck: 0.22, headOff: 0.02,
  clavX: 0.1, clavY: 0.24, shoulder: 0.36, upArm: 0.36, foreArm: 0.36, aux0: [0, 0.22, -0.3],
};
// Hunch added on top of every anim (post). The shield is authored for the idle hold pose including this hunch.
const HUNCH = { spine: 0.16, chest: 0.14, neck: -0.12, head: -0.16 };
const SHIELD_POSE = { pelvis: [0.04, 0, 0], spine: [0.04 + HUNCH.spine, 0, 0], chest: [0.02 + HUNCH.chest, 0, 0], upArmL: [-0.35, 0, 0.3], foreArmL: [-1.2, 0, 0] };

// ---------- small reusable greebles ----------
// mirrored round lamp: metal bezel + emissive lens (the ref's dotted armour lights)
function lamp(b, bone, pos, rot, r = 0.03, slot = 'glow', mirror = true) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cyl(r * 1.4, r * 1.4, 0.022, 14), bone, 'metal', pos, rot);
  put(b.cyl(r, r, 0.032, 14), bone, slot, pos, rot);
}
// vent grille: n slats on a dark frame
function vent(b, bone, pos, rot, w, h, n = 4, mirror = false) {
  const put = mirror ? b.sym.bind(b) : b.add.bind(b);
  put(b.cbox(w, h, 0.03, 0.008), bone, 'accent', pos, rot);
  if (b.far) return;
  b.scope(pos, rot, 1, () => { for (let i = 0; i < n; i++) put(b.cbox(w * 0.86, h / (n * 2.2), 0.04, 0.003), bone, 'metal', [0, -h / 2 + (i + 0.5) * h / n, 0.012]); });
}
// telescoping hydraulic: cylinder on `boneA`, rod on `boneB` (each rigid on its own bone, so they slide when the joint bends)
function piston(b, boneA, a0, a1, boneB, b0, b1, r = 0.028) {
  const cyl = (p, q, rr) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], L = Math.hypot(dx, dy, dz);
    const g = b.cyl(rr, rr, L, 10);
    g.rotateX(Math.atan2(Math.hypot(dx, dz), dy)); g.rotateY(Math.atan2(dx, dz));
    g.translate((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    return g;
  };
  b.sym(cyl(a0, a1, r), boneA, 'metal');
  b.sym(cyl(b0, b1, r * 0.55), boneB, 'metal');
  b.sym(b.cyl(r * 1.3, r * 1.3, 0.03, 10), boneA, 'accent', a1);
}
function rivets(b, bone, slot, pts, r = 0.012) {
  if (b.far) return;
  for (const p of pts) b.sym(b.cyl(r, r, 0.012, 6), bone, slot, p[0], p[1] || [PI / 2, 0, 0]);
}

// ---------- parts ----------
function head(b, o) {
  const z = 0.16, y = -0.02;
  b.add(b.rbox(0.27, 0.2, 0.26, 0.05), 'head', 'accent', [0, y + 0.03, z]);
  // blue armoured brow overhang + dark cheek guards
  P(b, 'head', 'paint', [0.32, 0.085, 0.27], [0, y + 0.135, z + 0.03], [0.22, 0, 0], { c: 0.035, tx: 0.78, tz: 0.9 });
  PS(b, 'head', 'accent', [0.05, 0.14, 0.2], [0.14, y + 0.02, z + 0.04], [0, 0, -0.12], { c: 0.015, bz: 0.7 });
  // face grille + chin vents
  b.add(b.cbox(0.2, 0.075, 0.03, 0.012), 'head', 'metal', [0, y + 0.05, z + 0.13]);
  vent(b, 'head', [0, y - 0.035, z + 0.125], [-0.3, 0, 0], 0.15, 0.06, 3);
  for (const x of [0.056, -0.056]) {
    b.add(b.cyl(0.042, 0.042, 0.03, 18), 'head', 'trim', [x, y + 0.05, z + 0.136], [PI / 2, 0, 0]);
    b.add(b.cyl(0.032, 0.032, 0.036, 18), 'head', 'eye', [x, y + 0.05, z + 0.142], [PI / 2, 0, 0]);
  }
  b.sym(discX(b, 0.056, 0.05, 14), 'head', 'metal', [0.15, y + 0.04, z - 0.02]);
  b.sym(b.cyl(0.022, 0.022, 0.02, 10), 'head', 'glow', [0.177, y + 0.04, z - 0.02], [0, 0, PI / 2]);
  if (!b.far) b.add(b.cyl(0.007, 0.01, 0.2, 5), 'head', 'metal', [-0.11, y + 0.24, z - 0.07], [-0.3, 0, 0.18]);
  if (o.rank >= 2) b.add(plate(b, 0.06, 0.1, 0.26, { c: 0.012, tx: 0.5, tz: 0.7 }), 'head', 'trim', [0, y + 0.2, z - 0.01], [0.15, 0, 0]);
  if (o.rank >= 4) b.sym(fin(b, [[0, 0], [0.05, 0], [0.02, 0.2]], 0.02, 0.005), 'head', 'paint', [0.08, y + 0.18, z - 0.06], [-0.5, 0, -0.35]);
}

function torso(b, o) {
  const far = b.far, rk = o.rank;
  // inner frame (bare metal shows in the gaps)
  P(b, 'chest', 'metal', [0.58, 0.48, 0.46], [0, 0.12, -0.03], [0, 0, 0], { c: 0.05 });
  // dark barrel chest, blue centre plate on top, layered dark pecs
  P(b, 'chest', 'accent', [0.82, 0.46, 0.5], [0, 0.17, 0.05], [0.1, 0, 0], { c: 0.08, tx: 1.15, bx: 0.72, tz: 1.0, bz: 0.82 });
  P(b, 'chest', 'paint', [0.36, 0.3, 0.06], [0, 0.22, 0.3], [0.32, 0, 0], { c: 0.03, tx: 1.2, bx: 0.7 });
  PS(b, 'chest', 'accent', [0.26, 0.24, 0.07], [0.22, 0.17, 0.29], [0.3, 0.38, 0.06], { c: 0.03, tx: 1.1, bx: 0.8 });
  PS(b, 'chest', 'paint', [0.2, 0.05, 0.05], [0.24, 0.3, 0.29], [0.3, 0.38, 0.06], { c: 0.012 });
  rivets(b, 'chest', 'metal', [[[0.3, 0.1, 0.33]], [[0.16, 0.05, 0.36]], [[0.3, 0.22, 0.3]]]);
  // orange marker blocks (warm accents against the blue)
  PS(b, 'chest', 'trim', [0.06, 0.03, 0.02], [0.3, 0.29, 0.31], [0.32, 0.35, 0.05]);
  PS(b, 'chest', 'trim', [0.03, 0.06, 0.02], [0.12, 0.33, 0.27], [0.32, 0.2, 0]);
  // reactor core: trim ring, glow lens, four bolts
  b.add(b.tor(0.085, 0.022, 24, 8), 'chest', 'trim', [0, 0.1, 0.325], [0.2, 0, 0]);
  b.add(b.cyl(0.07, 0.07, 0.03, 20), 'chest', 'glow', [0, 0.1, 0.318], [PI / 2 + 0.2, 0, 0]);
  if (!far) for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.add(b.cyl(0.014, 0.014, 0.03, 6), 'chest', 'metal', [Math.cos(a) * 0.11, 0.1 + Math.sin(a) * 0.11, 0.33], [PI / 2 + 0.2, 0, 0]); }
  vent(b, 'chest', [0, -0.05, 0.28], [0.2, 0, 0], 0.24, 0.09, 4);
  // the hump: plates rising behind the head = the hunched silhouette
  P(b, 'chest', 'accent', [0.68, 0.24, 0.38], [0, 0.43, -0.1], [-0.35, 0, 0], { c: 0.06, tx: 0.82, tz: 0.85 });
  P(b, 'chest', 'paint', [0.18, 0.06, 0.34], [0, 0.56, -0.13], [-0.35, 0, 0], { c: 0.02, tx: 0.7 });
  PS(b, 'chest', 'metal', [0.12, 0.04, 0.3], [0.2, 0.54, -0.13], [-0.35, 0, 0.15], { c: 0.012 });
  P(b, 'chest', 'metal', [0.5, 0.36, 0.2], [0, 0.18, -0.28], [0, 0, 0], { c: 0.04 });
  // back pack: twin exhausts + cooling fins + cable loops into the chest
  P(b, 'aux0', 'accent', [0.48, 0.38, 0.2], [0, 0, 0], [0, 0, 0], { c: 0.05 });
  P(b, 'aux0', 'paint', [0.3, 0.06, 0.16], [0, 0.19, 0.01], [0, 0, 0], { c: 0.02 });
  for (const x of [0.13, -0.13]) {
    b.add(b.cyl(0.075, 0.09, 0.2, 14), 'aux0', 'metal', [x, 0.12, -0.13], [PI / 2 - 0.5, 0, 0]);
    b.add(b.cyl(0.058, 0.058, 0.02, 14), 'aux0', rk >= 3 ? 'glow' : 'accent', [x, 0.075, -0.215], [PI / 2 - 0.5, 0, 0]);
  }
  if (!far) for (let i = 0; i < 4; i++) b.add(b.cbox(0.012, 0.22, 0.12, 0.003), 'aux0', 'metal', [-0.06 + i * 0.04, -0.06, -0.11]);
  if (!far) b.sym(b.tube([[0.2, 0.05, 0.02], [0.3, -0.05, -0.05], [0.28, -0.2, 0.05]], 0.022, 10, 6), 'aux0', 'metal');
  if (rk >= 2) vent(b, 'aux0', [0.18, -0.02, -0.105], [0, 0, 0], 0.1, 0.16, 4, true);
  // abdomen: segmented rings + dark ab plates
  b.add(b.cyl(0.2, 0.24, 0.2, 14), 'spine', 'metal', [0, 0.06, 0]);
  if (!far) for (let i = 0; i < 3; i++) b.add(b.tor(0.215 + i * 0.012, 0.012, 20, 4), 'spine', 'accent', [0, 0.0 + i * 0.06, 0], [PI / 2, 0, 0]);
  P(b, 'spine', 'accent', [0.4, 0.13, 0.14], [0, 0.1, 0.18], [0.12, 0, 0], { c: 0.03, tx: 1.1 });
  P(b, 'spine', 'accent', [0.32, 0.1, 0.12], [0, -0.02, 0.18], [0.0, 0, 0], { c: 0.025, bx: 0.8 });
  // pelvis: dark skirt, blue codpiece, trimmed tassets
  P(b, 'pelvis', 'metal', [0.42, 0.2, 0.34], [0, -0.02, 0], [0, 0, 0], { c: 0.04 });
  P(b, 'pelvis', 'paint', [0.26, 0.24, 0.08], [0, -0.1, 0.19], [-0.12, 0, 0], { c: 0.03, bx: 0.6 });
  PS(b, 'pelvis', 'accent', [0.1, 0.3, 0.32], [0.28, -0.1, 0], [0, 0, 0.22], { c: 0.03, bx: 1.15 });
  PS(b, 'pelvis', 'trim', [0.02, 0.2, 0.22], [0.336, -0.1, 0], [0, 0, 0.22]);
  PS(b, 'pelvis', 'accent', [0.18, 0.2, 0.08], [0.13, -0.12, -0.17], [0.15, 0, 0.1], { c: 0.02 });
}

function pauldrons(b, o) {
  const rk = o.rank;
  // huge blue domes on a dark rim band, ribbed crest, trim edge, cyan lamps, orange marker
  b.sym(b.sph(26, 14, 0, PI * 2, 0, PI * 0.5), 'upArm', 'paint', [0.05, 0.03, 0], [0, 0, -0.32], [0.29, 0.25, 0.31]);
  b.sym(b.cyl(0.295, 0.315, 0.06, 26), 'upArm', 'accent', [0.05, 0.015, 0], [0, 0, -0.32], [1, 1, 1.07]);
  for (const k of [0]) b.sym(b.tor(0.258, 0.016, 22, 5, PI * 0.9), 'upArm', 'accent', [0.05 + 0.02, 0.04, k * 0.09], [0, 0, -0.32 + PI * 0.05]);
  PS(b, 'upArm', 'accent', [0.37, 0.1, 0.43], [0.11, -0.1, 0], [0, 0, -0.42], { c: 0.035, tx: 0.95 });
  PS(b, 'upArm', 'trim', [0.34, 0.024, 0.41], [0.115, -0.155, 0], [0, 0, -0.42]);
  if (rk >= 2) {
    PS(b, 'upArm', 'paint', [0.31, 0.085, 0.37], [0.14, -0.2, 0], [0, 0, -0.5], { c: 0.03 });
    PS(b, 'upArm', 'accent', [0.12, 0.2, 0.3], [0.12, 0.26, -0.02], [0, 0, -0.55], { c: 0.03, tx: 0.5, tz: 0.8 });
    PS(b, 'upArm', 'trim', [0.02, 0.16, 0.26], [0.18, 0.28, -0.02], [0, 0, -0.55]);
    vent(b, 'upArm', [0.24, 0.1, -0.12], [0, -0.9, -0.75], 0.12, 0.1, 3, true);
  }
  lamp(b, 'upArm', [0.15, 0.13, 0.2], [1.0, 0, -0.5], 0.034);
  lamp(b, 'upArm', [0.24, 0.02, 0.16], [1.1, 0, -0.9], 0.022);
  b.sym(b.cbox(0.05, 0.03, 0.02, 0.006), 'upArm', 'trim', [0.02, 0.2, 0.22], [0.9, 0, -0.2]);
  if (rk >= 3) b.sym(b.tor(0.06, 0.012, 16, 5), 'upArm', 'glow', [0.2, 0.18, -0.05], [0.4, 0.6, -0.6]);
  if (rk >= 4) b.sym(b.tor(0.275, 0.009, 30, 4, PI), 'upArm', 'glow', [0.05, 0.03, 0], [PI / 2, 0, -0.32 + PI / 2]);
}

function armsAndFists(b, o) {
  const D = b.rig.D, ua = D.upArm, fa = D.foreArm;
  b.sym(b.cyl(0.06, 0.06, D.shoulder, 12), 'clav', 'metal', [D.shoulder / 2, 0, 0], [0, 0, PI / 2]);
  b.sym(b.sph(16, 12), 'upArm', 'metal', [0, 0, 0], [0, 0, 0], 0.12);
  b.sym(b.cyl(0.075, 0.065, ua, 12), 'upArm', 'metal', [0, -ua / 2, 0]);
  PS(b, 'upArm', 'accent', [0.2, ua * 0.55, 0.2], [0.02, -ua * 0.62, 0], [0, 0, 0], { c: 0.035, tx: 1.1, tz: 1.1 });
  PS(b, 'upArm', 'paint', [0.05, ua * 0.4, 0.16], [0.12, -ua * 0.62, 0], [0, 0, 0], { c: 0.015 });
  // elbow hydraulics: cylinder behind the upper arm, rod into the forearm
  piston(b, 'upArm', [0, -0.08, -0.12], [0, -ua + 0.05, -0.13], 'foreArm', [0, 0.02, -0.13], [0, -0.14, -0.14], 0.028);
  b.sym(discX(b, 0.1, 0.22, 16), 'foreArm', 'metal', [0, 0, 0]);
  b.sym(discX(b, 0.06, 0.24, 12), 'foreArm', 'accent', [0, 0, 0]);
  PS(b, 'foreArm', 'accent', [0.16, 0.12, 0.08], [0, 0.0, -0.12], [0.4, 0, 0], { c: 0.025, tx: 0.7 });
  // massive dark forearms with a blue outer panel, trim cuff, vents
  PS(b, 'foreArm', 'accent', [0.3, fa * 0.82, 0.32], [0.01, -fa * 0.56, 0], [0, 0, 0], { c: 0.05, tx: 0.82, tz: 0.85 });
  PS(b, 'foreArm', 'paint', [0.04, fa * 0.6, 0.24], [0.155, -fa * 0.56, 0], [0, 0, -0.05], { c: 0.015, tz: 0.85 });
  PS(b, 'foreArm', 'paint', [0.18, fa * 0.45, 0.04], [0.01, -fa * 0.6, 0.17], [0, 0, 0], { c: 0.012 });
  PS(b, 'foreArm', 'trim', [0.32, 0.035, 0.34], [0.01, -fa * 0.2, 0]);
  vent(b, 'foreArm', [0.0, -fa * 0.55, -0.165], [0, PI, 0], 0.16, 0.14, 3, true);
  b.sym(b.cyl(0.022, 0.022, 0.02, 10), 'foreArm', 'glow', [0.178, -fa * 0.4, 0.07], [0, 0, PI / 2]);
  // right: big piston fist with trim knuckles; left: grip behind the shield
  const k = 1.6;
  b.add(b.rbox(0.14 * k, 0.12 * k, 0.15 * k, 0.025 * k), 'handR', 'metal', [0, -0.07 * k, 0.01]);
  b.add(b.cbox(0.15 * k, 0.075 * k, 0.17 * k, 0.025 * k), 'handR', 'accent', [0, -0.14 * k, 0.015]);
  for (let i = 0; i < 3; i++) b.add(b.cbox(0.04 * k, 0.03 * k, 0.15 * k, 0.008 * k), 'handR', 'trim', [(-0.045 + i * 0.045) * k, -0.18 * k, 0.015]);
  b.add(b.cbox(0.05 * k, 0.08 * k, 0.06 * k, 0.015 * k), 'handR', 'metal', [-0.06 * k, -0.06 * k, 0.08 * k]);
  b.add(b.cyl(0.035, 0.035, 0.3, 10), 'foreArmR', 'metal', [0, -fa * 0.6, -0.19]);
  b.add(b.cbox(0.13, 0.13, 0.15, 0.03), 'handL', 'metal', [0, -0.06, 0]);
}

function shield(b, o) {
  const far = b.far, rank = o.rank;
  const H = 1.6, W = 0.8, T = 0.08;
  // root-aligned frame at the left elbow for the idle hold pose: +z forward, +x out (left), +y up
  b.scope([0, 0, 0], poseFrame(b.rig, SHIELD_POSE, 'foreArmL'), 1, () => b.scope([0.17, -0.46, 0.28], [0, 0.38, 0], 1, () => {
    const bone = 'foreArmL';
    // three panels angled back = a curved tower shield; dark wings, blue centre
    const pw = W * 0.42, ang = 0.32;
    const outline = (w, h, cut) => [[-w / 2, -h / 2 + cut], [-w / 2 + cut, -h / 2], [w / 2 - cut, -h / 2], [w / 2, -h / 2 + cut], [w / 2, h / 2 - cut], [w / 2 - cut, h / 2], [-w / 2 + cut, h / 2], [-w / 2, h / 2 - cut]];
    b.add(b.ext(outline(pw, H, 0.06), T, 0.02), bone, 'paint', [0, 0, 0]);
    for (const s of [1, -1]) b.add(b.ext(outline(W * 0.32, H * 0.94, 0.08), T * 0.9, 0.018), bone, 'accent', [s * (pw / 2 + W * 0.15), 0, -0.05], [0, -s * ang, 0]);
    // dark inset + cyan core slit in a metal channel
    b.add(b.ext(outline(pw * 0.72, H * 0.8, 0.04), 0.02, 0.006), bone, 'accent', [0, -0.02, T / 2 + 0.006]);
    b.add(b.cbox(0.06, H * 0.5, 0.03, 0.01), bone, 'metal', [0, -0.08, T / 2 + 0.018]);
    b.add(b.cbox(0.03, H * 0.46, 0.03, 0.008), bone, 'glow', [0, -0.08, T / 2 + 0.026]);
    // yellow-orange chevrons (the signature) + side bars on the wings
    for (let i = 0; i < 3; i++) {
      const y = H * 0.34 - i * 0.11;
      b.add(b.ext([[-0.13, 0.04], [0, -0.06], [0.13, 0.04], [0.13, 0.095], [0, 0.0], [-0.13, 0.095]], 0.022, 0.004), bone, 'trim', [0, y, T / 2 + 0.016]);
    }
    for (const s of [1, -1]) {
      b.add(b.cbox(0.05, H * 0.76, 0.03, 0.01), bone, 'trim', [s * (pw / 2 + W * 0.21), 0, -0.065], [0, -s * ang, 0]);
      b.add(b.cbox(0.11, H * 0.3, 0.02, 0.006), bone, 'paint', [s * (pw / 2 + W * 0.12), -H * 0.22, -0.03], [0, -s * ang, 0]);
      if (!far) for (const yy of [-0.43, -0.15, 0.15, 0.43]) b.add(b.cyl(0.014, 0.014, 0.02, 6), bone, 'metal', [s * (pw / 2 + W * 0.08), yy * H, -0.012 + T / 2], [PI / 2, -s * ang, 0]);
      for (const yy of [-0.4, 0.4]) b.add(b.cyl(0.02, 0.02, 0.02, 10), bone, 'glow', [s * (pw / 2 + W * 0.25), yy * H, -0.07 + T / 2], [PI / 2, -s * ang, 0]);
    }
    // rims + rear grip frame + struts
    b.add(b.cbox(pw * 1.04, 0.05, T * 1.4, 0.014), bone, 'metal', [0, H / 2 - 0.02, 0]);
    b.add(b.cbox(pw * 1.04, 0.06, T * 1.4, 0.014), bone, 'metal', [0, -H / 2 + 0.02, 0]);
    b.add(b.cbox(0.3, 0.55, 0.06, 0.02), bone, 'metal', [0, 0.0, -T / 2 - 0.03]);
    if (!far) for (const yy of [-0.5, 0.5]) b.add(b.cyl(0.02, 0.02, 0.28, 8), bone, 'metal', [0, yy * 0.4, -T / 2 - 0.06], [0, 0, PI / 2]);
    if (rank >= 3) {
      for (const s of [1, -1]) b.add(b.cbox(0.016, H * 0.9, 0.022, 0.004), bone, 'glow', [s * (pw / 2 + W * 0.31), 0, -0.1], [0, -s * ang, 0]);
      b.add(b.cbox(pw * 0.9, 0.016, 0.022, 0.004), bone, 'glow', [0, -H / 2 + 0.06, T / 2 + 0.012]);
    }
    if (rank >= 4) {
      b.add(b.cyl(0.08, 0.09, 0.07, 6), bone, 'metal', [0, H / 2 + 0.035, 0]);
      b.add(b.tor(0.12, 0.012, 6, 3), bone, 'glow', [0, H / 2 + 0.085, 0], [PI / 2, 0, PI / 6]);
      b.add(b.cyl(0.04, 0.04, 0.03, 6), bone, 'glow', [0, H / 2 + 0.085, 0]);
    }
    if (rank >= 5) b.add(b.ext(outline(0.5, 0.9, 0.12), 0.008, 0), bone, 'glow', [0, H / 2 + 0.55, 0.0]);
  }));
}

function build(b, o) {
  head(b, o);
  torso(b, o);
  pauldrons(b, o);
  armsAndFists(b, o);
  shield(b, o);
  legs(b, o, { w: 1.5, foot: 'claw', thighSlot: 'accent', shellSlot: 'accent', shinPlateSlot: 'paint', kneeSlot: 'paint', footSlot: 'accent' });
  // knee hydraulics, calf vents, shin lamps
  piston(b, 'thigh', [0, -0.1, -0.13], [0, -0.33, -0.14], 'shin', [0, 0.0, -0.15], [0, -0.16, -0.15], 0.026);
  vent(b, 'shin', [0.0, -0.2, -0.165], [0, PI, 0], 0.13, 0.14, 3, true);
  lamp(b, 'shin', [0.07, -0.12, 0.2], [PI / 2 - 0.15, 0, 0], 0.022);
  PS(b, 'thigh', 'trim', [0.03, 0.12, 0.02], [0.13, -0.15, 0.13], [0, 0, 0]);
  if (o.rank >= 4) {
    b.sym(b.cbox(0.014, 0.3, 0.014, 0.004), 'thigh', 'glow', [0.17, -0.18, 0.02]);
    b.sym(b.cbox(0.16, 0.014, 0.014, 0.004), 'chest', 'glow', [0.13, 0.42, 0.25], [0.3, 0.3, 0]);
  }
  // R4: twin hardlight fins rise from the back pack (a silhouette change you can see from the battle camera)
  if (o.rank >= 4) {
    b.sym(fin(b, [[0, 0], [0.09, 0], [0.05, 0.62], [0.0, 0.7]], 0.018, 0.004), 'aux0', 'glow', [0.17, 0.16, -0.02], [-0.35, 0, -0.18]);
    b.sym(fin(b, [[0, 0], [0.12, 0], [0.07, 0.4], [0.0, 0.46]], 0.03, 0.006), 'aux0', 'trim', [0.2, 0.12, 0.0], [-0.35, 0, -0.25]);
  }
  // R5: hardlight crown ring + inner sigil over the hump
  if (o.rank >= 5) {
    b.add(b.tor(0.34, 0.018, 40, 5), 'aux0', 'glow', [0, 0.62, 0.12], [-0.6, 0, 0]);
    b.add(b.tor(0.4, 0.008, 40, 3), 'aux0', 'trim', [0, 0.62, 0.12], [-0.6, 0, 0]);
    for (let i = 0; i < 6; i++) { const a = i * PI / 3; b.add(fin(b, [[-0.02, 0], [0.02, 0], [0, 0.1]], 0.012, 0.003), 'aux0', 'glow', [Math.cos(a) * 0.42, 0.62 + Math.sin(a) * 0.42 * Math.cos(0.6), 0.12 - Math.sin(a) * 0.42 * Math.sin(0.6) * -1], [-0.6, 0, a - PI / 2]); }
  }
}

export default {
  id: 'bulwark', name: 'BULWARK', role: 'tank', faction: 'corporate', rarity: 'rare', realm: 'scifi',
  rig: 'biped', dims: DIMS, height: 2.0, radius: 0.8, walkSpeed: 1.05, cadence: 0.72, scheme: 'dark',
  style: { weapon: 'shield', heavy: 1, stance: 1.15 },
  // corporate: blue panels + dark gunmetal armour + yellow-orange markers. Other factions keep their palette.
  paint: { corporate: { paint: 0x3468cc, accent: 0x3d434c, trim: 0xf2a21c } },
  mats: { corporate: { trim: { emissive: 0xff8a10, ei: 0.45, metal: 0.4, rough: 0.35 } }, all: { paint: { rough: 0.28 }, accent: { rough: 0.42, metal: 0.45 } } },
  sockets: { muzzle: ['handR', [0, -0.3, 0.05]], core: [0, 0.1, 0.34], head: [0, 0.12, 0.2], hand: ['handR', [0, -0.25, 0.05]] },
  post(P, ctx, act) {
    if (act && act.name === 'die') return;
    const bi = (n) => ctx.boneIndex[n] * 3;
    P[bi('spine')] += HUNCH.spine; P[bi('chest')] += HUNCH.chest; P[bi('neck')] += HUNCH.neck; P[bi('head')] += HUNCH.head;
  },
  // Aegis Wall: hoist the shield overhead, slam it edge-first into the floor (impact 0.56), brace behind it, rise.
  anims: {
    overdrive(P, u, ctx, L) {
      L.idle(P, ctx, ctx.t);
      const s = ctx.D.leg / 0.86;
      const lift = L.kf(u, [[0, 0], [0.32, 1], [0.5, 1], [0.56, 0], [1, 0]]);
      const brace = L.kf(u, [[0, 0], [0.5, 0], [0.56, 1], [0.88, 1], [1, 0]]);
      const hop = L.kf(u, [[0, 0], [0.38, 0], [0.48, 1], [0.56, 0], [1, 0]]);
      L.pel(P, 0, (-0.06 - 0.06 * lift - 0.26 * brace) * s + 0.22 * hop, 0.06 * lift + 0.18 * brace);
      L.R(P, 'spine', 0.04 - 0.22 * lift + 0.32 * brace, 0, 0);
      L.R(P, 'chest', 0.02 - 0.15 * lift + 0.18 * brace, 0, 0);
      L.R(P, 'head', -0.1 * lift - 0.25 * brace, 0, 0);
      L.RS(P, 'upArm', 'L', L.lerp(-0.35, -2.7, lift) * (1 - brace) + -0.75 * brace, 0, L.lerp(0.3, 0.12, lift));
      L.RS(P, 'foreArm', 'L', L.lerp(-1.2, -0.35, lift) * (1 - brace) + -0.75 * brace, 0, 0);
      L.RS(P, 'upArm', 'R', L.lerp(-0.12, -2.5, lift) * (1 - brace) + -0.55 * brace, 0, 0.3);
      L.RS(P, 'foreArm', 'R', L.lerp(-0.55, -0.3, lift) * (1 - brace) + -1.0 * brace, 0, 0);
      L.plant(P, ctx, 0.12 + 0.28 * brace, -0.1 - 0.22 * brace, 1.15 + 0.35 * brace);
    },
  },
  events: { overdrive: [['cast', 0.2], ['impact', 0.56]] },
  durs: { overdrive: 2.3 },
  fxHints: { impact: 'shield_spark', overdrive: 'hex_wall', color: 0x1fd2ff },
  build,
};
