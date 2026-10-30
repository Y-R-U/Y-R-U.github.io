// Sci-fi move animations (≤ ~350 ms, tweens only — see MODEL_GUIDE §7).
//  - hoverGlide: the drone lifts on its beam, banks into the move, glides with a thruster
//                flare and a short particle wake, then settles with a little bob.   (pawns)
//  - maglev:     the bastion lifts a hair off the deck on mag-lev, slides with a lagging
//                lean and a light trail of side-coloured sparks, and clamps down with a
//                ring pulse.                                                           (rooks)
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

export const moveAnims = [hop, slide, hoverGlide, maglev];
