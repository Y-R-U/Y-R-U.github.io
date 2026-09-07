// What the player swings, and how much of them there is to lose.
//
// Pure and on its own because KNIFE is the yardstick everything else in the fight is measured
// against: js/game/foe.js's regeneration is tuned in its units, and js/game/bestiary.js has to be
// able to prove in node that every one of the sixty monsters is still killable with it. Both of
// those tests need the numbers without needing three.
//
// KNIFE has not moved and must not. Everything else is arranged around it: FISTS is deliberately
// worse, and every weapon the Weaponry sells is deliberately better, which weapons.test.mjs
// asserts. That is the whole shape of the table — a player who has bought something can never be
// worse off than a player who has not, and the proving stays exactly as hard as it was tuned.

// The proving knife. Society property, handed over at the gate and taken back at the desk — see
// `loaner` in data/levels/proving.json, which is the only thing that grants it.
export const KNIFE = {
  id: 'knife',
  name: 'Proving knife',
  damage: 9,
  reach: 2.6,
  arc: 1.9,
  cooldown: 0.75,
  // How long after the swing starts the blade is actually out there. Resolving on the press makes
  // a hit land before the animation has moved, which reads as the elemental flinching at nothing.
  land: 0.16,
};

// What you have when you have nothing. Not a punishment — a floor. It is slow and it is short and
// it will eventually kill a lesser elemental, which is what stops a player who has spent every
// mark on a stone from being stuck with no way back.
export const FISTS = {
  id: 'fists',
  name: 'Bare hands',
  damage: 4,
  reach: 1.9,
  arc: 1.75,
  cooldown: 0.60,
  land: 0.10,
};

// The racks at the Weaponry. Four weapons that are genuinely different to hold rather than four
// numbers going up: the dagger trades reach for speed, the spear trades speed for reach, the axe
// hits once for a lot, and the shortsword is the one with no opinion.
//
// `heft` is what js/player.js draws — a mesh profile, not a stat. Nothing in the fight reads it.
export const WEAPONS = {
  fists: FISTS,
  knife: KNIFE,

  dagger: {
    id: 'dagger', name: 'Boning dagger', heft: 'dagger',
    damage: 8, reach: 2.4, arc: 1.9, cooldown: 0.52, land: 0.12,
    blurb: 'Short, quick and honest about what it is for. Half the reach of a spear and twice the '
      + 'chances to use it.',
  },
  shortsword: {
    id: 'shortsword', name: 'Shortsword', heft: 'sword',
    damage: 14, reach: 3.0, arc: 2.0, cooldown: 0.70, land: 0.16,
    blurb: 'The weapon the Society would issue if the Society issued weapons. Nothing about it is '
      + 'clever and nothing about it is wrong.',
  },
  spear: {
    id: 'spear', name: 'Boar spear', heft: 'spear',
    damage: 17, reach: 4.1, arc: 1.15, cooldown: 0.88, land: 0.20,
    blurb: 'Reaches a thing before it reaches you, on the condition that you are pointing at it. '
      + 'The narrow arc is the price of the length.',
  },
  axe: {
    id: 'axe', name: 'Splitting axe', heft: 'axe',
    damage: 26, reach: 2.8, arc: 2.15, cooldown: 1.15, land: 0.24,
    blurb: 'A quarter of a second slower than you would like, every time. Whatever it lands on '
      + 'stops arguing.',
  },

  // ── the back of the shop ──────────────────────────────────────────────────
  // A silver contract pays six hundred marks and an awakening stone costs two hundred and forty,
  // so without these there is nothing above iron rank to want. They are roughly twice the axe and
  // they are priced so that a bronze adventurer can see them and not have them.
  //
  // The three are the same three arguments the first three are — quick, long, heavy — made again
  // at a size that can be brought to a Verge. They share their silhouettes with the racks below
  // them, which is a saving js/player.js's four profiles are there to make.
  warsword: {
    id: 'warsword', name: 'Warsword', heft: 'sword',
    damage: 30, reach: 3.2, arc: 2.05, cooldown: 0.70, land: 0.17,
    blurb: 'What a shortsword grows up into. Long enough to matter, quick enough that you do not '
      + 'have to plan around it, and it costs what a year of iron work costs.',
  },
  pike: {
    id: 'pike', name: 'Wall pike', heft: 'spear',
    damage: 44, reach: 4.8, arc: 1.10, cooldown: 1.05, land: 0.24,
    blurb: 'Made for holding a gate against something that does not care about gates. You will '
      + 'hit one thing at a time and it will be the thing you were pointing at.',
  },
  maul: {
    id: 'maul', name: 'Quarry maul', heft: 'axe',
    damage: 72, reach: 3.0, arc: 2.2, cooldown: 1.55, land: 0.30,
    blurb: 'A stone-splitter with a longer haft on it. A second and a half between swings, and '
      + 'nothing at silver rank survives three.',
  },
};

export const PLAYER_HP = 100;

// Damage a second, held down, with nothing dodging. The one number js/game/foe.js's `regen` is
// balanced against — see the note there.
export const knifeDps = (k = KNIFE) => k.damage / k.cooldown;
export const dpsOf = knifeDps;

// What the player is holding. Unknown, missing and null all answer FISTS rather than throwing: an
// old save naming a weapon this build has dropped is a player with empty hands, not a crash.
export const weaponOf = id => WEAPONS[id] || FISTS;

// Is this something a shop may stock? The knife is not, because it is not the player's, and the
// fists are not, because they are not a thing.
export const buyable = id => !!WEAPONS[id] && id !== 'knife' && id !== 'fists';

export const buyableIds = () => Object.keys(WEAPONS).filter(buyable);
