// HUSK signature FX (sculptor-10; polish pass sculptor-21: particle sizes up for phone scale). Gravity, crude and heavy: violet implosions, floor shockwaves, chunks of floor kicked up.
// Grav Slam = a gravity well snaps shut under the target as the fist lands (the floor dimple pulls in, then the impact hook
//   blows it out). Impact = violet shock ring along the floor, crack lines, debris chunks that fall back, sparks.
// Fold In (overdrive) = the segments are already collapsing (anim): debris + light get sucked into a glowing knot at the core,
//   it pulses, then bursts back out (shock ring, flung shards, taunt ring held on its plate).
const rnd = (a, b) => a + Math.random() * (b - a);
const VIO = (T) => new T.Color(1.9, 0.55, 3.4);

function shock(fx, THREE, x, z, col, k = 1) {
  fx.vfx.rings.spawn({ pos: new THREE.Vector3(x, 0.06, z), color: col, r0: 0.3, r1: 1.5 * k, thick: 0.05, life: 0.4, kind: 0 });
  fx.vfx.rings.spawn({ pos: new THREE.Vector3(x, 0.05, z), color: col.clone().multiplyScalar(0.4), r0: 0.2, r1: 1.0 * k, thick: 0.1, life: 0.35, kind: 1, alpha: 0.5 });
}
function cracks(fx, THREE, x, z, col, n = 6, len = 1.2) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), l = len * rnd(0.6, 1.1);
    const p0 = new THREE.Vector3(x, 0.07, z), p1 = new THREE.Vector3(x + Math.cos(a) * l, 0.07, z + Math.sin(a) * l);
    fx.vfx.beams.spawn({ a: p0, b: p0, color: col, width: 0.07, width1: 0.02, core: 0.5, life: 0.55, taper: 0.1, hold: 0.4,
      fn: (bm, k) => bm.b.lerpVectors(p0, p1, Math.min(1, k * 4)) });
  }
}
function chunks(fx, THREE, p, col, n = 8, up = 4) {
  for (let i = 0; i < n; i++) {
    fx.vfx.alpha.spawn({ pos: new THREE.Vector3(p.x + rnd(-0.3, 0.3), 0.15, p.z + rnd(-0.3, 0.3)), vel: new THREE.Vector3(rnd(-2, 2), rnd(up * 0.6, up), rnd(-2, 2)),
      color: new THREE.Color(0.08, 0.07, 0.12), life: rnd(0.6, 0.9), size: rnd(0.15, 0.28), kind: 3, grav: 14, drag: 0.5 });
  }
  for (let i = 0; i < n; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(p.x, 0.2, p.z), vel: new THREE.Vector3(rnd(-3, 3), rnd(1, 4), rnd(-3, 3)), color: col, life: rnd(0.25, 0.5), size: rnd(0.1, 0.16), kind: 1, streak: 0.09, grav: 10, drag: 1.5 });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const col = VIO(THREE), hand = src.pos('hand');
    // gravity well snapping shut under the target + a pull-line from the fist
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.06, target.z), color: col, r0: 1.6, r1: 0.25, thick: 0.06, life: Math.max(0.16, timing.travel + 0.08), kind: 0 });
    fx.vfx.add.spawn({ pos: hand, color: col, life: 0.22, size: 1.6, size1: 0.5, kind: 0, floor: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = 1.2, life = Math.max(0.15, timing.travel + 0.05);
      const p = new THREE.Vector3(target.x + Math.cos(a) * r, 0.12, target.z + Math.sin(a) * r);
      fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(-Math.cos(a) * r / life, 0, -Math.sin(a) * r / life), color: col, life, size: 0.14, kind: 1, streak: 0.16, floor: false });
    }
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx;
    if (!target) return 'default';
    const col = VIO(THREE), k = (hit?.crit ? 1.35 : 1) * (hit?.kill ? 1.2 : 1);
    const p = target.pos('core');
    fx.vfx.add.spawn({ pos: p, color: ctx.palette.white, life: 0.12, size: 1.2 * k, size1: 2.0 * k, kind: 0, floor: false });
    fx.vfx.add.spawn({ pos: p, color: col, life: 0.26, size: 2.0 * k, size1: 0.6, kind: 4, floor: false });
    shock(fx, THREE, target.x, target.z, col, k);
    cracks(fx, THREE, target.x, target.z, col, 5, 1.0 * k);
    chunks(fx, THREE, p, col, Math.round(6 * k), 4 * k);
    fx.light(new THREE.Vector3(target.x, 0.8, target.z), col, 16 * k, 0.18);
    fx.shake(0.14 * k);
  },
  // Reconstitute / Fold In heal: loose violet motes are pulled back into the core, which flashes
  heal(ctx) {
    const { fx, THREE, target, palette } = ctx;
    if (!target) return 'default';
    const col = VIO(THREE), c = target.pos('core');
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, r = rnd(0.7, 1.2), life = rnd(0.3, 0.45);
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, c.y + rnd(-0.6, 0.6), c.z + Math.sin(a) * r);
      fx.vfx.add.spawn({ pos: p, vel: c.clone().sub(p).multiplyScalar(1 / life), color: i % 3 ? col : palette.white, life, size: 0.14, kind: 1, streak: 0.12, floor: false });
    }
    fx.after(0.35, () => { fx.vfx.add.spawn({ pos: target.pos('core'), color: col, life: 0.25, size: 0.9, size1: 0.3, kind: 0, floor: false }); fx.vfx.rings.spawn({ pos: target.pos('core'), color: col, r0: 0.7, r1: 0.2, thick: 0.1, life: 0.25, face: true }); });
  },
  // taunt / fortify on itself: a violet hex ring on its plate
  buff(ctx) {
    const { fx, THREE, target } = ctx;
    if (!target) return 'default';
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.07, target.z), color: VIO(THREE).multiplyScalar(0.6), r0: 0.4, r1: 1.2, thick: 0.06, life: 0.5, kind: 2 });
  },
  // noDrop: arrives as scattered debris that converges on its plate (the anim locks the segments together at 0.4)
  deploy(ctx) {
    const { fx, THREE, src } = ctx;
    const col = VIO(THREE), c = new THREE.Vector3(src.x, 1.2, src.z);
    fx.materialize(new THREE.Vector3(src.x, 0, src.z), col, 2.6);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * 6.283, r = rnd(1.5, 2.5), life = rnd(0.4, 0.6);
      const p = new THREE.Vector3(src.x + Math.cos(a) * r, rnd(0.3, 2.4), src.z + Math.sin(a) * r);
      fx.vfx.alpha.spawn({ pos: p, vel: c.clone().sub(p).multiplyScalar(1 / life), color: new THREE.Color(0.08, 0.07, 0.12), life, size: rnd(0.1, 0.16), kind: 3, floor: false });
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, palette } = ctx;
    const col = VIO(THREE), white = palette.white;
    const c = () => src.pos('core');
    const c0 = c();
    // collapse: debris + motes sucked into the knot
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.283, r = rnd(1.2, 2.2), y = rnd(0.2, 2.6), life = rnd(0.35, 0.6);
      const p = new THREE.Vector3(src.x + Math.cos(a) * r, y, src.z + Math.sin(a) * r);
      fx.after(rnd(0, 0.35), () => fx.vfx.add.spawn({ pos: p, vel: c0.clone().sub(p).multiplyScalar(1 / life), color: i % 4 ? col : white, life, size: rnd(0.1, 0.18), kind: 1, streak: 0.16, floor: false }));
    }
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: col, r0: 2.4, r1: 0.4, thick: 0.05, life: 0.5, kind: 0 });
    // the glowing knot: pulsing core glow + an outline ring (reads as a sphere)
    for (let i = 0; i < 7; i++) fx.after(i * 0.11, () => {
      const p = c();
      fx.vfx.add.spawn({ pos: p, color: col, life: 0.2, size: 2.2 + 0.4 * (i % 2), size1: 1.8, kind: 0, floor: false, alpha: 0.6 });
      fx.vfx.add.spawn({ pos: p, color: white, life: 0.14, size: 0.5, kind: 0, floor: false });
    });
    fx.vfx.rings.spawn({ pos: c0, color: col, r0: 1.4, r1: 0.95, thick: 0.08, life: 0.8, hold: 0.6, face: true, alpha: 0.8 });
    fx.light(c0, col, 30, 0.8);
    // burst back out (matches the anim's 0.53 release)
    fx.after(0.87, () => {
      const p = c();
      fx.star(p, white, 2.6, 0.2);
      fx.vfx.rings.spawn({ pos: p, color: col, r0: 0.5, r1: 2.2, thick: 0.12, life: 0.3, face: true });
      shock(fx, THREE, src.x, src.z, col, 1.9);
      cracks(fx, THREE, src.x, src.z, col, 8, 1.6);
      chunks(fx, THREE, p, col, 12, 5);
      for (let i = 0; i < 26; i++) {
        const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 0.8), rnd(-1, 1)).normalize().multiplyScalar(rnd(5, 9));
        fx.vfx.add.spawn({ pos: p, vel: v, color: i % 3 ? col : white, life: rnd(0.3, 0.55), size: rnd(0.12, 0.2), kind: 1, streak: 0.16, drag: 2.5, grav: 4, floor: false });
      }
      fx.light(p, col, 50, 0.4);
      fx.shake(0.4);
      // taunt + restored: a held hex ring on its plate and violet motes rising off it
      fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.07, src.z), color: col, r0: 1.0, r1: 1.15, thick: 0.05, life: 1.6, hold: 0.7, kind: 2 });
      for (let i = 0; i < 18; i++) fx.after(rnd(0, 0.8), () => fx.vfx.add.spawn({ pos: new THREE.Vector3(src.x + rnd(-0.7, 0.7), rnd(0.2, 1.6), src.z + rnd(-0.6, 0.6)),
        vel: new THREE.Vector3(0, rnd(0.8, 1.6), 0), color: col, life: rnd(0.6, 1.0), size: rnd(0.14, 0.24), kind: 0, floor: false, fadeIn: 0.1 }));
    });
  },
};
