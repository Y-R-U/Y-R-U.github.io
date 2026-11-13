import { CONFIG } from '../config.js';
import { neighbours } from './ladder.js';
import { leagueOf, botProfile } from './leagues.js';
import { hash32, unit } from './hash.js';
import { botCosmetics } from './shop.js';

// The opponents of one sim-online match: ladder neighbours with skill drawn around their league.
export function buildRoster({ seed, rating, count = 7 }) {
  const rows = neighbours(rating, count, 'roster:' + seed);
  const personas = CONFIG.BOTS.map((b) => b.persona);
  const off = hash32('personas:' + seed);
  const humans = new Set();
  for (let k = 0; humans.size < Math.min(2, count) && k < 50; k++) humans.add(hash32('human:' + seed + ':' + k) % count);
  return rows.map((row, i) => {
    const lg = leagueOf(row.rating);
    const prof = botProfile(lg.index);
    const skill = Math.max(0.15, Math.min(0.97, prof.skill + (unit(seed + ':sk:' + i) * 2 - 1) * prof.spread));
    return {
      name: row.name, flag: row.flag, rank: row.rank, rating: row.rating, league: lg.index,
      persona: personas[(off + i) % personas.length], skill, aggr: prof.aggr, throttle: prof.throttle, human: humans.has(i),
      cos: botCosmetics(row.name + ':' + row.rank, lg.index),
    };
  });
}
