// Combat constants (DATA.rules) — overrides js/sim/constants.js DEFAULT_RULES. See docs/DESIGN.md.
export const RULES = {
  triangle: { adv: 0.15, resist: 0.10 }, // sim matchups: 0.25/0.20 made mono-role fights 0%/100%
  position: {
    tank: { front: { name: 'Bulwark', mods: { dr: 0.10 }, taunt: true }, back: { name: 'Out of reach', mods: { dmg: -0.30 } } },
    archer: { back: { name: 'Overwatch', mods: { atk: 0.20, vs: { tank: 0.35 } } }, front: { name: 'Exposed', mods: { dr: -0.15 } } },
    mage: { back: { name: 'Focus', mods: { atk: 0.10, heal: 0.15 } }, side: { name: 'Flank Field', mods: { charge: 0.15 } } },
  },
  charge: { perAttack: 10, perHitTakenPctHp: 50, perSec: 1.5, onKill: 10, stunRefund: 50 },
  shieldCap: 0.6,
  markedPreferred: true,
  defK: 300,
  drCap: 0.6,
  critCap: 0.75,
  variance: 0.06,
  waveGap: 2.0,
  waveTimeout: 75,
  waveHeal: 0.10,
  startDelay: 1.0,
  waveClear: 'all',
  overdriveRecover: 0.8,
  rankMult: [1, 1.15, 1.32, 1.52, 1.75, 2.0],
  stars: { twoMaxLost: 1 },
  overtime: { start: 45, dmgPerSec: 0.04, healPenalty: 0.5 }, // kills tank+healer stalemates (harness run 2/3 timeouts)
};
export default RULES;
