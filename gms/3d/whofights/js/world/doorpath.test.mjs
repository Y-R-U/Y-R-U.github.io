import { test, eq, ok, near } from '../../tools/harness.mjs';
import { pathEase, pathSpeed, K_MAX } from './doorpath.js';

const Ks = [0, 0.4, 1, 1.25, 2, 2.9, K_MAX];

test('the walk starts where it starts and ends where it ends', () => {
  for (const k of Ks) {
    near(pathEase(0, k), 0, 1e-9, `k=${k} start`);
    near(pathEase(1, k), 1, 1e-9, `k=${k} end`);
  }
});

test('it arrives at rest, whatever speed it left at', () => {
  for (const k of Ks) near(pathSpeed(1, k), 0, 1e-9, `k=${k}`);
});

test('it leaves at the speed it was handed', () => {
  for (const k of Ks) near(pathSpeed(0, k), k, 1e-9, `k=${k}`);
});

// This is the bug itself: a smootherstep per leg gave three 0-peak-0 humps, so the player came to
// a halt twice on the way through the door. One accelerate and one decelerate, and nothing in
// between may even slow down and pick up again.
test('the walk speeds up once and slows down once', () => {
  for (const k of Ks) {
    const v = [];
    for (let i = 0; i <= 200; i++) v.push(pathSpeed(i / 200, k));
    let dips = 0;
    for (let i = 1; i < v.length - 1; i++) if (v[i] < v[i - 1] && v[i] < v[i + 1]) dips++;
    eq(dips, 0, `k=${k} stalls mid-walk`);
    for (let i = 1; i < v.length - 1; i++) ok(v[i] > 0, `k=${k} stopped dead at u=${i / 200}`);
  }
});

test('distance covered only ever goes forwards', () => {
  for (const k of Ks) {
    let last = -1;
    for (let i = 0; i <= 200; i++) {
      const s = pathEase(i / 200, k);
      ok(s > last, `k=${k} went backwards at u=${i / 200}`);
      last = s;
    }
  }
});

// An entry speed above K_MAX is what a sprint into a door hands it, and the raw cubic turns
// non-monotonic there — the player would visibly walk back out of the doorway mid-script.
test('an over-fast arrival is clamped rather than trusted', () => {
  eq(pathEase(0.5, 12), pathEase(0.5, K_MAX), 'clamped at the top');
  eq(pathEase(0.5, -3), pathEase(0.5, 0), 'clamped at the bottom');
  let last = -1;
  for (let i = 0; i <= 200; i++) {
    const s = pathEase(i / 200, 12);
    ok(s > last, `a 12 path-length arrival went backwards at u=${i / 200}`);
    last = s;
  }
});

test('a standing start is the plain smoothstep it always was', () => {
  for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    near(pathEase(u, 0), u * u * (3 - 2 * u), 1e-9, `u=${u}`);
  }
});
