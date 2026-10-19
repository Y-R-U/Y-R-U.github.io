// SERAPH signature FX (sculptor-14). Also THE CHOIR (boss_the_choir).
// Light Lance = three sound-rings chime off the lyre-bow, a white-cored lance of light (a short bright segment, not a bolt)
// streaks to the target leaving a fading violet rail; the javelin (attack_alt) leaves from the raised hand instead.
// Impact = the lance stakes the target: a vertical star, a ring of chimes and a few light-feathers that drift down.
// Choir of Lances (overdrive) = a gold halo opens high over SERAPH with a dozen lances standing on it, they tip over and rain
// diagonally onto every enemy, and each strike raises a gold-violet pillar of light with a hex ring on the floor.
const rnd = (a, b) => a + Math.random() * (b - a);

function gold(THREE) { return new THREE.Color(3.2, 2.0, 0.6); }
function lilac(THREE) { return new THREE.Color(2.2, 1.4, 3.4); }

// a lance: bright segment travelling a -> b over dur, white core + coloured sheath + faint rail behind
function lance(fx, THREE, a, b, dur, col, white, { len = 1.5, w = 0.22, rail = true } = {}) {
  const V = fx.vfx, dir = b.clone().sub(a), dist = dir.length(); dir.normalize();
  const head = new THREE.Vector3(), tail = new THREE.Vector3();
  const place = (bm, k) => {
    const d = Math.min(dist, k * (dist + len * 0.3));
    head.copy(a).addScaledVector(dir, d); tail.copy(a).addScaledVector(dir, Math.max(0, d - len));
    bm.a.copy(tail); bm.b.copy(head);
  };
  V.beams.spawn({ a, b: a, color: col, width: w, width1: w * 0.5, core: 0.4, life: dur, taper: 0.7, hold: 0.95, fn: place });
  V.beams.spawn({ a, b: a, color: white, width: w * 0.4, core: 0.9, life: dur, taper: 0.7, hold: 0.95, fn: place });
  if (rail) V.beams.spawn({ a, b, color: col, width: w * 0.25, core: 0.3, life: dur + 0.35, taper: 0.1, hold: 0.2,
    fn: (bm, k) => { bm.b.copy(a).addScaledVector(dir, Math.min(dist, (k * (dur + 0.35) / dur) * dist)); } });
}
function chime(fx, p, col, white, k = 1) {
  for (let i = 0; i < 3; i++) fx.after(i * 0.06, () => fx.vfx.rings.spawn({ pos: p, color: i === 1 ? white : col, r0: 0.1, r1: (0.45 + i * 0.22) * k, thick: 0.05, life: 0.3, face: true }));
}
function feathers(fx, THREE, p, col, n = 6) {
  for (let i = 0; i < n; i++) fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(0, 0.5), rnd(-0.4, 0.4))), vel: new THREE.Vector3(rnd(-0.5, 0.5), rnd(0.2, 0.8), rnd(-0.5, 0.5)),
    color: col, life: rnd(0.9, 1.5), size: rnd(0.08, 0.14), size1: 0.02, kind: 1, streak: 0.04, grav: -0.6, drag: 1.5, floor: true });
}
function pillar(fx, THREE, x, z, col, white, h = 7) {
  const g = new THREE.Vector3(x, 0.05, z), top = new THREE.Vector3(x, h, z);
  fx.vfx.beams.spawn({ a: g, b: top, color: col, width: 1.1, width1: 0.5, core: 0.25, life: 0.75, taper: 0.05, hold: 0.25 });
  fx.vfx.beams.spawn({ a: g, b: top, color: white, width: 0.3, core: 0.9, life: 0.5, taper: 0.05, hold: 0.2 });
  fx.vfx.rings.spawn({ pos: g, color: col, r0: 0.3, r1: 1.7, thick: 0.08, life: 0.8, kind: 2, hold: 0.25 });
  fx.vfx.rings.spawn({ pos: g, color: white, r0: 0.2, r1: 1.1, thick: 0.05, life: 0.45 });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const alt = src.unit?.state?.action === 'attack_alt';
    const a = alt ? src.pos('hand') : src.pos('muzzle'), b = target.pos('core');
    const col = palette.faction, white = palette.white;
    chime(fx, a, col, white, alt ? 1.2 : 1);
    fx.star(a, white, alt ? 1.6 : 1.1, 0.12);
    fx.light(a, col, 14, 0.15);
    lance(fx, THREE, a, b, Math.max(0.1, timing.travel), alt ? gold(THREE) : lilac(THREE), white, { len: alt ? 1.9 : 1.5, w: alt ? 0.28 : 0.22 });
  },
  impact(ctx) {
    const { fx, THREE, target, palette, hit } = ctx;
    const p = target.pos('core'), col = palette.faction, white = palette.white, k = hit?.crit ? 1.4 : 1;
    fx.impact(p, col, 0.8 * k);
    fx.vfx.beams.spawn({ a: p.clone().add(new THREE.Vector3(0, -0.6 * k, 0)), b: p.clone().add(new THREE.Vector3(0, 0.9 * k, 0)), color: white, width: 0.14, core: 0.9, life: 0.22, taper: 0.5 });
    fx.star(p, white, 1.5 * k, 0.14);
    chime(fx, p, col, white, 1.2 * k);
    feathers(fx, THREE, p, lilac(THREE), hit?.crit ? 10 : 5);
    if (hit?.crit) pillar(fx, THREE, target.x, target.z, gold(THREE), white, 4);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const tg = targets.filter(Boolean);
    if (!tg.length) return 'default';
    const col = palette.faction, white = palette.white, G = gold(THREE), Li = lilac(THREE);
    const s = src.pos('head');
    const C = new THREE.Vector3(src.x, (src.height || 3) * 1.45 + 0.6, src.z);
    fx.screenFlash(Li, 0.1);
    fx.light(C, G, 50, 0.6);
    // the halo opens over SERAPH
    fx.vfx.rings.spawn({ pos: C, color: G, r0: 0.4, r1: 2.2, thick: 0.1, life: 1.1, hold: 0.7 });
    fx.vfx.rings.spawn({ pos: C, color: white, r0: 0.3, r1: 1.9, thick: 0.04, life: 0.9, hold: 0.6 });
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: G, r0: 0.4, r1: 2.6, thick: 0.08, life: 0.9, kind: 2, hold: 0.3 });
    chime(fx, s, col, white, 2);
    // a dozen lances stand on the halo, pointing down
    const N = 12, R = 2.0, lances = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, p = C.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      lances.push(p);
      fx.after(i * 0.025, () => {
        fx.vfx.beams.spawn({ a: p.clone().add(new THREE.Vector3(0, 0.75, 0)), b: p.clone().add(new THREE.Vector3(0, -0.75, 0)), color: i % 2 ? G : Li, width: 0.22, core: 0.6, life: 0.45, taper: 0.6, hold: 0.8 });
        fx.star(p, white, 0.7, 0.1);
      });
    }
    // they rain diagonally onto every enemy (spread round-robin), each strike = a pillar of light
    const T0 = 0.42;
    lances.forEach((p, i) => {
      const t = tg[i % tg.length], delay = T0 + i * 0.045;
      fx.after(delay, () => {
        const end = t.pos('core').add(new THREE.Vector3(rnd(-0.35, 0.35), rnd(-0.3, 0.3), rnd(-0.35, 0.35)));
        const dur = 0.2;
        lance(fx, THREE, p, end, dur, i % 2 ? G : Li, white, { len: 1.8, w: 0.3, rail: false });
        fx.after(dur, () => {
          fx.star(end, white, 1.6, 0.14);
          fx.sparks(end, i % 2 ? G : Li, 6, 5, 1);
          if (i < tg.length) {
            pillar(fx, THREE, t.x, t.z, i % 2 ? Li : G, white, 8);
            fx.debuffAura(new THREE.Vector3(t.x, 0, t.z), col);
            feathers(fx, THREE, t.pos('core'), Li, 8);
          }
          if (i === 0) fx.shake(0.35);
        });
      });
    });
  },
  // Halo Choir (on kill: haste + charge): the halo rings out
  buff(ctx) {
    const { fx, src, palette } = ctx;
    const p = src.pos('head');
    chime(fx, p, palette.faction, palette.white, 1.4);
    fx.vfx.rings.spawn({ pos: p.clone().setY(p.y + 0.4), color: palette.gold, r0: 0.3, r1: 0.9, thick: 0.06, life: 0.5, hold: 0.3 });
  },
  // descends on a pillar of light, feathers falling round the plate
  deploy(ctx) {
    const { fx, THREE, src, palette } = ctx;
    const G = gold(THREE), white = palette.white;
    pillar(fx, THREE, src.x, src.z, G, white, 9);
    fx.after(0.55, () => {
      fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: palette.faction, r0: 0.3, r1: 2.0, thick: 0.1, life: 0.6, kind: 2 });
      feathers(fx, THREE, new THREE.Vector3(src.x, 2.5, src.z), lilac(THREE), 14);
    });
  },
};
