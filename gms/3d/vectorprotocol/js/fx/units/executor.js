// EXECUTOR signature FX (sculptor-15). RAILCANNON = cyan accelerator rings snap down the barrel, a hard white-cyan rail with a
// gold slug riding it, gold vent jets out of the capacitor; WRIST PISTOL = two quick cyan taps. Hits = cyan/gold spark spray;
// a KILL (Hostile Takeover passive: +25 charge) streams gold "assets" from the wreck back into him.
// TERMINATION ORDER (overdrive): the arena dims, three gold beams in quick succession at the three weakest enemies, each hit
// stamps a gold holographic "terminated" seal (square frame + X + floor ring) that hangs for a beat.
const rnd = (a, b) => a + Math.random() * (b - a);
const STEP = 0.168;   // = 0.07 of the 2.4 s overdrive anim between the three fire frames
function axes(THREE, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, side).normalize();
  return { dir, side, up };
}
function cyanOf(ctx) { return ctx.src.faction === 'corporate' ? ctx.palette.cyan : ctx.palette.faction; }
function railShot(ctx, m, p, k = 1) {
  const { fx, THREE, palette } = ctx;
  const cy = cyanOf(ctx), { dir, side } = axes(THREE, m, p);
  fx.muzzle(m, cy, 1.4 * k);
  fx.star(m, palette.white, 1.5 * k, 0.12);
  fx.light(m, cy, 28 * k, 0.14);
  // accelerator rings snapping outward along the barrel line
  for (let i = 0; i < 4; i++) fx.after(i * 0.02, () => fx.vfx.rings.spawn({ pos: m.clone().addScaledVector(dir, 0.25 + i * 0.4), color: i % 2 ? palette.gold : cy, r0: 0.08, r1: 0.45 + i * 0.12, thick: 0.05, life: 0.22, face: true }));
  // capacitor vent jets (gold) out of the rear, both sides
  const rear = m.clone().addScaledVector(dir, -1.9 * k);
  for (const s of [1, -1]) {
    fx.vfx.beams.spawn({ a: rear.clone(), b: rear.clone().addScaledVector(side, s * 0.7).addScaledVector(dir, -0.5), color: palette.gold, width: 0.2, width1: 0.03, core: 0.6, life: 0.14, taper: 0.4 });
    for (let i = 0; i < 3; i++) fx.vfx.alpha.spawn({ pos: rear.clone(), vel: side.clone().multiplyScalar(s * rnd(1, 2.2)).addScaledVector(dir, -rnd(0.5, 1.2)).add(new THREE.Vector3(0, rnd(0.2, 0.7), 0)), color: new THREE.Color(0.4, 0.38, 0.36), alpha: 0.3, life: rnd(0.5, 0.9), size: 0.25, size1: 0.7, kind: 2, drag: 2, floor: false });
  }
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const p = target.pos('core');
    const cy = cyanOf(ctx);
    if (src.unit?.state?.action === 'attack_alt') {
      // wrist pistol, first tap (the second comes from shot())
      const m = src.pos('pistol');
      fx.muzzle(m, cy, 0.8);
      fx.tracer(m, p, cy, 0.2);
      fx.vfx.beams.spawn({ a: m.clone(), b: p.clone(), color: palette.white, width: 0.05, width1: 0.02, core: 1, life: 0.08, taper: 0.1 });
      return;
    }
    const m = src.pos('muzzle');
    railShot(ctx, m, p);
    const t = Math.max(0.05, timing.travel);
    fx.vfx.beams.spawn({ a: m.clone(), b: p.clone(), color: palette.white, width: 0.12, width1: 0.04, core: 1, life: 0.12, taper: 0.02 });
    fx.vfx.beams.spawn({ a: m.clone(), b: p.clone(), color: cy, width: 0.34, width1: 0.06, core: 0.35, life: t + 0.35, hold: 0.12, taper: 0.02 });
    fx.bolt(m, p, palette.gold, t, { size: 0.2, trail: 2.6 });
  },
  impact(ctx) {
    const { fx, THREE, target, palette, hit, src } = ctx;
    const p = target.pos('core'), cy = cyanOf(ctx);
    const { dir } = axes(THREE, src.pos('core'), p);
    fx.impact(p, cy, hit?.crit ? 1.4 : 0.9);
    for (let i = 0; i < (hit?.crit ? 18 : 10); i++) fx.vfx.add.spawn({ pos: p.clone(), vel: dir.clone().multiplyScalar(rnd(3, 8)).add(new THREE.Vector3(rnd(-2, 2), rnd(-0.5, 2.5), rnd(-2, 2))), color: i % 3 ? cy : palette.gold, life: rnd(0.15, 0.35), size: 0.07, size1: 0.02, kind: 1, streak: 0.06, grav: 6, floor: true });
    if (hit?.crit) { fx.star(p, palette.gold, 2.0, 0.18); fx.shake(0.2); }
    if (hit?.kill) {
      // HOSTILE TAKEOVER: gold assets stream from the wreck back into the executor
      const home = src.pos('core');
      fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: palette.gold, r0: 0.3, r1: 1.6, thick: 0.08, life: 0.5, kind: 2 });
      for (let i = 0; i < 14; i++) fx.after(0.1 + i * 0.03, () => {
        const a = p.clone().add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(-0.3, 0.5), rnd(-0.4, 0.4)));
        fx.bolt(a, home, palette.gold, rnd(0.35, 0.55), { size: 0.09, arc: rnd(0.6, 1.4), trail: 0.5 });
      });
      fx.after(0.7, () => { fx.buffAura(new THREE.Vector3(src.x, 0, src.z), palette.gold); fx.star(home, palette.gold, 1.6, 0.2); });
    }
  },
  shot(ctx) {
    const { fx, shot, target, palette, THREE } = ctx;
    if (shot.phase === 'attack' && shot.index === 1 && target) {
      // second pistol tap
      const m = ctx.src.pos('pistol'), cy = cyanOf(ctx);
      const p = target.pos('core').add(new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.2, 0.2), rnd(-0.2, 0.2)));
      fx.muzzle(m, cy, 0.8); fx.tracer(m, p, cy, 0.2);
      fx.after(0.06, () => fx.sparks(p, cy, 6, 4));
      return;
    }
    if (shot.phase !== 'overdrive') return;
    if (shot.index === 0) {
      // the monocle glints gold as the cannon unfolds
      const e = ctx.src.pos('monocle');
      fx.star(e, palette.gold, 2.2, 0.3);
      fx.light(e, palette.gold, 18, 0.3);
      fx.charge(ctx.src.pos('muzzle'), palette.gold, 0.5);
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const ts = targets.filter(Boolean).slice(0, 3);
    if (fx.dim) fx.dim(0.65, STEP * 3 + 0.5); else fx.screenFlash(new THREE.Color(0.02, 0.016, 0.006), 0.55);
    const hot = palette.gold.clone().lerp(palette.white, 0.45);
    const shots = ts.length ? ts : [null];
    shots.forEach((t, i) => fx.after(i * STEP, () => {
      const m = src.pos('muzzle');
      const p = t ? t.pos('core') : m.clone().add(new THREE.Vector3(src.side === 'player' ? 10 : -10, 0, 0));
      const { dir, side, up } = axes(THREE, m, p);
      railShot(ctx, m, p, 1.3);
      fx.shake(0.35);
      fx.vfx.beams.spawn({ a: m.clone(), b: p.clone(), color: palette.white, width: 0.2, width1: 0.06, core: 1, life: 0.3, taper: 0.02 });
      fx.vfx.beams.spawn({ a: m.clone(), b: p.clone(), color: palette.gold, width: 0.62, width1: 0.14, core: 0.5, life: 1.1, hold: 0.35, taper: 0.02 });
      if (!t) return;
      fx.impact(p, palette.gold, 1.8);
      fx.star(p, hot, 3.0, 0.26);
      fx.light(p, palette.gold, 45, 0.35);
      fx.sparks(p, palette.gold, 22, 8);
      // TERMINATED seal: a gold holo frame with an X, facing the beam, stamped over the target + a hex ring on the floor
      const c = t.pos('core').addScaledVector(up, 0.25), S = Math.max(0.55, t.height * 0.2);
      const corner = (a, b2) => c.clone().addScaledVector(side, a * S).addScaledVector(up, b2 * S);
      const seg = (a, b2, w, life) => fx.vfx.beams.spawn({ a, b: b2, color: hot, width: w, width1: w, core: 0.7, life, hold: 0.7, taper: 0 });
      fx.after(0.06, () => {
        const P = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
        for (let k = 0; k < 4; k++) seg(P[k], P[(k + 1) % 4], 0.07, 1.1);
        seg(corner(-0.7, -0.7), corner(0.7, 0.7), 0.1, 1.1);
        seg(corner(-0.7, 0.7), corner(0.7, -0.7), 0.1, 1.1);
        fx.vfx.rings.spawn({ pos: c.clone(), color: palette.gold, r0: S * 2.2, r1: S * 1.2, thick: 0.06, life: 0.4, face: true });
        fx.vfx.rings.spawn({ pos: new THREE.Vector3(t.x, 0.07, t.z), color: palette.gold, r0: 0.4, r1: 1.8, thick: 0.1, life: 0.9, kind: 2, hold: 0.4 });
      });
    }));
    // the market closes: a final gold shock ring under the executor
    fx.after(STEP * shots.length + 0.1, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: palette.gold, r0: 0.5, r1: 3.2, thick: 0.1, life: 0.6 }));
  },
};
