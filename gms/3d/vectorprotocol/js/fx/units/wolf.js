// WOLF signature FX (sculptor-17): DIRE WOLF (horde, ember) and FROST WOLF (order, frost) share the 'wolf' model, so the
// battle finds this file by model id. Variant = the source unit's faction (order = frost, anything else = ember).
// Pounce (basic, backline) = a low streak across the board, jaws snapping shut on the target (fang arcs + embers / ice shards).
// Ember Howl (OD) = a fire roar from the howl, every adjacent target bursts into flame and keeps burning (burn x2, 4 s).
// Frost Lunge (OD) = an ice streak to the backline target, an eruption of ice spikes and a frost crust that lingers (slow, 4 s).
const rnd = (a, b) => a + Math.random() * (b - a);
const isFrost = (ctx) => ctx.src?.faction === 'order';
function cols(ctx) {
  const C = ctx.THREE.Color;
  return isFrost(ctx)
    ? { hot: new C(1.4, 2.6, 3.6), core: new C(2.6, 3.0, 3.4), dim: new C(0.5, 1.0, 1.8), mist: new C(0.55, 0.7, 0.85), chunk: new C(0.75, 0.88, 1.0) }
    : { hot: new C(3.6, 1.3, 0.25), core: new C(3.4, 2.4, 0.8), dim: new C(1.8, 0.45, 0.08), mist: new C(0.09, 0.07, 0.06), chunk: new C(0.12, 0.08, 0.06) };
}
const ground = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.06);

// jaws snapping shut: two curved fang arcs closing on p, facing the attacker
function bite(ctx, p, dir, c, k = 1) {
  const { fx, THREE } = ctx, side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  for (const s of [1, -1]) {
    let prev = null;
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5 - 0.5) * 2.0;
      const q = p.clone().addScaledVector(side, Math.sin(a) * 0.55 * k).addScaledVector(dir, -Math.cos(a) * 0.25 * k);
      q.y += s * (0.32 - Math.abs(Math.sin(a)) * 0.12) * k;
      if (prev) fx.vfx.beams.spawn({ a: prev, b: q, color: c.core, width: 0.13 * k, width1: 0.02, core: 0.6, life: 0.14, taper: 0.1 });
      // fangs: short spikes pointing at the closing gap
      if (i % 2 === 1) fx.vfx.beams.spawn({ a: q, b: q.clone().add(new THREE.Vector3(0, -s * 0.16 * k, 0)), color: c.core, width: 0.07 * k, width1: 0.0, core: 0.8, life: 0.12 });
      prev = q;
    }
  }
  fx.star(p, c.core, 1.5 * k, 0.12);
  fx.vfx.add.spawn({ pos: p, color: c.hot, life: 0.2, size: 0.8 * k, size1: 1.4 * k, kind: 0, floor: false, alpha: 0.7 });
}
function burst(ctx, p, c, n = 14, sp = 5) {
  const { fx, THREE } = ctx, frost = isFrost(ctx);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).multiplyScalar(sp * rnd(0.4, 1));
    if (frost) fx.vfx.alpha.spawn({ pos: p, vel: v, color: c.chunk, alpha: 1, life: rnd(0.4, 0.8), size: rnd(0.05, 0.1), kind: 3, grav: 12, drag: 0.6 });
    else fx.vfx.add.spawn({ pos: p, vel: v, color: i % 3 ? c.hot : c.core, life: rnd(0.3, 0.7), size: rnd(0.04, 0.08), size1: 0.01, kind: 1, streak: 0.07, grav: 6, drag: 1.4 });
  }
}
// lingering status on a target: burning embers + licks of flame / a frost crust with falling rime. Follows the target.
function linger(ctx, tgt, dur, c, k = 1) {
  const { fx, THREE } = ctx, frost = isFrost(ctx), n = Math.round(dur / 0.16);
  for (let i = 0; i < n; i++) {
    fx.after(i * 0.16, () => {
      if (!tgt.alive && i > 2) return;
      const base = ground(ctx, tgt), h = (tgt.height || 3) * 0.75;
      const p = base.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0.1, h), rnd(-0.5, 0.5)));
      if (frost) {
        fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(0, -0.5, 0), color: c.dim, life: 0.6, size: 0.07, size1: 0.02, kind: 1, streak: 0.05, floor: true });
        if (i % 4 === 0) fx.vfx.rings.spawn({ pos: base.clone().setY(0.07), color: c.dim, r0: 0.9 * k, r1: 1.1 * k, thick: 0.08, life: 0.5, kind: 2, alpha: 0.6 });
        if (i % 3 === 0) fx.vfx.alpha.spawn({ pos: base.clone().setY(0.25), vel: new THREE.Vector3(rnd(-0.3, 0.3), 0.15, rnd(-0.3, 0.3)), color: c.mist, alpha: 0.35, life: 0.9, size: 0.6, size1: 1.3, kind: 2, drag: 1.5, floor: false });
      } else {
        fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(1.2, 2.2), rnd(-0.2, 0.2)), color: i % 2 ? c.hot : c.core, life: rnd(0.3, 0.5), size: rnd(0.22, 0.38) * k, size1: 0.04, kind: 0, drag: 1.5, floor: false });
        fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.6, 0.6), rnd(1.5, 3), rnd(-0.6, 0.6)), color: c.hot, life: rnd(0.4, 0.8), size: 0.05, size1: 0.01, kind: 1, streak: 0.06, drag: 1, floor: false });
        if (i % 3 === 0) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(0, 1.2, 0), color: c.mist, alpha: 0.35, life: 0.9, size: 0.3, size1: 0.9, kind: 2, drag: 1, floor: false });
      }
    });
  }
}
// the pounce: a low streak of fur-sparks from the wolf toward the target over `dur`
function streak(ctx, a, b, c, dur, k = 1) {
  const { fx, THREE } = ctx, n = 10;
  for (let i = 0; i <= n; i++) {
    fx.after((i / n) * dur, () => {
      const p = a.clone().lerp(b, i / n); p.y += Math.sin(Math.PI * i / n) * 0.6 * k;
      fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4)), color: i % 2 ? c.hot : c.dim, life: 0.35, size: 0.3 * k, size1: 0.05, kind: 0, drag: 2, floor: false });
      if (i % 2) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1)), color: c.core, life: 0.4, size: 0.05, kind: 1, streak: 0.06, grav: 4, floor: true });
    });
  }
  fx.vfx.beams.spawn({ a: a.clone().setY(a.y * 0.8), b: b.clone().setY(b.y * 0.8), color: c.dim, width: 0.18 * k, width1: 0.02, core: 0.3, life: dur + 0.15, taper: 0.4 });
}

export default {
  attack(ctx) {
    const { fx, src, target, timing } = ctx;
    if (!target) return;
    const c = cols(ctx), a = src.pos('muzzle'), b = target.pos('core');
    const t = Math.max(0.05, timing.travel);
    streak(ctx, a, b, c, Math.min(t, 0.3));
    const dir = b.clone().sub(a).setY(0).normalize();
    fx.after(t, () => { const p = target.pos('core'); bite(ctx, p, dir, c); burst(ctx, p, c, 12, 4.5); });
  },
  impact(ctx) {
    const { fx, src, target, hit } = ctx;
    if (!target) return;
    const c = cols(ctx), p = target.pos('core');
    fx.vfx.rings.spawn({ pos: p, color: c.hot, r0: 0.1, r1: hit?.crit ? 0.9 : 0.55, thick: 0.1, life: 0.16, face: true });
    if (hit?.crit) { fx.star(p, c.core, 2.2, 0.16); burst(ctx, p, c, 10, 6); }
    if (isFrost(ctx)) fx.vfx.alpha.spawn({ pos: p, vel: new ctx.THREE.Vector3(0, 0.3, 0), color: c.mist, alpha: 0.45, life: 0.7, size: 0.5, size1: 1.2, kind: 2, drag: 1.5, floor: false });
  },
  shot(ctx) {
    const { fx, src, shot, THREE } = ctx;
    const c = cols(ctx);
    if (shot.anim === 'attack_alt' && shot.type === 'impact' && ctx.target) {
      // claw rake: three parallel tearing streaks
      const p = ctx.target.pos('core'), up = new THREE.Vector3(0, 1, 0);
      const dir = p.clone().sub(src.pos('core')).setY(0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
      for (let i = -1; i <= 1; i++) {
        const o = p.clone().addScaledVector(side, i * 0.16);
        fx.vfx.beams.spawn({ a: o.clone().addScaledVector(up, 0.5).addScaledVector(side, -0.25), b: o.clone().addScaledVector(up, -0.45).addScaledVector(side, 0.25), color: c.core, width: 0.1, width1: 0.01, core: 0.7, life: 0.2, taper: 0.2 });
      }
      return;
    }
    if (shot.phase !== 'overdrive') return;
    if (shot.type === 'cast') {
      // the howl: rings pulse out of the throat, the air ripples
      const h = src.pos('head');
      for (let i = 0; i < 4; i++) fx.after(i * 0.1, () => fx.vfx.rings.spawn({ pos: h, color: i % 2 ? c.hot : c.dim, r0: 0.2, r1: 1.4 + i * 0.4, thick: 0.08, life: 0.45, face: true, alpha: 0.8 }));
      fx.vfx.add.spawn({ pos: h, color: c.core, life: 0.3, size: 0.6, size1: 1.8, kind: 0, floor: false, alpha: 0.6 });
      fx.shake(0.12);
    } else if (shot.type === 'impact') {
      // landing from the leap: ground ring + kicked fur-embers / ice
      const g = ground(ctx, src);
      fx.vfx.rings.spawn({ pos: g, color: c.hot, r0: 0.4, r1: 2.2, thick: 0.12, life: 0.4, kind: 0 });
      burst(ctx, g.clone().setY(0.3), c, 16, 5);
      fx.shake(0.18);
    }
  },
  overdrive(ctx) {
    const { fx, src, targets, THREE } = ctx;
    const c = cols(ctx), frost = isFrost(ctx), a = src.pos('muzzle');
    if (!frost) {
      // EMBER HOWL: a cone of fire rolls out of the howl onto every adjacent target, which keep burning
      for (let i = 0; i < 26; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const b = t ? t.pos('core') : a.clone().add(new THREE.Vector3(0, 0, 3));
        const v = b.clone().sub(a).multiplyScalar(rnd(1.3, 2.1)).add(new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 0.8), rnd(-1, 1)));
        fx.after(i * 0.012, () => fx.vfx.add.spawn({ pos: a, vel: v, color: i % 3 ? c.hot : c.core, life: rnd(0.45, 0.6), size: rnd(0.3, 0.55), size1: 0.9, kind: 0, drag: 1.8, floor: false, alpha: 0.85 }));
      }
      targets.forEach((t, i) => fx.after(0.25 + i * 0.05, () => {
        const p = t.pos('core'), g = ground(ctx, t);
        fx.explosion(p, c.hot, 0.8);
        fx.vfx.rings.spawn({ pos: g, color: c.hot, r0: 0.3, r1: 1.6, thick: 0.15, life: 0.5, kind: 2 });
        burst(ctx, p, c, 18, 6);
        linger(ctx, t, 4, c, 1);
      }));
      fx.screenFlash(c.hot, 0.07);
      fx.shake(0.3);
    } else {
      // FROST LUNGE: an ice streak to the backline target, spikes erupt, the frost crust stays (slow)
      targets.forEach((t, i) => {
        const b = t.pos('core');
        streak(ctx, a, b, c, 0.22, 1.3);
        fx.after(0.24 + i * 0.05, () => {
          const g = ground(ctx, t), p = t.pos('core');
          for (let k = 0; k < 9; k++) {
            const ang = (k / 9) * Math.PI * 2 + rnd(-0.2, 0.2), r = rnd(0.4, 1.1);
            const base = g.clone().add(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
            const tip = base.clone().add(new THREE.Vector3(Math.cos(ang) * 0.35, rnd(0.8, 1.8), Math.sin(ang) * 0.35));
            fx.after(k * 0.02, () => fx.vfx.beams.spawn({ a: base, b: tip, color: c.hot, width: 0.32, width1: 0.0, core: 0.7, life: 0.9, taper: 0.05, hold: 0.6 }));
          }
          fx.vfx.rings.spawn({ pos: g, color: c.core, r0: 0.3, r1: 2.2, thick: 0.15, life: 0.5, kind: 2 });
          bite(ctx, p, b.clone().sub(a).setY(0).normalize(), c, 1.4);
          burst(ctx, p, c, 24, 6);
          fx.star(p, c.core, 2.6, 0.2);
          linger(ctx, t, 4, c, 1);
        });
      });
      fx.screenFlash(c.core, 0.07);
      fx.shake(0.35);
    }
  },
  // leaps in from behind (model noDrop): a rift shimmer at the take-off, the landing kicks up dust + embers / rime
  deploy(ctx) {
    const { fx, src, THREE } = ctx;
    const c = cols(ctx), g = ground(ctx, src);
    const behind = new THREE.Vector3(0, 0, -1).applyQuaternion(src.root.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(2.6);
    const t0 = g.clone().add(behind).setY(0.8);
    fx.vfx.rings.spawn({ pos: t0, color: new THREE.Color(1.6, 0.5, 3.0), r0: 0.2, r1: 1.0, thick: 0.1, life: 0.35, face: true });
    fx.vfx.add.spawn({ pos: t0, color: new THREE.Color(1.6, 0.5, 3.0), life: 0.3, size: 0.6, size1: 1.4, kind: 0, floor: false, alpha: 0.6 });
    fx.after(0.66, () => {
      fx.vfx.rings.spawn({ pos: g, color: c.hot, r0: 0.4, r1: 1.8, thick: 0.1, life: 0.35, kind: 2 });
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * 6.283;
        fx.vfx.alpha.spawn({ pos: g.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5)), vel: new THREE.Vector3(Math.cos(a) * rnd(1.5, 3), rnd(0.2, 0.7), Math.sin(a) * rnd(1.5, 3)),
          color: new THREE.Color(0.18, 0.17, 0.2), alpha: 0.4, life: rnd(0.5, 0.8), size: 0.4, size1: 1.0, kind: 2, drag: 3 });
      }
      burst(ctx, g.clone().setY(0.25), c, 10, 3.5);
      fx.shake(0.08);
    });
  },
};
