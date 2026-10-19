// Tracked chassis: tread hull at the pelvis, a small torso on top. Legs bones carry no geometry.
import { P, PS, arms, fists, visor, flair, halo, fin, discX, plate, PI } from '../mech.js';

export const TRACKED_DIMS = {
  hover: 0.42, thigh: 0.2, shin: 0.2, ankle: 0.02, hipX: 0.2, spine: 0.16, chest: 0.2, neck: 0.24, headOff: 0.04,
  clavX: 0.06, clavY: 0.18, shoulder: 0.2, upArm: 0.24, foreArm: 0.24, aux0: [0, 0.2, -0.12], aux1: [0, 0.16, 0],
};

// opts.mast = tall antenna + dish (jammer)
export function buildTracked(b, o) {
  const r = o.r, far = b.far, op = o.opts || {};
  // treads
  for (const sx of [1, -1]) {
    const x = sx * 0.34;
    b.add(b.cbox(0.2, 0.34, 1.0, 0.1), 'pelvis', 'metal', [x, -0.24, 0]);
    b.add(b.cbox(0.22, 0.12, 0.8, 0.03), 'pelvis', 'paint', [x, -0.04, 0.02]);
    if (!far) for (let i = 0; i < 4; i++) b.add(b.cyl(0.07, 0.07, 0.22, 10), 'pelvis', 'accent', [x, -0.28, -0.33 + i * 0.22], [0, 0, PI / 2]);
    b.add(b.cbox(0.01, 0.02, 0.6, 0.004), 'pelvis', 'glow', [x + sx * 0.112, -0.14, 0]);
  }
  P(b, 'pelvis', 'paint', [0.52, 0.2, 0.86], [0, -0.04, 0], [0, 0, 0], { c: 0.05, tx: 0.85, tz: 0.85 });
  P(b, 'pelvis', 'accent', [0.4, 0.06, 0.18], [0, 0.0, 0.4], [-0.5, 0, 0], { c: 0.02 });
  // torso
  b.add(b.cyl(0.14, 0.18, 0.18, 8), 'spine', 'metal', [0, 0.04, 0]);
  P(b, 'chest', 'paint', [0.42, 0.3, 0.32], [0, 0.12, 0], [0.05, 0, 0], { c: 0.05, tx: 1.1, bx: 0.8 });
  b.add(b.cyl(0.04, 0.04, 0.03, 12), 'chest', 'glow', [0, 0.12, 0.17], [PI / 2, 0, 0]);
  b.add(b.cbox(0.2, 0.14, 0.18, 0.04), 'head', 'paint', [0, 0.05, 0.04]);
  visor(b, 'head', 0.15, 0.03, [0, 0.06, 0.135]);
  arms(b, o, { w: 0.85, fore: [0.15, 0.75, 0.16] });
  fists(b, o, 0.8);
  if (op.mast) {
    b.add(b.cyl(0.025, 0.035, 1.1, 8), 'aux0', 'metal', [0, 0.55, 0]);
    b.add(b.cyl(0.018, 0.018, 0.5, 6), 'aux0', 'accent', [0, 1.3, 0]);
    b.add(b.sph(14, 8, 0, PI * 2, 0, PI * 0.35), 'aux0', 'trim', [0, 1.0, 0.06], [PI / 2 - 0.3, 0, 0], [0.22, 0.12, 0.22]);
    b.add(b.cyl(0.03, 0.03, 0.05, 8), 'aux0', 'glow', [0, 1.02, 0.12], [PI / 2 - 0.3, 0, 0]);
    b.add(b.sph(8, 6), 'aux0', 'glow', [0, 1.57, 0], [0, 0, 0], 0.03);
    if (r >= 1) b.add(b.sph(12, 8, 0, PI * 2, 0, PI * 0.35), 'aux0', 'trim', [0, 0.7, -0.05], [-PI / 2 + 0.3, 0, 0], [0.15, 0.08, 0.15]);
  }
  if (r >= 3) halo(b, 'aux0', [0, 0.4, 0], 0.22, 'glow', -0.2);
  flair(b, o, { spikes: [['pelvis', [0.3, 0.08, 0.3], [0.6, 0, -0.3], 0.8]] });
}
