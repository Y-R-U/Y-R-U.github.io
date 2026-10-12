#!/usr/bin/env node
/**
 * Balance for the online modes, in node: n equal bots (the practice ObjectiveBrain) play the
 * real PvpMatch to a result. Reports time to a result, how often it went to time / overtime /
 * a draw, and how wins spread across the seats — at equal skill they should spread evenly.
 *
 *   node tools/modesim.mjs                       all modes at 2, 4 and 8 players, 40 runs each
 *   node tools/modesim.mjs --mode=bandana --n=4 --runs=200
 *   node tools/modesim.mjs --check               the balance gate (fails on a stalemate-prone mode)
 */
const noopCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 } : () => ({ addColorStop() {} })), set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.location = { search: '', hostname: 'node' };
const { PvpMatch, pvpSave, arenaLevel } = await import('../js/net/fight.js');
const { ObjectiveBrain } = await import('../js/net/objective.js');
const { MODES } = await import('../js/net/modes.js');
const { MOVE_SETS } = await import('../js/config.js');
const W = await import('../js/net/wire.js');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const STEP = 1 / 120;
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
const ids = MOVE_SETS.light.map((m) => m.id);

/** One match to a result. Bots all at the same skill with every special. */
export function play(mode, n, skill = 0.6, seed = 1) {
  const saves = Array.from({ length: n }, () => pvpSave(ALL));
  const seats = Array.from({ length: n }, (_, i) => ({ name: `B${i}` }));
  const m = new PvpMatch({ level: { ...arenaLevel(seed, mode) }, saves, you: 0, seats, mode, seed });
  const brains = m.all.map((f, i) => new ObjectiveBrain(f, skill, ids, saves[i]));
  m.begin();
  let t = 0, ot = false, firstScore = null, holds = 0;
  const cap = (MODES[mode].secs + (MODES[mode].overtime || 0) + 10) * 120;
  for (let i = 0; i < cap && !m.over; i++) {
    if (m.phase === W.PHASE.FIGHT) for (const b of brains) b.update(STEP, m);
    m.update(STEP);
    t += STEP;
    if (m.overtime) ot = true;
    if (firstScore === null && m.scores.some((s) => s > 0)) firstScore = t;
    if (m.obj && m.obj.holder >= 0) holds++;
  }
  const v = m.verdict;
  return { over: m.over, winner: v ? v.winner : -2, place: v?.place, secs: t, ot, timeUp: m.timeUp, firstScore, held: holds * STEP / t,
    top: Math.max(...m.scores), nan: m.all.some((f) => !Number.isFinite(f.x)) };
}

function run(mode, n, runs) {
  const wins = new Array(n).fill(0);
  let draws = 0, secs = 0, ot = 0, timeUp = 0, unfinished = 0, nan = 0, held = 0, top = 0;
  for (let r = 0; r < runs; r++) {
    const o = play(mode, n, 0.6, r * 7919 + n);
    if (!o.over) unfinished++;
    if (o.nan) nan++;
    if (o.winner >= 0) wins[o.winner]++; else draws++;
    secs += o.secs; ot += o.ot; timeUp += o.timeUp; held += o.held; top += o.top;
  }
  const exp = runs / n;
  const spread = Math.max(...wins.map((w) => Math.abs(w - exp))) / runs;
  return { mode, n, runs, avgSecs: +(secs / runs).toFixed(1), drawPct: +(100 * draws / runs).toFixed(1), overtimePct: +(100 * ot / runs).toFixed(1),
    timeUpPct: +(100 * timeUp / runs).toFixed(1), unfinished, nan, heldPct: +(100 * held / runs).toFixed(1), avgTop: +(top / runs).toFixed(1),
    seatWins: wins.join('/'), maxSeatSkew: +(100 * spread).toFixed(1) };
}

const modes = args.mode ? [args.mode] : ['lms', 'bandana', 'hill'];
const ns = args.n ? [+args.n] : [2, 4, 8];
const runs = +(args.runs || 40);
let bad = 0;
for (const mode of modes) {
  for (const n of ns) {
    const r = run(mode, n, runs);
    process.stdout.write(JSON.stringify(r) + '\n');
    if (args.check) {
      // No stalemates: everything finishes, few draws, no seat favoured, and a scoring mode scores.
      const fails = [];
      if (r.unfinished || r.nan) fails.push('unfinished/NaN');
      if (r.drawPct > 10) fails.push(`draws ${r.drawPct}%`);
      if (r.maxSeatSkew > Math.max(12, 100 * 2.6 * Math.sqrt((1 / n) * (1 - 1 / n) / runs))) fails.push(`seat skew ${r.maxSeatSkew}%`);
      if (mode !== 'lms' && r.avgTop < 8) fails.push(`nobody scores (top ${r.avgTop}s)`);
      if (r.avgSecs > MODES[mode].secs + 20) fails.push(`too long ${r.avgSecs}s`);
      process.stdout.write(`${fails.length ? 'FAIL' : 'PASS'}  ${mode} x${n}${fails.length ? '  ' + fails.join(', ') : ''}\n`);
      bad += fails.length ? 1 : 0;
    }
  }
}
if (args.check) process.exit(bad ? 1 : 0);
