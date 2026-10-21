// Facade main.js wires: createGame → score economy + career banking. See docs/SCORE.md.
import { createScore } from './score.js';
import { loadCareer } from './career.js';
import { RANKS } from '../../data/ranks.js';

export { createScore, basePP, audacityMult, heatMult, comboMult, partialLoss, partialRestitution, withinGearLimits, resolveMode } from './score.js';
export { loadCareer, careerRankIndex, CAREER_KEY, EMPEROR_MIN_WINS, newerCareer } from './career.js';
export { createCourt, courtStandings } from './court.js';
export { finishZone, difficultyFor, DEFAULT_SPOT, FINISH, DIFFICULTIES } from './finish.js';

// opts: { mode:'free'|'story'|<room type id>, protection?, difficulty?, rankIndex?, aircraft?, playerId?, name?, gender?,
//         career? (loadCareer() instance; omit = load from localStorage; false = no career), outragePerPlayer?, rng? }
export function createGame(opts = {}) {
  const career = opts.career === false ? null : opts.career || loadCareer();
  const followCareer = opts.rankIndex == null;
  const rankIndex = opts.rankIndex ?? career?.rankIndex ?? 0;
  const title = () => { const r = RANKS[score.state().rankIndex]; return opts.gender === 'f' ? r.f : r.m; };
  const score = createScore({ ...opts, rankIndex, title: opts.title || (opts.gender === 'f' ? RANKS[rankIndex].f : RANKS[rankIndex].m) });

  if (career) {
    let sinceBank = { scandals: 0, crashes: 0, infractions: 0 };
    score.on('pp', (e) => { if (e.id && e.id !== 'banter' && e.id !== 'impeccable') sinceBank.infractions++; });
    score.on('scandal', () => sinceBank.scandals++);
    score.on('destroyed', () => sinceBank.crashes++);
    score.on('banked', (e) => {
      career.addPP(e.amount, sinceBank);
      sinceBank = { scandals: 0, crashes: 0, infractions: 0 };
    });
    career.on('rankUp', (r) => {
      if (followCareer) score.setRankIndex(r.to);
      emitOut('rankUp', { ...r, title: opts.gender === 'f' ? r.rank.f : r.rank.m, text: `PROMOTED! ${(opts.gender === 'f' ? r.rank.f : r.rank.m).toUpperCase()}` });
    });
  }

  const extra = {};
  function emitOut(t, p) { for (const fn of extra[t] || []) fn(p); }

  return {
    handleEvent: score.handleEvent,
    reportImpact: score.reportImpact,
    update: score.update,
    bank: score.bank,
    demand: score.demand,
    setPilotRank: score.setPilotRank,
    setRankIndex: score.setRankIndex,
    setAircraft: score.setAircraft,
    setPPScale: score.setPPScale,
    respawn: score.respawn,
    serialize: score.serialize,
    restore: score.restore,
    career,
    title,
    state: () => ({ ...score.state(), lifetimePP: career?.lifetimePP ?? null, careerRankIndex: career?.rankIndex ?? null, nextGoal: career?.nextGoal() ?? null }),
    on(t, fn) {
      if (t === 'rankUp') { (extra[t] ||= []).push(fn); return () => { extra[t] = extra[t].filter((x) => x !== fn); }; }
      return score.on(t, fn);
    },
  };
}
