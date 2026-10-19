// Sim-side defaults. DATA.rules overrides any of these (deep-merged one level).
export const TICKS_PER_SEC = 10;
export const ROLES = ['tank', 'archer', 'mage'];
export const FACTIONS = ['corporate', 'rogue', 'experimental'];
export const FANTASY_FACTIONS = ['order', 'wild', 'horde']; // D21 NPC factions (enemy-only for now)
export const ALL_FACTIONS = [...FACTIONS, ...FANTASY_FACTIONS];
export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
// Archer > Mage > Tank > Archer
export const BEATS = { archer: 'mage', mage: 'tank', tank: 'archer' };

export const DEFAULT_RULES = {
  triangle: { adv: 0.25, resist: 0.20 },
  // keys: front | back | side (lane 0/2) | mid. DESIGN.md §4.
  position: {
    tank: { front: { name: 'Bulwark', mods: { dr: 0.15 }, taunt: true }, back: { name: 'Out of reach', mods: { dmg: -0.30 } } },
    archer: { back: { name: 'Overwatch', mods: { atk: 0.20 } }, front: { name: 'Exposed', mods: { dr: -0.15 } } },
    mage: { back: { name: 'Focus', mods: { atk: 0.10, heal: 0.15 } }, side: { name: 'Flank Field', mods: { charge: 0.15 } } },
  },
  charge: { perAttack: 10, perHitTakenPctHp: 50, perSec: 1.5, onKill: 10, stunRefund: 50 },
  shieldCap: 0.6,          // total shield <= 60% max HP
  markedPreferred: true,
  screenBypass: null,      // e.g. { archer: 'mage' } = archers shoot over the front at a mage in their lane   // single picks prefer 'marked' units after taunt
  defK: 300,
  drCap: 0.6,
  critCap: 0.75,
  variance: 0.06,
  windup: 0.3,
  meleeWindup: 0.35,
  projectileSpeed: 9,
  waveGap: 2.0,
  waveTimeout: 75,
  overtime: { start: 45, dmgPerSec: 0.04, healPenalty: 0.5 }, // null disables
  waveHeal: 0.10,
  startDelay: 1.0,        // deploy: no actions for the first second of each wave
  waveClear: 'all',       // statuses + shields cleared between waves ('all' | 'debuffs' | 'none')
  overdriveRecover: 0.8, // seconds a unit is busy after an overdrive
  rankMult: [1, 1.15, 1.32, 1.52, 1.75, 2.0],
  stars: { twoMaxLost: 1 }, // win=1, <=1 lost=2, none lost=3
};

export function mergeRules(r = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULT_RULES)) {
    const d = DEFAULT_RULES[k], v = r[k];
    out[k] = v === undefined ? d
      : (d && typeof d === 'object' && !Array.isArray(d) && typeof v === 'object' && !Array.isArray(v)) ? { ...d, ...v } : v;
  }
  for (const k of Object.keys(r)) if (!(k in out)) out[k] = r[k];
  return out;
}

export const DEFAULT_STATUSES = {
  burn: { id: 'burn', name: 'Burn', kind: 'debuff', icon: 'burn', dot: { mult: 0.25 }, stack: 'stack', maxStacks: 3 },
  shock: { id: 'shock', name: 'Shock', kind: 'debuff', icon: 'shock', stun: true, stack: 'refresh' },
  stun: { id: 'stun', name: 'Stun', kind: 'debuff', icon: 'stun', stun: true, stack: 'refresh' },
  slow: { id: 'slow', name: 'Slow', kind: 'debuff', icon: 'slow', mods: { spd: -0.3 }, stack: 'refresh' },
  weaken: { id: 'weaken', name: 'Weaken', kind: 'debuff', icon: 'weaken', mods: { atk: -0.25 }, stack: 'refresh' },
  expose: { id: 'expose', name: 'Expose', kind: 'debuff', icon: 'expose', mods: { def: -0.4, dr: -0.15 }, stack: 'refresh' },
  marked: { id: 'marked', name: 'Marked', kind: 'debuff', icon: 'marked', mods: { dr: -0.2 }, stack: 'refresh' },
  emp: { id: 'emp', name: 'EMP', kind: 'debuff', icon: 'emp', mods: { charge: -1 }, stack: 'refresh' },
  fortify: { id: 'fortify', name: 'Fortify', kind: 'buff', icon: 'fortify', mods: { dr: 0.25 }, stack: 'refresh' },
  haste: { id: 'haste', name: 'Haste', kind: 'buff', icon: 'haste', mods: { spd: 0.35 }, stack: 'refresh' },
  overclock: { id: 'overclock', name: 'Overclock', kind: 'buff', icon: 'overclock', mods: { atk: 0.3, crit: 0.15 }, stack: 'refresh' },
  regen: { id: 'regen', name: 'Repair Field', kind: 'buff', icon: 'regen', hot: { mult: 0.2 }, stack: 'refresh' },
  taunt: { id: 'taunt', name: 'Taunt', kind: 'buff', icon: 'taunt', taunt: true, stack: 'refresh' },
  stealth: { id: 'stealth', name: 'Cloak', kind: 'buff', icon: 'stealth', stealth: true, stack: 'refresh' },
};
