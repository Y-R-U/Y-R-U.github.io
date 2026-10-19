// Story maps (SCHEMA MapDef/LevelDef). Levels are generated from the compact MAP_SPEC tables
// below (deterministic; no RNG at runtime), then hand overrides are applied. docs/MAPS.md
// explains the intent. To retune difficulty, edit `lv` / `size` / `rankBonus` per map.
import { UNITS } from './units.js';
import { ENEMIES } from './enemies.js';
import { RULES } from './rules.js';
import { unitPower } from '../sim/stats.js';
import { STAR_TIMES } from './star_times.js';

export const SLOT_UNLOCKS = { 3: 'm1_l5', 4: 'm2_l7', 5: 'm3_l14', 6: 'm5_l8' };
// feature unlocks on first clear (UI gates screens on these ids)
export const FEATURE_UNLOCKS = {
  m1_l2: ['workshop'], m1_l4: ['recruit_street'], m1_l8: ['rank_up'], m1_l12: ['hq'],
  m2_l3: ['ability_upgrades', 'buffs'], m2_l4: ['arena'], m2_l10: ['daily_ops'],
  m3_l1: ['recruit_contract'], m3_l8: ['faction_trials'], m4_l1: ['weekly_raid'], m4_l8: ['recruit_arena'],
  m6_l16: ['recruit_rift'],
};
// story units granted on first clear
const STORY_CARDS = {
  m1_l3: ['patch'], m1_l12: ['bulwark'], m2_l14: ['jammer'], m3_l14: ['lancer'],
  m4_l15: ['prism'], m5_l8: ['oracle'], m5_l16: ['phase'], m7_l18: ['paladin'],
};

const POOLS = {
  docks: { tank: ['dock_thug', 'scrapper', 'warden'], archer: ['scrap_drone', 'rattler', 'gunner'], mage: ['sparkplug', 'patch'] },
  undercity: { tank: ['scrapper', 'riot', 'dock_thug'], archer: ['rattler', 'barb', 'scrap_drone'], mage: ['sparkplug', 'jammer', 'pyre'] },
  league: { tank: ['bulwark', 'riot', 'phase', 'warden', 'husk'], archer: ['lancer', 'barb', 'prism', 'gunner', 'needle'], mage: ['oracle', 'halo', 'patch', 'aegis', 'jammer'] },
  skyport: { tank: ['warden', 'bulwark', 'citadel'], archer: ['sec_drone', 'gunner', 'lancer', 'meridian'], mage: ['patch', 'aegis', 'arbiter'] },
  lattice: { tank: ['husk', 'phase', 'monolith'], archer: ['lab_drone', 'needle', 'prism', 'specter'], mage: ['wisp', 'oracle', 'halo'] },
  verdance: { tank: ['rift_knight', 'minotaur', 'treant'], archer: ['elf_ranger', 'dire_wolf', 'frost_wolf'], mage: ['elf_sage', 'horde_shaman'] },
  spire: { tank: ['bulwark', 'minotaur', 'citadel', 'treant', 'juggernaut'], archer: ['lancer', 'frost_wolf', 'meridian', 'tarantula', 'specter'], mage: ['aegis', 'horde_shaman', 'arbiter', 'pyre', 'halo'] },
  core: { tank: ['monolith', 'citadel', 'juggernaut', 'paladin', 'warlord', 'leviathan'], archer: ['specter', 'meridian', 'tarantula', 'executor', 'widowmaker', 'seraph'], mage: ['halo', 'arbiter', 'pyre', 'paragon', 'kingpin', 'singularity'] },
};

// lv = enemy level start→end; size = units per wave start→end; rankBonus = enemy ranks above the
// minimum their level needs; elites = level numbers (1-based) that are elite nodes.
export const MAP_SPEC = [
  { id: 'm1', theme: 'docks', name: 'Rustline Docks', realm: 'scifi', n: 12, lv: [1, 8], size: [1, 3], waves: [1, 2], rankBonus: 0, pool: 'docks', elites: [8], boss: 'boss_big_rusty', shardPool: ['scrapper', 'gunner', 'patch'], shardsPer: 2,
    blurb: 'Two robots, one leaking hangar, every job nobody else wants.' },
  { id: 'm2', theme: 'slums', name: 'Neon Undercity', realm: 'scifi', n: 14, lv: [8, 15], size: [3, 4], waves: [1, 3], rankBonus: 0, pool: 'undercity', elites: [5, 10], boss: 'boss_redline', shardPool: ['scrapper', 'gunner', 'patch', 'bulwark', 'barb', 'riot', 'rattler'], shardsPer: 2,
    blurb: 'Red Ledger turf. Somebody paid them to want you dead.' },
  { id: 'm3', theme: 'league', name: 'Protocol League', realm: 'scifi', n: 14, lv: [17, 26], size: [3, 4], waves: [2, 3], rankBonus: 0, pool: 'league', elites: [5, 10], boss: 'boss_corona',
    blurb: 'Qualifiers for the Vector Protocol league. Cameras, sponsors, champions.' },
  { id: 'm4', theme: 'skyport', name: 'Kestrel Skyport', realm: 'scifi', n: 15, lv: [26, 34], size: [4, 5], waves: [2, 3], rankBonus: 0, pool: 'skyport', elites: [5, 10], boss: 'boss_stormcrow',
    blurb: 'Corporate contracts in the clouds. The clients are worse than the targets.' },
  { id: 'm5', theme: 'lab', name: 'The Lattice', realm: 'scifi', n: 16, lv: [33, 40], size: [5, 6], waves: [2, 3], rankBonus: 0, pool: 'lattice', elites: [5, 11], boss: 'boss_the_choir',
    blurb: 'Novaline Lab 9, quarantined. The robots inside are not malfunctioning.' },
  { id: 'm6', theme: 'forest', name: 'The Verdance', realm: 'fantasy', n: 16, lv: [40, 45], size: [5, 6], waves: [2, 3], rankBonus: 1, pool: 'verdance', elites: [5, 11], boss: 'boss_elderbark', shardPool: ['dire_wolf', 'elf_ranger', 'frost_wolf', 'horde_shaman', 'rift_knight', 'elf_sage'],
    blurb: 'Through the Rift: a living realm of knights and elves who think you are the invasion.' },
  { id: 'm7', theme: 'spirewar', name: 'Spire War', realm: 'scifi', n: 18, lv: [45, 49], size: [6, 6], waves: [2, 3], rankBonus: 0, pool: 'spire', elites: [6, 12], boss: 'boss_aurelian',
    blurb: 'Open corporate war over Halcyon Reach, fought with stolen monsters.' },
  { id: 'm8', theme: 'core', name: 'Protocol Core', realm: 'scifi', n: 15, lv: [48, 50], size: [6, 6], waves: [3, 3], rankBonus: 0, pool: 'core', elites: [5, 10], boss: 'boss_vector_prime',
    blurb: 'Inside the standard every robot runs. Rewrite it, or be rewritten.' },
];

// Backdrop briefs for the hub/map agent (docs/MAPS.md has the long version).
export const MAP_THEMES = {
  m1: { palette: ['#0b1220', '#ff6a1a', '#22d3ff'], backdrop: 'Night docks on stilts over black water: stacked shipping containers, gantry cranes with red beacons, sodium-orange floodlights, rain, a lit ferry in the distance. Road = a rusted catwalk over the water.' },
  m2: { palette: ['#120a1a', '#ff3d81', '#ff6a1a'], backdrop: 'Undercity market under the megacity platforms: layers of neon signage (pink/orange), steam vents, cable bundles, stalls with holo-adverts, the platform underside dripping far above. Road = a market street.' },
  m3: { palette: ['#06122a', '#22d3ff', '#a855f7'], backdrop: 'The Vector Protocol league stadium district: giant VP logo pylons, spectator stands, holo-banners, searchlights sweeping a cloudy sky. Road = a lit league bracket line between arenas.' },
  m4: { palette: ['#0a1830', '#9fd8ff', '#ffffff'], backdrop: 'Skyport above the clouds: landing pads, VTOLs, white corporate towers, a sunset-to-night gradient, Kestrel bird logos. Road = sky-bridges between pads.' },
  m5: { palette: ['#0c0616', '#a855f7', '#e879f9'], backdrop: 'Quarantined lab campus: sealed domes, violet light leaking from cracks, floating debris, crystal growths on walls, hazard tape. Road = a cracked service corridor glowing violet; the Rift glimmers at the end.' },
  m6: { palette: ['#0d1a0f', '#22c55e', '#fbbf24'], realm: 'fantasy', backdrop: 'Ancient forest ruins (refs/ref_fantasy_01.jpg): mossy stone walls, giant trees, god-rays, fireflies, a torn violet Rift hanging in the sky where Novaline harvest drones come through. Road = a cobbled path through ruins.' },
  m7: { palette: ['#0a0f1f', '#22d3ff', '#ef4444'], backdrop: 'Halcyon Reach at war: corporate towers with shield domes, burning skybridges, a vine-overgrown Novaline Spire with the Rift above its tip, searchlights and tracers. Road = a broken elevated highway.' },
  m8: { palette: ['#05030a', '#ffc23a', '#a855f7'], backdrop: 'Inside the Protocol: an abstract data-space, a vast circuit-trace floor stretching to infinity, glowing gold code pillars, floating hex plates, a black sun with a gold ring (Vector Prime) on the horizon. Road = a single bright circuit trace.' },
};

// ── deterministic helpers
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (arr, key) => arr[hash(key) % arr.length];
const lerp = (a, b, t) => a + (b - a) * t;
const CAPS = [10, 20, 30, 40, 50, 60];
const START_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };
const ALL = { ...UNITS, ...ENEMIES };
function rankFor(def, level, bonus) {
  let r = def.boss ? 0 : (START_RANK[def.rarity] ?? 0); // bosses scale by level only
  while (r < 5 && CAPS[r] < level) r++;
  return Math.min(5, r + bonus);
}
const ROLE_PLAN = ['tank', 'archer', 'mage', 'archer', 'tank', 'mage'];
function slotsFor(units) {
  const front = [1, 0, 2], back = [1, 0, 2];
  const out = [];
  const tanks = units.filter((u) => ALL[u.def].role === 'tank'), rest = units.filter((u) => ALL[u.def].role !== 'tank');
  for (const u of tanks) out.push({ ...u, slot: front.length ? { col: 0, lane: front.shift() } : { col: 1, lane: back.shift() } });
  for (const u of rest) out.push({ ...u, slot: back.length ? { col: 1, lane: back.shift() } : { col: 0, lane: front.shift() } });
  return out;
}
function abil(level) { const a = Math.max(1, Math.min(5, 1 + Math.floor(level / 12))); return { attack: a, passive: a, overdrive: a }; }
function inst(def, level, bonus) { return { def, level, rank: rankFor(ALL[def], level, bonus), abilityLevels: abil(level) }; }

function makeWave(spec, levelId, w, size, level, elite) {
  const pool = POOLS[spec.pool];
  const units = [];
  const used = new Set();
  for (let k = 0; k < size; k++) {
    const role = ROLE_PLAN[k];
    let cands = pool[role].filter((id) => !used.has(id));
    if (!cands.length) cands = pool[role];
    // early levels of a map lean on the first (weaker) entries of each pool
    const reach = Math.max(1, Math.ceil(cands.length * Math.min(1, 0.4 + level / (spec.lv[1] + 1) * 0.6)));
    let def = pick(cands.slice(0, reach), `${levelId}:${w}:${k}`);
    used.add(def);
    units.push(inst(def, level, spec.rankBonus));
  }
  if (elite) { const e = units.find((u) => ALL[`${u.def}_elite`]); if (e) e.def = `${e.def}_elite`; }
  return { units: slotsFor(units) };
}

// Fixed squad for events/arena-style content: defs listed tanks-first get auto slots.
export function buildSquad(defs, level, rankBonus = 0) { return { units: slotsFor(defs.map((d) => inst(d, level, rankBonus))) }; }
export const squadPower = (wave) => Math.round(wavePower(wave));

const POWER_DATA = { units: UNITS, enemies: ENEMIES, rules: RULES, economy: { startRank: START_RANK } };
const wavePower = (wave) => wave.units.reduce((s, u) => s + unitPower(POWER_DATA, u), 0);

function buildMap(spec, order) {
  const levels = [];
  for (let i = 0; i < spec.n; i++) {
    const node = i + 1, id = `${spec.id}_l${node}`;
    const t = spec.n > 1 ? i / (spec.n - 1) : 0;
    const level = Math.round(lerp(spec.lv[0], spec.lv[1], t));
    const isBoss = node === spec.n;
    const isElite = spec.elites.includes(node);
    const nW = isBoss ? 3 : Math.max(1, Math.min(3, Math.round(lerp(spec.waves[0], spec.waves[1], t))));
    const size = Math.min(6, Math.round(lerp(spec.size[0], spec.size[1], t)));
    const waves = [];
    for (let w = 0; w < nW; w++) {
      const s = Math.max(1, size - (nW - 1 - w));
      waves.push(makeWave(spec, id, w, s, level, isElite && w === nW - 1));
    }
    if (isBoss) {
      const last = waves[nW - 1];
      const others = last.units.filter((u) => !(u.slot.col === 0 && u.slot.lane === 1))
        .slice(0, Math.max(1, size - 2));
      last.units = [{ ...inst(spec.boss, level + 1, spec.rankBonus), slot: { col: 0, lane: 1 } }, ...others];
    }
    const mult = isBoss ? 2.5 : isElite ? 1.6 : 1;
    const waveUnits = [...new Set(waves.flatMap((w) => w.units.map((u) => u.def.replace(/_elite$/, ''))).filter((d) => UNITS[d]))];
    const sp = spec.shardPool || waveUnits; // m6 drops Rift-recruit shards: they bank until you recruit the unit
    const shardUnit = sp.length ? sp[i % sp.length] : null;
    const rewards = {
      credits: Math.round((80 + 30 * level) * mult),
      xp: Math.round((30 + 10 * level) * (isBoss ? 1.5 : 1)),
      scrap: Math.round((15 + 6 * level) * mult),
    };
    if (shardUnit && !spec.focusOnly) rewards.shards = { [shardUnit]: isBoss ? 8 : isElite ? 4 : (spec.shardsPer || 2) };
    const firstClear = { chips: isBoss ? 60 : isElite ? 25 : 10 };
    // sim-4 focus shards [normal, elite, boss], first clear only (a replay farm of targeted shards would trivialise ranks):
    // they go to your own deployed unit closest to its next rank (game_state focusTarget)
    if (spec.focusShards) firstClear.focusShards = spec.focusShards[isBoss ? 2 : isElite ? 1 : 0];
    if (STORY_CARDS[id]) firstClear.cards = STORY_CARDS[id];
    const unlockSlot = Object.entries(SLOT_UNLOCKS).find(([, lid]) => lid === id);
    if (unlockSlot) firstClear.unlockSlot = +unlockSlot[0];
    if (FEATURE_UNLOCKS[id]) firstClear.unlocks = FEATURE_UNLOCKS[id];
    const power = Math.round(Math.max(...waves.map(wavePower)) * 1.05);
    levels.push({
      id, name: LEVEL_NAMES[id] || `Contract ${spec.id.slice(1)}-${node}`, node, realm: spec.realm,
      x: spec.n > 1 ? 0.06 + 0.88 * t : 0.5, y: 0.5 + 0.18 * Math.sin(i * 1.3 + order),
      power, waves, rewards, firstClear,
      goals: goalsFor(id, node, isBoss, isElite, slotsAt(id), spec.realm),
      goalRewards: {
        1: { chips: isBoss ? 15 : isElite ? 8 : 4, credits: Math.round(rewards.credits * 0.5) },
        2: { chips: isBoss ? 20 : isElite ? 10 : 6, scrap: rewards.scrap },
      },
      ...(isBoss ? { boss: true, stars: { twoMaxLost: 2 } } : {}),
      ...(isElite ? { elite: true } : {}),
      story: { pre: `${id}_pre`, post: `${id}_post` },
    });
  }
  const n = levels.length;
  const chests = [
    { stars: Math.round(n * 1.5), rewards: { chips: 10 + 10 * order, credits: 800 * order, scrap: 800 * order } },
    { stars: Math.round(n * 2.25), rewards: { chips: 20 + 15 * order, buffs: { overclock_core: 1 + Math.floor(order / 3) } } },
    { stars: n * 3, rewards: { chips: 30 + 20 * order, cards: [CHEST_CARDS[spec.id]] } },
  ];
  return { id: spec.id, name: spec.name, order, realm: spec.realm, blurb: spec.blurb, theme: spec.theme, chapter: order, look: MAP_THEMES[spec.id], backdrop: `assets/maps/${spec.id}.jpg`, levels, chests };
}

// ── star goals (sim story.js evalGoal). Goal 0 = win; goals 1–2 are replay challenges, each earned once.
const CHEST_CARDS = { m1: 'riot', m2: 'barb', m3: 'tarantula', m4: 'meridian', m5: 'specter', m6: 'treant', m7: 'juggernaut', m8: 'seraph' };
const ORDERED_IDS = MAP_SPEC.flatMap((m) => Array.from({ length: m.n }, (_, i) => `${m.id}_l${i + 1}`));
// squad slots the player has when first playing a level (a slot unlocks on the clear of its level)
function slotsAt(id) {
  const i = ORDERED_IDS.indexOf(id);
  let s = 2;
  for (const [slot, lid] of Object.entries(SLOT_UNLOCKS)) if (ORDERED_IDS.indexOf(lid) < i) s = Math.max(s, +slot);
  return s;
}
function goalsFor(id, node, isBoss, isElite, slots, realm) {
  const t = STAR_TIMES[id];
  const time = t && t <= 60 ? { type: 'time', max: t } : { type: 'integrity', min: 0.75 };
  const role = ['tank', 'archer', 'mage'][hash(`${id}:role`) % 3];
  const fac = ['corporate', 'rogue', 'experimental'][hash(`${id}:fac`) % 3];
  const fewer = { type: 'max_units', n: Math.max(1, slots - (slots >= 5 ? 2 : 1)) };
  const win = { type: 'win' }, clean = { type: 'no_losses' };
  if (isBoss) return [win, clean, time];
  if (isElite) return [win, clean, { type: 'integrity', min: 0.6 }];
  switch (node % 5) {
    case 0: return [win, clean, time];
    case 1: return [win, fewer, { type: 'integrity', min: 0.65 }];
    case 2: return slots >= 4 ? [win, { type: 'no_role', role }, clean] : [win, time, { type: 'integrity', min: 0.75 }];
    case 3: return slots >= 5 && realm === 'scifi' ? [win, { type: 'min_faction', faction: fac, n: 3 }, time] : [win, clean, fewer];
    default: return [win, time, fewer];
  }
}

export const LEVEL_NAMES = {
  m1_l1: 'Night Shift', m1_l2: 'Container Rats', m1_l3: 'House Call', m1_l4: 'Crane Job', m1_l5: 'Third Pair of Hands', m1_l6: 'Fish Market Fracas',
  m1_l7: 'Customs Office', m1_l8: 'Krell\'s Collectors', m1_l9: 'Low Tide', m1_l10: 'Dry Dock', m1_l11: 'The Gantry', m1_l12: 'Big Rusty',
  m2_l1: 'Down the Shaft', m2_l2: 'Noodle Row', m2_l3: 'Back-Alley Clinic', m2_l4: 'Pit Night', m2_l5: 'Ledger Collectors', m2_l6: 'Signal Thieves', m2_l7: 'Safehouse',
  m2_l8: 'Neon Tithe', m2_l9: 'Burned Bridges', m2_l10: 'Red Market', m2_l11: 'Who Paid', m2_l12: 'Varro\'s Lieutenants', m2_l13: 'Ledger Tower Lobby', m2_l14: 'Redline',
  m3_l1: 'Wildcard Entry', m3_l2: 'First Broadcast', m3_l3: 'Sponsor Showcase', m3_l7: 'Underdog Story', m3_l10: 'Semifinal Blackout', m3_l13: 'Final Four', m3_l14: 'Corona',
  m4_l1: 'Boarding Pass', m4_l5: 'Pad Nine', m4_l10: 'Cargo Manifest', m4_l15: 'Stormcrow',
  m5_l1: 'Quarantine Line', m5_l5: 'Clean Room', m5_l8: 'The Oracle Waits', m5_l11: 'Glass Garden', m5_l16: 'The Choir',
  m6_l1: 'First Light', m6_l5: 'Knight\'s Bridge', m6_l8: 'Ysolde', m6_l11: 'Labyrinth Gate', m6_l12: 'The Rime Pack', m6_l16: 'Elderbark',
  m7_l1: 'Homecoming', m7_l6: 'Shield Dome', m7_l9: 'Ione\'s Choice', m7_l12: 'Bound Beasts', m7_l18: 'Aurelian',
  m8_l1: 'Upload', m8_l5: 'Root Directory', m8_l10: 'Mags\' Old Code', m8_l14: 'Last Patch', m8_l15: 'Vector Prime',
};

export const MAPS = MAP_SPEC.map((s, i) => buildMap(s, i + 1));
export default MAPS;
