// MERIDIAN signature FX (sculptor-11). Also STORMCROW (boss_stormcrow uses the meridian model; the battle keys FX by model too).
// Long Shot (basic) = a coil-gun slug: the barrel's stabiliser rings flash as accelerator coils, a white-cyan rail streak, a shock
// ring at the muzzle, a hard star + spark spray on the target.
// Orbital Designator (overdrive) = from the first frame a red laser paints the target and a red reticle closes on its plate while the
// dish shoots an uplink beam into the sky; at the release the rail shot and a thick orbital lance from the sky land on the same
// instant: white flash, a column of fire, a shock ring, a scorched glowing hex left on the floor, debris and a lingering heat haze.
const rnd = (a, b) => a + Math.random() * (b - a);
const C = (ctx, r, g, b) => new ctx.THREE.Color(r, g, b);
const red = (ctx) => C(ctx, 3.4, 0.25, 0.22);
const hot = (ctx) => C(ctx, 2.6, 3.2, 3.6);
function sock(ctx, who, name, fallback = 'head') {
  const s = who.unit?.socket?.(name);
  if (s && who.root.visible) { who.root.updateMatrixWorld(true); return s.getWorldPosition(new ctx.THREE.Vector3()); }
  return who.pos(fallback);
}
const floor = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.06);
// accelerator-coil flashes: camera-facing rings stepping out along the barrel toward the muzzle
function coils(ctx, src, color, n = 4, k = 1) {
  const { fx } = ctx, m = src.pos('muzzle'), back = src.pos('core');
  for (let i = 0; i < n; i++) {
    const p = back.clone().lerp(m, 0.15 + 0.8 * (i / (n - 1)));
    fx.after(i * 0.025, () => fx.vfx.rings.spawn({ pos: p, color, r0: 0.25 * k, r1: 0.55 * k, thick: 0.07, life: 0.16, face: true }));
  }
}
function slug(ctx, a, b, color, w = 0.3) {
  const { fx } = ctx;
  fx.vfx.beams.spawn({ a, b, color, width: w, width1: w * 0.25, core: 0.55, life: 0.22, taper: 0.04 });
  fx.vfx.beams.spawn({ a, b, color: hot(ctx), width: w * 0.35, width1: 0.02, core: 0.8, life: 0.12, taper: 0.03 });
}
function muzzleShock(ctx, p, color, k = 1) {
  const { fx } = ctx;
  fx.muzzle(p, color, 1.2 * k);
  fx.star(p, hot(ctx), 1.3 * k, 0.12);
  fx.vfx.rings.spawn({ pos: p, color, r0: 0.1, r1: 0.9 * k, thick: 0.08, life: 0.22, face: true });
  fx.light(p, color, 18 * k, 0.15);
}
function hitFlash(ctx, p, color, k = 1) {
  const { fx, THREE } = ctx;
  fx.star(p, hot(ctx), 1.6 * k, 0.14);
  fx.impact(p, color, 0.9 * k);
  for (let i = 0; i < 10 * k; i++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-4, 4), rnd(0.5, 5), rnd(-4, 4)), color: i % 3 ? color : hot(ctx), life: rnd(0.15, 0.35), size: 0.06, size1: 0.01, kind: 1, streak: 0.07, grav: 8, floor: true });
}
function shoot(ctx, from, target, k = 1) {
  const { fx, palette, timing, src } = ctx;
  const col = palette.faction, to = target.pos('core');
  coils(ctx, src, col, 4, k);
  muzzleShock(ctx, from, col, k);
  slug(ctx, from, to, col, 0.28 * k);
  fx.after(Math.max(0, (timing.travel || 0.05) - 0.02), () => fx.vfx.rings.spawn({ pos: target.pos('core'), color: col, r0: 0.1, r1: 0.7 * k, thick: 0.08, life: 0.18, face: true }));
}

export default {
  attack(ctx) {
    if (ctx.target) shoot(ctx, ctx.src.pos('muzzle'), ctx.target, 1);
  },
  impact(ctx) {
    const { target, palette, hit } = ctx;
    hitFlash(ctx, target.pos('core'), palette.faction, hit?.crit ? 1.5 : 1);
    if (hit?.crit) ctx.fx.shake(0.15);
  },
  shot(ctx) {
    const { fx, shot, src, target, palette, THREE } = ctx;
    if (shot.phase === 'attack') {
      if (shot.index > 0 && target) shoot(ctx, shot.socket, target, 0.8);
      return;
    }
    // overdrive: the first event (cast, ~0.08 s in) starts the paint; the release is overdrive()
    if (shot.index !== 0 || !target) return;
    const life = Math.max(0.35, (ctx.timing.windup || 0.6) - 0.05);
    const m = src.pos('muzzle'), g = floor(ctx, target), sky = sock(ctx, src, 'dish');
    // red designator laser: muzzle -> target, jittering, a hot dot on the target
    fx.vfx.beams.spawn({ a: m, b: target.pos('core'), color: red(ctx), width: 0.07, width1: 0.05, core: 0.7, life, taper: 0.02, hold: 0.9, jitter: true,
      fn: (bm) => { src.unit?.sockets?.muzzle?.getWorldPosition(bm.a); target.unit?.sockets?.core?.getWorldPosition(bm.b); } });
    const dot = () => fx.vfx.add.spawn({ pos: target.pos('core'), color: red(ctx), life: 0.12, size: 0.5, size1: 0.3, kind: 4, floor: false });
    for (let i = 0; i * 0.08 < life; i++) fx.after(i * 0.08, dot);
    // reticle on the target's plate: outer ring + hex closing in, four tick marks
    fx.vfx.rings.spawn({ pos: g, color: red(ctx), r0: 2.8, r1: 0.9, thick: 0.07, life, kind: 0, hold: 0.2 });
    fx.vfx.rings.spawn({ pos: g.clone().setY(0.07), color: red(ctx), r0: 2.0, r1: 0.6, thick: 0.05, life, kind: 2 });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      fx.vfx.beams.spawn({ a: g.clone().addScaledVector(d, 1.6), b: g.clone().addScaledVector(d, 0.9), color: red(ctx), width: 0.08, life, taper: 0.02, hold: 0.8 });
    }
    // uplink: a thin cyan beam from the dish straight up into orbit, pulses climbing it
    const top = sky.clone().setY(sky.y + 26);
    fx.vfx.beams.spawn({ a: sky, b: top, color: palette.faction, width: 0.14, width1: 0.05, core: 0.6, life: life + 0.3, taper: 0.03, hold: 0.8 });
    for (let i = 0; i < 5; i++) fx.after(i * life / 5, () => { const s = sock(ctx, src, 'dish'); fx.vfx.add.spawn({ pos: s, vel: new THREE.Vector3(0, 22, 0), color: palette.faction, life: 0.5, size: 0.35, size1: 0.15, kind: 0, floor: false }); });
    fx.light(sky, palette.faction, 14, life);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = palette.faction, live = targets.filter(Boolean);
    const m = src.pos('muzzle');
    muzzleShock(ctx, m, col, 2);
    coils(ctx, src, col, 6, 1.6);
    fx.shake(0.5);
    fx.screenFlash(C(ctx, 2.6, 2.9, 3.2), 0.35);
    for (const t of live) {
      const p = t.pos('core'), g = floor(ctx, t);
      // the rail shot and the orbital lance arrive together
      fx.rail(m, p, col, 0.5);
      slug(ctx, m, p, col, 0.6);
      const sky = g.clone().setY(34);
      fx.vfx.beams.spawn({ a: sky, b: g, color: col, width: 2.2, width1: 0.9, core: 0.45, life: 0.75, taper: 0.02, hold: 0.45 });
      fx.vfx.beams.spawn({ a: sky, b: g, color: hot(ctx), width: 0.8, width1: 0.3, core: 0.85, life: 0.5, taper: 0.02, hold: 0.4 });
      // three thin converging lances spiral in just before the core lance fades
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094, o = new THREE.Vector3(Math.cos(a) * 3, 30, Math.sin(a) * 3).add(g);
        fx.vfx.beams.spawn({ a: o, b: g, color: col, width: 0.25, width1: 0.1, core: 0.6, life: 0.35, taper: 0.02 });
      }
      fx.light(g.clone().setY(1.5), C(ctx, 2.4, 2.8, 3.4), 90, 0.5);
      fx.star(g.clone().setY(1.2), hot(ctx), 4.5, 0.25);
      fx.explosion(p, col, 1.5);
      // shock rings + scorched glowing hex left on the plate
      fx.vfx.rings.spawn({ pos: g, color: col, r0: 0.4, r1: 5.5, thick: 0.18, life: 0.6, kind: 0 });
      fx.vfx.rings.spawn({ pos: g.clone().setY(0.07), color: hot(ctx), r0: 0.3, r1: 2.6, thick: 0.35, life: 0.3, kind: 2 });
      fx.vfx.rings.spawn({ pos: g.clone().setY(0.065), color: C(ctx, 2.6, 0.9, 0.25), r0: 1.3, r1: 1.4, thick: 0.25, life: 2.6, kind: 2, hold: 0.7 });
      fx.vfx.rings.spawn({ pos: g.clone().setY(0.06), color: C(ctx, 1.2, 0.35, 0.1), r0: 0.2, r1: 1.2, thick: 1, life: 2.4, kind: 1, alpha: 0.6, hold: 0.6 });
      fx.darkCore?.(g.clone().setY(0.25), 1.4, 1.6);
      // column of fire + debris
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
        fx.vfx.add.spawn({ pos: g.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(0, 2.5), Math.sin(a) * r)), vel: new THREE.Vector3(Math.cos(a) * rnd(0.5, 2), rnd(2, 8), Math.sin(a) * rnd(0.5, 2)), color: i % 3 ? col : hot(ctx), life: rnd(0.3, 0.8), size: rnd(0.15, 0.4), size1: 0.02, kind: 0, drag: 1.5, floor: false });
      }
      for (let i = 0; i < 18; i++) fx.vfx.add.spawn({ pos: g.clone().setY(0.3), vel: new THREE.Vector3(rnd(-7, 7), rnd(3, 9), rnd(-7, 7)), color: i % 2 ? C(ctx, 3.2, 1.4, 0.4) : hot(ctx), life: rnd(0.4, 0.9), size: 0.08, size1: 0.01, kind: 1, streak: 0.1, grav: 12, floor: true });
      for (let i = 0; i < 10; i++) fx.vfx.alpha.spawn({ pos: g.clone().setY(0.4), vel: new THREE.Vector3(rnd(-3, 3), rnd(3, 7), rnd(-3, 3)), color: C(ctx, 0.12, 0.12, 0.14), alpha: 1, life: rnd(0.7, 1.1), size: rnd(0.06, 0.12), kind: 3, grav: 14, drag: 0.4 });
      for (let i = 0; i < 8; i++) fx.after(0.25 + i * 0.12, () => fx.vfx.alpha.spawn({ pos: g.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), 0.4, rnd(-0.5, 0.5))), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(1.2, 2.2), rnd(-0.3, 0.3)), color: C(ctx, 0.08, 0.08, 0.1), alpha: 0.5, life: 1.5, size: 0.5, size1: 1.6, kind: 2, drag: 1, floor: false }));
      // afterglow: second, thinner pulse down the same column
      fx.after(0.22, () => fx.vfx.beams.spawn({ a: g.clone().setY(30), b: g, color: col, width: 0.9, width1: 0.4, core: 0.6, life: 0.4, taper: 0.03 }));
    }
  },
};
