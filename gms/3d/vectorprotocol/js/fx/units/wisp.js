// WISP signature FX (sculptor-14).
// Wisp Spark = a wobbling white-violet spark with a sparkle tail; it pops on the target into a little cluster of motes.
// Tether (heal) = a sagging violet thread spins out to the ally, motes run along it and the ally glows from the core out.
// Flicker (overdrive) = the core flashes and bursts into a cloud of motes that streak, curving, into every ally's core;
// each ally's plate flares purple as they land.
const rnd = (a, b) => a + Math.random() * (b - a);

function lilac(THREE) { return new THREE.Color(2.6, 1.5, 3.6); }

// mote on a curved path a -> b (quadratic, bulging by `bulge`), with a short tail
function mote(fx, THREE, a, b, dur, col, { bulge = 0.8, size = 0.14, side = 1 } = {}) {
  const V = fx.vfx, mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(rnd(-0.5, 0.5) * bulge, bulge * rnd(0.6, 1.2), rnd(-0.5, 0.5) * bulge * side));
  const at = (k, out) => { const u = 1 - k; return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(mid, 2 * u * k).addScaledVector(b, k * k); };
  const p = a.clone(), q = a.clone();
  const h = V.add.spawn({ pos: p, color: col, life: dur + 0.02, size, kind: 0, floor: false });
  V.beams.spawn({ a: p, b: p, color: col, width: size * 0.6, width1: 0.01, core: 0.5, life: dur, taper: 0.9, hold: 0.95,
    fn: (bm, k) => { at(Math.max(0, k - 0.15), q); at(k, p); bm.a.copy(q); bm.b.copy(p); if (h) { h.x = p.x; h.y = p.y; h.z = p.z; h.t = 0; } } });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core'), col = lilac(THREE);
    fx.star(a, palette.white, 0.8, 0.1);
    fx.vfx.rings.spawn({ pos: a, color: col, r0: 0.05, r1: 0.4, thick: 0.08, life: 0.18, face: true });
    const dur = Math.max(0.1, timing.travel);
    mote(fx, THREE, a, b, dur, col, { bulge: 0.6, size: 0.22 });
    for (let i = 1; i <= 3; i++) fx.after(i * 0.03, () => mote(fx, THREE, src.pos('muzzle'), target.pos('core'), Math.max(0.08, dur - i * 0.03), palette.white, { bulge: 0.7, size: 0.07 }));
  },
  impact(ctx) {
    const { fx, THREE, target, palette, hit } = ctx;
    const p = target.pos('core'), col = lilac(THREE), k = hit?.crit ? 1.4 : 1;
    fx.star(p, palette.white, 1.1 * k, 0.12);
    fx.vfx.rings.spawn({ pos: p, color: col, r0: 0.1, r1: 0.7 * k, thick: 0.07, life: 0.22, face: true });
    for (let i = 0; i < 10 * k; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize();
      fx.vfx.add.spawn({ pos: p, vel: d.multiplyScalar(rnd(1.5, 3.5)), color: i % 3 ? col : palette.white, life: rnd(0.3, 0.6), size: rnd(0.06, 0.11), kind: 0, floor: false, drag: 2.5 });
    }
  },
  // Tether: a thread to the patient, motes running along it, a soft glow outward from their core
  heal(ctx) {
    const { fx, THREE, src, target, palette } = ctx;
    if (!target || !src) return 'default';
    const col = lilac(THREE), green = palette.green, self = target.id === src.id;
    const life = 0.9;
    if (!self) {
      const sag = new THREE.Vector3();
      fx.vfx.beams.spawn({ a: src.pos('core'), b: target.pos('core'), color: col, width: 0.09, core: 0.6, life, taper: 0.1, hold: 0.6,
        fn: (bm, k) => { bm.a.copy(src.pos('core')); bm.b.copy(target.pos('core')); } });
      for (let i = 0; i < 6; i++) fx.after(i * 0.08, () => mote(fx, THREE, src.pos('core'), target.pos('core'), 0.35, i % 2 ? col : green, { bulge: 0.25, size: 0.1 }));
      void sag;
    }
    fx.after(self ? 0 : 0.35, () => {
      const p = target.pos('core');
      fx.vfx.rings.spawn({ pos: p, color: col, r0: 0.2, r1: 1.0, thick: 0.06, life: 0.4, face: true });
      fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.06, target.z), color: green, r0: 0.3, r1: 1.2, thick: 0.08, life: 0.6, kind: 2 });
      for (let i = 0; i < 8; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(target.x + rnd(-0.5, 0.5), rnd(0.2, 1.2), target.z + rnd(-0.5, 0.5)), vel: new THREE.Vector3(0, rnd(0.6, 1.3), 0), color: i % 2 ? col : green, life: rnd(0.6, 1.0), size: rnd(0.06, 0.1), kind: 0, floor: false, fadeIn: 0.1 });
    });
  },
  // Flicker: burst into motes that stream into every ally
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = lilac(THREE), white = palette.white, c = src.pos('core');
    fx.star(c, white, 2.6, 0.2);
    fx.light(c, col, 40, 0.4);
    fx.vfx.rings.spawn({ pos: c, color: col, r0: 0.2, r1: 2.4, thick: 0.08, life: 0.45, face: true });
    for (let i = 0; i < 36; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize();
      fx.vfx.add.spawn({ pos: c, vel: d.multiplyScalar(rnd(2, 4.5)), color: i % 3 ? col : white, life: rnd(0.35, 0.6), size: rnd(0.07, 0.13), kind: 0, floor: false, drag: 3 });
    }
    const allies = (targets.length ? targets : [src]).filter(Boolean);
    allies.forEach((t, j) => {
      const n = 6;
      for (let i = 0; i < n; i++) fx.after(0.12 + i * 0.05 + j * 0.03, () => {
        const dur = 0.42 + rnd(0, 0.1);
        mote(fx, THREE, src.pos('core'), t.pos('core'), dur, i % 3 ? col : white, { bulge: 1.4, size: 0.16, side: i % 2 ? 1 : -1 });
        if (i === n - 1) fx.after(dur, () => {
          const g = new THREE.Vector3(t.x, 0.06, t.z);
          fx.vfx.rings.spawn({ pos: g, color: col, r0: 0.4, r1: 1.5, thick: 0.14, life: 0.6, kind: 2, hold: 0.25 });
          fx.vfx.rings.spawn({ pos: g, color: col, r0: 0.3, r1: 1.2, thick: 0.1, life: 0.5, kind: 1, alpha: 0.5 });
          fx.star(t.pos('core'), white, 1.4, 0.14);
          fx.light(t.pos('core'), col, 12, 0.25);
        });
      });
    });
  },
  // haste from Flicker: a quick purple plate flare instead of the generic gold aura (the overdrive already sold it)
  buff(ctx) {
    const { fx, THREE, target, palette } = ctx;
    if (!target) return;
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.06, target.z), color: palette.faction, r0: 1.0, r1: 1.3, thick: 0.06, life: 0.5 });
  },
};
