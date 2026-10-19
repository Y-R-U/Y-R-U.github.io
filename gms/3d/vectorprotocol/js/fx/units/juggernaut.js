// JUGGERNAUT signature FX (sculptor-8). Also BIG RUSTY (boss_big_rusty uses the juggernaut model, battle keys FX by model too).
// Saw Ram (basic) = the saw bites: a fan of white-hot sparks off the blade, a grinding spark stream on the target, steel chips.
// Ram Rush (overdrive) = both stacks blast black smoke + flame, the tread rips up the floor, an orange impact wave rolls down the
// enemy column (floor cracks, hex rings, explosions, targets skid back), then the second slam quakes the board again.
const rnd = (a, b) => a + Math.random() * (b - a);
function axes(ctx, who) {
  const { THREE } = ctx, q = new THREE.Quaternion();
  who.root.getWorldQuaternion(q);
  return { fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), side: new THREE.Vector3(1, 0, 0).applyQuaternion(q) };
}
function bonePos(ctx, who, name) {
  const bones = who.unit?.bones, b = bones && (bones.find ? bones.find((x) => x.name === name) : null);
  const p = new ctx.THREE.Vector3();
  if (b) b.getWorldPosition(p); else who.root.getWorldPosition(p).setY(who.height * 0.9);
  return p;
}
const ground = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.05);
function hot(ctx) { return new ctx.THREE.Color(4.2, 2.2, 0.7); }   // white-hot orange (HDR)
// spark fan: n streaks from p, mostly along dir, kicked upward
function fan(ctx, p, dir, n, speed = 7, spread = 0.9, c = hot(ctx)) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    const v = dir.clone().multiplyScalar(speed * rnd(0.5, 1.1)).add(new THREE.Vector3(rnd(-spread, spread) * speed * 0.5, rnd(0.3, 1.3) * speed * 0.5, rnd(-spread, spread) * speed * 0.5));
    fx.vfx.add.spawn({ pos: p, vel: v, color: i % 3 ? c : ctx.palette.gold, life: rnd(0.18, 0.45), size: rnd(0.05, 0.1), size1: 0.01, kind: 1, streak: 0.09, drag: 1.2, grav: 9, floor: true });
  }
}
function chips(ctx, p, n, k = 1) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-2.5, 2.5) * k, rnd(1.5, 4.5) * k, rnd(-2.5, 2.5) * k), color: new THREE.Color(0.16, 0.11, 0.08), alpha: 1, life: rnd(0.6, 1.1), size: rnd(0.05, 0.11) * k, kind: 3, grav: 14, drag: 0.4 });
  }
}
function smoke(ctx, p, n, k = 1, up = 2) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.6, 0.6), rnd(up * 0.7, up * 1.3), rnd(-0.6, 0.6)), color: new THREE.Color(0.06, 0.055, 0.05), alpha: 0.6, life: rnd(1.0, 1.7), size: 0.35 * k, size1: 1.5 * k, kind: 2, drag: 1.1, floor: false });
}
function belch(ctx, who, k = 1) {
  const { fx, THREE, palette } = ctx;
  for (const n of ['thighL', 'thighR']) {
    const p = bonePos(ctx, who, n);
    for (let i = 0; i < 12 * k; i++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-0.8, 0.8), rnd(3, 5.5) * k, rnd(-0.8, 0.8)), color: i % 3 ? palette.orange : palette.gold, life: rnd(0.2, 0.42), size: 0.32 * k, size1: 0.05, kind: 0, drag: 2, floor: false });
    smoke(ctx, p, Math.round(5 * k), k, 2.4);
  }
}
function dust(ctx, p, n, r = 1.2) {
  const { fx, THREE } = ctx;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.vfx.alpha.spawn({ pos: p.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.3, 0.05, Math.sin(a) * r * 0.3)), vel: new THREE.Vector3(Math.cos(a) * rnd(1, 3) * r, rnd(0.3, 1.2), Math.sin(a) * rnd(1, 3) * r), color: new THREE.Color(0.2, 0.18, 0.17), alpha: 0.45, life: rnd(0.7, 1.2), size: 0.3, size1: 1.1, kind: 2, drag: 2.5, floor: false });
  }
}
// push a target's body back along its own -z and settle (body offsets are free; the battle owns root)
function skid(ctx, t, dist = 0.5, dur = 0.7) {
  const { fx } = ctx, body = t.unit?.body;
  if (!body) return;
  const z0 = body.position.z, n = 18;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    fx.after(u * dur, () => { const k = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75; body.position.z = z0 - dist * Math.sin(k * Math.PI / 2); });
  }
  fx.after(dur + 0.02, () => { body.position.z = z0; });
}
function quake(ctx, at, k = 1) {
  const { fx, palette, THREE } = ctx;
  fx.shake(0.55 * k);
  fx.vfx.rings.spawn({ pos: at, color: palette.orange, r0: 0.5, r1: 5.5 * k, thick: 0.2, life: 0.55, kind: 0 });
  fx.vfx.rings.spawn({ pos: at, color: new THREE.Color(1.2, 0.55, 0.2), r0: 0.3, r1: 3.2 * k, thick: 0.1, life: 0.7, kind: 2 });
  dust(ctx, at, Math.round(12 * k), 1.4 * k);
}

export default {
  attack(ctx) {
    const { fx, src, target, palette, timing } = ctx;
    const saw = src.pos('muzzle'), { fwd } = axes(ctx, src);
    const back = fwd.clone().multiplyScalar(-1).setY(0.4).normalize();
    // the blade bites: sparks fling back over the cab, a hot flash at the cut, light, a stack puff
    fx.star(saw, hot(ctx), 1.1, 0.12);
    fx.light(saw, palette.orange, 22, 0.18);
    fan(ctx, saw, back, 22, 7);
    for (let i = 1; i <= 3; i++) fx.after(i * 0.07, () => fan(ctx, saw, back, 8, 6));
    belch(ctx, src, 0.35);
    dust(ctx, ground(ctx, src).addScaledVector(fwd, src.height * 0.32), 5, 0.8);
    if (target) fx.after(Math.max(0, timing.travel - 0.03), () => fx.vfx.rings.spawn({ pos: target.pos('core'), color: palette.orange, r0: 0.15, r1: 0.9, thick: 0.1, life: 0.2, face: true }));
  },
  impact(ctx) {
    const { fx, src, target, palette, hit } = ctx;
    const p = target.pos('core'), k = hit?.crit ? 1.5 : 1;
    const dir = p.clone().sub(src.pos('core')).setY(0).normalize().setY(0.5).normalize();
    fx.impact(p, palette.orange, 1.05 * k);
    // grinding: spark stream for ~0.3 s, steel chips
    for (let i = 0; i < 4; i++) fx.after(i * 0.07, () => fan(ctx, p, dir, Math.round(9 * k), 6, 1.1));
    chips(ctx, p, Math.round(6 * k), k);
    fx.shake(hit?.crit ? 0.32 : 0.16);
    if (hit?.crit) fx.slash(p, dir, palette.orange, 1.3);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const { fwd } = axes(ctx, src);
    const g0 = ground(ctx, src), saw = src.pos('muzzle'), k = Math.min(1.6, src.height / 4.5);
    // engines roar: both stacks blast flame + black smoke, the tread rips the floor up behind it
    belch(ctx, src, 1.6);
    fx.after(0.12, () => belch(ctx, src, 1.0));
    const rear = g0.clone().addScaledVector(fwd, -src.height * 0.3);
    for (let i = 0; i < 26; i++) fx.vfx.add.spawn({ pos: rear, vel: fwd.clone().multiplyScalar(-rnd(2, 5)).add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(1, 3), rnd(-1.5, 1.5))), color: palette.orange, life: rnd(0.2, 0.4), size: 0.08, size1: 0.01, kind: 1, streak: 0.08, grav: 9, floor: true });
    chips(ctx, rear, 12, 1.2);
    // the ram lands: ground-shaking quake under the rig, saw throws a fountain of sparks
    quake(ctx, g0.clone().addScaledVector(fwd, src.height * 0.35), 1.1 * k);
    fx.screenFlash(palette.orange, 0.22);
    fx.light(saw, palette.orange, 70, 0.4);
    for (let i = 0; i < 8; i++) fx.after(i * 0.07, () => fan(ctx, saw, fwd.clone().multiplyScalar(-1).setY(0.6).normalize(), 14, 8));
    if (live.length) {
      // orange impact wave rolls down the enemy column: floor crack rings + debris marching out, then each target is hit
      const far = live.reduce((m, t) => (t.pos('core').distanceTo(g0) > m.pos('core').distanceTo(g0) ? t : m), live[0]);
      const to = ground(ctx, far), steps = 7, dur = 0.42;
      for (let i = 1; i <= steps; i++) {
        const p = g0.clone().lerp(to, i / steps).setY(0.06);
        fx.after(dur * i / steps, () => {
          fx.vfx.rings.spawn({ pos: p, color: palette.orange, r0: 0.3, r1: 1.4 + i * 0.12, thick: 0.16, life: 0.4, kind: i % 2 ? 2 : 0 });
          chips(ctx, p, 4, 1);
          fx.vfx.add.spawn({ pos: p.clone().setY(0.3), color: hot(ctx), life: 0.16, size: 1.1, size1: 0.3, kind: 0, floor: false });
        });
      }
      live.forEach((t) => {
        const d = Math.min(1, ground(ctx, t).distanceTo(g0) / Math.max(1e-3, to.distanceTo(g0)));
        fx.after(0.08 + dur * d, () => {
          const p = t.pos('core');
          fx.explosion(p, palette.orange, 1.1);
          fx.vfx.rings.spawn({ pos: ground(ctx, t), color: palette.orange, r0: 0.4, r1: 3.2, thick: 0.15, life: 0.55, kind: 2 });
          fan(ctx, p, new THREE.Vector3(0, 1, 0), 18, 6, 1.2);
          chips(ctx, p, 10, 1.3);
          skid(ctx, t, 0.55, 0.7);
          // stun: a yellow ring of sparks over the head
          const h = t.pos('head');
          for (let i = 0; i < 3; i++) fx.after(0.25 + i * 0.25, () => fx.vfx.rings.spawn({ pos: h.clone().setY(h.y + 0.5), color: palette.gold, r0: 0.25, r1: 0.45, thick: 0.06, life: 0.3 }));
        });
      });
    }
    // second slam (the anim drives the saw down again at u 0.45 ~ 0.68 s after the release)
    fx.after(0.68, () => {
      quake(ctx, g0.clone().addScaledVector(fwd, src.height * 0.38), 0.8 * k);
      fx.screenFlash(palette.orange, 0.12);
      fan(ctx, src.pos('muzzle'), new THREE.Vector3(0, 1, 0), 20, 7, 1.2);
      belch(ctx, src, 0.8);
    });
  },
};
