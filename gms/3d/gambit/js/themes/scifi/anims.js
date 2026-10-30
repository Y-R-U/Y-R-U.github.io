// Sci-fi move animations (≤ ~350 ms, tweens only — see MODEL_GUIDE §7).
//  - hoverGlide: the drone lifts on its beam, banks into the move, glides with a thruster
//                flare and a short particle wake, then settles with a little bob.   (pawns)
//  - maglev:     the bastion lifts a hair off the deck on mag-lev, slides with a lagging
//                lean and a light trail of side-coloured sparks, and clamps down with a
//                ring pulse.                                                           (rooks)
//  - jumpJet:    the strider crouches, fires its jump-jets and leaps in an arc with a thruster
//                trail, then lands with a stomp ring and a spark skid.                   (knights)
//  - phaseBlink: the oracle collapses into a column of light, streaks along the diagonal and
//                re-forms out of a particle burst.                                       (bishops)
// Unbuilt piece types use Classic's hop / slide.
import { hop, slide } from '../classic/anims.js';
import { PAL } from './common.js';

const { PI, sin, min } = Math;
const sparkOf = c => (PAL[c] || PAL.w).spark;

/** Drone hover-glide: lift (50) -> glide (180–200) -> settle (50) -> bob (35) ≈ 315–335 ms. */
export async function hoverGlide(ctx) {
  const { kit, piece, from, to, fx, color, THREE } = ctx;
  const dir = kit.flatDir(from, to), axis = kit.tiltAxis(dir);
  const p = piece.position, cols = sparkOf(color), trail = (PAL[color] || PAL.w).trail, H = 0.16;
  const thrust = (pos, n, down = 1) => fx?.burst({ pos: pos.clone().setY(pos.y + 0.12), count: n, colors: cols,
    speed: [0.5, 1.5], dir: new THREE.Vector3(-dir.x * 0.6, -down, -dir.z * 0.6), spread: 0.4,
    life: [200, 360], size: [0.06, 0.11], sizeEnd: 0.15, drag: 2.2, shape: 0 });
  thrust(from, 16);
  fx?.ring?.(from, { radius: 0.42, color: cols[2], ms: 200 });
  await ctx.tween(50, e => {
    p.y = from.y + H * e;
    piece.quaternion.setFromAxisAngle(axis, -0.1 * e);         // nose up a touch as it lifts
  }, kit.ease.quadOut);
  let wake = 0;
  const span = kit.flatDist(from, to);
  const ms = min(200, 160 + ctx.dist * 20);
  await ctx.tween(ms, (e, k) => {
    p.lerpVectors(from, to, e);
    p.y = from.y + H * (1 - 0.35 * kit.ease.quadIn(k)) + 0.012 * sin(k * PI * 4);
    // bank into the move, then flare to brake
    piece.quaternion.setFromAxisAngle(axis, k < 0.65 ? 0.22 * sin((k / 0.65) * PI * 0.5) : 0.22 - 0.42 * sin(((k - 0.65) / 0.35) * PI * 0.5));
    // jet wake: a short glowing ribbon from the thruster, spawned evenly along the path
    if (ctx.tl?.instant) wake = e * span;
    while (wake + 0.08 <= e * span) {
      wake += 0.08;
      const q = from.clone().addScaledVector(dir, wake - 0.05); q.y = p.y + 0.15;
      fx?.burst({ pos: q, count: 1, colors: trail, speed: [0.05, 0.2], dir: new THREE.Vector3(0, -1, 0), spread: 0.3,
        life: [160, 260], size: [0.08, 0.11], sizeEnd: 0.2, drag: 3, shape: 0, alpha: 0.6 });
    }
  }, kit.ease.sineInOut);
  thrust(to, 12);
  const y0 = p.y;
  await ctx.tween(50, (e, k) => {
    p.set(to.x, to.y + (y0 - to.y) * (1 - e), to.z);
    piece.quaternion.setFromAxisAngle(axis, -0.2 * (1 - e));
  }, kit.ease.quadIn);
  piece.quaternion.identity(); p.copy(to);
  await kit.squash(ctx, piece, 0.08, 35);
}
hoverGlide.only = ['p']; hoverGlide.weight = 5; hoverGlide.label = 'hover glide';

/** Bastion mag-lev slide: lift (45) -> slide (165–210) -> clamp (50) -> squash (35) ≈ 295–340 ms. */
export async function maglev(ctx) {
  const { kit, piece, from, to, fx, color, THREE } = ctx;
  const dir = kit.flatDir(from, to), axis = kit.tiltAxis(dir);
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const p = piece.position, cols = sparkOf(color), trail = (PAL[color] || PAL.w).trail, H = 0.06;
  fx?.ring?.(from, { radius: 0.5, color: cols[2], ms: 220 });
  await ctx.tween(45, e => {
    p.y = from.y + H * e;
    piece.scale.set(1 - 0.03 * e, 1 + 0.04 * e, 1 - 0.03 * e);
  }, kit.ease.quadOut);
  const ms = min(210, 150 + ctx.dist * 15);
  let last = 0;
  const span = kit.flatDist(from, to);
  await ctx.tween(ms, (e, k) => {
    p.lerpVectors(from, to, e); p.y = from.y + H;
    // the top lags on launch and pitches forward on the brake
    kit.setLean(piece, dir, k < 0.5 ? -0.08 * sin(k * 2 * PI * 0.5) : -0.08 + 0.2 * sin((k - 0.5) * 2 * PI * 0.5));
    // light trail: two streams of sparks off the base, left behind
    // spawn evenly along the distance covered since the last frame -> a continuous ribbon
    const step = 0.07, travelled = e * span;
    if (ctx.tl?.instant) last = travelled;           // tap-to-skip: no burst of 100 particles
    while (last + step <= travelled) {
      last += step;
      const base = from.clone().addScaledVector(dir, last - 0.16).setY(from.y + 0.045);
      for (const s of [-1, 1]) {
        fx?.burst({ pos: base.clone().addScaledVector(side, s * 0.24), count: 1, colors: trail, speed: [0.01, 0.06], spread: 1,
          life: [260, 380], size: [0.11, 0.14], sizeEnd: 0.35, drag: 3, shape: 0, alpha: 0.55 });
      }
    }
  }, kit.ease.cubicInOut);
  kit.setLean(piece, dir, 0);
  await ctx.tween(50, e => {
    p.set(to.x, to.y + H * (1 - e), to.z);
    piece.scale.set(1 - 0.03 * (1 - e), 1 + 0.04 * (1 - e), 1 - 0.03 * (1 - e));
  }, kit.ease.quadIn);
  p.copy(to); piece.scale.set(1, 1, 1);
  fx?.ring?.(to, { radius: 0.62, color: cols[2], ms: 260 });
  fx?.burst({ pos: to.clone().setY(0.06), count: 10, colors: cols, speed: [0.6, 1.4], up: 0.1, spread: 1, life: [150, 280], size: [0.03, 0.06], sizeEnd: 0.1, drag: 2.5, shape: 1 });
  await kit.squash(ctx, piece, 0.07, 35);
}
maglev.only = ['r']; maglev.weight = 5; maglev.label = 'mag-lev slide';

/**
 * Strider jump-jet leap: crouch (45) -> launch flare + arc leap with a thruster trail (200–215)
 * -> landing stomp: ring, ground-hugging spark skid, squash (60) ≈ 305–320 ms.
 */
export async function jumpJet(ctx) {
  const { kit, piece, from, to, fx, color, THREE } = ctx;
  const dir = kit.flatDir(from, to), p = piece.position, pal = PAL[color] || PAL.w, cols = pal.spark;
  const span = kit.flatDist(from, to), H = Math.min(0.85, 0.5 + span * 0.1);
  await ctx.tween(45, e => { piece.scale.set(1 + 0.06 * e, 1 - 0.12 * e, 1 + 0.06 * e); kit.setLean(piece, dir, -0.08 * e); }, kit.ease.quadOut);
  // launch: jet wash blown out across the deck + a short plume under the hull + a ring
  fx?.burst({ pos: from.clone().setY(from.y + 0.08), count: 16, colors: cols, speed: [1.0, 2.0], flat: 0.85, up: 0.05, spread: 1,
    life: [160, 280], size: [0.08, 0.14], sizeEnd: 0.4, drag: 3, shape: 0, alpha: 0.85 });
  fx?.burst({ pos: from.clone().setY(from.y + 0.42), count: 8, colors: pal.trail, speed: [0.6, 1.2], dir: new THREE.Vector3(0, -1, 0), spread: 0.3,
    life: [120, 200], size: [0.1, 0.15], sizeEnd: 0.5, drag: 2.5, shape: 0 });
  fx?.ring?.(from, { radius: 0.5, color: cols[2], ms: 200 });
  let trail = 0;
  const q = new THREE.Vector3();
  await ctx.tween(Math.min(215, 190 + span * 8), (e, k) => {
    kit.arc(p, from, to, H, e);
    const s = 1 + 0.08 * Math.sin(Math.min(1, k * 4) * PI * 0.5) * (1 - k);
    piece.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    kit.setLean(piece, dir, -0.22 + 0.5 * e);               // nose up on the climb, down on the drop
    // thruster trail: evenly spaced glowing puffs under the hull while climbing
    if (ctx.tl?.instant) trail = e;
    while (trail + 0.06 <= Math.min(e, 0.7)) {
      trail += 0.06;
      kit.arc(q, from, to, H, trail); q.y += 0.42;
      fx?.burst({ pos: q, count: 2, colors: pal.trail, speed: [0.3, 0.9], dir: new THREE.Vector3(0, -1, 0), spread: 0.35,
        life: [150, 260], size: [0.1, 0.15], sizeEnd: 0.6, drag: 3, shape: 0, alpha: 0.7 });
    }
  }, kit.ease.sineInOut);
  p.copy(to); kit.setLean(piece, dir, 0); piece.scale.set(1, 1, 1);
  // stomp
  fx?.ring?.(to, { radius: 0.72, color: cols[2], ms: 260, thick: true });
  fx?.ring?.(to, { radius: 0.55, dark: true, ms: 220, alpha: 0.35 });
  fx?.burst({ pos: to.clone().setY(0.05), count: 14, colors: cols, speed: [1.2, 2.4], flat: 0.9, up: 0.05, spread: 1, life: [140, 260],
    size: [0.03, 0.06], sizeEnd: 0.1, drag: 3, shape: 1 });
  ctx.camera?.shake?.(0.02, 90);
  await kit.squash(ctx, piece, 0.14, 60);
}
jumpJet.only = ['n']; jumpJet.weight = 5; jumpJet.label = 'jump-jet leap';

/**
 * Psi Oracle phase-blink: collapse into a column of light shedding particles (85) -> a streak
 * of light races along the diagonal (110–140) -> re-form out of a particle burst with a
 * slight overshoot (95) ≈ 290–320 ms.
 */
export async function phaseBlink(ctx) {
  const { kit, piece, from, to, fx, color, THREE } = ctx;
  const p = piece.position, pal = PAL[color] || PAL.w, cols = pal.spark, dir = kit.flatDir(from, to);
  const span = kit.flatDist(from, to);
  const mote = (pos, n, o = {}) => fx?.burst({ pos, count: n, colors: cols, speed: o.speed || [0.4, 1.3], up: o.up ?? 0.5, spread: 1,
    life: o.life || [200, 360], size: [0.04, 0.08], sizeEnd: 0.2, drag: 2.2, gravity: -0.6, shape: 2, jitter: 0.12 });
  fx?.ring?.(from, { radius: 0.45, color: cols[2], ms: 200 });
  mote(from.clone().setY(from.y + 0.45), 16);
  await ctx.tween(85, e => {
    const w = 1 - 0.9 * e;
    piece.scale.set(w, 1 + 0.35 * e, w);
  }, kit.ease.cubicIn);
  fx?.flash?.(from.clone().setY(from.y + 0.5), { color: cols[1], radius: 0.5, ms: 140 });
  piece.scale.set(0.02, 0.02, 0.02);
  let done = 0;
  const q = new THREE.Vector3();
  await ctx.tween(Math.min(140, 100 + span * 6), (e) => {
    p.lerpVectors(from, to, e);
    if (ctx.tl?.instant) done = e * span;
    while (done + 0.1 <= e * span) {
      done += 0.1;
      q.copy(from).addScaledVector(dir, done); q.y = from.y + 0.5;
      fx?.burst({ pos: q, count: 1, colors: pal.trail, speed: [0.02, 0.1], spread: 1, life: [140, 240], size: [0.1, 0.14], sizeEnd: 0.1, drag: 3, shape: 2, alpha: 0.9 });
    }
  }, kit.ease.sineInOut);
  p.copy(to);
  fx?.flash?.(to.clone().setY(to.y + 0.5), { color: cols[1], radius: 0.55, ms: 160 });
  mote(to.clone().setY(to.y + 0.4), 14, { speed: [0.6, 1.4], up: 0.2 });
  fx?.ring?.(to, { radius: 0.55, color: cols[2], ms: 240 });
  await ctx.tween(95, (e) => {
    const w = 0.1 + 0.9 * e + 0.08 * Math.sin(e * PI);
    const h = 1.35 - 0.35 * e;
    piece.scale.set(w, h, w);
  }, kit.ease.quadOut);
  piece.scale.set(1, 1, 1); p.copy(to);
}
phaseBlink.only = ['b']; phaseBlink.weight = 5; phaseBlink.label = 'phase blink';

export const moveAnims = [hop, slide, hoverGlide, maglev, jumpJet, phaseBlink];
