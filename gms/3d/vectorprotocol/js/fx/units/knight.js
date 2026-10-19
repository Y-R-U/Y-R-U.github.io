// RIFT KNIGHT signature FX (sculptor-18). Keyed by model id `knight` (battle looks up [unit def id, model id]).
// Longsword Cut = a rift-blue crescent across the target with a white edge and a short-lived tear of light along the cut.
// attack_alt: shield bash (index 0, a steel ring burst) then the rising backhand (index 1, a crescent sweeping up).
// SHIELDWALL CHARGE (overdrive): a hardlight kite-shield wall forms before the knight and rams down the lane into the enemy
// frontline (stun stars + shockwave), then the follow-up rift smite (overdrive impact #2) splits the floor under the first target.
// Oathbound (buff): a crowned sigil rings the knight's plate.
const rnd = (a, b) => a + Math.random() * (b - a);
let RIFT = null, PALE = null;
function cols(ctx) {
  if (!RIFT) { RIFT = new ctx.THREE.Color(0.45, 1.25, 3.6); PALE = new ctx.THREE.Color(1.8, 2.6, 3.6); }
  return { rift: RIFT, pale: PALE, gold: ctx.palette.gold, white: ctx.palette.white };
}
function axes(ctx, a, b) {
  const { THREE } = ctx;
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3().crossVectors(up, dir);
  return { dir, up, side };
}
function crescent(ctx, c, u, v, R, { span = 2.3, n = 9, color, width = 0.45, life = 0.22, core = 0.3, hold = 0, move = null } = {}) {
  const { fx } = ctx, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = -span / 2 + span * i / n;
    pts.push(c.clone().addScaledVector(u, Math.sin(t) * R).addScaledVector(v, Math.cos(t) * R * 0.4));
  }
  for (let i = 0; i < n; i++) {
    const m = 1 - Math.abs((i + 0.5) / n - 0.5) * 2;
    const a0 = pts[i], b0 = pts[i + 1];
    const o = { a: a0, b: b0, color, width: width * (0.2 + 0.8 * m), width1: width * 0.12 * m, core, life, taper: 0.02, hold };
    if (move) o.fn = (bm, k) => { const d = move(k); bm.a.copy(a0).add(d); bm.b.copy(b0).add(d); };
    fx.vfx.beams.spawn(o);
  }
  return pts;
}
// the cut: crescent + rift tear (thin lingering white-blue line with motes leaking out)
function cut(ctx, target, src, { rising = false, k = 1 } = {}) {
  const { fx, THREE } = ctx, C = cols(ctx);
  const p = target.pos('core'), s = src.pos('core');
  const { dir, up, side } = axes(ctx, s, p);
  const u = side.clone().multiplyScalar(rising ? 0.7 : -0.75).addScaledVector(up, rising ? 0.7 : 0.66).normalize();
  const c = p.clone().addScaledVector(dir, -0.25);
  crescent(ctx, c, u, dir, 1.2 * k, { color: C.rift, width: 0.55, life: 0.26 });
  const pts = crescent(ctx, c.clone().addScaledVector(dir, 0.05), u, dir, 1.15 * k, { color: C.pale, width: 0.16, life: 0.2, core: 0.7 });
  // the tear lingers a beat: the rift glimpsed through the cut
  const a = pts[2], b = pts[pts.length - 3];
  fx.vfx.beams.spawn({ a, b, color: C.white, width: 0.07, width1: 0.02, core: 0.8, life: 0.55, hold: 0.5, taper: 0.15 });
  for (let i = 0; i < 10; i++) fx.vfx.add.spawn({ pos: new THREE.Vector3().lerpVectors(a, b, Math.random()), vel: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.2, 1.2), rnd(-0.4, 0.4)), color: C.rift, life: rnd(0.4, 0.8), size: rnd(0.08, 0.16), size1: 0.01, kind: 0, floor: false, drag: 1.5 });
  fx.star(p, C.pale, 1.5);
  fx.light(p, C.rift, 26, 0.16);
}
function bash(ctx, target, src) {
  const { fx } = ctx, C = cols(ctx);
  const p = target.pos('core');
  fx.vfx.rings.spawn({ pos: p, color: C.pale, r0: 0.2, r1: 1.1, thick: 0.14, life: 0.2, face: true });
  fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: C.rift, r0: 0.3, r1: 1.4, thick: 0.08, life: 0.3, kind: 2 });
  fx.sparks(p, C.white, 10, 5);
  fx.shake(0.12);
}

export default {
  attack(ctx) {
    if (!ctx.target) return 'default';
    if (ctx.event && ctx.src.unit?.state?.action === 'attack_alt') { bash(ctx, ctx.target, ctx.src); return; }
    cut(ctx, ctx.target, ctx.src);
  },
  shot(ctx) {
    const { shot, target, src } = ctx;
    if (!target) return;
    if (shot.phase === 'attack' && shot.anim === 'attack_alt' && shot.index === 1) cut(ctx, target, src, { rising: true, k: 1.05 });
    // overdrive follow-up: the rift smite (third anim event) splits the floor under the first target
    if (shot.phase === 'overdrive' && shot.index === 2) {
      const { fx, THREE } = ctx, C = cols(ctx);
      const p = target.pos('core'), g = new THREE.Vector3(target.x, 0.05, target.z);
      const { dir, side } = axes(ctx, src.pos('core'), p);
      fx.vfx.beams.spawn({ a: g.clone().setY(6), b: g, color: C.rift, width: 0.9, width1: 0.2, core: 0.5, life: 0.35, taper: 0.05 });
      fx.vfx.beams.spawn({ a: g.clone().setY(6), b: g, color: C.white, width: 0.25, width1: 0.05, core: 0.9, life: 0.25, taper: 0.05 });
      for (let j = -1; j <= 1; j += 2) {
        let a = g.clone();
        for (let k = 0; k < 4; k++) {
          const b = a.clone().addScaledVector(dir, j * rnd(0.3, 0.6)).addScaledVector(side, rnd(-0.35, 0.35));
          fx.vfx.beams.spawn({ a, b, color: C.rift, width: 0.12, width1: 0.05, core: 0.6, life: 1.2, hold: 0.6, taper: 0.01 });
          a = b;
        }
      }
      fx.impact(p, C.rift, 1.4);
      fx.vfx.rings.spawn({ pos: g, color: C.pale, r0: 0.3, r1: 2.4, thick: 0.14, life: 0.5, kind: 2 });
      fx.light(p, C.rift, 40, 0.3);
      fx.shake(0.4);
    }
  },
  impact(ctx) {
    const { fx, target, hit } = ctx, C = cols(ctx);
    const p = target.pos('core');
    fx.impact(p, C.rift, hit?.crit ? 1.5 : 1.0);
    fx.sparks(p, C.pale, hit?.crit ? 18 : 9, 6);
    fx.shake(hit?.crit ? 0.25 : 0.1);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx, C = cols(ctx);
    const live = targets.filter(Boolean);
    const s = new THREE.Vector3(src.x, 0, src.z);
    const near = live.reduce((m, t) => (!m || Math.hypot(t.x - src.x, t.z - src.z) < Math.hypot(m.x - src.x, m.z - src.z) ? t : m), null);
    const end = near ? new THREE.Vector3(near.x, 0, near.z) : s.clone().add(new THREE.Vector3(src.side === 'player' ? 5 : -5, 0, 0));
    const { dir, up, side } = axes(ctx, s, end);
    const D = Math.max(1, s.distanceTo(end) - 0.6), T = 0.32, h = src.height || 3;
    // hardlight kite-shield wall: an outline + crown sigil, rushing from the knight to the frontline
    const start = s.clone().addScaledVector(dir, 0.8);
    const kite = [[0, -0.95], [0.5, -0.25], [0.62, 0.3], [0.5, 0.62], [0, 0.72], [-0.5, 0.62], [-0.62, 0.3], [-0.5, -0.25]];
    const S = h * 0.7, cy = h * 0.55;
    const ease = (k) => 1 - Math.pow(1 - Math.min(1, k / 0.55), 2);
    const at = (pt) => start.clone().addScaledVector(side, pt[0] * S).addScaledVector(up, cy + pt[1] * S);
    for (let w = 0; w < 3; w++) {
      const off = w * 0.35;
      for (let i = 0; i < kite.length; i++) {
        const a0 = at(kite[i]).addScaledVector(dir, -off), b0 = at(kite[(i + 1) % kite.length]).addScaledVector(dir, -off);
        fx.vfx.beams.spawn({ a: a0, b: b0, color: w ? C.rift : C.pale, width: w ? 0.18 : 0.26, core: w ? 0.3 : 0.7, life: 0.75, hold: 0.55, taper: 0.02,
          fn: (bm, k) => { const d = dir.clone().multiplyScalar(D * ease(k)); bm.a.copy(a0).add(d); bm.b.copy(b0).add(d); } });
      }
    }
    // the wall's face: a hex ring that travels with it + floor wake
    const face = start.clone().setY(cy);
    fx.vfx.rings.spawn({ pos: face, color: C.rift, r0: S * 0.55, r1: S * 0.6, thick: 0.1, life: 0.6, kind: 2, face: true, hold: 0.6 });
    for (let i = 0; i < 9; i++) {
      const d0 = (i / 9) * D;
      fx.after((d0 / D) * T, () => {
        const g = start.clone().addScaledVector(dir, d0).setY(0.06);
        fx.vfx.rings.spawn({ pos: g, color: C.rift, r0: 0.2, r1: 1.0, thick: 0.08, life: 0.35, kind: 2 });
        for (let j = 0; j < 4; j++) fx.vfx.add.spawn({ pos: g.clone().addScaledVector(side, rnd(-1, 1)), vel: new THREE.Vector3(rnd(-0.5, 0.5), rnd(1, 3), rnd(-0.5, 0.5)), color: C.rift, life: rnd(0.3, 0.6), size: 0.1, kind: 1, streak: 0.06, grav: 6 });
      });
    }
    // contact: shockwave, stun stars circling every frontline target, the knight is fortified
    fx.after(T, () => {
      fx.shake(0.75);
      fx.screenFlash(C.rift, 0.05);
      for (const t of live) {
        const p = t.pos('core');
        fx.impact(p, C.pale, 1.6);
        fx.sparks(p, C.white, 16, 7);
        fx.vfx.rings.spawn({ pos: new THREE.Vector3(t.x, 0.06, t.z), color: C.rift, r0: 0.4, r1: 2.6, thick: 0.16, life: 0.55, kind: 0 });
        const hp = t.pos('head');
        for (let i = 0; i < 3; i++) {
          const ph = i / 3 * Math.PI * 2;
          fx.after(0.05 * i, () => fx.vfx.beams.spawn({ a: hp.clone(), b: hp.clone(), color: ctx.palette.gold, width: 0.14, core: 0.6, life: 1.0, hold: 0.8,
            fn: (bm, k) => { const a = ph + k * 9; bm.a.set(hp.x + Math.cos(a) * 0.45, hp.y + 0.35, hp.z + Math.sin(a) * 0.45); bm.b.set(hp.x + Math.cos(a - 0.5) * 0.45, hp.y + 0.35, hp.z + Math.sin(a - 0.5) * 0.45); } }));
        }
      }
    });
    fx.after(0.2, () => { fx.shieldHit(src.pos('core'), C.rift); fx.buffAura(new THREE.Vector3(src.x, 0, src.z), C.rift); });
  },
  // Oathbound fortify/taunt: a crowned sigil (hex ring + gold ring + rising motes) under the knight
  buff(ctx) {
    const { fx, THREE, src } = ctx, C = cols(ctx);
    const g = new THREE.Vector3(src.x, 0.06, src.z);
    fx.vfx.rings.spawn({ pos: g, color: C.rift, r0: 1.6, r1: 1.0, thick: 0.1, life: 0.7, kind: 2 });
    fx.vfx.rings.spawn({ pos: g.clone().setY(0.07), color: C.gold, r0: 0.4, r1: 1.4, thick: 0.06, life: 0.6 });
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      fx.vfx.add.spawn({ pos: g.clone().add(new THREE.Vector3(Math.cos(a) * 1.1, 0.1, Math.sin(a) * 1.1)), vel: new THREE.Vector3(0, rnd(1.5, 2.6), 0), color: i % 2 ? C.gold : C.rift, life: 0.8, size: 0.16, size1: 0.02, kind: 0, floor: false });
    }
  },
};
