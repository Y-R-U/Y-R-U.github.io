#!/usr/bin/env node
/** Synthetic strokes through the classifier, with jitter, to prove each gesture is separable. */
import { classify } from '../js/gestures.js';

const R = (n) => (Math.random() * 2 - 1) * n;
const jit = (pts, n) => pts.map(([x, y]) => ({ x: x + R(n), y: y + R(n) }));

function line(x0, y0, x1, y1, n = 18) {
  return Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);
}
function arcPts(cx, cy, r, a0, a1, n = 24) {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (a1 - a0) * i / (n - 1);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}
const CASES = {
  slash:    () => line(0, 100, 90, 10),
  slashAlt: () => line(0, 100, -90, 10),
  up:       () => line(0, 100, 5, -20),
  down:     () => line(0, -20, 5, 100),
  right:    () => line(-60, 0, 70, 6),
  leftward: () => line(70, 0, -60, 6),
  archUp:   () => arcPts(0, 0, 60, Math.PI, Math.PI * 2),
  vee:      () => [...line(-55, -45, 0, 45, 10), ...line(0, 45, 55, -45, 10)],
  circleCW: () => arcPts(0, 0, 55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 30),
  circleCCW:() => arcPts(0, 0, 55, -Math.PI / 2, -Math.PI / 2 - Math.PI * 2, 30),
};
const EXPECT = { slash: 'slash', slashAlt: 'slash', up: 'up', down: 'down', right: 'right',
  leftward: 'right', archUp: 'archUp', vee: 'vee', circleCW: 'circleCW', circleCCW: 'circleCCW' };

let pass = 0, fail = 0;
const TRIALS = 300;
for (const [name, gen] of Object.entries(CASES)) {
  const counts = {};
  for (let i = 0; i < TRIALS; i++) {
    const got = classify(jit(gen(), 5), 0.5) || 'null';
    counts[got] = (counts[got] || 0) + 1;
  }
  const want = EXPECT[name];
  const rate = (counts[want] || 0) / TRIALS;
  const ok = rate >= 0.9;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(10)} ${(rate * 100).toFixed(0)}% -> ${want}   ${JSON.stringify(counts)}`);
}
// A tap must never fire a special.
let tapWrong = 0;
for (let i = 0; i < 300; i++) if (classify(jit(line(0, 0, 6, 4, 5), 3), 0.08)) tapWrong++;
console.log(`${tapWrong === 0 ? 'PASS' : 'FAIL'} tap-is-not-a-gesture  ${tapWrong} false fires`);
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail || tapWrong ? 1 : 0);
