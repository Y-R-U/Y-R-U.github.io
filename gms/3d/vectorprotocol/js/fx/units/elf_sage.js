// ELF SAGE signature FX (sculptor-21). Keyed by `elf_sage` (unit def id == model id).
// Lumen Bolt = a blue-white orb of light thrown from the staff crystal, two sparks spiralling round its path, a trail of light
//   motes; it lands as a lumen burst (white star, blue ring, light shards, a few gold glints).
// Verdant Bloom (buff, every 7 s): a thread of light arcs from the crystal to each ally and a ring of glowing grass sprouts at their feet.
// Regen ticks (heal, ability 'regen'): two or three green-gold motes drift up, kept tiny because they fire every second.
// SANCTUARY GROVE (overdrive): the crystal blazes (scene dims a little so the grove glows), the staff plant sends a ring of light over
//   the floor, then under every ally a ring of glowing grass and small luminous trees grows up inside a pillar of light;
//   the big heal (heal hook, ability 'sanctuary_grove') is a white-green column + rising leaves.
const rnd = (a, b) => a + Math.random() * (b - a);
let C = null;
function cols(T) {
  if (!C) C = { blue: new T.Color(0.55, 1.5, 3.6), white: new T.Color(2.6, 3.0, 3.4), leaf: new T.Color(0.5, 2.6, 0.7),
    leaf2: new T.Color(1.4, 2.8, 0.6), gold: new T.Color(3.2, 2.4, 0.8), trunk: new T.Color(0.75, 1.5, 0.35) };
  return C;
}

function bolt(ctx, a, b, dur) {
  const { fx, THREE } = ctx, K = cols(THREE);
  fx.bolt(a, b, K.blue, dur, { size: 0.75, arc: 0.35, trail: 1.6 });
  fx.vfx.add.spawn({ pos: a, color: K.white, life: dur, size: 0.28, kind: 0, floor: false });
  // two sparks spiralling round the path
  const p = new THREE.Vector3(), dir = b.clone().sub(a).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x).normalize(), up = new THREE.Vector3(0, 1, 0);
  for (const ph of [0, Math.PI]) {
    const s = fx.vfx.add.spawn({ pos: a, color: K.white, life: dur, size: 0.3, kind: 4, floor: false });
    fx.vfx.beams.spawn({ a: a.clone(), b: a.clone(), color: K.blue, width: 0.001, life: dur, fn: (bm, k) => {
      if (!s) return;
      const w = ph + k * 14, r = 0.22 * Math.sin(Math.PI * Math.min(1, k * 1.3));
      p.lerpVectors(a, b, k); p.y += Math.sin(Math.PI * k) * 0.35;
      p.addScaledVector(side, Math.cos(w) * r).addScaledVector(up, Math.sin(w) * r);
      s.x = p.x; s.y = p.y; s.z = p.z; s.t = 0;
      if (Math.random() < 0.35) fx.vfx.add.spawn({ pos: p, color: K.blue, life: 0.3, size: 0.12, size1: 0.02, kind: 0, floor: false, alpha: 0.7 });
    } });
  }
}
function burst(ctx, p, k = 1) {
  const { fx, THREE } = ctx, K = cols(THREE);
  fx.star(p, K.white, 1.6 * k, 0.16);
  fx.vfx.add.spawn({ pos: p, color: K.blue, life: 0.28, size: 1.6 * k, size1: 0.5, kind: 0, floor: false, alpha: 0.8 });
  fx.vfx.rings.spawn({ pos: p, color: K.blue, r0: 0.15, r1: 0.95 * k, thick: 0.09, life: 0.25, face: true });
  for (let i = 0; i < 10 * k; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(2.5, 5));
    fx.vfx.add.spawn({ pos: p, vel: v, color: i % 4 ? K.blue : K.gold, life: rnd(0.25, 0.45), size: rnd(0.07, 0.12), kind: 1, streak: 0.1, drag: 3, floor: false });
  }
  fx.light(p, K.blue, 14 * k, 0.18);
}
// grass blades growing in a ring around (x, z)
function grassRing(ctx, x, z, { r = 1.3, n = 10, h = 1.0, life = 1.6, delay = 0 } = {}) {
  const { fx, THREE } = ctx, K = cols(THREE);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.15, 0.15), rr = r * rnd(0.85, 1.1), hh = h * rnd(0.6, 1.2);
    const g = new THREE.Vector3(x + Math.cos(a) * rr, 0.04, z + Math.sin(a) * rr);
    const tip = g.clone().add(new THREE.Vector3(Math.cos(a) * 0.25 * rnd(-1, 1.5), hh, Math.sin(a) * 0.25));
    fx.after(delay + rnd(0, 0.15), () => fx.vfx.beams.spawn({ a: g, b: g.clone(), color: i % 3 ? K.leaf : K.leaf2, width: 0.16, width1: 0.02, core: 0.35, life, hold: 0.65, taper: 0.02,
      fn: (bm, k) => bm.b.lerpVectors(g, tip, Math.min(1, k * 5)) }));
  }
}
// a small luminous tree: trunk grows, a glowing canopy blooms, leaves drift off it
function tree(ctx, x, z, h, delay, life = 1.8) {
  const { fx, THREE } = ctx, K = cols(THREE);
  const g = new THREE.Vector3(x, 0.04, z), top = new THREE.Vector3(x + rnd(-0.08, 0.08), h, z + rnd(-0.08, 0.08));
  fx.after(delay, () => {
    fx.vfx.beams.spawn({ a: g, b: g.clone(), color: K.trunk, width: 0.24, width1: 0.09, core: 0.3, life, hold: 0.7, taper: 0.02, fn: (bm, k) => bm.b.lerpVectors(g, top, Math.min(1, k * 3.5)) });
    for (const s of [1, -1]) {
      const m = g.clone().lerp(top, 0.62), br = m.clone().add(new THREE.Vector3(s * 0.5, 0.45, rnd(-0.15, 0.15)));
      fx.after(0.18, () => fx.vfx.beams.spawn({ a: m, b: m.clone(), color: K.trunk, width: 0.11, width1: 0.03, core: 0.3, life: life - 0.2, hold: 0.7, taper: 0.02, fn: (bm, k) => bm.b.lerpVectors(m, br, Math.min(1, k * 4)) }));
    }
  });
  fx.after(delay + 0.3, () => {
    // crown: three overlapping soft blobs + a bright core, so it reads as foliage rather than a lamp
    for (const [ox, oy, oz, sz] of [[0, 0.1, 0, 2.4], [0.4, -0.15, 0.1, 1.8], [-0.4, -0.12, -0.1, 1.8]]) {
      fx.vfx.add.spawn({ pos: top.clone().add(new THREE.Vector3(ox, oy, oz)), color: K.leaf, life: life - 0.3, size: sz, size1: sz * 0.85, kind: 0, floor: false, alpha: 0.5, fadeIn: 0.2, hold: 0.6 });
    }
    fx.vfx.add.spawn({ pos: top, color: K.leaf2, life: life - 0.4, size: 0.9, kind: 0, floor: false, fadeIn: 0.15, hold: 0.6 });
    for (let i = 0; i < 5; i++) fx.after(rnd(0, 0.9), () => fx.vfx.add.spawn({ pos: top.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.2, 0.3), rnd(-0.5, 0.5))),
      vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3)), color: i % 2 ? K.leaf : K.gold, life: rnd(0.8, 1.2), size: rnd(0.14, 0.22), size1: 0.05, kind: 3, grav: 0.5, drag: 2, floor: false }));
  });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const K = cols(THREE), a = src.pos('muzzle'), b = target.pos('core');
    fx.star(a, K.white, 1.2, 0.14);
    fx.vfx.add.spawn({ pos: a, color: K.blue, life: 0.25, size: 1.3, size1: 0.4, kind: 0, floor: false });
    bolt(ctx, a, b, Math.max(0.12, timing.travel));
  },
  impact(ctx) {
    const { target, hit } = ctx;
    if (!target) return 'default';
    burst(ctx, target.pos('core'), hit?.crit ? 1.35 : 1);
    if (hit?.crit) ctx.fx.shake(0.1);
  },
  shot(ctx) {
    const { shot, fx, THREE, src } = ctx, K = cols(THREE);
    if (shot.phase !== 'overdrive') return;
    if (shot.type === 'cast') {
      // the crystal blazes as the staff rises
      fx.star(shot.socket, K.white, 2.4, 0.3);
      fx.vfx.add.spawn({ pos: shot.socket, color: K.blue, life: 1.0, size: 2.4, size1: 1.6, kind: 0, floor: false, alpha: 0.6, hold: 0.6 });
      fx.vfx.rings.spawn({ pos: shot.socket, color: K.blue, r0: 0.2, r1: 1.4, thick: 0.08, life: 0.4, face: true });
      fx.light(shot.socket, K.blue, 40, 0.9);
    } else {
      // the staff plant: a ring of light rolls out over the floor, grass bursts up round her
      const g = new THREE.Vector3(src.x, 0.06, src.z);
      fx.vfx.rings.spawn({ pos: g, color: K.white, r0: 0.3, r1: 3.6, thick: 0.1, life: 0.55 });
      fx.vfx.rings.spawn({ pos: g, color: K.leaf, r0: 0.3, r1: 2.6, thick: 0.3, life: 0.7, kind: 1, alpha: 0.45 });
      grassRing(ctx, src.x, src.z, { r: 1.2, n: 12, h: 1.2, life: 1.8 });
      fx.shake(0.18);
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx, K = cols(THREE);
    fx.dim(0.35, 1.6);
    const top = src.pos('muzzle');
    fx.vfx.beams.spawn({ a: top, b: top.clone().add(new THREE.Vector3(0, 6, 0)), color: K.white, width: 0.5, width1: 0.1, core: 0.6, life: 0.9, hold: 0.5, taper: 0.05 });
    fx.screenFlash(K.leaf2, 0.03);
    (targets || []).filter(Boolean).forEach((t, i) => {
      const d = 0.15 + i * 0.09;
      fx.after(d, () => {
        const g = new THREE.Vector3(t.x, 0.05, t.z);
        fx.vfx.rings.spawn({ pos: g, color: K.leaf, r0: 0.3, r1: 1.9, thick: 0.6, life: 2.0, kind: 1, alpha: 0.35, hold: 0.7 });
        fx.vfx.rings.spawn({ pos: g, color: K.gold, r0: 1.9, r1: 1.75, thick: 0.05, life: 2.0, kind: 0, alpha: 0.8, hold: 0.7 });
        fx.vfx.beams.spawn({ a: g, b: g.clone().add(new THREE.Vector3(0, 5, 0)), color: K.leaf2, width: 2.0, width1: 0.8, core: 0.15, life: 0.9, hold: 0.3, taper: 0.1, alpha: 0.5 });
      });
      grassRing(ctx, t.x, t.z, { r: 1.6, n: 12, h: 1.0, life: 2.0, delay: d });
      for (let j = 0; j < 3; j++) {
        const a = j / 3 * Math.PI * 2 + i * 0.7 + 0.4;
        tree(ctx, t.x + Math.cos(a) * 1.7, t.z + Math.sin(a) * 1.7, rnd(2.0, 2.8), d + 0.1 + j * 0.08, 2.0);
      }
    });
  },
  // Verdant Bloom (regen buff): a thread of light from the crystal + grass sprouting at the ally's feet
  buff(ctx) {
    const { fx, THREE, src, target, buff } = ctx, K = cols(THREE);
    if (!target) return;
    if (buff?.ability === 'sanctuary_grove') return;      // the grove already covers it
    const a = src.pos('muzzle'), b = target.pos('core');
    if (target.id !== src.id) fx.bolt(a, b, K.leaf2, 0.3, { size: 0.2, arc: 0.8, trail: 0.8 });
    fx.after(target.id !== src.id ? 0.28 : 0.05, () => {
      grassRing(ctx, target.x, target.z, { r: 1.2, n: 8, h: 0.7, life: 1.1 });
      fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.05, target.z), color: K.leaf, r0: 0.4, r1: 1.6, thick: 0.1, life: 0.6 });
    });
  },
  heal(ctx) {
    const { fx, THREE, target, heal } = ctx, K = cols(THREE);
    if (!target) return;
    if (heal?.ability === 'sanctuary_grove') {
      const g = new THREE.Vector3(target.x, 0.05, target.z);
      fx.vfx.beams.spawn({ a: g, b: g.clone().add(new THREE.Vector3(0, 4.2, 0)), color: K.white, width: 0.9, width1: 0.3, core: 0.5, life: 0.5, taper: 0.1 });
      for (let i = 0; i < 10; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(target.x + rnd(-0.6, 0.6), rnd(0.1, 1.0), target.z + rnd(-0.6, 0.6)),
        vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.9, 1.8), rnd(-0.2, 0.2)), color: i % 3 ? K.leaf : K.gold, life: rnd(0.8, 1.2), size: rnd(0.1, 0.16), size1: 0.04, kind: 3, drag: 1, floor: false, fadeIn: 0.1 });
      return;
    }
    // regen tick: tiny and cheap
    for (let i = 0; i < 3; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(target.x + rnd(-0.5, 0.5), rnd(0.3, 1.2), target.z + rnd(-0.5, 0.5)),
      vel: new THREE.Vector3(0, rnd(0.6, 1.1), 0), color: i ? K.leaf : K.gold, life: rnd(0.6, 0.9), size: rnd(0.1, 0.15), kind: 0, floor: false, fadeIn: 0.15 });
  },
};
