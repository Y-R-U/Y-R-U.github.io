// Heavy gunner: crouched wide frame, ridged helm, ammo drum backpack, big rotary/long gun held at the hip.
import { P, PS, legs, arms, fists, visor, thrusters, flair, halo, fin, discX, plate, PI } from '../mech.js';

export const GUNNER_DIMS = {
  thigh: 0.42, shin: 0.43, ankle: 0.12, hipX: 0.17, hipY: -0.05, spine: 0.13, chest: 0.25, neck: 0.25, headOff: 0.04,
  clavX: 0.07, clavY: 0.21, shoulder: 0.26, upArm: 0.3, foreArm: 0.29, aux0: [0, 0.14, -0.26],
};

export function bigGun(b, o, { frame = 1.5, rotary = true, len = 1.05 } = {}) {
  const r = o.r, far = b.far;
  b.scope([0, -0.06, 0], [frame, 0, 0], 1, () => {
    P(b, 'handR', 'metal', [0.15, 0.2, 0.62], [0, 0.04, 0.12], [0, 0, 0], { c: 0.03 });
    P(b, 'handR', 'paint', [0.18, 0.13, 0.44], [0, 0.1, 0.1], [0, 0, 0], { c: 0.035, tx: 0.85 });
    P(b, 'handR', 'accent', [0.12, 0.15, 0.24], [0, 0.02, -0.26], [0.1, 0, 0], { c: 0.025 });
    b.add(b.cbox(0.05, 0.14, 0.06, 0.012), 'handR', 'metal', [0, -0.08, 0.0], [0.3, 0, 0]);
    if (rotary) {
      const z0 = 0.42;
      b.add(b.cyl(0.07, 0.07, 0.1, 12), 'handR', 'trim', [0, 0.05, z0], [PI / 2, 0, 0]);
      const nb = far ? 3 : 6;
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * PI * 2;
        b.add(b.cyl(0.018, 0.018, len * 0.6, 7), 'handR', 'metal', [Math.cos(a) * 0.04, 0.05 + Math.sin(a) * 0.04, z0 + len * 0.3], [PI / 2, 0, 0]);
      }
      b.add(b.cyl(0.065, 0.065, 0.05, 12), 'handR', 'metal', [0, 0.05, z0 + len * 0.58], [PI / 2, 0, 0]);
      b.add(b.cyl(0.03, 0.03, 0.02, 10), 'handR', 'glow', [0, 0.05, z0 + len * 0.61], [PI / 2, 0, 0]);
    } else {
      b.add(b.cyl(0.04, 0.05, len * 0.7, 10), 'handR', 'metal', [0, 0.06, 0.42 + len * 0.35], [PI / 2, 0, 0]);
      b.add(b.cbox(0.1, 0.06, 0.12, 0.015), 'handR', 'trim', [0, 0.06, 0.42 + len * 0.7]);
    }
    b.add(b.cbox(0.014, 0.014, 0.36, 0.004), 'handR', 'glow', [0.08, 0.1, 0.14]);
    // ammo belt toward the backpack
    if (!far) b.add(b.tube([[0.0, -0.02, -0.1], [0.05, -0.18, -0.25], [0.16, -0.1, -0.45]], 0.03, 8, 5), 'handR', 'accent');
    if (r >= 2) b.add(b.cbox(0.05, 0.05, 0.2, 0.012), 'handR', 'glow', [0, 0.18, 0.12]);
  });
}

export function buildGunner(b, o) {
  const r = o.r, far = b.far, op = o.opts || {};
  // helm: wide with a forward ridge and multi-lens eyes
  b.add(b.cbox(0.24, 0.17, 0.25, 0.045), 'head', 'paint', [0, 0.06, 0.05]);
  b.add(b.ext([[-0.025, 0], [0.025, 0], [0.025, 0.22], [-0.025, 0.22]], 0.08, 0.012), 'head', 'accent', [0, 0.15, 0.06], [PI / 2, 0, 0]);
  b.add(b.cbox(0.2, 0.08, 0.06, 0.02), 'head', 'metal', [0, 0.03, 0.17]);
  for (const [x, y, s] of [[0.055, 0.06, 0.028], [-0.055, 0.06, 0.028], [0.06, 0.01, 0.018], [-0.06, 0.01, 0.018]])
    b.add(b.cyl(s, s, 0.02, 10), 'head', 'eye', [x, y, 0.2], [PI / 2, 0, 0]);
  b.sym(discX(b, 0.045, 0.04, 10), 'head', 'metal', [0.125, 0.05, 0.02]);
  if (!far) b.add(b.cyl(0.008, 0.012, 0.25, 5), 'head', 'metal', [-0.1, 0.2, -0.05], [-0.25, 0, 0.2]);
  // torso: armoured box with a heavy chest plate + side armour
  P(b, 'chest', 'metal', [0.44, 0.38, 0.34], [0, 0.1, -0.02], [0, 0, 0], { c: 0.04 });
  P(b, 'chest', 'paint', [0.56, 0.34, 0.38], [0, 0.15, 0.01], [0.1, 0, 0], { c: 0.06, tx: 1.1, bx: 0.8 });
  P(b, 'chest', 'accent', [0.3, 0.14, 0.06], [0, 0.22, 0.2], [0.35, 0, 0], { c: 0.02 });
  b.sym(b.cyl(0.025, 0.025, 0.02, 10), 'chest', 'glow', [0.15, 0.1, 0.2], [PI / 2 + 0.3, 0, 0]);
  if (r >= 1) b.add(b.cbox(0.2, 0.025, 0.02, 0.006), 'chest', 'glow', [0, 0.08, 0.205], [0.3, 0, 0]);
  b.add(b.cyl(0.15, 0.18, 0.18, 8), 'spine', 'metal', [0, 0.05, 0]);
  P(b, 'spine', 'accent', [0.28, 0.14, 0.12], [0, 0.05, 0.13], [0.1, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'paint', [0.4, 0.16, 0.3], [0, -0.01, 0], [0, 0, 0], { c: 0.04 });
  PS(b, 'pelvis', 'accent', [0.07, 0.24, 0.24], [0.22, -0.08, 0], [0, 0, 0.18], { c: 0.02 });
  // arms with round shoulder caps
  arms(b, o, { w: 1.1, fore: [0.21, 0.82, 0.22] });
  b.sym(b.sph(14, 10, 0, PI * 2, 0, PI * 0.55), 'upArm', 'paint', [0.03, 0.02, 0], [0, 0, -0.25], [0.17, 0.15, 0.19]);
  PS(b, 'upArm', 'accent', [0.24, 0.05, 0.28], [0.05, -0.06, 0], [0, 0, -0.3], { c: 0.02 });
  b.sym(b.cyl(0.03, 0.03, 0.02, 10), 'upArm', 'glow', [0.15, 0.04, 0.1], [1.1, 0, -0.5]);
  fists(b, o, 1.05);
  // ammo drum backpack
  b.add(b.cyl(0.17, 0.17, 0.34, 14), 'aux0', 'accent', [0, 0, 0], [0, 0, PI / 2]);
  b.sym(b.cyl(0.18, 0.18, 0.03, 14), 'aux0', 'trim', [0.17, 0, 0], [0, 0, PI / 2]);
  b.sym(b.cyl(0.05, 0.05, 0.01, 10), 'aux0', 'glow', [0.188, 0, 0], [0, 0, PI / 2]);
  if (r >= 2) thrusters(b, o, 'aux0', 0.12, -0.15, -0.08, 0.05);
  if (r >= 3) halo(b, 'aux0', [0, 0.32, 0.05], 0.22, 'glow', -0.15);
  legs(b, o, { w: 1.15 });
  bigGun(b, o, { rotary: op.rotary !== false });
  flair(b, o, { spikes: [['upArm', [0.1, 0.15, 0], [0, 0, -0.5], 1]], crystals: [['aux0', [0.2, 0.15, 0], [0, 0, -0.5], 1]], antenna: ['head', [0.1, 0.18, -0.04]] });
}
