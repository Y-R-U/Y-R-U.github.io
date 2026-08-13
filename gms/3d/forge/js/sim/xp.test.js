import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_LEVEL, xpToReach, levelFor, levelCost, tierMul, repMul, grantXp, grasp, progress, newStreaks, bumpStreak } from './xp.js';
import { SCHOOLS, affinityXp, affinityPower, unlocked, MILESTONE_LEVELS } from './schools.js';
import { makeRng, roll, salt } from './rng.js';

test('the curve reproduces the SYSTEMS §3.1 table exactly', () => {
  const table = [
    [1, 0, 0], [2, 75, 75], [3, 332, 257], [4, 854, 522], [5, 1700, 846],
    [6, 2920, 1220], [7, 4559, 1639], [8, 6657, 2098], [9, 9250, 2593], [10, 12375, 3125],
    [11, 16061, 3686], [12, 20340, 4279], [13, 25241, 4901], [14, 30791, 5550], [15, 37018, 6227],
    [16, 43946, 6928], [17, 51600, 7654], [18, 60003, 8403], [19, 69180, 9177], [20, 79153, 9973],
  ];
  for (const [L, total, cost] of table) {
    assert.equal(xpToReach(L), total, `xpToReach(${L})`);
    assert.equal(levelCost(L), cost, `levelCost(${L})`);
  }
});

test('levelFor is the inverse and clamps at the cap', () => {
  for (let L = 1; L <= MAX_LEVEL; L++) {
    assert.equal(levelFor(xpToReach(L)), L);
    if (L > 1) assert.equal(levelFor(xpToReach(L) - 1), L - 1);
  }
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(1e9), MAX_LEVEL);
});

test('ten schools to 20 is 791,530 XP', () => {
  assert.equal(xpToReach(20) * 10, 791530);
});

test('SYSTEMS §11 realistic end state is 356,460 XP at Grasp 134', () => {
  // Three schools at 20, THREE at 14, FOUR at 8. §3.1's prose says four at 14 and three at 8,
  // which is 380,594 at Grasp 140 and does not match the §11 table it claims to describe.
  const asTabled = 3 * xpToReach(20) + 3 * xpToReach(14) + 4 * xpToReach(8);
  assert.equal(asTabled, 356460);
  assert.equal(3 * 20 + 3 * 14 + 4 * 8, 134);

  const asProsed = 3 * xpToReach(20) + 4 * xpToReach(14) + 3 * xpToReach(8);
  assert.equal(asProsed, 380594);
  assert.equal(3 * 20 + 4 * 14 + 3 * 8, 140);
});

test('tierMul matches the §3.3 table', () => {
  assert.equal(tierMul(1, 1), 1);
  assert.equal(tierMul(5, 1), 1);
  assert.equal(+tierMul(6, 1).toFixed(2), 0.85);
  assert.equal(+tierMul(11, 1).toFixed(3), 0.377);
  assert.equal(+tierMul(16, 1).toFixed(2), 0.17);
  assert.equal(+tierMul(20, 1).toFixed(3), 0.087);
  assert.equal(tierMul(30, 1), 0.05);
});

test('a grain rat bottoms out at 0.087, not the 0.05 floor, because the cap is 20', () => {
  assert.equal(+tierMul(MAX_LEVEL, 1).toFixed(3), 0.087);
  assert.ok(tierMul(MAX_LEVEL, 1) > 0.05);
});

test('repMul holds for eight uses then decays to a 0.35 floor', () => {
  assert.equal(repMul(0), 1);
  assert.equal(repMul(7), 1);
  assert.equal(repMul(8), 1);
  assert.equal(+repMul(9).toFixed(2), 0.93);
  assert.equal(repMul(100), 0.35);
});

test('§12.3 — six grain rats reach Cull 3 for a Light player', () => {
  let xp = 100;
  let n = 0;
  while (xp < xpToReach(3)) {
    xp += grantXp({ base: 40, school: 'cull', playerLevel: levelFor(xp), sourceLevel: 1, streak: n, faction: 'light' });
    n++;
  }
  assert.equal(n, 6);
});

test('Light has no Cull penalty and two penalties, Setting and Glamour', () => {
  assert.equal(affinityXp('cull', 'light'), 1);
  assert.equal(affinityXp('setting', 'light'), 0.85);
  assert.equal(affinityXp('glamour', 'light'), 0.85);
  assert.equal(affinityXp('ward', 'light'), 1.15);
});

test('Neutral has three affinities and no penalties anywhere', () => {
  const plus = SCHOOLS.filter(s => affinityXp(s, 'neutral') > 1);
  const minus = SCHOOLS.filter(s => affinityXp(s, 'neutral') < 1);
  assert.deepEqual(plus, ['line', 'forage', 'barter']);
  assert.deepEqual(minus, []);
});

test('a Graft swaps the whole affinity row, penalties included', () => {
  assert.equal(affinityPower('kindle', 'neutral', 'dark'), 1.10);
  assert.equal(affinityPower('barter', 'neutral', 'dark'), 0.92);
});

test('milestones unlock at 3 / 7 / 12 / 17', () => {
  assert.deepEqual(MILESTONE_LEVELS, [3, 7, 12, 17]);
  assert.equal(unlocked('kindle', 2).length, 0);
  assert.equal(unlocked('kindle', 3).length, 1);
  assert.equal(unlocked('kindle', 16).length, 3);
  assert.deepEqual(unlocked('glamour', 20), ['dim', 'hush', 'mask', 'graft']);
});

test('Grasp is 10 at a fresh save and 200 at the ceiling', () => {
  assert.equal(grasp(Object.fromEntries(SCHOOLS.map(s => [s, 0]))), 10);
  assert.equal(grasp(Object.fromEntries(SCHOOLS.map(s => [s, xpToReach(20)]))), 200);
});

test('the §10.4 opening reaches Grasp 16', () => {
  const s = { cull: 577, kindle: 96, line: 607, barter: 248 };
  assert.equal(grasp(s), 16);
  assert.equal(levelFor(s.cull), 3);
  assert.equal(levelFor(s.kindle), 2);
  assert.equal(levelFor(s.line), 3);
  assert.equal(levelFor(s.barter), 2);
});

test('progress reports the fraction into the current level', () => {
  const p = progress(xpToReach(5) + (xpToReach(6) - xpToReach(5)) / 2);
  assert.equal(p.level, 5);
  assert.ok(Math.abs(p.frac - 0.5) < 1e-9);
});

test('streaks reset after 90 s or three other keys', () => {
  const st = newStreaks();
  for (let i = 0; i < 5; i++) assert.equal(bumpStreak(st, 'cull:grain_rat', i), i);
  bumpStreak(st, 'line:spot', 6);
  bumpStreak(st, 'line:spot', 7);
  bumpStreak(st, 'line:spot', 8);
  assert.equal(bumpStreak(st, 'cull:grain_rat', 9), 0);
});

test('§2.3 — the stated times to level 20 hold for the schools with a flat rate', () => {
  const cap = xpToReach(20);
  assert.equal(Math.round(cap / (12 * 12)), 550, 'Ward: 12 x attackerLevel at Watchman tier');
  assert.equal(Math.round(cap / 300), 264, 'Barter: tier-3 transactions');
  assert.equal(Math.round(cap / 300), 264, 'Mend: 120 x objectTier at an average tier of 2.5');
});

test('§2.3 — "Mend 12 is 56 objects" does not hold at the rate that gives 264 to the cap', () => {
  const perObject = xpToReach(20) / 264;
  assert.equal(Math.round(perObject), 300);
  assert.equal(Math.round(xpToReach(12) / perObject), 68);
});

test('the brakes are quiet on the critical path and loud on a grind', () => {
  // Level-appropriate work in short bursts: both multipliers sit at 1.0, which is the design.
  const clean = grantXp({ base: 340, school: 'cull', playerLevel: 8, sourceLevel: 8, streak: 3, faction: 'light' });
  assert.equal(clean, 340);

  // Two hundred grain rats at Cull 15 is the farm the brakes exist to stop.
  let paid = 0;
  for (let i = 0; i < 200; i++) {
    paid += grantXp({ base: 40, school: 'cull', playerLevel: 15, sourceLevel: 1, streak: i, faction: 'light' });
  }
  const unbraked = 200 * 40;
  assert.ok(paid / unbraked < 0.10, `a 200-rat grind pays ${(paid / unbraked * 100).toFixed(0)}% of face value`);
});

test('the rng is deterministic, in range, and salts to independent streams', () => {
  const a = makeRng(1234), b = makeRng(1234), c = makeRng(1235);
  const first = Array.from({ length: 100 }, () => a());
  assert.deepEqual(first, Array.from({ length: 100 }, () => b()));
  assert.notDeepEqual(first, Array.from({ length: 100 }, () => c()));
  assert.ok(first.every(v => v >= 0 && v < 1));
  assert.notEqual(salt(1, 'catch'), salt(1, 'drop'));
});

test('roll respects weights and skips zeroes', () => {
  const rng = makeRng(7);
  const counts = [0, 0, 0];
  for (let i = 0; i < 6000; i++) counts[roll(rng, [0, 3, 1])]++;
  assert.equal(counts[0], 0);
  assert.ok(counts[1] / counts[2] > 2.5 && counts[1] / counts[2] < 3.5);
});
