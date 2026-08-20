import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catchWeights, castTime, biteChance, secondsPerCatch, rollCatch, expectedCatch,
  forageYield, rockYield, burnChance, cookedValue, cookXp, cookHeal, buffSeconds, buffSlots,
  newNode, beginWork, finishWork, tickNode, respawnDelay,
} from './gather.js';
import { CATCH, ROCK, ITEM_VALUE, RESPAWN } from './tables.js';
import { makeRng } from './rng.js';

test('the Whitewall reach opens with silverling at req 1', () => {
  const w = catchWeights(CATCH.whitewall, 1);
  const byId = Object.fromEntries(CATCH.whitewall.map((e, i) => [e.id, w[i]]));
  assert.ok(byId.silverling > 0);
  assert.equal(byId.chalk_trout, 0);
  assert.equal(byId.snowbarb, 0);
  assert.equal(byId.riverlight, 0);
});

test('L02 is completable at Line 1 and would not have been with chalk trout', () => {
  const rng = makeRng(2026);
  const caught = new Set();
  for (let i = 0; i < 400; i++) caught.add(rollCatch(rng, 'whitewall', 1).id);
  assert.deepEqual([...caught].sort(), ['silverling', 'weed']);
});

test('junk falls and rares climb as Line rises', () => {
  const idx = Object.fromEntries(CATCH.whitewall.map((e, i) => [e.id, i]));
  const lo = catchWeights(CATCH.whitewall, 1);
  const hi = catchWeights(CATCH.whitewall, 20);
  const junkShare = w => w[idx.weed] / w.reduce((a, b) => a + b, 0);
  assert.ok(junkShare(hi) < junkShare(lo) / 3);
  assert.ok(hi[idx.riverlight] > 0);
});

test('junk weight never goes below its 0.15 floor', () => {
  const idx = CATCH.blackstone.findIndex(e => e.id === 'foul_water');
  const w = catchWeights(CATCH.blackstone, 20);
  assert.equal(+(w[idx] / CATCH.blackstone[idx].weight).toFixed(3), +(0.15 * (1 + 0.08 * 19)).toFixed(3));
});

test('§6.2 — Line 1 fishes one per 7.0 s and Line 12 one per 2.9 s on a quality-1 spot', () => {
  assert.equal(+castTime(1).toFixed(2), 4.07);
  assert.equal(+biteChance(1, 1).toFixed(2), 0.58);
  assert.equal(+secondsPerCatch(1, 1).toFixed(1), 7.0);
  assert.equal(+castTime(12).toFixed(2), 2.64);
  assert.equal(+biteChance(12, 1).toFixed(2), 0.91);
  assert.equal(+secondsPerCatch(12, 1).toFixed(1), 2.9);
});

test('cast time floors at 1.6 s and bite chance clamps to 0.95', () => {
  assert.equal(castTime(20), Math.max(1.6, 4.2 - 2.6));
  assert.equal(biteChance(20, 2), 0.95);
  assert.equal(biteChance(1, 0), 0.48);
});

test('the three reaches have the character §6.2 describes', () => {
  const at = (reach, lvl) => expectedCatch(reach, lvl);
  assert.ok(at('longacre', 12).value < at('whitewall', 12).value, 'Longacre is the lowest-rarity reach');
  assert.ok(at('blackstone', 12).value > at('whitewall', 12).value, 'Blackstone is the high-variance reach');
});

test('forage yield steps every seven levels; Setting 3 doubles a rock node', () => {
  assert.equal(forageYield(1), 1);
  assert.equal(forageYield(7), 2);
  assert.equal(forageYield(20), 3);
  assert.equal(rockYield('chalk', 1), ROCK.chalk.yield);
  assert.equal(rockYield('chalk', 3), ROCK.chalk.yield * 2);
});

test('obsidian is the only source of Focus cores, at a req the Dark path reaches', () => {
  // Was 12. The story path arrives at D19 with Setting 8, so 12 was a hard block; the
  // Blackstone-only location, not the level, is the structural pressure §6.3 wants.
  assert.equal(ROCK.obsidian.req, 7);
  assert.ok(ROCK.iron_glass.req < ROCK.obsidian.req);
  assert.equal(ROCK.obsidian.item, 'obsidian_core');
  const others = Object.entries(ROCK).filter(([k]) => k !== 'obsidian');
  assert.ok(others.every(([, r]) => r.item !== 'obsidian_core'));
});

test('§6.4 — burn is 40% at recipe level and floors at 2% seven levels up', () => {
  assert.equal(+burnChance(5, 5).toFixed(2), 0.40);
  assert.equal(+burnChance(12, 5).toFixed(3), 0.02);
  assert.equal(burnChance(30, 1), 0.02);
});

test('cooking is worth 2.4x raw, and a cook pays 4.0x value', () => {
  assert.equal(cookedValue('silverling'), Math.round(ITEM_VALUE.silverling * 2.4));
  assert.equal(cookXp('silverling', false), Math.round(ITEM_VALUE.silverling * 4.0));
  assert.equal(cookXp('blackeel', true), Math.round(ITEM_VALUE.blackeel * 0.80));
});

test('a level-appropriate cook lands on §2.3 yardstick of ~350 XP', () => {
  assert.ok(cookXp('blackeel', false) > 250 && cookXp('blackeel', false) < 400);
  assert.equal(Math.round(79153 / cookXp('blackeel', false)), 260);
});

test('food heals 18 + 6 x Hearth, buffs at 3, lengthen at 12, second slot at 17', () => {
  assert.equal(cookHeal(1), 24);
  assert.equal(cookHeal(20), 138);
  assert.equal(buffSeconds(2), 0);
  assert.equal(buffSeconds(3), 180);
  assert.equal(buffSeconds(12), 360);
  assert.equal(buffSlots(16), 1);
  assert.equal(buffSlots(17), 2);
});

test('the node state machine is ready -> working -> cooling -> ready and never mutates', () => {
  const rng = makeRng(5);
  const a = newNode('n1', 'forage');
  const b = beginWork(a, 0);
  assert.equal(a.state, 'ready');
  assert.equal(b.state, 'working');
  const c = finishWork(b, 0, rng, { rarity: 'common' });
  assert.equal(c.state, 'cooling');
  assert.ok(c.t >= RESPAWN.common * 0.6 && c.t <= RESPAWN.common);
  assert.equal(tickNode(c, c.t - 1).state, 'cooling');
  assert.equal(tickNode(c, c.t).state, 'ready');
});

test('beginWork on a cooling node is a no-op', () => {
  const n = { ...newNode('n', 'rock'), state: 'cooling', t: 100 };
  assert.equal(beginWork(n, 0), n);
});

test('Forage 12 harvests respawn 35% faster', () => {
  const fixed = () => 0.5;
  assert.equal(+(respawnDelay('common', fixed, 12) / respawnDelay('common', fixed, 11)).toFixed(2), 0.65);
});

test('respawn base times are 35 / 90 / 240', () => {
  assert.deepEqual(RESPAWN, { common: 35, uncommon: 90, rare: 240 });
});
