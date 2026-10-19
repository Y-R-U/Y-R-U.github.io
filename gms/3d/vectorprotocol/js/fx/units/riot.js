// RIOT signature FX (sculptor-3). Slug Shot = a close-range shotgun blast: orange muzzle bloom, a spread of pellet tracers, a spent red
// shell kicked out of the pump; Breach & Hold (overdrive) = the shield edge slams the floor (spark fan + ground ring), then a wide
// red-orange cone blast through the gun notch across the whole enemy front, every target rocked.
function axes(ctx, who) {
  const { THREE } = ctx, q = new THREE.Quaternion();
  who.root.getWorldQuaternion(q);
  return { fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), right: new THREE.Vector3(-1, 0, 0).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0) };
}
const rnd = (a) => (Math.random() - 0.5) * a;
function shell(ctx, at, right) {
  const { fx, THREE } = ctx;
  const v = right.clone().multiplyScalar(1.4 + Math.random()); v.y = 2.5 + Math.random() * 1.5;
  fx.vfx.alpha.spawn({ pos: at, vel: v, color: new THREE.Color(0.75, 0.08, 0.06), alpha: 1, life: 0.8, size: 0.08, kind: 3, grav: 15, drag: 0.4 });
}
function smoke(ctx, p, n = 5, k = 1) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(0.8), 0.6 + Math.random() * 0.8, rnd(0.8)), color: new THREE.Color(0.16, 0.14, 0.15), alpha: 0.5, life: 0.9 + Math.random() * 0.5, size: 0.25 * k, size1: 0.9 * k, kind: 2, drag: 1.4, floor: false });
}
// pellet spread from `a` toward `b`: n tracers fanned in a cone, sparks where they land
function spread(ctx, a, b, n, cone, col, hot) {
  const { fx, THREE } = ctx;
  const d = b.clone().sub(a), L = d.length();
  for (let i = 0; i < n; i++) {
    const p = b.clone().add(new THREE.Vector3(rnd(cone * L * 0.35), rnd(cone * L * 0.25), rnd(cone * L * 0.35)));
    fx.tracer(a, p, i % 3 ? col : hot, 0.08 + Math.random() * 0.06);
    if (i % 2 === 0) fx.sparks(p, col, 3, 4);
  }
}

export default {
  attack(ctx) {
    const { fx, src, target, palette } = ctx;
    if (!target) return 'default';
    const { fwd, right } = axes(ctx, src);
    const a = src.pos('muzzle'), b = target.pos('core');
    const hot = palette.white.clone().lerp(palette.orange, 0.4);
    fx.muzzle(a, palette.orange, 2.0);
    fx.vfx.add.spawn({ pos: a.clone().addScaledVector(fwd, 0.25), color: hot, life: 0.09, size: 0.9, size1: 0.3, kind: 0, floor: false, alpha: 1 });
    fx.vfx.rings.spawn({ pos: a, color: palette.orange, r0: 0.05, r1: 0.6, thick: 0.15, life: 0.14, face: true });
    fx.light(a, palette.orange, 30, 0.1);
    spread(ctx, a, b, 9, 0.5, palette.orange, hot);
    smoke(ctx, a, 4, 0.7);
    fx.after(0.3, () => shell(ctx, src.pos('muzzle').addScaledVector(fwd, -0.4), right));
    fx.shake(0.12);
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.orange, hit?.crit ? 1.5 : 1.0);
    fx.sparks(p, palette.white, hit?.crit ? 16 : 8, 6);
    if (hit?.crit) fx.shake(0.2);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const { fwd, right, up } = axes(ctx, src);
    const core = src.pos('core');
    const s = Math.max(0.6, src.height / 3.2);
    // 1) shield edge hits the floor: spark fan, ground ring, dust, hard shake
    const floor = core.clone().addScaledVector(fwd, 0.9 * s); floor.y = 0.08;
    for (let i = 0; i < 36; i++) {
      const v = fwd.clone().multiplyScalar(2 + Math.random() * 5).addScaledVector(right, rnd(8)); v.y = 1 + Math.random() * 3.5;
      fx.vfx.add.spawn({ pos: floor, vel: v, color: i % 3 ? palette.orange : palette.gold, life: 0.35 + Math.random() * 0.3, size: 0.12, size1: 0.02, kind: 1, streak: 0.08, grav: 9, drag: 1 });
    }
    fx.vfx.rings.spawn({ pos: floor, color: palette.orange, r0: 0.2, r1: 2.8 * s, thick: 0.18, life: 0.45, kind: 2 });
    fx.vfx.rings.spawn({ pos: floor, color: palette.white, r0: 0.1, r1: 1.4 * s, thick: 0.1, life: 0.25 });
    smoke(ctx, floor, 10, 1.3);
    fx.light(floor, palette.orange, 50, 0.25);
    fx.shake(0.55);
    // 2) the breach blast through the notch: a wide cone of fire + pellets sweeping the enemy front
    fx.after(0.16, () => {
      const a = src.pos('muzzle');
      const hot = palette.white.clone().lerp(palette.orange, 0.3);
      fx.screenFlash(palette.orange, 0.12);
      fx.muzzle(a, hot, 3.2);
      fx.light(a, palette.orange, 80, 0.3);
      fx.vfx.rings.spawn({ pos: a, color: hot, r0: 0.1, r1: 1.8 * s, thick: 0.3, life: 0.2, face: true });
      const aimAt = live.length ? live.map((t) => t.pos('core')) : [a.clone().addScaledVector(fwd, 6)];
      const mid = aimAt.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / aimAt.length);
      const dir = mid.clone().sub(a).normalize(), side = new THREE.Vector3().crossVectors(dir, up).normalize();
      const span = Math.max(2.5, ...aimAt.map((p) => Math.abs(p.clone().sub(a).dot(side)))) * 1.25;
      const reach = Math.max(4, ...aimAt.map((p) => p.distanceTo(a))) * 1.1;
      for (let i = 0; i < 140; i++) {
        const w = rnd(2), sp = 10 + Math.random() * 12;
        const v = dir.clone().multiplyScalar(sp).addScaledVector(side, w * span * 1.5).addScaledVector(up, rnd(2.2));
        fx.vfx.add.spawn({ pos: a, vel: v, color: i % 4 === 0 ? palette.gold : i % 4 === 1 ? palette.red : palette.orange, life: 0.4 + Math.random() * 0.3, size: 0.8 + Math.random() * 0.7, size1: 0.1, kind: i % 3 ? 0 : 1, streak: 0.08, drag: 2.4, floor: false });
      }
      // the cone itself: fanned fire tongues from the notch to the front line
      for (let i = 0; i < 9; i++) {
        const w = (i / 8 - 0.5) * 2, end = a.clone().addScaledVector(dir, reach * (1 - Math.abs(w) * 0.25)).addScaledVector(side, w * span);
        end.y = Math.max(0.3, end.y * 0.8);
        fx.vfx.beams.spawn({ a, b: end, color: i % 2 ? palette.orange : palette.red, width: 0.12, width1: 0.9, core: 0.5, life: 0.32, taper: 0, hold: 0.25 });
      }
      for (const p of aimAt) spread(ctx, a, p, 8, 0.4, palette.orange, hot);
      smoke(ctx, a, 10, 1.5);
      fx.shake(0.75);
      live.forEach((t, j) => fx.after(0.05 + j * 0.03, () => {
        const p = t.pos('core');
        fx.explosion(p, palette.orange, 1.1);
        fx.sparks(p, palette.gold, 18, 7);
        fx.debuffAura(p.clone().setY(0.05), palette.red);
      }));
      // 3) hold: the notch keeps smoking, the shield glows (emissive surge is the kit's)
      fx.after(0.5, () => smoke(ctx, src.pos('muzzle'), 6, 0.8));
      fx.after(0.4, () => fx.buffAura(core.clone().setY(0.05), palette.orange));
      // the shield glows hot while it holds the line
      const sh = core.clone().addScaledVector(fwd, 0.7 * s);
      for (let i = 0; i < 5; i++) fx.after(i * 0.22, () => { fx.light(sh, palette.orange, 26, 0.3); fx.sparks(sh.clone().addScaledVector(up, rnd(1.2 * s)), palette.orange, 4, 2, 0.5); });
    });
  },
};
