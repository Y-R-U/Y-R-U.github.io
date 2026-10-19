// LEVIATHAN signature FX (sculptor-15). CABLE LASH = a violet cable whips from the grapple tip onto the target, a dark abyssal
// splash + a floor shock ring for the 40% splash; the double lash (attack_alt) adds a second cable from the left grapple.
// ABYSSAL HULL (wave-start self shield) = bioluminescent rings rise up the hull. ABYSSAL GRIP (overdrive) = the scene dims, all
// four cables shoot across the board to the enemy front line, purple coils wrap each target for the stun, a crush flash with an
// abyssal void core, the bound targets lean in toward the leviathan.
const rnd = (a, b) => a + Math.random() * (b - a);
const TIPS = ['muzzle', 'muzzleL', 'anchorL', 'anchorR'];
function biolum(ctx) { return ctx.src.faction === 'experimental' ? ctx.palette.purple : ctx.palette.faction; }
function lash(ctx, a, p, col, life = 0.32, w = 0.2) {
  const { fx, palette } = ctx;
  fx.vfx.beams.spawn({ a: a.clone(), b: p.clone(), color: col, width: w, width1: w * 0.5, core: 0.5, life, taper: 0.1, jitter: 0.25 });
  fx.vfx.beams.spawn({ a: a.clone(), b: p.clone(), color: palette.white, width: w * 0.3, width1: 0.02, core: 1, life: life * 0.4, taper: 0.1 });
}
function splash(ctx, p, col, k = 1) {
  const { fx, THREE, palette } = ctx;
  fx.impact(p, col, 1.1 * k);
  fx.darkCore(p.clone(), 1.5 * k, 0.5);
  for (let i = 0; i < 12 * k; i++) fx.vfx.add.spawn({ pos: p.clone(), vel: new THREE.Vector3(rnd(-4, 4), rnd(0.5, 4), rnd(-4, 4)), color: i % 3 ? col : palette.cyan, life: rnd(0.25, 0.5), size: 0.09, size1: 0.02, kind: 1, streak: 0.05, grav: 8, floor: true });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, palette } = ctx;
    if (!target) return 'default';
    const col = biolum(ctx), a = src.pos('muzzle'), p = target.pos('core');
    lash(ctx, a, p, col);
    fx.after(0.04, () => {
      splash(ctx, p, col);
      fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.07, target.z), color: col, r0: 0.3, r1: 2.6, thick: 0.12, life: 0.45, kind: 0 });
      fx.shake(0.25);
    });
  },
  impact(ctx) {
    const { fx, target, hit, palette } = ctx;
    const p = target.pos('core'), col = biolum(ctx);
    fx.sparks(p, col, hit?.crit ? 16 : 8, 5);
    if (hit?.crit) fx.star(p, palette.cyan, 1.8, 0.18);
  },
  shot(ctx) {
    const { fx, shot, target, THREE } = ctx;
    if (shot.phase === 'attack' && shot.index === 1 && target) {
      const col = biolum(ctx), p = target.pos('core').add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3)));
      lash(ctx, ctx.src.pos('muzzleL'), p, col);
      fx.after(0.04, () => splash(ctx, p, col, 0.7));
    }
    if (shot.phase === 'overdrive' && shot.index === 0) {
      // the lure blazes as it rears up
      const l = ctx.src.pos('lure');
      fx.star(l, ctx.palette.cyan, 2.4, 0.4);
      fx.light(l, biolum(ctx), 30, 0.5);
    }
  },
  shield(ctx) {
    const { fx, THREE, src, palette } = ctx;
    const col = biolum(ctx);
    for (let i = 0; i < 5; i++) fx.after(i * 0.09, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.3 + i * 0.6, src.z), color: i % 2 ? palette.cyan : col, r0: 1.6, r1: 1.0, thick: 0.07, life: 0.6 }));
    for (let i = 0; i < 24; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(src.x + rnd(-1.2, 1.2), rnd(0.3, 3), src.z + rnd(-1.2, 1.2)), vel: new THREE.Vector3(0, rnd(0.4, 1.2), 0), color: i % 2 ? palette.cyan : col, life: rnd(0.8, 1.4), size: 0.1, size1: 0.0, kind: 0, floor: false, hold: 0.4 });
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = biolum(ctx), ts = targets.filter(Boolean);
    fx.dim?.(0.55, 2.2);
    fx.shake(0.4);
    if (!ts.length) return;
    TIPS.forEach((tip, i) => {
      const t = ts[i % ts.length], a = src.pos(tip), p = t.pos('core');
      // the cable shoots out and stays taut for the stun
      fx.vfx.beams.spawn({ a: a.clone(), b: p.clone(), color: col, width: 0.24, width1: 0.12, core: 0.45, life: 2.3, hold: 0.8, taper: 0.05, jitter: 0.12 });
      fx.vfx.beams.spawn({ a: a.clone(), b: p.clone(), color: palette.white, width: 0.06, width1: 0.03, core: 1, life: 0.25, taper: 0.05 });
    });
    ts.forEach((t, j) => {
      const base = new THREE.Vector3(t.x, 0, t.z), h = Math.max(1.6, t.height * 0.75);
      // purple coils wrapping the body, bottom to top
      for (let i = 0; i < 6; i++) fx.after(0.03 * i + j * 0.04, () => fx.vfx.rings.spawn({ pos: base.clone().setY(0.35 + i * h / 6), color: i % 2 ? col : palette.pink, r0: 1.4, r1: 0.75, thick: 0.1, life: 2.2, hold: 0.85 }));
      // the crush
      fx.after(0.5, () => {
        const c = t.pos('core');
        fx.darkCore(c.clone(), 2.2, 0.9);
        fx.star(c, palette.white, 2.6, 0.22);
        fx.impact(c, col, 1.6);
        fx.sparks(c, col, 18, 6);
        fx.light(c, col, 40, 0.4);
      });
      // bound targets lean toward the leviathan
      const dx = src.x - t.x, dz = src.z - t.z, L = Math.hypot(dx, dz) || 1;
      fx.lean?.(t, (dz / L) * 0.18, -(dx / L) * 0.18, 2.0);
    });
    fx.after(0.5, () => { fx.shake(0.6); fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.07, src.z), color: col, r0: 0.6, r1: 3.6, thick: 0.14, life: 0.7, kind: 2 }); });
  },
};
