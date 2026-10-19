// SPECTER signature FX (sculptor-13). Ghost Round = a null slug: a dark-cored violet bolt with a pale core that leaves
// a fading row of ghost echoes, and punches a small void (dark core + violet ring) into the target.
// Spectrum Snipe (overdrive) = the model cloaks in its anim; on release a big violet muzzle bloom, then the round arcs
// high over the front line into the back row with a ghost trail, and lands as a void detonation with an expose mark.
// Null Shell (stealth buff) = the model's cloak (unit.specterCloak) + a shimmer ring at its feet.
const VIO = (T) => new T.Color(1.3, 0.45, 2.4);
const PALE = (T) => new T.Color(2.2, 1.9, 2.6);
const DARK = (T) => new T.Color(0.05, 0.0, 0.12);

function ghostRow(ctx, a, b, n, col, life = 0.45) {
  const { fx } = ctx;
  for (let i = 1; i <= n; i++) {
    const p = a.clone().lerp(b, i / (n + 1));
    fx.after(0.02 * i, () => fx.vfx.add.spawn({ pos: p, color: col, life, size: 0.22, size1: 0.02, kind: 0, alpha: 0.7, floor: false }));
  }
}
// quadratic arc a -> b with apex height h
function arcPt(T, a, b, h, k) {
  const p = a.clone().lerp(b, k);
  p.y += 4 * h * k * (1 - k);
  return p;
}
function voidPop(ctx, p, k = 1) {
  const { fx, THREE } = ctx;
  fx.darkCore(p, 0.55 * k, 0.45 + 0.2 * k, DARK(THREE), 0.85);
  fx.vfx.rings.spawn({ pos: p.clone(), color: VIO(THREE), r0: 0.05, r1: 0.75 * k, thick: 0.07, life: 0.35, kind: 0, face: true });
  fx.sparks(p, VIO(THREE), Math.round(8 * k), 4.5 * k);
  fx.vfx.add.spawn({ pos: p.clone(), color: PALE(THREE), life: 0.12, size: 0.6 * k, size1: 0.05, kind: 0 });
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const a = src.pos('muzzle'), b = target.pos('core');
    fx.muzzle(a, VIO(THREE), 1.1);
    fx.vfx.rings.spawn({ pos: a.clone(), color: VIO(THREE), r0: 0.05, r1: 0.35, thick: 0.05, life: 0.2, kind: 0, face: true });
    fx.bolt(a, b, VIO(THREE), timing.travel, { size: 0.28, arc: 0.04, trail: true });
    fx.tracer(a, b, PALE(THREE), 0.05);
    ghostRow(ctx, a, b, 5, VIO(THREE));
    fx.light(a, VIO(THREE), 6, 0.1);
  },
  impact(ctx) {
    const { target, hit } = ctx;
    voidPop(ctx, target.pos('core'), hit?.crit ? 1.5 : 1);
    if (hit?.crit) ctx.fx.light(target.pos('core'), VIO(ctx.THREE), 8, 0.15);
  },
  shot(ctx) {
    const { fx, THREE, shot } = ctx;
    if (shot.phase !== 'overdrive' || shot.type !== 'fire') return;
    // decloak flash at the muzzle on the anim's fire frame
    fx.muzzle(shot.socket, VIO(THREE), 2.2);
    fx.vfx.rings.spawn({ pos: shot.socket.clone(), color: PALE(THREE), r0: 0.05, r1: 0.9, thick: 0.06, life: 0.3, kind: 2, face: true });
    fx.light(shot.socket, VIO(THREE), 14, 0.18);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, timing } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const a = src.pos('muzzle'), col = VIO(THREE), travel = Math.max(0.35, timing.travel || 0.55);
    fx.screenFlash(col, 0.1);
    fx.shake(0.2);
    live.forEach((t, j) => {
      const b = t.pos('core'), h = 2.2 + 0.4 * j;
      // the curving round: a bright head stepped along the arc, ghost echoes left behind it
      const N = 16;
      for (let i = 0; i <= N; i++) {
        const k = i / N, p = arcPt(THREE, a, b, h, k);
        fx.after(travel * k, () => {
          fx.vfx.add.spawn({ pos: p, color: PALE(THREE), life: 0.1, size: 0.42, size1: 0.1, kind: 0 });
          fx.vfx.add.spawn({ pos: p.clone(), color: col, life: 0.6, size: 0.3, size1: 0.0, kind: 0, alpha: 0.75, floor: false });
          if (i % 2 === 0) fx.vfx.alpha.spawn({ pos: p.clone(), color: DARK(THREE), life: 0.5, size: 0.25, size1: 0.45, kind: 2, alpha: 0.5 });
        });
      }
      for (let i = 0; i < 6; i++) {
        const k0 = i / 6, k1 = (i + 1) / 6;
        fx.after(travel * k1, () => fx.vfx.beams.spawn({ a: arcPt(THREE, a, b, h, k0), b: arcPt(THREE, a, b, h, k1), color: col, width: 0.12, width1: 0.03, core: 0.5, life: 0.35, taper: 1 }));
      }
      fx.after(travel, () => {
        voidPop(ctx, b, 2.2);
        fx.explosion(b, col, 0.8);
        fx.debuffAura(b.clone().setY(0), col);
        fx.vfx.rings.spawn({ pos: b.clone().setY(0.06), color: col, r0: 0.2, r1: 1.4, thick: 0.1, life: 0.6, kind: 2 });
        // expose mark: a violet crosshair that lingers over the target
        const up = b.clone().add(new THREE.Vector3(0, 0.9, 0));
        fx.vfx.rings.spawn({ pos: up, color: col, r0: 0.35, r1: 0.3, thick: 0.04, life: 1.4, kind: 0, face: true, hold: 0.7 });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const d = new THREE.Vector3(dx * 0.22, dy * 0.22, 0);
          fx.vfx.beams.spawn({ a: up.clone().add(d), b: up.clone().add(d.multiplyScalar(1.9)), color: col, width: 0.05, width1: 0.05, core: 0.6, life: 1.4, hold: 0.6 });
        }
        fx.light(b, col, 16, 0.3);
        fx.shake(0.3);
      });
    });
  },
  buff(ctx) {
    const { fx, THREE, src, buff } = ctx;
    if (buff?.status !== 'stealth') return 'default';
    src.unit?.specterCloak?.(buff.duration || 3);
    const p = src.pos('core');
    fx.vfx.rings.spawn({ pos: new THREE.Vector3(src.x, 0.06, src.z), color: VIO(THREE), r0: 0.3, r1: 1.3, thick: 0.06, life: 0.6, kind: 2 });
    for (let i = 0; i < 14; i++) fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.9)), vel: new THREE.Vector3(0, 0.4, 0), color: VIO(THREE), life: 0.5 + Math.random() * 0.4, size: 0.12, size1: 0, kind: 0, alpha: 0.8, floor: false });
  },
  deploy(ctx) {
    const { fx, THREE, src } = ctx;
    const base = new THREE.Vector3(src.x, 0.05, src.z), h = src.height || 2.8;
    fx.vfx.rings.spawn({ pos: base.clone(), color: VIO(THREE), r0: 1.4, r1: 0.2, thick: 0.06, life: 0.6, kind: 2 });
    for (let i = 0; i < 18; i++) {
      const p = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * h, (Math.random() - 0.5) * 0.8));
      fx.vfx.add.spawn({ pos: p, color: i % 3 ? VIO(THREE) : PALE(THREE), life: 0.4 + Math.random() * 0.5, size: 0.1, size1: 0, kind: 0, alpha: 0.8, floor: false, fadeIn: 0.2 });
    }
    fx.after(0.6, () => { fx.vfx.add.spawn({ pos: base.clone().setY(h * 0.55), color: PALE(THREE), life: 0.15, size: 1.4, size1: 0.1, kind: 0 }); fx.light(base.clone().setY(1.5), VIO(THREE), 8, 0.2); });
  },
};
