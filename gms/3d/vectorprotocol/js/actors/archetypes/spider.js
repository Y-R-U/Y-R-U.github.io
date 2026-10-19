// Quad spider gunner: low armoured carapace, sensor turret head with twin cannons, four 2-segment legs.
// Rig: front legs = clav->upArm->foreArm->hand, back legs = thigh->shin->foot; every leg's rest points along +-x.
import { P, PS, visor, flair, halo, fin, discX, plate, PI } from '../mech.js';

const FEMUR = 0.62, TIBIA = 0.82;
export const SPIDER_DIMS = {
  hover: 0.82, femur: FEMUR, tibia: TIBIA, qreach: 0.95, ankle: 0.02, hipX: 0.24, hipY: 0,
  spine: 0.0, chest: 0.0, neck: 0.18, headOff: 0.02, clavX: 0, clavY: 0, shoulder: 0.24,
  offsets: {
    spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0.16, 0.22], head: [0, 0.02, 0],
    clavL: [0, 0, 0.26], upArmL: [0.24, 0, 0], foreArmL: [FEMUR, 0, 0], handL: [TIBIA, 0, 0],
    thighL: [0.24, 0, -0.26], shinL: [FEMUR, 0, 0], footL: [TIBIA, 0, 0],
    aux0: [0, 0.2, -0.3], aux1: [0, 0.18, 0],
  },
};

function leg(b, o, up, lo, tip) {
  const r = o.r;
  // femur: armoured strut along +x
  b.add(b.sph(12, 8), up, 'metal', [0, 0, 0], [0, 0, 0], 0.1);
  b.add(plate(b, 0.17, FEMUR * 0.9, 0.16, { c: 0.03, tx: 0.75, tz: 0.8 }), up, 'paint', [FEMUR * 0.5, 0.02, 0], [0, 0, -PI / 2]);
  b.add(plate(b, 0.06, FEMUR * 0.6, 0.12, { c: 0.015 }), up, 'accent', [FEMUR * 0.5, 0.1, 0], [0, 0, -PI / 2]);
  b.add(b.cyl(0.03, 0.03, FEMUR * 0.8, 6), up, 'metal', [FEMUR * 0.5, -0.07, 0], [0, 0, PI / 2]);
  if (r >= 1) b.add(b.cbox(FEMUR * 0.4, 0.015, 0.015, 0.004), up, 'glow', [FEMUR * 0.5, 0.135, 0]);
  // knee
  b.add(discX(b, 0.085, 0.14, 12), lo, 'metal', [0, 0, 0], [0, PI / 2, 0]);
  b.add(b.cyl(0.03, 0.03, 0.02, 10), lo, 'glow', [0, 0, 0.075], [PI / 2, 0, 0]);
  // tibia: tapering blade down to a spike foot
  b.add(plate(b, 0.15, TIBIA * 0.8, 0.14, { c: 0.025, tx: 1, bx: 0.45, bz: 0.55 }), lo, 'paint', [TIBIA * 0.42, 0, 0], [0, 0, PI / 2]);
  b.add(plate(b, 0.05, TIBIA * 0.55, 0.16, { c: 0.012, bx: 0.5 }), lo, 'accent', [TIBIA * 0.35, 0.05, 0], [0, 0, PI / 2]);
  b.add(b.cyl(0.035, 0.008, 0.2, 6), lo, 'metal', [TIBIA * 0.92, 0, 0], [0, 0, PI / 2]);
  if (r >= 2) b.add(fin(b, [[-0.03, 0], [0.03, 0], [0, 0.16]], 0.03, 0.006), lo, 'accent', [0.08, 0.06, 0], [0, 0, 0.5]);
}

export function buildSpider(b, o) {
  const r = o.r, far = b.far, op = o.opts || {};
  // carapace
  P(b, 'pelvis', 'metal', [0.56, 0.24, 0.74], [0, 0.0, 0], [0, 0, 0], { c: 0.05 });
  P(b, 'pelvis', 'paint', [0.7, 0.2, 0.8], [0, 0.14, -0.04], [0, 0, 0], { c: 0.07, tx: 0.75, tz: 0.8 });
  PS(b, 'pelvis', 'accent', [0.16, 0.12, 0.6], [0.3, 0.06, -0.04], [0, 0, -0.35], { c: 0.03 });
  P(b, 'pelvis', 'accent', [0.36, 0.1, 0.36], [0, 0.26, -0.12], [0, 0, 0], { c: 0.03, tx: 0.7, tz: 0.7 });
  b.add(b.cyl(0.06, 0.06, 0.02, 12), 'pelvis', 'glow', [0, 0.315, -0.12]);
  P(b, 'pelvis', 'metal', [0.4, 0.2, 0.2], [0, 0.02, -0.46], [0, 0, 0], { c: 0.04 });
  if (!far) for (let i = 0; i < 3; i++) b.add(b.cbox(0.3, 0.02, 0.03, 0.006), 'pelvis', 'metal', [0, 0.13 - i * 0.04, -0.565]);
  b.sym(b.cyl(0.03, 0.03, 0.02, 10), 'pelvis', 'glow', [0.2, 0.06, -0.57], [PI / 2, 0, 0]);
  if (r >= 1) b.sym(b.cbox(0.015, 0.015, 0.5, 0.004), 'pelvis', 'glow', [0.25, 0.2, -0.04], [0, 0, -0.35]);
  // turret head: sensor dome + twin cannons
  b.add(b.cyl(0.18, 0.22, 0.1, 10), 'neck', 'metal', [0, -0.04, 0]);
  P(b, 'head', 'paint', [0.36, 0.18, 0.34], [0, 0.07, 0.05], [0, 0, 0], { c: 0.05, tx: 0.8, tz: 0.85 });
  P(b, 'head', 'metal', [0.26, 0.1, 0.1], [0, 0.04, 0.24], [0, 0, 0], { c: 0.025 });
  visor(b, 'head', 0.2, 0.035, [0, 0.07, 0.29], [0, 0, 0], 0.02);
  for (const [x, y, s] of [[0.07, 0.025, 0.022], [-0.07, 0.025, 0.022], [0, 0.0, 0.016]]) b.add(b.cyl(s, s, 0.02, 10), 'head', 'eye', [x, y, 0.295], [PI / 2, 0, 0]);
  for (const sx of [1, -1]) {
    const x = sx * 0.22;
    b.add(plate(b, 0.12, 0.12, 0.34, { c: 0.025 }), 'head', 'accent', [x, 0.06, 0.12]);
    b.add(b.cyl(0.04, 0.045, 0.6, 10), 'head', 'metal', [x, 0.06, 0.55], [PI / 2, 0, 0]);
    b.add(b.cyl(0.055, 0.055, 0.08, 10), 'head', 'trim', [x, 0.06, 0.82], [PI / 2, 0, 0]);
    b.add(b.cyl(0.028, 0.028, 0.02, 10), 'head', 'glow', [x, 0.06, 0.865], [PI / 2, 0, 0]);
    if (!far) b.add(b.cbox(0.012, 0.012, 0.28, 0.003), 'head', 'glow', [x, 0.125, 0.12]);
  }
  if (!far) b.add(b.cyl(0.006, 0.01, 0.35, 5), 'head', 'metal', [-0.12, 0.3, -0.05], [-0.3, 0, 0.15]);
  if (r >= 2) b.add(b.cyl(0.07, 0.07, 0.24, 10), 'aux0', 'accent', [0, 0, 0], [0, 0, PI / 2]);
  if (r >= 3) halo(b, 'aux0', [0, 0.2, 0], 0.22, 'glow', -0.4);
  leg(b, o, 'upArmL', 'foreArmL'); leg(b, o, 'thighL', 'shinL');
  // right legs: mirrored by sym-like reflection — build directly with mirrored geometry
  b.scope([0, 0, 0], [0, 0, 0], [-1, 1, 1], () => { leg(b, o, 'upArmR', 'foreArmR'); leg(b, o, 'thighR', 'shinR'); });
  flair(b, o, { spikes: [['pelvis', [0.2, 0.25, 0.1], [0, 0, -0.4], 1]], crystals: [['pelvis', [0.15, 0.3, 0.1], [0, 0, -0.3], 1]] });
}
