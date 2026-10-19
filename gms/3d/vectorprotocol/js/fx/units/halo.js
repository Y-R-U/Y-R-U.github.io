// HALO signature FX (sculptor-2).
// Null Pulse = a hex ring snaps open at the palm orb, a violet pulse with trailing time-rings flies to the target,
// the hit freezes for a beat: a stasis shell (camera-facing hex rings) + inward-drawn motes.
// Stasis Bubble (overdrive) = a violet shockwave sphere leaves HALO, then a big hex bubble inflates over every ally,
// cleansed debuffs pop out as white sparks, regen motes rise inside.
const rnd = (a, b) => a + Math.random() * (b - a);

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core');
    const col = palette.faction;
    fx.vfx.rings.spawn({ pos: a, color: col, r0: 0.1, r1: 0.75, thick: 0.18, life: 0.22, face: true, kind: 2 });
    fx.vfx.rings.spawn({ pos: a, color: palette.white, r0: 0.05, r1: 0.4, thick: 0.1, life: 0.14, face: true });
    fx.light(a, col, 16, 0.14);
    const dur = Math.max(0.12, timing.travel);
    fx.bolt(a, b, col, dur, { size: 0.42, arc: 0.25, trail: 1.3 });
    // time-rings left behind along the flight path
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1);
      fx.after(dur * k, () => fx.vfx.rings.spawn({ pos: a.clone().lerp(b, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 0.25, 0)), color: col, r0: 0.25, r1: 0.45, thick: 0.06, life: 0.35, face: true }));
    }
  },
  impact(ctx) {
    const { fx, THREE, target, palette, hit } = ctx;
    const p = target.pos('core'), col = palette.faction;
    fx.impact(p, col, hit?.crit ? 1.4 : 0.95);
    // stasis shell: a held hex ring + motes drawn inward (time stops for a beat)
    fx.vfx.rings.spawn({ pos: p, color: col, r0: 0.9, r1: 0.7, thick: 0.08, life: 0.5, face: true, kind: 2, hold: 0.5 });
    fx.vfx.rings.spawn({ pos: p, color: palette.white, r0: 0.2, r1: 1.0, thick: 0.05, life: 0.25, face: true });
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize();
      fx.vfx.add.spawn({ pos: p.clone().addScaledVector(d, 0.9), vel: d.multiplyScalar(-2.2), color: col, life: 0.35, size: 0.09, size1: 0.02, kind: 0, floor: false, drag: 0.5 });
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = palette.faction, c = src.pos('core');
    // the wave: a sphere of light leaving HALO + floor hex ring sweeping the player half
    fx.screenFlash(col, 0.14);
    fx.light(c, col, 50, 0.5);
    fx.vfx.rings.spawn({ pos: c, color: col, r0: 0.4, r1: 7, thick: 0.12, life: 0.7, face: true });
    fx.vfx.rings.spawn({ pos: c, color: palette.white, r0: 0.3, r1: 4.5, thick: 0.05, life: 0.45, face: true });
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: col, r0: 0.5, r1: 9, thick: 0.1, life: 0.9, kind: 2 });
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize();
      fx.vfx.add.spawn({ pos: c, vel: d.multiplyScalar(rnd(4, 8)), color: i % 4 ? col : palette.white, life: rnd(0.3, 0.6), size: 0.1, kind: 1, streak: 0.08, drag: 1.5, floor: false });
    }
    // a bubble inflates over every ally as the wave reaches it
    const allies = (targets.length ? targets : [src]).filter(Boolean);
    for (const t of allies) {
      const d = Math.hypot(t.x - src.x, t.z - src.z), delay = Math.min(0.5, d / 14);
      fx.after(delay, () => {
        const h = t.height || 3;
        const bub = fx.shieldBubble({ follow: t.root, offsetY: h * 0.5, radius: h * 0.5, color: col, life: 2.6, alpha: 0.85 });
        bub.grow = 0.35;
        const p = t.pos('core');
        fx.vfx.rings.spawn({ pos: new THREE.Vector3(t.x, 0.06, t.z), color: col, r0: 0.3, r1: h * 0.55, thick: 0.1, life: 0.6, kind: 2, hold: 0.3 });
        // cleanse: debuffs pop out as white-violet sparks
        fx.after(0.3, () => { fx.sparks(p, palette.white, 12, 5, 1.5); fx.vfx.rings.spawn({ pos: p, color: palette.white, r0: 0.3, r1: 1.2, thick: 0.05, life: 0.25, face: true }); });
        // regen: soft motes rising inside the bubble
        for (let i = 0; i < 10; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3(t.x + rnd(-0.6, 0.6), rnd(0.2, 0.8), t.z + rnd(-0.6, 0.6)), vel: new THREE.Vector3(0, rnd(0.6, 1.4), 0), color: i % 2 ? col : palette.green, life: rnd(0.8, 1.4), size: rnd(0.07, 0.13), kind: 0, floor: false, fadeIn: 0.2 });
      });
    }
  },
};
