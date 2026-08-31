#!/usr/bin/env node
/**
 * The crossing rule, as a test: standing fighters are solid and cannot walk through each
 * other; jumping over someone is the only way to swap sides.
 *
 *   node tools/crossgate.mjs
 *   node tools/crossgate.mjs --falsify   # disable separate() and watch it go red
 */
const noopCtx = new Proxy({}, { get: (t, k) => {
  if (k === 'canvas') return { width: 0, height: 0 };
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  return () => {};
}, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const { Match } = await import('../js/match.js');
const { LEVELS } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');
const falsify = process.argv.includes('--falsify');

const DT = 1 / 120;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

function scenario({ jump, seconds = 3.0 }) {
  const m = new Match({ level: LEVELS[0], save: DEFAULT(), onEnd: () => {} });
  if (falsify) m.separate = () => {};
  m.brains.length = 0;                       // enemy stands still
  const e = m.enemies[0];
  e.hp = 1e9; m.player.hp = 1e9;             // nobody dies, nobody gets knocked down
  m.player.x = e.x - 200;
  m.player.place(m.player.x, m.world.groundY);
  const startLeft = m.player.x < e.x;
  let crossed = false, jumped = false, minGap = 1e9;
  for (let t = 0; t < seconds; t += DT) {
    e.vx = 0; e.x = e.x;                     // pin the target
    m.player.move(1, DT);                    // hold "forward" the whole time
    // Jump from right up against them, which is what a player actually does.
    if (jump && !jumped && Math.abs(m.player.x - e.x) < 60) { m.player.jump(); jumped = true; }
    m.update(DT, null);
    minGap = Math.min(minGap, Math.abs(m.player.x - e.x));
    if ((m.player.x < e.x) !== startLeft) crossed = true;
  }
  return { crossed, minGap: Math.round(minGap), jumped };
}

const walk = scenario({ jump: false });
ok('walking into someone does NOT cross sides', !walk.crossed, `closest gap ${walk.minGap}u`);
ok('walking stops at a solid body', walk.minGap >= 30 && walk.minGap < 55, `gap ${walk.minGap}u`);

const hop = scenario({ jump: true });
ok('jumping over them DOES cross sides', hop.crossed, `jumped=${hop.jumped}`);

// A floored body must not block — you step over it.
const m = new Match({ level: LEVELS[0], save: DEFAULT(), onEnd: () => {} });
if (falsify) m.separate = () => {};
m.brains.length = 0;
const e = m.enemies[0];
m.player.hp = 1e9;
m.player.x = e.x - 200; m.player.place(m.player.x, m.world.groundY);
e.goDown(0, 0, true);                        // knocked out on the floor
const startLeft = m.player.x < e.x;
let steppedOver = false;
for (let t = 0; t < 4; t += DT) {
  m.player.move(1, DT);
  m.update(DT, null);
  if ((m.player.x < e.x) !== startLeft) steppedOver = true;
}
ok('a floored fighter does not block you', steppedOver);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
