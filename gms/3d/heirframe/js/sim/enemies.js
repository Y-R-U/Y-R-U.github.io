// Enemy creation, pack budgeting (MISSIONS §7) and a few AI helpers the engine can use.
import { ENEMIES, BOSSES, RANKS, ELITE_MODS, PACKS, FACTION_PACKS, FACTION_ELITE } from '../data/enemies.js';
import { SKILLS } from '../data/frames.js';
import { enemyStats, makeCombatant } from './stats.js';
import { killXp } from './economy.js';

// createRobot kinds the robots agent ships in P1; anything else uses def.fallbackKind.
export let SUPPORTED_ROBOT_KINDS = new Set(['rental', 'brawler', 'gunner', 'ghost', 'civ_gold', 'civ_chrome', 'civ_black', 'civ_worker', 'drone_scout', 'security', 'enforcer']);
export function setSupportedRobotKinds(kinds) { SUPPORTED_ROBOT_KINDS = new Set(kinds); }

export function enemyDef(id) {
  const d = ENEMIES[id] || BOSSES[id];
  if (!d) throw new Error('unknown enemy ' + id);
  return d;
}

export const POINT_COST = rank => RANKS[rank]?.pts ?? 1;
export const unitCost = u => POINT_COST(u.rank) * (enemyDef(u.defId).pts || 1);

let counter = 0;
// spawn {defId, rank?, level, eliteMods?, id?, name?, tags?}; threat {hp, dmg} multipliers
export function createEnemy(spawn, { threat, riderLevel } = {}) {
  const def = enemyDef(spawn.defId);
  const rank = spawn.rank || def.rank || 'grunt';
  const rankDef = RANKS[rank];
  const extra = {};
  for (const id of spawn.eliteMods || []) Object.assign(extra, ELITE_MODS.find(m => m.id === id)?.stats);
  const stats = enemyStats(def, spawn.level, rankDef, threat, extra);
  const modNames = (spawn.eliteMods || []).map(id => ELITE_MODS.find(m => m.id === id)?.name).filter(Boolean);
  const c = makeCombatant({
    id: spawn.id || `e${++counter}`,
    name: spawn.name || def.name,
    level: spawn.level, stats, faction: spawn.faction || def.faction, kind: 'enemy', rank,
    tags: [...(def.tags || []), ...(spawn.tags || [])],
    skills: Object.fromEntries(def.skills.map(s => [s, SKILLS[s]])),
  });
  const kind = SUPPORTED_ROBOT_KINDS.has(def.robotKind) || !def.fallbackKind ? def.robotKind : def.fallbackKind;
  Object.assign(c, {
    defId: def.id, title: def.title, robotKind: kind, robotTier: def.robotTier || 0, paint: def.paint || null,
    ai: def.ai, move: def.move ?? 4, flying: !!def.flying, static: !!def.static, nonCombat: !!def.nonCombat,
    size: (def.size || 1) * (rankDef.scale || 1), bossBar: !!rankDef.bossBar, nameColor: rankDef.nameColor || null,
    phases: def.phases || null, summons: def.summons || null, spotHeat: def.spotHeat || 0, frontalDR: def.frontalDR || 0,
    fleeBelow: def.fleeBelow || 0, hackable: !!def.hackable || (def.tags || []).includes('robot'),
    eliteMods: spawn.eliteMods || [], eliteModNames: modNames,
    eliteHooks: (spawn.eliteMods || []).map(id => ELITE_MODS.find(m => m.id === id)?.hook).filter(Boolean),
    xp: Math.round(killXp(spawn.level, rank, riderLevel ?? spawn.level) * Math.sqrt(def.pts || 1)), // sim: tougher unit types pay XP by sqrt(pack cost)
    alerted: false,
  });
  return c;
}

// Engine helper: pick the best ready skill for this distance (m). Returns skill or null.
export function chooseEnemySkill(c, distance) {
  let best = null;
  for (const s of Object.values(c.skills)) {
    if (c.cooldowns[s.id] > 0) continue;
    const reach = s.kind === 'aoe' && !s.range ? (s.radius || 3) : (s.range || 2);
    if (distance > reach + 0.3) continue;
    if (s.kind === 'self' && c.hp > c.stats.hp * 0.8) continue;
    if (!best || (s.base || 0) > (best.base || 0)) best = s;
  }
  return best;
}

// Budget in points (MISSIONS §7).
export function enemyBudget(level, archCombat, gradeCombat) {
  return Math.min(24, 6 + 0.25 * level) * archCombat * gradeCombat;
}

function rollPack(rng, packId, level, vetChance) {
  const pack = PACKS[packId];
  const units = [];
  for (const [defId, lo, hi, minLvl] of pack.units) {
    if (minLvl && level < minLvl) continue;
    const n = rng.int(lo, hi);
    for (let i = 0; i < n; i++) {
      const def = ENEMIES[defId];
      const canVet = !def.nonCombat && (def.pts || 1) <= 2;
      units.push({ defId, rank: canVet && rng.chance(vetChance) ? 'veteran' : 'grunt', level: Math.max(1, level + rng.int(-1, 0)) });
    }
  }
  return units;
}

// Trim a unit list down to fit a point budget (drop the cheapest first so packs keep their heavies).
function fit(units, budget) {
  let cost = units.reduce((a, u) => a + unitCost(u), 0);
  const sorted = units.slice().sort((a, b) => unitCost(a) - unitCost(b));
  while (cost > budget && sorted.length > 1) {
    const u = sorted.shift();
    units.splice(units.indexOf(u), 1);
    cost -= unitCost(u);
  }
  return cost;
}

// Split a budget across placements [{atStep, site, weight?}] into packs.
// opts: {level, faction, districtPacks, budget, danger, grade, elitePack(bool|chance), champion(bool)}
export function buildEnemies(rng, opts) {
  const { level, faction, placements } = opts;
  if (!placements.length || opts.budget <= 0) return [];
  const vetChance = Math.min(0.4, 0.1 + 0.01 * level);
  let pool = (FACTION_PACKS[faction] || FACTION_PACKS.scrap).filter(id => !PACKS[id].minLevel || level >= PACKS[id].minLevel);
  const pref = pool.filter(id => opts.districtPacks?.includes(id));
  if (pref.length) pool = pref;
  const totalW = placements.reduce((a, p) => a + (p.weight || 1), 0);
  const out = [];
  for (const pl of placements) {
    const share = opts.budget * (pl.weight || 1) / totalW;
    if (share < 1.5) continue;
    const packId = rng.pick(pool);
    const units = rollPack(rng, packId, level, vetChance);
    // grow small packs toward the share with more of the pack's first unit
    let cost = units.reduce((a, u) => a + unitCost(u), 0);
    const filler = PACKS[packId].units[0][0];
    while (cost + 1 <= share && units.length < 10) {
      const u = { defId: filler, rank: rng.chance(vetChance) ? 'veteran' : 'grunt', level: Math.max(1, level + rng.int(-1, 0)) };
      units.push(u); cost += unitCost(u);
    }
    cost = fit(units, Math.max(share * 1.25, 2));
    out.push({ pack: packId, faction, atStep: pl.atStep, site: pl.site, budget: Math.round(cost * 10) / 10, units });
  }
  if (opts.elitePack) {
    const pl = placements[placements.length - 1];
    const eliteId = FACTION_ELITE[faction] || 'knuckle';
    const units = [{ defId: eliteId, rank: 'elite', level, eliteMods: rng.sample(ELITE_MODS.map(m => m.id), RANKS.elite.mods) }];
    const extra = rollPack(rng, rng.pick(pool), level, vetChance).slice(0, 3);
    out.push({ pack: 'elite_' + faction, faction, atStep: pl.atStep, site: pl.site, elite: true, units: units.concat(extra), budget: units.concat(extra).reduce((a, u) => a + unitCost(u), 0) });
  }
  return out;
}

export function championUnit(rng, faction, level, defId) {
  return { defId: defId || FACTION_ELITE[faction] || 'chromehead', rank: 'champion', level: level + 1, eliteMods: rng.sample(ELITE_MODS.map(m => m.id), RANKS.champion.mods) };
}

export { ENEMIES, BOSSES, RANKS, ELITE_MODS, PACKS };
