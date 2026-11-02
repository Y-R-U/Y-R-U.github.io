// Ghost AI public entry. Re-exports the modules and provides simulateRound() for the story
// (js/story/opponents.js → playField).
import { shotSpeed } from '../engine/constants.js';
import { AIGolfer, PERSONALITIES } from './golfers.js';
import { makeRng, hashStr } from './rng.js';
import { createAIClient } from './worker.js';
import { CALIB } from './calib.js';

export * from './golfers.js';
export { Planner, strokesFrom, powerFor, DEFAULT_STYLE } from './planner.js';
export { buildPathField } from './pathfield.js';
export { takeShot, playHoleSync, ballState, ballFrom, GhostRecorder, TRACE_HZ } from './round.js';
export { createAIClient } from './worker.js';
export { makeRng, hashStr } from './rng.js';

// Story personality ids (js/story/data/golfers.js) → ours. Our own ids pass through.
export const PERSONALITY_ALIAS = { careful: 'carl', power: 'bertha', banks: 'banks', lucky: 'lou', pro: 'pro', fast: 'zoe', methodical: 'professor', coach: 'mags' };
export const personalityId = p => (PERSONALITIES[p] ? p : PERSONALITY_ALIAS[p] || 'pro');

let client = null;
export function aiClient() { return client || (client = createAIClient({ worker: true })); }

// A story/tournament golfer ({ id, name, personality, skill }) → AIGolfer with a per-round seed.
export function golferFor(g, seed = 1) {
  return new AIGolfer({ personality: personalityId(g.personality), skill: g.skill ?? 0.5, name: g.name, id: g.id, seed: hashStr(`${seed}:${g.id || g.name || g.personality}`) });
}

// simulateRound({ holes, golfer, seed, mode?, trace?, budgetScale? })
//   holes: hole defs in play order · golfer: { id, name, personality, skill } · seed: int (deterministic)
//   mode: 'full'  = every shot planned and simulated with the real physics in the worker (gives
//                   `shots` for ghost replays; ~0.3–1 s per hole on a mid phone at low skill),
//         'quick' = strokes drawn from the calibrated histograms in calib.js (instant, no shots),
//         'auto'  (default) = full for up to 4 holes (rival matches), quick for longer rounds
//                   (tournament fields). The choice depends only on the inputs, so it is reproducible.
//   → { scores: [{ strokes, picked, shots? }], mode }
//      shots: [{ vx, vz, t0, aim, power, from, to, state, path (Float32Array xyz @ 30 Hz), penalty }]
export async function simulateRound({ holes, golfer, seed = 1, mode = 'auto', trace = true, budgetScale = 0.75 }) {
  const g = golferFor(golfer, seed);
  const m = mode === 'auto' ? (holes.length <= 4 ? 'full' : 'quick') : mode;
  if (m === 'quick') return { mode: 'quick', scores: quickScores(holes, g, seed) };
  const recs = await aiClient().round(holes, g, { trace, budgetScale });
  return {
    mode: 'full',
    scores: recs.map(r => ({
      strokes: r.strokes, picked: r.pickedUp, oob: r.oob, ace: r.ace,
      shots: r.shots.map(s => {
        const sp = shotSpeed(s.power);
        return { vx: Math.sin(s.aim) * sp, vz: -Math.cos(s.aim) * sp, t0: s.t0, aim: s.aim, power: s.power, from: s.from, to: s.to, state: s.state, penalty: s.penalty, path: s.path, hz: s.hz };
      }),
    })),
  };
}

// ---- quick mode: sample strokes from the calibrated per-hole histograms
export function quickScores(holes, golfer, seed = 1) {
  const g = golfer instanceof AIGolfer ? golfer : golferFor(golfer, seed);
  const rng = makeRng(hashStr(`quick:${seed}:${g.id}`));
  return holes.map(def => {
    const max = def.par + 4;
    const s = Math.max(1, Math.min(max, sampleStrokes(def, g.personality, g.skill, rng)));
    return { strokes: s, picked: s >= max };
  });
}

function skillPick(skill, rng) {
  const S = CALIB.skills;
  if (skill <= S[0]) return 0;
  if (skill >= S[S.length - 1]) return S.length - 1;
  let i = 0; while (S[i + 1] < skill) i++;
  const w = (skill - S[i]) / (S[i + 1] - S[i]);
  return rng() < w ? i + 1 : i;
}
function sampleHist(h, rng) {
  const n = h.reduce((a, b) => a + b, 0);
  let u = rng() * n;
  for (let k = 0; k < h.length; k++) { u -= h[k]; if (u < 0) return k; }
  return h.length - 1;
}
const relCache = new Map();
// all calibrated holes pooled, indexed by strokes - par + 3 (for holes the table has not seen)
function relHist(pid, si) {
  const key = pid + si;
  if (relCache.has(key)) return relCache.get(key);
  const h = new Array(8).fill(0);
  for (const [id, byP] of Object.entries(CALIB.holes)) {
    const par = CALIB.pars?.[id] ?? 3, src = (byP[pid] || byP.pro)[si];
    src.forEach((c, k) => { const off = k + 1 - par; h[Math.max(0, Math.min(7, off + 3))] += c; });
  }
  relCache.set(key, h);
  return h;
}
function sampleStrokes(def, pid, skill, rng) {
  const si = skillPick(skill, rng);
  const byP = CALIB.holes[def.id];
  if (byP) return sampleHist((byP[pid] || byP.pro)[si], rng) + 1;
  return def.par + sampleHist(relHist(pid, si), rng) - 3;
}
