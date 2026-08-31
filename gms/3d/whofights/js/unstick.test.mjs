import { test, eq, ok } from '../tools/harness.mjs';
import { Unstick, wedged } from './unstick.js';

// Resolvers with the shape js/player.js hands in: where a step actually lands.
const free = (x0, z0, x1, z1) => ({ x: x1, z: z1 });
const pinned = x0 => (a, b) => ({ x: a, z: b });
const wall = z => (x0, z0, x1, z1) => ({ x: x1, z: Math.max(z, z1) });

const walk = (u, from, steps, { asking = true, resolve = free, dt = 1 / 60 } = {}) => {
  let out = null;
  for (let i = 0; i < steps; i++) out = u.step(dt, from.x, from.z, 0, asking, resolve) || out;
  return out;
};

test('a point with a way out in any direction is not wedged', () => {
  eq(wedged(0, 0, 0, 0.4, free), false);
  eq(wedged(0, 0, 0, 0.4, wall(0)), false, 'a wall on one side still leaves seven ways out');
  eq(wedged(0, 0, 0, 0.4, pinned()), true);
});

test('pressed against a wall is not stuck, however long the stick is held', () => {
  const u = new Unstick();
  u.step(1 / 60, 0, 5, 0, true, wall(5));
  eq(walk(u, { x: 0, z: 5 }, 240, { resolve: wall(5) }), null);
});

test('a wedge frees the player, but only after the timer', () => {
  const u = new Unstick({ secs: 0.7 });
  // Two seconds of real walking lays the trail he is put back onto.
  for (let i = 0; i < 120; i++) u.step(1 / 60, i * 0.08, 0, 0, true, free);
  const held = u.last;
  eq(walk(u, held, 30, { resolve: pinned() }), null, 'half a second is not long enough');
  const out = walk(u, held, 30, { resolve: pinned() });
  ok(out, 'still wedged after the timer and not freed');
  ok(Math.hypot(out.x - held.x, out.z - held.z) > 0.6, 'freed to somewhere he was not already');
});

test('standing still with no input is never mistaken for being stuck', () => {
  const u = new Unstick();
  u.step(1 / 60, 3, 3, 0, false, pinned());
  eq(walk(u, { x: 3, z: 3 }, 600, { asking: false, resolve: pinned() }), null);
});

test('the freed point is one the player really stood on', () => {
  const u = new Unstick();
  const path = [];
  for (let i = 0; i < 90; i++) { path.push({ x: i * 0.1, z: 0 }); u.step(1 / 60, i * 0.1, 0, 0, true, free); }
  const out = walk(u, path[path.length - 1], 60, { resolve: pinned() });
  ok(out, 'not freed');
  ok(path.some(p => Math.hypot(p.x - out.x, p.z - out.z) < 1e-6), `${JSON.stringify(out)} is off the path`);
});

test('a second wedge goes further back rather than bouncing off the same crumb', () => {
  const u = new Unstick();
  for (let i = 0; i < 200; i++) u.step(1 / 60, i * 0.06, 0, 0, true, free);
  const a = walk(u, u.last, 60, { resolve: pinned() });
  const b = walk(u, u.last, 60, { resolve: pinned() });
  ok(a && b, 'both wedges should free him');
  ok(b.x < a.x, `second escape ${b.x} is not further back than ${a.x}`);
});
