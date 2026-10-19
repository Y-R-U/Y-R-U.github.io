// ELF RANGER signature FX (sculptor-18). Keyed by `elf_ranger` (unit def id == model id).
// Longbow = a real arrow (bright shaft streak + gold head) on a shallow arc, shedding a trail of tumbling green-gold leaves;
// it lands with a leaf burst. attack_alt's second loose (shot index 1) sends a second arrow a beat later.
// ARROW RAIN (overdrive): each loose of the overdrive anim (shot 1..3) sends a volley streaking up into the sky; on release
// every enemy gets a rain of arrows from above, then ENTANGLE: thorned roots burst out of the floor and coil up around each target.
// Keen Eye (buff): a gold-green glint at the eyes.
const rnd = (a, b) => a + Math.random() * (b - a);
let LEAF = null, LEAF2 = null, HEAD = null, SHAFT = null;
function cols(ctx) {
  if (!LEAF) {
    const C = ctx.THREE.Color;
    LEAF = new C(0.55, 2.6, 0.6); LEAF2 = new C(1.6, 2.4, 0.4); HEAD = new C(3.2, 2.5, 0.9); SHAFT = new C(2.2, 2.6, 1.6);
  }
  return { leaf: LEAF, leaf2: LEAF2, head: HEAD, shaft: SHAFT };
}
// one arrow from a to b over dur seconds; arc = peak height; leaves = trail density
function arrow(ctx, a, b, dur, { arc = 0.5, leaves = 1, width = 0.07, len = 0.9, onHit = null } = {}) {
  const { fx, THREE } = ctx, C = cols(ctx);
  a = a.clone(); b = b.clone();
  const p = new THREE.Vector3(), q = new THREE.Vector3(), t = new THREE.Vector3();
  const pos = (k, out) => out.lerpVectors(a, b, k).setY(a.y + (b.y - a.y) * k + Math.sin(Math.PI * k) * arc);
  let last = 0;
  fx.vfx.beams.spawn({ a, b: a, color: C.shaft, width, width1: width * 0.6, core: 0.55, life: dur, hold: 0.98, taper: 0.4,
    fn: (bm, k) => {
      pos(k, p); pos(Math.max(0, k - 0.02), q);
      t.copy(p).sub(q); if (t.lengthSq() < 1e-8) t.copy(b).sub(a); t.normalize();
      bm.b.copy(p); bm.a.copy(p).addScaledVector(t, -len);
      if (k - last > 0.06 / Math.max(0.3, leaves)) {
        last = k;
        fx.vfx.add.spawn({ pos: bm.a, vel: new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.2, 0.6), rnd(-0.6, 0.6)), color: Math.random() < 0.7 ? C.leaf : C.leaf2,
          life: rnd(0.5, 0.9), size: rnd(0.09, 0.15), size1: 0.03, kind: 3, grav: 0.8, drag: 2.2 });
      }
    } });
  // the head: a small gold star riding the tip
  const head = fx.vfx.add.spawn({ pos: a, color: C.head, life: dur, size: 0.22, kind: 4, floor: false });
  fx.vfx.beams.spawn({ a, b: a, color: C.head, width: 0.001, life: dur, fn: (bm, k) => { if (head) { pos(k, p); head.x = p.x; head.y = p.y; head.z = p.z; } } });
  if (onHit) fx.after(dur, onHit);
}
function leafBurst(ctx, p, k = 1) {
  const { fx, THREE } = ctx, C = cols(ctx);
  fx.star(p, C.head, 1.1 * k, 0.12);
  fx.vfx.rings.spawn({ pos: p, color: C.leaf, r0: 0.1, r1: 0.7 * k, thick: 0.08, life: 0.2, face: true });
  for (let i = 0; i < 12 * k; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(0.2, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.5, 3.5));
    fx.vfx.add.spawn({ pos: p, vel: v, color: i % 3 ? C.leaf : C.leaf2, life: rnd(0.6, 1.1), size: rnd(0.1, 0.18), size1: 0.04, kind: 3, grav: 2.2, drag: 2.5 });
  }
}
// entangle: roots burst from the floor and coil up around a target
function roots(ctx, t) {
  const { fx, THREE } = ctx, C = cols(ctx);
  const g = new THREE.Vector3(t.x, 0.04, t.z), h = Math.min(2.2, (t.height || 3) * 0.6);
  fx.vfx.rings.spawn({ pos: g, color: C.leaf, r0: 0.3, r1: 1.6, thick: 0.12, life: 0.45, kind: 0 });
  fx.vfx.rings.spawn({ pos: g.clone().setY(0.05), color: C.leaf2, r0: 1.2, r1: 0.9, thick: 0.08, life: 1.6, hold: 0.7, kind: 2 });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2 + rnd(-0.3, 0.3), turns = rnd(0.9, 1.4), r0 = rnd(0.75, 0.95), segs = 7;
    let prev = g.clone().add(new THREE.Vector3(Math.cos(a0) * (r0 + 0.25), 0, Math.sin(a0) * (r0 + 0.25)));
    for (let s = 1; s <= segs; s++) {
      const f = s / segs, a = a0 + f * turns * Math.PI, r = r0 * (1 - f * 0.45);
      const pt = g.clone().add(new THREE.Vector3(Math.cos(a) * r, f * h, Math.sin(a) * r));
      const p0 = prev.clone(), p1 = pt.clone();
      fx.after(f * 0.3, () => {
        fx.vfx.beams.spawn({ a: p0, b: p1, color: C.leaf, width: 0.24 * (1 - f * 0.55), width1: 0.15 * (1 - f * 0.55), core: 0.3, life: 1.8, hold: 0.7, taper: 0.01 });
        if (s % 2 === 0) fx.vfx.add.spawn({ pos: p1, vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.2, 0.8), rnd(-0.3, 0.3)), color: C.leaf2, life: rnd(0.8, 1.3), size: 0.14, size1: 0.05, kind: 3, grav: 0.6, drag: 2 });
      });
      prev = pt;
    }
  }
  fx.after(0.3, () => fx.debuffAura(new THREE.Vector3(t.x, 0, t.z), C.leaf));
}

export default {
  attack(ctx) {
    const { src, target, timing } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core');
    ctx.fx.muzzle(a, cols(ctx).leaf2, 0.5);
    arrow(ctx, a, b, timing.travel, { arc: 0.25 + a.distanceTo(b) * 0.03 });
  },
  shot(ctx) {
    const { shot, target, src, targets, fx, THREE, timing } = ctx;
    // attack_alt second loose: a second arrow, a hair lower
    if (shot.phase === 'attack' && shot.anim === 'attack_alt' && shot.index === 1 && target) {
      const b = target.pos('core').add(new THREE.Vector3(0, -0.25, 0));
      arrow(ctx, shot.socket, b, Math.max(0.18, timing.travel * 0.8), { arc: 0.2, onHit: () => leafBurst(ctx, b, 0.7) });
      return;
    }
    // overdrive volleys: each loose sends a fan of arrows streaking up into the sky over the enemy
    if (shot.phase === 'overdrive' && shot.type === 'fire') {
      const live = (targets || []).filter(Boolean);
      const c = live.length ? live.reduce((m, t) => m.add(new THREE.Vector3(t.x, 0, t.z)), new THREE.Vector3()).multiplyScalar(1 / live.length) : shot.socket.clone();
      fx.muzzle(shot.socket, cols(ctx).leaf2, 0.8);
      for (let i = 0; i < 5; i++) {
        const top = shot.socket.clone().lerp(c, 0.45).add(new THREE.Vector3(rnd(-1.2, 1.2), rnd(7, 9), rnd(-1.2, 1.2)));
        fx.after(i * 0.03, () => arrow(ctx, shot.socket, top, 0.32, { arc: 0.4, leaves: 0.5, width: 0.06 }));
      }
    }
  },
  impact(ctx) {
    const { target, hit } = ctx;
    leafBurst(ctx, target.pos('core'), hit?.crit ? 1.4 : 1);
    if (hit?.crit) ctx.fx.shake(0.12);
  },
  overdrive(ctx) {
    const { fx, THREE, targets } = ctx, C = cols(ctx);
    const live = targets.filter(Boolean);
    // the rain: ~10 arrows per target falling from the sky, staggered, each with a small burst; then the roots
    live.forEach((t, ti) => {
      for (let i = 0; i < 10; i++) {
        const delay = 0.25 + ti * 0.06 + i * 0.05 + rnd(0, 0.06);
        const land = new THREE.Vector3(t.x + rnd(-0.9, 0.9), rnd(0.05, 1.2), t.z + rnd(-0.9, 0.9));
        const from = land.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), 9, rnd(-0.6, 0.6)));
        fx.after(delay, () => arrow(ctx, from, land, 0.3, { arc: 0, leaves: 0.5, width: 0.11, len: 1.5, onHit: () => {
          fx.vfx.add.spawn({ pos: land, color: C.head, life: 0.1, size: 0.5, kind: 4, floor: false });
          if (i % 3 === 0) fx.sparks(land, C.leaf2, 4, 3);
        } }));
      }
      fx.after(0.6 + ti * 0.06, () => { fx.impact(t.pos('core'), C.leaf, 1.1); fx.shake(0.18); });
      fx.after(0.9 + ti * 0.08, () => roots(ctx, t));
    });
    fx.after(0.55, () => fx.screenFlash(C.leaf, 0.03));
  },
  buff(ctx) {
    const { fx, src } = ctx, C = cols(ctx);
    const p = src.pos('head');
    fx.star(p, C.head, 1.3, 0.25);
    fx.vfx.rings.spawn({ pos: p, color: C.leaf2, r0: 0.05, r1: 0.6, thick: 0.05, life: 0.3, face: true });
  },
};
