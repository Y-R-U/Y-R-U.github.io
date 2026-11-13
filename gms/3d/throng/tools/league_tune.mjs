// node tools/league_tune.mjs [--matches=16] [--map=real|stub]
// The league difficulty curve in the real sim: the ?auto=1 bot (opportunist, skill 0.8) as the player against
// sim-online rosters at each league's rating. Target (G4): Bronze ≈ 2.5–3 mean place, rising toward Legend.
import { createSim, SIM_DT } from '../js/sim/sim.js';
import { createBots } from '../js/sim/bots.js';
import { makePlayers } from '../js/sim/match.js';
import { buildRoster } from '../js/meta/roster.js';
import { LEAGUES, botProfile } from '../js/meta/leagues.js';
import { generateMap as stubMap } from './stub_map.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const N = +(args.matches || 16);
let gen = stubMap;
if (args.map !== 'stub') { try { gen = (await import('../js/world/map.js')).generateMap; } catch {} }

export function leagueRow(li, n = N, seed0 = 9000) {
  const rating = LEAGUES[li].min + 20;
  let place = 0, top3 = 0, wins = 0, finalC = 0;
  for (let m = 0; m < n; m++) {
    const seed = seed0 + m * 37;
    const roster = buildRoster({ seed, rating });
    const { players, botIndices, botSpecs } = makePlayers({ seed, allBots: true, roster });
    const sim = createSim({ seed, map: gen(seed), players });
    const bots = createBots({ sim, indices: botIndices, specs: botSpecs, seed });
    const steps = Math.round((sim.state.duration + 3.5) / SIM_DT);
    for (let s = 0; s < steps; s++) { bots.update(); sim.step(); sim.drainEvents(); }
    const me = sim.state.crowds[0];
    place += me.rank; if (me.rank <= 3) top3++; if (me.rank === 1) wins++; finalC += me.count;
  }
  return { league: LEAGUES[li].name, rating, place: place / n, top3: top3 / n, wins: wins / n, count: finalC / n, prof: botProfile(li) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`league     rating  throttle  skill  aggr   mean place  top-3  wins  final count   (${N} matches each, auto bot as player)`);
  const only = args.rows ? String(args.rows).split(",").map(Number) : null;
  for (let li = 0; li < LEAGUES.length; li++) {
    if (only && !only.includes(li)) continue;
    const r = leagueRow(li);
    console.log(`${r.league.padEnd(10)}${String(r.rating).padStart(6)}${r.prof.throttle.toFixed(2).padStart(10)}${r.prof.skill.toFixed(2).padStart(7)}${r.prof.aggr.toFixed(2).padStart(6)}${r.place.toFixed(2).padStart(13)}${(100 * r.top3).toFixed(0).padStart(6)}%${(100 * r.wins).toFixed(0).padStart(5)}%${r.count.toFixed(0).padStart(13)}`);
  }
}
