// SCRAPPER signature FX (sculptor-1). Piston Punch = a piston blast at the fist + a heavy metal impact with debris;
// Haymaker (overdrive) = stacks belch flame, rocket burn behind the fist, an orange shockwave down the lane, the target skids back.
function axes(ctx, who) {
  const { THREE } = ctx, q = new THREE.Quaternion();
  who.root.getWorldQuaternion(q);
  return { fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0) };
}
function debris(ctx, p, n, k = 1) {
  const { fx, THREE } = ctx, v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set((Math.random() - 0.5) * 5 * k, 2 + Math.random() * 4 * k, (Math.random() - 0.5) * 5 * k);
    fx.vfx.alpha.spawn({ pos: p, vel: v, color: new THREE.Color(0.14, 0.1, 0.09), alpha: 1, life: 0.7 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.06, kind: 3, grav: 15, drag: 0.4 });
  }
}
// stack positions: up and behind the head
function stacks(ctx) {
  const { src } = ctx, { fwd } = axes(ctx, src);
  const h = src.pos('head');
  const s = src.height / 3.1;
  return [h.clone().addScaledVector(fwd, -0.55 * s).add({ x: 0, y: 0.45 * s, z: 0 })];
}
function belch(ctx, p, k = 1) {
  const { fx, THREE, palette } = ctx;
  for (let i = 0; i < 16 * k; i++) {
    fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 3 + Math.random() * 3 * k, (Math.random() - 0.5) * 1.2), color: i % 3 ? palette.orange : palette.gold, life: 0.25 + Math.random() * 0.3, size: 0.3 * k, size1: 0.05, kind: 0, drag: 2, floor: false });
  }
  for (let i = 0; i < 6 * k; i++) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8), color: new THREE.Color(0.08, 0.07, 0.07), alpha: 0.55, life: 1.2 + Math.random() * 0.6, size: 0.3, size1: 1.2 * k, kind: 2, drag: 1.2, floor: false });
}
// push the target's body back along its own -z and let it settle (body offsets are free; the battle owns root)
function skid(ctx, t, dist = 0.5, dur = 0.7) {
  const { fx } = ctx, body = t.unit?.body;
  if (!body) return;
  const z0 = body.position.z, n = 20;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    fx.after(u * dur, () => { const k = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75; body.position.z = z0 - dist * Math.sin(k * Math.PI / 2); });
  }
  fx.after(dur + 0.02, () => { body.position.z = z0; });
}

export default {
  attack(ctx) {
    const { fx, src, palette } = ctx;
    const p = src.pos('hand');
    fx.vfx.rings.spawn({ pos: p, color: palette.orange, r0: 0.1, r1: 0.7, thick: 0.18, life: 0.18, face: true });
    fx.sparks(p, palette.orange, 10, 4);
    fx.light(p, palette.orange, 18, 0.12);
    belch(ctx, stacks(ctx)[0], 0.35);
  },
  impact(ctx) {
    const { fx, target, palette, hit } = ctx;
    const p = target.pos('core');
    fx.impact(p, palette.orange, hit?.crit ? 1.5 : 1.05);
    debris(ctx, p, hit?.crit ? 10 : 5);
    fx.shake(hit?.crit ? 0.3 : 0.14);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets, palette } = ctx;
    const live = targets.filter(Boolean);
    const { fwd } = axes(ctx, src);
    const fist = src.pos('hand');
    // the stacks belch, a rocket burn blasts back out of the forearm
    belch(ctx, stacks(ctx)[0], 1.4);
    for (let i = 0; i < 26; i++) {
      const v = fwd.clone().multiplyScalar(-(4 + Math.random() * 5)).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 1.5));
      fx.vfx.add.spawn({ pos: fist, vel: v, color: i % 2 ? palette.orange : palette.gold, life: 0.3 + Math.random() * 0.25, size: 0.35, size1: 0.05, kind: i % 3 ? 0 : 1, streak: 0.1, drag: 3, floor: false });
    }
    fx.vfx.rings.spawn({ pos: fist, color: palette.white, r0: 0.2, r1: 1.6, thick: 0.25, life: 0.22, face: true });
    fx.light(fist, palette.orange, 60, 0.3);
    fx.screenFlash(palette.orange, 0.28);
    fx.shake(0.6);
    if (!live.length) return;
    // shockwave: a fat orange slug + ground rings racing down the lane to each target
    live.forEach((t, j) => {
      const to = t.pos('core'), dur = 0.14 + j * 0.06;
      fx.bolt(fist, to, palette.orange, dur, { size: 0.7, trail: 2.5 });
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        const p = fist.clone().lerp(to, i / steps).setY(Math.max(0.05, to.y * 0.15));
        fx.after(dur * i / steps, () => fx.vfx.rings.spawn({ pos: p, color: palette.orange, r0: 0.2, r1: 1.0 + i * 0.15, thick: 0.12, life: 0.35 }));
      }
      fx.after(dur, () => {
        fx.explosion(to, palette.orange, 1.15);
        fx.vfx.rings.spawn({ pos: to.clone().setY(0.06), color: palette.orange, r0: 0.4, r1: 3.6, thick: 0.14, life: 0.55, kind: 2 });
        debris(ctx, to, 14, 1.3);
        skid(ctx, t, 0.55, 0.75);
      });
    });
  },
};
