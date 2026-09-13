// js/data/meta.js — the Sanctum. CONTRACTS §8.4, DESIGN §4/§5.
//
// Permanent, Souls-bought, and shaped as a TREE rather than a shop, because
// DESIGN §4 says the Sanctum physically grows doors as you unlock things. A
// node is visible and buyable only when every id in `requires` is at level >= 1,
// so the room opens out in front of the player instead of arriving complete.
//
// `cost(level)` takes the level you CURRENTLY have and returns the price of the
// next one. cost(0) is the first purchase. It is a pure geometric curve, so it
// is monotonic by construction and there is no table to get out of step.
//
// `mode` says how `perLevel` composes:
//   'mul'  stats[stat] *= 1 + perLevel * level     (linear in level, no compounding)
//   'add'  stats[stat] += perLevel * level
//
// `stat` names a DerivedStats field (CONTRACTS §7.2) EXCEPT for the six run
// values in META_STATS below, which are not derived stats at all — they are
// applied by the host when the world is created. A later lane must read
// META_STATS rather than assuming every sanctum stat lives on DerivedStats.
//
// Souls-per-run curve this is priced against is in docs/lanes/C-meta.md.

const geo = (base, growth) => (level) => Math.round(base * Math.pow(growth, Math.max(0, level)));

// Sanctum stats that are NOT DerivedStats fields. Applied to the run, not to
// the stat block: maxHp/revives at world creation, the three charges to the
// level-up screen, startLevel to the player's opening level.
export const META_STATS = Object.freeze([
  'maxHp', 'revives', 'rerolls', 'banishes', 'skips', 'startLevel'
]);

export const SANCTUM = Object.freeze({

  // ══════════════════════════ ROOTS — the three doors that are already open

  might: {
    id: 'might', name: 'Grave Ash', desc: 'Everything you hold hits harder.',
    stat: 'might', mode: 'mul', perLevel: 0.05, max: 10,
    cost: geo(25, 1.42), requires: []
  },

  vigour: {
    id: 'vigour', name: 'Vigour', desc: 'You last a little longer than the last one did.',
    stat: 'maxHp', mode: 'add', perLevel: 12, max: 10,
    cost: geo(20, 1.40), requires: []
  },

  greed: {
    id: 'greed', name: 'The Tithe', desc: 'More Souls out of every run, won or lost.',
    stat: 'greed', mode: 'mul', perLevel: 0.06, max: 8,
    cost: geo(30, 1.55), requires: []
  },

  // ══════════════════════════ SECOND DOOR

  haste: {
    id: 'haste', name: 'Quickstep', desc: 'Everything comes round again sooner.',
    stat: 'haste', mode: 'mul', perLevel: 0.03, max: 8,
    cost: geo(60, 1.50), requires: ['might']
  },

  area: {
    id: 'area', name: "Widow's Span", desc: 'Everything you do covers more ground.',
    stat: 'area', mode: 'mul', perLevel: 0.04, max: 8,
    cost: geo(60, 1.50), requires: ['might']
  },

  armour: {
    id: 'armour', name: "Mourner's Plate", desc: 'Flat reduction on every hit you take.',
    stat: 'armour', mode: 'add', perLevel: 1, max: 8,
    cost: geo(55, 1.50), requires: ['vigour']
  },

  regen: {
    id: 'regen', name: 'Slow Mending', desc: 'You close, given a quiet minute.',
    stat: 'regen', mode: 'add', perLevel: 0.15, max: 6,
    cost: geo(70, 1.55), requires: ['vigour']
  },

  magnet: {
    id: 'magnet', name: 'Lodestone', desc: 'Shards come to you instead of waiting.',
    stat: 'magnet', mode: 'mul', perLevel: 0.12, max: 6,
    cost: geo(45, 1.45), requires: ['greed']
  },

  luck: {
    id: 'luck', name: "Hanged Man's Charm", desc: 'Better drops, better chests, more Freed.',
    stat: 'luck', mode: 'mul', perLevel: 0.05, max: 8,
    cost: geo(65, 1.50), requires: ['greed']
  },

  // ══════════════════════════ THIRD DOOR

  // The identity stat, deliberately behind area and deliberately expensive:
  // cutting is the skill, and the Sanctum should reward practising it, not
  // replace it.
  sever: {
    id: 'sever', name: "Ilse's Lesson", desc: 'A wider margin for error on the thread.',
    stat: 'sever', mode: 'mul', perLevel: 0.08, max: 8,
    cost: geo(120, 1.55), requires: ['area']
  },

  duration: {
    id: 'duration', name: 'Wax Seal', desc: 'Whatever you leave behind lasts.',
    stat: 'duration', mode: 'mul', perLevel: 0.05, max: 6,
    cost: geo(80, 1.50), requires: ['area']
  },

  crit: {
    id: 'crit', name: 'Whetstone', desc: 'Finds the seam between two things.',
    stat: 'crit', mode: 'add', perLevel: 0.02, max: 8,
    cost: geo(110, 1.50), requires: ['haste']
  },

  speed: {
    id: 'speed', name: "Pauper's Boots", desc: 'You move a little better than they do.',
    stat: 'speed', mode: 'mul', perLevel: 0.03, max: 6,
    cost: geo(90, 1.50), requires: ['armour']
  },

  growth: {
    id: 'growth', name: 'Appetite', desc: 'Shards are worth more XP.',
    stat: 'growth', mode: 'mul', perLevel: 0.05, max: 6,
    cost: geo(100, 1.55), requires: ['luck']
  },

  reroll: {
    id: 'reroll', name: 'Second Thoughts', desc: 'Reroll a level-up offer.',
    stat: 'rerolls', mode: 'add', perLevel: 1, max: 5,
    cost: geo(150, 1.80), requires: ['luck']
  },

  // ══════════════════════════ FOURTH DOOR — the long goals

  banish: {
    id: 'banish', name: 'Struck Off', desc: 'Remove an offer from the run for good.',
    stat: 'banishes', mode: 'add', perLevel: 1, max: 4,
    cost: geo(250, 1.90), requires: ['reroll']
  },

  skip: {
    id: 'skip', name: 'Decline', desc: 'Take nothing, and keep the level for later.',
    stat: 'skips', mode: 'add', perLevel: 1, max: 3,
    cost: geo(300, 2.00), requires: ['reroll']
  },

  curse: {
    id: 'curse', name: 'Invitation', desc: 'Everything is stronger. Everything pays more.',
    stat: 'curse', mode: 'mul', perLevel: 0.10, max: 5,
    cost: geo(200, 1.60), requires: ['sever']
  },

  startlevel: {
    id: 'startlevel', name: 'Forewarned', desc: 'Begin every run already levelled.',
    stat: 'startLevel', mode: 'add', perLevel: 1, max: 5,
    cost: geo(400, 1.90), requires: ['growth']
  },

  amount: {
    id: 'amount', name: 'Split Tongue', desc: 'One more of everything that is thrown.',
    stat: 'amount', mode: 'add', perLevel: 1, max: 2,
    cost: geo(1800, 3.00), requires: ['crit']
  },

  revival: {
    id: 'revival', name: 'Not Yet', desc: 'Stand back up once, at half health.',
    stat: 'revives', mode: 'add', perLevel: 1, max: 3,
    cost: geo(900, 3.00), requires: ['regen']
  }

});

export const list = Object.freeze(Object.keys(SANCTUM).map(k => SANCTUM[k]));

// Total Souls to max the whole tree, for the balance harness to sanity-check
// against the souls-per-run curve rather than anyone eyeballing it.
export function totalCost() {
  let t = 0;
  for (const n of list) for (let l = 0; l < n.max; l++) t += n.cost(l);
  return t;
}
