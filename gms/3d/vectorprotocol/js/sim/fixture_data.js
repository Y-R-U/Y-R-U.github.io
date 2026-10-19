// Small complete example dataset (every SCHEMA.md shape). Used when js/data/index.js is
// absent and by tests. Numbers are placeholders, not the design's balance.
const A = (o) => o;

const abilities = {
  // ---- basic attacks
  shield_bash: A({ id: 'shield_bash', name: 'Shield Bash', icon: 'bash', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'melee' }, effects: [{ type: 'damage', mult: 1.0 }] }),
  scrap_claw: A({ id: 'scrap_claw', name: 'Scrap Claw', icon: 'claw', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'melee' }, effects: [{ type: 'damage', mult: 1.0 }] }),
  grav_slam: A({ id: 'grav_slam', name: 'Grav Slam', icon: 'slam', kind: 'attack', target: { side: 'enemy', pick: 'lane', splash: 0.3 }, delivery: { type: 'melee' }, effects: [{ type: 'damage', mult: 0.9 }] }),
  rail_shot: A({ id: 'rail_shot', name: 'Rail Shot', icon: 'rail', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'projectile', speed: 14 }, effects: [{ type: 'damage', mult: 1.0 }] }),
  needle_burst: A({ id: 'needle_burst', name: 'Needle Burst', icon: 'needle', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'projectile', speed: 10 }, effects: [{ type: 'damage', mult: 0.85 }, { type: 'status', status: 'marked', duration: 2, chance: 0.25 }] }),
  prism_bolt: A({ id: 'prism_bolt', name: 'Prism Bolt', icon: 'bolt', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'beam' }, effects: [{ type: 'damage', mult: 1.0 }] }),
  halo_beam: A({ id: 'halo_beam', name: 'Mend Beam', icon: 'heal', kind: 'attack', target: { side: 'ally', pick: 'lowest_hp_ally' }, delivery: { type: 'beam' }, effects: [{ type: 'heal', mult: 0.9 }] }),
  pyre_orb: A({ id: 'pyre_orb', name: 'Pyre Orb', icon: 'fire', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'projectile', speed: 7 }, effects: [{ type: 'damage', mult: 0.7 }, { type: 'status', status: 'burn', duration: 3, mult: 0.25 }] }),
  null_pulse: A({ id: 'null_pulse', name: 'Null Pulse', icon: 'emp', kind: 'attack', target: { side: 'enemy', pick: 'random' }, delivery: { type: 'projectile', speed: 8 }, effects: [{ type: 'damage', mult: 0.8 }, { type: 'charge', amount: -8 }] }),
  drone_zap: A({ id: 'drone_zap', name: 'Zap', icon: 'zap', kind: 'attack', target: { side: 'enemy', pick: 'lane' }, delivery: { type: 'projectile', speed: 10 }, effects: [{ type: 'damage', mult: 1.0 }] }),

  // ---- passives
  bulwark: A({ id: 'bulwark', name: 'Bulwark Protocol', icon: 'shield', kind: 'passive', trigger: 'wave_start', effects: [{ type: 'shield', pctMax: 0.12, duration: 10, target: { side: 'self', pick: 'self' } }], perLevel: { amount: 0.02 } }),
  scavenger: A({ id: 'scavenger', name: 'Scavenger', icon: 'gear', kind: 'passive', trigger: 'on_kill', effects: [{ type: 'heal', pctMax: 0.15, target: { side: 'self', pick: 'self' } }], perLevel: { amount: 0.03 } }),
  mass_anchor: A({ id: 'mass_anchor', name: 'Mass Anchor', icon: 'anchor', kind: 'passive', trigger: 'low_hp', threshold: 0.4, once: true, effects: [{ type: 'status', status: 'fortify', duration: 6, target: { side: 'self', pick: 'self' } }] }),
  steady_aim: A({ id: 'steady_aim', name: 'Steady Aim', icon: 'aim', kind: 'passive', trigger: 'every_n', n: 4, effects: [{ type: 'mods', mods: { crit: 1 }, duration: 0.5, target: { side: 'self', pick: 'self' } }] }),
  venom_rounds: A({ id: 'venom_rounds', name: 'Venom Rounds', icon: 'venom', kind: 'passive', trigger: 'on_crit', effects: [{ type: 'status', status: 'burn', duration: 3, mult: 0.3 }] }),
  refraction: A({ id: 'refraction', name: 'Refraction', icon: 'prism', kind: 'passive', trigger: 'aura', aura: { mods: { crit: 0.08 }, to: { side: 'ally', pick: 'all' } } }),
  nanite_field: A({ id: 'nanite_field', name: 'Nanite Field', icon: 'regen', kind: 'passive', trigger: 'interval', every: 6, effects: [{ type: 'status', status: 'regen', duration: 3, mult: 0.15, target: { side: 'ally', pick: 'all' } }] }),
  kindling: A({ id: 'kindling', name: 'Kindling', icon: 'fire', kind: 'passive', trigger: 'aura', aura: { mods: { dmg: 0.06 }, to: { side: 'ally', pick: 'all' } } }),
  null_shell: A({ id: 'null_shell', name: 'Null Shell', icon: 'void', kind: 'passive', trigger: 'battle_start', effects: [{ type: 'status', status: 'stealth', duration: 4, target: { side: 'self', pick: 'self' } }] }),
  none: A({ id: 'none', name: '—', icon: 'none', kind: 'passive', trigger: 'aura', aura: { mods: {}, to: { side: 'self', pick: 'self' } } }),

  // ---- overdrives
  aegis_wall: A({ id: 'aegis_wall', name: 'Aegis Wall', icon: 'wall', kind: 'overdrive', target: { side: 'ally', pick: 'all' }, delivery: { type: 'area' }, effects: [{ type: 'shield', mult: 1.6, duration: 8 }, { type: 'status', status: 'taunt', duration: 4, target: { side: 'self', pick: 'self' } }], perLevel: { mult: 0.1 } }),
  scrap_storm: A({ id: 'scrap_storm', name: 'Scrap Storm', icon: 'storm', kind: 'overdrive', target: { side: 'enemy', pick: 'frontline' }, delivery: { type: 'area' }, effects: [{ type: 'damage', mult: 1.6 }, { type: 'status', status: 'weaken', duration: 4 }], perLevel: { mult: 0.12 } }),
  singularity: A({ id: 'singularity', name: 'Singularity', icon: 'void', kind: 'overdrive', target: { side: 'enemy', pick: 'all' }, delivery: { type: 'area' }, effects: [{ type: 'damage', mult: 0.9 }, { type: 'status', status: 'slow', duration: 4 }], perLevel: { mult: 0.08 } }),
  piercing_lance: A({ id: 'piercing_lance', name: 'Piercing Lance', icon: 'rail', kind: 'overdrive', target: { side: 'enemy', pick: 'lane_all' }, delivery: { type: 'beam' }, effects: [{ type: 'damage', mult: 2.6, pierce: true }], perLevel: { mult: 0.2 } }),
  hunter_volley: A({ id: 'hunter_volley', name: 'Hunter Volley', icon: 'volley', kind: 'overdrive', target: { side: 'enemy', pick: 'random', count: 5 }, delivery: { type: 'projectile', speed: 12 }, effects: [{ type: 'damage', mult: 0.9 }], perLevel: { mult: 0.08 } }),
  spectrum_snipe: A({ id: 'spectrum_snipe', name: 'Spectrum Snipe', icon: 'snipe', kind: 'overdrive', target: { side: 'enemy', pick: 'backline' }, delivery: { type: 'beam' }, effects: [{ type: 'damage', mult: 3.2 }, { type: 'status', status: 'expose', duration: 4 }], perLevel: { mult: 0.25 } }),
  restoration: A({ id: 'restoration', name: 'Restoration Matrix', icon: 'heal', kind: 'overdrive', target: { side: 'ally', pick: 'all' }, delivery: { type: 'area' }, effects: [{ type: 'heal', mult: 1.4 }, { type: 'cleanse', count: 1 }], perLevel: { mult: 0.12 } }),
  inferno: A({ id: 'inferno', name: 'Inferno', icon: 'fire', kind: 'overdrive', target: { side: 'enemy', pick: 'all' }, delivery: { type: 'area' }, effects: [{ type: 'damage', mult: 0.7 }, { type: 'status', status: 'burn', duration: 5, mult: 0.3, stacks: 2 }], perLevel: { mult: 0.06 } }),
  emp_cascade: A({ id: 'emp_cascade', name: 'EMP Cascade', icon: 'emp', kind: 'overdrive', target: { side: 'enemy', pick: 'all' }, delivery: { type: 'area' }, effects: [{ type: 'damage', mult: 0.6 }, { type: 'status', status: 'shock', duration: 1.5, chance: 0.6 }, { type: 'charge', amount: -30 }], perLevel: { mult: 0.06, chance: 0.04 } }),
  orbital_strike: A({ id: 'orbital_strike', name: 'Orbital Strike', icon: 'orbital', kind: 'overdrive', target: { side: 'enemy', pick: 'all' }, delivery: { type: 'area' }, effects: [{ type: 'damage', mult: 1.8 }], perLevel: { mult: 0.15 } }),
  self_destruct: A({ id: 'self_destruct', name: 'Overload', icon: 'boom', kind: 'overdrive', target: { side: 'enemy', pick: 'lane', splash: 0.5 }, delivery: { type: 'melee' }, effects: [{ type: 'damage', mult: 2.0 }] }),
};

const U = (id, name, role, faction, rarity, model, base, attack, passive, overdrive, extra = {}) =>
  ({ id, name, role, faction, rarity, model, base, growth: { hp: 0.09, atk: 0.08, def: 0.06 }, attack, passive, overdrive, ...extra });

const units = {
  aegis: U('aegis', 'AEGIS-7', 'tank', 'corporate', 'rare', 'tank_bulwark', { hp: 1100, atk: 55, def: 70, spd: 1.6, crit: 0.05, critDmg: 0.5 }, 'shield_bash', 'bulwark', 'aegis_wall'),
  scrapjaw: U('scrapjaw', 'SCRAPJAW', 'tank', 'rogue', 'common', 'tank_brute', { hp: 950, atk: 65, def: 50, spd: 1.5, crit: 0.05, critDmg: 0.5 }, 'scrap_claw', 'scavenger', 'scrap_storm'),
  monolith: U('monolith', 'MONOLITH', 'tank', 'experimental', 'epic', 'tank_monolith', { hp: 1250, atk: 50, def: 80, spd: 1.8, crit: 0.05, critDmg: 0.5 }, 'grav_slam', 'mass_anchor', 'singularity'),
  lancer: U('lancer', 'LANCER', 'archer', 'corporate', 'common', 'archer_rail', { hp: 600, atk: 95, def: 30, spd: 1.4, crit: 0.12, critDmg: 0.6 }, 'rail_shot', 'steady_aim', 'piercing_lance'),
  viper: U('viper', 'VIPER', 'archer', 'rogue', 'rare', 'archer_needle', { hp: 560, atk: 85, def: 28, spd: 1.0, crit: 0.18, critDmg: 0.5 }, 'needle_burst', 'venom_rounds', 'hunter_volley'),
  prism: U('prism', 'PRISM', 'archer', 'experimental', 'rare', 'archer_prism', { hp: 580, atk: 100, def: 30, spd: 1.5, crit: 0.1, critDmg: 0.7 }, 'prism_bolt', 'refraction', 'spectrum_snipe'),
  halo: U('halo', 'HALO', 'mage', 'corporate', 'rare', 'mage_halo', { hp: 650, atk: 70, def: 35, spd: 1.6, crit: 0.05, critDmg: 0.5 }, 'halo_beam', 'nanite_field', 'restoration'),
  pyre: U('pyre', 'PYRE', 'mage', 'rogue', 'common', 'mage_pyre', { hp: 620, atk: 80, def: 32, spd: 1.5, crit: 0.05, critDmg: 0.5 }, 'pyre_orb', 'kindling', 'inferno'),
  nullwave: U('nullwave', 'NULLWAVE', 'mage', 'experimental', 'epic', 'mage_null', { hp: 680, atk: 85, def: 38, spd: 1.6, crit: 0.05, critDmg: 0.5 }, 'null_pulse', 'null_shell', 'emp_cascade'),
  sovereign: U('sovereign', 'SOVEREIGN', 'archer', 'corporate', 'legendary', 'archer_sovereign', { hp: 800, atk: 120, def: 45, spd: 1.3, crit: 0.15, critDmg: 0.8 }, 'rail_shot', 'refraction', 'orbital_strike'),
};

const enemies = {
  scrap_drone: U('scrap_drone', 'Scrap Drone', 'archer', 'rogue', 'common', 'drone_scrap', { hp: 380, atk: 45, def: 15, spd: 1.3, crit: 0.05, critDmg: 0.5 }, 'drone_zap', 'none', 'self_destruct'),
  dock_brute: U('dock_brute', 'Dock Brute', 'tank', 'rogue', 'common', 'tank_brute', { hp: 900, atk: 50, def: 40, spd: 1.7, crit: 0.05, critDmg: 0.5 }, 'scrap_claw', 'none', 'scrap_storm'),
};

const statuses = {}; // defaults from constants.js

const synergies = [
  { id: 'corp_link', name: 'Corporate Link', kind: 'faction', faction: 'corporate', tiers: [{ count: 2, mods: { def: 0.12 } }, { count: 4, mods: { def: 0.25, hp: 0.1 } }, { count: 6, mods: { def: 0.4, hp: 0.2 } }] },
  { id: 'rogue_pack', name: 'Rogue Pack', kind: 'faction', faction: 'rogue', tiers: [{ count: 2, mods: { atk: 0.1 } }, { count: 4, mods: { atk: 0.2, spd: 0.1 } }, { count: 6, mods: { atk: 0.3, spd: 0.2 } }] },
  { id: 'exp_resonance', name: 'Resonance', kind: 'faction', faction: 'experimental', tiers: [{ count: 2, mods: { charge: 0.15 } }, { count: 4, mods: { charge: 0.3, crit: 0.05 } }, { count: 6, mods: { charge: 0.5, crit: 0.1 } }] },
  { id: 'triad', name: 'Triad Doctrine', kind: 'roles', need: { tank: 1, archer: 1, mage: 1 }, mods: { atk: 0.06, hp: 0.06 }, to: 'all' },
];

const buffs = {
  stim_pack: { id: 'stim_pack', name: 'Stim Pack', icon: 'stim', desc: '+15% ATK for one battle', mods: { atk: 0.15 }, cost: { credits: 300 }, battles: 1 },
  plating_kit: { id: 'plating_kit', name: 'Plating Kit', icon: 'plate', desc: '+15% HP for one battle', mods: { hp: 0.15 }, cost: { credits: 300 }, battles: 1 },
  capacitor: { id: 'capacitor', name: 'Capacitor', icon: 'cap', desc: '+25% Overdrive charge', mods: { charge: 0.25 }, cost: { credits: 400 }, battles: 1 },
};

const S = (def, level, col, lane, rank = 0) => ({ def, level, rank, slot: { col, lane } });
const level = (id, node, waves, rewards, extra = {}) => ({ id, name: `Contract ${node}`, node, waves, rewards, ...extra });

const maps = [
  { id: 'm1', name: 'Rust Docks', order: 1, levels: [
    level('m1_l1', 1, [{ units: [S('scrap_drone', 1, 0, 1)] }], { credits: 100, xp: 60, scrap: 20 }),
    level('m1_l2', 2, [{ units: [S('scrap_drone', 2, 0, 0), S('scrap_drone', 2, 0, 2)] }], { credits: 110, xp: 70, scrap: 25, shards: { scrapjaw: 2 } }),
    level('m1_l3', 3, [{ units: [S('dock_brute', 2, 0, 1)] }, { units: [S('scrap_drone', 3, 0, 0), S('scrap_drone', 3, 1, 1)] }], { credits: 130, xp: 80, scrap: 30 }, { firstClear: { unlockSlot: 3, cards: ['pyre'] } }),
    level('m1_l4', 4, [{ units: [S('dock_brute', 4, 0, 1), S('scrap_drone', 4, 1, 0), S('scrap_drone', 4, 1, 2)] }], { credits: 150, xp: 90, scrap: 35 }, { boss: true }),
  ] },
  { id: 'm2', name: 'Neon Undercity', order: 2, levels: [
    level('m2_l1', 1, [{ units: [S('scrapjaw', 6, 0, 1), S('viper', 6, 1, 1)] }], { credits: 200, xp: 120, scrap: 50 }),
    level('m2_l2', 2, [{ units: [S('dock_brute', 7, 0, 0), S('pyre', 7, 1, 1)] }, { units: [S('scrapjaw', 7, 0, 1), S('viper', 7, 1, 0), S('pyre', 7, 1, 2)] }], { credits: 220, xp: 130, scrap: 55 }, { firstClear: { unlockSlot: 4 } }),
    level('m2_l3', 3, [{ units: [S('monolith', 9, 0, 1, 1), S('prism', 9, 1, 0, 1), S('nullwave', 9, 1, 2, 1)] }], { credits: 260, xp: 150, scrap: 60, shards: { prism: 3 } }, { boss: true }),
  ] },
];

const economy = {
  currencies: ['credits', 'scrap', 'chips', 'arena_tokens', 'event_marks'],
  start: { credits: 500, scrap: 0, chips: 50, units: [{ def: 'aegis', level: 1 }, { def: 'lancer', level: 1 }], slots: 2 },
  xpCurve: { base: 100, growth: 1.18 },
  scrapXp: 1,
  levelCost: { creditsPerXp: 0.5 },
  levelCapByRank: [10, 20, 30, 40, 50, 60],
  startRank: { common: 0, rare: 1, epic: 2, legendary: 3 },
  rankUp: { shards: [10, 20, 40, 80, 160], credits: [500, 2000, 6000, 15000, 40000] },
  dupeShards: { common: 10, rare: 10, epic: 10, legendary: 10 },
  abilityLevel: { max: 5, cost: { credits: [300, 1200, 4000, 10000], chips: [0, 5, 15, 40] }, capByRank: [1, 2, 3, 4, 5, 5] },
  slotUnlocks: { 3: 'm1_l3', 4: 'm2_l2', 5: 'm2_l3', 6: 'm2_l3' },
  battleXp: { perLevel: 1.0 },
  replay: { rewardMult: 0.6 },
  power: { hp: 0.1, atk: 1.0, def: 0.5 },
  companyXp: { perBattle: 10, base: 200, growth: 1.25 },
};

const hq = {
  armor_lab: { id: 'armor_lab', name: 'Armor Lab', branch: 'defense', max: 5, cost: { credits: [500, 1500, 4000, 9000, 18000], chips: [0, 0, 10, 20, 40] }, mods: { hp: 0.03, def: 0.03 } },
  weapons_bay: { id: 'weapons_bay', name: 'Weapons Bay', branch: 'offense', max: 5, cost: { credits: [500, 1500, 4000, 9000, 18000], chips: [0, 0, 10, 20, 40] }, mods: { atk: 0.03 } },
  reactor: { id: 'reactor', name: 'Reactor Core', branch: 'tech', max: 3, cost: { credits: [2000, 6000, 15000], chips: [10, 25, 50] }, requires: { hq: 'weapons_bay', level: 2 }, mods: { charge: 0.06 } },
  salvage_crew: { id: 'salvage_crew', name: 'Salvage Crew', branch: 'economy', max: 5, cost: { credits: [800, 2400, 6000, 12000, 24000], chips: [0, 0, 0, 0, 0] }, mods: {}, effect: { scrapGain: 0.1 } },
};

const recruit = {
  standard: { id: 'standard', name: 'Standard Contract', cost: { credits: 1000 }, rates: { common: 0.7, rare: 0.25, epic: 0.045, legendary: 0.005 }, pool: 'all', pity: { epic: 30, legendary: 150 } },
  elite: { id: 'elite', name: 'Elite Contract', cost: { chips: 100 }, rates: { common: 0, rare: 0.7, epic: 0.25, legendary: 0.05 }, pool: 'all', pity: { legendary: 60 } },
};

const arena = {
  startRating: 1000, k: 32, rivalPower: [0.85, 1.12],
  tiers: [
    { id: 'bronze', name: 'Bronze', minRating: 0, reward: { arena_tokens: 10, credits: 150 } },
    { id: 'silver', name: 'Silver', minRating: 1150, reward: { arena_tokens: 15, credits: 250 } },
    { id: 'gold', name: 'Gold', minRating: 1350, reward: { arena_tokens: 22, credits: 400 } },
    { id: 'neon', name: 'Neon', minRating: 1600, reward: { arena_tokens: 30, credits: 600 } },
  ],
  lossReward: 0.3,
  shop: [
    { id: 'shards_any', item: { shardsChoice: 5 }, cost: { arena_tokens: 60 } },
    { id: 'scrap_pack', item: { scrap: 400 }, cost: { arena_tokens: 30 } },
    { id: 'stim', item: { buff: 'stim_pack', n: 1 }, cost: { arena_tokens: 15 } },
  ],
  seasonDays: 7,
};

const events = {
  daily_scrap: { id: 'daily_scrap', name: 'Salvage Run', kind: 'daily', rotation: { everyDays: 1 }, tiers: [
    { id: 't1', power: 300, waves: [{ units: [S('dock_brute', 5, 0, 1), S('scrap_drone', 5, 1, 1)] }], rewards: { scrap: 200, credits: 100 } },
    { id: 't2', power: 900, waves: [{ units: [S('dock_brute', 10, 0, 1, 1), S('scrap_drone', 10, 1, 0, 1), S('scrap_drone', 10, 1, 2, 1)] }], rewards: { scrap: 500, credits: 250 } },
  ] },
  rogue_trial: { id: 'rogue_trial', name: 'Rogue Trial', kind: 'trial', faction: 'rogue', rotation: { days: [1, 4] }, tiers: [
    { id: 't1', power: 500, waves: [{ units: [S('scrapjaw', 8, 0, 1), S('viper', 8, 1, 1)] }], rewards: { shards: { viper: 3 }, event_marks: 10 } },
  ] },
};

const rules = {};

export const FIXTURE_DATA = { version: 1, rules, statuses, abilities, units, enemies, synergies, buffs, maps, economy, hq, recruit, arena, events };
export default FIXTURE_DATA;
