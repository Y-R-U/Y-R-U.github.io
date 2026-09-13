// What a rank is worth, on both sides of the fight.
//
// Iron, bronze, silver, gold is the Society's whole ladder and until now it only decided which
// floor you could stand on. It decides everything here: how much of you there is, how hard a
// thing hits, what a kill is worth and what a contract below you is worth, which is almost
// nothing.
//
// One step of the ladder is ×3 on what a monster hits for and ×2.2 on how much of it there is.
// Those two are deliberately different. Damage climbing faster than health is what makes the
// rule Aaron asked for true — a silver-rank monster kills an iron-rank adventurer in one blow —
// and health climbing slower is what keeps a fight the same length at every rung, because the
// player's own damage climbs on abilities and a shop, not on a rank multiplier.
//
// Pure. Nothing here knows what a monster is made of or what an ability does; it answers with
// numbers and js/game/bestiary.js and js/game/combat.js apply them.

import { RANKS, RANK_LABEL, rankIndex } from './contracts.js';

export { RANKS, RANK_LABEL, rankIndex };

// The ranks work can actually be at. `none` is not one — an unranked adventurer fights the
// proving elemental, which is iron work with the Society's own knife.
export const WORK_RANKS = RANKS.filter(r => r !== 'none');

export const HP_STEP = 2.2;
export const DAMAGE_STEP = 3;

const step = (mul, i) => +(mul ** i).toFixed(3);

// What a monster's rank does to it. Multiplied over the kind's own numbers once those have been
// normalised to their band — see js/game/bestiary.js, which is the only caller.
export const MONSTER = Object.fromEntries(WORK_RANKS.map((r, i) => [r, {
  hp: step(HP_STEP, i),
  damage: step(DAMAGE_STEP, i),
}]));

// What the player's rank does to the player. `resist` is what a blow loses before it reaches you
// and `thrift` is what a spell costs less; both are Aaron's "both should take more to go down on
// higher ranks", said as the two numbers the fight actually reads.
//
// Effective health is `hp / (1 - resist)`: 100, 273, 744, 1986 — about ×2.7 a rung against the
// ×3 a monster gains, so every promotion is a step into slightly deeper water rather than a
// straight re-run of the rung below.
export const PLAYER = {
  none:   { hp: 100,  mana: 100, resist: 0,    thrift: 0,    power: 1 },
  iron:   { hp: 100,  mana: 100, resist: 0,    thrift: 0,    power: 1 },
  bronze: { hp: 240,  mana: 165, resist: 0.12, thrift: 0.12, power: 2 },
  silver: { hp: 580,  mana: 270, resist: 0.22, thrift: 0.22, power: 4 },
  gold:   { hp: 1390, mana: 440, resist: 0.30, thrift: 0.30, power: 8 },
};

export const playerAt = rank => PLAYER[rank] || PLAYER.none;
export const monsterAt = rank => MONSTER[rank] || MONSTER.iron;

// How much of a blow a rank actually stops, all in: the ceiling divided by what gets through.
export const effectiveHp = rank => Math.round(playerAt(rank).hp / (1 - playerAt(rank).resist));

// The least a monster of this rank hits for, whatever it is made of. Aaron's rule stated as a
// number: **a silver-rank monster kills an iron-rank adventurer in one shot** — so nothing at
// silver hits for less than an iron adventurer is worth, and nothing at gold for less than a
// bronze one.
//
// Two rungs, not one. One rung up has to stay a fight you can lose rather than a fight you cannot
// have, which is what makes the boards' rank gate the whole of the difficulty curve: the work you
// are allowed to take is the work that will not delete you.
//
// It bites on the feeble end of a band and nowhere else — a Tallyman hits for almost nothing by
// the standards of its own rank, and at silver "almost nothing" is still the end of an iron
// adventurer.
export function floorDamage(rank) {
  const i = WORK_RANKS.indexOf(rank);
  return i >= 2 ? effectiveHp(WORK_RANKS[i - 2]) : 0;
}

export const maxHp = rank => playerAt(rank).hp;
export const maxMana = rank => playerAt(rank).mana;

// A blow, after rank. Nothing else in the fight may take a percentage off damage — a ward is a
// separate multiplier in js/game/combat.js and the two compound on purpose.
export const soak = (rank, amount) => Math.max(0, amount) * (1 - playerAt(rank).resist);

// What a spell costs at this rank, rounded up so thrift can never make something free.
export const costAt = (rank, cost) => Math.max(1, Math.ceil(Math.max(0, cost) * (1 - playerAt(rank).thrift)));

// How much better every essence ability is at this rank. One number over damage, mending, wards,
// the mana an ability draws back and the lift a buff gives, because an ability that got stronger
// in one of those and not the others would be a different ability at bronze than at iron.
export const powerAt = rank => playerAt(rank).power;

// Work below your rank is barely work. Aaron: "you should still be close to start of bronze" —
// a bronze adventurer clearing the iron board should see a trickle, not a ladder.
//
// Indexed by how many rungs below you the work is. Above or level is full value: a contract you
// are only just allowed to take should pay all of itself.
export const XP_SCALE = [1, 0.12, 0.03, 0.01];

export function xpScale(playerRank, workRank) {
  const gap = rankIndex(playerRank) - rankIndex(workRank);
  if (gap <= 0) return 1;
  return XP_SCALE[Math.min(gap, XP_SCALE.length - 1)];
}

// What one monster is carrying. Every monster drops coins — that is the rule, and it is why
// there is no chance in this function — and how many is what it was worth to kill, which is
// already the one number that knows its rank, its kind and what has been done to it.
//
// `rate` is the pacing knob out of js/game/economy.js; `rnd` only spreads a purse either side of
// what the monster is worth, so a kill can be lucky without a kill ever being empty.
export function coinsFor(worth, rate = 0.35, rnd = Math.random) {
  const spread = 0.75 + rnd() * 0.5;
  return Math.max(1, Math.round(Math.max(0, worth) * Math.max(0, rate) * spread));
}
