// What falls off a monster, and what the three shops will sell you.
//
// The rolls take an injected `rnd`, so every one of these is exact rather than statistical — a
// probability test that passes four times in five is not a test.

import { test, eq, ok } from '../../tools/harness.mjs';
import { TABLES, tableFor, pick, onKill, onContract, contractsToTwenty } from './loot.js';
import { SHOPS, KEEPERS, shopOf, wares, refuse, isShop } from './shop.js';
import { ITEMS, STONE, POTION, DRAUGHT, ROPE, MARKS, isWeapon, use, stockPrice } from './items.js';
import { buyableIds, WEAPONS } from './weapons.js';
import { DEFAULTS, ROWS, tuning, retune, reset } from './economy.js';
import { RANKS } from './contracts.js';

// A sequence of numbers standing in for the generator, so a test can say "this roll, then that".
const feed = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

// ── the drop tables ─────────────────────────────────────────────────────────

test('every rank has a table and every row in it is a real item', () => {
  for (const rank of RANKS.filter(r => r !== 'none')) {
    const rows = tableFor(rank);
    ok(rows.length, `${rank} drops nothing at all`);
    for (const r of rows) {
      ok(ITEMS[r.id], `${rank} drops "${r.id}", which is not a thing you can own`);
      ok(r.weight > 0, `${rank}'s ${r.id} has no weight`);
    }
  }
});

test('a rank nobody has heard of falls back to iron rather than to nothing', () => {
  eq(tableFor('mithril'), TABLES.iron);
  eq(tableFor(undefined), TABLES.iron);
});

test('no rank ever drops an awakening stone off a kill', () => {
  // Stones are rolled per CONTRACT. Put one in a kill table and a survive contract with three
  // waves pays four times what a one-monster clear pays for the same afternoon.
  for (const rank of Object.keys(TABLES)) {
    eq(tableFor(rank).some(r => r.id === STONE), false, `${rank} drops stones off kills`);
  }
});

test('nothing drops marks — a purse is paid, not found', () => {
  for (const rank of Object.keys(TABLES)) {
    eq(tableFor(rank).some(r => r.id === MARKS), false);
  }
});

test('the weighted pick lands in every row and never off the end', () => {
  const rows = [{ id: 'a', weight: 1 }, { id: 'b', weight: 2 }, { id: 'c', weight: 1 }];
  // Weights 1, 2, 1 out of 4: a owns [0, .25), b owns [.25, .75), c owns [.75, 1).
  eq(pick(rows, () => 0), 'a');
  eq(pick(rows, () => 0.24), 'a');
  eq(pick(rows, () => 0.26), 'b');
  eq(pick(rows, () => 0.6), 'b');
  eq(pick(rows, () => 0.76), 'c');
  eq(pick(rows, () => 0.999999), 'c', 'a roll at the very top fell off the end of the table');
  eq(pick([], () => 0.5), null);
  eq(pick([{ id: 'a', weight: 0 }], () => 0.5), null, 'a table of zero weights should drop nothing');
});

// ── the rolls ───────────────────────────────────────────────────────────────

test('a kill drops nothing above the chance and something below it', () => {
  reset();
  retune({ lootChance: 0.4 });
  eq(onKill({ rank: 'iron' }, () => 0.99), null);
  eq(onKill({ rank: 'iron' }, () => 0.41), null, 'a roll on the wrong side of the line dropped');
  const got = onKill({ rank: 'iron' }, feed(0.1, 0));
  ok(got && got.count === 1, 'a roll under the chance dropped nothing');
  ok(ITEMS[got.id]);
  reset();
});

test('the odds come out of economy.js at the moment of the roll, not at import', () => {
  reset();
  retune({ lootChance: 0 });
  eq(onKill({ rank: 'iron' }, () => 0), null, 'a zeroed drop chance still dropped');
  retune({ lootChance: 1 });
  ok(onKill({ rank: 'iron' }, () => 0.999), 'a certainty still refused to drop');
  reset();
});

test('a contract rolls for a stone and only for a stone', () => {
  reset();
  retune({ stoneDrop: 0.5 });
  eq(onContract(() => 0.6), null);
  const got = onContract(() => 0.2);
  eq(got, { id: STONE, count: 1 });
  retune({ stoneDrop: 0 });
  eq(onContract(() => 0), null, 'stones dropped with the chance at zero');
  reset();
});

// ── the estimate the dev panel prints ───────────────────────────────────────

test('sixteen stones is a number of contracts, and the sliders move it', () => {
  reset();
  const base = contractsToTwenty({ pay: 25 });
  ok(base > 10 && base < 120, `${base} contracts to twenty abilities at the shipped numbers`);
  retune({ stoneDrop: 1 });
  ok(contractsToTwenty({ pay: 25 }) < base, 'raising the drop chance did not shorten the game');
  reset();
  retune({ stonePrice: 20 });
  ok(contractsToTwenty({ pay: 25 }) < base, 'cheapening the stones did not shorten the game');
  reset();
});

test('a game with no stones anywhere is reported as impossible, not as instant', () => {
  reset();
  retune({ stoneDrop: 0, payMultiplier: 0 });
  eq(contractsToTwenty({ pay: 25 }), Infinity);
  reset();
});

// ── the shops ───────────────────────────────────────────────────────────────

test('there are three shops and each one knows what it is called', () => {
  eq(Object.keys(SHOPS).length, 3);
  for (const [id, s] of Object.entries(SHOPS)) {
    eq(s.id, id);
    ok(s.title.length > 3, `${id} has no name`);
    ok(s.strap.length > 10, `${id} has nothing to say`);
    ok(isShop(id));
  }
  eq(isShop('board.iron'), false, 'a board must not be mistaken for a shop');
  eq(isShop(''), false);
  eq(isShop(null), false);
});

test('every shop stocks something, and everything it stocks is a real item with a price', () => {
  reset();
  for (const id of Object.keys(SHOPS)) {
    const rows = wares(id);
    ok(rows.length, `${id} has bare shelves`);
    for (const w of rows) {
      ok(ITEMS[w.id], `${id} stocks "${w.id}", which is not a thing`);
      ok(w.price > 0, `${id} is giving ${w.id} away`);
    }
    // Cheapest first, so the row a new adventurer can afford is the one they see first.
    eq(rows.map(w => w.price), [...rows.map(w => w.price)].sort((a, b) => a - b));
  }
});

test('the Weaponry stocks every weapon there is, and the knife is not one of them', () => {
  const rows = wares('shop.weaponry').map(w => w.id);
  for (const id of buyableIds()) ok(rows.includes(id), `${id} is not on any rack`);
  eq(rows.includes('knife'), false, 'the proving knife is Society property');
  eq(rows.includes('fists'), false);
});

test('the awakening stone is sold in one place and it is not the Weaponry', () => {
  const where = Object.keys(SHOPS).filter(id => wares(id).some(w => w.id === STONE));
  eq(where, ['shop.general']);
  const potions = Object.keys(SHOPS).filter(id => wares(id).some(w => w.id === POTION));
  eq(potions, ['shop.apothecary']);
});

test('nothing is stocked twice on one counter', () => {
  for (const id of Object.keys(SHOPS)) {
    const ids = wares(id).map(w => w.id);
    eq(ids.length, new Set(ids).size, `${id} has the same thing on the shelf twice`);
  }
});

test('a shop never sells marks back to you', () => {
  for (const id of Object.keys(SHOPS)) eq(wares(id).some(w => w.id === MARKS), false);
});

test('a refusal names what is missing, and an empty purse buys nothing', () => {
  reset();
  eq(refuse({}, 'dagger', 'shop.weaponry'), '35 marks short.');
  eq(refuse({ [MARKS]: 34 }, 'dagger', 'shop.weaponry'), '1 marks short.');
  eq(refuse({ [MARKS]: 35 }, 'dagger', 'shop.weaponry'), null);
  eq(refuse({ [MARKS]: 9999 }, 'dagger', 'shop.apothecary'), 'Not stocked here.');
  eq(refuse({ [MARKS]: 9999 }, 'knife', 'shop.weaponry'), 'Not stocked here.');
  eq(refuse({ [MARKS]: 9999 }, 'dagger', 'shop.nowhere'), 'Not stocked here.');
});

test('the registration purse buys a weapon and cannot come near a stone', () => {
  reset();
  const p = { [MARKS]: DEFAULTS.startingPurse };
  const armed = wares('shop.weaponry').filter(w => isWeapon(w.id));
  ok(armed.some(w => !refuse(p, w.id, 'shop.weaponry')),
    'a new member cannot afford a single weapon in the shop');
  ok(refuse(p, STONE, 'shop.general'), 'a new member can walk out with an awakening stone');
});

test('moving a price moves the counter, not just the panel', () => {
  reset();
  retune({ weaponPrice: { dagger: 5 } });
  eq(wares('shop.weaponry').find(w => w.id === 'dagger').price, 5);
  eq(refuse({ [MARKS]: 5 }, 'dagger', 'shop.weaponry'), null);
  reset();
  eq(wares('shop.weaponry').find(w => w.id === 'dagger').price, DEFAULTS.weaponPrice.dagger);
});

test('a price of zero takes the row off the shelf rather than giving it away', () => {
  reset();
  const stocked = wares('shop.apothecary').length;
  retune({ potionPrice: 0 });
  eq(wares('shop.apothecary').length, stocked - 1, 'zeroing one bottle should take one row off');
  eq(refuse({ [MARKS]: 100 }, POTION, 'shop.apothecary'), 'Not stocked here.');
  retune({ greaterPotionPrice: 0 });
  eq(wares('shop.apothecary').length, 0, 'zeroing both should empty the shelf');
  reset();
  eq(wares('shop.apothecary').length, stocked);
});

// A silver contract pays 620 marks and an awakening stone costs 240. Without something at the back
// of the shop there is nothing above iron rank to want, and the purse just goes up.
test('there is something in the shop a silver adventurer cannot immediately afford', () => {
  reset();
  const dear = Math.max(...buyableIds().map(stockPrice));
  ok(dear > 600, `the best thing on the rack costs ${dear} marks against a 620-mark silver contract`);
  const cheap = Math.min(...buyableIds().map(stockPrice));
  ok(dear > cheap * 10, 'the racks should span an order of magnitude, top to bottom');
});

test('the back of the shop is better than the front of it', () => {
  const byPrice = buyableIds().filter(id => isWeapon(id)).sort((a, b) => stockPrice(a) - stockPrice(b));
  const dps = id => WEAPONS[id].damage / WEAPONS[id].cooldown;
  ok(dps(byPrice[byPrice.length - 1]) > dps(byPrice[0]) * 2,
    `the dearest weapon should be worth the money (${byPrice[0]} vs ${byPrice[byPrice.length - 1]})`);
  // …but not so much better that it makes the three below it pointless to have bought.
  for (let i = 1; i < byPrice.length; i++) {
    ok(dps(byPrice[i]) >= dps(byPrice[i - 1]) * 0.95,
      `${byPrice[i]} costs more than ${byPrice[i - 1]} and hits softer`);
  }
});

test('the two bottles are a choice between sizes, not the same bottle twice', () => {
  reset();
  const small = use(POTION, { hurt: true });
  const big = use(DRAUGHT, { hurt: true });
  ok(big.amount > small.amount * 1.5, `${small.amount} against ${big.amount}`);
  ok(stockPrice(DRAUGHT) > stockPrice(POTION) * 2, 'and it is priced like it');
  // The big one's heal is its own and does not move with the panel's slider.
  retune({ potionHeal: 5 });
  eq(use(DRAUGHT, { hurt: true }).amount, big.amount);
  eq(use(POTION, { hurt: true }).amount, 5);
  reset();
});

test('every keeper keeps a real counter, and nobody else keeps one', async () => {
  const cast = JSON.parse((await import('node:fs')).readFileSync(
    new URL('../../data/characters.json', import.meta.url), 'utf8')).characters;
  for (const [who, shop] of Object.entries(KEEPERS)) {
    ok(cast[who], `${who} keeps a shop but is not in the cast`);
    ok(SHOPS[shop], `${who} keeps "${shop}", which is not a shop`);
    eq(shopOf(who), shop);
  }
  eq(Object.keys(KEEPERS).length, Object.keys(SHOPS).length, 'a counter with nobody behind it');
  eq(shopOf('greeter'), null, 'the Registrar is not a shopkeeper');
  eq(shopOf(undefined), null);
});

test('the rope is on two counters on purpose and is not a weapon on either', () => {
  const on = Object.keys(SHOPS).filter(id => wares(id).some(w => w.id === ROPE));
  eq(on.sort(), ['shop.general', 'shop.weaponry']);
  eq(isWeapon(ROPE), false);
});

test('every tuning row the panel draws is a real setting', () => {
  reset();
  for (const r of ROWS) {
    ok(r.key in DEFAULTS, `the Economy panel has a slider for "${r.key}", which is not a setting`);
    ok(r.max > r.min, `${r.key}'s slider has no range`);
    ok(tuning()[r.key] >= r.min && tuning()[r.key] <= r.max,
      `${r.key} ships at ${tuning()[r.key]}, which its own slider cannot reach`);
  }
});
