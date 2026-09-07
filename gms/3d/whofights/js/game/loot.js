// What falls off a monster.
//
// Pure — a roll takes an injected `rnd` — because the whole of the game's pace between Iron and
// Bronze is these two numbers and a test has to be able to hold them still. The numbers themselves
// are in js/game/economy.js behind the debug tab's Economy panel; nothing here holds a probability
// that is not read out of there at the moment of the roll.
//
// The shape of it: something drops off roughly two kills in five (`lootChance`), and what it is
// depends on the rank of the work. Awakening stones are the exception and are rolled SEPARATELY,
// per contract rather than per kill (`stoneDrop`), because sixteen of them is the distance to
// Bronze and that distance should be measured in contracts finished, not in how many things
// happened to be standing in the last room.

import { tuning } from './economy.js';
import { STONE, POTION, ROPE } from './items.js';

// Per-kill drops, by the rank of the contract. Weights, not chances: one roll picks one row.
// A rank the table has never heard of falls back to iron rather than dropping nothing.
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
    { id: POTION, weight: 4 },
    { id: ROPE, weight: 1 },
    { id: 'shortsword', weight: 2 },
    { id: 'spear', weight: 2 },
    { id: 'axe', weight: 1 },
  ],
  gold: [
    { id: POTION, weight: 3 },
    { id: 'spear', weight: 2 },
    { id: 'axe', weight: 3 },
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

// One kill. Null most of the time, which is what makes a drop worth noticing.
export function onKill({ rank = 'iron' } = {}, rnd = Math.random) {
  const chance = Math.max(0, Math.min(1, tuning().lootChance));
  if (rnd() >= chance) return null;
  const id = pick(tableFor(rank), rnd);
  return id ? { id, count: 1 } : null;
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
