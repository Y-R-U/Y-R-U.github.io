// CITADEL signature FX (sculptor-11). Also DREADNOUGHT (raid_dreadnought uses the citadel model).
// Flak Cannon (basic) = each barrel blasts a fat muzzle flash + smoke ring + ejected casing; the shell airbursts round the target:
// three staggered black-smoke flak puffs with orange cores, shrapnel streaks raining onto the plate, a cyan hex splash ring.
// Fortress Mode (overdrive) = the stabiliser legs slam (dust ring + quake under the hull), the roof emitter fires a beam to the sky
// and a squad-wide hex dome inflates over every ally: hex panels lock in round the shell one by one with white flashes, the dome
// ripples, each ally gets a cyan ward ring, then the dome settles to a faint shimmer and fades.
const rnd = (a, b) => a + Math.random() * (b - a);
const C = (ctx, r, g, b) => new ctx.THREE.Color(r, g, b);
const fire = (ctx) => C(ctx, 3.4, 1.6, 0.5);
const floor = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.06);
function sock(ctx, who, name, fallback = 'head') {
  const s = who.unit?.socket?.(name);
  if (s && who.root.visible) { who.root.updateMatrixWorld(true); return s.getWorldPosition(new ctx.THREE.Vector3()); }
  return who.pos(fallback);
}
function blast(ctx, p, k = 1) {
  const { fx, THREE, palette } = ctx;
  fx.muzzle(p, fire(ctx), 1.5 * k);
  fx.star(p, C(ctx, 3.4, 2.6, 1.6), 1.2 * k, 0.1);
  fx.light(p, fire(ctx), 20 * k, 0.12);
  fx.vfx.rings.spawn({ pos: p, color: palette.faction, r0: 0.1, r1: 0.6 * k, thick: 0.06, life: 0.16, face: true });
  for (let i = 0; i < 4; i++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.6, 0.6), rnd(0.3, 1.2), rnd(-0.6, 0.6)), color: C(ctx, 0.2, 0.21, 0.24), alpha: 0.5, life: rnd(0.5, 0.8), size: 0.25 * k, size1: 0.9 * k, kind: 2, drag: 2.5, floor: false });
  fx.casings(p, palette.faction, 1);
}
// flak airburst cluster around a point
function flak(ctx, at, k = 1) {
  const { fx, THREE, palette } = ctx;
  for (let i = 0; i < 3; i++) fx.after(i * 0.06, () => {
    const p = at.clone().add(new THREE.Vector3(rnd(-0.7, 0.7), rnd(0.2, 1.1), rnd(-0.7, 0.7)).multiplyScalar(k));
    fx.vfx.add.spawn({ pos: p, color: fire(ctx), life: 0.14, size: 0.9 * k, size1: 0.2, kind: 0, floor: false });
    fx.star(p, C(ctx, 3.4, 2.4, 1.2), 0.9 * k, 0.08);
    for (let j = 0; j < 3; j++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.8, 0.8), rnd(-0.2, 0.6), rnd(-0.8, 0.8)), color: C(ctx, 0.05, 0.05, 0.06), alpha: 0.75, life: rnd(0.6, 0.9), size: 0.3 * k, size1: 0.8 * k, kind: 2, drag: 3, floor: false });
    for (let j = 0; j < 7; j++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-4, 4), rnd(-3, 2), rnd(-4, 4)), color: j % 2 ? fire(ctx) : palette.faction, life: rnd(0.2, 0.4), size: 0.05, size1: 0.01, kind: 1, streak: 0.06, grav: 8, floor: true });
  });
  fx.vfx.rings.spawn({ pos: at.clone().setY(0.07), color: palette.faction, r0: 0.3, r1: 1.4 * k, thick: 0.07, life: 0.35, kind: 2 });
}
function salvoShot(ctx, from, target, k = 1) {
  const { fx, palette } = ctx;
  blast(ctx, from, k);
  if (!target) return;
  const to = target.pos('core');
  fx.tracer(from, to, fire(ctx), 0.22);
  fx.after(Math.min(0.08, ctx.timing.travel || 0.05), () => flak(ctx, target.pos('core'), k));
  void palette;
}
function dust(ctx, p, n, r = 1.2) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.vfx.alpha.spawn({ pos: p.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.3, 0.05, Math.sin(a) * r * 0.3)), vel: new THREE.Vector3(Math.cos(a) * rnd(1, 3) * r, rnd(0.3, 1.0), Math.sin(a) * rnd(1, 3) * r), color: C(ctx, 0.18, 0.2, 0.26), alpha: 0.45, life: rnd(0.6, 1.1), size: 0.3, size1: 1.1, kind: 2, drag: 2.5, floor: false });
  }
}

export default {
  attack(ctx) { salvoShot(ctx, ctx.src.pos('muzzle'), ctx.target, 1); },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, fire(ctx), hit?.crit ? 1.3 : 0.8);
    if (hit?.crit) { flak(ctx, p, 1.3); fx.shake(0.18); }
    void palette;
  },
  shot(ctx) {
    const { fx, shot, src, palette } = ctx;
    if (shot.phase === 'attack') { if (shot.index > 0) salvoShot(ctx, shot.socket, ctx.target, 0.9); return; }
    // overdrive: index 1 = the stabiliser legs hit the floor (impact frame)
    if (shot.index === 1) {
      const g = floor(ctx, src), k = Math.min(1.8, src.height / 3.4);
      fx.shake(0.4 * k);
      fx.vfx.rings.spawn({ pos: g, color: palette.faction, r0: 0.6, r1: 4.2 * k, thick: 0.14, life: 0.5, kind: 0 });
      fx.vfx.rings.spawn({ pos: g.clone().setY(0.07), color: C(ctx, 2.4, 2.8, 3.2), r0: 0.4, r1: 2.4 * k, thick: 0.25, life: 0.22, kind: 2 });
      dust(ctx, g, 16, 1.5 * k);
    }
  },
  shield(ctx) {
    const { fx, target, palette } = ctx;
    if (!target) return;
    const g = floor(ctx, target);
    fx.vfx.rings.spawn({ pos: g, color: palette.faction, r0: 1.4, r1: 0.9, thick: 0.08, life: 0.5, kind: 2 });
    fx.star(target.pos('core'), C(ctx, 2, 3, 3.4), 1.0, 0.12);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = palette.faction, allies = targets.filter(Boolean);
    const list = allies.length ? allies : [src];
    // dome footprint: centroid of the squad + the farthest ally
    const c = new THREE.Vector3();
    for (const t of list) c.add(floor(ctx, t));
    c.multiplyScalar(1 / list.length).setY(0.06);
    let R = 2.2;
    for (const t of list) R = Math.max(R, floor(ctx, t).distanceTo(c) + 0.9);
    R = Math.min(R, 3.4);
    const H = Math.max(2.2, R * 0.62);
    // emitter fires: beam up to the dome apex, flash on the roof
    const em = sock(ctx, src, 'dome'), apex = c.clone().setY(H);
    fx.vfx.beams.spawn({ a: em, b: apex, color: col, width: 0.5, width1: 0.2, core: 0.6, life: 0.6, taper: 0.05, hold: 0.3 });
    fx.star(em, C(ctx, 2.4, 3, 3.4), 2.4, 0.2);
    fx.light(em, col, 50, 0.5);
    fx.screenFlash(col, 0.18);
    fx.shake(0.25);
    // the dome: inflates over the squad (flattened bubble), ripples on lock-in, then a long faint shimmer
    const dome = fx.vfx.bubbles.spawn({ pos: c, oy: 0, radius: R, stretch: H / R, color: col, life: 2.8, alpha: 0.6, grow: 0.35 });
    fx.vfx.bubbles.spawn({ pos: c, radius: R * 1.04, stretch: H / R, color: C(ctx, 1.6, 2.2, 3.2), life: 0.6, alpha: 0.3, grow: 0.25 });
    // hex panels lock in: camera-facing hexes appear on the shell from the apex down, each with a white flash
    const n = 26;
    for (let i = 0; i < n; i++) {
      const u = i / n, pol = Math.acos(1 - u * 0.9), az = i * 2.4;
      const p = new THREE.Vector3(Math.sin(pol) * Math.cos(az) * R, Math.cos(pol) * H + 0.06, Math.sin(pol) * Math.sin(az) * R).add(c);
      fx.after(0.05 + u * 0.55, () => {
        fx.vfx.rings.spawn({ pos: p, color: col, r0: 0.5, r1: 0.35, thick: 0.1, life: 0.6, kind: 2, face: true, hold: 0.4 });
        fx.star(p, C(ctx, 2.6, 3, 3.4), 0.8, 0.1);
      });
    }
    for (const t of [0.25, 0.55]) fx.after(t, () => dome.flare(0.5));
    // floor: hex ring at the dome's foot + rising motes inside
    fx.vfx.rings.spawn({ pos: c, color: col, r0: R * 0.2, r1: R, thick: 0.12, life: 0.7, kind: 2 });
    fx.areaField(c, { radius: R * 0.9, color: col, life: 2.2, kind: 'hex', motes: 40 });
    // each ally: ward ring + fortify spark
    list.forEach((t, i) => fx.after(0.15 + i * 0.06, () => {
      const g = floor(ctx, t);
      fx.vfx.rings.spawn({ pos: g, color: col, r0: 0.4, r1: 1.6, thick: 0.1, life: 0.6, kind: 2 });
      fx.shieldHit(t.pos('core'), col);
      fx.shieldBubble({ follow: t.root, offsetY: 0, radius: Math.max(1.1, t.height * 0.6), color: col, life: 2.4, alpha: 0.45 });
    }));
    // taunt: a red-cyan pulse off the citadel itself
    fx.after(0.3, () => fx.vfx.rings.spawn({ pos: floor(ctx, src), color: C(ctx, 3.2, 0.5, 0.4), r0: 1.0, r1: 3.6, thick: 0.1, life: 0.5, kind: 0 }));
  },
};
