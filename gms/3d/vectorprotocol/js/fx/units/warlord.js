// WARLORD signature FX (sculptor-9). Also drives boss REDLINE (same model id).
// Chainblade = a ragged red-orange cleave across the target, a fan of chain sparks spraying off the teeth, scrap debris,
// a splash ring down the lane; hits grind (three spark bursts). Blood Money (heal) = gold coins sucked up into the warlord.
// FRENZY (overdrive) = a red-orange vortex of rotating blade arcs around the warlord, sparks and debris flung tangentially,
// every adjacent target takes two grinding cleaves (one per spin, synced to the anim's impact frames via shot()).
const rnd = (a, b) => a + Math.random() * (b - a);
const SEC = { rogue: 'orange', corporate: 'cyan', experimental: 'purple' };
function axes(ctx, a, b) {
  const { THREE } = ctx;
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, dir);
  return { dir, up, side };
}
// ragged crescent (chain-torn): centre c, chord axis u, bulge axis v, radius R
function ragged(ctx, c, u, v, R, { span = 2.2, n = 10, color, width = 0.42, life = 0.22, jag = 0.12, core = 0.35 } = {}) {
  const { fx } = ctx, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = -span / 2 + span * i / n, j = i % 2 ? jag : -jag * 0.5;
    pts.push(c.clone().addScaledVector(u, Math.sin(t) * R).addScaledVector(v, Math.cos(t) * R * 0.42 + j));
  }
  for (let i = 0; i < n; i++) {
    const m = 1 - Math.abs((i + 0.5) / n - 0.5) * 2;
    fx.vfx.beams.spawn({ a: pts[i], b: pts[i + 1], color, width: width * (0.25 + 0.75 * m), width1: width * 0.1 * m, core, life, taper: 0.02 });
  }
  return pts;
}
// chain sparks: a hot fan along `d` (streaks), some chunks of scrap
function chainSpray(ctx, p, d, col, n = 26, k = 1) {
  const { fx, THREE, palette } = ctx;
  for (let i = 0; i < n; i++) {
    const v = d.clone().multiplyScalar(rnd(4, 9) * k).add(new THREE.Vector3(rnd(-2, 2), rnd(0.5, 4), rnd(-2, 2)));
    fx.vfx.add.spawn({ pos: p.clone(), vel: v, color: i % 4 ? col : palette.white, life: rnd(0.2, 0.5), size: 0.09, size1: 0.02, kind: 1, streak: 0.06, grav: 9, drag: 0.5, floor: true });
  }
  for (let i = 0; i < Math.round(n / 6); i++) {
    fx.vfx.alpha.spawn({ pos: p.clone(), vel: d.clone().multiplyScalar(rnd(2, 4)).add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(1, 4), rnd(-1.5, 1.5))), color: new THREE.Color(0.08, 0.06, 0.05), life: rnd(0.5, 0.9), size: rnd(0.08, 0.14), kind: 3, grav: 12, drag: 0.2, floor: true });
  }
}
function grind(ctx, p, col, k = 1) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < 3; i++) fx.after(i * 0.07, () => {
    fx.sparks(p.clone().add(new THREE.Vector3(rnd(-0.2, 0.2), rnd(-0.2, 0.2), rnd(-0.2, 0.2))), col, Math.round(8 * k), 6, 1.4);
    fx.light(p, col, 14 * k, 0.07);
  });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, palette } = ctx;
    if (!target) return 'default';
    const col = palette[SEC[src.faction]] || palette.orange;
    const p = target.pos('core'), s = src.pos('core');
    const { dir, up, side } = axes(ctx, s, p);
    // diagonal cleave high-right to low-left across the target, torn edges
    const u = side.clone().multiplyScalar(-0.8).addScaledVector(up, 0.6).normalize();
    const c = p.clone().addScaledVector(dir, -0.3);
    const rk = src.unit?.rank ?? 3;
    ragged(ctx, c, u, dir, 1.3 + 0.06 * rk, { color: palette.red, width: 0.6, life: 0.26 });
    ragged(ctx, c.clone().addScaledVector(dir, 0.05), u, dir, 1.24 + 0.06 * rk, { color: col, width: 0.3, life: 0.2, core: 0.6, jag: 0.08 });
    ragged(ctx, c.clone().addScaledVector(dir, 0.08), u, dir, 1.2 + 0.06 * rk, { color: palette.white, width: 0.08, life: 0.12, core: 0.8, jag: 0.04 });
    // the chain throws a fan of sparks away from the cut
    chainSpray(ctx, p.clone().addScaledVector(dir, -0.4), u.clone().negate().addScaledVector(dir, 0.3).normalize(), col, 30);
    fx.light(p, col, 34, 0.18);
    fx.shake(0.18);
    // Chainblade splashes the lane: a torn ring and sparks on the others
    fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: col, r0: 0.4, r1: 2.0, thick: 0.12, life: 0.4 });
    for (const t of ctx.targets || []) if (t && t !== target) fx.after(0.08, () => fx.sparks(t.pos('core'), col, 8, 4));
  },
  impact(ctx) {
    const { fx, target, palette, hit, src } = ctx;
    const col = palette[SEC[src.faction]] || palette.orange;
    const p = target.pos('core');
    fx.impact(p, col, hit?.crit ? 1.5 : 1);
    grind(ctx, p, col, hit?.crit ? 1.6 : 1);
    if (hit?.crit) { fx.star(p, palette.white, 2, 0.18); fx.shake(0.3); }
  },
  // Blood Money / Frenzy heal: a burst of gold "coins" that streams up into the warlord, red-gold ring
  heal(ctx) {
    const { fx, THREE, src, palette } = ctx;
    const c = src.pos('core'), base = new THREE.Vector3(src.x, 0.1, src.z);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1.2, 2.4);
      const p = base.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(0, 0.6), Math.sin(a) * r));
      const v = c.clone().sub(p).multiplyScalar(rnd(1.6, 2.4));
      fx.after(i * 0.02, () => fx.vfx.add.spawn({ pos: p, vel: v, color: i % 3 ? palette.gold : palette.red, life: 0.45, size: 0.16, size1: 0.05, kind: i % 2 ? 0 : 1, streak: 0.04, drag: 0.4, floor: false }));
    }
    fx.vfx.rings.spawn({ pos: base.clone().setY(0.06), color: palette.red, r0: 2.4, r1: 0.6, thick: 0.12, life: 0.5 });
    fx.after(0.4, () => { fx.buffAura(base, palette.gold); fx.star(c, palette.gold, 1.8, 0.2); });
  },
  // overdrive anim frames: index 0 = cast (revving), 1/2 = the two spin cleaves (impact frames)
  shot(ctx) {
    const { fx, THREE, src, shot, palette } = ctx;
    if (shot.phase !== 'overdrive') return;
    const col = palette[SEC[src.faction]] || palette.orange;
    const base = new THREE.Vector3(src.x, 0, src.z), k = Math.max(0.7, src.height / 4.3);
    if (shot.index === 0) {
      // revving: teeth throw sparks, an ember ring tightens on the plate
      fx.vfx.rings.spawn({ pos: base.clone().setY(0.06), color: col, r0: 2.6 * k, r1: 0.9 * k, thick: 0.1, life: 0.45 });
      fx.sparks(src.pos('hand'), col, 14, 5);
      return;
    }
    fx.vfx.rings.spawn({ pos: base.clone().setY(0.07), color: shot.index === 1 ? palette.red : col, r0: 0.8 * k, r1: 3.4 * k, thick: 0.07, life: 0.4 });
    fx.shake(0.32);
    for (const t of ctx.targets || []) if (t?.alive !== false) {
      const p = t.pos('core'), { dir, up, side } = axes(ctx, base, p);
      const u = side.clone().multiplyScalar(shot.index === 1 ? 1 : -1).addScaledVector(up, 0.25).normalize();
      ragged(ctx, p.clone().addScaledVector(dir, -0.3), u, dir, 1.4 * k, { color: palette.red, width: 0.55, life: 0.24 });
      ragged(ctx, p.clone().addScaledVector(dir, -0.25), u, dir, 1.32 * k, { color: col, width: 0.24, life: 0.18, core: 0.65 });
      chainSpray(ctx, p, side.clone().multiplyScalar(shot.index === 1 ? -1 : 1), col, 18);
      fx.impact(p, col, 1.3);
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, palette } = ctx;
    const col = palette[SEC[src.faction]] || palette.orange;
    const k = Math.max(0.7, src.height / 4.3);
    const base = new THREE.Vector3(src.x, 0, src.z);
    fx.shake(0.7);
    fx.light(base.clone().setY(1.5 * k), col, 30, 0.5);
    // the vortex: three tilted rings of blade arcs whirling around the warlord (rotating beam segments)
    const rings = [[0.6, 2.3, 7, palette.red, 0.55], [1.4, 2.0, -6, col, 0.42], [2.2, 1.6, 8, palette.red, 0.3]];
    for (const [h, R, w, c, wd] of rings) {
      const N = 7, cen = base.clone().setY(h * k);
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, da = 0.55;
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        fx.vfx.beams.spawn({ a, b, color: c, width: wd, width1: wd * 0.15, core: 0.4, life: 1.15, taper: 0.03, hold: 0.5,
          fn: (bm, kk) => {
            const ang = a0 + kk * w, rr = R * k * (0.75 + 0.35 * kk), y = cen.y + Math.sin(ang * 2) * 0.12;
            bm.a.set(cen.x + Math.cos(ang) * rr, y, cen.z + Math.sin(ang) * rr);
            bm.b.set(cen.x + Math.cos(ang + da) * rr, y + 0.1, cen.z + Math.sin(ang + da) * rr);
          } });
      }
    }
    // sparks + scrap flung tangentially, embers rising in the eye of the storm
    for (let i = 0; i < 70; i++) fx.after(i * 0.012, () => {
      const a = Math.random() * Math.PI * 2, r = rnd(0.6, 1.6) * k, h = rnd(0.3, 2.4) * k;
      const p = base.clone().add(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r));
      const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(-rnd(6, 11)).add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rnd(1, 3)));
      fx.vfx.add.spawn({ pos: p, vel: tan.setY(rnd(-0.5, 2)), color: i % 3 ? col : palette.red, life: rnd(0.25, 0.5), size: 0.1, size1: 0.02, kind: 1, streak: 0.07, drag: 0.4, grav: 2, floor: true });
      if (i % 5 === 0) fx.vfx.alpha.spawn({ pos: p, vel: tan.multiplyScalar(0.5), color: new THREE.Color(0.07, 0.05, 0.04), life: 0.8, size: 0.12, kind: 3, grav: 10, floor: true });
      if (i % 4 === 0) fx.vfx.add.spawn({ pos: base.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), 0.2, rnd(-0.5, 0.5))), vel: new THREE.Vector3(rnd(-0.3, 0.3), rnd(2, 4), rnd(-0.3, 0.3)), color: col, life: 0.9, size: 0.2, size1: 0.03, kind: 0, floor: false });
    });
    // scorched floor: hot rings that linger
    fx.vfx.rings.spawn({ pos: base.clone().setY(0.05), color: palette.red, r0: 1.0 * k, r1: 3.0 * k, thick: 0.06, life: 1.0, hold: 0.5 });
    fx.vfx.rings.spawn({ pos: base.clone().setY(0.055), color: col, r0: 2.4 * k, r1: 2.6 * k, thick: 0.04, life: 1.2, hold: 0.6, kind: 2 });
    for (const t of ctx.targets || []) if (t) fx.after(0.12, () => fx.debuffAura(new THREE.Vector3(t.x, 0, t.z), palette.red));
  },
};
