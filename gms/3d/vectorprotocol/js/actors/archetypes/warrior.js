// Blade warrior / brawler: heroic hunched mid-heavy frame. opts.weapon = 'blade' | 'fists'.
import { P, PS, legs, arms, fists, visor, thrusters, flair, halo, fin, discX, plate, PI } from '../mech.js';

export const WARRIOR_DIMS = {
  thigh: 0.42, shin: 0.42, ankle: 0.12, hipX: 0.16, hipY: -0.05, spine: 0.13, chest: 0.27, neck: 0.27, headOff: 0.03,
  clavX: 0.07, clavY: 0.23, shoulder: 0.28, upArm: 0.3, foreArm: 0.3, aux0: [0, 0.2, -0.24],
};

// Sword authored in the hold frame (hand pitched ~-0.8 total); blade points forward-down from the fist.
export function sword(b, o, { len = 1.15, frame = 0.8, broad = 1 } = {}) {
  const r = o.r;
  b.scope([0, -0.07, 0], [frame, 0, 0], 1, () => {
    b.add(b.cyl(0.03, 0.03, 0.26, 8), 'handR', 'metal', [0, 0, -0.03], [PI / 2, 0, 0]);
    b.add(b.cbox(0.24 * broad, 0.07, 0.07, 0.015), 'handR', 'trim', [0, 0, 0.12]);
    b.add(b.cyl(0.035, 0.035, 0.05, 8), 'handR', 'glow', [0, 0, 0.12], [0, 0, PI / 2]);
    // blade: tapered bevelled slab with a glowing edge strip
    const W = 0.11 * broad;
    b.add(b.ext([[-W / 2, 0], [W / 2, 0], [W / 2, len * 0.82], [0, len], [-W / 2, len * 0.82]], 0.03, 0.012), 'handR', 'metal', [0, 0, 0.15], [PI / 2, 0, 0]);
    b.add(b.ext([[-0.012, 0], [0.012, 0], [0.012, len * 0.8], [0, len * 0.93], [-0.012, len * 0.8]], 0.036, 0.004), 'handR', 'glow', [0, 0, 0.16], [PI / 2, 0, 0]);
    if (r >= 2) b.sym(b.cbox(0.012, 0.012, len * 0.6, 0.003), 'handR', 'glow', [W / 2 + 0.002, 0, 0.2 + len * 0.3]);
    if (r >= 3) b.sym(fin(b, [[0, 0], [0.14, 0], [0.03, 0.1]], 0.03, 0.006), 'handR', 'trim', [0.12 * broad, 0, 0.12], [PI / 2, 0, 0]);
  });
}

export function buildWarrior(b, o) {
  const r = o.r, far = b.far, op = o.opts || {}, brawler = op.weapon === 'fists';
  // head: compact helm with brow crest + side vanes
  b.add(b.cbox(0.22, 0.19, 0.24, 0.045), 'head', 'paint', [0, 0.06, 0.07]);
  P(b, 'head', 'accent', [0.24, 0.06, 0.22], [0, 0.14, 0.08], [0.2, 0, 0], { c: 0.02, tx: 0.6 });
  b.add(b.cbox(0.17, 0.08, 0.06, 0.02), 'head', 'metal', [0, 0.02, 0.18]);
  visor(b, 'head', 0.16, 0.04, [0, 0.08, 0.19], [0, 0, 0], 0.03);
  b.sym(b.cyl(0.018, 0.018, 0.02, 8), 'head', 'eye', [0.045, 0.02, 0.21], [PI / 2, 0, 0]);
  if (!brawler || r >= 2) b.add(fin(b, [[0, 0], [0.05, 0], [-0.08, 0.2], [-0.12, 0.19]], 0.03, 0.006), 'head', 'trim', [0, 0.15, 0.12], [0, PI / 2, 0]);
  b.sym(fin(b, [[0, 0], [0.06, 0], [0.02, 0.16]], 0.02, 0.005), 'head', 'trim', [0.12, 0.08, 0.02], [-0.6, 0, -0.5]);
  // torso: broad chest, angular pecs, core
  P(b, 'chest', 'metal', [0.44, 0.4, 0.36], [0, 0.1, -0.02], [0, 0, 0], { c: 0.04 });
  P(b, 'chest', 'paint', [0.6, 0.38, 0.4], [0, 0.16, 0.02], [0.1, 0, 0], { c: 0.06, tx: 1.15, bx: 0.7, bz: 0.85 });
  PS(b, 'chest', 'accent', [0.22, 0.2, 0.07], [0.12, 0.18, 0.22], [0.3, 0.25, 0.05], { c: 0.03, bx: 0.7 });
  b.add(b.cyl(0.05, 0.05, 0.03, 14), 'chest', 'glow', [0, 0.08, 0.23], [PI / 2 + 0.3, 0, 0]);
  b.add(b.tor(0.06, 0.013, 16, 5), 'chest', 'trim', [0, 0.08, 0.235], [0.3, 0, 0]);
  P(b, 'chest', 'paint', [0.46, 0.26, 0.16], [0, 0.17, -0.22], [0, 0, 0], { c: 0.04 });
  b.add(b.cyl(0.16, 0.19, 0.18, 8), 'spine', 'metal', [0, 0.05, 0]);
  P(b, 'spine', 'accent', [0.3, 0.14, 0.12], [0, 0.05, 0.14], [0.1, 0, 0], { c: 0.025 });
  P(b, 'pelvis', 'paint', [0.4, 0.17, 0.3], [0, -0.01, 0], [0, 0, 0], { c: 0.04, bx: 0.8 });
  P(b, 'pelvis', 'accent', [0.18, 0.2, 0.06], [0, -0.1, 0.16], [-0.12, 0, 0], { c: 0.02, bx: 0.55 });
  PS(b, 'pelvis', 'paint', [0.06, 0.24, 0.24], [0.22, -0.09, 0], [0, 0, 0.18], { c: 0.02 });
  // arms: brawler gets massive forearms
  arms(b, o, { w: brawler ? 1.3 : 1.1, fore: brawler ? [0.27, 0.9, 0.28] : [0.2, 0.82, 0.21] });
  b.sym(b.sph(16, 10, 0, PI * 2, 0, PI * 0.55), 'upArm', 'paint', [0.03, 0.02, 0], [0, 0, -0.3], brawler ? [0.21, 0.2, 0.23] : [0.18, 0.17, 0.2]);
  PS(b, 'upArm', 'accent', [0.28, 0.06, 0.32], [0.06, -0.07, 0], [0, 0, -0.35], { c: 0.025 });
  PS(b, 'upArm', 'trim', [0.26, 0.02, 0.3], [0.065, -0.11, 0], [0, 0, -0.35]);
  if (r >= 1) PS(b, 'upArm', 'paint', [0.2, 0.18, 0.06], [0.1, 0.0, 0.12], [0.3, 0.3, -0.3], { c: 0.02 });
  if (r >= 2) b.sym(b.cyl(0.025, 0.025, 0.02, 10), 'upArm', 'glow', [0.17, 0.05, 0.12], [1.1, 0, -0.5]);
  fists(b, o, brawler ? 1.45 : 1.05);
  if (brawler) {
    PS(b, 'foreArm', 'trim', [0.29, 0.04, 0.3], [0.01, -0.06, 0]);
    if (!far) PS(b, 'foreArm', 'metal', [0.06, 0.18, 0.06], [0.0, -0.2, -0.16], [0, 0, 0], { c: 0.01 });
    PS(b, 'hand', 'trim', [0.18, 0.04, 0.2], [0, -0.17, 0.02]);
  } else {
    sword(b, o, { len: op.len || 1.15, broad: op.broad || 1 });
    PS(b, 'foreArm', 'trim', [0.22, 0.035, 0.23], [0.01, -0.06, 0]);
  }
  legs(b, o, { w: brawler ? 1.25 : 1.1 });
  // back: armoured cape fins
  b.sym(fin(b, [[0, 0], [0.12, 0], [0.2, -0.5], [0.08, -0.62]], 0.03, 0.008), 'aux0', 'accent', [0.1, 0.05, -0.02], [0.25, 0, -0.1]);
  if (r >= 1) b.sym(fin(b, [[0, 0], [0.1, 0], [0.16, -0.4], [0.06, -0.48]], 0.025, 0.006), 'aux0', 'paint', [0.18, 0.06, -0.06], [0.3, 0, -0.35]);
  thrusters(b, o, 'chest', 0.12, 0.18, -0.31, 0.055);
  if (r >= 3) halo(b, 'aux0', [0, 0.32, 0], 0.25, 'glow', -0.15);
  flair(b, o, {
    spikes: [['upArm', [0.1, 0.17, 0], [0, 0, -0.5], 1], ['foreArm', [0.12, -0.12, 0], [0, 0, -1.2], 0.8]],
    crystals: [['upArm', [0.13, 0.18, -0.04], [0.2, 0, -0.4], 1.1]],
    antenna: ['head', [-0.09, 0.15, 0]],
  });
}
