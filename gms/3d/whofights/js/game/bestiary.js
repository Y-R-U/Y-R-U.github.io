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
// A kind may also name a BUILD — one of the four silhouettes in js/world/elemental.js — and a
// `scale`. Up to the silver board it could not: every monster in the game was the same stack of
// rock with two colours swapped, which is exactly why docs/RESUME.md §6.10 said the silver board
// had nothing to be made of. A processional is tall, a thing that counts is squat and low, a
// glasswright is spindly, and the Verge is the size of a gatehouse because its writing says so.
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
    build: 'spindly',
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
    build: 'squat',
    heals: 'dirt',
    note: 'Heavy, mends off anything soft, and takes a very long time to decide to swing.',
    tuning: { hp: 128, speed: 1.75, damage: 17, windup: 0.9, recover: 1.4, regen: 20 },
  },
  rust: {
    id: 'rust', name: 'Rust Hound', rock: '#3a2418', seam: '#e0902a',
    build: 'spindly',
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
    build: 'tall',
    heals: 'dirt',
    note: 'Slow, very heavy, and the turned earth it came out of puts it back together.',
    scale: 1.18,
    tuning: { hp: 150, speed: 2.0, damage: 21, windup: 0.82, recover: 1.25, regen: 26, regenDelay: 0.4, notice: 34, radius: 0.95 },
  },
  warden: {
    id: 'warden', name: 'Quarry Warden', rock: '#585048', seam: '#ffb038',
    build: 'squat',
    heals: 'stone',
    note: 'Enormous, and it mends off the floor of its own quarry. Fight it anywhere else.',
    scale: 1.35,
    tuning: { hp: 200, speed: 1.6, damage: 26, reach: 3.0, arc: 1.7, windup: 1.05, strike: 0.2, recover: 1.6, regen: 30, regenDelay: 0.5, turn: 2.2, radius: 1.2 },
  },
  hollow: {
    id: 'hollow', name: 'Hollow Thing', rock: '#1b1426', seam: '#b46cff',
    build: 'spindly',
    heals: null,
    note: 'It knows where you are from anywhere on the floor and it is faster than you think.',
    tuning: { hp: 88, speed: 4.0, damage: 16, notice: 120, windup: 0.4, strike: 0.13, recover: 0.62, turn: 5.5, regen: 0 },
  },

  // ── silver ────────────────────────────────────────────────────────────────
  // docs/RESUME.md §6.10: "Silver wants something the bestiary does not have — every kind in it is
  // a lump of rock with a seam, and the writing on that board is about processions and things that
  // count." These four are the answer, and they are the reason js/world/elemental.js has builds:
  // a processional is TALL, a thing that counts is SQUAT and low to the ground, and a glasswright
  // is SPINDLY and reads as fast before it has moved.
  chant: {
    id: 'chant', name: 'Processional', rock: '#3b3550', seam: '#e8d7a0',
    build: 'tall',
    heals: 'stone',
    note: 'It walks in a line, it does not hurry, and it reaches further than anything you have '
      + 'fought. Flagstones put it back together.',
    scale: 1.30,
    tuning: { hp: 240, speed: 1.55, damage: 30, reach: 3.6, arc: 1.5, windup: 1.15, strike: 0.22, recover: 1.7, regen: 24, regenDelay: 0.5, turn: 1.9, notice: 70, radius: 1.05 },
  },
  tally: {
    id: 'tally', name: 'Tallyman', rock: '#2a2620', seam: '#7fe0b0',
    build: 'squat',
    heals: 'ash',
    note: 'It hits for almost nothing and it never stops, and every scrap of ash on the floor is '
      + 'somewhere it can put itself back together. You do not beat it, you outlast it.',
    scale: 1.15,
    tuning: { hp: 210, speed: 2.2, damage: 9, windup: 0.55, strike: 0.14, recover: 0.7, regen: 40, regenDelay: 0.22, notice: 55, radius: 1.15 },
  },
  glass: {
    id: 'glass', name: 'Glasswright', rock: '#20323a', seam: '#8ff0ff',
    build: 'spindly',
    heals: null,
    note: 'Very little of it, moving very fast, hitting harder than anything its size has any '
      + 'right to. Two mistakes is all you get.',
    scale: 0.92,
    tuning: { hp: 74, speed: 4.6, damage: 33, windup: 0.34, strike: 0.12, recover: 0.5, turn: 6.5, notice: 65, regen: 0, radius: 0.72 },
  },

  // ── gold ──────────────────────────────────────────────────────────────────
  // Four contracts in the province, and this is what is on three of them.
  verge: {
    id: 'verge', name: 'The Verge', rock: '#141a14', seam: '#c8ff5a',
    build: 'tall',
    heals: 'grass',
    note: 'It is the size of a gatehouse and everything green in the field is its ground. There '
      + 'is no version of this fight where you are not on its floor.',
    scale: 1.75,
    tuning: { hp: 330, speed: 1.9, damage: 34, reach: 3.4, arc: 1.9, windup: 0.95, strike: 0.2, recover: 1.5, regen: 32, regenDelay: 0.45, turn: 2.4, notice: 140, radius: 1.5 },
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
    // Which silhouette js/world/elemental.js draws it as. Absent is the original stack, which is
    // what every kind authored before there were builds meant.
    build: k.build || 'stack',
    // The kind's own size times what the variant did to it. A kind that names no scale is the
    // size the earth elemental has always been, which is what every kind authored before silver
    // meant by saying nothing.
    scale: round((spec.scale || 1) * (k.scale || 1) * v.scale, 3),
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
