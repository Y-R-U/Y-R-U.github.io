// Classic move + battle animations. The pattern every theme copies:
//  - a move anim gets ctx.piece at its start square and must end at ctx.to (≤ ~350 ms)
//  - a battle anim gets ctx.attacker / ctx.victim and must end with the attacker at
//    ctx.to; the board removes the victim afterwards whatever state it is in
//  - animate ONLY via ctx.tween / ctx.wait (speed + tap-to-skip depend on it)
// Optional props on an anim fn: .only = ['n'] (piece types), .weight = 2, .label

const { PI } = Math;

// ----------------------------------------------------------------- move anims
export async function hop(ctx) {
  const { kit, piece, to } = ctx;
  await kit.hopTo(ctx, piece, to, { squash: 0.2 });
}
hop.label = 'hop';

export async function slide(ctx) {
  await ctx.kit.slideTo(ctx, ctx.piece, ctx.to);
}
slide.label = 'slide (squash & stretch)';

export async function spinHop(ctx) {
  const { kit, piece, to, dist } = ctx;
  await kit.hopTo(ctx, piece, to, { spin: PI * 2, height: Math.min(0.9, 0.45 + dist * 0.08), ms: Math.min(330, 240 + dist * 15), lean: 0, squash: 0.25 });
}
spinHop.label = 'spin hop';

/** Knights rear up and leap in a high arc, pitching forward to land. */
export async function knightLeap(ctx) {
  const { kit, piece, from, to } = ctx;
  const dir = kit.flatDir(from, to), axis = kit.tiltAxis(dir);
  const p = piece.position;
  await ctx.tween(300, (e, k) => {
    kit.arc(p, from, to, 0.95, e);
    piece.quaternion.setFromAxisAngle(axis, -0.55 * Math.sin(k * PI) + 0.25 * Math.sin(k * PI * 2));
  }, kit.ease.sineInOut);
  piece.quaternion.identity();
  await kit.squash(ctx, piece, 0.28, 70);
}
knightLeap.only = ['n']; knightLeap.weight = 3; knightLeap.label = 'knight leap';

export const moveAnims = [hop, slide, spinHop, knightLeap];

// --------------------------------------------------------------- battle anims
/** Square off, wind up, clash with sparks; the victim is knocked over and sinks away. */
export async function clash(ctx) {
  const { kit, attacker: A, victim: V, victimPos, to, fx } = ctx;
  const dir = kit.flatDir(A.position, victimPos, ctx.dir);
  const standoff = victimPos.clone().addScaledVector(dir, -0.85);
  await kit.focusFight(ctx, async () => {
    await kit.hopTo(ctx, A, standoff, { ms: 240, height: 0.4, squash: 0 });
    // wind up: both lean back
    await ctx.tween(200, e => { kit.setLean(A, dir, -0.35 * e); kit.setLean(V, dir, 0.15 * e); }, kit.ease.quadOut);
    // lunge
    const hit = victimPos.clone().addScaledVector(dir, -0.5);
    const a0 = A.position.clone();
    await ctx.tween(90, e => { A.position.lerpVectors(a0, hit, e); kit.setLean(A, dir, -0.35 + 0.6 * e); }, kit.ease.quadIn);
    const contact = victimPos.clone().addScaledVector(dir, -0.28); contact.y = 0.55;
    fx.sparks(contact, { dir: dir.clone().negate().setY(0.5), count: 46 });
    fx.flash(contact, { radius: 1.1 });
    kit.shake(ctx, 0.07, 220);
    kit.flashObject(ctx, V, '#ffffff', 160);
    // knock over (victim flies back a touch then tips)
    const v0 = V.position.clone(), v1 = v0.clone().addScaledVector(dir, 0.25);
    await Promise.all([
      ctx.tween(140, e => { kit.setLean(A, dir, 0.25 * (1 - e)); A.position.lerpVectors(hit, a0, e * 0.4); }),
      ctx.tween(120, e => V.position.lerpVectors(v0, v1, e), kit.ease.quadOut),
    ]);
    V.quaternion.identity();
    await kit.tipOver(ctx, V, dir, { ms: 420, radius: V.userData.radius * 0.8 });
    fx.smoke(V.position.clone().addScaledVector(dir, 0.4).setY(0.15), { count: 8, alpha: 0.4 });
    await Promise.all([
      kit.sinkOut(ctx, V, 280),
      ctx.wait(80).then(() => kit.hopTo(ctx, A, to, { ms: 260, height: 0.45, squash: 0.25 })),
    ]);
  });
}
clash.label = 'clash & knock-over';

/** Shoulder-charge: the victim is launched off the edge of the board, trailing smoke. */
export async function launch(ctx) {
  const { kit, attacker: A, victim: V, victimPos, to, fx } = ctx;
  const dir = kit.flatDir(A.position, victimPos, ctx.dir);
  const standoff = victimPos.clone().addScaledVector(dir, -0.95);
  await kit.focusFight(ctx, async () => {
    await kit.slideTo(ctx, A, standoff, { ms: 220 });
    await ctx.tween(180, (e, k) => A.scale.set(1 + 0.15 * e, 1 - 0.22 * e, 1 + 0.15 * e), kit.ease.quadOut); // crouch
    const a0 = A.position.clone(), hit = victimPos.clone().addScaledVector(dir, -0.45);
    await ctx.tween(100, e => { A.position.lerpVectors(a0, hit, e); A.scale.set(1 + 0.15 * (1 - e), 1 - 0.22 * (1 - e) + 0.12 * e, 1 + 0.15 * (1 - e)); }, kit.ease.quadIn);
    A.scale.set(1, 1, 1);
    const c = victimPos.clone().addScaledVector(dir, -0.25); c.y = 0.4;
    fx.sparks(c, { dir: dir.clone().setY(0.6), count: 40 });
    fx.flash(c, { radius: 1.3 });
    fx.ring(victimPos, { radius: 0.9 });
    kit.shake(ctx, 0.1, 260);
    // fly off the nearest edge along dir: distance until |x| or |z| passes 5.3
    const p0 = V.position.clone();
    const tEdge = Math.min(...['x', 'z'].map(ax => (dir[ax] ? (Math.sign(dir[ax]) * 5.6 - p0[ax]) / dir[ax] : Infinity)));
    const land = p0.clone().addScaledVector(dir, Math.max(2, tEdge)); land.y = -2.5;
    const tumble = kit.tiltAxis(dir);
    let lastPuff = 0;
    await Promise.all([
      ctx.tween(720, (e, k) => {
        V.position.set(p0.x + (land.x - p0.x) * k, p0.y + 2.2 * Math.sin(k * PI * 0.75) + (land.y - p0.y) * k * k, p0.z + (land.z - p0.z) * k);
        V.quaternion.setFromAxisAngle(tumble, k * PI * 3.2);
        if (k - lastPuff > 0.08) { lastPuff = k; fx.smoke(V.position.clone(), { count: 2, size: [0.18, 0.3], alpha: 0.4, up: 0.1 }); }
      }),
      ctx.wait(120).then(() => kit.hopTo(ctx, A, to, { ms: 240, height: 0.3, squash: 0.25 })),
    ]);
    fx.smoke(V.position.clone(), { count: 10, alpha: 0.5 });
    V.visible = false;
  }, { zoom: 0.85, tilt: 0.25 });
}
launch.label = 'shove off the board';

/** Leap high and stomp: the victim is flattened into a cloud of dust. */
export async function stomp(ctx) {
  const { kit, attacker: A, victim: V, victimPos, to, fx } = ctx;
  await kit.focusFight(ctx, async () => {
    const a0 = A.position.clone(), top = victimPos.clone(); top.y = (V.userData.height || 1) + 1.2;
    await ctx.tween(380, (e, k) => { A.position.lerpVectors(a0, top, e); A.position.y = a0.y + (top.y - a0.y) * kit.ease.cubicOut(k); A.rotation.y = e * PI * 2; }, kit.ease.sineInOut);
    A.rotation.y = 0;
    await ctx.wait(90);
    const land = victimPos.clone(); land.y = (V.userData.height || 1) * 0.12;
    const t0 = A.position.clone();
    await ctx.tween(110, e => A.position.lerpVectors(t0, land, e), kit.ease.quadIn);
    // impact
    V.scale.set(1.5, 0.12, 1.5);
    fx.dust(victimPos.clone().setY(0.2), { colors: V.userData.color === 'w' ? ['#f4c76a', '#c99b45', '#fff0c0'] : ['#26272e', '#4a4b55', '#100f14'], count: 46 });
    fx.smoke(victimPos.clone().setY(0.1), { count: 12, alpha: 0.5 });
    fx.ring(victimPos, { radius: 1.4 });
    fx.scorch(victimPos, { radius: 0.55 });
    fx.flash(victimPos.clone().setY(0.3), { radius: 1.4 });
    kit.shake(ctx, 0.16, 320);
    await kit.squash(ctx, A, 0.35, 120);
    V.visible = false;
    const l0 = A.position.clone(); l0.y = 0;
    A.position.copy(l0);
    if (kit.flatDist(l0, to) > 0.01) await kit.hopTo(ctx, A, to, { ms: 220, height: 0.3 });
  }, { zoom: 0.8, tilt: 0.3 });
}
stomp.label = 'stomp';

export const battleAnims = [clash, launch, stomp];
