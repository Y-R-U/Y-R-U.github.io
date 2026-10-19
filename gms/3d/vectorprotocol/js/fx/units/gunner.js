// GUNNER signature FX (sculptor-1). Rotary Burst = a 5-round stream of cyan tracer slugs with brass casings;
// Suppression (overdrive) = a two-second white-hot tracer hose sweeping the enemy front line, sparks on every hit.
const ROUNDS = 5, GAP = 0.067;          // matches the model's attack fire events (0.32..0.6 of 0.95 s)
const OD_ROUNDS = 30, OD_DUR = 1.95;

function brass(THREE) { return new THREE.Color(0.85, 0.6, 0.22); }
// world-space unit axes of the shooter (casings eject to the gun's right = the unit's -x)
function axes(ctx) {
  const { THREE, src } = ctx;
  const q = new THREE.Quaternion();
  src.root.getWorldQuaternion(q);
  return { right: new THREE.Vector3(-1, 0, 0).applyQuaternion(q), left: new THREE.Vector3(1, 0, 0).applyQuaternion(q), fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q) };
}
function casing(ctx, at, right, k = 1) {
  const { fx, THREE } = ctx, v = new THREE.Vector3();
  for (let i = 0; i < k; i++) {
    v.copy(right).multiplyScalar(1.6 + Math.random() * 1.6);
    v.y = 2 + Math.random() * 2; v.x += (Math.random() - 0.5) * 0.8; v.z += (Math.random() - 0.5) * 0.8;
    fx.vfx.alpha.spawn({ pos: at, vel: v, color: brass(THREE), alpha: 1, life: 0.7 + Math.random() * 0.4, size: 0.06, kind: 3, grav: 16, drag: 0.4 });
  }
}
function jitter(THREE, p, a) { return p.clone().add(new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a)); }

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const { right } = axes(ctx);
    const col = palette.cyan.clone().lerp(palette.faction, 0.5);
    for (let i = 0; i < ROUNDS; i++) {
      fx.after(i * GAP, () => {
        const a = src.pos('muzzle'), b = jitter(THREE, target.pos('core'), i ? 0.45 : 0.1);
        fx.muzzle(a, i % 2 ? palette.white : col, 0.8);
        fx.bolt(a, b, col, Math.max(0.06, timing.travel), { size: 0.13, trail: 1.4 });
        casing(ctx, a.clone().addScaledVector(right, 0.05), right);
        if (i % 2 === 0) fx.light(a, col, 12, 0.06);
        // trailing rounds pepper the target when they land (the first one is the sim's hit -> impact())
        if (i) fx.after(Math.max(0.06, timing.travel), () => fx.sparks(b, col, 5, 4));
      });
    }
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.cyan, hit?.crit ? 1.3 : 0.75);
    fx.sparks(p, palette.white, hit?.crit ? 14 : 7, 6);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const { right, left } = axes(ctx);
    // sweep order follows the anim (torso starts yawed to the unit's left)
    const pts = live.map((t) => t.pos('core')).sort((a, b) => b.dot(left) - a.dot(left));
    const floorY = Math.min(...pts.map((p) => p.y)) * 0.25;
    // path: overshoot before the first target, dip to the floor between targets, overshoot after the last
    const path = [];
    const step = pts.length > 1 ? pts[1].clone().sub(pts[0]) : left.clone().multiplyScalar(-2);
    path.push(pts[0].clone().addScaledVector(step, -0.35).setY(floorY));
    pts.forEach((p, i) => { path.push(p); if (i < pts.length - 1) path.push(p.clone().lerp(pts[i + 1], 0.5).setY(floorY)); });
    path.push(pts[pts.length - 1].clone().addScaledVector(step, 0.35).setY(floorY));
    const along = (k) => {
      const f = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f));
      return path[i].clone().lerp(path[i + 1], f - i);
    };
    const hot = palette.white.clone().lerp(palette.cyan, 0.35);
    const hitAt = pts.map((_, i) => (2 * i + 1) / (path.length - 1));
    const done = new Set();
    fx.screenFlash(palette.cyan, 0.12);
    for (let i = 0; i < OD_ROUNDS; i++) {
      const k = i / (OD_ROUNDS - 1);
      fx.after(k * OD_DUR, () => {
        const a = src.pos('muzzle'), b = jitter(THREE, along(k), 0.35);
        fx.muzzle(a, i % 3 ? hot : palette.cyan, 1.6);
        fx.beam(a, along(Math.min(1, k + 0.02)), palette.cyan, OD_DUR / OD_ROUNDS * 1.6, 0.14, true);
        fx.tracer(a, b, i % 2 ? palette.cyan : hot, 0.2);
        fx.tracer(a, jitter(THREE, b, 0.5), hot, 0.12);
        fx.sparks(b, palette.cyan, 6, 6);
        if (b.y < floorY + 0.4) fx.vfx.rings.spawn({ pos: b.clone().setY(floorY + 0.05), color: palette.cyan, r0: 0.05, r1: 0.45, thick: 0.1, life: 0.2 });
        casing(ctx, a.clone().addScaledVector(right, 0.05), right, 2);
        if (i % 3 === 0) fx.light(a, hot, 22, 0.08);
        fx.shake(0.05);
        hitAt.forEach((h, j) => {
          if (!done.has(j) && k >= h - 0.02) {
            done.add(j);
            fx.impact(pts[j], palette.cyan, 1.5);
            fx.sparks(pts[j], palette.white, 22, 8);
            fx.shake(0.25);
          }
        });
      });
    }
    // barrels vent: a final puff of heat haze + white flash at the muzzle
    fx.after(OD_DUR + 0.05, () => {
      const a = src.pos('muzzle');
      fx.vfx.add.spawn({ pos: a, color: hot, life: 0.25, size: 0.6, size1: 1.2, kind: 0, floor: false, alpha: 0.6 });
      for (let i = 0; i < 6; i++) fx.vfx.alpha.spawn({ pos: a, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6), color: new THREE.Color(0.25, 0.3, 0.38), alpha: 0.5, life: 1.2, size: 0.25, size1: 0.9, kind: 2, drag: 1, floor: false });
    });
  },
};
