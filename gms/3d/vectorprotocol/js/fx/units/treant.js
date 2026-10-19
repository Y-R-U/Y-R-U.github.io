// TREANT signature FX (sculptor-19). Keyed by model id `treant`, so map 6's boss ELDERBARK (boss_elderbark) uses it too.
// Roots are drawn with normal-blended "chunk" particles laid along a curve (dark bark) over a thin green sap glow, so they read
// as solid wood erupting from the floor, not as light.
// Root Slam (basic): both claws hammer the floor (quake + dirt), three roots race along the floor to the target and burst up
//   around it in a crown of thorns (thorn burst). Impact: splinters + a green entangle ring at the target's feet.
// Grasp of Ages (overdrive): a green rune ring and a leaf storm under the treant, thick roots tear across the board to every
//   frontline target and coil up around them (entangling roots, held for the stun), thorns snap shut on the second heave.
// Deep Roots / Grasp self-heal (heal hook): a regrowth grove: saplings of light sprout around its feet, leaves spiral up the trunk.
// Deploy (noDrop): roots claw out of the plate, dirt and leaves burst as it grows out of the floor.
const rnd = (a, b) => a + Math.random() * (b - a);
let K = null;
function cols(ctx) {
  if (!K) {
    const C = ctx.THREE.Color;
    K = { sap: new C(0.9, 3.2, 0.55), leaf: new C(0.55, 2.2, 0.35), pale: new C(2.2, 3.2, 1.4), amber: new C(3.2, 1.9, 0.45),
      bark: new C(0.3, 0.2, 0.11), bark2: new C(0.42, 0.3, 0.16), dirt: new C(0.17, 0.13, 0.09), leafA: new C(0.16, 0.3, 0.08), dust: new C(0.24, 0.21, 0.16) };
  }
  return K;
}
const ground = (ctx, p) => new ctx.THREE.Vector3(p.x, 0.06, p.z);
const gpos = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.06);
// scale with the unit's battle size (boss ~1.5x) without exploding
const sz = (who) => Math.max(0.8, Math.min(1.7, (who.height || 4) / 4.2));

function dirt(ctx, p, n, k = 1) {
  const { fx, THREE } = ctx, C = cols(ctx);
  for (let i = 0; i < n; i++) {
    fx.vfx.alpha.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(-0.3, 0.3) * k, 0.05, rnd(-0.3, 0.3) * k)), vel: new THREE.Vector3(rnd(-2.2, 2.2) * k, rnd(2, 5) * k, rnd(-2.2, 2.2) * k),
      color: i % 3 ? C.dirt : C.bark2, alpha: 1, life: rnd(0.6, 1.0), size: rnd(0.08, 0.2) * k, kind: 3, grav: 13, drag: 0.4 });
  }
}
function dust(ctx, p, n, r = 1) {
  const { fx, THREE } = ctx, C = cols(ctx);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.vfx.alpha.spawn({ pos: p.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.3, 0.1, Math.sin(a) * r * 0.3)), vel: new THREE.Vector3(Math.cos(a) * rnd(1, 2.6) * r, rnd(0.3, 1.1), Math.sin(a) * rnd(1, 2.6) * r),
      color: C.dust, alpha: 0.5, life: rnd(0.8, 1.3), size: 0.4 * r, size1: 1.5 * r, kind: 2, drag: 2.4, floor: false });
  }
}
function leaves(ctx, p, n, { up = 3, spread = 2, life = 1.4, size = 0.14 } = {}) {
  const { fx, THREE } = ctx, C = cols(ctx);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rnd(-spread, spread), rnd(up * 0.5, up), rnd(-spread, spread));
    if (i % 3) fx.vfx.alpha.spawn({ pos: p, vel: v, color: C.leafA, alpha: 1, life: rnd(life * 0.7, life), size: rnd(size * 0.6, size), kind: 3, grav: 2.2, drag: 1.6, floor: true });
    else fx.vfx.add.spawn({ pos: p, vel: v.multiplyScalar(0.8), color: C.leaf, life: rnd(life * 0.5, life * 0.8), size: size * 0.9, size1: 0.02, kind: 0, grav: 0.5, drag: 1.5, floor: false });
  }
}
function quake(ctx, p, k = 1) {
  const { fx } = ctx, C = cols(ctx);
  fx.vfx.rings.spawn({ pos: p, color: C.leaf, r0: 0.3, r1: 2.6 * k, thick: 0.14, life: 0.5 });
  fx.vfx.rings.spawn({ pos: p, color: C.amber, r0: 0.2, r1: 1.4 * k, thick: 0.08, life: 0.35, alpha: 0.6 });
  dirt(ctx, p, Math.round(10 * k), k);
  dust(ctx, p, Math.round(7 * k), 1.1 * k);
}
// a root: chunk particles along a curve from a (floor) to b, grown over `grow` s and held for `hold` s. Returns the tip.
function root(ctx, a, b, { lift = 0.5, r = 0.2, n = 18, grow = 0.25, hold = 0.8, glow = true, wob = 0.25 } = {}) {
  const { fx, THREE } = ctx, C = cols(ctx);
  const side = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize().multiplyScalar(rnd(-wob, wob));
  const pt = (t) => new THREE.Vector3().lerpVectors(a, b, t).addScaledVector(side, Math.sin(t * Math.PI)).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * lift, 0));
  // sap vein: a green beam that grows along the root (reads on any floor)
  if (glow) for (let i = 0; i < 6; i++) {
    const t0 = i / 6, t1 = (i + 1) / 6, a0 = pt(t0).setY(pt(t0).y + r * 0.6), b0 = pt(t1).setY(pt(t1).y + r * 0.6);
    fx.after(grow * t0, () => fx.vfx.beams.spawn({ a: a0, b: b0, color: C.sap, width: r * 1.1 * (1 - 0.5 * t0), width1: r * 0.4, core: 0.5, life: hold + 0.3, taper: 0.1, hold: 0.7 }));
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), p = pt(t), life = hold + grow * (1 - t) + 0.35;
    fx.after(grow * t, () => {
      const s = r * (1 - 0.6 * t) * rnd(0.9, 1.1);
      // a continuous soft cord (overlapping round blobs) + a few hard chips for bark texture
      fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(0, 0, 0), color: C.bark, alpha: 1, life, size: s * 2.4, size1: s * 2.2, kind: 2, hold: 0.85, floor: false });
      if (i % 3 === 0) fx.vfx.alpha.spawn({ pos: p.clone().setY(p.y + s * 0.3), vel: new THREE.Vector3(0, 0, 0), color: C.bark2, alpha: 1, life, size: s * 0.9, size1: s * 0.8, kind: 3, hold: 0.85, floor: false });
      if (glow && i % 2 === 0) fx.vfx.add.spawn({ pos: p.clone().setY(p.y + s * 0.4), color: C.sap, life: life * 0.6, size: s * 1.1, size1: s * 0.4, kind: 0, hold: 0.5, floor: false });
    });
  }
  return pt(1);
}
// a crown of thorny roots bursting up around p (thorn burst); k = size
function thorns(ctx, p, k = 1, hold = 0.5) {
  const { fx, THREE } = ctx, C = cols(ctx);
  const n = Math.round(6 + 2 * k);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), R = rnd(0.35, 0.6) * k;
    const base = p.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)).setY(0.05);
    const tip = p.clone().add(new THREE.Vector3(Math.cos(a) * R * 0.35, rnd(0.9, 1.5) * k, Math.sin(a) * R * 0.35));
    fx.after(rnd(0, 0.06), () => {
      root(ctx, base, tip, { lift: 0.08, r: 0.13 * k, n: 7, grow: 0.12, hold, wob: 0.08 });
      fx.vfx.add.spawn({ pos: tip, vel: tip.clone().sub(base).normalize().multiplyScalar(2.5), color: C.pale, life: 0.25, size: 0.12, size1: 0.01, kind: 1, streak: 0.12, drag: 3, floor: false });
    });
  }
  fx.vfx.rings.spawn({ pos: ground(ctx, p), color: C.sap, r0: 0.2, r1: 1.4 * k, thick: 0.1, life: 0.45 });
  fx.light(p.clone().setY(1), C.sap, 18 * k, 0.3);
}
// vines that coil up around a target and hold it (entangling roots)
function entangle(ctx, t, dur = 1.6, k = 1) {
  const { fx, THREE } = ctx, C = cols(ctx);
  const c = gpos(ctx, t), h = Math.min(2.2, (t.height || 3) * 0.55);
  for (let v = 0; v < 3; v++) {
    const ph = (v / 3) * Math.PI * 2, n = 20;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = ph + u * Math.PI * 2.2, R = (0.75 - 0.3 * u) * k;
      const p = c.clone().add(new THREE.Vector3(Math.cos(a) * R, 0.05 + u * h, Math.sin(a) * R));
      fx.after(u * 0.3 + v * 0.04, () => {
        fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(0, 0, 0), color: C.bark, alpha: 1, life: dur - u * 0.3, size: 0.34 * (1 - 0.5 * u) * k, size1: 0.3 * (1 - 0.5 * u) * k, kind: 2, hold: 0.85, floor: false });
        if (i % 3 === 0) fx.vfx.add.spawn({ pos: p, color: C.sap, life: (dur - u * 0.3) * 0.7, size: 0.18 * k, size1: 0.06, kind: 0, hold: 0.6, floor: false });
      });
    }
  }
  fx.vfx.rings.spawn({ pos: c, color: C.sap, r0: 0.9 * k, r1: 0.7 * k, thick: 0.08, life: dur, hold: 0.7 });
}

export default {
  attack(ctx) {
    const { fx, src, target, timing } = ctx, C = cols(ctx), k = sz(src);
    // both claws hit the floor
    const hR = ground(ctx, src.pos('muzzle')), hL = ground(ctx, src.pos('handL')), mid = hR.clone().lerp(hL, 0.5);
    quake(ctx, mid, 0.8 * k);
    fx.shake(0.22 * k);
    fx.light(mid.clone().setY(0.6), C.sap, 20, 0.25);
    leaves(ctx, src.pos('crown'), 8, { up: 2.2, spread: 1.4 });
    if (!target) return;
    // three roots race across the floor and burst up around the target
    const tg = gpos(ctx, target), travel = Math.max(0.12, Math.min(0.4, timing.travel || 0.25));
    for (let i = 0; i < 3; i++) {
      const off = new ctx.THREE.Vector3(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
      root(ctx, mid.clone().add(off.clone().multiplyScalar(0.5)), tg.clone().add(off), { lift: 0.15, r: 0.12 * k, n: 12, grow: travel, hold: 0.35, wob: 0.5 });
    }
    fx.after(travel, () => thorns(ctx, tg, 0.85, 0.35));
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx, C = cols(ctx);
    const p = target.pos('core'), k = hit?.crit ? 1.4 : 1;
    fx.impact(p, C.sap, 0.8 * k);
    // splinters
    for (let i = 0; i < 10 * k; i++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-3, 3), rnd(1, 4), rnd(-3, 3)), color: C.bark2, alpha: 1, life: rnd(0.5, 0.8), size: rnd(0.06, 0.12), kind: 3, grav: 12, drag: 0.6, streak: 0.06 });
    fx.vfx.rings.spawn({ pos: gpos(ctx, target), color: C.sap, r0: 0.9, r1: 0.6, thick: 0.08, life: 0.9, hold: 0.4 });
    if (hit?.crit) { fx.shake(0.2); thorns(ctx, gpos(ctx, target), 0.7, 0.25); }
  },
  shot(ctx) {
    const { fx, shot, src } = ctx, k = sz(src);
    if (shot.phase !== 'overdrive') return;
    // anim frames: roar (cast) / claws plunge (impact 1) / the heave that drags the roots up (impact 2)
    if (shot.type === 'cast') { leaves(ctx, src.pos('crown'), 18, { up: 3, spread: 2 }); fx.shake(0.15); }
    else if (shot.index === 1) { const p = ground(ctx, shot.socket); quake(ctx, p, 1.2 * k); fx.shake(0.45 * k); }
    else { dust(ctx, gpos(ctx, src), 8, 1.4 * k); fx.shake(0.3 * k); }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx, C = cols(ctx), k = sz(src);
    const g0 = gpos(ctx, src);
    // rune circle + leaf storm under the treant, green flash
    fx.vfx.rings.spawn({ pos: g0, color: C.sap, r0: 0.4, r1: 2.4 * k, thick: 0.12, life: 2.2, hold: 0.75 });
    fx.vfx.rings.spawn({ pos: g0, color: C.amber, r0: 2.0 * k, r1: 2.1 * k, thick: 0.05, life: 2.2, hold: 0.75, alpha: 0.7 });
    fx.vfx.rings.spawn({ pos: g0, color: C.leaf, r0: 0.3, r1: 5.5 * k, thick: 0.2, life: 0.6 });
    leaves(ctx, g0.clone().setY(1.5 * k), 30, { up: 4, spread: 3, life: 1.8, size: 0.18 });
    fx.screenFlash(C.sap, 0.06);
    fx.light(g0.clone().setY(1.5), C.sap, 60, 0.6);
    quake(ctx, g0, 1.3 * k);
    // thick roots tear across the board to each frontline target, coil up around it, thorns snap shut on the heave
    targets.filter(Boolean).forEach((t, i) => {
      const tg = gpos(ctx, t), d = Math.min(0.5, 0.18 + tg.distanceTo(g0) * 0.03);
      for (let j = 0; j < 2; j++) {
        const off = new THREE.Vector3(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5));
        root(ctx, g0.clone().add(off.clone().multiplyScalar(0.6)), tg.clone().add(off), { lift: 0.25 + 0.15 * j, r: 0.18 * k, n: 16, grow: d, hold: 1.6, wob: 0.6 });
      }
      fx.after(d, () => {
        thorns(ctx, tg, 1.1, 1.2);
        entangle(ctx, t, 2.0, 1);
        dirt(ctx, tg, 8, 1);
        fx.shake(0.25);
      });
      fx.after(d + 0.45 + i * 0.05, () => {
        fx.impact(t.pos('core'), C.sap, 1.2);
        for (let s = 0; s < 6; s++) fx.vfx.add.spawn({ pos: t.pos('core'), vel: new THREE.Vector3(rnd(-2, 2), rnd(1, 3), rnd(-2, 2)), color: C.pale, life: 0.3, size: 0.1, size1: 0.01, kind: 1, streak: 0.1, drag: 2 });
      });
    });
  },
  heal(ctx) {
    const { fx, THREE, src, target } = ctx, C = cols(ctx);
    const who = target || src, k = sz(who), g = gpos(ctx, who);
    // regrowth grove: saplings of light sprout in a ring, leaves spiral up the trunk, soft green light
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), R = rnd(0.9, 1.2) * k;
      const b = g.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      fx.after(i * 0.04, () => {
        fx.vfx.beams.spawn({ a: b, b: b.clone().setY(rnd(0.4, 0.75) * k), color: C.leaf, width: 0.12, width1: 0.02, core: 0.4, life: 0.9, taper: 0.4, hold: 0.5 });
        fx.vfx.add.spawn({ pos: b.clone().setY(0.6 * k), color: C.sap, life: 0.8, size: 0.3, size1: 0.05, kind: 0, hold: 0.4, floor: false });
      });
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 4, y = 0.3 + (i / 16) * 2.2 * k;
      fx.after(i * 0.035, () => fx.vfx.add.spawn({ pos: g.clone().add(new THREE.Vector3(Math.cos(a) * 0.7 * k, y, Math.sin(a) * 0.7 * k)), vel: new THREE.Vector3(0, 1.2, 0), color: i % 2 ? C.leaf : C.pale, life: 0.7, size: 0.16, size1: 0.02, kind: 0, drag: 1, floor: false }));
    }
    fx.vfx.rings.spawn({ pos: g, color: C.sap, r0: 0.4, r1: 1.4 * k, thick: 0.12, life: 0.9 });
    fx.light(g.clone().setY(1.2), C.sap, 14, 0.5);
  },
  deploy(ctx) {
    const { fx, THREE, src } = ctx, C = cols(ctx), k = sz(src), g = gpos(ctx, src);
    // roots claw out of the plate first, then the burst of dirt + leaves as it grows out of the floor
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd(-0.3, 0.3), R = rnd(1.0, 1.4) * k;
      root(ctx, g.clone(), g.clone().add(new THREE.Vector3(Math.cos(a) * R, 0.02, Math.sin(a) * R)), { lift: 0.3, r: 0.12 * k, n: 9, grow: 0.3, hold: 0.9 });
    }
    fx.vfx.rings.spawn({ pos: g, color: C.sap, r0: 0.2, r1: 2.0 * k, thick: 0.12, life: 0.8 });
    fx.after(0.45, () => { dirt(ctx, g, 14, k); dust(ctx, g, 8, 1.2 * k); leaves(ctx, g.clone().setY(1.5 * k), 16, { up: 3, spread: 1.6 }); fx.shake(0.2); });
    fx.light(g.clone().setY(0.8), C.sap, 20, 0.7);
  },
};
