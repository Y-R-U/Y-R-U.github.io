// WARDEN-3 signature FX (sculptor-7). Baton Strike = the stun baton crackles on contact: jagged cyan arcs from the tip into the
// target, a shock spark burst and a small floor ring (the 15% shock proc reads as arcs crawling over the target).
// Lockdown (overdrive) = the baton slams the floor: light-bar strobes, a cyan shock ring races down the lane, and the target is
// boxed in a glowing hex cage for the 2 s stun.
const rnd = (a) => (Math.random() - 0.5) * a;
function arcs(ctx, a, b, col, n = 3, life = 0.12, w = 0.06) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    const m = a.clone().lerp(b, 0.5).add(new THREE.Vector3(rnd(0.5), rnd(0.5), rnd(0.5)));
    fx.vfx.beams.spawn({ a, b: m, color: col, width: w, life, jitter: true, core: 0.4 });
    fx.vfx.beams.spawn({ a: m, b: b.clone().add(new THREE.Vector3(rnd(0.3), rnd(0.3), rnd(0.3))), color: col, width: w * 0.8, life, jitter: true, core: 0.4 });
  }
}
// arcs crawling over a unit for `dur` seconds
function crawl(ctx, who, col, dur = 0.8, every = 0.1) {
  const { fx, THREE } = ctx;
  const h = who.height || 2;
  for (let t = 0; t < dur; t += every) fx.after(t, () => {
    if (who.alive === false) return;
    const c = who.pos('core'), p = c.clone().add(new THREE.Vector3(rnd(0.9), rnd(h * 0.6), rnd(0.9)));
    fx.vfx.beams.spawn({ a: c, b: p, color: col, width: 0.04, life: 0.08, jitter: true, core: 0.5 });
  });
}
function cage(ctx, who, col, life) {
  const { fx, THREE } = ctx;
  const base = who.pos('core').setY(0.06), h = Math.max(1.6, (who.height || 2) * 1.05), R = Math.max(0.8, (who.height || 2) * 0.34);
  const pts = (y) => Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; return new THREE.Vector3(base.x + Math.cos(a) * R, y, base.z + Math.sin(a) * R); });
  const lo = pts(0.06), hi = pts(h);
  for (let i = 0; i < 6; i++) {
    fx.vfx.beams.spawn({ a: lo[i], b: hi[i], color: col, width: 0.07, life, hold: 0.85, core: 0.45 });
    fx.vfx.beams.spawn({ a: hi[i], b: hi[(i + 1) % 6], color: col, width: 0.06, life, hold: 0.85, core: 0.45 });
    fx.vfx.beams.spawn({ a: lo[i].clone().lerp(hi[i], 0.5), b: lo[(i + 1) % 6].clone().lerp(hi[(i + 1) % 6], 0.5), color: col, width: 0.035, life, hold: 0.85, core: 0.3 });
  }
  fx.vfx.rings.spawn({ pos: base, color: col, r0: R * 1.12, r1: R * 1.12, thick: 0.1, life, kind: 2, hold: 0.85 });
  fx.vfx.rings.spawn({ pos: base.clone().setY(h), color: col, r0: R * 1.12, r1: R * 1.12, thick: 0.08, life, kind: 2, hold: 0.85 });
  fx.vfx.rings.spawn({ pos: base, color: col, r0: R * 0.2, r1: R * 1.1, thick: 0.4, life: 0.35, kind: 1 });
}

export default {
  attack(ctx) {
    const { fx, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const tip = src.pos('hand'), hot = palette.white.clone().lerp(palette.cyan, 0.4);
    // the hook runs on the strike frame: crackle at the tip, then arcs into the target as the blow lands
    fx.sparks(tip, palette.cyan, 8, 4);
    fx.light(tip, palette.cyan, 14, 0.12);
    fx.after(Math.max(0, timing.travel - 0.02), () => {
      const t2 = src.pos('hand'), c = target.pos('core');
      arcs(ctx, t2, c, hot, 2, 0.14, 0.07);
    });
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.cyan, hit?.crit ? 1.4 : 0.9);
    fx.sparks(p, palette.white, hit?.crit ? 16 : 9, 6);
    fx.vfx.rings.spawn({ pos: p, color: palette.cyan, r0: 0.1, r1: 0.7, thick: 0.1, life: 0.18, face: true });
    crawl(ctx, target, palette.cyan, hit?.crit ? 0.8 : 0.35, 0.07);
  },
  overdrive(ctx) {
    const { fx, THREE, src, target, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const tgt = target || live[0];
    const cyan = palette.cyan, hot = palette.white.clone().lerp(cyan, 0.3), amber = palette.orange;
    const tip = src.pos('hand'), floor = tip.clone().setY(0.05);
    // slam: light-bar strobes, flash, floor burst at the baton tip
    fx.screenFlash(cyan, 0.18);
    fx.shake(0.45);
    fx.light(floor, cyan, 40, 0.25);
    fx.sparks(floor, hot, 30, 9, 1.5);
    fx.vfx.rings.spawn({ pos: floor, color: cyan, r0: 0.1, r1: 2.2, thick: 0.25, life: 0.4 });
    fx.vfx.rings.spawn({ pos: floor, color: hot, r0: 0.1, r1: 1.2, thick: 0.5, life: 0.25, kind: 1 });
    const head = src.pos('head');
    for (let i = 0; i < 6; i++) fx.after(i * 0.12, () => fx.light(head, i % 2 ? cyan : amber, 18, 0.08));
    if (!tgt) return;
    // shock ring races down the lane to the target
    const end = tgt.pos('core').setY(0.05), N = 9, dur = 0.32;
    for (let i = 1; i <= N; i++) {
      const k = i / N;
      fx.after(k * dur, () => {
        const p = floor.clone().lerp(end, k);
        fx.vfx.rings.spawn({ pos: p, color: cyan, r0: 0.25, r1: 0.95, thick: 0.18, life: 0.3 });
        fx.sparks(p, cyan, 5, 5, 1.2);
        if (i % 3 === 0) arcs(ctx, p, p.clone().add(new THREE.Vector3(rnd(0.8), 0.4, rnd(0.8))), hot, 1, 0.1, 0.05);
      });
    }
    // lock it down: hex cage for the stun, arcs crawling over the target
    fx.after(dur, () => {
      if (tgt.alive === false) return;
      const c = tgt.pos('core');
      fx.impact(c, cyan, 1.6);
      fx.explosion(c, cyan, 0.6);
      cage(ctx, tgt, cyan, 2.0);
      crawl(ctx, tgt, hot, 1.8, 0.09);
      fx.shake(0.3);
    });
  },
};
