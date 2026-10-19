// PHASE signature FX (sculptor-5). Phase Strike = a blink-jab: a magenta smear from the shoulder to the fist, a hex ring
// and a slash of "phase scars" on the target. Phase Shift (overdrive) = the body splits into afterimages (model), dashes
// through the enemy front line and back: ghost streaks, purple phase-scar crosses that linger on every target, a slow
// field under them, and a fortify shell on PHASE when it lands home.
const MAG = (THREE) => new THREE.Color(1.5, 0.3, 2.1);

function axes(ctx) {
  const { THREE, src } = ctx, q = new THREE.Quaternion();
  src.root.getWorldQuaternion(q);
  return { fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0), left: new THREE.Vector3(1, 0, 0).applyQuaternion(q) };
}
// an X of short lingering beams across a target (the phase scar)
function scar(ctx, p, col, k = 1, life = 0.7) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < 2; i++) {
    const a = (i ? 0.7 : -0.7) + (Math.random() - 0.5) * 0.4, r = 0.55 * k;
    const d = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.3);
    fx.vfx.beams.spawn({ a: p.clone().sub(d), b: p.clone().add(d), color: col, width: 0.07 * k, width1: 0.0, core: 0.6, life, taper: 1, hold: 0.4 });
  }
  fx.vfx.rings.spawn({ pos: p.clone(), color: col, r0: 0.1, r1: 0.7 * k, thick: 0.08, life: 0.35, kind: 2, face: true });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, palette } = ctx;
    if (!target) return 'default';
    const col = MAG(THREE), fist = src.pos('muzzle'), sh = src.pos('core');
    fx.vfx.beams.spawn({ a: sh, b: fist, color: col, width: 0.22, width1: 0.05, core: 0.6, life: 0.16, taper: 1 });
    fx.muzzle(fist, palette.faction, 1.2);
    fx.light(fist, col, 10, 0.12);
  },
  impact(ctx) {
    const { fx, THREE, target, hit, palette } = ctx;
    const p = target.pos('core'), col = MAG(THREE);
    fx.impact(p, palette.faction, hit?.crit ? 1.4 : 0.9);
    fx.sparks(p, col, hit?.crit ? 16 : 9, 5);
    scar(ctx, p, col, hit?.crit ? 1.2 : 0.8, hit?.crit ? 0.6 : 0.4);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const col = MAG(THREE), { fwd, left } = axes(ctx);
    const home = src.pos('core'), pts = live.map((t) => t.pos('core'));
    // tell the model how far to blink (model space): just past the front line
    const ctr = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const sc = src.root.getWorldScale(new THREE.Vector3()).x || 1;
    if (src.unit) src.unit.phaseDist = Math.max(0.8, Math.min(4, ctr.clone().sub(home).dot(fwd) / sc + 0.25));
    fx.screenFlash(palette.faction, 0.08);
    fx.shake(0.25);
    // three ghost streaks out of the start point: the split
    for (const s of [-1, 0, 1]) {
      const a = home.clone().addScaledVector(left, s * 0.6), b = ctr.clone().addScaledVector(left, s * 0.9);
      fx.vfx.beams.spawn({ a, b, color: col, width: 0.22, width1: 0.04, core: 0.4, life: 0.3, taper: 1, jitter: 0.05 });
    }
    for (let i = 0; i < 18; i++) fx.vfx.add.spawn({ pos: home.clone().lerp(ctr, i / 17).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 0.8, (Math.random() - 0.5) * 0.6)), color: col, life: 0.35 + Math.random() * 0.3, size: 0.18, size1: 0, kind: 0, floor: false, alpha: 0.9 });
    fx.light(home, col, 12, 0.2);
    // arrive + sweep: scars on every target, staggered across the line
    pts.forEach((p, i) => fx.after(0.16 + i * 0.06, () => {
      scar(ctx, p, col, 1.4, 1.2);
      fx.impact(p, palette.faction, 1.0);
      fx.sparks(p, col, 12, 6);
      fx.debuffAura(p, palette.faction);
      fx.areaField(p.clone().setY(0.05), { radius: 0.9, color: palette.faction, life: 1.6, kind: 'debuff', motes: 6 });
      fx.shake(0.18);
    }));
    fx.after(0.2, () => fx.light(ctr, col, 14, 0.3));
    // blink home: a return streak, a burst at the start point, fortify shell
    fx.after(0.62, () => {
      const now = src.pos('core');
      fx.vfx.beams.spawn({ a: ctr, b: now, color: col, width: 0.3, width1: 0.05, core: 0.6, life: 0.25, taper: 1 });
      fx.vfx.rings.spawn({ pos: now.clone().setY(0.06), color: col, r0: 0.2, r1: 1.6, thick: 0.12, life: 0.45, kind: 2 });
      fx.buffAura(now, palette.faction);
      fx.shieldBubble({ follow: src.root, offsetY: (src.height || 3) * 0.5, radius: 1.3, color: palette.faction, life: 1.6, alpha: 0.6 });
      fx.shake(0.3);
    });
  },
};
