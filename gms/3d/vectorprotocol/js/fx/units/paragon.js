// PARAGON signature FX (sculptor-20). Also AURELIAN (boss_aurelian uses the paragon model; rank 5 = the boss look).
// Satellite Ping (basic) = a warm thread of light leaves the raised palm, strikes the satellite mirror that is most "on the way",
// glints, and the reflected beam (white core, cyan sheath) lands on the target; a hex glint + sparks on impact, crits get a
// needle of light straight down from orbit.
// Satellite Lance (overdrive) = at the cast frame the uplink fires a gold thread into the sky and the scene dims while the ring
// launches (light streaks rise off every satellite); at the release a gold-white column comes down from orbit at one end of the
// enemy column and sweeps along it, blasting each target in turn (EMP crackle), leaving a scorched glowing line for ~1 s.
// AURELIAN adds six converging satellite lances that ride the sweep head and a heavier dim.
const rnd = (a, b) => a + Math.random() * (b - a);
const C = (ctx, r, g, b) => new ctx.THREE.Color(r, g, b);
const gold = (ctx) => C(ctx, 3.2, 2.2, 0.75);
const hot = (ctx) => C(ctx, 3.2, 3.0, 2.6);
const cyan = (ctx) => C(ctx, 0.5, 2.6, 3.4);
function sock(ctx, who, name, fallback = 'core') {
  const s = who.unit?.socket?.(name);
  if (s && who.root.visible) { who.root.updateMatrixWorld(true); return s.getWorldPosition(new ctx.THREE.Vector3()); }
  return who.pos(fallback);
}
const isBoss = (who) => (who.unit?.rank ?? 0) >= 5;
// the satellite that bends the beam least: min |palm-sat| + |sat-target|, favouring ones above the palm
function relay(ctx, src, from, to) {
  let best = null, bd = Infinity, bi = 0;
  for (let i = 0; i < 6; i++) {
    const s = src.unit?.socket?.('sat' + i);
    if (!s) continue;
    const p = s.getWorldPosition(new ctx.THREE.Vector3());
    const d = p.distanceTo(from) + p.distanceTo(to) - Math.max(0, p.y - from.y) * 0.5;
    if (d < bd) { bd = d; best = p; bi = i; }
  }
  return best ? { p: best, i: bi } : null;
}
function glint(ctx, p, k = 1) {
  const { fx } = ctx;
  fx.star(p, hot(ctx), 1.0 * k, 0.14);
  fx.vfx.rings.spawn({ pos: p, color: gold(ctx), r0: 0.08, r1: 0.5 * k, thick: 0.05, life: 0.22, face: true, kind: 2 });
  fx.light(p, gold(ctx), 10 * k, 0.15);
}
function ping(ctx, src, target, from, life, k = 1) {
  const { fx, THREE } = ctx;
  const to = target.pos('core');
  const r = relay(ctx, src, from, to);
  const via = r ? r.p : from.clone().add(new THREE.Vector3(0, 1.2, 0));
  const follow = r ? (bm) => { src.unit?.socket?.('sat' + r.i)?.getWorldPosition(bm.b); } : null;
  // palm -> mirror: thin warm thread; mirror -> target: white core in a cyan sheath
  fx.vfx.beams.spawn({ a: from, b: via, color: gold(ctx), width: 0.07 * k, width1: 0.04, core: 0.7, life: life * 0.6, taper: 0.05, hold: 0.6, fn: follow });
  fx.vfx.beams.spawn({ a: via, b: to, color: cyan(ctx), width: 0.2 * k, width1: 0.1, core: 0.5, life, taper: 0.05, hold: 0.5,
    fn: r ? (bm) => { src.unit?.socket?.('sat' + r.i)?.getWorldPosition(bm.a); target.unit?.sockets?.core?.getWorldPosition(bm.b); } : null });
  fx.vfx.beams.spawn({ a: via, b: to, color: hot(ctx), width: 0.07 * k, core: 0.9, life: life * 0.7, taper: 0.05, hold: 0.5 });
  fx.muzzle(from, gold(ctx), 0.6 * k);
  glint(ctx, via, k);
}

export default {
  attack(ctx) {
    const { src, target, timing } = ctx;
    if (!target) return 'default';
    ping(ctx, src, target, src.pos('muzzle'), Math.max(0.25, timing.travel + 0.2), isBoss(src) ? 1.3 : 1);
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx;
    const p = target.pos('core'), k = hit?.crit ? 1.4 : 1;
    fx.star(p, hot(ctx), 1.5 * k, 0.15);
    fx.impact(p, cyan(ctx), 0.7 * k);
    fx.vfx.rings.spawn({ pos: p, color: gold(ctx), r0: 0.1, r1: 0.75 * k, thick: 0.06, life: 0.25, face: true, kind: 2 });
    for (let i = 0; i < 8; i++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-3, 3), rnd(0.5, 4), rnd(-3, 3)), color: i % 2 ? gold(ctx) : hot(ctx), life: rnd(0.15, 0.3), size: 0.06, size1: 0.01, kind: 1, streak: 0.06, grav: 7, floor: true });
    if (hit?.crit) {
      const g = new THREE.Vector3(target.x, 0.06, target.z);
      fx.vfx.beams.spawn({ a: g.clone().setY(30), b: g, color: gold(ctx), width: 0.5, width1: 0.25, core: 0.7, life: 0.3, taper: 0.02, hold: 0.4 });
      fx.vfx.rings.spawn({ pos: g, color: gold(ctx), r0: 0.2, r1: 1.4, thick: 0.08, life: 0.35, kind: 2 });
    }
  },
  shot(ctx) {
    const { fx, THREE, shot, src, target } = ctx;
    if (shot.phase === 'attack') {
      if (shot.index > 0 && target) ping(ctx, src, target, shot.socket, 0.3, 0.8);
      return;
    }
    // overdrive cast frame: the uplink fires into orbit, lights go down, the ring launches with rising light streaks
    if (shot.index !== 0) return;
    const boss = isBoss(src), life = Math.max(0.5, (ctx.timing.windup || 0.4) + 0.4);
    fx.dim(boss ? 0.6 : 0.45, life + 1.6);
    const up = sock(ctx, src, 'uplink', 'head');
    fx.vfx.beams.spawn({ a: up, b: up.clone().setY(up.y + 30), color: gold(ctx), width: 0.16, width1: 0.06, core: 0.8, life: life + 0.4, taper: 0.03, hold: 0.8,
      fn: (bm) => { src.unit?.socket?.('uplink')?.getWorldPosition(bm.a); bm.b.copy(bm.a).setY(bm.a.y + 30); } });
    fx.light(up, gold(ctx), 20, life);
    for (let i = 0; i < 6; i++) fx.after(i * life / 6, () => { const s = sock(ctx, src, 'uplink', 'head'); fx.vfx.add.spawn({ pos: s, vel: new THREE.Vector3(0, 24, 0), color: hot(ctx), life: 0.5, size: 0.3, size1: 0.12, kind: 0, floor: false }); });
    // launch streaks: sample each satellite as the ring climbs
    for (let j = 0; j < 8; j++) fx.after(0.1 + j * 0.05, () => {
      for (let i = 0; i < 6; i++) {
        const s = src.unit?.socket?.('sat' + i);
        if (!s || !src.root.visible) continue;
        const p = s.getWorldPosition(new THREE.Vector3());
        fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(0, -2, 0), color: i % 2 ? gold(ctx) : cyan(ctx), life: 0.35, size: 0.35, size1: 0.05, kind: 1, streak: 0.25, floor: false });
      }
    });
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.07, src.z), color: gold(ctx), r0: 0.4, r1: 2.6, thick: 0.1, life: 0.7, kind: 2 });
    void target;
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const tg = targets.filter(Boolean);
    if (!tg.length) return 'default';
    const boss = isBoss(src), W = boss ? 1.35 : 1;
    // sweep path along the column (targets sorted along z), overshooting both ends
    tg.sort((a, b) => a.z - b.z);
    const a0 = new THREE.Vector3(tg[0].x, 0.06, tg[0].z), a1 = new THREE.Vector3(tg[tg.length - 1].x, 0.06, tg[tg.length - 1].z);
    const dir = a1.clone().sub(a0); if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize();
    const p0 = a0.clone().addScaledVector(dir, -1.6), p1 = a1.clone().addScaledVector(dir, 1.6);
    const len = p0.distanceTo(p1), T = 0.35 + len * 0.055, head = new THREE.Vector3();
    const at = (k) => head.copy(p0).lerp(p1, Math.min(1, Math.max(0, k)));
    // (no screen flash: the column itself whites out the bloom)
    fx.shake(0.4 * W);
    // the column: outer gold, white core, a falling shock halo at the head; follows the sweep
    const col = (w, color, core, life) => fx.vfx.beams.spawn({ a: p0.clone().setY(40), b: p0.clone(), color, width: w, width1: w * 0.6, core, life, taper: 0.02, hold: 0.85,
      fn: (bm, k) => { const s = Math.min(1, (k * life) / T); at(s); bm.b.copy(head); bm.a.copy(head).setY(40); } });
    col(1.3 * W, gold(ctx), 0.3, T + 0.25);
    col(0.34 * W, hot(ctx), 0.85, T + 0.15);
    fx.light(p0.clone().setY(2), gold(ctx), 45, T + 0.2);
    // AURELIAN: six satellite lances from a hexagon in the sky converge on the sweep head
    if (boss) for (let i = 0; i < 6; i++) {
      const ang = i * Math.PI / 3, off = new THREE.Vector3(Math.cos(ang) * 2.6, 32, Math.sin(ang) * 2.6);
      fx.vfx.beams.spawn({ a: p0.clone().add(off), b: p0.clone(), color: i % 2 ? cyan(ctx) : gold(ctx), width: 0.13, width1: 0.08, core: 0.7, life: T + 0.1, taper: 0.02, hold: 0.85,
        fn: (bm, k) => { at(Math.min(1, (k * (T + 0.1)) / T)); bm.b.copy(head); bm.a.copy(head).add(off); } });
    }
    // trailing fire, sparks and the scorched line, sampled along the sweep
    const N = Math.max(8, Math.round(len * 2.2));
    for (let i = 0; i <= N; i++) {
      const k = i / N, p = p0.clone().lerp(p1, k);
      fx.after(k * T, () => {
        fx.vfx.rings.spawn({ pos: p.clone().setY(0.065), color: C(ctx, 2.8, 1.2, 0.3), r0: 0.5, r1: 0.62, thick: 0.4, life: 1.3, kind: 1, alpha: 0.7, hold: 0.6 });
        fx.vfx.rings.spawn({ pos: p.clone().setY(0.07), color: gold(ctx), r0: 0.2, r1: 1.0 * W, thick: 0.08, life: 0.3, kind: 0 });
        for (let j = 0; j < 4; j++) fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0.1, 1.5), rnd(-0.5, 0.5))), vel: new THREE.Vector3(rnd(-1, 1), rnd(2, 7), rnd(-1, 1)), color: j % 2 ? gold(ctx) : hot(ctx), life: rnd(0.3, 0.6), size: rnd(0.25, 0.55), size1: 0.05, kind: 0, drag: 1.5, floor: false });
        for (let j = 0; j < 3; j++) fx.vfx.add.spawn({ pos: p.clone().setY(0.2), vel: new THREE.Vector3(rnd(-6, 6), rnd(3, 8), rnd(-6, 6)), color: gold(ctx), life: rnd(0.3, 0.7), size: 0.08, size1: 0.01, kind: 1, streak: 0.1, grav: 12, floor: true });
      });
    }
    // glowing scorch line on the floor for ~1 s after the sweep
    fx.after(T * 0.5, () => fx.vfx.beams.spawn({ a: p0.clone().setY(0.08), b: p1.clone().setY(0.08), color: C(ctx, 3, 1.3, 0.35), width: 0.75, width1: 0.6, core: 0.6, life: T * 0.5 + 1.2, taper: 0.02, hold: 0.7,
      fn: (bm, k) => { const s = Math.min(1, (T * 0.5 + k * (T * 0.5 + 1.2)) / T); bm.b.copy(p0).lerp(p1, s).setY(0.08); } }));
    // each target is hit as the head passes it: blast, star, EMP crackle
    for (const t of tg) {
      const k = p0.distanceTo(new THREE.Vector3(t.x, 0.06, t.z)) / len;
      fx.after(k * T, () => {
        const p = t.pos('core'), g = new THREE.Vector3(t.x, 0.06, t.z);
        fx.star(g.clone().setY(1.2), hot(ctx), 2.6 * W, 0.2);
        fx.explosion(p, gold(ctx), 1.0 * W);
        fx.vfx.rings.spawn({ pos: g, color: gold(ctx), r0: 0.4, r1: 3.2 * W, thick: 0.14, life: 0.5 });
        fx.vfx.rings.spawn({ pos: g.clone().setY(0.07), color: hot(ctx), r0: 0.3, r1: 2.2, thick: 0.3, life: 0.3, kind: 2 });
        fx.emp(g, cyan(ctx), 1.8);
        fx.shake(0.25 * W);
      });
    }
  },
  // descends from orbit on a gold uplink, the ring unfolds in a burst of glints
  deploy(ctx) {
    const { fx, THREE, src } = ctx;
    const g = new THREE.Vector3(src.x, 0.06, src.z);
    fx.vfx.beams.spawn({ a: g.clone().setY(30), b: g, color: gold(ctx), width: 1.1, width1: 0.6, core: 0.5, life: 0.9, taper: 0.03, hold: 0.5 });
    fx.vfx.beams.spawn({ a: g.clone().setY(30), b: g, color: hot(ctx), width: 0.3, core: 0.9, life: 0.7, taper: 0.03, hold: 0.4 });
    fx.vfx.rings.spawn({ pos: g, color: gold(ctx), r0: 0.3, r1: 2.0, thick: 0.08, life: 0.9, kind: 2, hold: 0.3 });
    fx.after(0.7, () => {
      for (let i = 0; i < 6; i++) { const s = sock(ctx, src, 'sat' + i); glint(ctx, s, 0.8); }
      fx.vfx.rings.spawn({ pos: g.clone().setY(0.07), color: cyan(ctx), r0: 0.3, r1: 2.4, thick: 0.08, life: 0.6 });
    });
  },
};
