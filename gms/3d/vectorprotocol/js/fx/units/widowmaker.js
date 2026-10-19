// WIDOWMAKER signature FX (sculptor-9). Also drives boss CORONA (corporate tint: the secondary light turns cyan).
// Long Rifle = a muzzle-brake blast (side-port jets + smoke), a hot slug with a long trail, a faint lingering line, a brass casing;
// hits punch through (exit spray behind the target). LAST LIGHT (overdrive) = the gold eye glints as she vanishes, the battle
// dims, one gold-white shot pierces the target and runs on to the back wall, the line lingers, shock rings ripple along it,
// the target's HP bar shatters into shards.
const rnd = (a, b) => a + Math.random() * (b - a);
const SEC = { rogue: 'orange', corporate: 'cyan', experimental: 'purple' };
function axes(ctx, a, b) {
  const { THREE } = ctx;
  const dir = new THREE.Vector3().subVectors(b, a);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
  return { dir, side };
}
function brake(ctx, m, dir, side, col, k = 1) {
  const { fx, THREE, palette } = ctx;
  fx.muzzle(m, col, 1.5 * k);
  fx.star(m, palette.white, 1.4 * k, 0.1);
  fx.light(m, col, 30 * k, 0.12);
  // side-port jets of the muzzle brake + a smoke puff
  for (const s of [1, -1]) {
    const e = m.clone().addScaledVector(side, s * 0.9 * k).addScaledVector(dir, -0.15);
    fx.vfx.beams.spawn({ a: m.clone(), b: e, color: col, width: 0.32 * k, width1: 0.05, core: 0.5, life: 0.1, taper: 0.5 });
    for (let i = 0; i < 4; i++) fx.vfx.alpha.spawn({ pos: m.clone().addScaledVector(side, s * 0.3), vel: side.clone().multiplyScalar(s * rnd(1, 2.5)).add(new THREE.Vector3(0, rnd(0.2, 0.8), 0)), color: new THREE.Color(0.35, 0.33, 0.32), alpha: 0.35, life: rnd(0.6, 1.0), size: 0.3 * k, size1: 0.8 * k, kind: 2, drag: 2, floor: false });
  }
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const col = palette[SEC[src.faction]] || palette.orange;
    const m = src.pos('muzzle'), p = target.pos('core');
    const { dir, side } = axes(ctx, m, p);
    brake(ctx, m, dir, side, col);
    const t = Math.max(0.05, timing.travel);
    fx.bolt(m, p, palette.gold, t, { size: 0.16, trail: 3.2 });
    fx.vfx.beams.spawn({ a: m.clone(), b: p.clone(), color: palette.gold, width: 0.07, width1: 0.03, core: 0.8, life: t + 0.5, hold: 0.25, taper: 0.02 });
    fx.casings(src.pos('hand'), palette.gold, 1);
  },
  impact(ctx) {
    const { fx, THREE, target, palette, hit, src } = ctx;
    const col = palette[SEC[src.faction]] || palette.orange;
    const p = target.pos('core');
    const { dir } = axes(ctx, src.pos('core'), p);
    fx.impact(p, col, hit?.crit ? 1.5 : 1.0);
    // punch-through: an exit spray out of the far side
    for (let i = 0; i < (hit?.crit ? 26 : 14); i++) fx.vfx.add.spawn({ pos: p.clone().addScaledVector(dir, 0.3), vel: dir.clone().multiplyScalar(rnd(5, 10)).add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(-0.5, 2), rnd(-1.5, 1.5))), color: i % 3 ? col : palette.white, life: rnd(0.15, 0.35), size: 0.08, size1: 0.02, kind: 1, streak: 0.07, grav: 6, floor: true });
    fx.vfx.rings.spawn({ pos: p.clone().addScaledVector(dir, 0.35), color: palette.gold, r0: 0.1, r1: hit?.crit ? 1.1 : 0.7, thick: 0.06, life: 0.22, face: true });
    if (hit?.crit) { fx.star(p, palette.gold, 2.2, 0.2); fx.shake(0.25); }
  },
  // overdrive anim frames: index 0 (cast) = the gold eye glints as the cloak flares, just before she vanishes
  shot(ctx) {
    const { fx, src, shot, palette } = ctx;
    if (shot.phase !== 'overdrive' || shot.index !== 0) return;
    const e = src.pos('head');
    fx.star(e, palette.gold, 2.4, 0.3);
    fx.light(e, palette.gold, 20, 0.3);
    for (let i = 0; i < 18; i++) fx.after(i * 0.012, () => fx.vfx.add.spawn({ pos: src.pos('core').add(new ctx.THREE.Vector3(rnd(-0.6, 0.6), rnd(-1.2, 1.2), rnd(-0.6, 0.6))), vel: new ctx.THREE.Vector3(0, rnd(0.5, 1.5), 0), color: i % 2 ? palette.gold : palette.white, life: 0.3, size: 0.12, size1: 0.0, kind: 1, streak: 0.05, floor: false }));
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = palette[SEC[src.faction]] || palette.orange;
    const t = targets.find(Boolean) || ctx.target;
    const m = src.pos('muzzle');
    const p = t ? t.pos('core') : m.clone().add(new THREE.Vector3(src.side === 'player' ? 12 : -12, 0, 0));
    const { dir, side } = axes(ctx, m, p);
    const end = p.clone().addScaledVector(dir, 34);
    // the battle dims, then the one shot
    if (fx.dim) fx.dim(0.85, 1.2); else fx.screenFlash(new THREE.Color(0.02, 0.015, 0.01), 0.6);
    brake(ctx, m, dir, side, col, 1.6);
    fx.shake(0.45);
    const hot = palette.gold.clone().lerp(palette.white, 0.5);
    fx.vfx.beams.spawn({ a: m.clone(), b: end, color: palette.white, width: 0.22, width1: 0.05, core: 0.9, life: 0.35, taper: 0.01 });
    fx.vfx.beams.spawn({ a: m.clone(), b: end, color: palette.gold, width: 0.75, width1: 0.12, core: 0.45, life: 1.9, hold: 0.55, taper: 0.01 });
    fx.vfx.beams.spawn({ a: m.clone(), b: end, color: col, width: 1.3, width1: 0.2, core: 0.1, life: 0.6, hold: 0.2, taper: 0.01 });
    // shock rings rippling down the line, facing the shot
    const L = m.distanceTo(end);
    for (let d = 1.2, i = 0; d < Math.min(L, 26); d += 1.6, i++) fx.after(i * 0.025, () => fx.vfx.rings.spawn({ pos: m.clone().addScaledVector(dir, d), color: i % 2 ? palette.gold : hot, r0: 0.15, r1: 0.9, thick: 0.05, life: 0.35, face: true }));
    // recoil dust on the floor under the prone shooter
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: col, r0: 0.4, r1: 3.2, thick: 0.14, life: 0.5 });
    for (let i = 0; i < 10; i++) fx.vfx.alpha.spawn({ pos: new THREE.Vector3(src.x + rnd(-0.6, 0.6), 0.15, src.z + rnd(-0.6, 0.6)), vel: new THREE.Vector3(rnd(-2, 2), rnd(0.3, 1), rnd(-2, 2)), color: new THREE.Color(0.3, 0.28, 0.26), alpha: 0.3, life: 1.1, size: 0.4, size1: 1.2, kind: 2, drag: 2, floor: false });
    if (!t) return;
    fx.after(0.05, () => {
      fx.impact(p, palette.gold, 2.2);
      fx.star(p, hot, 3.4, 0.3);
      fx.light(p, palette.gold, 60, 0.4);
      fx.sparks(p, palette.gold, 30, 9);
      for (let i = 0; i < 30; i++) fx.vfx.add.spawn({ pos: p.clone(), vel: dir.clone().multiplyScalar(rnd(8, 16)).add(new THREE.Vector3(rnd(-2, 2), rnd(-1, 3), rnd(-2, 2))), color: i % 3 ? col : palette.white, life: rnd(0.2, 0.45), size: 0.1, size1: 0.02, kind: 1, streak: 0.09, grav: 5, floor: true });
      // the HP bar shatters: red / gold shards bursting out at bar height
      const bar = t.pos('head').add(new THREE.Vector3(0, Math.max(0.6, t.height * 0.25), 0));
      for (let i = 0; i < 26; i++) {
        const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 5));
        fx.vfx.add.spawn({ pos: bar.clone().addScaledVector(side, rnd(-0.6, 0.6)), vel: v, color: i % 3 ? palette.red : palette.gold, life: rnd(0.4, 0.8), size: 0.13, size1: 0.04, kind: 3, grav: 9, drag: 0.4, floor: true });
      }
      fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: palette.gold, r0: 0.4, r1: 3.0, thick: 0.12, life: 0.6, kind: 2 });
      fx.shake(0.6);
    });
  },
};
