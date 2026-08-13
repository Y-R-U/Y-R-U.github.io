import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sellPrice, buyPrice, sellRate, buyRate, freshness, glut, glutFloor, GLUT_FLOOR,
  newLedger, rollDay, sellStack, itemTier, transactionXp, ferryToll, bindingCost,
  gutterLoss, carryMarks,
} from './economy.js';
import { ITEM_VALUE, BARTER_TIER_XP } from './tables.js';

test('§7.1 — the Barter price table', () => {
  const rows = [[1, 0.556, 1.99], [7, 0.592, 1.94], [12, 0.622, 1.90], [20, 0.670, 1.84]];
  for (const [b, sell, buy] of rows) {
    assert.equal(+sellRate(b).toFixed(3), sell);
    assert.equal(+buyRate(b).toFixed(2), buy);
  }
});

test('Barter 20 earns 20.5% more and pays 7.6% less than Barter 1', () => {
  assert.equal(+((sellRate(20) / sellRate(1) - 1) * 100).toFixed(1), 20.5);
  assert.equal(+((1 - buyRate(20) / buyRate(1)) * 100).toFixed(1), 7.6);
});

test('buy rate floors at 1.4x', () => {
  assert.equal(buyRate(200), 1.4);
});

test('prices never round below 1 mk', () => {
  assert.equal(sellPrice(1, 1, 0.5, 0.35), 1);
  assert.equal(buyPrice(0, 1), 1);
});

test('freshness is full for a minute and floors at 0.5 after 20', () => {
  assert.equal(freshness(0), 1);
  assert.equal(freshness(1), 0.975);
  assert.equal(freshness(20), 0.5);
  assert.equal(freshness(600), 0.5);
});

test('§7.2 and §12.3 — unit 34 is the first at the glut floor', () => {
  assert.equal(+glut(31).toFixed(3), 0.380);
  assert.equal(+glut(32).toFixed(3), 0.360);
  assert.equal(glut(33), GLUT_FLOOR);
  const floored = [...Array(60).keys()].findIndex(n => glut(n) === GLUT_FLOOR);
  assert.equal(floored + 1, 34, 'unit index is 1-based; soldToday is read before the unit counts');
});

test('Barter 17 raises the glut floor to 0.55', () => {
  assert.equal(glutFloor(16), 0.35);
  assert.equal(glutFloor(17), 0.55);
  assert.equal(glut(100, 17), 0.55);
});

test('the ledger is per district and rolls clean on a day boundary', () => {
  let led = newLedger(3);
  led = sellStack(led, { item: 'silverling', value: 12, n: 5, district: 'light' }).ledger;
  assert.equal(led.sold['light:silverling'], 5);
  assert.equal(led.sold['dark:silverling'], undefined);
  assert.equal(rollDay(led, 3), led);
  assert.deepEqual(rollDay(led, 4).sold, {});
});

test('§10.4 — the opening sale is 30 mk of silverling and 14 mk of rat tails, 44 mk', () => {
  let led = newLedger(0);
  const fish = sellStack(led, { item: 'silverling', value: ITEM_VALUE.silverling, n: 5, barter: 1, freshness: 0.95 });
  led = fish.ledger;
  const tails = sellStack(led, { item: 'rat_tail', value: ITEM_VALUE.rat_tail, n: 8, barter: 1 });
  assert.equal(fish.marks, 30);
  assert.equal(tails.marks, 14);
  assert.equal(fish.marks + tails.marks, 44);
  assert.equal(+fish.units.at(-1).glut.toFixed(2), 0.92);
  assert.equal(+tails.units.at(-1).glut.toFixed(2), 0.86);
});

test('§10.4 — two tier-1 transactions on 44 mk pay 91 Barter XP', () => {
  assert.equal(itemTier(ITEM_VALUE.silverling), 1);
  assert.equal(itemTier(ITEM_VALUE.rat_tail), 1);
  assert.equal(transactionXp(1, 0) * 2 + Math.round(0.02 * 44), 91);
});

test('item tiers map onto the 45/120/300/700/1500 payouts', () => {
  assert.deepEqual(BARTER_TIER_XP, [45, 120, 300, 700, 1500]);
  assert.equal(itemTier(12), 1);
  assert.equal(itemTier(26), 2);
  assert.equal(itemTier(145), 3);
  assert.equal(itemTier(420), 4);
  assert.equal(itemTier(2000), 5);
});

test('the ferry is a real toll, halved at Trusted and free at Sworn', () => {
  assert.equal(ferryToll(1, 'plain'), 12);
  assert.equal(ferryToll(2, 'plain'), 30);
  assert.equal(ferryToll(2, 'trusted'), 15);
  assert.equal(ferryToll(2, 'sworn'), 0);
});

test('binding costs 40 / 180 / 700 / 2000', () => {
  assert.deepEqual([1, 2, 3, 4].map(bindingCost), [40, 180, 700, 2000]);
});

test('the gutter takes 8% of carried marks, 5% with the White Cord', () => {
  assert.equal(gutterLoss(1000), 80);
  assert.equal(gutterLoss(1000, true), 50);
});

test('marks over 15,000 become a Legacy Cache at the campaign seam', () => {
  assert.deepEqual(carryMarks(9000), { purse: 9000, cache: 0 });
  assert.deepEqual(carryMarks(21000), { purse: 15000, cache: 6000 });
});

test('§7.3 — 60 mk buys kit+food or charm+kit, and the Warm cord is the trap', () => {
  const purse = 60;
  assert.ok(20 + 28 <= purse, 'mending kit plus four cooked silverling');
  assert.ok(40 + 20 <= purse, 'coarse line plus a kit');
  assert.equal(purse - 55, 5, 'the Warm cord leaves nothing');
});
