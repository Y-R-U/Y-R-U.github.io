// Recruitment banners (no real money, D10). `unlock` = feature id from maps.js FEATURE_UNLOCKS.
// pool 'all' = every unit in units.js
export const RECRUIT = {
  street: { id: 'street', name: 'Street Hire', unlock: 'recruit_street', cost: { credits: 1500 },
    rates: { common: 0.72, rare: 0.24, epic: 0.035, legendary: 0.005 }, pool: 'all', pity: { epic: 40 } },
  contract: { id: 'contract', name: 'Corporate Contract', unlock: 'recruit_contract', cost: { chips: 120 },
    rates: { common: 0, rare: 0.70, epic: 0.25, legendary: 0.05 }, pool: 'all', pity: { legendary: 50 } },
  arena: { id: 'arena', name: 'League Draft', unlock: 'recruit_arena', cost: { arena_tokens: 250 },
    rates: { common: 0, rare: 0.60, epic: 0.35, legendary: 0.05 }, pool: 'all', pity: { legendary: 40 } },
  // Rift Gate (D21): fantasy recruits only. Each unit joins the pool when its `recruitable` level is cleared
  // (enemies.js); chips because they pile up late. Opens on m6_l16 (Elderbark).
  rift: { id: 'rift', name: 'Rift Gate', unlock: 'recruit_rift', cost: { chips: 150 },
    rates: { common: 0.25, rare: 0.5, epic: 0.25, legendary: 0 }, pool: ['dire_wolf', 'elf_ranger', 'frost_wolf', 'horde_shaman', 'rift_knight', 'elf_sage', 'minotaur', 'treant'], pity: { epic: 12 } },
  // faction-featured banners: event_marks from faction trials
  corporate_draft: { id: 'corporate_draft', name: 'Halvorsen Surplus', unlock: 'faction_trials', cost: { event_marks: 100 },
    rates: { common: 0.3, rare: 0.5, epic: 0.17, legendary: 0.03 }, pool: ['warden', 'bulwark', 'citadel', 'paladin', 'gunner', 'lancer', 'meridian', 'executor', 'patch', 'aegis', 'arbiter', 'paragon'], pity: { epic: 20 } },
  rogue_draft: { id: 'rogue_draft', name: 'Ledger Black Market', unlock: 'faction_trials', cost: { event_marks: 100 },
    rates: { common: 0.3, rare: 0.5, epic: 0.17, legendary: 0.03 }, pool: ['scrapper', 'riot', 'juggernaut', 'warlord', 'rattler', 'barb', 'tarantula', 'widowmaker', 'sparkplug', 'jammer', 'pyre', 'kingpin'], pity: { epic: 20 } },
  experimental_draft: { id: 'experimental_draft', name: 'Lattice Signal', unlock: 'faction_trials', cost: { event_marks: 100 },
    rates: { common: 0.3, rare: 0.5, epic: 0.17, legendary: 0.03 }, pool: ['husk', 'phase', 'monolith', 'leviathan', 'needle', 'prism', 'specter', 'seraph', 'wisp', 'oracle', 'halo', 'singularity'], pity: { epic: 20 } },
};
export default RECRUIT;
