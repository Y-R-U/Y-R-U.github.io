// JAMMER signature FX (sculptor-4). White-blue static, pirate-radio flavour.
// Static Burst (basic, fired from the cast anim) = a train of radio-wave rings riding a crackling static line from the dish
// to the target; impact = static discharge + charge motes drained off the target. Blackout (overdrive) = the dish fires a
// ring-shaped EMP shockwave that rolls across the enemy side as a wall of static; each enemy it passes sparks and its lights
// flicker off for a moment; the screen glitches.
const rnd = (a, b) => a + Math.random() * (b - a);
function col(ctx) { return new ctx.THREE.Color(1.3, 2.4, 3.4); }      // HDR white-blue static
function ground(ctx, t) { const p = new ctx.THREE.Vector3(); (t.root || t).getWorldPosition(p); return p; }
function crackle(ctx, p, n = 4, r = 0.7, c = col(ctx)) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    const q = p.clone().add(new THREE.Vector3(rnd(-r, r), rnd(-r, r), rnd(-r, r)));
    fx.vfx.beams.spawn({ a: p.clone(), b: q, color: c, width: 0.05, core: 0.6, life: rnd(0.08, 0.16), taper: 0.3, jitter: true });
  }
}
// make a unit's lights flicker off: the kit's supported hook (units.js flickerPower), no direct material writes
function blackout(ctx, unit, dur = 0.9) {
  unit?.flickerPower?.(dur);
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const c = col(ctx), a = src.pos('muzzle'), b = target.pos('core');
    const travel = Math.max(0.1, timing.travel);
    fx.vfx.rings.spawn({ pos: a, color: c, r0: 0.1, r1: 0.7, thick: 0.12, life: 0.25, face: true });
    fx.vfx.add.spawn({ pos: a, color: c, life: 0.14, size: 0.7, size1: 0.2, kind: 0, floor: false });
    fx.light(a, c, 14, 0.12);
    // crackling static line + a bright packet riding it
    fx.beam(a, b, c, travel + 0.1, 0.06, true);
    fx.vfx.beams.spawn({ a: a.clone(), b: b.clone(), color: c, width: 0.12, core: 0.5, life: travel * 0.6 + 0.05, taper: 0.1, jitter: true, alpha: 0.5 });
    fx.bolt(a, b, c, travel, { size: 0.18, trail: 0.6 });
    // radio-wave rings rolling out along the path
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      fx.after(k * travel, () => fx.vfx.rings.spawn({ pos: a.clone().lerp(b, k), color: c, r0: 0.15 + k * 0.2, r1: 0.45 + k * 0.35, thick: 0.08, life: 0.22, face: true }));
    }
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx;
    const c = col(ctx), p = target.pos('core'), k = hit?.crit ? 1.4 : 1;
    fx.vfx.add.spawn({ pos: p, color: c, life: 0.12, size: 1.0 * k, size1: 1.6 * k, kind: 0, floor: false });
    fx.star(p, c, 1.6 * k, 0.14);
    fx.sparks(p, c, Math.round(12 * k), 5);
    crackle(ctx, p, 5, 0.8 * k, c);
    fx.vfx.rings.spawn({ pos: p, color: c, r0: 0.2, r1: 1.0 * k, thick: 0.1, life: 0.3, face: true });
    // charge drained: motes lift off the target and fade
    for (let i = 0; i < 10; i++) {
      const q = p.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.6, 0.4), rnd(-0.5, 0.5)));
      fx.vfx.add.spawn({ pos: q, vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(1.2, 2.2), rnd(-0.2, 0.2)), color: c, life: rnd(0.4, 0.7), size: 0.09, size1: 0.02, kind: 1, streak: 0.1, floor: false, fadeIn: 0.05 });
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const c = col(ctx), white = palette.white;
    const top = src.pos('muzzle'), o = ground(ctx, src);
    // the dish fires: stacked face rings + a column of light down the mast
    for (let i = 0; i < 3; i++) fx.after(i * 0.06, () => fx.vfx.rings.spawn({ pos: top, color: i ? c : white, r0: 0.2, r1: 1.4 + i * 0.6, thick: 0.1, life: 0.35, face: true }));
    fx.vfx.beams.spawn({ a: o.clone().setY(o.y + 0.1), b: top.clone().setY(top.y + 1.5), color: c, width: 0.5, width1: 0.05, core: 0.4, life: 0.35, taper: 0.3 });
    fx.light(top, c, 40, 0.3);
    // shockwave: ground rings + a rolling wall of static beams across the enemy side
    const far = Math.max(...live.map((t) => Math.hypot(t.x - src.x, t.z - src.z))) + 2.5, speed = far / 0.7;
    fx.vfx.rings.spawn({ pos: o.clone().setY(o.y + 0.08), color: c, r0: 0.4, r1: far, thick: 0.14, life: 0.7 });
    fx.vfx.rings.spawn({ pos: o.clone().setY(o.y + 0.09), color: white, r0: 0.3, r1: far * 0.92, thick: 0.05, life: 0.62 });
    fx.after(0.12, () => fx.vfx.rings.spawn({ pos: o.clone().setY(o.y + 0.08), color: c, r0: 0.3, r1: far * 0.8, thick: 0.08, life: 0.7, alpha: 0.6 }));
    const dir = Math.atan2(live[0].z - src.z, live[0].x - src.x);
    for (let s = 1; s <= 9; s++) {
      fx.after(s * 0.075, () => {
        const R = (s * 0.075) * speed;
        for (let i = 0; i < 9; i++) {
          const a = dir + (i / 8 - 0.5) * 2.2 + rnd(-0.08, 0.08);
          const p = new THREE.Vector3(o.x + Math.cos(a) * R, o.y + 0.05, o.z + Math.sin(a) * R);
          fx.vfx.beams.spawn({ a: p, b: p.clone().setY(p.y + rnd(1.2, 2.4)), color: c, width: 0.22, width1: 0.02, core: 0.4, life: 0.14, taper: 0.3, jitter: true });
        }
      });
    }
    // each target: hit when the wave reaches it, sparks + local EMP + lights flicker off
    for (const t of live) {
      const d = Math.hypot(t.x - src.x, t.z - src.z), at = Math.min(0.6, d / speed);
      fx.after(at, () => {
        const p = t.pos('core');
        fx.emp(ground(ctx, t), c, 1.8);
        fx.sparks(p, c, 16, 5);
        crackle(ctx, p, 6, 1.0, c);
        fx.star(p, c, 2.2, 0.16);
        blackout(ctx, t.unit, 1.1);
      });
    }
    // HUD glitch: a stutter of cold flashes
    [[0, 0.09], [0.09, 0.03], [0.16, 0.07], [0.3, 0.025]].forEach(([tt, a]) => fx.after(tt, () => fx.screenFlash(c, a)));
    fx.shake(0.3);
  },
};
