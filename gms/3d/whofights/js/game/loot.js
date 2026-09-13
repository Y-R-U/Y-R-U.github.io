// What falls off a monster.
//
// Pure — a roll takes an injected `rnd` — because the whole of the game's pace between Iron and
// Bronze is these numbers and a test has to be able to hold them still. The numbers themselves
// are in js/game/economy.js behind the debug tab's Economy panel; nothing here holds a probability
// that is not read out of there at the moment of the roll.
//
// The shape of it, and Aaron's rule: **every monster drops something, and that something always
// includes coins.** How many is what it was worth to kill, which is the one number that already
// knows its rank, its kind and what has been done to it. On top of the coins, roughly two kills in
// five (`lootChance`) also drop an item, and what that item is depends on the rank of the work —
// higher-rank monsters carry better things.
//
// Awakening stones are the exception and are rolled SEPARATELY, per contract rather than per kill
// (`stoneDrop`), because sixteen of them is the distance to Bronze and that distance should be
// measured in contracts finished, not in how many things happened to be standing in the last room.

import { tuning } from './economy.js';
import { STONE, POTION, DRAUGHT, ROPE, COIN } from './items.js';
import { coinsFor } from './ranks.js';

export { COIN };

// The item that sometimes comes with the coins, by the rank of the work. Weights, not chances:
// one roll picks one row. A rank the table has never heard of falls back to iron rather than
// dropping nothing.
export const TABLES = {
  iron: [
    { id: POTION, weight: 5 },
    { id: ROPE, weight: 3 },
    { id: 'dagger', weight: 1 },
  ],
  bronze: [
    { id: POTION, weight: 5 },
    { id: ROPE, weight: 2 },
    { id: 'dagger', weight: 1 },
    { id: 'shortsword', weight: 1 },
    { id: 'spear', weight: 1 },
  ],
  silver: [
    { id: POTION, weight: 3 },
    { id: DRAUGHT, weight: 2 },
    { id: ROPE, weight: 1 },
    { id: 'shortsword', weight: 2 },
    { id: 'spear', weight: 2 },
    { id: 'axe', weight: 2 },
    { id: 'warsword', weight: 1 },
  ],
  gold: [
    { id: DRAUGHT, weight: 4 },
    { id: 'axe', weight: 2 },
    { id: 'warsword', weight: 3 },
    { id: 'pike', weight: 2 },
    { id: 'maul', weight: 1 },
  ],
};

export const tableFor = rank => TABLES[rank] || TABLES.iron;

// One weighted pick. `rnd` returns [0,1).
export function pick(rows, rnd = Math.random) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.weight || 0), 0);
  if (total <= 0) return null;
  let x = rnd() * total;
  for (const r of rows) {
    x -= Math.max(0, r.weight || 0);
    if (x < 0) return r.id;
  }
  return rows[rows.length - 1].id;
}

// One kill. Always coins, sometimes an item as well. `worth` is the monster's own `xp` off
// js/game/bestiary.js — it is what the fight was, so it is what the purse is.
//
// Never null. A monster that dropped nothing at all is the thing this pass exists to remove.
export function onKill({ rank = 'iron', worth = 14 } = {}, rnd = Math.random) {
  const t = tuning();
  const coins = coinsFor(worth, t.coinRate, rnd);
  const chance = Math.max(0, Math.min(1, t.lootChance));
  const item = rnd() < chance ? pick(tableFor(rank), rnd) : null;
  return { coins, item: item ? { id: item, count: 1 } : null, rank };
}

// One contract, finished. The stone roll, and only the stone roll — it is deliberately not in the
// per-kill table, because a `survive` contract with three waves in it would otherwise pay four
// times what a one-monster clear pays for the same afternoon.
export function onContract(rnd = Math.random) {
  const chance = Math.max(0, Math.min(1, tuning().stoneDrop));
  return rnd() < chance ? { id: STONE, count: 1 } : null;
}

// How long, roughly, sixteen stones will take at the current tuning — one contract's worth of
// stone from drops plus what its pay buys. The Economy panel prints this so a slider can be moved
// against a number of contracts rather than against a feeling.
export function contractsToTwenty({ pay = 25, need = 16 } = {}) {
  const t = tuning();
  const perContract = Math.max(0, Math.min(1, t.stoneDrop))
    + (Math.max(0, pay) * Math.max(0, t.payMultiplier)) / Math.max(1, t.stonePrice);
  return perContract > 0 ? Math.ceil(need / perContract) : Infinity;
}
