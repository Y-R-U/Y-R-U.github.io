// Fantasy move animations (all ≤ ~350 ms, tweens only — see MODEL_GUIDE §7).
//  - gallop: the warhorse rears, bounds in a big arc pitching forward, then a short second
//            stride bob on landing with a puff of dust.          (knights)
//  - blink:  the wizard spins down into a burst of sparkles and pops up on the target square
//            in a second burst (side-coloured).                  (bishops)
//  - march:  the squire marches in 2–3 swaying hops with dust at each footfall (pawns)
//  - grind:  the watchtower rocks loose, grinds across with a shudder and dust, lands with a thud (rooks)
// Other piece types use Classic's hop / slide until their fantasy models land.
import { hop, slide } from '../classic/anims.js';

const { PI, sin } = Math;
const SPARK = { w: ['#ffffff', '#9fd0ff', '#4f8fff', '#ffe08a'], b: ['#ffffff', '#ff8a6a', '#ff2a1a', '#ffd08a'] };

/** Warhorse gallop: rear, bound (~78% of the way), short stride bob, settle. */
export async function gallop(ctx) {
  const { kit, piece, from, to, fx } = ctx;
  const dir = kit.flatDir(from, to), axis = kit.tiltAxis(dir);
  const p = piece.position, mid = from.clone().lerp(to, 0.78);
  // bound: nose up on take-off, nose down coming in
  await ctx.tween(215, (e, k) => {
    kit.arc(p, from, mid, 0.75, e);
    piece.quaternion.setFromAxisAngle(axis, -0.5 * sin(k * PI) * (k < 0.5 ? 1 : 0) + 0.32 * sin(Math.max(0, k - 0.45) / 0.55 * PI));
  }, kit.ease.sineInOut);
  // stride bob into the square
  await ctx.tween(95, (e, k) => {
    kit.arc(p, mid, to, 0.12, e);
    piece.quaternion.setFromAxisAngle(axis, -0.18 * sin(k * PI));
  }, kit.ease.quadOut);
  piece.quaternion.identity();
  p.copy(to);
  fx?.dust(to.clone().setY(0.05), { count: 10, colors: ['#bfb6a6', '#8d8577'], speed: [0.5, 1.4], up: 0.5, size: [0.04, 0.08], life: [250, 450] });
  await kit.squash(ctx, piece, 0.2, 50);
}
gallop.only = ['n']; gallop.weight = 4; gallop.label = 'gallop';

/** Wizard blink: spin-shrink into sparkles, reappear on the target with a pop. */
export async function blink(ctx) {
  const { kit, piece, from, to, fx, color } = ctx;
  const colors = SPARK[color] || SPARK.w;
  const p = piece.position;
  fx?.sparkles(from.clone().setY(0.55), { count: 16, colors, speed: [0.3, 1.2], life: [250, 450], size: [0.05, 0.11] });
  await ctx.tween(125, e => {
    piece.scale.set(1 - 0.92 * e, 1 + 0.35 * e, 1 - 0.92 * e);   // stretch thin as it vanishes
    piece.rotation.y = e * PI * 1.5;
    p.y = from.y + 0.15 * e;
  }, kit.ease.quadIn);
  p.copy(to); p.y = to.y + 0.15;
  fx?.sparkles(to.clone().setY(0.55), { count: 20, colors, speed: [0.4, 1.4], life: [300, 520], size: [0.05, 0.12] });
  fx?.ring?.(to, { radius: 0.55, color: colors[2] });
  await ctx.tween(165, (e, k) => {
    const s = 0.08 + 0.92 * e;                                    // backOut overshoots a touch
    piece.scale.set(s, s * (1 + 0.3 * (1 - k)), s);
    piece.rotation.y = PI * 1.5 + e * PI * 0.5;
    p.y = to.y + 0.15 * (1 - e);
  }, kit.ease.backOut);
  piece.rotation.y = 0; piece.scale.set(1, 1, 1); p.copy(to);
  await kit.squash(ctx, piece, 0.12, 45);
}
blink.only = ['b']; blink.weight = 4; blink.label = 'wizard blink';

const DUST = { w: ['#e9dfc9', '#c9bea8', '#a89c86'], b: ['#8a8590', '#5e5a64', '#c9bea8'] };

/**
 * Squire march: two (three for a double step) quick marching hops with a side-to-side sway
 * (the shield arm bobs out and back), leaning into the walk; a scuff of dust at each footfall
 * and a small stamp on arrival. 280 ms + 45 ms.
 */
export async function march(ctx) {
  const { kit, piece, from, to, fx, THREE, dist, color } = ctx;
  const dir = kit.flatDir(from, to), lean = kit.tiltAxis(dir);
  const n = (dist ?? from.distanceTo(to)) > 1.5 ? 3 : 2;
  const p = piece.position, q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const dust = DUST[color] || DUST.w;
  let step = 0;
  await ctx.tween(280, (e, k) => {
    const s = Math.min(n - 1e-6, k * n), i = Math.floor(s), f = s - i;
    const t = (i + kit.ease.sineInOut(f)) / n;
    p.lerpVectors(from, to, t);
    p.y = from.y + 4 * 0.075 * f * (1 - f);
    q1.setFromAxisAngle(lean, 0.13 * sin(k * PI));                    // lean into the march
    q2.setFromAxisAngle(dir, (i % 2 ? 1 : -1) * 0.15 * sin(f * PI));   // sway: shield side, spear side
    piece.quaternion.multiplyQuaternions(q1, q2);
    if (i > step) {                                                    // a footfall
      step = i;
      fx?.dust(p.clone().setY(0.04), { count: 4, colors: dust, speed: [0.3, 0.8], up: 0.35, size: [0.03, 0.05], life: [180, 300] });
    }
  }, kit.ease.linear);
  piece.quaternion.identity(); p.copy(to);
  fx?.dust(to.clone().setY(0.04), { count: 7, colors: dust, speed: [0.4, 1.1], up: 0.4, size: [0.03, 0.06], life: [220, 380] });
  await kit.squash(ctx, piece, 0.14, 45);
}
march.only = ['p']; march.weight = 5; march.label = 'squire march';

/**
 * Watchtower grind: the tower rocks back as it breaks loose, then grinds across the board in a
 * shuddering slide trailing stone dust, and lands with a heavy thud (squash + dust ring).
 * 55 + 235 + 55 ms.
 */
export async function grind(ctx) {
  const { kit, piece, from, to, fx, THREE, color } = ctx;
  const dir = kit.flatDir(from, to), axis = kit.tiltAxis(dir);
  const p = piece.position, dust = DUST[color] || DUST.w;
  const puff = (pos, count, big) => fx?.dust(pos.clone().setY(0.05), { count, colors: dust, speed: big ? [0.6, 1.6] : [0.3, 0.9], up: big ? 0.5 : 0.3, size: big ? [0.05, 0.1] : [0.04, 0.08], life: [260, 480] });
  // break loose: rock back and settle a touch
  puff(from, 6, false);
  await ctx.tween(55, (e, k) => {
    kit.setLean(piece, dir, -0.07 * sin(k * PI));
    piece.scale.set(1 + 0.04 * e, 1 - 0.06 * e, 1 + 0.04 * e);
  }, kit.ease.quadOut);
  // grind: heavy ease, shudder, top lags then pitches forward as it brakes
  let trail = 0;
  await ctx.tween(235, (e, k) => {
    p.lerpVectors(from, to, e);
    const shake = sin(k * 70) * (1 - k * 0.6);
    p.y = from.y + 0.012 * Math.abs(shake);
    kit.setLean(piece, dir, (k < 0.55 ? -0.06 : 0.09 * sin((k - 0.55) / 0.45 * PI)) + 0.02 * shake, 0.02 * sin(k * 53));
    const sq = 0.06 * (1 - k);
    piece.scale.set(1 + 0.04 * (1 - k), 1 - sq, 1 + 0.04 * (1 - k));
    if (k > (trail + 1) * 0.28 && trail < 3) { trail++; puff(p.clone().addScaledVector(dir, -0.25), 4, false); }
  }, kit.ease.cubicInOut);
  kit.setLean(piece, dir, 0); piece.scale.set(1, 1, 1); p.copy(to);
  // thud
  puff(to, 12, true);
  fx?.ring?.(to, { radius: 0.6, color: color === 'b' ? '#ff8a5a' : '#ffe2a0', ms: 260 });
  await kit.squash(ctx, piece, 0.12, 55);
}
grind.only = ['r']; grind.weight = 5; grind.label = 'tower grind';

// generic moves for every piece (the fantasy pieces still get them now and then)
export const moveAnims = [hop, slide, gallop, blink, march, grind];
