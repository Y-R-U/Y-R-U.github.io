// MINOTAUR signature FX (sculptor-17).
// Scythe Sweep (basic, lane + splash) = the labrys carves a wide red-iron crescent through the target, sparks and grit fly.
// Overhead cleave (attack_alt) = the axe bites the floor: a crack line, a shock ring, rubble.
// Gore Charge (OD, column, stun) = hoof stamps + nostril steam, then a stampede: a dust-and-ember wake races down the column,
// each target is gored (horn arcs, heavy impact, tossed up) and left seeing stars (stun 1.5 s).
const rnd = (a, b) => a + Math.random() * (b - a);
const ground = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.06);
function cols(ctx) {
  const C = ctx.THREE.Color;
  return { blood: new C(3.4, 0.5, 0.18), ember: new C(3.6, 1.4, 0.3), iron: new C(2.6, 2.4, 2.2), dust: new C(0.17, 0.14, 0.12), steam: new C(0.5, 0.45, 0.45), gold: new C(3.2, 2.4, 0.6) };
}
function fwdOf(ctx, who) { return new ctx.THREE.Vector3(0, 0, 1).applyQuaternion(who.root.getWorldQuaternion(new ctx.THREE.Quaternion())).setY(0).normalize(); }
// a wide crescent arc of ribbons (the axe path), centred on `c`, swinging across `side`
function crescent(ctx, c, dir, col, k = 1, tilt = 0.25) {
  const { fx, THREE } = ctx, side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  let prev = null;
  for (let i = 0; i <= 9; i++) {
    const a = (i / 9 - 0.5) * 2.6;
    const p = c.clone().addScaledVector(side, Math.sin(a) * 1.5 * k).addScaledVector(dir, -Math.cos(a) * 0.6 * k + 0.3 * k);
    p.y += a * tilt * k;
    if (prev) {
      const w = (1 - Math.abs(i / 9 - 0.5) * 1.6);
      fx.vfx.beams.spawn({ a: prev, b: p, color: col, width: 0.42 * k * w, width1: 0.03, core: 0.55, life: 0.22, taper: 0.15 });
      fx.vfx.beams.spawn({ a: prev.clone().setY(prev.y - 0.12 * k), b: p.clone().setY(p.y - 0.12 * k), color: ctx.palette.white, width: 0.1 * k * w, width1: 0.01, core: 1, life: 0.12 });
    }
    prev = p;
  }
}
function sparks(ctx, p, col, n, sp = 7) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.3), rnd(-1, 1)).multiplyScalar(sp * rnd(0.4, 1)), color: i % 3 ? col : ctx.palette.white, life: rnd(0.25, 0.55), size: rnd(0.04, 0.08), size1: 0.01, kind: 1, streak: 0.08, grav: 10, drag: 1.2 });
}
function rubble(ctx, p, n, k = 1) {
  const { fx, THREE } = ctx, c = cols(ctx);
  for (let i = 0; i < n; i++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-2.5, 2.5) * k, rnd(2, 5) * k, rnd(-2.5, 2.5) * k), color: new THREE.Color(0.14, 0.12, 0.11), alpha: 1, life: rnd(0.6, 1.0), size: rnd(0.06, 0.13) * k, kind: 3, grav: 14, drag: 0.4 });
  for (let i = 0; i < Math.round(n / 2); i++) {
    const a = Math.random() * 6.283;
    fx.vfx.alpha.spawn({ pos: p.clone().setY(0.15), vel: new THREE.Vector3(Math.cos(a) * rnd(1, 2.6) * k, rnd(0.3, 1), Math.sin(a) * rnd(1, 2.6) * k), color: c.dust, alpha: 0.5, life: rnd(0.7, 1.2), size: 0.4 * k, size1: 1.3 * k, kind: 2, drag: 2.5, floor: false });
  }
}
// stunned: little stars wheeling over the head
function stars(ctx, t, dur) {
  const { fx, THREE } = ctx, c = cols(ctx), n = Math.round(dur / 0.1);
  for (let i = 0; i < n; i++) fx.after(i * 0.1, () => {
    if (!t.alive) return;
    const h = t.pos('head'); h.y += 0.45;
    for (let j = 0; j < 3; j++) {
      const a = i * 0.7 + j * 2.09;
      fx.vfx.add.spawn({ pos: h.clone().add(new THREE.Vector3(Math.cos(a) * 0.45, Math.sin(i * 0.5 + j) * 0.06, Math.sin(a) * 0.45)), color: c.gold, life: 0.14, size: 0.22, size1: 0.12, kind: 4, floor: false });
    }
  });
}
// toss a gored target: its body hops up and settles (body offsets are free; the battle owns the root)
function toss(ctx, t, h = 0.6, dur = 0.55) {
  const body = t.unit?.body;
  if (!body) return;
  const n = 14;
  for (let i = 1; i <= n; i++) { const u = i / n; ctx.fx.after(u * dur, () => { body.position.y = Math.max(0, Math.sin(Math.PI * u) * h * (1 - u * 0.3)); if (i === n) body.position.y = 0; }); }
}

export default {
  attack(ctx) {
    const { fx, src, target, timing } = ctx;
    if (!target) return;
    const c = cols(ctx), t = Math.max(0.05, timing.travel);
    fx.after(t, () => {
      const p = target.pos('core'), dir = p.clone().sub(src.pos('core')).setY(0).normalize();
      crescent(ctx, p, dir, c.blood, 0.9, 0.18);
      sparks(ctx, p, c.ember, 16, 7);
      fx.star(p, c.iron, 1.8, 0.12);
      fx.shake(0.14);
    });
  },
  impact(ctx) {
    const { fx, target, hit } = ctx;
    if (!target) return;
    const c = cols(ctx), p = target.pos('core'), k = hit?.crit ? 1.4 : 1;
    fx.vfx.add.spawn({ pos: p, color: c.blood, life: 0.18, size: 0.9 * k, size1: 1.5 * k, kind: 0, floor: false, alpha: 0.7 });
    fx.vfx.rings.spawn({ pos: p, color: c.ember, r0: 0.1, r1: 0.7 * k, thick: 0.12, life: 0.18, face: true });
    if (hit?.crit) { fx.star(p, c.iron, 2.4, 0.16); sparks(ctx, p, c.ember, 10, 8); }
  },
  shot(ctx) {
    const { fx, src, shot, THREE } = ctx;
    const c = cols(ctx);
    if (shot.phase === 'attack' && shot.type === 'impact') {
      const g = ground(ctx, src), f = fwdOf(ctx, src);
      if (shot.anim === 'attack') {
        // the sweep itself: a red crescent carved in front of the brute at waist height
        crescent(ctx, g.clone().addScaledVector(f, 1.6).setY((src.height || 4) * 0.42), f, c.blood, 1.15, 0.12);
      } else {
        // overhead cleave: the labrys bites the floor in front, a crack line runs forward, shock ring + rubble
        const hitP = g.clone().addScaledVector(f, 1.7);
        fx.vfx.rings.spawn({ pos: hitP.clone().setY(0.07), color: c.ember, r0: 0.3, r1: 2.0, thick: 0.14, life: 0.4, kind: 0 });
        let prev = hitP.clone().setY(0.08);
        for (let i = 1; i <= 6; i++) {
          const p = hitP.clone().addScaledVector(f, i * 0.4).add(new THREE.Vector3(rnd(-0.18, 0.18), 0, rnd(-0.18, 0.18))).setY(0.08);
          fx.vfx.beams.spawn({ a: prev, b: p, color: c.ember, width: 0.14 * (1 - i / 8), width1: 0.02, core: 0.7, life: 0.7, taper: 0.1, hold: 0.4 });
          prev = p;
        }
        rubble(ctx, hitP, 14, 1);
        sparks(ctx, hitP.clone().setY(0.3), c.ember, 14, 6);
        fx.shake(0.25);
      }
    }
    if (shot.phase === 'overdrive' && shot.type === 'cast') {
      // hoof stamps + nostrils blowing red steam
      const hoof = src.pos('core'); const g = ground(ctx, src);
      for (let i = 0; i < 2; i++) fx.after(i * 0.24, () => { fx.vfx.rings.spawn({ pos: g, color: c.ember, r0: 0.4, r1: 1.6, thick: 0.1, life: 0.3, kind: 2 }); rubble(ctx, g, 6, 0.7); fx.shake(0.12); });
      const nose = src.unit?.socket?.('nose');
      const np = nose ? nose.getWorldPosition(new THREE.Vector3()) : src.pos('head');
      const f = fwdOf(ctx, src);
      for (let i = 0; i < 14; i++) fx.after(i * 0.04, () => fx.vfx.alpha.spawn({ pos: np, vel: f.clone().multiplyScalar(rnd(0.8, 1.6)).add(new THREE.Vector3(rnd(-0.3, 0.3), -0.3, rnd(-0.3, 0.3))), color: c.steam, alpha: 0.45, life: 0.8, size: 0.15, size1: 0.6, kind: 2, drag: 1.5, floor: false }));
      for (let i = 0; i < 10; i++) fx.vfx.add.spawn({ pos: hoof.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.6, 0.8), rnd(-0.6, 0.6))), vel: new THREE.Vector3(0, rnd(1, 2), 0), color: c.blood, life: 0.5, size: 0.25, size1: 0.05, kind: 0, floor: false });
    }
  },
  overdrive(ctx) {
    const { fx, src, targets, THREE } = ctx;
    const c = cols(ctx), g0 = ground(ctx, src);
    // stampede wake: dust + embers racing from the brute down the column, then each target is gored in turn
    const last = targets.length ? ground(ctx, targets[targets.length - 1]) : g0.clone().addScaledVector(fwdOf(ctx, src), 6);
    const n = 16, dur = 0.32;
    for (let i = 0; i <= n; i++) fx.after((i / n) * dur, () => {
      const p = g0.clone().lerp(last, i / n);
      fx.vfx.alpha.spawn({ pos: p.clone().setY(0.2), vel: new THREE.Vector3(rnd(-1.5, 1.5), rnd(0.4, 1.2), rnd(-1.5, 1.5)), color: c.dust, alpha: 0.55, life: rnd(0.8, 1.2), size: 0.6, size1: 1.7, kind: 2, drag: 2, floor: false });
      fx.vfx.add.spawn({ pos: p.clone().setY(0.5), vel: new THREE.Vector3(rnd(-1, 1), rnd(1, 2.5), rnd(-1, 1)), color: c.ember, life: 0.5, size: 0.06, kind: 1, streak: 0.07, grav: 5 });
      if (i % 4 === 0) fx.vfx.rings.spawn({ pos: p.clone().setY(0.07), color: c.blood, r0: 0.3, r1: 1.2, thick: 0.1, life: 0.3, kind: 2 });
    });
    // the charge line: a glowing gouge torn along the floor + a hot streak at shoulder height
    fx.vfx.beams.spawn({ a: g0.clone().setY(0.1), b: last.clone().setY(0.1), color: c.ember, width: 1.1, width1: 0.4, core: 0.5, life: dur + 0.9, taper: 0.3, hold: 0.5 });
    fx.vfx.beams.spawn({ a: g0.clone().setY(1.6), b: last.clone().setY(1.6), color: c.blood, width: 1.4, width1: 0.2, core: 0.35, life: dur + 0.2, taper: 0.6 });
    for (let i = 0; i < 24; i++) fx.after((i / 24) * dur, () => {
      const p = g0.clone().lerp(last, i / 24).setY(rnd(0.6, 2.4));
      fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-1.5, 1.5), rnd(0.5, 2), rnd(-1.5, 1.5)), color: i % 2 ? c.blood : c.ember, life: 0.45, size: rnd(0.4, 0.8), size1: 0.1, kind: 0, drag: 2, floor: false, alpha: 0.8 });
    });
    targets.forEach((t, i) => {
      const at = dur * (i + 1) / Math.max(1, targets.length);
      fx.after(at, () => {
        const p = t.pos('core'), dir = p.clone().sub(src.pos('core')).setY(0).normalize();
        // horn arcs: two upward hooks
        crescent(ctx, p, dir, c.ember, 0.7, 0.5);
        fx.explosion(p, c.blood, 1.25);
        fx.vfx.rings.spawn({ pos: ground(ctx, t), color: c.ember, r0: 0.4, r1: 2.6, thick: 0.18, life: 0.5, kind: 2 });
        sparks(ctx, p, c.ember, 18, 8);
        rubble(ctx, ground(ctx, t), 10, 1);
        toss(ctx, t, 0.7, 0.6);
        stars(ctx, t, 1.5);
      });
    });
    fx.screenFlash(c.blood, 0.08);
    fx.shake(0.5);
  },
  deploy(ctx) {
    // keep the kit's drop + beam, add a crater of rubble when the hooves hit the plate
    const g = ground(ctx, ctx.src);
    ctx.fx.after(0.62, () => { rubble(ctx, g, 16, 1.3); ctx.fx.vfx.rings.spawn({ pos: g, color: cols(ctx).ember, r0: 0.5, r1: 2.6, thick: 0.12, life: 0.45, kind: 0 }); ctx.fx.shake(0.2); });
    return 'default';
  },
};
