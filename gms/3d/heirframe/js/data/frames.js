// Frames (DESIGN §5). Skill fields the engine reads:
//   kind: melee | ranged | cone | aoe | dash | blink | line | self | summon | hack | distract
//   base (damage at rider lvl 1, before weapon/affixes), combo [..] for chained basics,
//   interval (s between basic hits), range, radius, arc (deg), pellets, element, energy, cooldown,
//   charge (s), knockback (m), applies [{id,t,...}], selfStatus [{id,t,...}], anim.
// Status fields: dmgMult, dmgTakenMult, frontalDR, moveMult, atkSpeedMult, evasion, taunt, guaranteedCrit.

export const FRAMES = {
  rental: {
    id: 'rental', archetype: 'rental', name: 'HireFrame R-1', model: 'HireFrame R-1', robotKind: 'rental',
    blurb: 'Scuffed grey and orange, rental decals, a cracked visor and one mismatched arm. It works. Mostly.',
    base: { hp: 120, shield: 0, energy: 60, energyRegen: 6, armor: 5, moveSpeed: 4.2, critChance: 0.05, critDmg: 1.5, detectMult: 1, dodgeCd: 4 },
    slots: ['weapon', 'chip'],
    weaponClass: 'any',
    maxSync: 5,
    skills: { attack: 'r_baton', s1: 'r_zap', s2: 'r_overclock', s3: 'r_sponsored' },
    passive: { id: 'warranty', name: 'Limited Warranty', desc: 'Repairs are free, but 10% of mission credits go to HireFrame as a usage surcharge.' },
    rental: true,
  },
  brawler: {
    id: 'brawler', archetype: 'brawler', name: 'Bulwark', model: 'Bulwark G-7', robotKind: 'brawler',
    blurb: 'Massive gloss-black and gold, piston forearms. Wades in, soaks damage, makes things fly.',
    base: { hp: 260, shield: 60, energy: 80, energyRegen: 5, armor: 30, moveSpeed: 3.8, critChance: 0.05, critDmg: 1.5, detectMult: 1.25, dodgeCd: 3.5, rageFrac: 0.15 },
    slots: ['chassis', 'core', 'weapon', 'optics', 'mobility', 'chip'],
    weaponClass: 'melee',
    maxSync: 20,
    skills: { attack: 'b_fists', s1: 'b_slam', s2: 'b_charge', s3: 'b_bulwark', heir: 'b_titanfall' },
    passive: { id: 'momentum', name: 'Momentum', desc: 'Each hit within 3 s of the last gives +4% damage (max 5). 15% of damage taken becomes energy.', perHit: 0.04, maxStacks: 5, window: 3 },
  },
  gunner: {
    id: 'gunner', archetype: 'gunner', name: 'Longarm', model: 'Longarm V-3', robotKind: 'gunner',
    blurb: 'Chrome, long limbs, a shoulder sensor mast and twin carbines. Keep your distance.',
    base: { hp: 180, shield: 100, energy: 100, energyRegen: 10, armor: 15, moveSpeed: 4.0, critChance: 0.08, critDmg: 1.6, detectMult: 1, dodgeCd: 2.5 },
    slots: ['chassis', 'core', 'weapon', 'optics', 'mobility', 'chip'],
    weaponClass: 'ranged',
    maxSync: 20,
    skills: { attack: 'g_carbines', s1: 'g_scatter', s2: 'g_rail', s3: 'g_turret', heir: 'g_starfall' },
    passive: { id: 'steady', name: 'Steady Hands', desc: 'Standing still for 1 s: +25% crit chance until you move. Moving: +15% evasion.', stillCrit: 0.25, stillTime: 1, moveEvasion: 0.15 },
  },
  ghost: {
    id: 'ghost', archetype: 'ghost', name: 'Wisp', model: 'Wisp S-9', robotKind: 'ghost',
    blurb: 'Slim matte black with cyan seams, no face, a blade in the forearm. Invisible and lethal, but fragile.',
    base: { hp: 150, shield: 50, energy: 120, energyRegen: 12, armor: 10, moveSpeed: 4.8, critChance: 0.12, critDmg: 2.0, detectMult: 0.6, dodgeCd: 2.0, hackSpeedPct: 1 },
    slots: ['chassis', 'core', 'weapon', 'optics', 'mobility', 'chip'],
    weaponClass: 'precision',
    maxSync: 20,
    skills: { attack: 'h_blade', s1: 'h_veil', s2: 'h_blink', s3: 'h_pulse', heir: 'h_eclipse' },
    passive: { id: 'silent', name: 'Silent Running', desc: 'Detection radius x0.6 and terminals hack 2x faster.' },
  },
};

export const OWNABLE_FRAMES = ['brawler', 'gunner', 'ghost'];

// DESIGN §5.7 Mk tiers: mult applies to frame base hp/shield/armor and (at half strength) damage.
export const MK_TIERS = [
  { tier: 0, name: 'Mk I', mult: 1, cost: 0, level: 1, sync: 1 },
  { tier: 1, name: 'Mk II', mult: 1.18, cost: 9000, level: 10, sync: 4 },
  { tier: 2, name: 'Mk III', mult: 1.4, cost: 45000, level: 20, sync: 8 },
  { tier: 3, name: 'Mk IV', mult: 1.66, cost: 180000, level: 32, sync: 12 },
  { tier: 4, name: 'Mk V', mult: 1.97, cost: 650000, level: 45, sync: 16 },
  { tier: 5, name: 'Mk VI', mult: 2.35, cost: 2200000, level: 60, sync: 20 },
];
export const MK_DAMAGE_SHARE = 0.5;
export const SYNC_NEXT = s => Math.round(400 * 1.25 ** (s - 1));
export const DODGE = { distance: 5, iframeStart: 0.05, iframeEnd: 0.35 };

export const SKILLS = {
  // rental
  r_baton: { id: 'r_baton', name: 'Shock Baton', icon: 'baton', basic: true, kind: 'melee', range: 2.2, arc: 70, base: 9, interval: 0.75, element: 'shock', anim: 'attack_melee' },
  r_zap: { id: 'r_zap', name: 'Zap Pistol', icon: 'pistol', kind: 'ranged', hitscan: true, range: 16, base: 14, element: 'shock', energy: 10, cooldown: 3, anim: 'shoot' },
  r_overclock: { id: 'r_overclock', name: 'Overclock', icon: 'overclock', kind: 'self', hpCostPct: 0.05, cooldown: 14, selfStatus: [{ id: 'overclock', t: 4, moveMult: 1.35, atkSpeedMult: 1.35 }], anim: 'cast' },
  r_sponsored: { id: 'r_sponsored', name: 'Sponsored Content', icon: 'advert', kind: 'distract', radius: 6, energy: 25, cooldown: 20, applies: [{ id: 'distracted', t: 2.5, bossImmune: true }], anim: 'cast' },

  // brawler
  b_fists: { id: 'b_fists', name: 'Piston Fists', icon: 'fist', basic: true, kind: 'melee', range: 2.4, arc: 70, combo: [14, 14, 30], comboReset: 1.2, interval: 0.6, element: 'kinetic', knockbackOnLast: 2, anim: 'attack_melee' },
  b_slam: { id: 'b_slam', name: 'Ground Slam', icon: 'slam', kind: 'aoe', radius: 4, base: 45, energy: 30, cooldown: 8, applies: [{ id: 'stagger', t: 1.2, stun: true }], anim: 'attack_heavy' },
  b_charge: { id: 'b_charge', name: 'Rocket Charge', icon: 'charge', kind: 'dash', range: 8, radius: 1.6, base: 25, energy: 25, cooldown: 10, knockback: 3, endStun: 0.3, anim: 'run' },
  b_bulwark: { id: 'b_bulwark', name: 'Bulwark', icon: 'wall', kind: 'self', radius: 10, energy: 35, cooldown: 16, selfStatus: [{ id: 'bulwark', t: 5, frontalDR: 0.6, taunt: 10 }], anim: 'cast' },
  b_titanfall: { id: 'b_titanfall', name: 'Titanfall', icon: 'heir', heir: true, kind: 'aoe', range: 6, radius: 5, base: 150, cooldown: 60, anim: 'attack_heavy' },

  // gunner
  g_carbines: { id: 'g_carbines', name: 'Twin Carbines', icon: 'carbine', basic: true, kind: 'ranged', range: 16, base: 6, interval: 0.25, spread: 4, element: 'kinetic', anim: 'shoot' },
  g_scatter: { id: 'g_scatter', name: 'Scatter Volley', icon: 'scatter', kind: 'cone', range: 7, arc: 60, pellets: 8, base: 9, energy: 20, cooldown: 6, knockback: 3, anim: 'shoot' },
  g_rail: { id: 'g_rail', name: 'Rail Shot', icon: 'rail', kind: 'line', range: 30, width: 1.2, pierce: true, charge: 0.8, chargeMove: 0.5, base: 90, element: 'ion', energy: 35, cooldown: 12, anim: 'shoot' },
  g_turret: { id: 'g_turret', name: 'Drone Turret', icon: 'turret', kind: 'summon', summon: { t: 10, rate: 3, base: 5, range: 14, taunt: true }, energy: 40, cooldown: 18, anim: 'cast' },
  g_starfall: { id: 'g_starfall', name: 'Starfall', icon: 'heir', heir: true, kind: 'aoe', range: 18, radius: 3, hits: 12, base: 40, cooldown: 60, anim: 'cast' },

  // ghost
  h_blade: { id: 'h_blade', name: 'Mono-blade', icon: 'blade', basic: true, kind: 'melee', range: 2.0, arc: 70, combo: [11, 11], comboReset: 1.0, interval: 0.42, element: 'kinetic', backstab: true, anim: 'attack_melee' },
  h_veil: { id: 'h_veil', name: 'Veil', icon: 'veil', kind: 'self', energy: 30, cooldown: 14, selfStatus: [{ id: 'cloak', t: 6, guaranteedCrit: true, silent: true }], anim: 'cast' },
  h_blink: { id: 'h_blink', name: 'Blink', icon: 'blink', kind: 'blink', range: 7, energy: 20, cooldown: 7, decoy: 2, anim: 'dodge' },
  h_pulse: { id: 'h_pulse', name: 'Hack Pulse', icon: 'hack', kind: 'hack', radius: 6, energy: 45, cooldown: 20, applies: [{ id: 'disabled', t: 5, tags: ['drone', 'turret', 'camera'] }], convert: { count: 1, t: 8 }, anim: 'cast' },
  h_eclipse: { id: 'h_eclipse', name: 'Eclipse', icon: 'heir', heir: true, kind: 'self', cooldown: 60, selfStatus: [{ id: 'eclipse', t: 4, timeScale: 0.25 }], anim: 'cast' },

  // enemy attacks (base = damage multiplier on the enemy's dmg stat)
  e_melee: { id: 'e_melee', name: 'Strike', basic: true, kind: 'melee', range: 2.2, base: 1, interval: 1.4, anim: 'attack_melee' },
  e_bite: { id: 'e_bite', name: 'Bite', basic: true, kind: 'melee', range: 1.4, base: 1, interval: 1.0, anim: 'attack_melee' },
  e_baton: { id: 'e_baton', name: 'Baton', basic: true, kind: 'melee', range: 2.2, base: 1, interval: 1.3, element: 'shock', anim: 'attack_melee' },
  e_heavy: { id: 'e_heavy', name: 'Crush', kind: 'melee', range: 2.6, base: 2.2, cooldown: 6, telegraph: 0.8, applies: [{ id: 'stagger', t: 0.6, stun: true, chance: 0.5 }], anim: 'attack_heavy' },
  e_pistol: { id: 'e_pistol', name: 'Pistol', basic: true, kind: 'ranged', range: 10, base: 1, interval: 1.5, anim: 'shoot' },
  e_burst: { id: 'e_burst', name: 'Burst', basic: true, kind: 'ranged', range: 14, base: 0.35, shots: 4, interval: 2.2, anim: 'shoot' },
  e_zap: { id: 'e_zap', name: 'Ion Zap', basic: true, kind: 'ranged', range: 9, base: 1, interval: 1.6, element: 'ion', anim: 'shoot' },
  e_stomp: { id: 'e_stomp', name: 'Stomp', kind: 'aoe', radius: 4.5, base: 1.8, cooldown: 9, telegraph: 1, applies: [{ id: 'stagger', t: 0.8, stun: true }], anim: 'attack_heavy' },
  e_dash: { id: 'e_dash', name: 'Dash', kind: 'dash', range: 8, radius: 1.5, base: 1.5, cooldown: 7, telegraph: 0.5, anim: 'run' },
  e_lunge: { id: 'e_lunge', name: 'Spear Lunge', kind: 'dash', range: 6, radius: 1.2, base: 1.8, cooldown: 5, telegraph: 0.6, anim: 'attack_heavy' },
  e_beam: { id: 'e_beam', name: 'Welding Beam', kind: 'line', range: 9, width: 0.8, base: 0.6, ticks: 5, cooldown: 6, element: 'thermal', telegraph: 0.6, anim: 'shoot' },
  e_sweep: { id: 'e_sweep', name: 'Laser Sweep', kind: 'cone', range: 14, arc: 120, base: 1.6, cooldown: 8, element: 'thermal', telegraph: 1.2, anim: 'shoot' },
  e_dive: { id: 'e_dive', name: 'Dive', kind: 'dash', range: 12, radius: 2, base: 1.6, cooldown: 5, telegraph: 0.7, anim: 'attack_heavy' },
  e_parry: { id: 'e_parry', name: 'Parry', kind: 'self', cooldown: 8, selfStatus: [{ id: 'parry', t: 1.2, dmgTakenMult: 0.1 }], anim: 'cast' },
  e_emp: { id: 'e_emp', name: 'EMP Mine', kind: 'aoe', radius: 3.5, base: 1.2, cooldown: 12, element: 'ion', telegraph: 1.5, anim: 'cast' },
  e_blast: { id: 'e_blast', name: 'Burst Pulse', kind: 'aoe', radius: 3, base: 1.5, cooldown: 10, telegraph: 1, anim: 'attack_heavy' },
};

// Sync mods (DESIGN §5.6): unlocked at sync 5/10/15/20, pick one of two per rank.
// `mods` patch the skill definition (numbers multiply when key ends in Mult, else replace/add).
export const SYNC_MODS = {
  rental: [
    { rank: 5, options: [{ id: 'premium', skill: 'r_sponsored', name: 'Premium Tier', desc: 'Sponsored Content lasts 4 s.', patch: { applies: [{ id: 'distracted', t: 4, bossImmune: true }] } }] },
  ],
  brawler: [
    { rank: 5, options: [
      { id: 'aftershock', skill: 'b_slam', name: 'Aftershock', desc: 'A second slam 1 s later for 50%.', patch: { echo: { delay: 1, pct: 0.5 } } },
      { id: 'magnetic', skill: 'b_slam', name: 'Magnetic', desc: 'Pulls enemies within 3 m in first.', patch: { pull: 3 } },
    ] },
    { rank: 10, options: [
      { id: 'afterburner', skill: 'b_charge', name: 'Afterburner', desc: 'Charge leaves a burning trail (30% over 3 s).', patch: { trail: { element: 'thermal', pct: 0.3, t: 3 } } },
      { id: 'battering', skill: 'b_charge', name: 'Battering Ram', desc: '+60% charge damage, end stun 1 s.', patch: { baseMult: 1.6, endStun: 1 } },
    ] },
    { rank: 15, options: [
      { id: 'spiked', skill: 'b_bulwark', name: 'Spiked Wall', desc: 'Bulwark reflects 30% of blocked melee damage.', patch: { reflect: 0.3 } },
      { id: 'rally', skill: 'b_bulwark', name: 'Rally', desc: 'Bulwark also restores 20% shield.', patch: { restoreShieldPct: 0.2 } },
    ] },
    { rank: 20, options: [
      { id: 'piston_overdrive', skill: 'b_fists', name: 'Piston Overdrive', desc: 'The third combo hit shockwaves 3 m for 50%.', patch: { lastHitAoe: { radius: 3, pct: 0.5 } } },
      { id: 'iron_rhythm', skill: 'b_fists', name: 'Iron Rhythm', desc: 'Momentum stacks to 8.', patch: { momentumMax: 8 } },
    ] },
  ],
  gunner: [
    { rank: 5, options: [
      { id: 'overpenetrate', skill: 'g_rail', name: 'Overpenetrate', desc: 'Rail Shot bounces once.', patch: { bounces: 1 } },
      { id: 'quickcharge', skill: 'g_rail', name: 'Quickcharge', desc: '0.4 s charge, -25% damage.', patch: { charge: 0.4, baseMult: 0.75 } },
    ] },
    { rank: 10, options: [
      { id: 'slugs', skill: 'g_scatter', name: 'Slug Rounds', desc: '4 pellets, each x2.5 damage, 12 m.', patch: { pellets: 4, baseMult: 2.5, range: 12, arc: 30 } },
      { id: 'incendiary', skill: 'g_scatter', name: 'Incendiary', desc: 'Pellets are Thermal.', patch: { element: 'thermal' } },
    ] },
    { rank: 15, options: [
      { id: 'twin_turret', skill: 'g_turret', name: 'Twin Deploy', desc: 'Deploy two turrets at 60% damage.', patch: { summonCount: 2, baseMult: 0.6 } },
      { id: 'flak', skill: 'g_turret', name: 'Flak Turret', desc: 'Turret shots splash 2 m.', patch: { splash: 2 } },
    ] },
    { rank: 20, options: [
      { id: 'hot_barrels', skill: 'g_carbines', name: 'Hot Barrels', desc: 'Every 10th shot is a guaranteed crit.', patch: { critEvery: 10 } },
      { id: 'long_barrels', skill: 'g_carbines', name: 'Long Barrels', desc: '+6 m range, +15% damage.', patch: { range: 22, baseMult: 1.15 } },
    ] },
  ],
  ghost: [
    { rank: 5, options: [
      { id: 'double_blink', skill: 'h_blink', name: 'Double Blink', desc: 'Blink has 2 charges.', patch: { charges: 2 } },
      { id: 'knife_decoy', skill: 'h_blink', name: 'Knife Decoy', desc: 'The decoy explodes for 40 damage.', patch: { decoyBlast: 40 } },
    ] },
    { rank: 10, options: [
      { id: 'long_veil', skill: 'h_veil', name: 'Deep Veil', desc: 'Veil lasts 10 s.', patch: { selfStatus: [{ id: 'cloak', t: 10, guaranteedCrit: true, silent: true }] } },
      { id: 'veil_step', skill: 'h_veil', name: 'Veil Step', desc: 'Veil gives +40% move speed.', patch: { selfStatus: [{ id: 'cloak', t: 6, guaranteedCrit: true, silent: true, moveMult: 1.4 }] } },
    ] },
    { rank: 15, options: [
      { id: 'mass_convert', skill: 'h_pulse', name: 'Mass Convert', desc: 'Converts two robots.', patch: { convert: { count: 2, t: 8 } } },
      { id: 'overload', skill: 'h_pulse', name: 'Overload', desc: 'Pulse deals 60 Ion damage.', patch: { base: 60, element: 'ion' } },
    ] },
    { rank: 20, options: [
      { id: 'thousand_cuts', skill: 'h_blade', name: 'Thousand Cuts', desc: 'Adds a third combo hit (18).', patch: { combo: [11, 11, 18] } },
      { id: 'executioner', skill: 'h_blade', name: 'Executioner', desc: 'x2 damage to enemies below 25% HP.', patch: { executeBelow: 0.25, executeMult: 2 } },
    ] },
  ],
};

export const SYNC_BONUS_PER_RANK = 0.02;
