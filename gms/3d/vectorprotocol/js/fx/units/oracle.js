// ORACLE signature FX (sculptor-6).
// Null Orb = the thrown orb (from whichever palm threw it) flies as a violet sphere with a white core and two motes spiralling
// round its path; on the hit it IMPLODES: rings collapse inward, motes are sucked in, then a sharp white pop.
// Orb Cascade (overdrive) = two swollen orbs arc over the enemy half, spiral round each other, split into one orb per enemy
// and dive; each detonates as a violet implosion and the floor under the target cracks with violet light.
const rnd = (a, b) => a + Math.random() * (b - a);
const k0 = (i) => i;

function implode(fx, THREE, p, col, white, k = 1) {
  const R = fx.vfx.rings;
  R.spawn({ pos: p, color: col, r0: 1.3 * k, r1: 0.05, thick: 0.14, life: 0.28, face: true });
  R.spawn({ pos: p, color: col, r0: 0.9 * k, r1: 0.05, thick: 0.08, life: 0.22, face: true, kind: 2 });
  for (let i = 0; i < 14 * k; i++) {
    const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.7, 1), rnd(-1, 1)).normalize();
    fx.vfx.add.spawn({ pos: p.clone().addScaledVector(d, 1.1 * k), vel: d.multiplyScalar(-4.2 * k), color: col, life: 0.26, size: 0.1, size1: 0.02, kind: 1, streak: 0.06, floor: false });
  }
  fx.after(0.24, () => {
    fx.star(p, white, 1.9 * k, 0.16);
    fx.vfx.add.spawn({ pos: p, color: col, life: 0.3, size: 0.5 * k, size1: 1.7 * k, kind: 0, floor: false, alpha: 0.8 });
    R.spawn({ pos: p, color: white, r0: 0.1, r1: 0.9 * k, thick: 0.06, life: 0.2, face: true });
    fx.light(p, col, 16, 0.2);
  });
}

// a glowing sphere along a custom path fn(k) -> Vector3 over `dur`, with a tail and spiralling motes
function orbFlight(fx, THREE, path, dur, col, white, size = 0.38, spiral = 0.22) {
  const V = fx.vfx, p = path(0).clone(), q = new THREE.Vector3();
  const head = V.add.spawn({ pos: p, color: col, life: dur + 0.02, size, kind: 0, floor: false });
  const core = V.add.spawn({ pos: p, color: white, life: dur + 0.02, size: size * 0.45, kind: 0, floor: false });
  const halo = V.add.spawn({ pos: p, color: col, life: dur + 0.02, size: size * 2.6, kind: 0, floor: false, alpha: 0.3 });
  V.beams.spawn({ a: p, b: p, color: col, width: size * 0.55, width1: size * 0.4, core: 0.3, life: dur, taper: 0.5, hold: 0.95,
    fn: (bm, k) => {
      q.copy(path(Math.max(0, k - 0.12)));
      p.copy(path(k));
      for (const h of [head, core, halo]) { h.x = p.x; h.y = p.y; h.z = p.z; h.t = 0; }
      bm.a.copy(q); bm.b.copy(p);
      for (let s = 0; s < 2; s++) {
        const a = k * 26 + s * Math.PI;
        V.add.spawn({ pos: { x: p.x + Math.cos(a) * spiral, y: p.y + Math.sin(a) * spiral, z: p.z + Math.sin(a) * spiral * 0.6 }, color: s ? white : col, life: 0.22, size: 0.07, size1: 0.01, kind: 0, floor: false });
      }
    } });
}

function cracks(fx, THREE, x, z, col) {
  const n = 6;
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), px = x, pz = z;
    const segs = 3;
    for (let s = 0; s < segs; s++) {
      const len = rnd(0.35, 0.6) * (1 - s * 0.2);
      a += rnd(-0.5, 0.5);
      const nx = px + Math.cos(a) * len, nz = pz + Math.sin(a) * len;
      fx.vfx.beams.spawn({ a: new THREE.Vector3(px, 0.05, pz), b: new THREE.Vector3(nx, 0.05, nz), color: col, width: 0.09 * (1 - s * 0.25), width1: 0.04, core: 0.5, life: 1.3, taper: 0.1, hold: 0.55 });
      px = nx; pz = nz;
    }
  }
  fx.vfx.rings.spawn({ pos: new THREE.Vector3(x, 0.06, z), color: col, r0: 0.3, r1: 1.6, thick: 0.08, life: 0.9, kind: 2, hold: 0.3 });
}

let side = 0;
export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const s = src.unit?._oracleSide || (side++ % 2 ? 'L' : 'R');
    const a = src.pos(s === 'L' ? 'orbL' : 'orbR'), b = target.pos('core');
    const col = palette.faction, white = palette.white;
    fx.vfx.rings.spawn({ pos: a, color: col, r0: 0.7, r1: 0.1, thick: 0.12, life: 0.16, face: true });
    fx.light(a, col, 14, 0.14);
    const dur = Math.max(0.12, timing.travel);
    const up = new THREE.Vector3(0, 1, 0);
    orbFlight(fx, THREE, (k) => a.clone().lerp(b, k).addScaledVector(up, Math.sin(Math.PI * k) * 0.55), dur, col, white, 0.62, 0.26);
  },
  impact(ctx) {
    const { fx, THREE, target, palette, hit } = ctx;
    implode(fx, THREE, target.pos('core'), palette.faction, palette.white, hit?.crit ? 1.35 : 1);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = palette.faction, white = palette.white;
    const tg = targets.filter(Boolean);
    if (!tg.length) return 'default';
    const c = new THREE.Vector3();
    for (const t of tg) c.add(new THREE.Vector3(t.x, 0, t.z));
    c.multiplyScalar(1 / tg.length);
    const apex = c.clone().setY(4.2);
    const start = [src.pos('orbL'), src.pos('orbR')];
    fx.screenFlash(col, 0.05);
    fx.light(src.pos('core'), col, 40, 0.4);
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: col, r0: 0.4, r1: 3.2, thick: 0.1, life: 0.6, kind: 2 });
    // 1) two swollen orbs arc up and over to the apex (0.55 s)
    const T1 = 0.5, T2 = 0.6;
    start.forEach((a, i) => {
      const mid = a.clone().lerp(apex, 0.5).setY(apex.y + 1.2);
      orbFlight(fx, THREE, (k) => {
        const u = 1 - k;
        return new THREE.Vector3().addScaledVector(a, u * u).addScaledVector(mid, 2 * u * k).addScaledVector(apex.clone().add(new THREE.Vector3(i ? -0.6 : 0.6, 0, 0)), k * k);
      }, T1, col, white, 1.7, 0.45);
    });
    // 2) they spiral round each other over the enemy board, tightening (0.5 s)
    fx.after(T1, () => {
      for (let i = 0; i < 2; i++) orbFlight(fx, THREE, (k) => {
        const a = i * Math.PI + k * Math.PI * 4, r = 1.4 * (1 - k * 0.75);
        return apex.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(k * Math.PI) * 0.3, Math.sin(a) * r));
      }, T2, col, white, 2.0 + 0.4 * k0(i), 0.5);
      fx.vfx.rings.spawn({ pos: apex, color: col, r0: 0.4, r1: 2.6, thick: 0.05, life: T2, face: true });
      // a void vortex on the floor under the enemy squad, drawing inward
      for (let j = 0; j < 3; j++) fx.after(j * 0.15, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(c.x, 0.06, c.z), color: col, r0: 5 - j * 0.6, r1: 0.6, thick: 0.03, life: 0.6, kind: 2 }));
      for (let j = 0; j < 40; j++) { const a = Math.random() * 6.283, r = rnd(2.5, 5); fx.vfx.add.spawn({ pos: new THREE.Vector3(c.x + Math.cos(a) * r, rnd(0.1, 0.6), c.z + Math.sin(a) * r), vel: new THREE.Vector3(-Math.cos(a) * r * 1.5, rnd(0.5, 3), -Math.sin(a) * r * 1.5), color: col, life: 0.6, size: 0.08, kind: 1, streak: 0.1, floor: false, drag: 0.5 }); }
    });
    // 3) split: one orb per enemy dives and implodes; floor tiles crack
    fx.after(T1 + T2, () => {
      fx.star(apex, white, 3, 0.2);
      fx.light(apex, col, 50, 0.3);
      tg.forEach((t, i) => {
        const end = t.pos('core'), dur = 0.22 + i * 0.04;
        orbFlight(fx, THREE, (k) => apex.clone().lerp(end, k * k), dur, col, white, 1.0, 0.2);
        fx.after(dur, () => {
          implode(fx, THREE, t.pos('core'), col, white, 1.5);
          cracks(fx, THREE, t.x, t.z, col);
          fx.debuffAura(new THREE.Vector3(t.x, 0, t.z), col);
          if (i === 0) fx.shake(0.5);
        });
      });
    });
  },
};
