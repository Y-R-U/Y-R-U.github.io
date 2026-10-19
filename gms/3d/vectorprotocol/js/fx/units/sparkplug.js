// SPARKPLUG signature FX (sculptor-8). Blue-white electricity, back-alley tesla flavour.
// Arc Zap (basic, fired from the cast anim) = the coils crackle, then a jagged forked bolt jumps from the electrodes to the target;
// impact = a blue-white flash with a crackle cage + sparks, the target's lights stutter.
// Arc Surge (overdrive) = the coils discharge straight up, then lightning chains through up to five enemies one hop at a time,
// each hop a fresh jagged bolt + flash + blackout flicker; a last lingering crackle on every struck target.
const rnd = (a, b) => a + Math.random() * (b - a);
function col(ctx, k = 1) { return new ctx.THREE.Color(1.5 * k, 2.6 * k, 3.6 * k); }   // HDR blue-white
function bonePos(ctx, who, name) {
  const bones = who.unit?.bones, b = bones && bones.find ? bones.find((x) => x.name === name) : null;
  const p = new ctx.THREE.Vector3();
  if (b) b.getWorldPosition(p); else p.copy(who.pos('head'));
  return p;
}
const coilTop = (ctx, who) => bonePos(ctx, who, 'aux2');
// one jagged bolt a->b: n segments with perpendicular kinks, re-struck `flick` times so it flickers; optional side forks
function bolt(ctx, a, b, { n = 7, amp = 0.35, life = 0.12, width = 0.07, flick = 3, gap = 0.05, forks = 2, c = col(ctx) } = {}) {
  const { fx, THREE } = ctx;
  const d = b.clone().sub(a), L = d.length();
  const strike = () => {
    let prev = a.clone();
    for (let i = 1; i <= n; i++) {
      const u = i / n, q = a.clone().addScaledVector(d, u);
      if (i < n) q.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(amp * Math.min(1, L / 3) * Math.sin(u * Math.PI)));
      fx.vfx.beams.spawn({ a: prev.clone(), b: q.clone(), color: c, width, core: 0.75, life, taper: 0.15 });
      if (forks && i < n && Math.random() < forks / n) {
        const f = q.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.8), rnd(-1, 1)).multiplyScalar(amp * 1.4));
        fx.vfx.beams.spawn({ a: q.clone(), b: f, color: c, width: width * 0.5, core: 0.6, life: life * 0.8, taper: 0.5 });
      }
      prev = q;
    }
  };
  strike();
  for (let i = 1; i < flick; i++) fx.after(i * gap, strike);
}
function crackle(ctx, p, n = 5, r = 0.6, c = col(ctx)) {
  for (let i = 0; i < n; i++) {
    const q = p.clone().add(new ctx.THREE.Vector3(rnd(-r, r), rnd(-r, r), rnd(-r, r)));
    bolt(ctx, p, q, { n: 3, amp: r * 0.5, life: rnd(0.06, 0.12), width: 0.035, flick: 1, forks: 0, c });
  }
}
function flash(ctx, p, k = 1, c = col(ctx)) {
  const { fx } = ctx;
  fx.vfx.add.spawn({ pos: p, color: c, life: 0.1, size: 1.1 * k, size1: 1.8 * k, kind: 0, floor: false });
  fx.star(p, c, 1.5 * k, 0.12);
  fx.light(p, c, 24 * k, 0.15);
}
function zapTarget(ctx, t, k = 1, blackout = 0.3) {
  const { fx } = ctx, p = t.pos('core'), c = col(ctx);
  flash(ctx, p, k, c);
  fx.sparks(p, c, Math.round(12 * k), 5);
  crackle(ctx, p, Math.round(4 * k), 0.7 * k, c);
  fx.vfx.rings.spawn({ pos: p, color: c, r0: 0.2, r1: 1.0 * k, thick: 0.08, life: 0.25, face: true });
  t.unit?.flickerPower?.(blackout);
}

export default {
  attack(ctx) {
    const { fx, src, target, timing } = ctx;
    if (!target) return 'default';
    const c = col(ctx), a = src.pos('muzzle'), a2 = src.pos('muzzleL'), b = target.pos('core'), top = coilTop(ctx, src);
    // coils crackle, the charge runs down to the electrodes, then the bolt jumps
    crackle(ctx, top, 4, 0.35, c);
    bolt(ctx, top, a, { n: 4, amp: 0.15, life: 0.08, width: 0.035, flick: 1, forks: 0 });
    flash(ctx, a, 0.6, c);
    const life = Math.max(0.12, timing.travel + 0.08);
    bolt(ctx, a, b, { n: 8, amp: 0.45, life: 0.09, width: 0.08, flick: Math.max(2, Math.round(life / 0.05)), gap: 0.05, forks: 2 });
    if (a2) bolt(ctx, a2, b, { n: 7, amp: 0.5, life: 0.07, width: 0.05, flick: 2, gap: 0.06, forks: 1 });
  },
  impact(ctx) {
    const { target, hit } = ctx;
    zapTarget(ctx, target, hit?.crit ? 1.4 : 1, hit?.crit ? 0.5 : 0.25);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const c = col(ctx), top = coilTop(ctx, src);
    // coils discharge straight up into the air, white flash
    for (let i = 0; i < 3; i++) bolt(ctx, top, top.clone().add(new THREE.Vector3(rnd(-0.8, 0.8), rnd(2.2, 3.4), rnd(-0.8, 0.8))), { n: 6, amp: 0.4, life: 0.1, width: 0.07, flick: 3, gap: 0.05 });
    flash(ctx, top, 1.6, c);
    crackle(ctx, top, 8, 0.6, c);
    fx.screenFlash(palette.white, 0.18);
    fx.shake(0.25);
    if (!live.length) return;
    // the chain: electrodes -> t0 -> t1 -> ... one hop every 0.11 s
    let from = src.pos('muzzle'), hop = 0.11;
    live.forEach((t, i) => {
      const a = from.clone(), b = t.pos('core');
      fx.after(i * hop, () => {
        bolt(ctx, a, b, { n: 9, amp: 0.6, life: 0.09, width: 0.1, flick: 4, gap: 0.045, forks: 3 });
        zapTarget(ctx, t, 1.25, 0.7);
        fx.shake(0.12);
      });
      // lingering crackle cage on every struck target
      fx.after(i * hop + 0.35, () => crackle(ctx, t.pos('core'), 4, 0.6, c));
      from = b;
    });
    // the last hop grounds out: a ring on the floor under the final target
    const last = live[live.length - 1];
    fx.after((live.length - 1) * hop + 0.05, () => {
      const g = last.root.getWorldPosition(new THREE.Vector3()).setY(0.06);
      fx.vfx.rings.spawn({ pos: g, color: c, r0: 0.3, r1: 2.6, thick: 0.1, life: 0.45, kind: 2 });
      fx.screenFlash(c, 0.1);
    });
  },
};
