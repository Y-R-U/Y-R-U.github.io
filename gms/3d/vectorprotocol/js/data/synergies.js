// SynergyDefs (docs/DESIGN.md §9). Faction tiers: highest tier only. Role-mix: all that apply stack.
export const SYNERGIES = [
  { id: 'compliance_grid', name: 'Compliance Grid', kind: 'faction', faction: 'corporate', icon: 'corporate',
    desc: 'Corporate units gain HP and armour; at 6, the whole squad heals harder.',
    tiers: [{ count: 2, mods: { hp: 0.06, def: 0.10 } }, { count: 4, mods: { hp: 0.10, def: 0.15, heal: 0.08 } }, { count: 6, mods: { hp: 0.15, def: 0.22, heal: 0.12 } }] },
  { id: 'street_rules', name: 'Street Rules', kind: 'faction', faction: 'rogue', icon: 'rogue',
    desc: 'Rogue units crit more often and harder.',
    tiers: [{ count: 2, mods: { crit: 0.10 } }, { count: 4, mods: { crit: 0.18, critDmg: 0.25 } }, { count: 6, mods: { crit: 0.25, critDmg: 0.40, atk: 0.10 } }] },
  { id: 'unstable_core', name: 'Unstable Core', kind: 'faction', faction: 'experimental', icon: 'experimental',
    desc: 'Experimental units charge Overdrive faster and hit harder with it.',
    tiers: [{ count: 2, mods: { charge: 0.15 } }, { count: 4, mods: { charge: 0.25, dmg: 0.04 } }, { count: 6, mods: { charge: 0.30, dmg: 0.06 } }] },
  // fantasy factions (D21) — enemy squads in the Verdance; reusable by a sister game
  { id: 'oath_of_steel_order', name: 'Oath of the Order', kind: 'faction', faction: 'order', icon: 'order', realm: 'fantasy',
    tiers: [{ count: 2, mods: { def: 0.15, dr: 0.04 } }, { count: 4, mods: { def: 0.30, dr: 0.08 } }, { count: 6, mods: { def: 0.45, dr: 0.12 } }] },
  { id: 'call_of_the_wild', name: 'Call of the Wild', kind: 'faction', faction: 'wild', icon: 'wild', realm: 'fantasy',
    tiers: [{ count: 2, mods: { heal: 0.15, spd: 0.05 } }, { count: 4, mods: { heal: 0.25, spd: 0.10 } }, { count: 6, mods: { heal: 0.40, spd: 0.15 } }] },
  { id: 'blood_of_the_horde', name: 'Blood of the Horde', kind: 'faction', faction: 'horde', icon: 'horde', realm: 'fantasy',
    tiers: [{ count: 2, mods: { atk: 0.08 } }, { count: 4, mods: { atk: 0.15, critDmg: 0.2 } }, { count: 6, mods: { atk: 0.25, critDmg: 0.3 } }] },

  { id: 'triad_protocol', name: 'Triad Protocol', kind: 'roles', need: { tank: 1, archer: 1, mage: 1 }, mods: { hp: 0.06, atk: 0.06 }, to: 'all', icon: 'triad',
    desc: 'At least one Tank, Archer and Mage: +6% HP and ATK for everyone.' },
  { id: 'full_spectrum', name: 'Full Spectrum', kind: 'roles', need: { tank: 2, archer: 2, mage: 2 }, mods: { hp: 0.06, atk: 0.06 }, to: 'all', icon: 'spectrum',
    desc: 'Two of every role: another +6% HP and ATK (12% with Triad).' },
  { id: 'iron_wall', name: 'Iron Wall', kind: 'role', role: 'tank', tiers: [{ count: 3, mods: { hp: 0.20, dr: 0.05 } }], to: 'role', icon: 'tank',
    desc: 'Three Tanks: Tanks +20% HP, +5% damage reduction.' },
  { id: 'firing_line', name: 'Firing Line', kind: 'role', role: 'archer', tiers: [{ count: 3, mods: { spd: 0.12 } }], to: 'role', icon: 'archer',
    desc: 'Three Archers: Archers attack 12% faster.' },
  { id: 'resonance', name: 'Resonance', kind: 'role', role: 'mage', tiers: [{ count: 3, mods: { heal: 0.20, charge: 0.10 } }], to: 'role', icon: 'mage',
    desc: 'Three Mages: Mage heals/shields +20%, Overdrive charge +10%.' },
];
export default SYNERGIES;
