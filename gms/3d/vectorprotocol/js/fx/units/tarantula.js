// TARANTULA signature FX (sculptor-4). Twin Cannon = two heavy orange shells (right barrel, then left 0.14 s later) on a
// shallow arc with muzzle smoke + ejected casings; the second shell is the splash round. Bombard (overdrive) = two
// 3-shell volleys fired skyward (plus the rear mortar at R4+), then shells rain onto every enemy slot: orange blasts,
// scorch rings, smoke columns and an expose ring on each target.
const GAP = (0.47 - 0.32) * 0.95;                 // matches the model's attack fire events
const SALVO = [0, 0.09, 0.18, 0.5, 0.59, 0.68];   // overdrive volley times after the release (model OD_SALVO)

const rnd = (a, b) => a + Math.random() * (b - a);
function ground(ctx, t) {
  const p = new ctx.THREE.Vector3();
  t.root.getWorldPosition(p);
  return p;
}
function smoke(ctx, at, n = 4, k = 1, up = 1) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    fx.vfx.alpha.spawn({ pos: at, vel: new THREE.Vector3(rnd(-0.4, 0.4) * k, rnd(0.4, 1.2) * up, rnd(-0.4, 0.4) * k), color: new THREE.Color(0.09, 0.08, 0.09),
      alpha: 0.55, life: rnd(0.8, 1.4) * k, size: 0.25 * k, size1: rnd(0.9, 1.4) * k, kind: 2, drag: 1.4, floor: false });
  }
}
function casing(ctx, at) {
  const { fx, THREE, src } = ctx;
  const q = new THREE.Quaternion(); src.root.getWorldQuaternion(q);
  const side = new THREE.Vector3(Math.random() < 0.5 ? 1 : -1, 0, -0.3).applyQuaternion(q);
  const v = side.multiplyScalar(rnd(1.4, 2.4)); v.y = rnd(2, 3);
  fx.vfx.alpha.spawn({ pos: at, vel: v, color: new THREE.Color(0.8, 0.5, 0.2), alpha: 1, life: 0.8, size: 0.09, kind: 3, grav: 14, drag: 0.4 });
}
// a shell bursting at `p` on the floor `g` (k = size); light/ring/sparks/debris + smoke
function blast(ctx, p, g, k = 1, shake = 0.12) {
  const { fx, THREE, palette } = ctx;
  const hot = palette.orange, white = palette.white;
  fx.light(p, hot, 26 * k, 0.22);
  fx.vfx.add.spawn({ pos: p, color: white, life: 0.1, size: 0.8 * k, size1: 1.8 * k, kind: 0, floor: false });
  fx.star(p, hot, 2.2 * k, 0.16);
  for (let i = 0; i < 10 * k; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).multiplyScalar(rnd(1, 3) * k);
    fx.vfx.add.spawn({ pos: p, vel: v, color: hot, life: rnd(0.3, 0.55), size: rnd(0.35, 0.6) * k, size1: 0.08, kind: 0, drag: 3, floor: false });
  }
  fx.sparks(p, palette.gold, Math.round(12 * k), 7 * k);
  for (let i = 0; i < 5 * k; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(1.5, 3), rnd(-1, 1)).multiplyScalar(rnd(1.5, 3));
    fx.vfx.alpha.spawn({ pos: p, vel: v, color: new THREE.Color(0.1, 0.1, 0.12), alpha: 1, life: rnd(0.6, 1), size: rnd(0.06, 0.12), kind: 3, grav: 14, drag: 0.5 });
  }
  fx.vfx.rings.spawn({ pos: new THREE.Vector3(g.x, g.y + 0.06, g.z), color: hot, r0: 0.2, r1: 1.6 * k, thick: 0.12, life: 0.4 });
  fx.vfx.rings.spawn({ pos: new THREE.Vector3(g.x, g.y + 0.05, g.z), color: hot.clone().multiplyScalar(0.35), r0: 0.5 * k, r1: 0.9 * k, thick: 0.4, life: 1.1, kind: 1, alpha: 0.5, hold: 0.5 });
  smoke(ctx, p, Math.round(4 * k), k);
  if (shake) fx.shake(shake);
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const hot = palette.orange.clone().lerp(palette.white, 0.25);
    const travel = Math.max(0.08, timing.travel);
    const shot = (sock, delay, splash) => fx.after(delay, () => {
      const a = src.pos(sock), b = target.pos('core');
      if (splash) b.add(new THREE.Vector3(rnd(-0.6, 0.6), -0.4, rnd(-0.6, 0.6)));
      fx.muzzle(a, hot, 1.5);
      fx.light(a, palette.orange, 20, 0.09);
      smoke(ctx, a, 3, 0.7, 0.6);
      casing(ctx, a.clone().lerp(src.pos('core'), 0.6));
      fx.bolt(a, b, hot, travel, { size: 0.26, arc: 0.45, trail: 1.3 });
      if (splash) fx.after(travel, () => blast(ctx, b, ground(ctx, target), 0.55, 0.05));
    });
    shot('muzzle', 0, false);
    shot('muzzleL', GAP, true);
  },
  impact(ctx) {
    const { target, hit } = ctx;
    blast(ctx, target.pos('core'), ground(ctx, target), hit?.crit ? 1.05 : 0.75, hit?.crit ? 0.25 : 0.1);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const hot = palette.orange.clone().lerp(palette.white, 0.3);
    const up = new THREE.Vector3(0, 1, 0);
    // launches: shells streak skyward from alternating barrels (+ the rear mortar at R4+)
    const mortar = (src.unit?.rank ?? 2) >= 4;
    SALVO.forEach((t, i) => fx.after(t, () => {
      const a = src.pos(i % 2 ? 'muzzleL' : 'muzzle');
      fx.muzzle(a, hot, 2.2);
      fx.light(a, palette.orange, 34, 0.12);
      fx.tracer(a, a.clone().addScaledVector(up, 14).add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))), hot, 0.32);
      smoke(ctx, a, 4, 0.9, 0.8);
      fx.shake(0.12);
      if (mortar && i % 3 === 1) {
        const m = src.pos('hand');
        fx.muzzle(m, hot, 1.6);
        fx.tracer(m, m.clone().addScaledVector(up, 14), hot, 0.4);
        smoke(ctx, m, 3, 0.8, 1);
      }
    }));
    fx.screenFlash(palette.orange, 0.1);
    // landings: the first shell on each target hits with the sim's damage, then 1-2 more per slot through both volleys
    live.forEach((t, j) => {
      const n = 2 + (j % 2) + (mortar ? 1 : 0);
      for (let s = 0; s < n; s++) {
        const at = s === 0 ? 0.05 + j * 0.03 : 0.25 + s * 0.28 + rnd(0, 0.18);
        fx.after(at, () => {
          const g = ground(ctx, t), off = s === 0 ? new THREE.Vector3() : new THREE.Vector3(rnd(-0.9, 0.9), 0, rnd(-0.9, 0.9));
          const hitP = (s === 0 ? t.pos('core') : g.clone().add(off).setY(g.y + 0.4));
          const sky = hitP.clone().add(new THREE.Vector3(rnd(-1.5, 1.5), 12, rnd(-1.5, 1.5)));
          const fall = 0.16;
          fx.bolt(sky, hitP, hot, fall, { size: 0.3, trail: 2.4 });
          fx.after(fall, () => {
            blast(ctx, hitP, g.clone().add(off), s === 0 ? 1.15 : 0.8, s === 0 ? 0.3 : 0.12);
            if (s === 0) {
              fx.debuffAura(g, palette.orange);
              // smoke column
              for (let i = 0; i < 8; i++) fx.vfx.alpha.spawn({ pos: g.clone().setY(g.y + 0.3), vel: new THREE.Vector3(rnd(-0.15, 0.15), rnd(1.6, 2.6), rnd(-0.15, 0.15)),
                color: new THREE.Color(0.07, 0.06, 0.07), alpha: 0.5, life: rnd(1.6, 2.4), size: 0.5, size1: rnd(1.4, 2), kind: 2, drag: 0.6, floor: false, fadeIn: 0.1 });
            }
          });
        });
      }
    });
  },
};
