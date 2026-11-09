// events4: Battle Royale Cup rivals. Before each round the real AI (js/ai simulateRound, full mode, the
// worker in the browser and inline in node) plays the event's holes for three rivals and records every
// shot; the round then puts all three on each hole at once as GhostSims (js/game/play.js allGhosts,
// js/ai/ghostsim.js) with ball hits forced on. Everything is seeded by the run id and the round number,
// so the same round always brings the same rivals with the same recorded shots (the knocks you cause
// are then deterministic physics; only a knocked rival's live re-plans arrive from the worker in time).
import { stubRound } from '../story/opponents.js';

// a mixed bag of styles (js/ai personalities via the story aliases)
export const ROSTER = [
  { id: 'rex', name: 'Rex Rammer', personality: 'power', colour: '#ff5a3c' },
  { id: 'pia', name: 'Pia Pinball', personality: 'banks', colour: '#ffcf3c' },
  { id: 'gus', name: 'Gus Guard', personality: 'careful', colour: '#5ab4ff' },
  { id: 'lulu', name: 'Lulu Lucky', personality: 'lucky', colour: '#ff7ad0' },
  { id: 'max', name: 'Max Mallet', personality: 'pro', colour: '#9cff6a' },
  { id: 'zip', name: 'Zip Zola', personality: 'fast', colour: '#c89bff' },
];
export const STAGGER = [2.6, 4.6, 6.6];   // s added to each rival's recorded clock so they don't all tee off together

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
function rand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const roundSeed = (ev, roundNo) => hash(`${ev.id}:round${roundNo}`);

// The rivals for round `roundNo` (0-based) of run `ev`: `ev.twist.rivals` golfers from ROSTER, skills in ev.rivals.skill.
export function battleRoster(ev, roundNo) {
  const r = rand(roundSeed(ev, roundNo)), n = Math.min(ROSTER.length, ev.twist?.rivals ?? 3);
  const [lo, hi] = ev.rivals?.skill || [0.3, 0.6];
  const pool = ROSTER.map(g => ({ g, k: r() })).sort((a, b) => a.k - b.k).slice(0, n);
  return pool.map(({ g }) => ({ ...g, skill: Math.min(0.9, +(lo + (hi - lo) * r()).toFixed(3)) }));
}

// → [{ id, name, colour, personality, skill, scores: [strokes], total, shots: [per hole: shot list | null], source }]
// (the shape js/game/play.js wants for `ghosts` + `opponents`). opts.simulate overrides the AI (tests).
export async function battleField(ev, holes, roundNo, { simulate = null } = {}) {
  let sim = simulate;
  if (!sim) { try { sim = (await import('../ai/index.js')).simulateRound; } catch (e) { console.warn('[skyputt] ai unavailable, rivals use the stub', e); } }
  const seed = roundSeed(ev, roundNo), out = [];
  for (const [k, g] of battleRoster(ev, roundNo).entries()) {
    let res = null, source = 'stub';
    if (sim) { try { res = await sim({ holes, golfer: g, seed, mode: 'full', budgetScale: 0.5 }); source = 'ai'; } catch (e) { console.warn('[skyputt] rival round failed, using the stub', e); } }
    if (!res?.scores || res.scores.length !== holes.length) { res = stubRound({ holes, golfer: g, seed }); source = 'stub'; }
    const off = STAGGER[k % STAGGER.length];
    const shots = res.scores.map(s => (s.shots?.length ? s.shots.map(x => ({ ...x, t0: x.t0 + off })) : null));
    const scores = res.scores.map(s => s.strokes);
    out.push({ ...g, scores, total: scores.reduce((a, b) => a + b, 0), shots, source });
  }
  return out;
}
