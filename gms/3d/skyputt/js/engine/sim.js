// Headless helpers on top of physics.js: run a shot to completion, trace a guide path.
import { DT, BALL_R } from './constants.js';

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
