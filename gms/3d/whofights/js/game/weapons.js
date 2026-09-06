// What the player swings, and how much of them there is to lose.
//
// Pure and on its own because it is the yardstick everything else in the fight is measured
// against: js/game/foe.js's regeneration is tuned in this file's units, and js/game/bestiary.js
// has to be able to prove in node that every monster it can build is still killable with it. Both
// of those tests need the numbers without needing three.

export const KNIFE = {
  damage: 9,
  reach: 2.6,
  arc: 1.9,
  cooldown: 0.75,
  // How long after the swing starts the blade is actually out there. Resolving on the press makes
  // a hit land before the animation has moved, which reads as the elemental flinching at nothing.
  land: 0.16,
};

export const PLAYER_HP = 100;

// Damage a second, held down, with nothing dodging. The one number js/game/foe.js's `regen` is
// balanced against — see the note there.
export const knifeDps = (k = KNIFE) => k.damage / k.cooldown;
