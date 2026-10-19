// SOVEREIGN PALADIN signature FX (sculptor-2).
// Arc Blade = a white-gold crescent cut across the target + a splash ring on the floor (R5: light trail motes along the cut).
// Judgement Arc (overdrive) = the greatsword slams down: a standing gold crescent wave rolls down the whole lane,
// the floor cracks light up gold behind it, every target in the lane takes a gold burst + expose sparks, a gold ward wraps the paladin.
function axes(ctx, a, b) {
  const { THREE } = ctx;
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, dir);
  return { dir, up, side };
}
// crescent of beam segments: centre c, basis (u = chord axis, v = bulge axis), radius R, arc span, optional motion fn
function crescent(ctx, c, u, v, R, { span = 2.3, n = 9, color, width = 0.45, life = 0.22, move = null, core = 0.3, hold = 0 } = {}) {
  const { fx, THREE } = ctx, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = -span / 2 + span * i / n;
    pts.push(c.clone().addScaledVector(u, Math.sin(t) * R).addScaledVector(v, Math.cos(t) * R * 0.45));
  }
  for (let i = 0; i < n; i++) {
    const m = 1 - Math.abs((i + 0.5) / n - 0.5) * 2;           // thick in the middle, thin at the tips
    const a0 = pts[i], b0 = pts[i + 1];
    const o = { a: a0, b: b0, color, width: width * (0.25 + 0.75 * m), width1: width * 0.15 * m, core, life, taper: 0.02, hold };
    if (move) o.fn = (bm, k) => { const d = move(k); bm.a.copy(a0).add(d); bm.b.copy(b0).add(d); };
    fx.vfx.beams.spawn(o);
  }
  return pts;
}
const rnd = (a, b) => a + Math.random() * (b - a);

export default {
  attack(ctx) {
    const { fx, THREE, src, target, palette } = ctx;
    if (!target) return 'default';
    const p = target.pos('core'), s = src.pos('core');
    const { dir, up, side } = axes(ctx, s, p);
    // diagonal cut: chord runs high-right to low-left across the target, bulging toward it
    const u = side.clone().multiplyScalar(-0.75).addScaledVector(up, 0.66).normalize();
    const v = dir.clone();
    const c = p.clone().addScaledVector(dir, -0.25);
    const rk = src.unit?.rank ?? 3;
    crescent(ctx, c, u, v, 1.25 + 0.08 * rk, { color: palette.gold, width: 0.55, life: 0.24 });
    const pts = crescent(ctx, c.clone().addScaledVector(dir, 0.04), u, v, 1.2 + 0.08 * rk, { color: palette.white, width: 0.18, life: 0.18, core: 0.6 });
    fx.star(p, palette.gold, 1.6);
    fx.light(p, palette.gold, 30, 0.16);
    if (rk >= 5) for (const q of pts) fx.vfx.add.spawn({ pos: q, vel: new THREE.Vector3(rnd(-0.5, 0.5), rnd(0.2, 1), rnd(-0.5, 0.5)), color: palette.gold, life: rnd(0.35, 0.6), size: 0.14, size1: 0.02, kind: 0, floor: false });
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.gold, hit?.crit ? 1.6 : 1.1);
    fx.sparks(p, palette.white, hit?.crit ? 22 : 12, 6);
    // Arc Blade splashes 30%: a gold ring rolls out across the floor
    fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: palette.gold, r0: 0.3, r1: hit?.crit ? 2.4 : 1.7, thick: 0.1, life: 0.4 });
    fx.shake(hit?.crit ? 0.3 : 0.14);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const s = src.pos('core'), tip = src.pos('muzzle');
    const far = live.reduce((m, t) => (Math.hypot(t.x - src.x, t.z - src.z) > Math.hypot((m?.x ?? src.x) - src.x, (m?.z ?? src.z) - src.z) ? t : m), live[0]);
    const end = far ? new THREE.Vector3(far.x, 0, far.z) : s.clone().add(new THREE.Vector3(src.side === 'player' ? 6 : -6, 0, 0));
    const { dir, up, side } = axes(ctx, s, end);
    const start = new THREE.Vector3(src.x, 0, src.z).addScaledVector(dir, 0.9);
    const D = start.distanceTo(new THREE.Vector3(end.x, 0, end.z)) + 2.5, T = 0.62;

    // the slam: blade-tip flash, ground burst, shake
    fx.screenFlash(palette.gold, 0.16);
    fx.shake(0.85);
    fx.light(tip, palette.gold, 45, 0.35);
    fx.star(tip, palette.white, 3.2, 0.25);
    fx.vfx.rings.spawn({ pos: start.clone().setY(0.06), color: palette.gold, r0: 0.3, r1: 3.2, thick: 0.18, life: 0.5 });
    fx.vfx.rings.spawn({ pos: start.clone().setY(0.07), color: palette.white, r0: 0.2, r1: 2.0, thick: 0.08, life: 0.3, kind: 2 });
    for (let i = 0; i < 26; i++) fx.vfx.add.spawn({ pos: start.clone().setY(0.2), vel: new THREE.Vector3(rnd(-3, 3), rnd(2, 7), rnd(-3, 3)), color: i % 3 ? palette.gold : palette.white, life: rnd(0.3, 0.7), size: 0.1, kind: 1, streak: 0.08, grav: 9, drag: 0.6 });

    // standing crescent wave (in the up/dir plane, bulging forward) rolling down the lane
    const ease = (k) => 1 - Math.pow(1 - k, 1.6);
    const move = (k) => dir.clone().multiplyScalar(D * ease(Math.min(1, k * 1.15)));
    const c0 = start.clone().setY(1.45);
    for (const [col, w, R, life] of [[palette.gold, 1.0, 1.55, T], [palette.white, 0.32, 1.45, T * 0.95], [palette.gold, 0.5, 1.15, T]]) {
      crescent(ctx, c0, up, dir, R, { span: 2.6, n: 11, color: col, width: w, life, move, core: 0.45, hold: 0.55 });
    }
    // a lower, flatter wake hugging the floor (reads from the high battle camera)
    crescent(ctx, start.clone().setY(0.12), side, dir, 1.3, { span: 2.4, n: 9, color: palette.gold, width: 0.5, life: T, move, hold: 0.5 });

    // floor cracks light up behind the wave: jagged gold fissures that linger
    const N = 12;
    for (let i = 0; i < N; i++) {
      const d0 = (i / N) * D;
      fx.after((d0 / D) * T * 0.8, () => {
        const base = start.clone().addScaledVector(dir, d0).setY(0.045);
        for (let j = 0; j < 2; j++) {
          let p = base.clone().addScaledVector(side, rnd(-0.5, 0.5));
          for (let k = 0; k < 3; k++) {
            const q = p.clone().addScaledVector(dir, rnd(0.25, 0.55)).addScaledVector(side, rnd(-0.35, 0.35));
            fx.vfx.beams.spawn({ a: p, b: q, color: palette.gold, width: 0.09, width1: 0.05, core: 0.5, life: 1.5, hold: 0.55, taper: 0.01 });
            p = q;
          }
        }
        fx.vfx.add.spawn({ pos: base.clone().setY(0.1), vel: new THREE.Vector3(0, rnd(1, 2.5), 0), color: palette.gold, life: rnd(0.5, 0.9), size: 0.22, size1: 0.04, kind: 0, floor: false });
      });
    }
    // every target in the lane: hit when the wave reaches it, expose sparks
    for (const t of live) {
      const dt = Math.max(0, Math.min(1, start.distanceTo(new THREE.Vector3(t.x, 0, t.z)) / D)) * T * 0.75;
      fx.after(dt, () => {
        const p = t.pos('core');
        fx.impact(p, palette.gold, 1.5);
        fx.star(p, palette.white, 2.2, 0.2);
        fx.sparks(p, palette.gold, 18, 7);
        fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: palette.gold, r0: 0.4, r1: 2.6, thick: 0.12, life: 0.6, kind: 2 });
        fx.after(0.15, () => fx.debuffAura(new THREE.Vector3(t.x, 0, t.z), palette.orange));
      });
    }
    // Judgement's ward: gold shield on the paladin
    fx.after(0.25, () => {
      fx.buffAura(new THREE.Vector3(src.x, 0, src.z), palette.gold);
      fx.shieldHit(src.pos('core'), palette.gold);
    });
  },
};
