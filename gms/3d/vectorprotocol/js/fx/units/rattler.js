// RATTLER signature FX (sculptor-7). SMG Burst = six chattering orange tracers alternating between the two SMGs, brass spitting
// out of both guns, the strays chipping sparks off the target. Spray & Pray (overdrive) = a wild 1.6 s tracer fan from both guns
// while it spins: eight scheduled hits on random enemies, the rest ricochet off the floor and walls in spark bursts.
const ROUNDS = 6, GAP = 0.048;              // matches the model's attack fire events (0.24..0.54 of 0.8 s)
const OD_DUR = 1.64, OD_SHOTS = 48;

const rnd = (a) => (Math.random() - 0.5) * a;
function axes(ctx) {
  const { THREE, src } = ctx, q = new THREE.Quaternion();
  src.root.getWorldQuaternion(q);
  return { fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), left: new THREE.Vector3(1, 0, 0).applyQuaternion(q) };
}
function brass(ctx, at, side) {
  const { fx, THREE } = ctx, v = side.clone().multiplyScalar(1.2 + Math.random() * 1.4);
  v.y = 1.8 + Math.random() * 1.6; v.x += rnd(0.6); v.z += rnd(0.6);
  fx.vfx.alpha.spawn({ pos: at, vel: v, color: new THREE.Color(0.9, 0.62, 0.2), alpha: 1, life: 0.55 + Math.random() * 0.3, size: 0.045, kind: 3, grav: 16, drag: 0.4 });
}
function ricochet(ctx, p, col, hot) {
  const { fx } = ctx;
  fx.sparks(p, hot, 6, 7, 1.2);
  fx.vfx.add.spawn({ pos: p, color: col, life: 0.08, size: 0.35, size1: 0.1, kind: 0, floor: false, alpha: 1 });
  if (p.y < 0.25) fx.vfx.rings.spawn({ pos: p.clone().setY(0.04), color: col, r0: 0.03, r1: 0.28, thick: 0.08, life: 0.16 });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const { left } = axes(ctx);
    const col = palette.orange.clone().lerp(palette.faction, 0.3), hot = palette.white.clone().lerp(palette.orange, 0.35);
    const travel = Math.max(0.05, timing.travel);
    for (let i = 0; i < ROUNDS; i++) {
      fx.after(i * GAP, () => {
        const sock = i % 2 ? 'muzzleL' : 'muzzle';
        const a = src.pos(sock), b = target.pos('core').add(new THREE.Vector3(rnd(i ? 0.5 : 0.1), rnd(i ? 0.4 : 0.1), rnd(i ? 0.5 : 0.1)));
        fx.muzzle(a, i % 3 ? col : hot, 0.55);
        fx.bolt(a, b, i % 2 ? col : hot, travel * (0.9 + Math.random() * 0.2), { size: 0.09, trail: 1.6 });
        brass(ctx, a, i % 2 ? left : left.clone().negate());
        if (i % 2 === 0) fx.light(a, col, 8, 0.05);
        if (i) fx.after(travel, () => fx.sparks(b, col, 4, 5));
      });
    }
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.orange, hit?.crit ? 1.2 : 0.65);
    fx.sparks(p, palette.white, hit?.crit ? 14 : 6, 6);
    // Cheap Shots: a crit flashes yellow (it banks charge)
    if (hit?.crit) fx.vfx.rings.spawn({ pos: p, color: palette.gold, r0: 0.1, r1: 0.9, thick: 0.12, life: 0.22, face: true });
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const { fwd } = axes(ctx);
    const col = palette.orange, hot = palette.white.clone().lerp(palette.orange, 0.3), gold = palette.gold;
    const base = src.pos('core');
    // eight hits spread through the spray (random order), the other rounds fly wild
    const hitAt = new Map();
    live.forEach((t, i) => hitAt.set(Math.round(((i + 0.5) / live.length) * (OD_SHOTS - 4)) + 2, t));
    fx.screenFlash(col, 0.1);
    // opening burst: spark cones out of both guns + a ring at the feet
    for (const sock of ['muzzle', 'muzzleL']) { const a = src.pos(sock); fx.sparks(a, hot, 20, 9, 0.6); fx.vfx.rings.spawn({ pos: a, color: col, r0: 0.1, r1: 1.1, thick: 0.18, life: 0.2, face: true }); }
    fx.vfx.rings.spawn({ pos: base.clone().setY(0.05), color: col, r0: 0.3, r1: 2.4, thick: 0.2, life: 0.45 });
    for (let i = 0; i < OD_SHOTS; i++) {
      const k = i / (OD_SHOTS - 1);
      fx.after(k * OD_DUR, () => {
        const sock = i % 2 ? 'muzzleL' : 'muzzle';
        const a = src.pos(sock), tgt = hitAt.get(i);
        let b;
        if (tgt && tgt.alive !== false) {
          b = tgt.pos('core');
          fx.tracer(a, b, col, 0.36); fx.tracer(a, b, hot, 0.14);
          fx.bolt(a, b, hot, 0.07, { size: 0.16, trail: 2 });
          fx.impact(b, col, 1.1);
          fx.sparks(b, gold, 12, 7);
          fx.shake(0.12);
        } else {
          // wild round: anywhere in a wide fan around the unit, mostly into the floor
          const ang = (Math.random() - 0.5) * 2.6, dist = 2.5 + Math.random() * 6;
          const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
          b = base.clone().addScaledVector(dir, dist);
          b.y = Math.random() < 0.7 ? 0.05 : 0.5 + Math.random() * 2;
          fx.tracer(a, b, col, 0.24 + Math.random() * 0.1); if (i % 2 === 0) fx.tracer(a, b, hot, 0.1);
          ricochet(ctx, b, col, hot);
          if (Math.random() < 0.35) fx.tracer(b, b.clone().add(new THREE.Vector3(rnd(3), 1 + Math.random() * 2, rnd(3))), hot, 0.06);
        }
        fx.muzzle(a, i % 2 ? col : hot, 1.3);
        if (i % 3 === 0) fx.vfx.rings.spawn({ pos: a, color: col, r0: 0.05, r1: 0.45, thick: 0.12, life: 0.1, face: true });
        if (i % 2 === 0) fx.light(a, col, 22, 0.08);
        if (i % 2 === 0) brass(ctx, a, new THREE.Vector3(rnd(2), 0, rnd(2)).normalize());
        fx.shake(0.03);
      });
    }
    // empty mags clatter, smoke curls off both barrels
    fx.after(OD_DUR + 0.05, () => {
      for (const sock of ['muzzle', 'muzzleL']) {
        const a = src.pos(sock);
        for (let j = 0; j < 4; j++) fx.vfx.alpha.spawn({ pos: a, vel: new THREE.Vector3(rnd(0.4), 0.7 + Math.random() * 0.6, rnd(0.4)), color: new THREE.Color(0.22, 0.2, 0.2), alpha: 0.45, life: 1.1, size: 0.15, size1: 0.6, kind: 2, drag: 1, floor: false });
      }
    });
  },
};
