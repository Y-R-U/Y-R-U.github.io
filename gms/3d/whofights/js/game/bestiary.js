// What is standing in the room, and what it is called.
//
// One body, many monsters. js/world/elemental.js draws a stack of rock with a hot seam in it, and
// that silhouette is a fire elemental, a brine one, a gale, or a thing made of the dark, depending
// only on two colours and a handful of numbers. That is deliberate and it is the point: a contract
// board with forty jobs on it cannot afford forty rigs, and a player does not want forty either —
// they want the same fight to keep asking a different question.
//
// A spawn is `kind + variant`. The kind decides what it is made of, the variant what has been done
// to it, and the two multiply. Fourteen kinds and six variants is eighty-four monsters, all of
// them tuned relative to a fight that has already been balanced against the proving knife.
//
// Pure. js/game/foe.js takes the tuning this hands it and has no idea any of this exists.

import { EARTH } from './foe.js';

// `rock` is the body, `seam` the light in its cracks. Both are read straight by
// js/world/elemental.js. The tuning is a patch over EARTH, never a replacement: the base fight is
// the one the proving room was measured against, and a kind that redefined every field would drift
// away from it silently.
export const KINDS = {
  earth: {
    id: 'earth', name: 'Earth Elemental', rock: '#4a4238', seam: '#ff7a2a',
    heals: 'dirt',
    note: 'Slow, patient, and it mends off bare soil. Fight it on stone.',
    tuning: {},
  },
  ember: {
    id: 'ember', name: 'Ember Elemental', rock: '#3a1c14', seam: '#ff5a1e',
    heals: 'ash',
    note: 'Faster and it hits harder, and it mends standing in its own ash.',
    tuning: { hp: 62, speed: 3.1, damage: 14, windup: 0.5, regen: 26, regenDelay: 0.35, notice: 30 },
  },
  brine: {
    id: 'brine', name: 'Brine Elemental', rock: '#16303a', seam: '#3fd4ff',
    heals: 'water',
    note: 'It knits faster than anything else on the board and hits like a wet sack. Outlast it.',
    tuning: { hp: 96, speed: 2.0, damage: 8, regen: 34, regenDelay: 0.25, recover: 0.85 },
  },
  gale: {
    id: 'gale', name: 'Gale Elemental', rock: '#2b3438', seam: '#cfe9f2',
    heals: null,
    note: 'Quick, light, and it turns on the spot. Circling it does not work.',
    tuning: { hp: 48, speed: 4.1, damage: 9, windup: 0.42, recover: 0.7, turn: 7.0, regen: 0 },
  },
  shade: {
    id: 'shade', name: 'Shade', rock: '#14161f', seam: '#8f6cff',
    heals: null,
    note: 'It notices you from across a field, it does not stop, and nothing here mends it.',
    tuning: { hp: 70, speed: 3.4, damage: 12, notice: 60, windup: 0.46, regen: 0 },
  },
  mire: {
    id: 'mire', name: 'Mire Thing', rock: '#2c3320', seam: '#9ad14a',
    heals: 'dirt',
    note: 'Heavy, mends off anything soft, and takes a very long time to decide to swing.',
    tuning: { hp: 128, speed: 1.75, damage: 17, windup: 0.9, recover: 1.4, regen: 20 },
  },
  rust: {
    id: 'rust', name: 'Rust Hound', rock: '#3a2418', seam: '#e0902a',
    heals: null,
    note: 'It does not mend and it does not stop. Everything it has is in the first ten seconds.',
    tuning: { hp: 44, speed: 4.4, damage: 10, windup: 0.36, strike: 0.13, recover: 0.55, regen: 0 },
  },

  // ── bronze ────────────────────────────────────────────────────────────────
  // The step up is not "the same thing with more hit points" — a greater earth elemental already
  // is that, and the variant system makes it for free. What bronze adds is three fights that ask
  // a different question: one you cannot outlast, one you cannot outrun, and one you cannot get
  // ahead of on ground it likes.
  barrow: {
    id: 'barrow', name: 'Barrow-Wight', rock: '#26232c', seam: '#cfd6ff',
    heals: 'dirt',
    note: 'Slow, very heavy, and the turned earth it came out of puts it back together.',
    tuning: { hp: 150, speed: 2.0, damage: 21, windup: 0.82, recover: 1.25, regen: 26, regenDelay: 0.4, notice: 34 },
  },
  warden: {
    id: 'warden', name: 'Quarry Warden', rock: '#585048', seam: '#ffb038',
    heals: 'stone',
    note: 'Enormous, and it mends off the floor of its own quarry. Fight it anywhere else.',
    tuning: { hp: 200, speed: 1.6, damage: 26, reach: 3.0, arc: 1.7, windup: 1.05, strike: 0.2, recover: 1.6, regen: 30, regenDelay: 0.5, turn: 2.2 },
  },
  hollow: {
    id: 'hollow', name: 'Hollow Thing', rock: '#1b1426', seam: '#b46cff',
    heals: null,
    note: 'It knows where you are from anywhere on the floor and it is faster than you think.',
    tuning: { hp: 88, speed: 4.0, damage: 16, notice: 120, windup: 0.4, strike: 0.13, recover: 0.62, turn: 5.5, regen: 0 },
  },
};

export const KIND_IDS = Object.keys(KINDS);
export const DEFAULT_KIND = 'earth';

// What has been done to it. Multipliers rather than values, so a variant applied to any kind
// lands in the same place relative to that kind's own fight.
export const VARIANTS = {
  none:     { id: 'none',     name: '',          scale: 1.00, hp: 1.00, speed: 1.00, damage: 1.00, regen: 1.00, xp: 1.00 },
  lesser:   { id: 'lesser',   name: 'Lesser',    scale: 0.82, hp: 0.62, speed: 0.92, damage: 0.78, regen: 0.80, xp: 0.65 },
  greater:  { id: 'greater',  name: 'Greater',   scale: 1.22, hp: 1.85, speed: 0.92, damage: 1.30, regen: 1.15, xp: 1.90 },
  quick:    { id: 'quick',    name: 'Quickened', scale: 0.92, hp: 0.85, speed: 1.45, damage: 0.95, regen: 1.00, xp: 1.25 },
  stubborn: { id: 'stubborn', name: 'Stubborn',  scale: 1.05, hp: 1.20, speed: 0.88, damage: 0.95, regen: 1.90, xp: 1.45 },
  starved:  { id: 'starved',  name: 'Starved',   scale: 0.95, hp: 0.75, speed: 1.15, damage: 1.25, regen: 0.30, xp: 1.15 },
};

export const VARIANT_IDS = Object.keys(VARIANTS);

// Fields the variant scales. Anything not listed is the kind's own and stays that way: scaling
// `windup` would take away the tell, and scaling `arc` or `reach` would move the fight's geometry
// without saying so.
const SCALED = { hp: 'hp', speed: 'speed', damage: 'damage', regen: 'regen' };

export const kindOf = id => KINDS[id] || KINDS[DEFAULT_KIND];
export const variantOf = id => VARIANTS[id] || VARIANTS.none;

// One monster, fully resolved: what it is called, what it is made of, and the tuning js/game/foe.js
// will run it with. `spec` is a level document's `foes` entry.
export function describe(spec = {}) {
  const k = kindOf(spec.kind);
  const v = variantOf(spec.variant);
  const base = { ...EARTH, ...k.tuning };
  const tuning = { ...base };
  for (const f of Object.keys(SCALED)) tuning[f] = round(base[f] * v[f]);
  return {
    kind: k.id,
    variant: v.id,
    name: spec.name || (v.name ? `${v.name} ${k.name}` : k.name),
    note: k.note,
    heals: k.heals,
    rock: k.rock,
    seam: k.seam,
    scale: round((spec.scale || 1) * v.scale, 3),
    tuning,
    // What beating it is worth. Derived from the fight rather than authored beside it, so a
    // variant that is twice the monster is worth more experience without anybody remembering to
    // say so.
    //
    // Under a square root, and deliberately. Multiplied straight, a Stubborn Mire Thing came out
    // at twelve times a Lesser Shade — both of them iron work, both of them on the same board —
    // and an iron adventurer would have learnt to take one contract nine times. Rooted, the whole
    // iron board spans about five to one, which is a reason to pick and not a reason to grind.
    xp: Math.max(1, Math.round(14 * Math.sqrt((tuning.hp / EARTH.hp) * (tuning.damage / EARTH.damage)) * v.xp)),
  };
}

const round = (v, dp = 2) => +(+v).toFixed(dp);

// Every monster a board could ask for, for the dev tools and for the tests.
export function roster() {
  const out = [];
  for (const kind of KIND_IDS) for (const variant of VARIANT_IDS) out.push(describe({ kind, variant }));
  return out;
}
