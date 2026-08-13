import test from 'node:test';
import assert from 'node:assert/strict';

import {
  power, critChance, enemyHp, enemyDamage, mitigation, resolveHit, tapsToKill,
  focusMax, focusRegen, hpMax, damageTaken, bitesToGutter, chargeMul, GCD,
  packSize, eliteChance, sustainedDps, neutralAdvantage, neutralGate, bolts, swingSeconds, acquire,
} from './combat.js';
import { ENEMIES } from './tables.js';
import { SPELLS, tierUnlocked, castsPerSecond } from './spells.js';
import { makeRng } from './rng.js';

test('power and crit reproduce the §5.2 table', () => {
  const rows = [[1, 7.5, 0.06], [3, 19.5, 0.08], [7, 43.5, 0.12], [12, 73.5, 0.17], [17, 103.5, 0.22], [20, 121.5, 0.25]];
  for (const [L, p, c] of rows) {
    assert.equal(power(L), p);
    assert.equal(+critChance(L).toFixed(2), c);
  }
  assert.equal(critChance(30), 0.30);
});

test('enemyHp and enemyDamage reproduce every non-boss row of the bestiary', () => {
  for (const [id, e] of Object.entries(ENEMIES)) {
    if (e.boss) continue;
    assert.equal(e.hp, enemyHp(e.level), `${id} hp`);
    assert.equal(e.damage, +enemyDamage(e.level).toFixed(1), `${id} damage`);
  }
});

test('bosses override HP and damage by hand, as §5.1 says they may', () => {
  assert.notEqual(ENEMIES.brood_mother.hp, enemyHp(6));
  assert.notEqual(ENEMIES.champion_3.damage, +enemyDamage(20).toFixed(1));
});

test('taps at parity match the bestiary column', () => {
  const expected = {
    grain_rat: 2, mire_rat: 3, rat_knot: 4, sour_crow: 4, creek_crab: 4,
    blight_boar: 6, hollow: 7, watchman: 8, champion_1: 31, champion_2: 39, champion_3: 42,
  };
  for (const [id, taps] of Object.entries(expected)) {
    assert.equal(tapsToKill(ENEMIES[id].level, id), taps, id);
  }
});

test('the brood-mother is 28 taps once per-hit damage is rounded, not the 27 the table prints', () => {
  const e = ENEMIES.brood_mother;
  const unrounded = Math.ceil(e.hp / (power(e.level) * mitigation(e.armour)));
  assert.equal(unrounded, 27);
  assert.equal(tapsToKill(e.level, e), 28);
});

test('§12.3 — the first rat dies in exactly two taps', () => {
  assert.equal(tapsToKill(1, 'grain_rat'), 2);
});

test('§12.3 — Kindle 10 kills a Hollow in 7, Kindle 20 kills champion III in 42', () => {
  assert.equal(tapsToKill(10, 'hollow'), 7);
  assert.equal(tapsToKill(20, 'champion_3'), 42);
});

test('resolveHit applies mitigation and a 1.75x crit, floored at 1', () => {
  const never = () => 1, always = () => 0;
  assert.equal(resolveHit({ power: power(1), armour: 0, critChance: 0.06, rng: never }).damage, 8);
  assert.equal(resolveHit({ power: power(1), armour: 0, critChance: 0.06, rng: always }).crit, true);
  assert.equal(resolveHit({ power: power(1), armour: 0, critChance: 1, rng: always }).damage, 13);
  assert.equal(resolveHit({ power: 0.1, armour: 900, rng: never }).damage, 1);
});

test('Focus reproduces the §4.1 table', () => {
  const rows = [[1, 70, 6.6, 13.2], [5, 110, 9.0, 18.0], [10, 160, 12.0, 24.0], [15, 210, 15.0, 30.0], [20, 260, 18.0, 36.0]];
  for (const [ward, max, regen, rested] of rows) {
    assert.equal(focusMax(ward), max);
    assert.equal(+focusRegen(ward).toFixed(1), regen);
    assert.equal(+focusRegen(ward, true).toFixed(1), rested);
  }
});

test('§12.3 — eight bolts before empty at Ward 1', () => {
  assert.equal(SPELLS.bolt_light.cost, 8);
  assert.equal(bolts({ ward: 1, cost: SPELLS.bolt_light.cost }), 8);
});

test('HP reproduces the §5.3 table', () => {
  const rows = [[1, 1, 52], [5, 3, 116], [10, 7, 202], [15, 12, 292], [20, 20, 394]];
  for (const [w, h, hp] of rows) assert.equal(hpMax(w, h), hp);
});

test('§12.3 — 12 grain-rat bites and 2 Watchman hits gutter a Ward 1 player', () => {
  assert.equal(+damageTaken(ENEMIES.grain_rat.damage, 1).toFixed(1), 4.6);
  assert.equal(bitesToGutter(1, 1, 'grain_rat'), 12);
  assert.equal(bitesToGutter(1, 1, 'watchman'), 2);
});

test('a swing is 0.385 s and charge tops out at 1.8x', () => {
  assert.equal(+swingSeconds().toFixed(3), 0.385);
  assert.equal(chargeMul(0), 1);
  assert.equal(chargeMul(0.34), 1);
  assert.equal(+chargeMul(1.20).toFixed(2), 1.80);
  assert.equal(+chargeMul(5).toFixed(2), 1.80);
});

test('§12.3 — Quicken cuts the GCD from 2.50 to 3.33 casts/s, +33.3%', () => {
  assert.equal(+castsPerSecond(GCD).toFixed(2), 2.50);
  assert.equal(+castsPerSecond(0.30).toFixed(2), 3.33);
  assert.equal(+((0.40 / 0.30 - 1) * 100).toFixed(1), 33.3);
});

test('pack size and elite chance follow Grasp', () => {
  assert.equal(packSize(10), 1);
  assert.equal(packSize(30), 2);
  assert.equal(packSize(120), 4);
  assert.equal(packSize(200), 4);
  assert.equal(eliteChance(20, 5), 0);
  assert.equal(+eliteChance(100, 5).toFixed(2), 0.20);
  assert.equal(eliteChance(200, 1), 0.35);
});

test('spell tier gates are the only Grasp gates', () => {
  assert.equal(tierUnlocked(2, 7, 47), false);
  assert.equal(tierUnlocked(2, 7, 48), true);
  assert.equal(tierUnlocked(2, 6, 100), false);
  assert.equal(tierUnlocked(3, 12, 96), true);
  assert.equal(tierUnlocked(4, 17, 128, 'trusted'), false);
  assert.equal(tierUnlocked(4, 17, 128, 'sworn'), true);
});

test('Kindle 17 with everything else at 1 is Grasp 26 and tier 2 is shut', () => {
  const g = 17 + 9;
  assert.equal(g, 26);
  assert.equal(tierUnlocked(2, 17, g), false);
});

test('Dark beats Light on three or more, and loses on one — but by 7%, not the 15% §4.5 claims', () => {
  const one = sustainedDps({ level: 10, faction: 'dark', targets: 1 }) / sustainedDps({ level: 10, faction: 'light', targets: 1 });
  const four = sustainedDps({ level: 10, faction: 'dark', targets: 4 }) / sustainedDps({ level: 10, faction: 'light', targets: 4 });
  assert.ok(one < 1, 'dark is behind on single target');
  assert.equal(+one.toFixed(2), 0.93);
  assert.ok(four > 1.5, 'dark is well ahead on a group');
  assert.equal(+four.toFixed(2), 1.86);
});

test('§8.4 — the four levers multiply to +75%, but only if the weapon swap counts', () => {
  assert.equal(+neutralAdvantage().toFixed(2), 1.76);
  assert.equal(+neutralAdvantage({ weaponSwap: false }).toFixed(2), 1.53);
});

test('§12.3 gate — three scenarios, because one number cannot answer it', () => {
  const rows = Object.fromEntries(neutralGate({ level: 17 }).map(r => [r.id, r.ratio]));
  assert.equal(+rows.single.toFixed(2), 1.53);
  assert.equal(+rows.group.toFixed(2), 1.53);
  assert.equal(+rows.mixed.toFixed(2), 1.76);
  for (const r of Object.values(rows)) assert.ok(r >= 1.5, 'every fight must be far ahead');
});

test('the weapon swap is worth nothing when the fight cannot change shape', () => {
  const locked = neutralGate({ level: 17 }).filter(r => !r.swap);
  assert.ok(locked.every(r => Math.abs(r.ratio - neutralAdvantage({ weaponSwap: false })) < 1e-9));
  assert.equal(+(neutralAdvantage() / neutralAdvantage({ weaponSwap: false })).toFixed(2), 1.15);
});

test('acquire prefers the target nearest the aim line, and misses outside the cone', () => {
  const spell = { cone: Math.PI / 4, range: 20 };
  const targets = [{ id: 'a', x: 0, z: 10 }, { id: 'b', x: 9, z: 9 }];
  assert.equal(acquire(targets, 0, { x: 0, z: 0 }, spell).id, 'a');
  assert.equal(acquire([{ id: 'b', x: 30, z: 0 }], 0, { x: 0, z: 0 }, spell), null);
});

test('crits land at roughly the stated rate over a seeded run', () => {
  const rng = makeRng(99);
  let crits = 0;
  for (let i = 0; i < 20000; i++) if (resolveHit({ power: 50, critChance: critChance(10), rng }).crit) crits++;
  assert.ok(Math.abs(crits / 20000 - 0.15) < 0.02);
});
