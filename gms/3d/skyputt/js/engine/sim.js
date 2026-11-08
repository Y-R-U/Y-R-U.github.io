// Headless helpers on top of physics.js: run a shot to completion, trace a guide path.
import { DT, BALL_R } from './constants.js';
import { collideBalls } from './physics.js';

// Run one shot from the ball's current spot until it rests, drops or goes out.
// Returns { state, x, y, z, time, steps, events, path? }. Mutates `ball` and leaves world.time alone.
export function simulateShot(world, ball, vx, vz, { t0 = world.time, maxSteps = 240 * 40, trace = 0 } = {}) {
  world.shoot(ball, vx, vz);
  const path = trace ? [] : null;
  const events = [];
  let t = t0, steps = 0;
  while (ball.state === 'moving' && steps < maxSteps) {
    world.stepBall(ball, t);
    t += DT * world.clock; steps++;
    if (ball.events.length) { events.push(...ball.events); ball.events.length = 0; }
    if (trace && steps % trace === 0) path.push([ball.px, ball.py, ball.pz]);
  }
  return { state: ball.state, x: ball.px, y: ball.py, z: ball.pz, time: steps * DT, steps, events, path, t1: t };
}

// One fixed step for several real balls on the same hole: every moving ball steps in list order,
// then (collide) ball-vs-ball contacts resolve in pair order. The game's live loop (Round.update)
// and every replay call exactly this, so a shot with knocks replays bit-exactly anywhere.
export function stepBalls(world, balls, t, collide = true) {
  for (let i = 0; i < balls.length; i++) if (balls[i].state === 'moving' && !balls[i].kinematic) world.stepBall(balls[i], t);   // (kinematic: posed by its owner)
  if (collide && balls.length > 1) collideBalls(balls);
}
export const anyMoving = balls => balls.some(b => b.state === 'moving');

// simulateShot with other balls on the hole: shoot `ball`, step it and `others` (Ball[], usually at
// rest) until nothing moves. Struck balls roll, can drop or fall out (state cup / oob; an oob ball's
// `rest` is the spot it was knocked from). trace = physics steps per path sample; every ball's path
// is sampled on the same ticks from step 0, so they line up in time.
// Returns { state, x, y, z, time, steps, events, path, t1, others: [{ moved, state, x, y, z, path, events }] }.
export function simulateShotWith(world, ball, vx, vz, others, { t0 = world.time, maxSteps = 240 * 40, trace = 0, collide = true } = {}) {
  world.shoot(ball, vx, vz);
  const balls = [ball, ...others];
  const paths = balls.map(() => (trace ? [] : null));
  const evs = balls.map(() => []);
  const start = others.map(b => [b.px, b.py, b.pz]);
  let t = t0, steps = 0, ownSteps = 0;
  while (steps < maxSteps && anyMoving(balls)) {
    stepBalls(world, balls, t, collide);
    t += DT * world.clock; steps++;
    if (ball.state === 'moving') ownSteps = steps;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.events.length) { evs[i].push(...b.events); b.events.length = 0; }
      if (trace && steps % trace === 0) paths[i].push([b.px, b.py, b.pz]);
    }
  }
  return {
    state: ball.state, x: ball.px, y: ball.py, z: ball.pz, time: ownSteps * DT, steps, events: evs[0], path: paths[0], t1: t,
    others: others.map((b, k) => {
      const moved = evs[k + 1].some(e => e.type === 'knocked');
      return { moved, state: b.state, x: b.px, y: b.py, z: b.pz, from: start[k], rest: { ...b.rest }, path: paths[k + 1], events: evs[k + 1] };
    }),
  };
}

// Guide line: run the real sim forward from `ball` with the given velocity.
// Base length `len` metres of travel; stops at the bounce number `maxBounces + 1`.
// Returns an array of [x, y, z] points (ball centre) and the bounce points.
export function traceGuide(world, ball, vx, vz, { len = 1.2, maxBounces = 0, t0 = world.time, step = 3 } = {}) {
  const b = ball.clone();
  b.events = [];
  world.shoot(b, vx, vz);
  const pts = [[b.px, b.py, b.pz]];
  const bounces = [];
  let t = t0, dist = 0, i = 0;
  let lx = b.px, ly = b.py, lz = b.pz;
  while (b.state === 'moving' && i < 240 * 12) {
    world.stepBall(b, t); t += DT * world.clock; i++;
    dist += Math.hypot(b.px - lx, b.py - ly, b.pz - lz); lx = b.px; ly = b.py; lz = b.pz;
    let hit = false;
    for (const e of b.events) if (e.type === 'wall' || e.type === 'obstacle' || e.type === 'guard') hit = true;
    b.events.length = 0;
    if (hit) {
      pts.push([b.px, b.py, b.pz]);
      bounces.push([b.px, b.py, b.pz]);
      if (bounces.length > maxBounces) break;
    } else if (i % step === 0) pts.push([b.px, b.py, b.pz]);
    if (dist >= len) { pts.push([b.px, b.py, b.pz]); break; }
  }
  if (b.state !== 'moving') pts.push([b.px, b.py, b.pz]);
  return { pts, bounces, end: b.state, radius: BALL_R };
}
