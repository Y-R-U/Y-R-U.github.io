// PYRE signature FX (sculptor-12). Napalm Artist: fire, soot and heat.
// Pyre Orb (basic, fired from the cast anim) = the mortar thunks (flash + black smoke puff), a molten orb with a white-hot core
// lobs over on a high arc trailing flame and soot; impact = a napalm splash: fireball, burning droplets, a small burn patch on
// the floor that licks flames for ~1.4 s.
// Inferno (overdrive) = the back rack launches a volley of napalm canisters high over the board; each bursts into a fireball and
// a burning zone, then a carpet of flame rolls across the whole enemy side (rows of flame columns, front to back), heat haze
// (faint drifting smoke) and soot rise over it for ~3 s.
const rnd = (a, b) => a + Math.random() * (b - a);
const C = (THREE, r, g, b) => new THREE.Color(r, g, b);
function cols(THREE) {
  return { core: C(THREE, 2.6, 1.9, 0.9), hot: C(THREE, 2.5, 1.05, 0.22), fire: C(THREE, 2.0, 0.5, 0.08), ember: C(THREE, 1.5, 0.22, 0.03),
    soot: C(THREE, 0.03, 0.025, 0.02), haze: C(THREE, 0.35, 0.18, 0.1) };
}
function socket(ctx, src, name, fallback = 'muzzle') {
  const s = src.unit?.socket?.(name);
  if (s && src.unit.root.visible) return s.getWorldPosition(new ctx.THREE.Vector3());
  return src.pos(fallback);
}
// one burst of flame tongues at p (rising, shrinking), with soot above
function flames(ctx, p, k = 1, n = 6, soot = true) {
  const { fx, THREE } = ctx, c = cols(THREE), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const q = p.clone().add(v.set(rnd(-0.5, 0.5) * k, rnd(0, 0.2), rnd(-0.5, 0.5) * k));
    const hot = Math.random() < 0.35;
    fx.vfx.add.spawn({ pos: q, vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(2, 4) * k, rnd(-0.3, 0.3)), color: hot ? c.hot : c.fire,
      life: rnd(0.4, 0.75), size: rnd(1.3, 2.0) * k, size1: 0.5 * k, kind: 0, floor: false, drag: 1.2, fadeIn: 0.05 });
  }
  if (soot && Math.random() < 0.6) fx.vfx.alpha.spawn({ pos: p.clone().add(v.set(rnd(-0.2, 0.2), rnd(1.2, 2.0) * k, rnd(-0.2, 0.2))),
    vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.8, 1.5), rnd(-0.2, 0.2)), color: c.soot, alpha: 0.5, life: rnd(1.0, 1.6), size: 0.7 * k, size1: 2.0 * k, kind: 2, drag: 0.8, floor: false });
}
// burning ground patch: soft ember glow on the floor + a carpet of low flame tongues licking for `life` seconds
function burnPatch(ctx, p, r = 0.8, life = 1.4, k = 1) {
  const { fx, THREE } = ctx, c = cols(THREE), g = p.clone().setY(0.05);
  fx.vfx.rings.spawn({ pos: g.clone(), color: c.fire.clone().multiplyScalar(0.6), r0: 0, r1: r, thick: 0.08, life, kind: 1, alpha: 0.55, hold: 0.8 });
  fx.vfx.rings.spawn({ pos: g.clone().setY(0.06), color: c.hot.clone().multiplyScalar(0.5), r0: 0, r1: r * 0.55, thick: 0.08, life: life * 0.9, kind: 1, alpha: 0.5, hold: 0.7 });
  const step = 0.08, n = Math.floor(life / step), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) fx.after(i * step, () => {
    const fade = 1 - 0.6 * (i / n);
    for (let j = 0; j < 5; j++) {
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * 0.85;
      const q = g.clone().add(v.set(Math.cos(a) * rr, 0.05, Math.sin(a) * rr));
      fx.vfx.add.spawn({ pos: q, vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.9, 2.2) * k * fade, rnd(-0.2, 0.2)), color: Math.random() < 0.3 ? c.hot : c.fire,
        life: rnd(0.35, 0.6), size: rnd(1.8, 2.8) * k * fade, size1: 0.9 * k * fade, kind: 0, floor: false, drag: 1.5, fadeIn: 0.06 });
    }
    // licking tongues: streaked sparks shooting up out of the carpet
    for (let j = 0; j < 2; j++) {
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * r * 0.8;
      fx.vfx.add.spawn({ pos: g.clone().add(v.set(Math.cos(a) * rr, 0.1, Math.sin(a) * rr)), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(3, 5.5) * fade, rnd(-0.3, 0.3)),
        color: Math.random() < 0.5 ? c.hot : c.fire, life: rnd(0.25, 0.4), size: rnd(0.3, 0.5) * k, kind: 1, streak: 0.3, drag: 2, floor: false });
    }
    if (i % 3 === 0) fx.vfx.alpha.spawn({ pos: g.clone().add(v.set(rnd(-r, r) * 0.5, rnd(1.4, 2.2), rnd(-r, r) * 0.5)), vel: new THREE.Vector3(0, rnd(0.8, 1.3), 0),
      color: c.soot, alpha: 0.6 * fade, life: rnd(1.0, 1.6), size: 0.9 * k, size1: 2.6 * k, kind: 2, drag: 0.8, floor: false });
    if (i % 3 === 0) fx.vfx.add.spawn({ pos: g.clone().add(v.set(rnd(-r, r) * 0.6, 0.2, rnd(-r, r) * 0.6)), vel: new THREE.Vector3(rnd(-0.4, 0.4), rnd(1.5, 3), rnd(-0.4, 0.4)), color: c.hot, life: rnd(0.6, 1.0), size: 0.05, kind: 1, streak: 0.05, floor: false });
  });
}
function fireball(ctx, p, k = 1) {
  const { fx, THREE } = ctx, c = cols(THREE), v = new THREE.Vector3();
  k *= 2.5;
  fx.light(p, c.hot, 14 * k, 0.35);
  fx.vfx.add.spawn({ pos: p.clone(), color: c.hot, life: 0.16, size: 1.6 * k, size1: 3.0 * k, kind: 0, floor: false });
  fx.star(p, c.hot, 1.6 * k, 0.14);
  for (let i = 0; i < 9 * k; i++) {
    v.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.6, 1.8) * k); v.y = Math.abs(v.y) + 0.8;
    fx.vfx.add.spawn({ pos: p.clone(), vel: v.clone(), color: Math.random() < 0.4 ? c.hot : c.fire, life: rnd(0.45, 0.8), size: rnd(0.8, 1.3) * k, size1: rnd(1.6, 2.4) * k, kind: 0, drag: 3, floor: false });
  }
  // burning droplets that arc out and fall
  for (let i = 0; i < 10 * k; i++) {
    v.set(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(rnd(1.5, 4) * k); v.y = rnd(2, 4.5);
    fx.vfx.add.spawn({ pos: p.clone(), vel: v.clone(), color: c.hot, life: rnd(0.5, 0.9), size: rnd(0.12, 0.22), kind: 1, streak: 0.1, grav: 9, drag: 0.5 });
  }
  for (let i = 0; i < 5 * k; i++) fx.darkCore(p.clone().add(v.set(rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4)).multiplyScalar(k)), rnd(1.0, 1.6) * k, rnd(1.0, 1.6), c.soot, 0.55);
}
// a molten orb on a lob arc a->b over dur seconds: white core + orange flame body, flame + soot trail
function orb(ctx, a, b, dur, { arc = 1.3, size = 0.36 } = {}) {
  const { fx, THREE } = ctx, c = cols(THREE);
  fx.bolt(a, b, c.fire, dur, { size, arc, trail: 1.1 });
  fx.bolt(a, b, c.core, dur, { size: size * 0.45, arc, trail: 0.4 });
  const n = Math.max(2, Math.floor(dur / 0.045)), p = new THREE.Vector3();
  for (let i = 1; i < n; i++) fx.after((i / n) * dur, () => {
    const k = i / n;
    p.lerpVectors(a, b, k); p.y += Math.sin(Math.PI * k) * arc;
    fx.vfx.add.spawn({ pos: p.clone(), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.4, 1.0), rnd(-0.3, 0.3)), color: Math.random() < 0.5 ? c.fire : c.ember, life: rnd(0.25, 0.45), size: size * rnd(0.6, 1.0), size1: 0.03, kind: 0, floor: false, drag: 2 });
    if (i % 2 === 0) fx.vfx.alpha.spawn({ pos: p.clone(), vel: new THREE.Vector3(0, 0.35, 0), color: c.soot, alpha: 0.4, life: rnd(0.6, 0.9), size: 0.14, size1: 0.5, kind: 2, drag: 1, floor: false });
  });
}
function thunk(ctx, a, k = 1) {
  const { fx, THREE } = ctx, c = cols(THREE);
  fx.muzzle(a, c.hot, 1.1 * k);
  fx.light(a, c.fire, 16 * k, 0.12);
  for (let i = 0; i < 4; i++) fx.darkCore(a.clone().add(new THREE.Vector3(rnd(-0.15, 0.15), 0.15 + i * 0.22, rnd(-0.15, 0.15))), 0.6 + i * 0.2, 0.9, c.soot, 0.5);
}
// short flamer gout from the nozzle toward b
function gout(ctx, a, b, k = 1) {
  const { fx, THREE } = ctx, c = cols(THREE), d = b.clone().sub(a);
  const L = Math.min(d.length(), 3.2); d.normalize();
  for (let i = 0; i < 18 * k; i++) {
    const s = rnd(4, 8);
    fx.vfx.add.spawn({ pos: a.clone(), vel: d.clone().multiplyScalar(s).add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.2, 0.8), rnd(-0.6, 0.6))), color: Math.random() < 0.4 ? c.hot : c.fire,
      life: L / s + rnd(0.05, 0.2), size: rnd(0.2, 0.45), size1: rnd(0.7, 1.2), kind: 0, floor: false, drag: 1.5 });
  }
}

export default {
  attack(ctx) {
    const { src, target, timing } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core');
    thunk(ctx, a);
    gout(ctx, socket(ctx, src, 'nozzle', 'hand'), b, 0.5);
    orb(ctx, a, b, Math.max(0.2, timing.travel), { arc: 2.4, size: 0.8 });
  },
  impact(ctx) {
    const { target, hit } = ctx;
    const p = target.pos('core'), k = hit?.crit ? 1.25 : 0.85;
    fireball(ctx, p, k);
    burnPatch(ctx, new ctx.THREE.Vector3(target.x, 0, target.z), 1.7 * k, hit?.crit ? 1.8 : 1.3, k);
    ctx.fx.shake(hit?.crit ? 0.18 : 0.08);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const c = cols(THREE), live = targets.filter(Boolean);
    const rack = socket(ctx, src, 'rack', 'head');
    fx.screenFlash(c.fire, 0.04);
    fx.light(rack, c.hot, 18, 0.4);
    // board area of the target side: bounds of the targets, padded
    const pts = live.length ? live.map((t) => new THREE.Vector3(t.x, 0, t.z)) : [new THREE.Vector3(-src.x || 4, 0, src.z)];
    const min = pts[0].clone(), max = pts[0].clone();
    for (const p of pts) { min.min(p); max.max(p); }
    min.x -= 1.2; min.z -= 1.4; max.x += 1.2; max.z += 1.4;
    // 1) canister volley from the back rack: one per target + fillers, high arcs, staggered
    const drops = pts.map((p) => p.clone());
    for (let i = 0; i < 3; i++) drops.push(new THREE.Vector3(rnd(min.x, max.x), 0, rnd(min.z, max.z)));
    drops.forEach((g, i) => {
      const t0 = i * 0.07, dur = 0.5 + 0.03 * Math.abs(g.z - src.z) / 4 + rnd(0, 0.1);
      fx.after(t0, () => {
        const a = rack.clone().add(new THREE.Vector3(rnd(-0.1, 0.1), 0, rnd(-0.1, 0.1)));
        fx.muzzle(a, c.hot, 0.6);
        fx.darkCore(a.clone().add(new THREE.Vector3(0, 0.2, 0)), 0.5, 0.7, c.soot, 0.5);
        const land = g.clone().setY(0.25);
        const arc = 5 + rnd(0, 1.5);
        fx.bolt(a, land, c.fire, dur, { size: 0.42, arc, trail: 2.2 });
        fx.bolt(a, land, c.core, dur, { size: 0.16, arc, trail: 0.6 });
        fx.after(dur, () => {
          fireball(ctx, land.clone().setY(0.5), 0.7);
          burnPatch(ctx, g, 2.0, 3.2, 1.3);
          fx.shake(0.22);
        });
      });
    });
    // 2) the carpet: rows of flame columns sweep across the target side, nearest row first
    const dir = Math.sign(((min.x + max.x) / 2) - src.x) || 1;
    const rows = 3, cols2 = Math.max(3, Math.ceil((max.z - min.z) / 2.4));
    fx.after(0.62, () => { fx.screenFlash(c.fire, 0.05); fx.shake(0.5); });
    for (let r = 0; r < rows; r++) {
      const x = dir > 0 ? min.x + (r + 0.5) * (max.x - min.x) / rows : max.x - (r + 0.5) * (max.x - min.x) / rows;
      fx.after(0.6 + r * 0.09, () => {
        for (let j = 0; j < cols2; j++) {
          const z = min.z + (j + 0.5) * (max.z - min.z) / cols2 + rnd(-0.3, 0.3), p = new THREE.Vector3(x + rnd(-0.3, 0.3), 0.05, z);
          const h = rnd(3.2, 5.2);
          fx.vfx.beams.spawn({ a: p.clone(), b: p.clone().setY(h), color: c.fire.clone().multiplyScalar(0.45), width: rnd(2.0, 2.8), width1: 0.2, core: 0.25, life: rnd(0.55, 0.9), taper: 0.6, jitter: 0.12 });
          fx.vfx.beams.spawn({ a: p.clone(), b: p.clone().setY(h * 0.5), color: c.hot.clone().multiplyScalar(0.5), width: 0.9, width1: 0.08, core: 0.5, life: 0.4, taper: 0.5 });
          flames(ctx, p, 1.2, 2, true);
        }
        if (r % 2 === 0) fx.light(new THREE.Vector3(x, 1.5, (min.z + max.z) / 2), c.fire, 22, 0.6);
      });
    }
    // 3) heat haze + soot hanging over the board, lingering embers
    for (let i = 0; i < 20; i++) fx.after(0.9 + i * 0.12, () => {
      const p = new THREE.Vector3(rnd(min.x, max.x), rnd(0.8, 2.2), rnd(min.z, max.z));
      fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.1, 0.1), rnd(0.25, 0.5), 0), color: c.haze, alpha: 0.2, life: rnd(1.4, 2.2), size: 2.4, size1: 5, kind: 2, drag: 0.5, floor: false, fadeIn: 0.3 });
      fx.darkCore(p.clone().setY(p.y + 2), rnd(1.6, 2.6), 1.8, c.soot, 0.35);
      fx.vfx.add.spawn({ pos: p.clone().setY(0.3), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(1, 2), rnd(-0.3, 0.3)), color: c.hot, life: 1.2, size: 0.06, kind: 1, streak: 0.05, floor: false });
    });
  },
  // squad arrival: pilot flame catches, a ring of fire licks round the plate
  deploy(ctx) {
    const { fx, THREE, src } = ctx;
    const c = cols(THREE), g = new THREE.Vector3(src.x, 0.05, src.z);
    fx.after(0.55, () => {
      fx.vfx.rings.spawn({ pos: g.clone(), color: c.fire, r0: 0.3, r1: 1.4, thick: 0.12, life: 0.45, kind: 2 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; flames(ctx, g.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9)), 0.7, 2, false); }
    });
    return 'default';
  },
};
