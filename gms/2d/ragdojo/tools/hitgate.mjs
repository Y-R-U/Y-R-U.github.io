#!/usr/bin/env node
/**
 * Hitboxes must be live for a window, not for one instant, and a sweeping move must catch
 * everyone it travels over.
 *
 *   node tools/hitgate.mjs
 *   node tools/hitgate.mjs --falsify   # single-frame hitboxes again, watch it go red
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
const { LEVELS, MOVES, moveStats } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');
const falsify = process.argv.includes('--falsify');

const DT = 1 / 60;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

function save() {
  const s = DEFAULT();
  for (const m of MOVES) s.moves[m.id] = { owned: true, power: 0, cd: 0 };
  return s;
}

/** Fire `id` from `gap` units away against `n` enemies spaced `spacing` apart. */
function fire(id, { gap, n = 1, spacing = 46, level = 18 }) {
  const sv = save();
  const m = new Match({ level: LEVELS[level], save: sv, onEnd: () => {} });
  if (falsify) {
    // The old behaviour: one shot at the first frame of the hit frame, and nothing after.
    for (const f of m.all) {
      const upd = f.update.bind(f);
      f.update = (dt, world, onHit) => upd(dt, world, (a, A) => { if (!A.__once) { A.__once = true; onHit(a, A); } });
    }
  }
  m.brains.length = 0;
  const base = m.player.x + gap;
  const live = m.enemies.slice(0, n);
  m.enemies.length = 0;
  m.all.length = 0;
  m.all.push(m.player, ...live);
  m.enemies.push(...live);
  live.forEach((e, i) => {
    e.hp = 1e9;
    e.x = base + i * spacing;
    e.place(e.x, m.world.groundY);
  });
  m.player.facing = 1;
  const fired = id === 'punch' ? !!m.player.strike() : m.player.special(moveStats(sv, id));
  let hits = 0;
  const seen = new Set();
  for (let t = 0; t < 2.2; t += DT) {          // long enough for a thrown projectile to land
    m.update(DT, null);
    for (const e of live) if (!seen.has(e.id) && e.hp < 1e9) { seen.add(e.id); hits++; }
    m.player.facing = 1;
  }
  return { fired, hits };
}

// 6. A flip kick must connect over the distance it travels, not only point-blank.
for (const gap of [60, 110, 150, 190]) {
  const r = fire('flipF', { gap });
  ok(`flip kick connects from ${gap}u`, r.fired && r.hits === 1, `hits=${r.hits}`);
}

// A single-frame strike still needs a forgiving window at its own range.
for (const gap of [46, 62]) {
  const r = fire('punch', { gap });
  ok(`punch connects from ${gap}u`, r.hits === 1, `hits=${r.hits}`);
}

// 7. Sweeping and area moves must catch more than one body.
const sweeps = [
  ['flipF', { gap: 60, n: 3 }],
  ['dash', { gap: 90, n: 3 }],
  ['slam', { gap: 55, n: 3 }],
  ['bomb', { gap: 150, n: 3 }],
];
for (const [id, opts] of sweeps) {
  const r = fire(id, opts);
  ok(`${id} hits a line of 3`, r.fired && r.hits >= 2, `hits=${r.hits}`);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
