#!/usr/bin/env node
/**
 * §4.4.2 P4c (and P2's Z1/Z2), RE-SPECIFIED per D114, and then falsified.
 *
 * D114: the shipped controller scores 10.5-21 reversals/min against a <= 6 bar
 * while `track=sticky` — which is COMPLETELY broken — scores 0.5. A criterion
 * the broken arms win is not measuring the controller. The stated fix is to
 * count only reversals in `cam.zoom` that are NOT explained by a reversal in
 * `cam.zoomTarget` inside a short window. camtrace has recorded the target all
 * along and no criterion has ever read it.
 *
 * THE WINDOW, and why it is not a new constant. A target reversal is allowed to
 * take as long as the controller is permitted to take to follow it. The longest
 * such permission in VIEW_PROFILE is `zoomInDwell` = 0.90 s: on the tightening
 * side the controller must watch the margin hold continuously for that long
 * before it may move at all. So a delivered reversal is EXPLAINED if the target
 * reversed within +/- `zoomInDwell` of it. Nothing is invented.
 *
 * Both traces are filtered at `zoomDeadband` (0.02) before anything is counted,
 * on both sides. An unfiltered target reverses on tick noise and would explain
 * every delivered reversal, which would make the re-specification vacuous — the
 * exact shape D115 is about. The filtered/unfiltered pair is printed so that is
 * visible rather than assumed.
 *
 *   node tools/p8stability.mjs [--runs 16] [--secs 120]
 */
import { traceDuel, makeView, segment } from './p8engage.mjs';
import { ACE_IDS } from '../js/sim/ai.js';

const DT = 1 / 60;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(arg('--runs', 16));
/** P8b, additive: the arm table was only ever run in portrait. Default unchanged. */
const MODE = arg('--mode', 'portrait');
const ACES = ACE_IDS;

/** Monotonic runs of a trace; a reversal is the boundary between two. */
function runsOf(z, i0, i1) {
  const out = [];
  let dir = 0, start = i0;
  for (let i = i0 + 1; i <= i1; i++) {
    const d = z[i] - z[i - 1];
    if (Math.abs(d) < 1e-12) continue;
    const s = d > 0 ? 1 : -1;
    if (dir === 0) { dir = s; start = i - 1; continue; }
    if (s !== dir) { out.push({ i: i - 1, dir, amp: Math.abs(z[i - 1] - z[start]) }); dir = s; start = i - 1; }
  }
  return out;
}

/** Reversal indices where BOTH adjoining runs moved at least `minAmp`. */
function reversalsOf(z, i0, i1, minAmp) {
  const rs = runsOf(z, i0, i1);
  const idx = [];
  for (let k = 1; k < rs.length; k++)
    if (Math.min(rs[k - 1].amp, rs[k].amp) >= minAmp) idx.push(rs[k].i);
  return idx;
}

/**
 * 3 s sliding windows. Two counts come out, and the difference is the whole
 * re-specification.
 *
 *  osc  — §4.4's literal wording: >= 3 reversals and peak-to-peak > 0.05.
 *  pump — the same window, but ONLY when the delivered zoom's peak-to-peak
 *         EXCEEDS the target's over the same span. A controller that swings
 *         less than its target asked for is following; one that swings more is
 *         pumping. This is D114's "explained by the target" applied to the
 *         quantity that actually discriminates, instead of to the count.
 *
 * `scanned` is reported alongside, because a bare window count is not
 * comparable between traces of different length.
 */
function oscillations(z, tgt, i0, i1, idx) {
  const win = Math.round(3 / DT);
  let worst = 0, count = 0, pump = 0, scanned = 0, worstPump = 0;
  for (let s = i0; s + win <= i1; s += 6) {
    const e = s + win;
    scanned++;
    let lo = Infinity, hi = -Infinity, tlo = Infinity, thi = -Infinity, rev = 0;
    for (let i = s; i < e; i++) {
      if (z[i] < lo) lo = z[i]; if (z[i] > hi) hi = z[i];
      if (tgt[i] < tlo) tlo = tgt[i]; if (tgt[i] > thi) thi = tgt[i];
    }
    for (const r of idx) if (r >= s && r < e) rev++;
    if (rev < 3) continue;
    const amp = hi - lo, tamp = thi - tlo;
    if (amp > worst) worst = amp;
    if (amp > 0.05) {
      count++;
      if (amp > tamp) { pump++; if (amp - tamp > worstPump) worstPump = amp - tamp; }
    }
  }
  return { count, worst, pump, scanned, worstPump };
}

/**
 * The re-specification. Returns per-window counts over one [i0,i1] span.
 * `explained` = a target reversal within +/- windowS of the delivered one.
 */
export function stabilityOf(T, i0, i1, P, windowS) {
  const DB = P.zoomDeadband;
  const zr = reversalsOf(T.zoom, i0, i1, DB);
  const trFilt = reversalsOf(T.target, i0, i1, DB);
  const trRaw = reversalsOf(T.target, i0, i1, 0);
  const w = Math.round(windowS / DT);
  const near = (list, i) => { for (const t of list) if (Math.abs(t - i) <= w) return true; return false; };
  const unexplained = zr.filter((i) => !near(trFilt, i));
  const unexplainedVsRaw = zr.filter((i) => !near(trRaw, i));
  // D114: a reversal PAIR inside 1.2 s is a violation only if the target did
  // not itself reverse inside that pair's span.
  let pairViol = 0;
  for (let k = 1; k < unexplained.length; k++)
    if ((unexplained[k] - unexplained[k - 1]) * DT < 1.2) pairViol++;
  const osc = oscillations(T.zoom, T.target, i0, i1, zr);
  let travelZ = 0, travelT = 0;
  for (let i = i0 + 1; i <= i1; i++) { travelZ += Math.abs(T.zoom[i] - T.zoom[i - 1]); travelT += Math.abs(T.target[i] - T.target[i - 1]); }
  return { ticks: i1 - i0 + 1, revZ: zr.length, revTfilt: trFilt.length, revTraw: trRaw.length,
           unexplained: unexplained.length, unexplainedVsRaw: unexplainedVsRaw.length,
           pairViol, oscCount: osc.count, oscWorst: osc.worst, oscPump: osc.pump,
           oscScanned: osc.scanned, oscWorstPump: osc.worstPump, travelZ, travelT };
}

const ARMS = [
  ['SHIPPED',            { bias: 'normal' }, false],
  ['?slew=symmetric',    { bias: 'normal', slew: 'symmetric' }, false],
  ['?margin=strict',     { bias: 'normal', margin: 'strict' }, false],
  ['?track=sticky',      { bias: 'normal', track: 'sticky' }, false],
  // the same two arms with the driver's clearTracked() removed, which is the
  // only condition under which ?track=sticky does anything at all
  ['noclear + reassert', { bias: 'normal' }, true],
  ['noclear + sticky',   { bias: 'normal', track: 'sticky' }, true],
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const view = makeView(MODE);
  const P = view.profile;
  const WINDOW = P.zoomInDwell;      // 0.90 s — the longest lag the controller is permitted
  console.log(`\nP8 STABILITY — P4c re-specified per D114`);
  console.log(`  ${RUNS} duels, measured INSIDE engagements only, ${MODE} ${view.w}x${view.h}`);
  console.log(`  explanation window = zoomInDwell = ${WINDOW}s ; both traces filtered at zoomDeadband = ${P.zoomDeadband}\n`);
  const head = 'arm                 engMin  revZ/min  UNEXPL/min  pairViol   osc%   PUMP%  pumpAmp  travelZ/T';
  console.log('  ' + head);
  console.log('  ' + '-'.repeat(head.length));
  const rows = [];
  for (const [tag, opts, noClear] of ARMS) {
    const acc = { ticks: 0, revZ: 0, revTfilt: 0, unexplained: 0, pairViol: 0, oscCount: 0, oscWorst: 0,
                  oscPump: 0, oscScanned: 0, oscWorstPump: 0, travelZ: 0, travelT: 0 };
    for (let i = 0; i < RUNS; i++) {
      const T = traceDuel({ ace: ACES[i % ACES.length], seed: 1000 + i, view, camOpts: opts, noClear });
      for (const s of segment(T)) {
        const r = stabilityOf(T, s.i0, s.i1, P, WINDOW);
        for (const k of ['ticks', 'revZ', 'revTfilt', 'unexplained', 'pairViol', 'oscCount', 'oscPump', 'oscScanned', 'travelZ', 'travelT']) acc[k] += r[k];
        acc.oscWorst = Math.max(acc.oscWorst, r.oscWorst);
        acc.oscWorstPump = Math.max(acc.oscWorstPump, r.oscWorstPump);
      }
    }
    const min = acc.ticks * DT / 60;
    const row = { tag, engMin: min, revZ: acc.revZ / min, revT: acc.revTfilt / min,
                  unexpl: acc.unexplained / min, pairViol: acc.pairViol,
                  oscPctv: 100 * acc.oscCount / (acc.oscScanned || 1),
                  pumpPct: 100 * acc.oscPump / (acc.oscScanned || 1),
                  oscWorst: acc.oscWorst, pumpAmp: acc.oscWorstPump,
                  ratio: acc.travelT ? acc.travelZ / acc.travelT : 0 };
    rows.push(row);
    const n = (v, w, d = 2) => v.toFixed(d).padStart(w);
    console.log(`  ${tag.padEnd(20)}${n(min, 6, 1)}${n(row.revZ, 10)}${n(row.unexpl, 12)}${String(row.pairViol).padStart(10)}${n(row.oscPctv, 7)}${n(row.pumpPct, 8)}${n(row.pumpAmp, 9, 3)}${n(row.ratio, 11, 3)}`);
  }
  console.log(`\n  §4.4.2 P4c bars: PASS <= 6 reversals/min, no reversal pair inside 1.2 s,`);
  console.log(`                   no oscillation of amplitude > 0.05 sustained > 3 s. FAIL > 12/min.`);
  const ship = rows[0], sym = rows[1];
  console.log(`\n  DOES THE RE-SPECIFICATION DISCRIMINATE?`);
  console.log(`    old quantity (revZ/min):    SHIPPED ${ship.revZ.toFixed(2)}  vs  symmetric ${sym.revZ.toFixed(2)}  -> ${ship.revZ < sym.revZ ? 'separates' : 'DOES NOT SEPARATE'}`);
  console.log(`    new quantity (UNEXPL/min):  SHIPPED ${ship.unexpl.toFixed(2)}  vs  symmetric ${sym.unexpl.toFixed(2)}  -> ${ship.unexpl <= 6 && sym.unexpl > 6 ? 'SHIPPED green, symmetric RED' : ship.unexpl <= 6 ? 'shipped green but the break-switch stayed GREEN — criterion defect' : 'shipped RED'}`);
  console.log(`    travel ratio zoom/target:   SHIPPED ${ship.ratio.toFixed(3)}  vs  symmetric ${sym.ratio.toFixed(3)}`);
  console.log(`    PUMP% (delivered p-p > target p-p over a 3 s window):`);
  console.log(`                                SHIPPED ${ship.pumpPct.toFixed(2)}%  vs  symmetric ${sym.pumpPct.toFixed(2)}%  -> ${ship.pumpPct === 0 && sym.pumpPct > 0 ? 'SHIPPED GREEN (exactly 0), break-switch RED' : 'does not separate'}`);
}
