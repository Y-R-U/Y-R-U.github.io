// KINGPIN signature FX (sculptor-16). "Never fights. Has people for that."
// Drone Sting: a scrap drone kicks out of a hive cell with a puff, arcs over the board on an orange trail, hovers over the target
//   for a beat and stings it with two zaps, then the spent drone pops (gold sparks).
// Swarm Contract (overdrive): the racks swing open and ~20 drones pour out like hornets: a buzzing cloud boils round the throne,
//   then they peel off in a stream at the enemy side, zip across it with tracers (one sting per hit) and the survivors fly home.
//   Allies get the contract's overclock as a gold drone that drops a coin-ring on them (buff hook).
const C = (T, r, g, b) => new T.Color(r, g, b);
const ORANGE = (T) => C(T, 3.0, 1.1, 0.25);
const GOLD = (T) => C(T, 2.4, 1.6, 0.5);
const RED = (T) => C(T, 2.6, 0.35, 0.2);
const SMOKE = (T) => C(T, 0.16, 0.13, 0.12);

function puff(ctx, p, k = 1) {
  const { fx, THREE } = ctx;
  fx.vfx.add.spawn({ pos: p.clone(), color: ORANGE(THREE), life: 0.1, size: 0.5 * k, size1: 0.1, kind: 4 });
  for (let i = 0; i < 3; i++) fx.vfx.alpha.spawn({ pos: p.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8), color: SMOKE(THREE), alpha: 0.5, life: 0.6, size: 0.25 * k, size1: 0.7 * k, kind: 2, floor: false });
}
// one drone sortie: launch at a, arc to a hover point over b, sting twice, pop. `t` = total flight time.
function sortie(ctx, a, b, t, k = 1, home = null) {
  const { fx, THREE } = ctx;
  const hover = b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
  const fly = Math.max(0.12, t * 0.75);
  fx.bolt(a, hover, ORANGE(THREE), fly, { size: 0.4 * k, arc: 0.6 + Math.random() * 0.9, trail: true });
  fx.after(fly, () => {
    for (let z = 0; z < 2; z++) fx.after(z * 0.06, () => {
      fx.tracer(hover, b.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3)), RED(THREE), 0.06);
      fx.vfx.add.spawn({ pos: hover.clone(), color: ORANGE(THREE), life: 0.08, size: 0.35 * k, size1: 0.05, kind: 4 });
    });
    if (home) fx.after(0.14, () => fx.bolt(hover, home, GOLD(THREE), 0.45, { size: 0.18, arc: 0.8, trail: true }));
    else fx.after(0.14, () => fx.sparks(hover, GOLD(THREE), 8, 3));
  });
}

export default {
  attack(ctx) {
    const { fx, src, target, timing } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core');
    puff(ctx, a);
    sortie(ctx, a, b, Math.max(0.25, timing.travel || 0.5));
  },
  shot(ctx) {
    const { fx, src, shot, target, timing } = ctx;
    if (shot.index === 0 && shot.phase === 'attack') return;
    if (shot.type === 'cast') {
      // overdrive open: the racks crack, a buzzing cloud boils out round the throne
      const { THREE } = ctx;
      fx.drones({ around: src.root, n: 14, radius: 2.0, height: (src.height || 4) * 0.75, speed: 3.2, color: ORANGE(THREE), life: 1.7 });
      for (const s of ['rackL', 'rackR']) { const p = src.pos(s); puff(ctx, p, 1.6); fx.sparks(p, GOLD(THREE), 10, 3); }
      fx.shake(0.15);
      return;
    }
    puff(ctx, shot.socket || src.pos('muzzle'), shot.phase === 'overdrive' ? 0.8 : 1);
    if (shot.phase === 'attack' && target) sortie(ctx, shot.socket || src.pos('muzzle'), target.pos('core'), Math.max(0.25, (timing.travel || 0.5) - 0.1), 0.8);
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx;
    if (!target) return 'default';
    const p = target.pos('core');
    fx.impact(p, ORANGE(THREE), hit?.crit ? 1.3 : 0.8);
    fx.sparks(p, GOLD(THREE), hit?.crit ? 14 : 8, 3.5);
    fx.vfx.rings.spawn({ pos: p.clone(), color: GOLD(THREE), r0: 0.15, r1: hit?.crit ? 1.0 : 0.6, thick: 0.05, life: 0.25, kind: 0, face: true });
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const live = (targets || []).filter(Boolean);
    if (!live.length) return 'default';
    const L = src.pos('rackL'), R = src.pos('rackR'), home = src.pos('core');
    fx.shake(0.25);
    // the stream: two drones per target pick (10 picks -> 20 drones), alternating racks, staggered like a hornet swarm
    live.forEach((t, i) => {
      for (let j = 0; j < 2; j++) fx.after(i * 0.06 + j * 0.03, () => {
        const a = (i + j) % 2 ? L : R;
        sortie(ctx, a, t.pos('core'), 0.42 + Math.random() * 0.15, 0.9, j === 0 && i % 2 === 0 ? home : null);
      });
    });
    // a swarm cloud over the enemy side while they work
    const c = live.reduce((s, t) => s.add(new THREE.Vector3(t.x, 0, t.z)), new THREE.Vector3()).multiplyScalar(1 / live.length);
    fx.after(0.35, () => fx.drones({ around: c.clone().setY(2.6), n: 10, radius: 3.0, height: 0.8, speed: 4, color: ORANGE(THREE), life: 1.2 }));
  },
  buff(ctx) {
    // contract overclock on an ally: a gold drone drops a coin-ring on them
    const { fx, THREE, src, target, buff } = ctx;
    if (!target || buff?.status !== 'overclock') return 'default';
    const p = target.pos('core'), top = p.clone().add(new THREE.Vector3(0, 1.4, 0));
    fx.bolt(src.pos('rackL'), top, GOLD(THREE), 0.35, { size: 0.2, arc: 0.8, trail: true });
    fx.after(0.35, () => {
      fx.buffAura(new THREE.Vector3(target.x, 0, target.z), GOLD(THREE));
      fx.vfx.rings.spawn({ pos: top.clone(), color: GOLD(THREE), r0: 0.5, r1: 0.1, thick: 0.08, life: 0.35, kind: 0, face: true });
      fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.07, target.z), color: GOLD(THREE), r0: 0.3, r1: 1.5, thick: 0.1, life: 0.45, kind: 2 });
    });
  },
  deploy(ctx) {
    // thrusters catch the throne: an orange ground ring and exhaust smoke as it lands
    const { fx, THREE, src } = ctx;
    fx.after(0.55, () => {
      const base = new THREE.Vector3(src.x, 0.06, src.z);
      fx.vfx.rings.spawn({ pos: base, color: ORANGE(THREE), r0: 0.3, r1: 2.2, thick: 0.14, life: 0.45, kind: 0 });
      for (let i = 0; i < 6; i++) fx.vfx.alpha.spawn({ pos: base.clone().setY(0.3), vel: new THREE.Vector3(Math.cos(i) * 2, 0.4, Math.sin(i) * 2), color: SMOKE(THREE), alpha: 0.5, life: 0.8, size: 0.4, size1: 1.2, kind: 2, floor: false });
    });
    return 'default';
  },
};
