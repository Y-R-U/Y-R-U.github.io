// PRISM signature FX (sculptor-5). Prism Bolt = a spectrum beam from the core: violet, magenta and cyan strands braided
// around a white core, a prismatic flash at the muzzle and a refraction burst (three-colour sparks + hex ring) on hit.
// Refraction Beam (overdrive) = the beam leaves the core as a fan, then bounces target -> target through all four,
// each bounce splitting the spectrum; every hit leaves a crystal shard that hangs, then fades.
const SPEC = (THREE) => [new THREE.Color(2.2, 0.6, 4.0), new THREE.Color(3.2, 0.7, 2.4), new THREE.Color(0.6, 2.6, 3.6)];

// white core from the emitter that fans into three separate colour strands at the far end (light split by the prism)
function spectrum(ctx, a, b, life, w = 0.12) {
  const { fx, THREE, palette } = ctx, cols = SPEC(THREE);
  const d = b.clone().sub(a), side = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(Math.min(0.35, d.length() * 0.06));
  const mid = a.clone().lerp(b, 0.3);
  fx.vfx.beams.spawn({ a, b: mid, color: palette.white, width: w * 0.9, width1: w * 0.5, core: 1, life, taper: 0.2 });
  cols.forEach((c, i) => {
    const off = side.clone().multiplyScalar(i - 1).add(new THREE.Vector3(0, (i - 1) * 0.06, 0));
    fx.vfx.beams.spawn({ a: mid, b: b.clone().add(off), color: c.clone().multiplyScalar(0.7), width: w * 0.85, width1: w * 0.55, core: 0.35, life: life * (1 + i * 0.1), taper: 0.3, jitter: 0.02 });
  });
}
function burst(ctx, p, k = 1) {
  const { fx, THREE } = ctx, cols = SPEC(THREE);
  cols.forEach((c) => fx.sparks(p, c, Math.round(6 * k), 5));
  fx.vfx.rings.spawn({ pos: p.clone(), color: cols[0], r0: 0.08, r1: 0.6 * k, thick: 0.07, life: 0.3, kind: 2, face: true });
  fx.vfx.rings.spawn({ pos: p.clone(), color: cols[2], r0: 0.05, r1: 0.42 * k, thick: 0.05, life: 0.24, kind: 0, face: true });
}
// a crystal shard left hanging in the target, fading
function shard(ctx, p) {
  const { fx, THREE } = ctx, cols = SPEC(THREE);
  for (let i = 0; i < 5; i++) {
    fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.2) * 0.5, (Math.random() - 0.5) * 0.4)),
      vel: new THREE.Vector3(0, 0.15, 0), color: cols[i % 3], life: 1.4 + Math.random() * 0.4, size: 0.16, size1: 0.02, kind: 3, floor: false, drag: 2, alpha: 1 });
  }
  fx.vfx.add.spawn({ pos: p.clone(), color: cols[1], life: 1.2, size: 0.5, size1: 0.1, kind: 0, floor: false, alpha: 0.7 });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core'), cols = SPEC(THREE);
    fx.muzzle(a, cols[0], 1.3);
    fx.light(a, cols[2], 14, 0.12);
    spectrum(ctx, a, b, Math.max(0.18, timing.travel + 0.12));
  },
  impact(ctx) {
    const { fx, target, hit, palette } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.faction, hit?.crit ? 1.3 : 0.8);
    burst(ctx, p, hit?.crit ? 1.4 : 0.9);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const cols = SPEC(THREE), a0 = src.pos('muzzle');
    fx.screenFlash(cols[0], 0.05);
    fx.light(a0, cols[2], 14, 0.35);
    // the fan out of the core (splitting light) before the bounce chain
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Vector3(Math.cos(i) * 0.2, 0.15 + Math.sin(i * 1.7) * 0.2, 0);
      fx.vfx.beams.spawn({ a: a0, b: a0.clone().add(live[0].pos('core').sub(a0).multiplyScalar(0.25)).add(d), color: cols[i % 3], width: 0.1, width1: 0.0, core: 0.6, life: 0.3, taper: 1 });
    }
    let prev = a0;
    live.forEach((t, i) => {
      const from = prev;
      fx.after(i * 0.13, () => {
        const p = t.pos('core');
        spectrum(ctx, i ? from : src.pos('muzzle'), p, 0.55, 0.16);
        burst(ctx, p, 1.3);
        shard(ctx, p);
        fx.impact(p, cols[i % 3], 1.2);
        fx.light(p, cols[i % 3], 12, 0.25);
        fx.shake(0.15);
      });
      prev = t.pos('core');
    });
  },
};
