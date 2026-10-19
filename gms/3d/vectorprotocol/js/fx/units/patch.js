// PATCH signature FX (sculptor-6). Heals read at a glance: mint-green beams, rising plus-signs, sparkle rain.
// Mend Beam = a steady mint beam from the emitter to the lowest-HP ally with nanite motes streaming along it; a plus-sign
// pops at the emitter and three plus-signs float up off the patient inside a soft heal ring.
// Triage Field (overdrive) = a giant holo-cross flashes over PATCH, lances a beam to every ally, a wireframe dome of mint
// latitude rings rises over the squad, nanite sparkles rain down, plus-signs rise off everyone and cleansed debuffs pop as sparks.
const rnd = (a, b) => a + Math.random() * (b - a);

// a plus sign made of two short beams (the board's screen-horizontal axis is world x; vertical is foreshortened by the camera tilt)
function plus(fx, THREE, pos, col, { size = 0.22, life = 1.0, rise = 1.2, delay = 0 } = {}) {
  const go = () => {
    const p = pos.clone(), y0 = p.y;
    const mk = (dx, dy) => fx.vfx.beams.spawn({ a: p, b: p, color: col, width: size * 0.42, core: 0.55, life, taper: 0.02, hold: 0.55,
      fn: (bm, k) => {
        const y = y0 + rise * (1 - (1 - k) * (1 - k)), g = Math.min(1, k * 6);
        bm.a.set(p.x - dx * size * g, y - dy * size * 1.35 * g, p.z); bm.b.set(p.x + dx * size * g, y + dy * size * 1.35 * g, p.z);
      } });
    mk(1, 0); mk(0, 1);
  };
  delay > 0 ? fx.after(delay, go) : go();
}

const MINT = (THREE) => new THREE.Color(0.35, 3.0, 2.0);

function patient(fx, THREE, t, col, k = 1) {
  const g = new THREE.Vector3(t.x, 0.05, t.z), h = t.height || 2.5;
  fx.vfx.rings.spawn({ pos: g, color: col, r0: 0.4, r1: 1.2 * k, thick: 0.12, life: 0.8, kind: 1, alpha: 0.5 });
  fx.vfx.rings.spawn({ pos: g, color: col, r0: 1.1 * k, r1: 1.25 * k, thick: 0.08, life: 0.8, kind: 0, hold: 0.4 });
  for (let i = 0; i < 3; i++) plus(fx, THREE, new THREE.Vector3(t.x + rnd(-0.5, 0.5), h * rnd(0.45, 0.75), t.z + rnd(-0.3, 0.3)), col, { size: rnd(0.16, 0.24) * k, life: rnd(0.9, 1.2), rise: rnd(0.9, 1.4), delay: i * 0.12 });
  for (let i = 0; i < 10 * k; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(t.x + rnd(-0.6, 0.6), rnd(0.1, h * 0.8), t.z + rnd(-0.5, 0.5)), vel: new THREE.Vector3(0, rnd(0.8, 1.6), 0), color: col, life: rnd(0.6, 1.0), size: rnd(0.06, 0.12), kind: 0, floor: false, fadeIn: 0.1 });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), col = MINT(THREE);
    const life = Math.max(0.5, timing.travel + 0.5);
    plus(fx, THREE, a.clone().add(new THREE.Vector3(0, 0.25, 0)), col, { size: 0.14, life: 0.6, rise: 0.5 });
    fx.vfx.add.spawn({ pos: a, color: palette.white, life: 0.15, size: 0.5, size1: 0.2, kind: 0, floor: false });
    // live beam that follows both ends
    const b = target.pos('core');
    fx.vfx.beams.spawn({ a, b, color: col, width: 0.42, width1: 0.3, core: 0.35, life, taper: 0.06, hold: 0.7,
      fn: (bm) => { bm.a.copy(src.pos('muzzle')); bm.b.copy(target.pos('core')); } });
    fx.vfx.beams.spawn({ a, b, color: palette.white, width: 0.12, core: 0.8, life: life * 0.8, taper: 0.06, hold: 0.6,
      fn: (bm) => { bm.a.copy(src.pos('muzzle')); bm.b.copy(target.pos('core')); } });
    // nanite motes streaming along it
    const n = 12;
    for (let i = 0; i < n; i++) fx.after((i / n) * life * 0.8, () => {
      const p0 = src.pos('muzzle'), p1 = target.pos('core');
      fx.vfx.add.spawn({ pos: p0, vel: p1.clone().sub(p0).multiplyScalar(1 / 0.3), color: i % 3 ? col : palette.white, life: 0.3, size: 0.09, size1: 0.04, kind: 0, floor: false });
    });
    fx.after(Math.max(0.05, timing.travel), () => { patient(fx, THREE, target, col); fx.light(target.pos('core'), col, 14, 0.3); });
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = MINT(THREE), white = palette.white;
    const allies = (targets.length ? targets : [src]).filter(Boolean);
    const c = new THREE.Vector3();
    for (const t of allies) c.add(new THREE.Vector3(t.x, 0, t.z));
    c.multiplyScalar(1 / allies.length);
    let R = 2;
    for (const t of allies) R = Math.max(R, Math.hypot(t.x - c.x, t.z - c.z) + 1.0);
    R = Math.min(R, 5);
    const dim = col.clone().multiplyScalar(0.45);
    // giant holo-cross flash over PATCH
    const top = src.pos('head').add(new THREE.Vector3(0, 1.6, 0));
    plus(fx, THREE, top, col, { size: 0.9, life: 1.1, rise: 0.6 });
    fx.light(top, col, 45, 0.5);
    fx.screenFlash(col, 0.06);
    // lances to every ally
    allies.forEach((t, i) => fx.after(i * 0.05, () => {
      fx.vfx.beams.spawn({ a: top, b: t.pos('core'), color: col, width: 0.28, width1: 0.12, core: 0.4, life: 0.55, taper: 0.05, hold: 0.4 });
      fx.vfx.beams.spawn({ a: top, b: t.pos('core'), color: white, width: 0.08, core: 0.8, life: 0.35, taper: 0.05 });
    }));
    // the dome: floor ring + rising latitude rings shrinking toward the top (wireframe hemisphere)
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(c.x, 0.05, c.z), color: dim, r0: R * 0.2, r1: R, thick: 0.02, life: 1.6, kind: 1, alpha: 0.18, hold: 0.5 });
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(c.x, 0.06, c.z), color: col, r0: R * 0.95, r1: R * 1.02, thick: 0.02, life: 1.6, hold: 0.6, alpha: 0.7 });
    for (let i = 1; i <= 3; i++) {
      const lat = (i / 4) * Math.PI / 2, y = Math.sin(lat) * R * 0.7, r = Math.cos(lat) * R;
      fx.after(0.05 + i * 0.07, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(c.x, y, c.z), color: dim, r0: r * 0.9, r1: r, thick: 0.012, life: 1.2, hold: 0.5, alpha: 0.6 }));
    }
    fx.after(0.4, () => fx.star(new THREE.Vector3(c.x, R * 0.7, c.z), col, 2.4, 0.3));
    // nanite rain over the dome
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R;
      fx.after(rnd(0.2, 1.2), () => fx.vfx.add.spawn({ pos: new THREE.Vector3(c.x + Math.cos(a) * r, rnd(2.6, 4), c.z + Math.sin(a) * r), vel: new THREE.Vector3(0, -rnd(2, 3.5), 0),
        color: i % 4 ? col : white, life: rnd(0.8, 1.2), size: rnd(0.05, 0.1), kind: 1, streak: 0.1, floor: false, fadeIn: 0.15 }));
    }
    // per ally: heal ring, rising plus-signs, cleansed debuffs pop off as sparks
    allies.forEach((t, i) => fx.after(0.15 + i * 0.06, () => {
      patient(fx, THREE, t, col, 1.3);
      fx.after(0.35, () => { fx.sparks(t.pos('head'), white, 10, 4, 1.6); fx.vfx.rings.spawn({ pos: t.pos('core'), color: white, r0: 0.2, r1: 1.1, thick: 0.05, life: 0.25, face: true }); });
    }));
  },
};
