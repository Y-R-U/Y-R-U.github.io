// Hover caster: slender torso, tall horned head fins, flared shoulder vanes, plated skirt, legs taper to points.
// Orbs ride the aux2/aux3 bones (units.js steers them to the palms).
import { P, PS, arms, openHands, visor, flair, halo, fin, discX, plate, shell, PI } from '../mech.js';

export const MAGE_DIMS = {
  hover: 1.02, thigh: 0.36, shin: 0.38, ankle: 0.05, hipX: 0.1, hipY: -0.04, spine: 0.13, chest: 0.21, neck: 0.25, headOff: 0.05,
  clavX: 0.05, clavY: 0.19, shoulder: 0.18, upArm: 0.27, foreArm: 0.26, aux0: [0, 0.16, -0.14], aux2: [0.5, 0.3, 0.1], aux3: [-0.5, 0.3, 0.1],
};

function orb(b, o, bone) {
  const r = o.r;
  b.add(b.sph(16, 12), bone, 'glow', [0, 0, 0], [0, 0, 0], 0.085);
  b.add(b.tor(0.13, 0.008, 24, 4), bone, 'trim', [0, 0, 0], [PI / 2, 0, 0]);
  b.add(b.tor(0.15, 0.006, 24, 4), bone, 'trim', [0, 0, 0], [0.4, 0.9, 0]);
  if (r >= 1) b.add(b.tor(0.11, 0.004, 24, 3), bone, 'glow', [0, 0, 0], [1.2, 0, 0.4]);
  if (r >= 2) for (let i = 0; i < 4; i++) { const a = i * PI / 2; b.add(fin(b, [[-0.012, 0], [0.012, 0], [0, 0.07]], 0.01, 0.003), bone, 'trim', [Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0], [0, 0, a - PI / 2]); }
}

export function buildMage(b, o) {
  const r = o.r, far = b.far, op = o.opts || {}, hood = !!op.hood;
  // head: narrow mask + tall swept horn fins (ref Oracle)
  b.add(plate(b, 0.14, 0.18, 0.18, { c: 0.035, tx: 0.75, bx: 0.85, tz: 0.85 }), 'head', 'paint', [0, 0.06, 0.03]);
  P(b, 'head', 'accent', [0.12, 0.08, 0.06], [0, 0.04, 0.12], [-0.1, 0, 0], { c: 0.02, bx: 0.5 });
  visor(b, 'head', 0.11, 0.025, [0, 0.09, 0.115], [0.05, 0, 0], 0.025);
  if (hood) b.add(b.sph(14, 10, 0, PI * 2, 0, PI * 0.6), 'head', 'accent', [0, 0.07, -0.01], [-0.3, 0, 0], [0.13, 0.17, 0.15]);
  b.sym(fin(b, [[0, 0], [0.06, 0], [0.1, 0.3], [0.05, 0.28]], 0.03, 0.007), 'head', 'paint', [0.05, 0.1, -0.01], [-0.25, 0, -0.25]);
  if (r >= 1) b.sym(fin(b, [[0, 0], [0.015, 0], [0.07, 0.24], [0.06, 0.24]], 0.034, 0.004), 'head', 'glow', [0.06, 0.12, 0.0], [-0.25, 0, -0.25]);
  // torso: slim, hourglass, glowing sternum
  P(b, 'chest', 'metal', [0.26, 0.3, 0.2], [0, 0.08, -0.01], [0, 0, 0], { c: 0.03 });
  P(b, 'chest', 'paint', [0.38, 0.28, 0.24], [0, 0.13, 0.01], [0.08, 0, 0], { c: 0.05, tx: 1.15, bx: 0.6, bz: 0.8 });
  b.add(b.ext([[-0.03, 0], [0.03, 0], [0.05, 0.12], [0, 0.18], [-0.05, 0.12]], 0.03, 0.006), 'chest', 'glow', [0, 0.02, 0.13], [0.1, 0, 0]);
  PS(b, 'chest', 'accent', [0.12, 0.14, 0.05], [0.09, 0.17, 0.12], [0.3, 0.35, 0.1], { c: 0.02, bx: 0.6 });
  b.add(b.cyl(0.09, 0.11, 0.16, 8), 'spine', 'metal', [0, 0.05, 0]);
  P(b, 'spine', 'accent', [0.16, 0.12, 0.08], [0, 0.05, 0.08], [0.1, 0, 0], { c: 0.02, bx: 0.7 });
  P(b, 'pelvis', 'paint', [0.26, 0.12, 0.2], [0, 0, 0], [0, 0, 0], { c: 0.03 });
  // plated skirt: long tassets that read as a robe
  const n = far ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const a = -PI * 0.75 + (i / (n - 1)) * PI * 1.5, len = 0.5 + (Math.abs(Math.cos(a)) < 0.5 ? 0.12 : 0);
    const slot = i % 2 ? 'accent' : 'paint';
    b.add(b.ext([[-0.07, 0], [0.07, 0], [0.05, -len], [0, -len - 0.08], [-0.05, -len]], 0.022, 0.006), 'pelvis', slot,
      [Math.sin(a) * 0.15, -0.02, Math.cos(a) * 0.12], [-0.22 * Math.cos(a), a, 0.22 * Math.sin(a)]);
  }
  if (r >= 2) for (let i = 0; i < 2; i++) b.sym(b.cbox(0.012, 0.36, 0.012, 0.003), 'pelvis', 'glow', [0.09, -0.24, 0.12], [-0.25, 0, -0.2]);
  // shoulders: big upswept vanes (the ref's silhouette)
  arms(b, o, { w: 0.85, fore: [0.14, 0.75, 0.15] });
  b.sym(b.ext([[0, 0], [0.12, -0.02], [0.24, 0.24], [0.12, 0.42], [0.05, 0.2]], 0.035, 0.008), 'upArm', 'paint', [0.0, 0.0, 0.0], [0, -0.25, -0.15]);
  if (r >= 1) b.sym(b.cyl(0.03, 0.03, 0.02, 10), 'upArm', 'glow', [0.12, 0.13, 0.03], [PI / 2, -0.25, 0]);
  if (r >= 2) b.sym(b.ext([[0, 0], [0.09, -0.02], [0.18, 0.18], [0.1, 0.3]], 0.025, 0.006), 'upArm', 'accent', [0.06, -0.04, -0.06], [0.2, -0.5, -0.4]);
  PS(b, 'foreArm', 'trim', [0.16, 0.03, 0.17], [0.01, -0.2, 0]);
  openHands(b, o, 0.85);
  // legs: thin, tapering to points (no feet)
  b.sym(b.sph(10, 8), 'thigh', 'metal', [0, 0, 0], [0, 0, 0], 0.06);
  b.sym(shell(b, -0.02, -0.34, [0.07, 0.085, 0.07, 0.05], 8), 'thigh', 'paint');
  b.sym(discX(b, 0.045, 0.1, 10), 'shin', 'metal', [0, 0, 0]);
  b.sym(shell(b, -0.02, -0.4, [0.07, 0.065, 0.045, 0.012], 8), 'shin', 'accent');
  if (r >= 1) b.sym(b.cbox(0.012, 0.2, 0.012, 0.003), 'shin', 'glow', [0, -0.18, 0.06]);
  // back: floating crescent / halo
  b.add(b.tor(0.2, 0.018, 28, 5, PI * 1.2), 'aux0', 'accent', [0, 0.15, -0.05], [0.15, 0, -PI * 0.1 + PI]);
  if (r >= 2 || o.faction === 'legendary') halo(b, 'aux0', [0, 0.18, -0.06], 0.26, 'glow', -0.15);
  orb(b, o, 'aux2'); orb(b, o, 'aux3');
  flair(b, o, { spikes: [['upArm', [0.1, 0.25, 0], [0, 0, -0.3], 0.8]], crystals: [['chest', [0.22, 0.3, -0.12], [0.3, 0, -0.5], 1]] });
}
