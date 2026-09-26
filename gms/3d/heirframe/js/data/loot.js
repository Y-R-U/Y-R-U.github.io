// Parts and loot (DESIGN §6, ECONOMY §5-6).
// Flat stats marked `scales` multiply by L(iLvl); percentages never scale.

export const SLOTS = ['chassis', 'core', 'weapon', 'optics', 'mobility', 'chip'];
export const SLOT_NAMES = { chassis: 'Chassis', core: 'Core', weapon: 'Weapon', optics: 'Optics', mobility: 'Mobility', chip: 'Chip' };

// Primary (implicit) stats at iLvl 1 per slot. Energy is deliberately NOT level-scaled (skill costs are flat).
export const SLOT_PRIMARY = {
  chassis: { armor: 8, hp: 20 },
  core: { energy: 10, shield: 15 },
  weapon: { weaponDamage: 5 },
  optics: { critChance: 0.03 },
  mobility: { movePct: 0.04 },
  chip: {},
};
export const SCALING_STATS = ['hp', 'armor', 'shield', 'weaponDamage'];

// flavour bases (cosmetic name + slight primary tilt)
export const BASES = {
  chassis: [
    { id: 'ch_plate', name: 'Plated Chassis', tilt: { armor: 1.15, hp: 0.9 } },
    { id: 'ch_frame', name: 'Reinforced Frame', tilt: { armor: 0.9, hp: 1.15 } },
    { id: 'ch_shell', name: 'Composite Shell', tilt: {} },
    { id: 'ch_carapace', name: 'Gilded Carapace', tilt: { armor: 1.08, hp: 1.08 }, minLevel: 15 },
  ],
  core: [
    { id: 'co_cell', name: 'Power Cell', tilt: { energy: 1.2, shield: 0.9 } },
    { id: 'co_shield', name: 'Shield Core', tilt: { energy: 0.9, shield: 1.2 } },
    { id: 'co_fusion', name: 'Fusion Heart', tilt: {} },
    { id: 'co_aegis', name: 'Aegis Reactor', tilt: { energy: 1.05, shield: 1.1 }, minLevel: 15 },
  ],
  weapon: [
    { id: 'we_driver', name: 'Piston Driver', tilt: {} },
    { id: 'we_coil', name: 'Rail Coil', tilt: {} },
    { id: 'we_emitter', name: 'Arc Emitter', tilt: {} },
    { id: 'we_edge', name: 'Mono Edge', tilt: {} },
    { id: 'we_barrel', name: 'Flux Barrel', tilt: {}, minLevel: 12 },
  ],
  optics: [
    { id: 'op_lens', name: 'Optic Lens', tilt: {} },
    { id: 'op_array', name: 'Targeting Array', tilt: { critChance: 1.15 } },
    { id: 'op_mast', name: 'Sensor Mast', tilt: {} },
  ],
  mobility: [
    { id: 'mo_servo', name: 'Servo Legs', tilt: {} },
    { id: 'mo_spring', name: 'Spring Actuators', tilt: { movePct: 1.15 } },
    { id: 'mo_gyro', name: 'Gyro Stabilisers', tilt: {} },
  ],
  chip: [
    { id: 'ci_chip', name: 'Logic Chip', tilt: {} },
    { id: 'ci_daemon', name: 'Daemon Chip', tilt: {} },
    { id: 'ci_wafer', name: 'Quantum Wafer', tilt: {}, minLevel: 10 },
  ],
};

export const WEAPON_ELEMENTS = [['kinetic', 55], ['thermal', 15], ['shock', 15], ['ion', 15]];
export const ELEMENTS = ['kinetic', 'thermal', 'shock', 'ion'];

// index order matters (tierIndex for loot quality)
export const RARITIES = [
  { id: 'scrap', name: 'Scrap', color: '#8a8f98', affixes: 0, mult: 0.7, beam: 'none' },
  { id: 'standard', name: 'Standard', color: '#e8ecf2', affixes: 0, mult: 1.0, beam: 'faint' },
  { id: 'tuned', name: 'Tuned', color: '#4be08a', affixes: 1, mult: 1.1, beam: 'beam' },
  { id: 'custom', name: 'Custom', color: '#3fa9ff', affixes: 2, mult: 1.2, beam: 'beam', minLevel: 3 },
  { id: 'prototype', name: 'Prototype', color: '#b46cff', affixes: 3, mult: 1.35, beam: 'chime', minLevel: 8 },
  { id: 'relic', name: 'Relic', color: '#ff9a2e', affixes: 3, mult: 1.5, beam: 'pillar', power: true, minLevel: 15 },
  { id: 'heirloom', name: 'Heirloom', color: '#ffd36b', core: '#5ef2ff', affixes: 4, mult: 1.6, beam: 'starburst', set: true, minLevel: 40 },
];
export const RARITY_INDEX = Object.fromEntries(RARITIES.map((r, i) => [r.id, i]));

// ECONOMY §6 rarity weights by enemy level band
export const RARITY_BANDS = [
  { max: 2, w: [30, 50, 18, 2, 0, 0, 0] },
  { max: 7, w: [20, 45, 25, 9, 1, 0, 0] },
  { max: 14, w: [12, 38, 30, 16, 4, 0, 0] },
  { max: 24, w: [8, 30, 32, 22, 7, 1, 0] },
  { max: 39, w: [5, 25, 32, 26, 10, 2, 0] },
  { max: 50, w: [3, 20, 30, 30, 13, 3.5, 0.15] },
  { max: 60, w: [2, 15, 30, 33, 15, 5, 0.25] },
  { max: Infinity, w: [1, 10, 28, 35, 18, 7, 0.4] },
];

// DESIGN §6.3. value = [min,max] at iLvl 1; `scales` flat values multiply by L(iLvl).
// stat keys ending in Pct / fractions are additive percentages (0.05 = 5%).
export const AFFIXES = [
  { id: 'hp', label: '+{v} HP', stat: 'hp', value: [10, 25], scales: true, slots: ['chassis', 'core'] },
  { id: 'armor', label: '+{v} Armor', stat: 'armor', value: [4, 10], scales: true, slots: ['chassis', 'mobility'] },
  { id: 'shield', label: '+{v} Shield', stat: 'shield', value: [10, 20], scales: true, slots: ['core', 'chassis'] },
  { id: 'energy', label: '+{v} Energy', stat: 'energy', value: [8, 16], slots: ['core', 'chip'] },
  { id: 'enRegen', label: '+{p} energy regen', stat: 'energyRegenPct', value: [0.08, 0.2], slots: ['core', 'chip'] },
  { id: 'dmgPct', label: '+{p} damage', stat: 'dmgPct', value: [0.04, 0.1], slots: ['weapon', 'chip', 'core'] },
  { id: 'atkSpd', label: '+{p} attack speed', stat: 'atkSpdPct', value: [0.04, 0.1], slots: ['weapon', 'mobility'] },
  { id: 'critCh', label: '+{p} crit chance', stat: 'critChance', value: [0.02, 0.05], slots: ['optics', 'weapon', 'chip'] },
  { id: 'critDmg', label: '+{p} crit damage', stat: 'critDmg', value: [0.1, 0.3], slots: ['optics', 'weapon'] },
  { id: 'cdr', label: '-{p} skill cooldowns', stat: 'cdr', value: [0.04, 0.1], slots: ['chip', 'core'] },
  { id: 'moveSpd', label: '+{p} move speed', stat: 'movePct', value: [0.03, 0.08], slots: ['mobility'] },
  { id: 'dodgeCd', label: '-{p} dodge cooldown', stat: 'dodgeCdPct', value: [0.08, 0.15], slots: ['mobility', 'chip'] },
  { id: 'elemDmg', label: '+{p} {e} damage', stat: 'elemPct', element: true, value: [0.08, 0.18], slots: ['weapon', 'chip'] },
  { id: 'vsElite', label: '+{p} damage to elites and bosses', stat: 'vsElitePct', value: [0.06, 0.15], slots: ['optics', 'weapon'] },
  { id: 'backstab', label: '+{p} backstab damage', stat: 'backstabPct', value: [0.15, 0.4], slots: ['optics', 'chip'] },
  { id: 'aoe', label: '+{p} area radius', stat: 'aoePct', value: [0.08, 0.2], slots: ['chip', 'core'] },
  { id: 'thorns', label: 'Reflect {p} melee damage', stat: 'thornsPct', value: [0.08, 0.2], slots: ['chassis'] },
  { id: 'lifeSteal', label: '{p} of damage repairs HP', stat: 'lifeSteal', value: [0.01, 0.03], slots: ['weapon', 'chip'] },
  { id: 'stealth', label: '-{p} detection radius', stat: 'stealthPct', value: [0.08, 0.18], slots: ['optics', 'mobility'] },
  { id: 'hackSpd', label: '+{p} hack speed', stat: 'hackSpeedPct', value: [0.2, 0.5], slots: ['optics', 'chip'] },
  { id: 'credits', label: '+{p} credits found', stat: 'creditsPct', value: [0.05, 0.12], slots: ['chip', 'optics'] },
  { id: 'lootLuck', label: '+{p} better rarity chance', stat: 'lootLuck', value: [0.04, 0.1], slots: ['chip', 'optics'] },
  { id: 'resist', label: '+{p} {e} resist', stat: 'resist', element: true, value: [0.08, 0.2], slots: ['chassis'] },
  { id: 'shieldRegen', label: '+{p} shield regen', stat: 'shieldRegenPct', value: [0.1, 0.25], slots: ['core'] },
];

// DESIGN §6.4 relic unique powers (+4 systems additions). `stats` are applied as plain stats; the rest are engine hooks.
export const POWERS = [
  { id: 'magnetar', slot: 'chip', name: 'Magnetar', desc: 'Ground Slam pulls in all enemies within 8 m.', hook: { skill: 'b_slam', pull: 8 } },
  { id: 'ricochet', slot: 'weapon', name: 'Ricochet Protocol', desc: 'Carbine shots bounce once.', hook: { skill: 'g_carbines', bounces: 1 } },
  { id: 'afterimage', slot: 'mobility', name: 'Afterimage', desc: 'Every dodge leaves a decoy.', hook: { onDodge: { decoy: 2 } } },
  { id: 'stillwater', slot: 'optics', name: 'Stillwater', desc: 'Veil lasts twice as long when you stand still.', hook: { skill: 'h_veil', stillMult: 2 } },
  { id: 'overdrive', slot: 'core', name: 'Overdrive Core', desc: 'At full energy, deal +30% damage.', hook: { cond: 'fullEnergy', dmgPct: 0.3 } },
  { id: 'scavenger', slot: 'optics', name: "Scavenger's Eye", desc: '+1 loot roll from elites.', hook: { eliteExtraRoll: 1 } },
  { id: 'kinetic_battery', slot: 'chassis', name: 'Kinetic Battery', desc: 'Taking damage charges your next attack by up to +100%.', hook: { chargeFromDamage: 1 } },
  { id: 'brighter_future', slot: 'chip', name: 'Brighter Future', desc: 'Kills restore 3% HP. Etched: HARMONY THROUGH UNITY.', hook: { onKill: { healPct: 0.03 } } },
  { id: 'chainlightning', slot: 'weapon', name: 'Chainlightning Coil', desc: 'Shock chains to 3 targets.', hook: { shockChains: 3 } },
  { id: 'reactive_plating', slot: 'chassis', name: 'Reactive Plating', desc: 'Shield breaking releases a 4 m knockback pulse (10 s cooldown).', hook: { onShieldBreak: { knockback: 4, cd: 10 } } },
  { id: 'phantom_step', slot: 'mobility', name: 'Phantom Step', desc: 'Dodge through enemies to backstab-mark them.', hook: { onDodge: { mark: 'backstab' } } },
  { id: 'coldstart', slot: 'core', name: 'Coldstart', desc: 'The first skill used after 5 s idle costs 0 energy.', hook: { coldstart: 5 } },
  // systems additions
  { id: 'debt_collector', slot: 'chip', name: 'Debt Collector', desc: '+20% credits from kills.', stats: { killCreditsPct: 0.2 } },
  { id: 'lullaby', slot: 'optics', name: 'Lullaby Loop', desc: 'Crits restore 2 energy.', hook: { onCrit: { energy: 2 } } },
  { id: 'renewal', slot: 'chassis', name: 'Renewal Plating', desc: 'Below 30% HP, gain +40% armor.', hook: { cond: 'lowHp', armorPct: 0.4 } },
  { id: 'tidewater', slot: 'weapon', name: 'Tidewater Edge', desc: 'Hits against stunned enemies deal +35%.', hook: { vsStunnedPct: 0.35 } },
];

// DESIGN §6.5 heirloom sets. Pieces are fixed-name, 4 random affixes, set bonuses by count.
export const HEIRLOOM_SETS = {
  aurels_oath: {
    id: 'aurels_oath', name: "Aurel's Oath", frame: 'brawler',
    pieces: [
      { id: 'hl_oath_chassis', slot: 'chassis', name: "Aurel's Bulwark Plate", lore: 'Built by the family that built the ship.' },
      { id: 'hl_oath_weapon', slot: 'weapon', name: "Aurel's Piston", lore: 'The grip is worn to the shape of one hand.', element: 'kinetic' },
      { id: 'hl_oath_core', slot: 'core', name: "Aurel's Oathcore", lore: 'Inscribed: FOR THE ONES WHO COME AFTER.' },
    ],
    bonuses: { 2: { desc: '+20% armor', stats: { armorPct: 0.2 } }, 3: { desc: 'Bulwark reflects projectiles.', hook: { skill: 'b_bulwark', reflectProjectiles: true } } },
  },
  lyras_wake: {
    id: 'lyras_wake', name: "Lyra's Wake", frame: 'ghost',
    pieces: [
      { id: 'hl_wake_optics', slot: 'optics', name: "Lyra's Nightglass", lore: 'A Vael star is scratched inside the rim.' },
      { id: 'hl_wake_mobility', slot: 'mobility', name: "Lyra's Quietstep", lore: 'Built for a frame that never made a sound.' },
      { id: 'hl_wake_weapon', slot: 'weapon', name: "Lyra's Edge", lore: 'The Ghost frame was her design. So was this.', element: 'shock' },
    ],
    bonuses: { 2: { desc: 'Blink resets on a backstab kill.', hook: { skill: 'h_blink', resetOnBackstabKill: true } }, 3: { desc: 'Veil has no cooldown while Heat is 0.', hook: { skill: 'h_veil', freeAtHeat0: true } } },
  },
  iris_lens: {
    id: 'iris_lens', name: "Iris's Lens", frame: 'gunner',
    pieces: [
      { id: 'hl_lens_optics', slot: 'optics', name: "Iris's Loupe", lore: 'A hand-ground lens. She ground it herself.' },
      { id: 'hl_lens_chip', slot: 'chip', name: "Iris's Patent Chip", lore: 'Link Patent No. 1. Filed under a maiden name: Hale.' },
      { id: 'hl_lens_weapon', slot: 'weapon', name: "Iris's Signal Rifle", lore: 'Still tuned to a frequency nobody broadcasts on.', element: 'ion' },
    ],
    bonuses: { 2: { desc: 'Rail Shot marks the target (+25% damage taken).', hook: { skill: 'g_rail', applies: [{ id: 'marked', t: 6, dmgTakenMult: 1.25 }] } }, 3: { desc: 'Drone Turret copies your skills at 30%.', hook: { skill: 'g_turret', copySkills: 0.3 } } },
  },
};

// DESIGN §5.7 story item
export const HEIR_CORE = { id: 'heir_core', slot: 'core', name: 'Heir Core', rarity: 'heirloom', lore: "Found in Lyra's lab on Meridian. It answers to your blood.", primaryMult: 1.8, grantsHeirSkill: true };

export const MATERIALS = {
  scrapAlloy: { id: 'scrapAlloy', name: 'Scrap Alloy', color: '#9aa3ad' },
  circuitry: { id: 'circuitry', name: 'Circuitry', color: '#3fa9ff' },
  flux: { id: 'flux', name: 'Flux Cell', color: '#b46cff' },
  heirShard: { id: 'heirShard', name: 'Heir Shard', color: '#ffd36b' },
};

// ECONOMY §5
export const SALVAGE = {
  scrap: { scrapAlloy: [1, 2] },
  standard: { scrapAlloy: [2, 3] },
  tuned: { scrapAlloy: [3, 3], circuitry: [0, 1] },
  custom: { scrapAlloy: [4, 4], circuitry: [1, 2] },
  prototype: { scrapAlloy: [5, 5], circuitry: [2, 2], flux: [1, 1] },
  relic: { scrapAlloy: [6, 6], circuitry: [3, 3], flux: [2, 2], heirShard: [1, 1] },
  heirloom: { scrapAlloy: [8, 8], circuitry: [4, 4], flux: [3, 3], heirShard: [3, 3] },
};

// ECONOMY §6 item drops per kill by rank
export const KILL_DROPS = {
  grunt: { chance: 0.12, count: 1 },
  veteran: { chance: 0.35, count: 1 },
  elite: { chance: 1, count: 1, extra: 0.5 },
  champion: { chance: 1, count: 2, minRarity: 'custom' },
  boss: { chance: 1, count: 4, forced: 'prototype' },
};

// MISSIONS §7 end-of-mission cache
export const CACHE_RULES = {
  street: { min: 'tuned' },
  pro: { min: 'custom' },
  elite: { min: 'custom', upgrade: [['prototype', 0.25]] },
  black: { min: 'custom', upgrade: [['relic', 0.05], ['prototype', 0.4]] },
  story: { min: 'custom' },
};

export const BAD_LUCK = { fromLevel: 8, threshold: 150 };
export const RELIC_NO_REPEAT = 5;
export const HEIRLOOM_DROP_MIN_LEVEL = 40;
