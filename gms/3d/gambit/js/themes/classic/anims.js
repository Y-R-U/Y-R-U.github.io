// Classic move + battle animations. The pattern every theme copies:
//  - a move anim gets ctx.piece at its start square and must end at ctx.to (≤ ~350 ms)
//  - a battle anim gets ctx.attacker / ctx.victim and must end with the attacker at
//    ctx.to; the board removes the victim afterwards whatever state it is in
//  - animate ONLY via ctx.tween / ctx.wait (speed + tap-to-skip depend on it)
// Optional props on an anim fn: .only = ['n'] (piece types), .weight = 2, .label

import * as U from '../battle_util.js';

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
// battle-2: Classic battles staged for the locked Top view (see battle_util.js: camera push-in,
// fight spotlight, slow-mo impacts, shockwaves, fling/shards). Gold (white) vs black chrome.
//  - clash:  three escalating blade-less clashes, sparks + shockwaves; the victim is flung
//            bouncing across the board and off the edge
//  - topple: one heavy hit, the victim teeters, topples and SHATTERS like porcelain (gold/ivory)
//            or obsidian (black chrome)
//  - duel:   gold-vs-chrome lightning duel; the beams struggle, the attacker's wins, victim bursts
//  - stomp:  leap high and slam down: flattened, shattered, shockwave
const SIDE = {
  w: { main: '#ffc84a', light: '#fff0b8', bolt: '#ffd36a', spark: ['#ffffff', '#fff2c0', '#ffd36a', '#ffae2a'] },
  b: { main: '#9fb6ff', light: '#e6edff', bolt: '#b8ccff', spark: ['#ffffff', '#e6edff', '#9fb6ff', '#ff5a5a'] },
};
const side = c => SIDE[c] || SIDE.w;
const { THREE, R, sin, max } = U;
const BODY = { w: ['#f4c76a', '#c99b45', '#fff0c0', '#e8d29a', '#ffffff'], b: ['#141519', '#24262d', '#8a90a0', '#0b0c0f', '#c0303a'] };
const body = c => BODY[c] || BODY.w;
const vh = U.vh;

/** Three escalating clashes; the victim is flung bouncing off the board. */
export async function clash(ctx) {
  const c = U.prep(ctx, 3900);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), dir = kit.flatDir(A.position, victimPos, c.dir);
  await U.stage(c, async () => {
    const standoff = victimPos.clone().addScaledVector(dir, -0.9);
    U.sound(c, 'whoosh', { at: A.position });
    await kit.hopTo(c, A, standoff, { ms: 260, height: 0.5, squash: 0.1 });
    const a0 = A.position.clone(), v0 = V.position.clone();
    for (let i = 0; i < 3; i++) {
      const big = i === 2;
      await c.tween(big ? 200 : 120, e => { kit.setLean(A, dir, -(0.3 + 0.1 * i) * e); kit.setLean(V, dir, (0.2 + 0.05 * i) * e); }, kit.ease.quadOut);
      await c.tween(80, e => {
        A.position.lerpVectors(a0, a0.clone().addScaledVector(dir, 0.3), e); V.position.lerpVectors(v0, v0.clone().addScaledVector(dir, -0.12), e);
        kit.setLean(A, dir, -(0.3 + 0.1 * i) + 0.7 * e); kit.setLean(V, dir, (0.2 + 0.05 * i) - 0.4 * e);
      }, kit.ease.quadIn);
      const hit = victimPos.clone().addScaledVector(dir, -0.45); hit.y = 0.55;
      const both = [...S.spark, ...side(c.victimColor).spark.slice(1, 3)];
      if (!big) {
        fx.sparks(hit, { count: c.n(70 + 30 * i), colors: both, dir: new THREE.Vector3(-dir.z, 0.6, dir.x).multiplyScalar(i ? -1 : 1), spread: 1.1, speed: [3, 8], size: [0.08, 0.16] });
        fx.flash(hit, { color: S.main, radius: 2.0 + 0.5 * i, ms: 200 });
        fx.ring(hit.clone().setY(0), { radius: 1.3 + 0.4 * i, color: S.main, thick: true, ms: 320 });
        fx.ring(hit.clone().setY(0), { radius: 1.4 + 0.4 * i, dark: true, ms: 320, alpha: 0.35 });
        U.sound(c, 'clash', { at: hit });
        kit.shake(c, 0.05 + 0.02 * i, 160);
        kit.flashObject(c, V, '#ffffff', 140);
        await c.tween(110, e => { A.position.lerpVectors(a0.clone().addScaledVector(dir, 0.3), a0, e); V.position.lerpVectors(v0.clone().addScaledVector(dir, -0.12), v0, e); kit.setLean(A, dir, 0.4 * (1 - e)); kit.setLean(V, dir, -0.2 * (1 - e)); }, kit.ease.quadOut);
      } else {
        U.impact(c, hit, { color: S.main, power: 1.15, sparks: both, debris: body(c.victimColor), sfx: 'hit', tintStrength: 0.18 });
        kit.flashObject(c, V, '#ffffff', 200);
        V.quaternion.identity();
        await Promise.all([
          U.fling(c, V, dir, { ms: 1100, up: 6, speed: 5.8, spin: 16 }),
          c.tween(160, e => kit.setLean(A, dir, 0.4 * (1 - e))).then(() => c.wait(300)).then(() => kit.hopTo(c, A, c.to, { ms: 260, height: 0.4, squash: 0.25 })),
        ]);
      }
    }
  });
  U.finish(c);
}
clash.label = 'heavy clash & fling';

/** One heavy blow: the victim teeters, topples and shatters like porcelain / obsidian. */
export async function topple(ctx) {
  const c = U.prep(ctx, 3730);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), dir = kit.flatDir(A.position, victimPos, c.dir);
  await U.stage(c, async () => {
    const standoff = victimPos.clone().addScaledVector(dir, -0.85);
    U.sound(c, 'slide', { at: A.position });
    await kit.slideTo(c, A, standoff, { ms: 240 });
    U.sound(c, 'swing', { at: victimPos });
    await c.tween(220, e => { kit.setLean(A, dir, -0.45 * e); A.scale.set(1 + 0.12 * e, 1 - 0.14 * e, 1 + 0.12 * e); }, kit.ease.quadOut);
    const a0 = A.position.clone();
    await c.tween(80, e => { A.position.lerpVectors(a0, a0.clone().addScaledVector(dir, 0.35), e); kit.setLean(A, dir, -0.45 + 0.75 * e); A.scale.set(1.12 - 0.12 * e, 0.86 + 0.14 * e, 1.12 - 0.12 * e); }, kit.ease.quadIn);
    const hit = victimPos.clone().addScaledVector(dir, -0.3); hit.y = 0.6;
    fx.sparks(hit, { count: c.n(80), colors: S.spark, dir: dir.clone().setY(0.6), speed: [3, 8], size: [0.08, 0.16] });
    fx.flash(hit, { color: S.main, radius: 2.2 });
    fx.ring(victimPos, { radius: 1.4, color: S.main, thick: true, ms: 320 });
    U.sound(c, 'hit', { at: hit });
    kit.shake(c, 0.07, 200);
    kit.flashObject(c, V, '#ffffff', 160);
    // teeter: rock back and forth on its base, then go over
    const axis = kit.tiltAxis(dir);
    U.camTo(c, { point: victimPos.clone().addScaledVector(dir, 0.5), zoom: c._cam ? c._cam.zoom * 0.88 : 1 }, 400);
    await Promise.all([
      c.tween(170, e => { kit.setLean(A, dir, 0.3 * (1 - e)); A.position.lerpVectors(a0.clone().addScaledVector(dir, 0.35), a0, e); }),
      c.tween(460, (e, k) => { V.quaternion.setFromAxisAngle(axis, 0.32 * sin(k * PI * 2.5) * (1 - 0.3 * k)); }),
    ]);
    V.quaternion.identity();
    U.sound(c, 'topple', { at: victimPos });
    await kit.tipOver(c, V, dir, { ms: 300, radius: (V.userData.radius || 0.3) * 0.8, easing: kit.ease.quadIn });
    // SHATTER where it lands
    const land = V.position.clone().addScaledVector(dir, vh(V) * 0.4).setY(0.15);
    U.impact(c, land, { color: c.victimColor === 'w' ? '#fff0c0' : '#9fb6ff', power: 1.1, ring: 2.6, white: true, sfx: 'stone', tintStrength: 0.18,
      dust: c.victimColor === 'w' ? ['#e8d29a', '#c99b45', '#fff0c0'] : ['#24262d', '#3a3d46', '#141519'] });
    fx.sparkles(land, { count: c.n(40), colors: c.victimColor === 'w' ? ['#ffffff', '#fff0c0', '#ffd36a'] : ['#ffffff', '#cfd8ff', '#ff5a5a'], speed: [2, 5] });
    await Promise.all([
      U.shards(c, V, body(c.victimColor), { count: 110, ms: 1000, away: dir, up: [2.5, 7] }),
      c.wait(320).then(() => kit.hopTo(c, A, c.to, { ms: 280, height: 0.4, squash: 0.25 })),
    ]);
  });
  U.finish(c);
}
topple.label = 'topple & shatter';

/** Gold-vs-chrome lightning duel: beams lock, the struggle point slides, the attacker wins. */
export async function duel(ctx) {
  const c = U.prep(ctx, 3500);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), T = side(c.victimColor), hA = vh(A), hV = vh(V);
  await U.stage(c, async () => {
    const a0 = A.position.clone(), v0 = V.position.clone();
    U.sound(c, 'spell', { at: a0 });
    // both rise and charge
    await c.tween(320, (e, k) => {
      A.position.y = 0.35 * e; V.position.y = 0.25 * e;
      if (k < 1 && ((k * 8) | 0) !== (((k - 0.12) * 8) | 0)) {
        fx.sparkles(A.position.clone().setY(hA + 0.3), { count: c.n(10), colors: S.spark, speed: [0.5, 1.5] });
        fx.sparkles(V.position.clone().setY(hV * 0.8 + 0.25), { count: c.n(8), colors: T.spark, speed: [0.5, 1.5] });
      }
    }, kit.ease.quadOut);
    fx.ring(a0, { radius: 1.2, color: S.main, thick: true, ms: 400 });
    fx.ring(v0, { radius: 1.0, color: T.main, thick: true, ms: 400 });
    const pa = () => A.position.clone().setY(A.position.y + hA * 0.75), pv = () => V.position.clone().setY(V.position.y + hV * 0.6);
    // the struggle: junction point wobbles, then is driven into the victim
    let last = -1;
    U.sound(c, 'zap', { at: victimPos });
    await c.tween(900, (e, k) => {
      const j = 0.5 + 0.08 * sin(k * 25) * (1 - k) + 0.45 * kit.ease.quadIn(max(0, (k - 0.45) / 0.55));
      const J = pa().lerp(pv(), Math.min(0.97, j));
      if (k - last > 0.08 && k < 1) {
        last = k;
        fx.lightning(pa(), J, { color: S.bolt, width: 0.12, branches: 2, branchP: 0.25, ms: 110, light: false, flashRadius: 1.4 });
        if (j < 0.9) fx.lightning(pv(), J, { color: T.bolt, width: 0.1 * (1 - k * 0.6), branches: 2, branchP: 0.25, ms: 110, light: false, flashRadius: 1.0 });
        fx.boardFlash(k < 0.5 ? T.main : S.main, 120, 0.16);
        fx.sparks(J, { count: c.n(26), colors: [...S.spark, ...T.spark.slice(1, 3)], speed: [2.5, 6], up: 0.6 });
        fx.ring(J.clone().setY(0), { radius: 0.9, color: '#ffffff', ms: 200, alpha: 0.6 });
        kit.shake(c, 0.03, 90);
      }
      V.position.x = v0.x + R(-0.03, 0.03) * (k < 1); V.position.z = v0.z + R(-0.03, 0.03) * (k < 1);
    });
    // the attacker's beam wins
    U.sound(c, 'thunder', { at: victimPos });
    fx.lightning(pa(), pv(), { color: S.light, width: 0.18, branches: 3, branchP: 0.35, ms: 380, lightStrength: 0.5, flashRadius: 2.4 });
    for (let i = 0; i < 3; i++) fx.lightning(pv().setY(0.3), victimPos.clone().add(new THREE.Vector3(R(-2, 2), 0.03, R(-2, 2))), { color: S.bolt, width: 0.06, branches: 2, branchP: 0.3, ms: 320, light: false });
    kit.flashObject(c, V, S.light, 200, 2.5);
    U.impact(c, pv(), { color: S.main, power: 1.15, sparks: S.spark, sfx: 'explosion', tintStrength: 0.18 });
    await Promise.all([
      U.shards(c, V, body(c.victimColor), { count: 100, ms: 950 }),
      c.tween(260, e => { A.position.y = 0.35 * (1 - e); }, kit.ease.quadIn).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.4, squash: 0.25 })),
    ]);
  });
  U.finish(c);
}
duel.label = 'gold-vs-chrome lightning duel';
const duelRoyal = Object.assign(c => duel(c), { only: ['b', 'q', 'k'], weight: 1, label: 'lightning duel (royals/bishops)' });

/** Leap high and stomp: the victim is flattened and shatters, a shockwave rolls out. */
export async function stomp(ctx) {
  const c = U.prep(ctx, 2530);
  const { kit, attacker: A, victim: V, victimPos, to, fx } = c;
  await U.stage(c, async () => {
    const a0 = A.position.clone(), top = victimPos.clone(); top.y = vh(V) + 2.0;
    U.sound(c, 'swing', { at: a0 });
    await c.tween(420, (e, k) => { A.position.lerpVectors(a0, top, e); A.position.y = a0.y + (top.y - a0.y) * kit.ease.cubicOut(k); A.rotation.y = e * PI * 2; }, kit.ease.sineInOut);
    A.rotation.y = 0;
    await c.tween(110, (e, k) => kit.setLean(V, kit.flatDir(a0, victimPos, c.dir), 0.12 * Math.sin(k * PI * 4)));
    const land = victimPos.clone(); land.y = vh(V) * 0.12;
    const t0 = A.position.clone();
    await c.tween(110, e => A.position.lerpVectors(t0, land, e), kit.ease.quadIn);
    V.scale.set(1.6, 0.1, 1.6);
    const cols = body(c.victimColor);
    U.impact(c, victimPos.clone().setY(0.25), { color: side(c.color).main, power: 1.25, ring: 3.0, debris: cols, sfx: 'stomp', shake: 0.15, tintStrength: 0.18,
      dust: c.victimColor === 'w' ? ['#e8d29a', '#c99b45', '#8a8070'] : ['#24262d', '#3a3d46', '#141519'] });
    fx.scorch(victimPos, { radius: 1.0 });
    U.shards(c, V, cols, { count: 70, ms: 900, up: [2, 5] });
    await kit.squash(c, A, 0.35, 140);
    const l0 = A.position.clone(); l0.y = 0;
    A.position.copy(l0);
    if (kit.flatDist(l0, to) > 0.01) await kit.hopTo(c, A, to, { ms: 220, height: 0.3 });
    await c.wait(520);
  });
  U.finish(c);
}
stomp.label = 'stomp';

export const battleAnims = [clash, topple, duel, duelRoyal, stomp];
