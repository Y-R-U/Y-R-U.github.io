// The bag, the racks, and what a thing in your hand does.
//
// The one rule worth a test above all the others is the last block: a shop may never sell a
// downgrade. A player who spends every mark they have on a weapon and comes out of the shop worse
// off than they went in has been lied to by the game, and no amount of good writing on the row
// makes that all right.

import { test, eq, ok } from '../../tools/harness.mjs';
import {
  ITEMS, MARKS, STONE, POTION, ROPE, SNARE_SECONDS,
  itemOf, nameOf, usable, isWeapon, stockPrice,
  countOf, give, take, has, rows, purse, use,
} from './items.js';
import { WEAPONS, KNIFE, FISTS, weaponOf, buyable, buyableIds, knifeDps } from './weapons.js';
import { DEFAULTS, tuning, retune, reset, priceOf, payFor } from './economy.js';

// ── the bag ─────────────────────────────────────────────────────────────────

test('a count never goes negative and a zero never lingers', () => {
  const bag = {};
  give(bag, POTION, 3);
  eq(countOf(bag, POTION), 3);
  ok(take(bag, POTION, 2));
  eq(countOf(bag, POTION), 1);
  ok(take(bag, POTION, 1));
  eq(bag[POTION], undefined, 'an emptied stack is deleted, not left as a 0');
  eq(countOf(bag, POTION), 0);
});

test('taking more than you have takes nothing at all', () => {
  const bag = { [STONE]: 2 };
  eq(take(bag, STONE, 3), false);
  eq(countOf(bag, STONE), 2, 'a refused take must not partially spend');
  eq(has(bag, STONE, 2), true);
  eq(has(bag, STONE, 3), false);
});

test('give and take ignore nonsense rather than corrupting the bag', () => {
  const bag = {};
  eq(give(bag, POTION, 0), 0);
  eq(give(bag, POTION, -4), 0);
  eq(give(bag, '', 3), 0);
  eq(take(bag, POTION, 1), false);
  eq(Object.keys(bag), []);
});

test('marks are the purse, not a row in the bag', () => {
  const bag = { [MARKS]: 120, [POTION]: 2 };
  eq(purse(bag), 120);
  eq(rows(bag).map(r => r.id), [POTION]);
});

test('rows come back gear first, then what you use', () => {
  const bag = { [STONE]: 1, dagger: 1, [POTION]: 4, [ROPE]: 2 };
  eq(rows(bag).map(r => r.id), ['dagger', POTION, STONE, ROPE]);
});

test('an id the table has forgotten still shows, named after itself', () => {
  const r = rows({ 'relic.of.a.past.build': 2 });
  eq(r.length, 1);
  eq(r[0].name, 'relic.of.a.past.build');
  eq(r[0].count, 2);
});

// ── the table ───────────────────────────────────────────────────────────────

test('the knife and the fists are never things you own', () => {
  eq(itemOf('knife'), null, 'the proving knife is Society property and must never enter the bag');
  eq(itemOf('fists'), null);
  ok(itemOf('dagger'), 'but a bought weapon is');
});

test('weapons go in the weapon slot and nothing else goes in it', () => {
  for (const id of buyableIds()) {
    ok(isWeapon(id), `${id} should be a weapon`);
    eq(usable(id), false, `${id} must not be holdable in the off hand`);
  }
  for (const id of [STONE, POTION, ROPE]) {
    ok(usable(id), `${id} should be holdable`);
    eq(isWeapon(id), false);
  }
});

test('nameOf falls back to the id rather than to nothing', () => {
  eq(nameOf(STONE), 'Awakening stone');
  eq(nameOf('nothing.like.it'), 'nothing.like.it');
});

// ── the racks ───────────────────────────────────────────────────────────────

test('the proving knife has not moved', () => {
  // js/game/foe.js's regeneration is tuned in these units and js/game/bestiary.js proves every
  // monster killable with them. If this test fails, sixty monsters have quietly changed
  // difficulty.
  eq(KNIFE.damage, 9);
  eq(KNIFE.reach, 2.6);
  eq(KNIFE.arc, 1.9);
  eq(KNIFE.cooldown, 0.75);
  eq(KNIFE.land, 0.16);
  eq(knifeDps(KNIFE), 12);
});

test('bare hands are worse than the knife, and everything for sale is better', () => {
  ok(knifeDps(FISTS) < knifeDps(KNIFE), 'fists must be the floor');
  for (const id of buyableIds()) {
    const w = WEAPONS[id];
    ok(knifeDps(w) >= knifeDps(KNIFE),
      `${id} does ${knifeDps(w).toFixed(1)} dps against the loaner knife's ${knifeDps(KNIFE)} — the shop is selling a downgrade`);
  }
});

test('the racks are actually different weapons, not one weapon four times', () => {
  const ids = buyableIds();
  ok(ids.length >= 4, 'the Weaponry needs something to put in its cupboards');
  const reaches = new Set(ids.map(id => WEAPONS[id].reach));
  const cools = new Set(ids.map(id => WEAPONS[id].cooldown));
  ok(reaches.size >= 3, 'three of them reach the same distance');
  ok(cools.size >= 3, 'three of them swing at the same speed');
  // The spear reaches furthest and pays for it in arc; the axe hits hardest and pays in cooldown.
  const far = ids.reduce((a, b) => (WEAPONS[a].reach > WEAPONS[b].reach ? a : b));
  const hard = ids.reduce((a, b) => (WEAPONS[a].damage > WEAPONS[b].damage ? a : b));
  ok(WEAPONS[far].arc < KNIFE.arc, 'the longest weapon should have the narrowest arc');
  ok(WEAPONS[hard].cooldown > KNIFE.cooldown, 'the heaviest weapon should be the slowest');
});

test('an unknown weapon is bare hands, not a crash', () => {
  eq(weaponOf('sword.of.a.dropped.build').id, 'fists');
  eq(weaponOf('').id, 'fists');
  eq(weaponOf(undefined).id, 'fists');
});

test('the knife and the fists are not for sale', () => {
  eq(buyable('knife'), false);
  eq(buyable('fists'), false);
  eq(stockPrice('knife'), 0);
  eq(stockPrice(MARKS), 0);
});

// ── pacing ──────────────────────────────────────────────────────────────────

test('every price is a real one and comes out of economy.js', () => {
  reset();
  for (const id of buyableIds()) ok(stockPrice(id) > 0, `${id} has no price`);
  ok(stockPrice(STONE) > 0);
  ok(stockPrice(POTION) > 0);
  eq(stockPrice(STONE), DEFAULTS.stonePrice);
});

test('a stone costs far more than a contract pays — it is meant to be the slow way', () => {
  reset();
  ok(DEFAULTS.stonePrice > 100, 'an awakening stone is supposed to be extremely expensive');
  ok(DEFAULTS.stonePrice > DEFAULTS.startingPurse * 4, 'the registration purse must not nearly buy one');
});

test('the purse buys a weapon and a potion and no more', () => {
  reset();
  const cheapest = Math.min(...buyableIds().map(stockPrice));
  ok(DEFAULTS.startingPurse >= cheapest + DEFAULTS.potionPrice - 25,
    'a new member cannot afford to arm themselves at all');
  ok(DEFAULTS.startingPurse < Math.max(...buyableIds().map(stockPrice)),
    'a new member can walk straight out with the best thing in the shop');
});

test('retune moves a live number and reset puts it back', () => {
  reset();
  retune({ stonePrice: 999 });
  eq(priceOf(STONE), 999);
  eq(DEFAULTS.stonePrice === 999, false, 'retune wrote through into the defaults');
  reset();
  eq(priceOf(STONE), DEFAULTS.stonePrice);
});

test('retune ignores a key that is not a setting', () => {
  reset();
  retune({ stonePrice: 'free', notASetting: 4 });
  eq(priceOf(STONE), DEFAULTS.stonePrice, 'a non-numeric price was accepted');
  eq('notASetting' in tuning(), false);
  reset();
});

test('a weapon price can be moved on its own', () => {
  reset();
  retune({ weaponPrice: { dagger: 5, notAWeapon: 3 } });
  eq(priceOf('dagger'), 5);
  eq(tuning().weaponPrice.notAWeapon, undefined);
  reset();
});

test('pay is the board number through the multiplier', () => {
  reset();
  eq(payFor(20), 20);
  retune({ payMultiplier: 2.5 });
  eq(payFor(20), 50);
  eq(payFor(0), 0);
  eq(payFor('nonsense'), 0);
  reset();
});

// ── using what is in the hand ───────────────────────────────────────────────

test('a stone wakes something, unless there is nothing left to wake', () => {
  const ctx = { registered: true, allAwakened: false };
  const r = use(STONE, ctx);
  eq(r.ok, true);
  eq(r.kind, 'awaken');
  eq(r.spend, 1);
  eq(use(STONE, { ...ctx, allAwakened: true }).ok, false);
  eq(use(STONE, { registered: false }).ok, false, 'a stone before essences has nothing to reach');
});

test('a potion refuses when there is nothing to mend', () => {
  reset();
  const r = use(POTION, { hurt: true });
  eq(r.ok, true);
  eq(r.kind, 'heal');
  eq(r.amount, DEFAULTS.potionHeal);
  eq(use(POTION, { hurt: false }).ok, false);
  retune({ potionHeal: 80 });
  eq(use(POTION, { hurt: true }).amount, 80, 'the potion does not read the live tuning');
  reset();
});

test('a rope needs something to throw it at', () => {
  eq(use(ROPE, { fighting: false }).ok, false);
  const r = use(ROPE, { fighting: true });
  eq(r.ok, true);
  eq(r.kind, 'snare');
  eq(r.seconds, SNARE_SECONDS);
});

test('using a weapon, or nothing, is a refusal with a reason on it', () => {
  const a = use('dagger', {});
  eq(a.ok, false);
  ok(a.why.length > 4, 'a refusal with no reason on it is a broken button');
  const b = use('', {});
  eq(b.ok, false);
  ok(b.why.length > 4);
});

test('every hand item has a use, and every use names a real item', () => {
  const hands = Object.values(ITEMS).filter(i => i.hand).map(i => i.id);
  ok(hands.length >= 3);
  for (const id of hands) {
    const r = use(id, { registered: true, allAwakened: false, hurt: true, fighting: true });
    ok(r.ok, `${id} sits in the hand slot and then does nothing when used`);
  }
});
