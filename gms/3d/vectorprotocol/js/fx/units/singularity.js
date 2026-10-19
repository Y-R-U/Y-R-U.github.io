// SINGULARITY signature FX (sculptor-16). Also VECTOR PRIME, the final boss (boss_vector_prime uses this module through its model id).
// Void Bolt: the eyelids part and spit a black pearl wrapped in violet light; it lands as a small implosion (dark disc, inward
//   sparks, a gold ring snapping shut).
// Collapse (overdrive): the core is hurled over the enemy board and becomes a black hole with a gold accretion disc; the arena
//   dims, enemies lean in on tethers of stretched light, then it implodes in a gold-white ring flash.
// VECTOR PRIME's Cataclysm: the same idea at the scale of the whole arena. The Protocol's cyan light is drained out of every
//   enemy into Prime, a giant cyan V (the arena logo) is drawn over the enemy board and folds down into a black hole whose
//   cyan disc burns violet as it is swallowed; hex locks stamp every enemy (stun), then the V collapses into the hole and the
//   board is swept by a white-cyan shockwave.
const C = (T, r, g, b) => new T.Color(r, g, b);
const VIO = (T) => C(T, 1.3, 0.4, 2.6);
const GOLD = (T) => C(T, 2.4, 1.5, 0.45);
const HOT = (T) => C(T, 3.0, 2.5, 1.6);
const CYAN = (T) => C(T, 0.35, 2.2, 3.0);
const WHITE = (T) => C(T, 2.6, 2.8, 3.0);
const DARK = (T) => C(T, 0.012, 0.0, 0.03);
const isPrime = (ctx) => ctx.ability?.id === 'boss_cataclysm' || ctx.event?.ability === 'boss_cataclysm' || (ctx.src?.unit?.rank ?? 0) >= 5;

// small implosion where a bolt lands
function implode(ctx, p, k = 1, prime = false) {
  const { fx, THREE } = ctx;
  const ring = prime ? CYAN(THREE) : GOLD(THREE), col = VIO(THREE);
  fx.darkCore(p, 1.1 * k, 0.45, DARK(THREE), 0.95);
  for (let i = 0; i < Math.round(12 * k); i++) {
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * 1.6, r = 1.1 * k;
    const off = new THREE.Vector3(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    fx.vfx.add.spawn({ pos: p.clone().add(off), vel: off.clone().multiplyScalar(-3.2), color: i % 3 ? col : ring, life: 0.3, size: 0.14, size1: 0.02, kind: 1, streak: 0.7, floor: false });
  }
  fx.vfx.rings.spawn({ pos: p.clone(), color: ring, r0: 1.3 * k, r1: 0.15, thick: 0.08, life: 0.32, kind: 0, face: true });
  fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: col, r0: 0.2, r1: 1.4 * k, thick: 0.1, life: 0.45, kind: 0 });
  fx.vfx.add.spawn({ pos: p.clone(), color: HOT(THREE), life: 0.12, size: 0.9 * k, size1: 0.05, kind: 4 });
}

// lean a target toward a world point for `dur` (battle-owned tilt)
function leanTo(ctx, t, c, amt, dur) {
  const dx = c.x - t.x, dz = c.z - t.z, l = Math.hypot(dx, dz);
  if (l < 0.05) return;
  ctx.fx.lean(t, (dz / l) * amt, (-dx / l) * amt, dur);
}

// a horizontal accretion disc at c, kept alive for `dur` with `n` refreshes (the elevated camera sees an ellipse)
function accretion(ctx, c, R, dur, colA, colB, n = 14) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) fx.after(i * dur / n, () => {
    const g = Math.min(1, (i + 1) / 3) * (i > n - 3 ? 0.7 : 1);
    const col = i / n > 0.5 && colB ? colB : colA;
    fx.vfx.rings.spawn({ pos: c.clone(), color: col, r0: R * 0.55 * g, r1: R * 0.55 * g, thick: 0.18, life: dur / n * 1.9, kind: 0, hold: 0.6 });
    fx.vfx.rings.spawn({ pos: c.clone(), color: col.clone().multiplyScalar(0.6), r0: R * g, r1: R * 0.9 * g, thick: 0.08, life: dur / n * 1.9, kind: 0, hold: 0.6 });
    // orbiting motes skimming the disc
    for (let m = 0; m < 8; m++) {
      const a = Math.random() * Math.PI * 2, r = R * (0.5 + Math.random() * 0.55) * g;
      const p = c.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 0.12, Math.sin(a) * r));
      const v = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(5.5 / Math.max(0.6, r)).addScaledVector(c.clone().sub(p), 0.8);
      fx.vfx.add.spawn({ pos: p, vel: v, color: m % 3 ? col : HOT(THREE), life: 0.35, size: 0.12, size1: 0.02, kind: 1, streak: 0.5, floor: false });
    }
  });
}

function centroid(ctx, live, y) {
  const c = live.reduce((s, t) => s.add(new ctx.THREE.Vector3(t.x, 0, t.z)), new ctx.THREE.Vector3()).multiplyScalar(1 / Math.max(1, live.length));
  c.y = y;
  return c;
}

// a temporary world-space black hole (same lensing billboard as the unit's core): true black + photon ring + swirl halo.
// host = the battle scene (src.root.parent). Grows in, pulses, collapses to a point at `dur`.
const HOLE_VS = `uniform float uSize; varying vec2 vUv;
void main() { vUv = position.xy; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`;
const HOLE_FS = `uniform float uTime, uA; uniform vec3 uRing, uOuter; varying vec2 vUv;
void main() {
  float r = length(vUv); if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x), hz = 0.42;
  float inside = 1.0 - smoothstep(hz - 0.012, hz + 0.008, r);
  float rr = (r - hz - 0.03) / 0.02; float ring = exp(-rr * rr);
  float halo = exp(-max(r - hz, 0.0) * 5.0) * step(hz, r);
  float sw = 0.5 + 0.5 * sin(a * 4.0 + 7.0 / max(r, 0.2) - uTime * 5.0);
  vec3 col = mix(uOuter, uRing, smoothstep(0.85, hz + 0.05, r)) * (ring * 1.6 + halo * (0.2 + 0.8 * sw) * 0.9);
  float al = clamp(ring + halo * (0.15 + 0.55 * sw), 0.0, 1.0) * (1.0 - smoothstep(0.8, 1.0, r));
  gl_FragColor = vec4(col * (1.0 - inside), max(inside, al) * uA);
}`;
let HOLE_GEO = null;
function blackHole(ctx, c, size, dur, ringCol, outerCol) {
  const { fx, THREE, src } = ctx;
  const host = src.root?.parent;
  if (!host) return;
  if (!HOLE_GEO) HOLE_GEO = new THREE.PlaneGeometry(2, 2);
  const m = new THREE.Mesh(HOLE_GEO, new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 0.01 }, uTime: { value: 0 }, uA: { value: 1 }, uRing: { value: ringCol.clone() }, uOuter: { value: outerCol.clone() } },
    vertexShader: HOLE_VS, fragmentShader: HOLE_FS, transparent: true, depthWrite: false, depthTest: false,
  }));
  fx.noBloom?.(m.material);
  m.position.copy(c); m.frustumCulled = false; m.renderOrder = 30;
  host.add(m);
  const S = 40;
  for (let i = 0; i <= S; i++) fx.after(i * dur / S, () => {
    const k = i / S, g = Math.min(1, k * 6) * (k > 0.9 ? Math.max(0.02, 1 - (k - 0.9) / 0.1) : 1);
    m.material.uniforms.uSize.value = size * g * (1 + 0.04 * Math.sin(i * 1.7));
    m.material.uniforms.uTime.value = k * dur;
    if (i === S) { m.removeFromParent(); m.material.dispose(); }
  });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const prime = isPrime(ctx), a = src.pos('muzzle'), b = target.pos('core');
    const col = prime ? CYAN(THREE) : VIO(THREE), travel = Math.max(0.15, timing.travel || 0.4);
    fx.vfx.rings.spawn({ pos: a.clone(), color: prime ? CYAN(THREE) : GOLD(THREE), r0: 0.9, r1: 0.1, thick: 0.07, life: 0.22, kind: 0, face: true });
    fx.muzzle(a, col, 0.9);
    fx.bolt(a, b, col, travel, { size: 0.5, arc: 0.25, trail: true });
    // the black pearl inside the bolt: dark discs riding the same line
    const n = 7;
    for (let i = 0; i <= n; i++) fx.after(travel * i / n, () => {
      const k = i / n, p = a.clone().lerp(b, k);
      p.y += Math.sin(k * Math.PI) * 0.25 * a.distanceTo(b) * 0.1;
      fx.darkCore(p, 0.55, 0.16, DARK(THREE), 0.9);
    });
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx;
    if (!target) return 'default';
    const p = target.pos('core'), prime = isPrime(ctx);
    implode(ctx, p, hit?.crit ? 1.45 : 1, prime);
    fx.light(p, prime ? CYAN(THREE) : VIO(THREE), hit?.crit ? 12 : 7, 0.2);
    fx.shake(hit?.crit ? 0.25 : 0.12);
  },
  shot(ctx) {
    const { fx, THREE, src, shot, targets } = ctx;
    if (shot.phase !== 'overdrive') return;
    const hole = src.pos('hole'), prime = isPrime(ctx);
    if (shot.index === 0) {
      // charge: light is pulled out of the enemy side into the core
      const col = prime ? CYAN(THREE) : GOLD(THREE);
      if (prime) fx.dim(0.7, 2.6);
      (targets || []).filter(Boolean).forEach((t, j) => {
        const p = t.pos('core');
        fx.vfx.beams.spawn({ a: p, b: hole, color: col, width: prime ? 0.16 : 0.08, width1: 0.02, core: 0.5, life: 0.35, jitter: 0.12, taper: 1 });
        for (let m = 0; m < (prime ? 10 : 5); m++) fx.after(m * 0.03, () => {
          const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 1.2));
          fx.vfx.add.spawn({ pos: q, vel: hole.clone().sub(q).multiplyScalar(2.6), color: col, life: 0.38, size: 0.12, size1: 0.03, kind: 1, streak: 0.8, floor: false });
        });
        if (prime) fx.after(0.05 * j, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(t.x, 0.07, t.z), color: CYAN(THREE), r0: 1.7, r1: 1.2, thick: 0.1, life: 0.5, kind: 2 }));
      });
      for (let i = 0; i < 3; i++) fx.after(i * 0.07, () => fx.vfx.rings.spawn({ pos: hole.clone(), color: prime ? CYAN(THREE) : GOLD(THREE), r0: 2.4 - i * 0.4, r1: 0.3, thick: 0.1, life: 0.3, kind: 0, face: true }));
      fx.darkCore(hole, 1.8, 0.5, DARK(THREE), 0.95);
      fx.light(hole, prime ? CYAN(THREE) : VIO(THREE), 10, 0.5);
    } else if (shot.type === 'fire') {
      // the throw: recoil flash at the eye
      fx.vfx.rings.spawn({ pos: hole.clone(), color: WHITE(THREE), r0: 0.3, r1: 2.6, thick: 0.14, life: 0.3, kind: 0, face: true });
      fx.vfx.add.spawn({ pos: hole.clone(), color: prime ? CYAN(THREE) : HOT(THREE), life: 0.15, size: 2.2, size1: 0.2, kind: 4 });
      fx.shake(0.25);
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const live = (targets || []).filter(Boolean);
    if (!live.length) return 'default';
    if (isPrime(ctx)) return cataclysm(ctx, live);
    const c = centroid(ctx, live, 5.2), dur = 1.7, hole = src.pos('hole');
    fx.dim(0.45, dur);
    // the core is hurled across: a black pearl with a gold wake
    fx.bolt(hole, c, GOLD(THREE), 0.2, { size: 0.8, arc: 0.6, trail: true });
    for (let i = 0; i <= 4; i++) fx.after(0.05 * i, () => fx.darkCore(hole.clone().lerp(c, i / 4), 0.9, 0.2, DARK(THREE), 0.9));
    fx.after(0.2, () => {
      fx.shake(0.4);
      fx.vfx.rings.spawn({ pos: c.clone(), color: WHITE(THREE), r0: 0.2, r1: 3.2, thick: 0.12, life: 0.3, kind: 0, face: true });
      fx.light(c, GOLD(THREE), 9, dur);
      accretion(ctx, c, 2.2, dur - 0.2, GOLD(THREE), HOT(THREE), 14);
      blackHole(ctx, c, 2.6, dur - 0.2, C(THREE, 2.2, 1.5, 0.5), C(THREE, 1.1, 0.4, 1.6));
      // the hole itself (held dark disc, pulsing) + lensing rings contracting into it
      for (let i = 0; i < 12; i++) fx.after(i * (dur - 0.2) / 12, () => {
        fx.darkCore(c, 3.0 + 0.3 * Math.sin(i * 1.7), 0.34, DARK(THREE), 1);
        if (i % 2 === 0) fx.vfx.rings.spawn({ pos: c.clone(), color: VIO(THREE), r0: 3.2, r1: 1.0, thick: 0.05, life: 0.4, kind: 0, face: true });
      });
      fx.areaField(c.clone().setY(0.05), { radius: 3.0, color: VIO(THREE), life: dur, kind: 'debuff', motes: 12 });
    });
    // enemies lean in on tethers of stretched light (spaghettification streaks)
    live.forEach((t, j) => {
      const p = t.pos('core');
      fx.after(0.25 + j * 0.04, () => {
        fx.vfx.beams.spawn({ a: p, b: c, color: VIO(THREE), width: 0.12, width1: 0.02, core: 0.4, life: dur - 0.4, jitter: 0.06, hold: 0.8 });
        fx.debuffAura(p.clone().setY(0), VIO(THREE));
        for (let m = 0; m < 6; m++) fx.after(m * 0.18, () => fx.vfx.add.spawn({ pos: p.clone(), vel: c.clone().sub(p).multiplyScalar(1.8), color: m % 2 ? GOLD(THREE) : VIO(THREE), life: 0.5, size: 0.14, size1: 0.02, kind: 1, streak: 1.2, floor: false }));
      });
      leanTo(ctx, t, c, 0.22, dur - 0.5);
    });
    // implosion: gold-white ring flash + floor shock
    fx.after(dur, () => {
      implode(ctx, c, 2.4);
      fx.screenFlash(GOLD(THREE), 0.08);
      fx.vfx.rings.spawn({ pos: c.clone(), color: HOT(THREE), r0: 0.3, r1: 6.5, thick: 0.25, life: 0.55, kind: 0, face: true });
      fx.vfx.rings.spawn({ pos: c.clone().setY(0.08), color: GOLD(THREE), r0: 0.5, r1: 7.5, thick: 0.2, life: 0.7, kind: 0 });
      fx.explosion(c, GOLD(THREE), 0.8);
      fx.shake(0.55);
    });
  },
  deploy(ctx) {
    // blink-in: a point of black opens on the plate, gold rings contract into it, the unit grows out of it
    const { fx, THREE, src } = ctx;
    const prime = (src.unit?.rank ?? 0) >= 5, p = src.pos('hole'), base = new THREE.Vector3(src.x, 0.06, src.z);
    const col = prime ? CYAN(THREE) : GOLD(THREE);
    for (let i = 0; i < 4; i++) fx.after(i * 0.08, () => fx.vfx.rings.spawn({ pos: p.clone(), color: col, r0: 2.6 - i * 0.4, r1: 0.1, thick: 0.08, life: 0.35, kind: 0, face: true }));
    fx.after(0.3, () => {
      fx.darkCore(p, 1.6, 0.5, DARK(THREE), 0.95);
      fx.vfx.rings.spawn({ pos: base, color: col, r0: 0.3, r1: 2.2, thick: 0.12, life: 0.5, kind: 2 });
      fx.vfx.add.spawn({ pos: p.clone(), color: col, life: 0.18, size: 2.0, size1: 0.1, kind: 4 });
      fx.light(p, col, 8, 0.4);
    });
    if (prime) fx.after(0.4, () => { fx.screenFlash(CYAN(THREE), 0.08); fx.shake(0.35); });
  },
};

// ---------- VECTOR PRIME: Cataclysm ----------
function cataclysm(ctx, live) {
  const { fx, THREE, src } = ctx;
  const c = centroid(ctx, live, 6.0), dur = 2.3, hole = src.pos('hole');
  const cy = CYAN(THREE), vi = VIO(THREE);
  fx.dim(0.8, dur + 0.4);
  fx.slowmo(0.6, 0.6);
  // 1. a giant V of Protocol light is drawn over the enemy board (facing the camera), then folds down into the hole
  const H = 5.0, W = 3.2, base = c.clone().setY(c.y - 2.8);
  const tips = [new THREE.Vector3(c.x - W, c.y + H * 0.55, c.z), new THREE.Vector3(c.x + W, c.y + H * 0.55, c.z)];
  const inner = [new THREE.Vector3(c.x - W * 0.45, c.y + H * 0.55, c.z), new THREE.Vector3(c.x + W * 0.45, c.y + H * 0.55, c.z)];
  const mid = new THREE.Vector3(c.x, c.y + 0.2, c.z);
  fx.vfx.beams.spawn({ a: hole, b: c, color: cy, width: 0.5, width1: 0.15, core: 0.6, life: 0.35, taper: 1 });
  [[tips[0], base], [tips[1], base], [inner[0], mid], [inner[1], mid]].forEach(([a, b], i) => fx.after(0.05 + (i % 2) * 0.08 + (i >> 1) * 0.2, () => {
    fx.vfx.beams.spawn({ a, b, color: i < 2 ? cy : WHITE(THREE), width: i < 2 ? 0.6 : 0.16, width1: i < 2 ? 0.45 : 0.12, core: 0.7, life: i < 2 ? 1.4 : 1.1, hold: 0.75, jitter: 0.02,
      fn: (bm, k) => { if (k > 0.65) { const f = (k - 0.65) / 0.35; bm.a.lerp(c, f * 0.2); bm.b.lerp(c, f * 0.2); } } });
    fx.vfx.add.spawn({ pos: a.clone(), color: WHITE(THREE), life: 0.3, size: 1.2, size1: 0.1, kind: 4 });
  }));
  fx.after(0.12, () => fx.shake(0.45));
  // 2. the hole opens under the V: cyan disc that burns violet as it is swallowed
  fx.after(0.35, () => {
    fx.screenFlash(cy, 0.1);
    fx.vfx.rings.spawn({ pos: c.clone(), color: WHITE(THREE), r0: 0.3, r1: 5.0, thick: 0.18, life: 0.35, kind: 0, face: true });
    fx.light(c, cy, 14, dur - 0.3);
    accretion(ctx, c, 3.2, dur - 0.45, cy, vi, 18);
    blackHole(ctx, c, 3.6, dur - 0.3, C(THREE, 0.4, 1.8, 2.4), C(THREE, 0.9, 0.25, 1.8));
    for (let i = 0; i < 16; i++) fx.after(i * (dur - 0.45) / 16, () => {
      const g = Math.min(1, (i + 1) / 3);
      fx.darkCore(c, (3.0 + 0.3 * Math.sin(i * 1.9)) * g, 0.3, DARK(THREE), 0.98);
      fx.vfx.rings.spawn({ pos: c.clone(), color: i % 2 ? vi : cy, r0: 1.75 * g, r1: 1.6 * g, thick: 0.08, life: 0.3, kind: 0, face: true });
      if (i % 3 === 0) fx.vfx.rings.spawn({ pos: c.clone(), color: cy, r0: 5.5, r1: 1.5, thick: 0.06, life: 0.45, kind: 0, face: true });
      // the arena's own light streaming into it from far away
      for (let m = 0; m < 5; m++) {
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 3;
        const p = c.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.4) * 3, Math.sin(a) * r * 0.6));
        fx.vfx.add.spawn({ pos: p, vel: c.clone().sub(p).multiplyScalar(2.2), color: m % 2 ? cy : vi, life: 0.45, size: 0.16, size1: 0.02, kind: 1, streak: 1.4, floor: false });
      }
    });
  });
  // 3. hex locks stamp every enemy (stun), tethers, lean in hard
  live.forEach((t, j) => {
    const p = t.pos('core'), floor = new THREE.Vector3(t.x, 0.07, t.z);
    fx.after(0.45 + j * 0.06, () => {
      fx.vfx.rings.spawn({ pos: floor, color: cy, r0: 0.4, r1: 1.6, thick: 0.16, life: 0.5, kind: 2 });
      fx.vfx.rings.spawn({ pos: floor.clone(), color: cy, r0: 1.5, r1: 1.5, thick: 0.08, life: dur - 0.6, kind: 2, hold: 0.85 });
      fx.vfx.beams.spawn({ a: p, b: c, color: j % 2 ? vi : cy, width: 0.16, width1: 0.03, core: 0.5, life: dur - 0.7, jitter: 0.08, hold: 0.8 });
      fx.sparks(p, cy, 12, 4);
    });
    leanTo(ctx, t, c, 0.3, dur - 0.6);
  });
  // 4. collapse: everything folds into the point, a beat of black, then the white-cyan shockwave sweeps the board
  fx.after(dur - 0.15, () => {
    fx.darkCore(c, 4.2, 0.25, DARK(THREE), 1);
    for (let i = 0; i < 4; i++) fx.vfx.rings.spawn({ pos: c.clone(), color: i % 2 ? vi : cy, r0: 5 - i, r1: 0.1, thick: 0.12, life: 0.15, kind: 0, face: true });
  });
  fx.after(dur + 0.05, () => {
    implode(ctx, c, 3.0, true);
    fx.screenFlash(cy, 0.1);
    fx.shake(0.9);
    fx.vfx.rings.spawn({ pos: c.clone(), color: WHITE(THREE), r0: 0.3, r1: 9, thick: 0.35, life: 0.6, kind: 0, face: true });
    fx.vfx.rings.spawn({ pos: c.clone().setY(0.1), color: cy, r0: 0.5, r1: 13, thick: 0.3, life: 0.9, kind: 0 });
    fx.vfx.rings.spawn({ pos: c.clone().setY(0.08), color: vi, r0: 0.5, r1: 10, thick: 0.4, life: 1.1, kind: 2 });
    fx.explosion(c, cy, 1.1);
    for (const t of live) fx.after(0.08 + Math.abs(t.x - c.x) * 0.03, () => { fx.sparks(t.pos('core'), WHITE(THREE), 16, 6); fx.impact(t.pos('core'), cy, 1.4); });
  });
}
