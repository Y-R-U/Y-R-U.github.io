// DRONE: small generic hover grunt (scrap / security / lab drones; faction tint does the rest). Owner: robots.
// Body = sensor ball on the chest bone, two ducted rotors on aux2/aux3 (spun in tick), twin gun pods under the chin.
import { P, plate, fin, PI, BI } from '../kit.js';

const DIMS = {
  hover: 0.8, thigh: 0.1, shin: 0.1, ankle: 0.02, hipX: 0.06, spine: 0.02, chest: 0.05, neck: 0.12, headOff: 0.02,
  clavX: 0.04, clavY: 0.05, shoulder: 0.08, upArm: 0.12, foreArm: 0.1,
  parents: { aux2: 'chest', aux3: 'chest' }, aux2: [0.3, 0.06, -0.02], aux3: [-0.3, 0.06, -0.02],
};

function build(b, o) {
  const far = b.far;
  b.add(b.sph(18, 12), 'chest', 'paint', [0, 0.04, 0], [0, 0, 0], [0.2, 0.17, 0.22]);
  b.add(b.cyl(0.205, 0.205, 0.05, 18), 'chest', 'accent', [0, 0.02, 0]);
  P(b, 'chest', 'metal', [0.2, 0.08, 0.16], [0, -0.12, 0.02], [0, 0, 0], { c: 0.02 });
  // eye
  b.add(b.cyl(0.075, 0.075, 0.04, 16), 'head', 'metal', [0, -0.04, 0.17], [PI / 2, 0, 0]);
  b.add(b.cyl(0.05, 0.05, 0.05, 16), 'head', 'eye', [0, -0.04, 0.18], [PI / 2, 0, 0]);
  // gun pods
  for (const x of [0.09, -0.09]) {
    b.add(b.cyl(0.025, 0.025, 0.22, 8), 'chest', 'metal', [x, -0.13, 0.12], [PI / 2, 0, 0]);
    b.add(b.cyl(0.016, 0.016, 0.02, 8), 'chest', 'glow', [x, -0.13, 0.235], [PI / 2, 0, 0]);
  }
  // rotor ducts (static ring on chest, spinning blades on aux)
  for (const x of [0.3, -0.3]) {
    b.add(b.tor(0.13, 0.025, 20, 6), 'chest', 'paint', [x, 0.06, -0.02], [PI / 2, 0, 0]);
    b.add(b.cbox(0.16, 0.03, 0.04, 0.01), 'chest', 'metal', [x * 0.6, 0.05, -0.02]);
    b.add(b.cyl(0.1, 0.1, 0.004, 16), 'chest', 'glow', [x, 0.04, -0.02]);
  }
  for (const a of ['aux2', 'aux3']) for (let i = 0; i < 3; i++) b.add(b.cbox(0.22, 0.008, 0.035, 0.003), a, 'metal', [0, 0, 0], [0, i * PI / 3, 0.15]);
  if (!far) b.add(b.cyl(0.004, 0.006, 0.18, 4), 'chest', 'metal', [0.06, 0.25, -0.05], [-0.2, 0, 0.2]);
  if (o.rank >= 2) b.add(b.tor(0.24, 0.006, 24, 3), 'chest', 'glow', [0, 0.02, 0], [PI / 2, 0, 0]);
}

export default {
  id: 'drone', name: 'DRONE', role: 'archer', faction: 'rogue', rarity: 'common', realm: 'scifi',
  rig: 'hover', dims: DIMS, height: 1.0, radius: 0.4, walkSpeed: 1.5, scheme: 'dark',
  style: { weapon: 'orbs' },
  sockets: { muzzle: ['chest', [0.09, -0.13, 0.25]], muzzleL: ['chest', [-0.09, -0.13, 0.25]], core: [0, 0.04, 0.2], head: [0, 0.1, 0.1] },
  events: { attack: [['fire', 0.4], ['fire', 0.5]] },
  tick(unit, dt, ctx, bones) {
    const dead = unit.dead || unit.state.action === 'die';
    ctx.spin = ((ctx.spin || 0) + dt * (dead ? 2 : 40)) % (PI * 2);
    bones[BI.aux2].rotation.set(0, ctx.spin, 0); bones[BI.aux3].rotation.set(0, -ctx.spin, 0);
  },
  fxHints: { projectile: 'zap' },
  build,
};
