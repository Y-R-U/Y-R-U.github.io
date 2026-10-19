// AEGIS signature FX (sculptor-10). Hardlight = cyan hexagons, white cores, clean geometric snaps. Nothing lingers over a unit:
// every cell is small, rim-only and gone in well under a second, so the battle's own rim bubbles stay the shield read.
// Hardlight Bolt = a spinning hex cell flies from the palm that fired (model sets unit._aegisSide), leaving hex afterimages;
//   impact = the cell shatters into hex rings + white shards.
// Barrier Matrix (overdrive) = the disc (unit.aegisDisc, lifted overhead by the anim) throws a hex ring out flat, then beams
//   lance from it to every ally; on each ally a hex lattice snaps on (a ring of cells round the body + a scan rising up it).
const rnd = (a, b) => a + Math.random() * (b - a);
const CYAN = (T) => new T.Color(0.35, 2.4, 3.2);

function discPos(src, THREE, out) {
  const d = src.unit?.aegisDisc;
  if (d) { d.updateMatrixWorld(true); return d.getWorldPosition(out); }
  return out.copy(src.pos('head')).add(new THREE.Vector3(0, 1.4, 0));
}

function hexFlash(fx, pos, col, r = 0.35, life = 0.18) {
  fx.vfx.rings.spawn({ pos, color: col, r0: r * 0.3, r1: r, thick: 0.22, life, face: true, kind: 2 });
}

// a hex cell travelling a -> b over dur seconds, with a white core and dropped afterimages
function hexBolt(fx, THREE, a, b, col, white, dur) {
  a = a.clone(); b = b.clone();
  const p = a.clone();
  const core = fx.vfx.add.spawn({ pos: a, color: white, life: dur + 0.02, size: 0.22, kind: 0, floor: false });
  const glow = fx.vfx.add.spawn({ pos: a, color: col, life: dur + 0.02, size: 0.55, kind: 0, floor: false, alpha: 0.45 });
  const cell = fx.vfx.rings.spawn({ pos: a, color: col, r0: 0.2, r1: 0.2, thick: 0.28, life: dur + 0.02, face: true, kind: 2 });
  let drop = 0;
  fx.vfx.beams.spawn({ a, b: a, color: col, width: 0.18, width1: 0.02, core: 0.5, life: dur, taper: 0.5, hold: 0.95,
    fn: (bm, k) => {
      p.lerpVectors(a, b, k); p.y += Math.sin(Math.PI * k) * 0.15;
      core.x = glow.x = cell.x = p.x; core.y = glow.y = cell.y = p.y; core.z = glow.z = cell.z = p.z; core.t = glow.t = 0;
      cell.r0 = cell.r1 = 0.2 + 0.04 * Math.sin(k * 40);
      bm.b.copy(p); bm.a.lerpVectors(a, b, Math.max(0, k - 0.18));
      if (k - drop > 0.16) { drop = k; fx.vfx.rings.spawn({ pos: p, color: col, r0: 0.18, r1: 0.12, thick: 0.18, life: 0.2, face: true, kind: 2, alpha: 0.5 }); }
    } });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing, palette } = ctx;
    if (!target) return 'default';
    const col = CYAN(THREE), white = palette.white;
    const a = src.pos(src.unit?._aegisSide === 'L' ? 'muzzleL' : 'muzzle');
    fx.muzzle(a, col, 0.7);
    hexFlash(fx, a, col, 0.38, 0.2);
    fx.light(a, col, 10, 0.15);
    hexBolt(fx, THREE, a, target.pos('core'), col, white, Math.max(0.12, timing.travel));
  },
  impact(ctx) {
    const { fx, THREE, target, hit, palette } = ctx;
    if (!target) return 'default';
    const col = CYAN(THREE), white = palette.white, k = hit?.crit ? 1.4 : 1;
    const p = target.pos('core');
    fx.star(p, white, 1.2 * k, 0.12);
    hexFlash(fx, p, col, 0.65 * k, 0.22);
    hexFlash(fx, p, white, 0.3 * k, 0.12);
    // hex shards: short bright streaks flung out
    for (let i = 0; i < 10 * k; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 6));
      fx.vfx.add.spawn({ pos: p, vel: v, color: i % 3 ? col : white, life: rnd(0.2, 0.4), size: rnd(0.05, 0.09), kind: 1, streak: 0.08, drag: 2, grav: 6 });
    }
    fx.light(p, col, 12 * k, 0.15);
    if (hit?.crit) fx.shake(0.12);
  },
  // a shield AEGIS grants lands (Projector at wave start, Barrier Matrix): small hex cells snap round the ally + a floor hex
  shield(ctx) {
    const { fx, THREE, target, palette } = ctx;
    if (!target) return 'default';
    const col = CYAN(THREE), white = palette.white, c = target.pos('core'), h = target.height || 2.5, R = Math.max(0.6, h * 0.32);
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + Math.random();
      fx.after(j * 0.03, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(c.x + Math.cos(a) * R, c.y + Math.sin(a * 2) * R * 0.4, c.z + Math.sin(a) * R * 0.5),
        color: j % 2 ? col : white, r0: 0.06, r1: 0.18, thick: 0.25, life: 0.28, face: true, kind: 2, alpha: 0.6 }));
    }
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.06, target.z), color: col, r0: 0.3, r1: R * 1.2, thick: 0.05, life: 0.4, kind: 2 });
  },
  // AEGIS's bolt breaks a shield: the enemy's hardlight shatters into hex shards
  shieldBreak(ctx) {
    const { fx, THREE, target, palette } = ctx;
    if (!target) return 'default';
    const col = CYAN(THREE), p = target.pos('core');
    hexFlash(fx, p, palette.white, 0.9, 0.2);
    for (let i = 0; i < 14; i++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 7)),
      color: i % 2 ? col : palette.white, life: rnd(0.3, 0.5), size: rnd(0.06, 0.1), kind: 1, streak: 0.1, grav: 8, drag: 1.5 });
  },
  // fortify from Barrier Matrix: a hex plate lights under the ally and a thin ring climbs it
  buff(ctx) {
    const { fx, THREE, target } = ctx;
    if (!target) return 'default';
    const col = CYAN(THREE).multiplyScalar(0.6), h = target.height || 2.5;
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.07, target.z), color: col, r0: 0.9, r1: 1.0, thick: 0.08, life: 0.6, hold: 0.4, kind: 2 });
    for (let s = 0; s < 3; s++) fx.after(0.1 + s * 0.07, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(target.x, 0.2 + s * h * 0.3, target.z), color: col, r0: 0.75, r1: 0.8, thick: 0.03, life: 0.2, kind: 0 }));
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const col = CYAN(THREE), white = palette.white, dim = col.clone().multiplyScalar(0.5);
    const allies = (targets.length ? targets : [src]).filter(Boolean);
    const d0 = discPos(src, THREE, new THREE.Vector3());
    // the disc flares: flat hex ring thrown outward + a held hex halo + bright flash
    fx.vfx.rings.spawn({ pos: d0, color: col, r0: 0.4, r1: 3.2, thick: 0.03, life: 0.55, kind: 2 });
    fx.vfx.rings.spawn({ pos: d0, color: dim, r0: 0.9, r1: 1.05, thick: 0.05, life: 1.3, hold: 0.6, kind: 2, alpha: 0.8 });
    fx.star(d0, white, 1.6, 0.18);
    fx.light(d0, col, 24, 0.45);
    fx.screenFlash(col, 0.025);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      fx.vfx.add.spawn({ pos: d0, vel: new THREE.Vector3(Math.cos(a) * 5, rnd(-0.4, 0.4), Math.sin(a) * 5), color: i % 3 ? col : white, life: 0.4, size: 0.08, kind: 1, streak: 0.1, drag: 3, floor: false });
    }
    // beams from the disc to every ally (they follow the disc and the ally)
    allies.forEach((t, i) => fx.after(0.08 + i * 0.06, () => {
      const fa = (bm) => { discPos(src, THREE, bm.a); bm.b.copy(t.pos('core')); };
      fx.vfx.beams.spawn({ a: d0, b: t.pos('core'), color: col, width: 0.22, width1: 0.1, core: 0.4, life: 0.6, taper: 0.05, hold: 0.45, fn: fa });
      fx.vfx.beams.spawn({ a: d0, b: t.pos('core'), color: white, width: 0.07, core: 0.8, life: 0.4, taper: 0.05, fn: fa });
      // the lattice snaps on: a ring of hex cells round the body, a floor hex, a scan rising up the unit
      fx.after(0.1, () => {
        const c = t.pos('core'), h = t.height || 2.5, R = Math.max(0.7, h * 0.36);
        for (let j = 0; j < 7; j++) {
          const a = (j / 7) * Math.PI * 2 + i, y = c.y + Math.sin(a * 2) * R * 0.45;
          fx.after(j * 0.025, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(c.x + Math.cos(a) * R, y, c.z + Math.sin(a) * R * 0.5), color: j % 2 ? col : white,
            r0: 0.08, r1: 0.22, thick: 0.25, life: 0.32, face: true, kind: 2, alpha: 0.65 }));
        }
        fx.vfx.rings.spawn({ pos: new THREE.Vector3(t.x, 0.06, t.z), color: col, r0: 0.3, r1: R * 1.25, thick: 0.05, life: 0.5, kind: 2 });
        for (let s = 0; s < 4; s++) fx.after(s * 0.06, () => fx.vfx.rings.spawn({ pos: new THREE.Vector3(t.x, 0.15 + (s / 3) * h * 0.95, t.z), color: dim,
          r0: R * 0.95, r1: R, thick: 0.03, life: 0.22, kind: 0, alpha: 0.7 }));
        fx.light(c, col, 14, 0.2);
      });
    }));
  },
};
