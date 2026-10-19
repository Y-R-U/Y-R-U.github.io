// Async arena: generated rival companies near the player's power, Elo-ish ladder.
import { createRng } from './rng.js';
import { squadPower } from './stats.js';
import { autoSlots } from './battle.js';
import { econ, levelCap } from './progression.js';

const PRE = ['Crimson', 'Null', 'Static', 'Iron', 'Neon', 'Vanta', 'Hex', 'Cobalt', 'Ghost', 'Ion', 'Rust', 'Sable', 'Volt', 'Quartz', 'Onyx', 'Tungsten'];
const POST = ['Syndicate', 'Collective', 'Outfit', 'Company', 'Cartel', 'Legion', 'Works', 'Unit', 'Brigade', 'Contractors', 'Dynamics', 'Pact'];

export function arenaTier(data, rating) {
  const tiers = data.arena?.tiers || [{ id: 'bronze', name: 'Bronze', minRating: 0, reward: {} }];
  let t = tiers[0];
  for (const x of tiers) if (rating >= x.minRating) t = x;
  return t;
}

function rankForLevel(E, rarity, level) {
  let r = E.startRank[rarity] ?? 0;
  while (r < 5 && levelCap(E, r) < level) r++;
  return r;
}

// Build a rival squad of `size` units whose squadPower ≈ targetPower.
export function generateRival(data, { targetPower, size, seed, rating = 1000, maxLevel = 60 }) {
  const E = econ(data);
  const rng = createRng(seed);
  const ids = Object.keys(data.units).filter((id) => !data.units[id].noArena);
  const byRole = { tank: [], archer: [], mage: [] };
  for (const id of ids) byRole[data.units[id].role]?.push(id);
  const roles = ['tank', 'archer', 'mage'];
  const picks = [];
  // a plausible comp: at least one tank, then mixed
  const plan = rng.shuffle(['tank', 'archer', 'mage', rng.pick(roles), rng.pick(roles), rng.pick(roles)]).slice(0, size);
  if (size >= 2 && !plan.includes('tank')) plan[0] = 'tank';
  const rarW = rating > 1500 ? { common: 1, rare: 3, epic: 3, legendary: 1 } : rating > 1200 ? { common: 2, rare: 4, epic: 2, legendary: 0.3 } : { common: 5, rare: 3, epic: 0.6, legendary: 0.05 };
  for (const role of plan) {
    const cands = byRole[role].length ? byRole[role] : ids;
    const want = rng.weighted(rarW);
    const pool = cands.filter((id) => data.units[id].rarity === want && !picks.includes(id));
    picks.push(rng.pick(pool.length ? pool : cands.filter((id) => !picks.includes(id)).length ? cands.filter((id) => !picks.includes(id)) : cands));
  }
  const build = (level) => picks.map((id) => {
    const lvl = Math.max(1, Math.min(maxLevel, Math.round(level)));
    const abl = Math.max(1, Math.min(5, Math.floor(lvl / 10) + 1));
    return { def: id, level: lvl, rank: rankForLevel(E, data.units[id].rarity, lvl), abilityLevels: { attack: abl, passive: abl, overdrive: abl } };
  });
  let lo = 1, hi = maxLevel;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (squadPower(data, build(mid)) < targetPower) lo = mid; else hi = mid;
  }
  let units = build(hi);
  // per-unit fine tuning across rank-cap jumps
  for (let guard = 0; guard < 200 && squadPower(data, units) > targetPower * 1.03; guard++) {
    const i = guard % units.length;
    const u = units[i];
    if (u.level <= 1) { if (units.every((x) => x.level <= 1)) break; continue; }
    const lvl = u.level - 1;
    units[i] = { ...u, level: lvl, rank: rankForLevel(E, data.units[u.def].rarity, lvl) };
  }
  // tanks front, others back — then a little seeded shuffle of lanes
  units = autoSlots(data, units);
  return {
    name: `${rng.pick(PRE)} ${rng.pick(POST)}`,
    rating: Math.round(rating + rng.range(-60, 60)),
    power: squadPower(data, units),
    units,
  };
}

export function expectedScore(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
export function updateRating(data, rating, rivalRating, win) {
  const k = data.arena?.k ?? 32;
  return Math.round(rating + k * ((win ? 1 : 0) - expectedScore(rating, rivalRating)));
}
