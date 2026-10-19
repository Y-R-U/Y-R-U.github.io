// Sleek rifle/rail archer: tall V torso, pointed helm, swept shoulder blades, long rifle. opts.spiky = rogue variant.
import { P, PS, legs, arms, openHands, visor, thrusters, flair, halo, fin, discX, plate, PI } from '../mech.js';

export const ARCHER_DIMS = {
  thigh: 0.45, shin: 0.47, ankle: 0.1, hipX: 0.12, hipY: -0.04, spine: 0.12, chest: 0.22, neck: 0.27, headOff: 0.05,
  clavX: 0.05, clavY: 0.2, shoulder: 0.2, upArm: 0.29, foreArm: 0.28, aux0: [0, 0.16, -0.16],
};

// Long rifle authored in the aim frame (forearm horizontal forward), grip at the hand origin, barrel +z.
export function rifle(b, o, { len = 1.35, heavy = 0, rail = false, frame = 1.55 } = {}) {
  const r = o.r, far = b.far;
  b.scope([0, -0.08, 0], [frame, 0, 0], 1, () => {
    const W = 0.07 + heavy * 0.05, H = 0.12 + heavy * 0.06;
    P(b, 'handR', 'metal', [W, H, 0.5], [0, 0.04, 0.12], [0, 0, 0], { c: 0.02 });
    P(b, 'handR', 'paint', [W * 1.15, H * 0.7, 0.36], [0, 0.07, 0.2], [0, 0, 0], { c: 0.02, tx: 0.8 });
    P(b, 'handR', 'accent', [W * 0.9, H * 0.9, 0.28], [0, 0.01, -0.22], [0.1, 0, 0], { c: 0.02, tx: 0.7 });  // stock
    b.add(b.cbox(0.04, 0.12, 0.05, 0.01), 'handR', 'metal', [0, -0.06, 0.0], [0.3, 0, 0]);                 // grip
    b.add(b.cyl(0.022 + heavy * 0.012, 0.026 + heavy * 0.012, len * 0.62, 10), 'handR', 'metal', [0, 0.06, 0.38 + len * 0.31], [PI / 2, 0, 0]);
    if (rail) for (const sx of [-1, 1]) b.add(b.cbox(0.018, 0.05, len * 0.55, 0.006), 'handR', 'accent', [sx * 0.032, 0.06, 0.4 + len * 0.27]);
    b.add(b.cyl(0.032, 0.032, 0.08, 10), 'handR', 'trim', [0, 0.06, 0.38 + len * 0.62], [PI / 2, 0, 0]);
    // glow coil strip along the barrel
    b.add(b.cbox(0.012, 0.012, len * 0.4, 0.004), 'handR', 'glow', [0, 0.1 + heavy * 0.03, 0.42 + len * 0.15]);
    // scope
    b.add(b.cyl(0.028, 0.028, 0.22, 10), 'handR', 'metal', [0, 0.16 + heavy * 0.03, 0.1], [PI / 2, 0, 0]);
    b.add(b.cyl(0.024, 0.024, 0.01, 10), 'handR', 'eye', [0, 0.16 + heavy * 0.03, 0.212], [PI / 2, 0, 0]);
    if (!far) b.add(b.cbox(0.05, 0.03, 0.26, 0.01), 'handR', 'metal', [0, 0.04, 0.42], [0, 0, 0]);
    if (r >= 2) PS(b, 'handR', 'glow', [0.008, 0.03, 0.22], [W * 0.6, 0.07, 0.2]);
    if (r >= 3) b.sym(fin(b, [[0, 0], [0.22, 0], [0.04, 0.07]], 0.016, 0.004), 'handR', 'trim', [W * 0.5, 0.1, 0.0], [0, -PI / 2, 0]);
  });
  return [0, -0.08, 0, 0.38 + len * 0.66];
}

export function buildArcher(b, o) {
  const r = o.r, far = b.far, op = o.opts || {}, spiky = !!op.spiky;
  // ---- helm: long pointed visor head
  b.add(plate(b, 0.17, 0.17, 0.26, { c: 0.035, tx: 0.7, tz: 0.8 }), 'head', 'paint', [0, 0.07, 0.03]);
  b.add(b.ext([[-0.07, 0], [0.07, 0], [0.05, 0.08], [0, 0.1], [-0.05, 0.08]], 0.2, 0.012), 'head', 'accent', [0, 0.0, 0.07], [0, 0, 0]);
  P(b, 'head', 'paint', [0.1, 0.06, 0.16], [0, 0.03, 0.19], [-0.15, 0, 0], { c: 0.02, tx: 0.5, tz: 0.3, sz: 0.04 });
  visor(b, 'head', 0.15, 0.03, [0, 0.085, 0.16], [0.1, 0, 0], 0.03);
  if (spiky) b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0.02, 0.2]], 0.03, 0.006), 'head', 'accent', [0.07, 0.12, -0.02], [-0.7, 0, -0.5]);
  else b.add(fin(b, [[0, 0], [0.04, 0], [-0.14, 0.12], [-0.18, 0.1]], 0.025, 0.006), 'head', 'trim', [0, 0.14, -0.02], [0, PI / 2, 0]);
  b.sym(discX(b, 0.035, 0.03, 10), 'head', 'metal', [0.085, 0.06, 0]);
  // ---- torso V
  P(b, 'chest', 'metal', [0.32, 0.36, 0.26], [0, 0.1, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'paint', [0.46, 0.32, 0.3], [0, 0.15, 0.02], [0.08, 0, 0], { c: 0.05, tx: 1.15, bx: 0.62, tz: 1.05, bz: 0.8 });
  PS(b, 'chest', 'accent', [0.16, 0.18, 0.06], [0.08, 0.17, 0.17], [0.3, 0.3, 0.1], { c: 0.02, bx: 0.6 });
  b.add(b.cyl(0.04, 0.04, 0.03, 12), 'chest', 'glow', [0, 0.1, 0.16], [PI / 2 + 0.3, 0, 0]);
  b.add(b.tor(0.048, 0.01, 16, 5), 'chest', 'trim', [0, 0.1, 0.165], [0.3, 0, 0]);
  P(b, 'chest', 'paint', [0.34, 0.24, 0.12], [0, 0.15, -0.17], [0, 0, 0], { c: 0.03 });
  b.add(b.cyl(0.12, 0.14, 0.16, 8), 'spine', 'metal', [0, 0.05, 0]);
  P(b, 'spine', 'accent', [0.22, 0.12, 0.1], [0, 0.05, 0.1], [0.1, 0, 0], { c: 0.02 });
  P(b, 'pelvis', 'paint', [0.3, 0.14, 0.22], [0, -0.01, 0], [0, 0, 0], { c: 0.03, bx: 0.8 });
  PS(b, 'pelvis', 'accent', [0.05, 0.2, 0.18], [0.16, -0.08, 0], [0, 0, 0.15], { c: 0.015 });
  P(b, 'pelvis', 'accent', [0.14, 0.16, 0.05], [0, -0.09, 0.12], [-0.1, 0, 0], { c: 0.015, bx: 0.6 });
  // ---- arms + swept shoulder blades
  arms(b, o, { w: 0.92, fore: [0.15, 0.78, 0.16] });
  PS(b, 'upArm', 'paint', [0.2, 0.16, 0.24], [0.04, 0.0, 0], [0, 0, -0.35], { c: 0.03, tx: 0.7, tz: 0.8 });
  if (spiky) {
    b.sym(fin(b, [[-0.04, 0], [0.04, 0], [0.01, 0.34]], 0.04, 0.008), 'upArm', 'accent', [0.08, 0.06, -0.02], [-0.2, 0, -0.6]);
    b.sym(fin(b, [[-0.03, 0], [0.03, 0], [0.0, 0.22]], 0.035, 0.008), 'upArm', 'accent', [0.06, 0.05, -0.1], [-0.8, 0, -0.4]);
  } else {
    // forward-swept blade pads (ref Lancer): long thin plates angled down/back
    b.sym(fin(b, [[0, 0.03], [0.1, 0.04], [0.42, -0.2], [0.3, -0.18], [0, -0.03]], 0.03, 0.008), 'upArm', 'accent', [0.08, 0.06, -0.02], [0.2, 0.6, -0.15]);
  }
  openHands(b, o, 0.85);
  // ---- legs: slim, long shin guards with knee spikes
  legs(b, o, { w: 0.85, knee: 'spike', shin: 'slim', foot: 'point' });
  // ---- back: twin swept wing fins / spike crown
  if (spiky) {
    for (const [a, l] of [[-0.35, 0.65], [-0.75, 0.5], [0.15, 0.45]]) b.sym(fin(b, [[-0.04, 0], [0.04, 0], [0.012, l]], 0.03, 0.008), 'aux0', 'accent', [0.1, 0.05, 0], [-0.35, 0, a - 0.45]);
    if (r >= 2) b.sym(fin(b, [[-0.01, 0], [0.01, 0], [0.004, 0.45]], 0.012, 0.003), 'aux0', 'glow', [0.11, 0.06, 0.02], [-0.35, 0, -0.8]);
  } else {
    b.sym(fin(b, [[0, 0], [0.08, 0.02], [0.5, 0.36], [0.44, 0.4], [0.02, 0.12]], 0.03, 0.008), 'aux0', 'paint', [0.05, 0.0, 0], [-0.3, 0.4, 0]);
    if (r >= 1) b.sym(fin(b, [[0, 0], [0.05, 0.0], [0.45, 0.34], [0.42, 0.36]], 0.012, 0.003), 'aux0', 'glow', [0.06, -0.01, 0.018], [-0.3, 0.4, 0]);
  }
  thrusters(b, o, 'chest', 0.08, 0.12, -0.24, 0.045);
  if (r >= 3) halo(b, 'aux0', [0, 0.32, -0.04], 0.2, 'glow', -0.2);
  rifle(b, o, { len: op.len || 1.3, rail: r >= 2 || op.rail });
  flair(b, o, { crystals: [['upArm', [0.1, 0.16, -0.05], [0.3, 0, -0.5], 1]], antenna: ['head', [-0.06, 0.15, -0.05]] });
}
