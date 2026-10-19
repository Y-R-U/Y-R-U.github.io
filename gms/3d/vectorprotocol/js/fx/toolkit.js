import * as THREE from 'three';
import { markNoBloom } from './vfx.js';

// FX toolkit (documented in js/fx/README.md): the battle VFX vocabulary built on js/fx/vfx.js pools.
// Calls are fire-and-forget unless they return a handle. Positions are THREE.Vector3 (copied, safe to reuse).
// hooks (bound by js/battle/battle.js): { shake(a), push(k, toVec3, dur), slowmo(scale, dur), flash(color, a), dim(k, dur), lean(id, x, z, dur) }.
const C = (r, g, b) => new THREE.Color(r, g, b);
export const PAL = {
  cyan: C(0.35, 1.3, 3.2), blue: C(0.3, 0.7, 3.4), orange: C(3.4, 1.1, 0.25), red: C(3.2, 0.35, 0.25),
  purple: C(1.8, 0.5, 3.4), gold: C(3.2, 2.2, 0.5), green: C(0.4, 3.0, 1.0), white: C(3, 3, 3), pink: C(3.2, 0.6, 2.2),
};
const v = () => new THREE.Vector3();
const BARK = new THREE.Color(0.3, 0.21, 0.13), VINE = new THREE.Color(0.2, 0.3, 0.1);
const rnd = (a, b) => a + Math.random() * (b - a);
const dirRand = (out, s = 1) => out.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(s);

export function createEffects(vfx, hooks = {}) {
  const tmp = v(), tmp2 = v(), tmp3 = v();
  const cam = { shake: (a) => hooks.shake?.(a) };
  const queue = [];
  const E = {
    vfx, PAL, THREE,
    // --- screen / time hooks ---
    shake(a = 0.3) { hooks.shake?.(a); },
    screenFlash(color = PAL.white, a = 0.25) { hooks.flash?.(color, a); },
    slowmo(scale = 0.3, dur = 0.8) { hooks.slowmo?.(scale, dur); },
    // scene-wide dim + desaturate (separate from the Overdrive spotlight): k 0..1, held for dur battle-seconds, ~0.15 s in / 0.4 s out
    dim(k = 0.8, dur = 1) { hooks.dim?.(k, dur); },
    // tilt a unit (ctx actor view or its id) by world-axis angles in radians: x = about world X (+ = top toward the camera),
    // z = about world Z (+ = top toward -x, i.e. the player side). Eases in 0.12 s, holds dur battle-s, eases back 0.35 s.
    // Use this instead of writing unit.body.rotation (the kit owns body for drops/knockback).
    lean(unit, x = 0, z = 0, dur = 0.5) { hooks.lean?.(unit?.id ?? unit, x, z, dur); },
    cameraPush(to, k = 0.6, dur = 1) { hooks.push?.(k, to, dur); },
    light(pos, color, intensity = 30, life = 0.25) { vfx.flash(pos, color, intensity, life); },
    // --- persistent pieces (return handles with .kill()) ---
    // shield bubble on a unit: follow = an Object3D (e.g. unit.root), offsetY = centre height
    shieldBubble({ follow, pos, offsetY = 1.1, radius = 1.3, color = PAL.cyan, life = 3, alpha = 0.7 } = {}) {
      return vfx.bubbles.spawn({ follow, pos, offsetY, radius, color, life, alpha });
    },
    // n orbiting drones round an Object3D/point; each handle has .pos (live Vector3) and .kill()
    drones({ around, n = 2, radius = 0.9, height = 1.9, speed = 2.4, color = PAL.cyan, life = 3 } = {}) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(vfx.drones.spawn({ around, radius, height, speed, phase: (i / n) * 6.283, color, life }));
      return out;
    },
    // flat area field (ground decal + rising motes); kind: 'heal' | 'debuff' | 'hex' | 'zone'
    areaField(center, { radius = 2.5, color = PAL.purple, life = 1.6, kind = 'zone', motes = 30 } = {}) {
      vfx.rings.spawn({ pos: tmp.set(center.x, 0.05, center.z), color, r0: radius * 0.3, r1: radius, thick: 0.08, life, kind: kind === 'hex' ? 2 : 1, alpha: 0.5, hold: 0.6 });
      vfx.rings.spawn({ pos: tmp.set(center.x, 0.06, center.z), color, r0: radius * 0.92, r1: radius * 1.04, thick: 0.1, life, kind: kind === 'hex' ? 2 : 0, alpha: 0.8, hold: 0.6 });
      const down = kind === 'debuff';
      for (let i = 0; i < motes; i++) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * radius;
        tmp.set(center.x + Math.cos(a) * r, down ? rnd(1, 2) : rnd(0, 0.4), center.z + Math.sin(a) * r);
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(0, (down ? -1 : 1) * rnd(0.5, 1.4), 0), color, life: rnd(0.7, 1.4) * Math.min(1.5, life), size: rnd(0.07, 0.18), kind: 0, floor: false, fadeIn: 0.2 });
      }
    },
    after(t, fn) { queue.push({ t, fn }); },
    get pending() { return queue.length; },
    update(dt) {
      for (let i = queue.length - 1; i >= 0; i--) { const q = queue[i]; q.t -= dt; if (q.t <= 0) { queue.splice(i, 1); q.fn(); } }
    },
    // kind-4 star flare (lens-cross) — the ref's hit "starbursts"
    star(pos, color, size = 1.4, life = 0.16) { vfx.add.spawn({ pos, color, life, size, size1: size * 0.4, kind: 4, floor: false }); },
    muzzle(pos, color, k = 1) {
      vfx.add.spawn({ pos, color, life: 0.09, size: 0.5 * k, size1: 0.2 * k, kind: 0, floor: false });
      vfx.add.spawn({ pos, color, life: 0.08, size: 0.9 * k, size1: 0.3 * k, kind: 4, floor: false });
      for (let i = 0; i < 4 * k; i++) vfx.add.spawn({ pos, vel: dirRand(tmp, rnd(2, 5)), color, life: rnd(0.08, 0.18), size: 0.06, kind: 1, streak: 0.06, floor: false });
    },
    sparks(pos, color, n = 14, speed = 6, up = 1) {
      for (let i = 0; i < n; i++) {
        dirRand(tmp, rnd(0.4, 1) * speed); tmp.y = Math.abs(tmp.y) * up + 1;
        vfx.add.spawn({ pos, vel: tmp, color, life: rnd(0.25, 0.6), size: rnd(0.04, 0.08), kind: 1, streak: 0.09, grav: 12, drag: 1.5 });
      }
    },
    impact(pos, color, k = 1) {
      vfx.add.spawn({ pos, color: PAL.white, life: 0.12, size: 0.9 * k, size1: 1.6 * k, kind: 0, floor: false });
      vfx.add.spawn({ pos, color, life: 0.16, size: 1.5 * k, size1: 0.6 * k, kind: 4, floor: false });
      vfx.add.spawn({ pos, color, life: 0.24, size: 0.6 * k, size1: 1.3 * k, kind: 0, floor: false, alpha: 0.7 });
      E.sparks(pos, color, Math.round(12 * k), 7 * k);
      vfx.rings.spawn({ pos, color, r0: 0.1, r1: 0.55 * k, thick: 0.1, life: 0.16, face: true }); // battle-3: smaller + shorter (clutter)
    },
    // instant hitscan tracer: a fast bright slug streaking A->B, plus a faint lingering line
    tracer(a, b, color, w = 0.18) {
      a = a.clone(); b = b.clone();
      const len = a.distanceTo(b);
      const seg = Math.min(2.6, len * 0.45);
      const dir = tmp3.copy(b).sub(a).normalize().clone();
      vfx.beams.spawn({ a, b: a, color, width: w, core: 0.4, life: Math.max(0.09, len / 55), taper: 0.3,
        fn: (bm, k) => { bm.b.copy(a).addScaledVector(dir, Math.min(len, k * len + seg)); bm.a.copy(a).addScaledVector(dir, Math.max(0, k * len - seg * 0.2)); } });
      vfx.beams.spawn({ a, b, color, width: w * 0.45, core: 0.25, life: 0.22, alpha: 0.5 });
    },
    // projectile travelling over `dur` seconds along an optional arc; returns a handle with .done
    bolt(a, b, color, dur, { size = 0.32, arc = 0, trail = 0.9 } = {}) {
      a = a.clone(); b = b.clone();
      const p = v().copy(a), prev = v().copy(a);
      const h = { done: false };
      const head = vfx.add.spawn({ pos: a, color, life: dur, size, kind: 0, floor: false });
      const halo = vfx.add.spawn({ pos: a, color, life: dur, size: size * 2.6, kind: 0, floor: false, alpha: 0.35 });
      const tail = vfx.beams.spawn({ a, b: a, color, width: size * 0.7, width1: size * 0.7, core: 0.35, life: dur, taper: 0.5, hold: 0.95,
        fn: (bm, k) => {
          prev.copy(p);
          p.lerpVectors(a, b, k); p.y += Math.sin(Math.PI * k) * arc;
          head.x = halo.x = p.x; head.y = halo.y = p.y; head.z = halo.z = p.z; head.t = halo.t = 0;
          bm.b.copy(p);
          bm.a.copy(p).addScaledVector(tmp2.copy(b).sub(a).normalize(), -Math.min(trail, a.distanceTo(p)));
          if (Math.random() < 0.6) vfx.add.spawn({ pos: p, vel: dirRand(tmp, 0.4), color, life: 0.25, size: size * 0.4, size1: 0.02, kind: 0, floor: false, alpha: 0.6 });
        } });
      head.life = halo.life = dur + 0.02;
      h.tail = tail;
      return h;
    },
    rail(a, b, color, w = 0.32) {
      vfx.beams.spawn({ a, b, color, width: w, width1: w * 0.2, core: 0.3, life: 0.45, taper: 0.03, hold: 0.25 });
      vfx.beams.spawn({ a, b, color: PAL.white, width: w * 0.3, width1: 0.01, core: 0.6, life: 0.3, taper: 0.03 });
      const n = Math.round(a.distanceTo(b) * 2.5);
      for (let i = 0; i < n; i++) {
        tmp.lerpVectors(a, b, i / n);
        vfx.add.spawn({ pos: tmp, vel: dirRand(tmp2, 0.8), color, life: rnd(0.3, 0.7), size: rnd(0.06, 0.14), size1: 0.01, kind: 0, floor: false, drag: 2 });
      }
    },
    beam(a, b, color, life = 0.35, w = 0.22, jitter = true) {
      vfx.beams.spawn({ a, b, color, width: w, core: 0.3, life, taper: 0.04, hold: 0.6, jitter });
    },
    shieldHit(pos, color) {
      vfx.rings.spawn({ pos, color, r0: 0.2, r1: 0.6, thick: 0.18, life: 0.2, face: true, kind: 2 });
      vfx.add.spawn({ pos, color, life: 0.2, size: 0.8, size1: 1.2, kind: 0, floor: false, alpha: 0.7 });
      E.sparks(pos, color, 8, 4);
    },
    heal(pos, color = PAL.green) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.05, pos.z), color, r0: 0.4, r1: 1.3, thick: 0.15, life: 0.7, kind: 1, alpha: 0.6 });
      for (let i = 0; i < 12; i++) {
        tmp.set(pos.x + rnd(-0.6, 0.6), rnd(0.1, 1.2), pos.z + rnd(-0.6, 0.6));
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(0, rnd(0.8, 1.8), 0), color, life: rnd(0.6, 1.1), size: rnd(0.08, 0.16), kind: 0, floor: false, fadeIn: 0.1 });
      }
    },
    healField(center, radius, color = PAL.green, life = 1.6) {
      vfx.rings.spawn({ pos: tmp.set(center.x, 0.05, center.z), color, r0: radius * 0.2, r1: radius, thick: 0.08, life, kind: 1, alpha: 0.5, hold: 0.6 });
      vfx.rings.spawn({ pos: tmp.set(center.x, 0.06, center.z), color, r0: radius * 0.9, r1: radius * 1.05, thick: 0.12, life, kind: 0, alpha: 0.8, hold: 0.6 });
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * radius;
        tmp.set(center.x + Math.cos(a) * r, rnd(0, 0.4), center.z + Math.sin(a) * r);
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(0, rnd(0.6, 1.6), 0), color, life: rnd(0.8, 1.6), size: rnd(0.08, 0.2), kind: 0, floor: false, fadeIn: 0.2 });
      }
    },
    emp(center, color = PAL.cyan, radius = 6) {
      vfx.rings.spawn({ pos: tmp.set(center.x, 0.08, center.z), color, r0: 0.3, r1: radius, thick: 0.08, life: 0.7 });
      vfx.rings.spawn({ pos: tmp.set(center.x, 0.09, center.z), color: PAL.white, r0: 0.2, r1: radius * 0.8, thick: 0.03, life: 0.5 });
      vfx.rings.spawn({ pos: tmp.set(center.x, 1.2, center.z), color, r0: 0.3, r1: radius * 0.5, thick: 0.06, life: 0.4, face: true });
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * 6.283;
        tmp.set(center.x, 0.5, center.z);
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(Math.cos(a) * radius * 1.6, rnd(0, 1), Math.sin(a) * radius * 1.6), color, life: 0.5, size: 0.08, kind: 1, streak: 0.06, drag: 2.5, floor: false });
      }
    },
    debuffAura(pos, color = PAL.purple) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.06, pos.z), color, r0: 1.2, r1: 0.5, thick: 0.1, life: 0.8, kind: 2 });
      for (let i = 0; i < 10; i++) {
        tmp.set(pos.x + rnd(-0.5, 0.5), rnd(0.2, 1.6), pos.z + rnd(-0.5, 0.5));
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(0, -rnd(0.3, 0.9), 0), color, life: rnd(0.5, 0.9), size: rnd(0.08, 0.14), kind: 0, floor: false, fadeIn: 0.1 });
      }
    },
    buffAura(pos, color = PAL.gold) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.06, pos.z), color, r0: 0.4, r1: 1.3, thick: 0.12, life: 0.6, kind: 2 });
      for (let i = 0; i < 8; i++) {
        tmp.set(pos.x + rnd(-0.5, 0.5), rnd(0.1, 0.6), pos.z + rnd(-0.5, 0.5));
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(0, rnd(1.2, 2.4), 0), color, life: rnd(0.4, 0.8), size: rnd(0.05, 0.1), kind: 1, streak: 0.12, floor: false });
      }
    },
    explosion(pos, color = PAL.orange, k = 1) {
      vfx.flash(pos, color, 40 * k, 0.35);
      vfx.add.spawn({ pos, color: PAL.white, life: 0.15, size: 1.6 * k, size1: 3 * k, kind: 0, floor: false });
      for (let i = 0; i < 16 * k; i++) {
        dirRand(tmp, rnd(1, 4) * k); tmp.y = Math.abs(tmp.y) + 1;
        vfx.add.spawn({ pos, vel: tmp, color, life: rnd(0.35, 0.7), size: rnd(0.5, 0.9) * k, size1: 0.1, kind: 0, drag: 3, floor: false });
      }
      for (let i = 0; i < 10 * k; i++) {
        dirRand(tmp, rnd(0.5, 1.6)); tmp.y = Math.abs(tmp.y) * 1.5 + 0.5;
        vfx.alpha.spawn({ pos, vel: tmp, color: new THREE.Color(0.05, 0.06, 0.1), alpha: 0.6, life: rnd(0.9, 1.6), size: rnd(0.6, 1), size1: rnd(1.6, 2.4) * k, kind: 2, drag: 1.5, floor: false });
      }
      E.sparks(pos, PAL.gold, Math.round(24 * k), 9 * k);
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.06, pos.z), color, r0: 0.4, r1: 3.2 * k, thick: 0.1, life: 0.5 });
      cam?.shake(0.45 * k);
    },
    deathBurst(pos, color) {
      E.explosion(pos, color, 0.8);
      for (let i = 0; i < 10; i++) {
        dirRand(tmp, rnd(2, 5)); tmp.y = Math.abs(tmp.y) * 2 + 2;
        vfx.alpha.spawn({ pos, vel: tmp, color: new THREE.Color(0.12, 0.14, 0.2), alpha: 1, life: rnd(0.8, 1.3), size: rnd(0.08, 0.16), kind: 3, grav: 14, drag: 0.5 });
      }
    },
    deploy(pos, color) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.05, pos.z), color, r0: 2.4, r1: 0.9, thick: 0.18, life: 0.5, kind: 2 });
      vfx.beams.spawn({ a: tmp.set(pos.x, 0.1, pos.z), b: tmp2.set(pos.x, 9, pos.z), color, width: 1.4, width1: 0.1, core: 0.25, life: 0.5, taper: 0.4 });
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * 6.283;
        tmp.set(pos.x + Math.cos(a) * 0.9, 0.1, pos.z + Math.sin(a) * 0.9);
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(Math.cos(a) * 0.5, rnd(2, 5), Math.sin(a) * 0.5), color, life: rnd(0.4, 0.8), size: 0.07, kind: 1, streak: 0.1, floor: false });
      }
    },
    // dark, normal-blended core (void / singularity): the alpha pool can draw black where the additive pools cannot
    darkCore(pos, size = 0.6, life = 0.6, color = new THREE.Color(0.01, 0.0, 0.03), alpha = 0.9) {
      // battle-5: was a soft kind-0 glow that bloom from the bright floor washed out. Now a solid disc (kind 5) + a smoke skirt.
      // battle-7: the disc goes into the bloom-masked dark pool, so neighbouring glow no longer washes it grey
      (vfx.dark || vfx.alpha).spawn({ pos, color, alpha: Math.min(1, alpha * 1.1), life, size: size * 0.7, size1: size, kind: 5, floor: false, fadeIn: Math.min(0.06, life * 0.15), hold: 0.6 });
      vfx.alpha.spawn({ pos, color, alpha: alpha * 0.6, life: life * 0.9, size: size * 1.4, size1: size * 0.6, kind: 2, floor: false, fadeIn: Math.min(0.06, life * 0.15), hold: 0.4 });
    },
    // --- solid tubes (battle-7): lit, normal-blended roots / vines that grow along a path, hold, then wither back ---
    // tube(points | THREE.Curve, {radius 0.12, radius1 (tip, default radius/4), color (albedo, LDR), emissive k (glow = color * k),
    //   tipGlow k (hot growing tip), grow 0.35 s, life 2 s, wither 0.4 s, delay, bulge(t)}) -> handle { kill(), alive }
    tube(path, o = {}) { return vfx.tubes ? vfx.tubes.spawn({ ...o, path }) : null; },
    // roots erupting from the ground at `from`, snaking over the floor to `to` and coiling up around it (treant slams, root strikes)
    roots(from, to, { n = 3, radius = 0.2, spread = 0.7, height = 2.4, color = BARK, emissive = 0, tipGlow = 0, grow = 0.4, life = 1.8, wither = 0.45, stagger = 0.06 } = {}) {
      const out = [], d = tmp3.copy(to).sub(from); d.y = 0;
      const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
      for (let i = 0; i < n; i++) {
        const ph = Math.random() * 6.28, off = (i - (n - 1) / 2) * spread / Math.max(1, n - 1) * 2;
        const a = from.clone().addScaledVector(side, off * 0.6); a.y = -0.05;
        const e = to.clone().addScaledVector(side, off * 0.35).addScaledVector(d.clone().normalize(), -1.3); e.y = 0;
        const pts = [a];
        for (let k = 1; k <= 6; k++) {
          const t = k / 6, p = a.clone().lerp(e, t * 0.9).addScaledVector(side, Math.sin(t * Math.PI * 1.5 + ph) * spread * 0.35);
          p.y = 0.05 + 0.2 * Math.abs(Math.sin(t * Math.PI * 2 + ph)); pts.push(p);
        }
        const a0 = Math.atan2(pts[6].z - to.z, pts[6].x - to.x), dir = i % 2 ? 1 : -1;
        for (let c = 1; c <= 4; c++) {
          const ang = a0 + dir * c * 1.25, r = 1.2 - c * 0.1; // outside the pedestal (r ~1.1), then up the body
          pts.push(new THREE.Vector3(to.x + Math.cos(ang) * r, 0.3 + (c / 4) * height, to.z + Math.sin(ang) * r));
        }
        out.push(E.tube(pts, { radius: radius * rnd(0.8, 1.15), radius1: 0.02, color, emissive, tipGlow, grow, life, wither, delay: i * stagger,
          bulge: (t) => 1 + 0.6 * Math.max(0, 1 - t * 6) + 0.12 * Math.sin(t * 40 + ph) }));
      }
      return out;
    },
    // vines spiralling up around a unit from the ground (entangle / snare / root bind)
    entangle(pos, { n = 4, height = 3.4, radius = 1.15, vine = 0.14, color = VINE, emissive = 0, tipGlow = 0, grow = 0.5, life = 2.2, wither = 0.5 } = {}) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const ph = (i / n) * Math.PI * 2 + Math.random() * 0.5, dir = i % 2 ? 1 : -1, pts = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10, a = ph + dir * t * 3.6, r = radius * (k === 0 ? 1.3 : 1 - t * 0.4);
          pts.push(new THREE.Vector3(pos.x + Math.cos(a) * r, k === 0 ? -0.05 : 0.2 + t * height, pos.z + Math.sin(a) * r));
        }
        out.push(E.tube(pts, { radius: vine * rnd(0.85, 1.2), radius1: 0.012, color, emissive, tipGlow, grow: grow * rnd(0.85, 1.15), life, wither, delay: i * 0.05 }));
      }
      return out;
    },
    // keep bloom off what this material covers (true-black billboards / meshes): material, mesh or Object3D tree; returns the arg
    noBloom(target, premultiplied) {
      if (target?.isMaterial) return markNoBloom(target, premultiplied);
      target?.traverse?.((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => markNoBloom(x, premultiplied)); });
      return target;
    },
    // in-place arrival for blink units (model def.noDrop): a hex ring opens on the plate and a scan of motes rises through the body
    materialize(pos, color, h = 3) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.06, pos.z), color, r0: 0.3, r1: 1.9, thick: 0.12, life: 0.45, kind: 2 });
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.05, pos.z), color, r0: 0.2, r1: 1.2, thick: 0.5, life: 0.3, kind: 1, alpha: 0.4 });
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * 6.283, r = rnd(0.3, 0.9);
        tmp.set(pos.x + Math.cos(a) * r, rnd(0.1, h), pos.z + Math.sin(a) * r);
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(-Math.cos(a) * r * 1.5, rnd(0.5, 1.5), -Math.sin(a) * r * 1.5), color, life: rnd(0.25, 0.5), size: 0.06, size1: 0.01, kind: 1, streak: 0.06, floor: false, fadeIn: 0.1 });
      }
      vfx.add.spawn({ pos: tmp.set(pos.x, h * 0.5, pos.z), color, life: 0.25, size: 0.4, size1: 1.6, kind: 0, floor: false, alpha: 0.7 });
    },
    // charge-up swirl for overdrive wind-ups
    // melee slash: a bright crescent of short ribbons across the target, facing the attacker (dir = attacker -> target)
    slash(pos, dir, color, k = 1) {
      const side = tmp3.set(-dir.z, 0, dir.x).normalize();
      const up = Math.random() < 0.5 ? 1 : -1;
      let prev = null;
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6 - 0.5) * 2.2;
        const p = new THREE.Vector3().copy(pos).addScaledVector(side, Math.sin(a) * 1.0 * k).addScaledVector(dir, -Math.cos(a) * 0.35 * k);
        p.y += up * a * 0.35 * k;
        if (prev) vfx.beams.spawn({ a: prev, b: p, color, width: 0.22 * k * (1 - Math.abs(i / 6 - 0.5)), width1: 0.02, core: 0.5, life: 0.16, taper: 0.1 });
        prev = p;
      }
      E.star(pos, PAL.white, 1.6 * k, 0.12);
    },
    // caster rune: a hex glyph under the caster's plate + motes drawn into the hands
    rune(pos, color) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.08, pos.z), color, r0: 0.6, r1: 1.5, thick: 0.07, life: 0.55, kind: 2, alpha: 0.9 });
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.07, pos.z), color, r0: 1.5, r1: 1.2, thick: 0.05, life: 0.55, kind: 0, alpha: 0.6 });
    },
    // heavy gun: ejected casings
    casings(pos, color, n = 3) {
      for (let i = 0; i < n; i++) vfx.alpha.spawn({ pos, vel: tmp.set(rnd(-1.5, 1.5), rnd(2, 3.5), rnd(0.5, 1.5)), color: new THREE.Color(0.55, 0.42, 0.18), alpha: 1, life: rnd(0.6, 0.9), size: 0.06, kind: 3, grav: 14, drag: 0.4 });
      vfx.alpha.spawn({ pos, vel: tmp.set(0, 0.6, 0), color: new THREE.Color(0.2, 0.22, 0.28), alpha: 0.4, life: 0.6, size: 0.3, size1: 0.8, kind: 2, drag: 2 });
    },
    // pre-drop: the hex plate lights and a target hex closes in on it
    plateArm(pos, color, dur = 0.3) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.07, pos.z), color, r0: 2.2, r1: 1.0, thick: 0.08, life: dur, kind: 2, alpha: 0.9 });
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.06, pos.z), color, r0: 0.2, r1: 1.0, thick: 0.4, life: dur * 1.4, kind: 1, alpha: 0.35 });
    },
    // landing: shockwave ring, dust kicked outward, a few hot sparks
    land(pos, color, k = 1) {
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.06, pos.z), color, r0: 0.6, r1: 2.6 * k, thick: 0.12, life: 0.45, kind: 0 });
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.05, pos.z), color: PAL.white, r0: 0.4, r1: 1.4 * k, thick: 0.3, life: 0.18, kind: 2 });
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * 6.283;
        tmp.set(pos.x + Math.cos(a) * 0.7, 0.15, pos.z + Math.sin(a) * 0.7);
        vfx.alpha.spawn({ pos: tmp, vel: tmp2.set(Math.cos(a) * rnd(2, 3.5) * k, rnd(0.2, 0.8), Math.sin(a) * rnd(2, 3.5) * k), color: new THREE.Color(0.16, 0.2, 0.3),
          alpha: 0.45, life: rnd(0.5, 0.9), size: rnd(0.4, 0.7) * k, size1: rnd(0.9, 1.4) * k, kind: 2, drag: 3 });
      }
      E.sparks(tmp.set(pos.x, 0.2, pos.z), color, 8, 4, 0.4);
    },
    // victory: a holo burst on a winner (rising hex rings + star) ...
    holoBurst(pos, color = PAL.gold) {
      for (let i = 0; i < 3; i++) E.after(i * 0.12, () => vfx.rings.spawn({ pos: tmp.set(pos.x, 0.08 + i * 0.02, pos.z), color, r0: 0.5, r1: 2.0 + i * 0.6, thick: 0.1, life: 0.7, kind: 2 }));
      vfx.beams.spawn({ a: tmp.set(pos.x, 0.1, pos.z), b: tmp2.set(pos.x, 7, pos.z), color, width: 0.9, width1: 0.05, core: 0.3, life: 0.6, taper: 0.5 });
      E.star(tmp.set(pos.x, 2.6, pos.z), color, 2.6, 0.35);
      for (let i = 0; i < 14; i++) {
        tmp.set(pos.x + rnd(-0.7, 0.7), rnd(0.1, 1.5), pos.z + rnd(-0.7, 0.7));
        vfx.add.spawn({ pos: tmp, vel: tmp2.set(0, rnd(1.5, 3.5), 0), color, life: rnd(0.6, 1.2), size: rnd(0.05, 0.1), kind: 1, streak: 0.12, floor: false });
      }
    },
    // ... and confetti raining over an area (alpha chunks that flutter down)
    confetti(center, { w = 10, d = 14, n = 160, colors = [PAL.gold, PAL.cyan, PAL.pink, PAL.white] } = {}) {
      for (let i = 0; i < n; i++) {
        const c = colors[i % colors.length];
        tmp.set(center.x + rnd(-w / 2, w / 2), rnd(3.5, 8), center.z + rnd(-d / 2, d / 2));
        vfx.alpha.spawn({ pos: tmp, vel: tmp2.set(rnd(-1, 1), rnd(-2.5, -0.5), rnd(-1, 1)), color: new THREE.Color(c.r * 0.3, c.g * 0.3, c.b * 0.3), alpha: 1,
          life: rnd(2.2, 3.6), size: rnd(0.14, 0.26), kind: 3, grav: 1.2, drag: 1.2, floor: true });
      }
    },
    charge(pos, color, dur = 0.6) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.283, r = rnd(1, 2.2);
        tmp.set(pos.x + Math.cos(a) * r, pos.y + rnd(-0.8, 0.8), pos.z + Math.sin(a) * r);
        tmp2.copy(pos).sub(tmp).multiplyScalar(1 / dur);
        vfx.add.spawn({ pos: tmp, vel: tmp2, color, life: dur, size: 0.08, size1: 0.02, kind: 1, streak: 0.08, floor: false, fadeIn: 0.15 });
      }
      vfx.add.spawn({ pos, color, life: dur, size: 0.2, size1: 1.4, kind: 0, floor: false, alpha: 0.8 });
      vfx.rings.spawn({ pos: tmp.set(pos.x, 0.05, pos.z), color, r0: 2.6, r1: 1.0, thick: 0.1, life: dur, kind: 2 });
    },
    orbital(pos, color = PAL.gold) {
      vfx.beams.spawn({ a: tmp.set(pos.x, 30, pos.z), b: tmp2.set(pos.x, 0, pos.z), color, width: 1.6, width1: 0.3, core: 0.35, life: 0.6, taper: 0.05, hold: 0.3 });
      const p = pos.clone(); E.after(0.09, () => E.explosion(p, color, 1.1));
    },
  };
  return E;
}
