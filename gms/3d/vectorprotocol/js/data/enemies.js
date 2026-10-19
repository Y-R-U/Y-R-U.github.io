// Enemy-only UnitDefs: grunts, elites (auto-built from every recruitable unit), story bosses,
// and the fantasy-realm NPCs (D21). Same UnitDef shape as units.js.
import { UNITS, ATK_SCALE } from './units.js';

const G = { hp: 0.09, atk: 0.08, def: 0.06 };
const E = (o) => ({ growth: G, chargeRate: 1.0, realm: 'scifi', enemyOnly: true, ...o, base: { ...o.base, atk: Math.round(o.base.atk * ATK_SCALE) } });

// ── grunts: cheap filler for early waves. model 'drone' is a small generic hover drone
//    (robots agent: faction tint does the rest; falls back to 'needle').
const grunts = {
  scrap_drone: E({ id: 'scrap_drone', name: 'Scrap Drone', role: 'archer', faction: 'rogue', rarity: 'common', model: 'drone', fallbackModel: 'needle',
    base: { hp: 420, atk: 52, def: 14, spd: 1.3, crit: 0.05, critDmg: 0.5 }, attack: 'drone_zap', passive: 'none', overdrive: 'self_destruct' }),
  sec_drone: E({ id: 'sec_drone', name: 'Security Drone', role: 'archer', faction: 'corporate', rarity: 'common', model: 'drone', fallbackModel: 'needle',
    base: { hp: 460, atk: 48, def: 22, spd: 1.3, crit: 0.05, critDmg: 0.5 }, attack: 'drone_zap', passive: 'none', overdrive: 'self_destruct' }),
  lab_drone: E({ id: 'lab_drone', name: 'Lattice Mote', role: 'mage', faction: 'experimental', rarity: 'common', model: 'drone', fallbackModel: 'wisp',
    base: { hp: 400, atk: 50, def: 16, spd: 1.4, crit: 0.05, critDmg: 0.5 }, attack: 'wisp_spark', passive: 'none', overdrive: 'self_destruct' }),
  dock_thug: E({ id: 'dock_thug', name: 'Dock Thug', role: 'tank', faction: 'rogue', rarity: 'common', model: 'scrapper',
    base: { hp: 1050, atk: 48, def: 50, spd: 1.7, crit: 0.05, critDmg: 0.5 }, attack: 'piston_punch', passive: 'none', overdrive: 'haymaker', chargeRate: 1.1 }),
};

// ── elites: `<id>_elite` for every recruitable unit (×1.35 hp, ×1.15 atk)
const elites = {};
for (const u of Object.values(UNITS)) {
  elites[`${u.id}_elite`] = {
    ...u, id: `${u.id}_elite`, name: `${u.name} ★`, elite: true, enemyOnly: true,
    base: { ...u.base, hp: Math.round(u.base.hp * 1.35), atk: Math.round(u.base.atk * 1.15) },
  };
}

// ── bosses (one per story map). scale = model scale hint for the battle renderer.
const B = (id, name, title, model, role, faction, base, attack, overdrive, extra = {}) =>
  E({ id, name, title, model, role, faction, rarity: 'legendary', boss: true, scale: 1.35,
      base: { crit: 0.08, critDmg: 0.5, ...base }, attack, passive: 'boss_enrage', overdrive, chargeRate: 1.1, ...extra });

const bosses = {
  boss_big_rusty: B('boss_big_rusty', 'BIG RUSTY', 'Dockmaster Krell\'s pride', 'juggernaut', 'tank', 'rogue',
    { hp: 5600, atk: 78, def: 80, spd: 1.9 }, 'saw_ram', 'ram_rush'),
  boss_redline: B('boss_redline', 'REDLINE', 'Jax Varro\'s rig', 'warlord', 'tank', 'rogue',
    { hp: 6200, atk: 92, def: 78, spd: 1.4 }, 'chainblade', 'frenzy', { passive: 'boss_reinforce' }),
  boss_corona: B('boss_corona', 'CORONA', 'Ione Vale, league champion', 'widowmaker', 'archer', 'corporate',
    { hp: 4200, atk: 140, def: 40, spd: 1.5, crit: 0.2, critDmg: 0.8 }, 'long_rifle', 'last_light'),
  boss_stormcrow: B('boss_stormcrow', 'STORMCROW', 'Kestrel\'s orbital gunship', 'meridian', 'archer', 'corporate',
    { hp: 4600, atk: 130, def: 45, spd: 1.7, crit: 0.15 }, 'long_shot', 'orbital_designator'),
  boss_the_choir: B('boss_the_choir', 'THE CHOIR', 'voice of the Lattice', 'seraph', 'archer', 'experimental',
    { hp: 4800, atk: 128, def: 44, spd: 1.3 }, 'light_lance', 'choir_of_lances', { passive: 'boss_reinforce' }),
  boss_elderbark: B('boss_elderbark', 'ELDERBARK', 'Warden of the Verdance', 'treant', 'tank', 'wild',
    { hp: 6000, atk: 84, def: 90, spd: 2.0 }, 'root_slam', 'grasp_of_ages', { realm: 'fantasy', scale: 1.5 }),
  boss_aurelian: B('boss_aurelian', 'AURELIAN', 'Novaline\'s answer to everything', 'paragon', 'mage', 'corporate',
    { hp: 5400, atk: 120, def: 60, spd: 1.5 }, 'satellite_ping', 'satellite_lance', { passive: 'boss_reinforce' }),
  raid_dreadnought: B('raid_dreadnought', 'DREADNOUGHT', 'weekly raid: a Halvorsen siege platform gone rogue', 'citadel', 'tank', 'corporate',
    { hp: 40000, atk: 70, def: 90, spd: 1.8 }, 'flak_cannon', 'boss_cataclysm', { scale: 1.9, passive: 'boss_reinforce', raid: true }),
  boss_vector_prime: B('boss_vector_prime', 'VECTOR PRIME', 'Cassius Vane, uploaded', 'singularity', 'mage', 'experimental',
    { hp: 6400, atk: 120, def: 65, spd: 1.4 }, 'void_bolt', 'boss_cataclysm', { scale: 1.6 }),
};

// ── fantasy realm (D21): organic creatures, enemy-only for now. Factions are fantasy factions
//    (order = blue/steel, wild = green, horde = red); plate colours per faction, see docs/ROSTER.md.
//    recruitable: story level whose first clear adds the unit to the Rift recruitment pool.
const F = (o) => E({ realm: 'fantasy', ...o });
const fantasy = {
  rift_knight: F({ id: 'rift_knight', name: 'RIFT KNIGHT', title: 'Sworn of the Hollow Crown', role: 'tank', faction: 'order', rarity: 'rare', model: 'knight', body: 'humanoid', recruitable: 'm6_l16',
    base: { hp: 1480, atk: 62, def: 74, spd: 1.5, crit: 0.06, critDmg: 0.5 }, attack: 'longsword_cut', passive: 'oathbound', overdrive: 'shieldwall_charge', chargeRate: 1.25 }),
  minotaur: F({ id: 'minotaur', name: 'MINOTAUR', title: 'Labyrinth Brute', role: 'tank', faction: 'horde', rarity: 'epic', model: 'minotaur', body: 'brute', recruitable: 'm7_l6',
    base: { hp: 1600, atk: 68, def: 60, spd: 1.6, crit: 0.08, critDmg: 0.5 }, attack: 'scythe_sweep', passive: 'bloodrage', overdrive: 'gore_charge', chargeRate: 1.25 }),
  treant: F({ id: 'treant', name: 'TREANT', title: 'Old Growth', role: 'tank', faction: 'wild', rarity: 'epic', model: 'treant', body: 'brute', recruitable: 'm7_l12',
    base: { hp: 1900, atk: 54, def: 82, spd: 2.0, crit: 0.05, critDmg: 0.5 }, attack: 'root_slam', passive: 'deep_roots', overdrive: 'grasp_of_ages', chargeRate: 1.35 }),
  elf_ranger: F({ id: 'elf_ranger', name: 'ELF RANGER', title: 'Verdance Watch', role: 'archer', faction: 'wild', rarity: 'rare', model: 'elf_ranger', body: 'humanoid', recruitable: 'm6_l8',
    base: { hp: 780, atk: 90, def: 26, spd: 1.2, crit: 0.14, critDmg: 0.6 }, attack: 'longbow', passive: 'keen_eye', overdrive: 'arrow_rain' }),
  dire_wolf: F({ id: 'dire_wolf', name: 'DIRE WOLF', title: 'Ember Pack', role: 'archer', faction: 'horde', rarity: 'common', model: 'wolf', body: 'quadruped', variant: 'ember', recruitable: 'm6_l5',
    base: { hp: 860, atk: 70, def: 30, spd: 1.0, crit: 0.12, critDmg: 0.5 }, attack: 'pounce', passive: 'pack_hunter', overdrive: 'ember_howl' }),
  frost_wolf: F({ id: 'frost_wolf', name: 'FROST WOLF', title: 'Rime Pack', role: 'archer', faction: 'order', rarity: 'rare', model: 'wolf', body: 'quadruped', variant: 'frost', recruitable: 'm6_l12',
    base: { hp: 880, atk: 72, def: 32, spd: 1.0, crit: 0.12, critDmg: 0.5 }, attack: 'pounce', passive: 'pack_hunter', overdrive: 'frost_lunge' }),
  elf_sage: F({ id: 'elf_sage', name: 'ELF SAGE', title: 'Keeper of the Lumen Staff', role: 'mage', faction: 'wild', rarity: 'epic', model: 'elf_sage', body: 'humanoid', recruitable: 'm6_l16',
    base: { hp: 780, atk: 82, def: 28, spd: 1.5, crit: 0.05, critDmg: 0.5 }, attack: 'lumen_bolt', passive: 'verdant_bloom', overdrive: 'sanctuary_grove' }),
  horde_shaman: F({ id: 'horde_shaman', name: 'HORDE SHAMAN', title: 'Bone-Drum Caller', role: 'mage', faction: 'horde', rarity: 'rare', model: 'shaman', body: 'brute', recruitable: 'm6_l11',
    base: { hp: 820, atk: 78, def: 30, spd: 1.6, crit: 0.05, critDmg: 0.5 }, attack: 'hex_bolt', passive: 'war_drums', overdrive: 'blood_totem' }),
};

export const ENEMIES = { ...grunts, ...elites, ...bosses, ...fantasy };
// Rift recruits (D21): the fantasy NPCs as player units, only from the Rift banner (bannerOnly) and only
// after their `recruitable` level is cleared. Not used by arena rivals (noArena). index.js merges these
// into DATA.units; the enemy copies above stay for story waves.
export const RIFT_RECRUITS = Object.fromEntries(Object.values(fantasy).filter((u) => u.recruitable)
  .map((u) => [u.id, { ...u, enemyOnly: false, bannerOnly: true, noArena: true }]));
export const FANTASY_UNITS = fantasy;
export const BOSSES = bosses;
export default ENEMIES;
