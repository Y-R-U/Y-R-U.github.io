// NEEDLE signature FX (sculptor-12). Prism Drone: fine crystal needles, PRISM's palette in miniature.
// Prism Dart (basic, BEAM) = the lens flares (pink-white star + violet ring), a hair-thin violet needle with a white core streaks
// to the target; a faint spectrum ghost hangs on the line. Impact = a crystal needle sticks in the target (bright shard that
// hangs and fades), a small hex ring and three-colour sparks. attack_alt's second fire frame shoots a second needle (shot hook).
// Prism Volley (overdrive) = while the drone spins, each of the 4 fire frames looses a dart from wherever the lens points, curving
// in a fan to its random target (shot hook); the overdrive release adds a violet spin ring and a lens flash.
const SPEC = (THREE) => [new THREE.Color(2.0, 0.55, 3.6), new THREE.Color(3.0, 0.8, 2.4), new THREE.Color(0.6, 2.4, 3.4)];
const rnd = (a, b) => a + Math.random() * (b - a);

function flare(ctx, p, k = 1) {
  const { fx, THREE } = ctx, c = SPEC(THREE);
  fx.star(p, c[1], 2.4 * k, 0.14);
  fx.vfx.add.spawn({ pos: p.clone(), color: c[0], life: 0.14, size: 1.3 * k, size1: 0.2, kind: 0, floor: false });
  fx.vfx.rings.spawn({ pos: p.clone(), color: c[0], r0: 0.05, r1: 0.7 * k, thick: 0.06, life: 0.2, face: true });
  fx.light(p, c[0], 12 * k, 0.12);
}
// a hair-thin needle a->b: bright slug streak + white core + a faint lingering spectrum line
function needle(ctx, a, b, k = 1) {
  const { fx, THREE } = ctx, c = SPEC(THREE);
  fx.tracer(a, b, c[0], 0.22 * k);
  fx.vfx.beams.spawn({ a: a.clone(), b: b.clone(), color: new THREE.Color(2.4, 2.2, 2.8), width: 0.06 * k, core: 0.9, life: 0.1, taper: 0.1 });
  const side = new THREE.Vector3(0, 0.05, 0);
  fx.vfx.beams.spawn({ a: a.clone().add(side), b: b.clone().add(side), color: c[2].clone().multiplyScalar(0.35), width: 0.03, core: 0.2, life: 0.3, taper: 0.2, alpha: 0.5 });
}
// a curved dart (bolt with a sideways bow) for the volley
function dart(ctx, a, b, dur, bow) {
  const { fx, THREE } = ctx, c = SPEC(THREE);
  const mid = a.clone().lerp(b, 0.5).add(bow);
  // two legs approximate the curve: a fast bolt to the bow point, then on to the target
  const t1 = dur * 0.45;
  fx.bolt(a, mid, c[0], t1, { size: 0.6, trail: 2.4 });
  fx.after(t1, () => fx.bolt(mid, b, c[1], dur - t1, { size: 0.6, trail: 2.4 }));
  // the dart's path lingers as a fading violet line (two legs)
  fx.vfx.beams.spawn({ a: a.clone(), b: mid.clone(), color: c[0].clone().multiplyScalar(0.6), width: 0.09, core: 0.5, life: 0.45, taper: 0.3 });
  fx.after(t1, () => fx.vfx.beams.spawn({ a: mid.clone(), b: b.clone(), color: c[1].clone().multiplyScalar(0.6), width: 0.09, core: 0.5, life: 0.4, taper: 0.3 }));
}
function stick(ctx, p, k = 1, crit = false) {
  const { fx, THREE } = ctx, c = SPEC(THREE);
  // the needle stays in the target: a bright shard + glow that hang, then fade
  fx.vfx.add.spawn({ pos: p.clone(), color: c[0], life: 0.7, size: 1.8 * k, size1: 0.5, kind: 0, floor: false, alpha: 0.8 });
  fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(-0.1, 0.1), rnd(-0.1, 0.1), rnd(-0.1, 0.1))), vel: new THREE.Vector3(0, 0.1, 0), color: c[2], life: 0.9, size: 0.4 * k, size1: 0.12, kind: 3, floor: false, drag: 3 });
  fx.vfx.rings.spawn({ pos: p.clone(), color: c[0], r0: 0.05, r1: 0.85 * k, thick: 0.08, life: 0.25, kind: 2, face: true });
  c.forEach((cc) => fx.sparks(p, cc, Math.round(6 * k), 5));
  fx.star(p, crit ? c[1] : c[0], (crit ? 3.2 : 2.0) * k, 0.14);
}

export default {
  attack(ctx) {
    const { src, target } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core');
    flare(ctx, a, 1);
    needle(ctx, a, b, 1);
  },
  // attack_alt second needle; overdrive darts (one per fire frame, fanned to the volley's targets)
  shot(ctx) {
    const { shot, targets, THREE, timing } = ctx;
    if (shot.type !== 'fire') return;
    const live = targets.filter(Boolean);
    if (!live.length) return;
    if (shot.phase === 'attack') {
      if (shot.typeIndex === 0) return;
      const b = live[0].pos('core').add(new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.1, 0.2), rnd(-0.2, 0.2)));
      flare(ctx, shot.socket, 0.8);
      needle(ctx, shot.socket, b, 0.9);
      return;
    }
    const t = live[shot.typeIndex % live.length], b = t.pos('core');
    const d = b.clone().sub(shot.socket), side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const bow = side.multiplyScalar((shot.typeIndex - 1.5) * 0.9).add(new THREE.Vector3(0, 0.6, 0));
    flare(ctx, shot.socket, 1.2);
    dart(ctx, shot.socket, b, Math.max(0.18, Math.min(0.4, timing.travel || 0.3)), bow);
  },
  impact(ctx) {
    const { target, hit } = ctx;
    stick(ctx, target.pos('core'), hit?.crit ? 1.35 : 1, hit?.crit);
  },
  overdrive(ctx) {
    const { fx, THREE, src } = ctx, c = SPEC(THREE);
    const p = src.pos('core'), g = new THREE.Vector3(src.x, 0.06, src.z);
    fx.vfx.rings.spawn({ pos: g, color: c[0], r0: 0.3, r1: 2.2, thick: 0.1, life: 0.5, kind: 2 });
    fx.vfx.rings.spawn({ pos: p.clone(), color: c[2], r0: 0.2, r1: 1.3, thick: 0.06, life: 0.35, face: true });
    flare(ctx, src.pos('muzzle'), 1.6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      fx.vfx.add.spawn({ pos: p.clone(), vel: new THREE.Vector3(Math.cos(a) * 3, rnd(-0.3, 0.6), Math.sin(a) * 3), color: c[i % 3], life: 0.35, size: 0.12, kind: 1, streak: 0.15, floor: false, drag: 2 });
    }
  },
};
