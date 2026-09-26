// DESIGN §10. base = level-1 stats before rank/threat multipliers (hp, dmg, armor, shield scale by L).
// robotKind = createRobot kind; fallbackKind is used until the robots agent adds the new kind.
// paint = faction paint param for shared meshes. pts = pack-budget cost multiplier on the rank cost.
// sim: pts raised for tier 3-5 units (choir_angel was 1, so budget filler built packs of 10 angels).
// sim: gilded_guard dmg 30 -> 24, sovereign_construct 40 -> 34 (Helm, L45-50, was a 25% contract-fail wall).
// ai: rusher | striker (strafe/pistol) | spotter | shield (frontal block) | bruiser | turret | swarm |
//     shambler | ambusher | lancer | crawler | flyer | duelist | escortee | boss

export const RANKS = {
  grunt: { hp: 1, dmg: 1, xp: 1, pts: 1, scale: 1 },
  veteran: { hp: 2.5, dmg: 1.3, xp: 3, pts: 2.5, scale: 1.08, nameColor: 'blue' },
  elite: { hp: 6, dmg: 1.6, xp: 8, pts: 6, scale: 1.15, mods: 2, nameColor: 'gold' },
  champion: { hp: 20, dmg: 2, xp: 25, pts: 12, scale: 1.3, mods: 1, bossBar: true },
  boss: { hp: 60, dmg: 2.5, xp: 80, pts: 30, scale: 1.5, bossBar: true },
};

export const ELITE_MODS = [
  { id: 'shielded', name: 'Shielded', stats: { shieldPct: 1, shieldFloor: 0.5 } },
  { id: 'overcharged', name: 'Overcharged', stats: { dmgPct: 0.25 }, fx: 'sparks' },
  { id: 'blinker', name: 'Blinker', hook: { teleportBehind: 8 } },
  { id: 'volatile', name: 'Volatile', hook: { deathExplode: { delay: 2, radius: 4, pct: 1.5 } } },
  { id: 'linked', name: 'Linked', hook: { shareDamage: true } },
  { id: 'mirror', name: 'Mirror', stats: { reflectRanged: 0.2 } },
  { id: 'cloaked', name: 'Cloaked', hook: { invisibleBeyond: 6 } },
  { id: 'jammer', name: 'Jammer', hook: { playerEnergyCostMult: 1.5, radius: 10 } },
  { id: 'swarmcaller', name: 'Swarmcaller', hook: { summon: { defId: 'scrap_rat', count: 3, every: 10 } } },
];

export const ENEMIES = {
  scrap_rat: { id: 'scrap_rat', name: 'Scrap Rat', tier: 1, robotKind: 'scrap_rat', fallbackKind: 'drone_scout', faction: 'scrap', ai: ['swarm'], fleeBelow: 0.2, size: 0.5,
    base: { hp: 18, dmg: 4, armor: 0 }, move: 5.5, skills: ['e_bite'], tags: ['robot', 'scrap'] },
  knuckle: { id: 'knuckle', name: 'Knuckle', tier: 1, robotKind: 'brawler', paint: 'syndicate', faction: 'syndicate', ai: ['rusher'],
    base: { hp: 50, dmg: 7, armor: 5 }, move: 4.4, skills: ['e_melee'], tags: ['robot', 'frame'] },
  popper: { id: 'popper', name: 'Popper', tier: 1, robotKind: 'gunner', paint: 'syndicate', faction: 'syndicate', ai: ['striker'], keepRange: 10,
    base: { hp: 40, dmg: 6, armor: 3 }, move: 4.2, skills: ['e_pistol'], tags: ['robot', 'frame'] },
  warden_eye: { id: 'warden_eye', name: 'Warden Eye', tier: 1, robotKind: 'drone_scout', paint: 'concord', faction: 'concord', ai: ['spotter'], flying: true,
    base: { hp: 30, dmg: 3, armor: 2, shield: 10 }, move: 5, skills: ['e_zap'], spotHeat: 1, tags: ['robot', 'drone'] },
  warden: { id: 'warden', name: 'Warden', tier: 2, robotKind: 'security', paint: 'concord', faction: 'concord', pts: 1.5, ai: ['shield'], frontalDR: 0.7,
    base: { hp: 90, dmg: 10, armor: 20, shield: 20 }, move: 4, skills: ['e_baton'], tags: ['robot', 'frame'] },
  enforcer: { id: 'enforcer', name: 'Enforcer', tier: 2, robotKind: 'enforcer', paint: 'concord', faction: 'concord', ai: ['bruiser'], pts: 2.5, minLevel: 14,
    base: { hp: 220, dmg: 18, armor: 35, shield: 40 }, move: 3.2, skills: ['e_melee', 'e_stomp'], stunResist: 0.5, tags: ['robot', 'frame', 'heavy'] },
  chromehead: { id: 'chromehead', name: 'Chromehead', tier: 2, robotKind: 'brawler', paint: 'chrome', faction: 'syndicate', ai: ['rusher'], pts: 1.5,
    base: { hp: 110, dmg: 12, armor: 15 }, move: 4.8, skills: ['e_melee', 'e_dash'], tags: ['robot', 'frame'] },
  sentry_turret: { id: 'sentry_turret', name: 'Sentry Turret', tier: 2, robotKind: 'turret', fallbackKind: 'security', faction: 'concord', ai: ['turret'], static: true, hackable: true,
    base: { hp: 80, dmg: 8, armor: 25 }, move: 0, skills: ['e_burst'], tags: ['robot', 'turret'] },
  rustkin: { id: 'rustkin', name: 'Rustkin', tier: 3, robotKind: 'rustkin', fallbackKind: 'civ_worker', paint: 'rust', faction: 'scrap', pts: 1.8, ai: ['shambler'], merge: { count: 3, into: 'rust_hulk' },
    base: { hp: 120, dmg: 14, armor: 15 }, move: 3, skills: ['e_melee'], tags: ['robot', 'scrap'] },
  rust_hulk: { id: 'rust_hulk', name: 'Rust Hulk', tier: 3, robotKind: 'rustkin', fallbackKind: 'enforcer', paint: 'rust', faction: 'scrap', ai: ['bruiser'], pts: 4, size: 1.6,
    base: { hp: 420, dmg: 26, armor: 30 }, move: 2.6, skills: ['e_melee', 'e_stomp'], stunResist: 0.6, tags: ['robot', 'scrap', 'heavy'] },
  saboteur: { id: 'saboteur', name: 'Unlinked Saboteur', tier: 3, robotKind: 'ghost', paint: 'rebel', faction: 'unlinked', pts: 2, ai: ['ambusher'], cloaks: true,
    base: { hp: 90, dmg: 16, armor: 8, shield: 30 }, move: 5, skills: ['e_melee', 'e_emp'], tags: ['robot', 'frame'] },
  lancer: { id: 'lancer', name: 'Concord Lancer', tier: 3, robotKind: 'security', robotTier: 2, paint: 'concord_gold', faction: 'concord', pts: 2.5, ai: ['lancer'], minHeat: 3,
    base: { hp: 160, dmg: 20, armor: 25, shield: 40 }, move: 4.6, skills: ['e_melee', 'e_lunge'], tags: ['robot', 'frame'] },
  hull_wight: { id: 'hull_wight', name: 'Hull Wight', tier: 4, robotKind: 'spider', fallbackKind: 'drone_scout', faction: 'scrap', pts: 2.2, ai: ['crawler'],
    base: { hp: 140, dmg: 18, armor: 20 }, move: 5.5, skills: ['e_bite', 'e_beam'], tags: ['robot', 'scrap'] },
  spine_keeper: { id: 'spine_keeper', name: 'Spine Keeper', tier: 4, robotKind: 'spider', robotTier: 2, fallbackKind: 'enforcer', faction: 'scrap', ai: ['bruiser'], pts: 6, size: 2.2,
    base: { hp: 600, dmg: 30, armor: 40 }, move: 2.4, skills: ['e_sweep', 'e_stomp'], summons: { defId: 'hull_wight', count: 2, every: 15 }, stunResist: 0.8, tags: ['robot', 'scrap', 'heavy'] },
  choir_angel: { id: 'choir_angel', name: 'Choir Angel', tier: 4, robotKind: 'seraph', robotTier: 0, fallbackKind: 'civ_gold', faction: 'choir', pts: 3.5, ai: ['flyer'], flying: true, formation: 3,
    base: { hp: 200, dmg: 26, armor: 15, shield: 60 }, move: 6.5, skills: ['e_melee', 'e_dive'], tags: ['robot', 'frame'] },
  gilded_guard: { id: 'gilded_guard', name: 'Gilded Guard', tier: 5, robotKind: 'civ_gold', robotTier: 2, faction: 'voices', ai: ['duelist'], pts: 4,
    base: { hp: 300, dmg: 24, armor: 30, shield: 80 }, move: 4.8, skills: ['e_melee', 'e_parry', 'e_lunge'], tags: ['robot', 'frame'] },
  sovereign_construct: { id: 'sovereign_construct', name: 'Sovereign Construct', tier: 5, robotKind: 'enforcer', robotTier: 3, paint: 'gold', faction: 'voices', ai: ['bruiser'], pts: 8, size: 1.8,
    base: { hp: 900, dmg: 34, armor: 50, shield: 150 }, move: 3, skills: ['e_melee', 'e_stomp', 'e_blast'], stunResist: 0.8, tags: ['robot', 'frame', 'heavy'] },
  // non-combat / mission actors
  vip: { id: 'vip', name: 'Target', tier: 1, robotKind: 'civ_gold', faction: 'syndicate', ai: ['escortee'], nonCombat: true,
    base: { hp: 70, dmg: 0, armor: 10, shield: 30 }, move: 4.2, skills: [], tags: ['robot', 'frame'] },
  escortee: { id: 'escortee', name: 'Client', tier: 1, robotKind: 'civ_chrome', faction: 'civilians', ai: ['escortee'], nonCombat: true, vulnerable: true,
    base: { hp: 150, dmg: 0, armor: 10 }, move: 3, skills: [], tags: ['frame'] },
  deadbeat: { id: 'deadbeat', name: 'Deadbeat Frame', tier: 1, robotKind: 'rental', faction: 'syndicate', ai: ['escortee'], blinks: true,
    base: { hp: 90, dmg: 5, armor: 5 }, move: 4.6, skills: ['e_melee'], tags: ['robot', 'frame'] },
  rival_rider: { id: 'rival_rider', name: 'Rival Rider', tier: 2, robotKind: 'gunner', paint: 'rival', faction: 'syndicate', ai: ['striker'], pts: 2,
    base: { hp: 120, dmg: 12, armor: 15, shield: 40 }, move: 4.4, skills: ['e_pistol', 'e_dash'], tags: ['robot', 'frame'] },
};

// Bosses: champion or boss rank; phases split HP.
export const BOSSES = {
  big_kettle: { id: 'big_kettle', name: 'Big Kettle', title: 'Silverhand Captain', rank: 'champion', robotKind: 'enforcer', paint: 'kettle', faction: 'syndicate', ai: ['boss', 'bruiser'], act: 1,
    base: { hp: 150, dmg: 16, armor: 30, shield: 40 }, move: 3.4, skills: ['e_melee', 'e_stomp', 'e_blast'], phases: [0.5], adds: { defId: 'knuckle', count: 3, atPhase: 1 }, tags: ['robot', 'frame', 'heavy'] },
  halloran: { id: 'halloran', name: 'Warden-Captain Halloran', rank: 'boss', robotKind: 'security', robotTier: 3, paint: 'concord_gold', faction: 'concord', ai: ['boss', 'lancer'], act: 2,
    base: { hp: 90, dmg: 18, armor: 30, shield: 60 }, move: 4.6, skills: ['e_baton', 'e_lunge', 'e_emp'], frontalDR: 0.6, phases: [0.6, 0.3], tags: ['robot', 'frame'] },
  choir_warden: { id: 'choir_warden', name: 'Choir Warden', rank: 'boss', robotKind: 'seraph', robotTier: 1, fallbackKind: 'civ_gold', faction: 'choir', ai: ['boss', 'flyer'], act: 3, flying: true,
    base: { hp: 110, dmg: 22, armor: 20, shield: 90 }, move: 6, skills: ['e_melee', 'e_dive', 'e_blast'], phases: [0.5], tags: ['robot', 'frame'] },
  rustmother: { id: 'rustmother', name: 'Rustmother', rank: 'boss', robotKind: 'rustkin', robotTier: 3, fallbackKind: 'enforcer', faction: 'scrap', ai: ['boss', 'turret'], act: 4, size: 3,
    base: { hp: 160, dmg: 24, armor: 40 }, move: 1, skills: ['e_sweep', 'e_stomp'], summons: { defId: 'scrap_rat', count: 5, every: 12 }, phases: [0.66, 0.33], tags: ['robot', 'scrap', 'heavy'] },
  spine_keeper_boss: { id: 'spine_keeper_boss', name: 'Spine Keeper', rank: 'champion', robotKind: 'spider', robotTier: 2, fallbackKind: 'enforcer', faction: 'scrap', ai: ['boss', 'bruiser'], act: 4, size: 2.4,
    base: { hp: 120, dmg: 26, armor: 40 }, move: 2.4, skills: ['e_sweep', 'e_stomp', 'e_beam'], summons: { defId: 'hull_wight', count: 2, every: 15 }, phases: [0.5], tags: ['robot', 'scrap', 'heavy'] },
  seraph: { id: 'seraph', name: 'Seraph', rank: 'boss', robotKind: 'seraph', robotTier: 3, fallbackKind: 'civ_gold', faction: 'choir', ai: ['boss', 'flyer'], act: 5, flying: true, spares: true,
    base: { hp: 130, dmg: 28, armor: 25, shield: 120 }, move: 7, skills: ['e_melee', 'e_dive', 'e_lunge', 'e_blast'], phases: [0.66, 0.33], tags: ['robot', 'frame'] },
  dray: { id: 'dray', name: 'Archon Dray', title: 'the Sovereign Frame', rank: 'boss', robotKind: 'boss_sovereign', fallbackKind: 'enforcer', faction: 'voices', ai: ['boss', 'bruiser'], act: 6, size: 2.6,
    base: { hp: 180, dmg: 34, armor: 50, shield: 200 }, move: 3, skills: ['e_melee', 'e_stomp', 'e_sweep', 'e_blast'], phases: [0.66, 0.33], summons: { defId: 'gilded_guard', count: 2, atPhase: 1 }, tags: ['robot', 'frame', 'heavy'] },
  voice: { id: 'voice', name: 'Escaped Voice', rank: 'boss', robotKind: 'civ_gold', robotTier: 3, faction: 'voices', ai: ['boss', 'duelist'], act: 7,
    base: { hp: 140, dmg: 32, armor: 40, shield: 150 }, move: 5, skills: ['e_melee', 'e_parry', 'e_lunge', 'e_blast'], phases: [0.5], tags: ['robot', 'frame'] },
};

// MISSIONS §9 packs. units: [defId, min, max]. minLevel gates a unit.
export const PACKS = {
  syndicate_street: { faction: 'syndicate', units: [['knuckle', 2, 3], ['popper', 1, 2]] },
  scrap_swarm: { faction: 'scrap', units: [['scrap_rat', 4, 8]] },
  warden_patrol: { faction: 'concord', minLevel: 8, units: [['warden_eye', 1, 1], ['warden', 2, 2]] },
  chromehead_duo: { faction: 'syndicate', units: [['chromehead', 2, 2]] },
  sweeper_squad: { faction: 'concord', units: [['warden', 3, 3], ['warden_eye', 1, 1]] },
  security_floor: { faction: 'concord', units: [['warden', 2, 2], ['sentry_turret', 2, 2], ['enforcer', 1, 1, 14]] },
  dockers: { faction: 'syndicate', units: [['chromehead', 1, 1], ['popper', 3, 3]] },
  unlinked_cell: { faction: 'unlinked', units: [['saboteur', 2, 3]] },
  rust_pack: { faction: 'scrap', units: [['rustkin', 3, 3]] },
  lancer_patrol: { faction: 'concord', units: [['lancer', 1, 2], ['warden', 1, 2]] },
  wight_crawl: { faction: 'scrap', units: [['hull_wight', 4, 4], ['spine_keeper', 1, 1, 30]] },
  choir_trine: { faction: 'choir', units: [['choir_angel', 3, 3]] },
  gilded_court: { faction: 'voices', units: [['gilded_guard', 2, 2], ['sovereign_construct', 1, 1]] },
  // pest control / low-level fillers
  rat_nest: { faction: 'scrap', units: [['scrap_rat', 3, 5]] },
  syndicate_pair: { faction: 'syndicate', units: [['knuckle', 1, 2]] },
  warden_pair: { faction: 'concord', units: [['warden', 1, 2]] },
};

// which faction's pack list to draw from, by district pool faction
export const FACTION_PACKS = {
  syndicate: ['syndicate_street', 'chromehead_duo', 'dockers', 'syndicate_pair'],
  scrap: ['scrap_swarm', 'rat_nest', 'rust_pack', 'wight_crawl'],
  concord: ['warden_patrol', 'sweeper_squad', 'security_floor', 'lancer_patrol', 'warden_pair'],
  unlinked: ['unlinked_cell'],
  choir: ['choir_trine'],
  voices: ['gilded_court'],
};

// champion/elite-capable unit per faction (elitePack modifier, elite grade targets)
export const FACTION_ELITE = { syndicate: 'chromehead', scrap: 'rustkin', concord: 'warden', unlinked: 'saboteur', choir: 'choir_angel', voices: 'gilded_guard' };
export const FACTION_TARGET = { syndicate: 'knuckle', scrap: 'rustkin', concord: 'warden', unlinked: 'saboteur', choir: 'choir_angel', voices: 'gilded_guard', nexus: 'popper', freehaul: 'knuckle' };
