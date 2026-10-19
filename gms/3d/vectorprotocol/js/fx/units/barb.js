// BARB signature FX (sculptor-3). Needle Burst = three thin red flechettes (one per rifle twitch) that stick in the target and glow;
// Thornstorm (overdrive) = the flared back spines launch a storm of red flechettes that arc up and rain down the whole lane,
// every target left bristling with glowing spikes and burning.
const SHOTS = 3, GAP = 0.063;   // matches the model's attack fire events (0.30 / 0.37 / 0.44 of 0.9 s)
const rnd = (a) => (Math.random() - 0.5) * a;
function axes(ctx, who) {
  const { THREE } = ctx, q = new THREE.Quaternion();
  who.root.getWorldQuaternion(q);
  return { fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), right: new THREE.Vector3(-1, 0, 0).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0) };
}
// a flechette lodged in the target: a short glowing needle sticking out of it for a moment
function stuck(ctx, p, col, n = 1, life = 0.9, len = 0.35, w = 0.04) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    const d = new THREE.Vector3(rnd(2), rnd(1.4) + 0.3, rnd(2)).normalize();
    const a = p.clone().addScaledVector(d, 0.12 + Math.random() * 0.15);
    fx.vfx.beams.spawn({ a, b: a.clone().addScaledVector(d, len * (0.6 + Math.random() * 0.6)), color: col, width: w, width1: w * 0.75, core: 0.6, life, hold: 0.7, taper: 1 });
  }
}
function burn(ctx, p, k = 1, dur = 1) {
  const { fx, THREE, palette } = ctx;
  const n = Math.round(10 * dur);
  for (let i = 0; i < n; i++) fx.after(i * 0.1, () => {
    for (let j = 0; j < 3 * k; j++) fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(0.6), rnd(0.8), rnd(0.6))), vel: new THREE.Vector3(rnd(0.4), 1.4 + Math.random(), rnd(0.4)), color: j % 2 ? palette.orange : palette.red, life: 0.35, size: 0.22, size1: 0.02, kind: 0, drag: 1, floor: false });
  });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const hot = palette.red.clone().lerp(palette.white, 0.35);
    for (let i = 0; i < SHOTS; i++) fx.after(i * GAP, () => {
      const a = src.pos('muzzle'), b = target.pos('core').add(new THREE.Vector3(rnd(i ? 0.5 : 0.1), rnd(i ? 0.5 : 0.1), rnd(i ? 0.5 : 0.1)));
      fx.muzzle(a, palette.red, 0.6);
      fx.bolt(a, b, i === 1 ? hot : palette.red, Math.max(0.06, timing.travel), { size: 0.09, trail: 2.6 });
      if (i === 0) fx.light(a, palette.red, 10, 0.06);
      if (i) fx.after(Math.max(0.06, timing.travel), () => { fx.sparks(b, palette.red, 4, 3); stuck(ctx, b, palette.red, 1, 0.7, 0.3); });
    });
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.red, hit?.crit ? 1.2 : 0.7);
    stuck(ctx, p, hit?.crit ? palette.orange : palette.red, hit?.crit ? 3 : 1);
    // Venom Rounds: crits poison (burn) the target
    if (hit?.crit) { fx.debuffAura(p.clone().setY(0.05), palette.orange); burn(ctx, p, 1, 0.8); }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const { fwd, right, up } = axes(ctx, src);
    const s = Math.max(0.6, src.height / 2.6);
    // launch point: the flared spine fan over the back
    const back = () => src.pos('head').addScaledVector(up, 0.35 * s).addScaledVector(fwd, -0.3 * s);
    const hot = palette.red.clone().lerp(palette.white, 0.4);
    fx.screenFlash(palette.red, 0.07);
    fx.vfx.rings.spawn({ pos: back(), color: palette.red, r0: 0.2, r1: 1.6 * s, thick: 0.2, life: 0.3, face: true });
    fx.light(back(), palette.red, 40, 0.5);
    const pts = live.length ? live.map((t) => t.pos('core')) : [src.pos('core').addScaledVector(fwd, 7)];
    const N = 46, DUR = 0.95;
    const hits = pts.map(() => 0);
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), j = i % pts.length;
      fx.after(k * DUR, () => {
        const a = back().add(new THREE.Vector3(rnd(0.7 * s), rnd(0.4 * s), rnd(0.7 * s)));
        const b = pts[j].clone().add(new THREE.Vector3(rnd(0.9), rnd(0.9), rnd(0.9)));
        const dur = 0.32 + Math.random() * 0.12;
        fx.bolt(a, b, i % 4 ? palette.red : hot, dur, { size: 0.15, arc: 1.4 + Math.random() * 0.8, trail: 2.6 });
        if (i % 3 === 0) fx.vfx.add.spawn({ pos: a, vel: up.clone().multiplyScalar(2).addScaledVector(right, rnd(3)), color: palette.red, life: 0.25, size: 0.3, size1: 0.02, kind: 1, streak: 0.06, drag: 2, floor: false });
        fx.after(dur, () => {
          fx.sparks(b, palette.red, 3, 3);
          stuck(ctx, b, i % 2 ? palette.red : palette.orange, 1, 1.8, 0.7, 0.07);
          if (++hits[j] === 3) { fx.impact(pts[j], palette.red, 1.3); fx.shake(0.2); }
        });
      });
    }
    // targets bristle and start to burn (burn x2)
    pts.forEach((p, j) => fx.after(DUR * 0.6 + j * 0.05, () => {
      fx.debuffAura(p.clone().setY(0.05), palette.orange);
      burn(ctx, p, 2, 1.6);
    }));
    fx.after(DUR + 0.35, () => fx.shake(0.3));
  },
};
