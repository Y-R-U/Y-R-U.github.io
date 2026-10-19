// Heavy shield tank: hunched gorilla stance, huge domed pauldrons, sunken head, tower shield on the left forearm.
import { P, PS, legs, arms, fists, visor, thrusters, flair, halo, fin, discX, ringH, plate, PI } from '../mech.js';

export const TANK_DIMS = {
  thigh: 0.4, shin: 0.4, ankle: 0.14, hipX: 0.21, hipY: -0.06, spine: 0.14, chest: 0.3, neck: 0.26, headOff: 0.0,
  clavX: 0.1, clavY: 0.24, shoulder: 0.36, upArm: 0.32, foreArm: 0.34, aux0: [0, 0.2, -0.3],
};

// opts: { shield: 'tower'|'kite'|'none', arm: 'fist'|'cannon', crest }
export function buildTank(b, o) {
  const r = o.r, far = b.far, op = o.opts || {};
  // ---- head: low, forward, armoured brow + visor
  b.add(b.cbox(0.27, 0.2, 0.28, 0.05), 'head', 'paint', [0, 0.04, 0.12]);
  P(b, 'head', 'accent', [0.3, 0.07, 0.24], [0, 0.135, 0.12], [0.18, 0, 0], { c: 0.025, tx: 0.8 });
  b.add(b.cbox(0.24, 0.1, 0.06, 0.02), 'head', 'metal', [0, 0.0, 0.25]);
  visor(b, 'head', 0.2, 0.045, [0, 0.07, 0.262], [0, 0, 0], 0.025);
  b.sym(b.cyl(0.026, 0.026, 0.02, 10), 'head', 'eye', [0.06, 0.005, 0.282], [PI / 2, 0, 0]);
  b.sym(discX(b, 0.05, 0.05, 10), 'head', 'metal', [0.14, 0.04, 0.1]);
  if (op.crest || r >= 2) b.add(plate(b, 0.05, 0.12, 0.26, { c: 0.012, tx: 0.6, tz: 0.6 }), 'head', 'trim', [0, 0.2, 0.08], [0.1, 0, 0]);
  // ---- torso: barrel chest, high collar behind the head
  P(b, 'chest', 'metal', [0.56, 0.5, 0.46], [0, 0.12, -0.02], [0, 0, 0], { c: 0.05 });
  P(b, 'chest', 'paint', [0.74, 0.46, 0.5], [0, 0.18, 0.03], [0.12, 0, 0], { c: 0.08, tx: 1.18, tz: 1.05, bx: 0.78, bz: 0.9 });
  PS(b, 'chest', 'accent', [0.28, 0.24, 0.08], [0.15, 0.2, 0.28], [0.32, 0.22, 0.05], { c: 0.035, tx: 1.1, bx: 0.85 });
  P(b, 'chest', 'paint', [0.62, 0.26, 0.24], [0, 0.4, -0.15], [-0.35, 0, 0], { c: 0.05, tx: 0.9 });
  P(b, 'chest', 'metal', [0.5, 0.36, 0.2], [0, 0.18, -0.28], [0, 0, 0], { c: 0.04 });
  // reactor core
  b.add(b.tor(0.075, 0.018, 20, 6), 'chest', 'trim', [0, 0.1, 0.305], [0.25, 0, 0]);
  b.add(b.cyl(0.062, 0.062, 0.03, 16), 'chest', 'glow', [0, 0.1, 0.3], [PI / 2 + 0.25, 0, 0]);
  // vent grille
  if (!far) for (let i = 0; i < 4; i++) b.add(b.cbox(0.2, 0.014, 0.02, 0.005), 'chest', 'metal', [0, -0.02 - i * 0.03, 0.27 - i * 0.008], [0.2, 0, 0]);
  thrusters(b, o, 'chest', 0.17, 0.25, -0.38, 0.07);
  // abdomen + pelvis skirt
  b.add(b.cyl(0.2, 0.24, 0.2, 10), 'spine', 'metal', [0, 0.06, 0]);
  P(b, 'spine', 'accent', [0.38, 0.16, 0.14], [0, 0.06, 0.18], [0.1, 0, 0], { c: 0.03, tx: 1.1 });
  P(b, 'pelvis', 'paint', [0.5, 0.2, 0.36], [0, -0.02, 0], [0, 0, 0], { c: 0.05, tx: 1.05, bx: 0.85 });
  P(b, 'pelvis', 'accent', [0.24, 0.22, 0.08], [0, -0.12, 0.2], [-0.12, 0, 0], { c: 0.03, bx: 0.65 });
  PS(b, 'pelvis', 'paint', [0.08, 0.26, 0.28], [0.27, -0.1, 0], [0, 0, 0.2], { c: 0.025, bx: 1.1 });
  // ---- arms
  arms(b, o, { w: 1.35, fore: [0.26, 0.85, 0.27] });
  // pauldrons: big layered domes
  b.sym(b.sph(18, 12, 0, PI * 2, 0, PI * 0.55), 'upArm', 'paint', [0.04, 0.02, 0], [0, 0, -0.3], [0.25, 0.22, 0.27]);
  PS(b, 'upArm', 'accent', [0.36, 0.08, 0.4], [0.07, -0.08, 0], [0, 0, -0.35], { c: 0.03, tx: 0.95 });
  PS(b, 'upArm', 'trim', [0.33, 0.025, 0.38], [0.075, -0.13, 0], [0, 0, -0.35]);
  if (r >= 1) PS(b, 'upArm', 'paint', [0.3, 0.07, 0.34], [0.09, -0.17, 0], [0, 0, -0.42], { c: 0.025 });
  if (r >= 2) PS(b, 'upArm', 'glow', [0.02, 0.02, 0.3], [0.2, 0.06, 0], [0, 0, -0.75]);
  if (r >= 3) b.sym(fin(b, [[-0.06, 0], [0.06, 0], [0.01, 0.3]], 0.05, 0.01), 'upArm', 'trim', [0.08, 0.2, -0.06], [-0.35, 0, -0.3]);
  // shoulder lamps (the ref's dotted lights)
  b.sym(b.cyl(0.03, 0.03, 0.02, 10), 'upArm', 'glow', [0.17, 0.08, 0.17], [1.1, 0, -0.5]);
  if (!far) b.sym(b.cyl(0.02, 0.02, 0.02, 8), 'upArm', 'glow', [0.2, -0.02, 0.13], [1.2, 0, -0.6]);
  // forearm cuffs
  PS(b, 'foreArm', 'trim', [0.29, 0.04, 0.3], [0.01, -0.06, 0]);
  // right hand: fist or arm cannon
  if (op.arm === 'cannon') {
    b.add(b.cyl(0.085, 0.1, 0.34, 12), 'handR', 'metal', [0, -0.1, 0]);
    b.add(b.cyl(0.05, 0.05, 0.12, 10), 'handR', 'accent', [0, -0.3, 0]);
    b.add(b.cyl(0.04, 0.04, 0.02, 10), 'handR', 'glow', [0, -0.365, 0]);
  } else fists(b, o, 1.45, 'R');
  b.add(b.cbox(0.13, 0.12, 0.14, 0.025), 'handL', 'metal', [0, -0.06, 0]);
  // ---- shield (authored in the guard pose's frame: forearm pitched ~-1.25)
  const sh = op.shield || 'tower';
  if (sh !== 'none') {
    b.scope([0, 0, 0], [1.2, -0.3, 0], 1, () => {
      const W = sh === 'kite' ? 0.6 : 0.68, H = sh === 'kite' ? 1.05 : 1.25;
      const out = [[-W / 2, -H * 0.38], [-W / 2 + 0.06, -H / 2], [W / 2 - 0.06, -H / 2], [W / 2, -H * 0.38], [W / 2, H * 0.42], [W / 2 - 0.1, H / 2], [-W / 2 + 0.1, H / 2], [-W / 2, H * 0.42]];
      if (sh === 'kite') { out[1] = [0, -H / 2 - 0.12]; out[2] = [0.001, -H / 2 - 0.12]; }
      const z = 0.2, x = 0.2, y = -0.12;
      b.add(b.ext(out, 0.07, 0.015), 'foreArmL', 'paint', [x, y, z]);
      b.add(b.ext(out.map(([a, c]) => [a * 0.78, c * 0.85]), 0.03, 0.01), 'foreArmL', 'accent', [x, y, z + 0.045]);
      // gold side strips + glow spine + emblem chevron
      for (const sx of [-1, 1]) b.add(b.cbox(0.045, H * 0.78, 0.05, 0.01), 'foreArmL', 'trim', [x + sx * (W / 2 - 0.03), y, z + 0.035]);
      b.add(b.cbox(0.03, H * 0.6, 0.02, 0.008), 'foreArmL', 'glow', [x, y - 0.05, z + 0.065]);
      b.add(b.ext([[-0.12, 0.05], [0, -0.06], [0.12, 0.05], [0.12, 0.1], [0, -0.01], [-0.12, 0.1]], 0.02, 0.004), 'foreArmL', 'trim', [x, y + H * 0.28, z + 0.065]);
      if (r >= 1 && !far) for (const sx of [-1, 1]) for (const yy of [-0.35, 0.35]) b.add(b.cyl(0.018, 0.018, 0.02, 8), 'foreArmL', 'glow', [x + sx * W * 0.32, y + yy * H, z + 0.06], [PI / 2, 0, 0]);
      if (r >= 2) b.add(b.cbox(W * 0.9, 0.05, 0.04, 0.01), 'foreArmL', 'glow', [x, y - H * 0.42, z + 0.05]);
      if (r >= 3) b.add(fin(b, [[-0.05, 0], [0.05, 0], [0, 0.22]], 0.04, 0.008), 'foreArmL', 'trim', [x, y + H / 2, z]);
    });
  }
  // ---- legs (thick, short, planted)
  legs(b, o, { w: 1.45, foot: 'claw' });
  // back pack
  P(b, 'aux0', 'accent', [0.42, 0.34, 0.16], [0, 0, 0], [0, 0, 0], { c: 0.04 });
  if (r >= 2) b.sym(b.cyl(0.05, 0.05, 0.3, 8), 'aux0', 'metal', [0.15, 0.2, -0.02]);
  if (r >= 3) halo(b, 'aux0', [0, 0.35, 0.02], 0.26, 'glow', -0.15);
  flair(b, o, {
    spikes: [['upArm', [0.12, 0.2, 0], [0, 0, -0.5], 1.2], ['chest', [0.22, 0.42, -0.15], [-0.4, 0, -0.4]]],
    crystals: [['upArm', [0.16, 0.22, -0.05], [0.2, 0, -0.4], 1.3]],
    antenna: ['head', [-0.12, 0.2, 0.0]],
  });
}
