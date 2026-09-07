// Every number that decides how long the game takes, in one object.
//
// Prices, drop odds and what a contract pays are not balance in the sense that js/game/foe.js's
// regeneration is balance — they are pacing, and pacing is the thing you only find out by watching
// somebody play. So they live here, together, behind two functions rather than as forty exported
// constants: `tuning()` reads and `retune()` writes, which is what lets the Economy panel in the
// debug tab move them while the game is running and what lets a test move them back afterwards.
//
// Nothing else in the game may hold a price. If you find yourself typing a number of marks
// anywhere else, it belongs in DEFAULTS.
//
// Pure — no DOM, no three, no storage. The dev panel owns persisting an override if it wants one.

export const DEFAULTS = {
  // What the Society hands a new member so the first contract is not fought bare-handed. A dagger
  // and a potion, with nothing left over: the Weaponry's better racks have to stay wanted.
  startingPurse: 45,

  // A blanket multiplier on every contract's `reward`. The per-contract numbers live on the board
  // in js/game/contracts.js where the writing is; this is the one knob that moves all of them.
  payMultiplier: 1,

  // Awakening stones. Sixteen of these is the whole distance from registration to Bronze, so these
  // two numbers are the single biggest lever on how long the game is.
  //
  // At the shipped values: an Iron contract pays about 25 marks, roughly a third of them drop a
  // stone, and a stone costs about ten contracts' pay. That is ~40 contracts to twenty abilities,
  // which is about an hour. Move `stoneDrop` first — buying stones should stay the slow way.
  stonePrice: 240,
  stoneDrop: 0.32,

  // Anything at all dropping off a kill. Rolled per monster; what it turns out to be is
  // js/game/loot.js's table.
  lootChance: 0.42,

  // Consumables.
  potionPrice: 30,
  potionHeal: 45,
  // The apothecary's other bottle. Its heal is its own — js/game/items.js reads the item's `heal`
  // and only falls back to `potionHeal` for the plain one — because the two are meant to be a
  // choice and one slider moving both is not a choice.
  greaterPotionPrice: 145,

  // The Weaponry's racks. `fists` and `knife` are not sold — one is what you have and the other is
  // Society property.
  weaponPrice: {
    dagger: 35,
    shortsword: 90,
    spear: 120,
    axe: 155,
    rope: 18,
    // The back of the shop. Priced against what silver work pays (620-1400 a contract), not
    // against what iron does, so they are a thing to want for the whole of bronze.
    warsword: 700,
    pike: 1150,
    maul: 1600,
  },
};

// The live object. Deliberately a shallow copy of DEFAULTS with `weaponPrice` copied too, so
// retuning a price cannot write through into the defaults and make `reset()` a no-op.
let live = fresh();

function fresh() {
  return { ...DEFAULTS, weaponPrice: { ...DEFAULTS.weaponPrice } };
}

export const tuning = () => live;

// Move one or more numbers. Unknown keys are ignored rather than added: the panel's sliders are
// generated from DEFAULTS, so a key that is not in it is a typo, and a typo that silently becomes
// a new setting is a setting nobody will ever find again.
export function retune(patch = {}) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (k === 'weaponPrice') {
      for (const [id, p] of Object.entries(v || {})) {
        if (id in DEFAULTS.weaponPrice && Number.isFinite(+p)) live.weaponPrice[id] = Math.max(0, Math.round(+p));
      }
      continue;
    }
    if (Number.isFinite(+v)) live[k] = +v;
  }
  return live;
}

export function reset() {
  live = fresh();
  return live;
}

// What one of a thing costs. The one lookup the shop uses, so a new item kind is a row here and
// nothing else. Zero means it is not for sale, which is different from being free — js/game/shop.js
// refuses to stock anything priced at zero.
export function priceOf(id) {
  const t = live;
  if (id === 'stone.awakening') return Math.max(0, Math.round(t.stonePrice));
  if (id === 'potion.healing') return Math.max(0, Math.round(t.potionPrice));
  if (id === 'potion.greater') return Math.max(0, Math.round(t.greaterPotionPrice));
  return Math.max(0, Math.round(t.weaponPrice[id] || 0));
}

// What the Society actually pays for a contract whose board says `reward`.
export const payFor = reward => Math.max(0, Math.round((+reward || 0) * live.payMultiplier));

// The rows the debug panel draws, so the panel does not have to know what any of these are. `step`
// is chosen per row rather than derived, because a slider for a probability and a slider for a
// price want very different granularity.
export const ROWS = [
  { key: 'startingPurse', label: 'Registration purse', min: 0, max: 400, step: 5 },
  { key: 'payMultiplier', label: 'Contract pay ×', min: 0.25, max: 4, step: 0.05 },
  { key: 'stonePrice', label: 'Awakening stone price', min: 20, max: 1200, step: 10 },
  { key: 'stoneDrop', label: 'Stone drop chance', min: 0, max: 1, step: 0.01 },
  { key: 'lootChance', label: 'Anything drops', min: 0, max: 1, step: 0.01 },
  { key: 'potionPrice', label: 'Healing potion price', min: 0, max: 300, step: 5 },
  { key: 'potionHeal', label: 'Healing potion heals', min: 5, max: 100, step: 5 },
  { key: 'greaterPotionPrice', label: 'Draught price', min: 0, max: 900, step: 5 },
];
