#!/usr/bin/env node
// tools/sim_s2i.mjs — S2-I's three balance questions, swept rather than picked.
//
//   node tools/sim_s2i.mjs                          # all three
//   node tools/sim_s2i.mjs --seeds=6 --mins=30
//   node tools/sim_s2i.mjs --only=pair --json=docs/s2i_balance.json
//
// The precedent this file exists because of is in `js/economy.js`'s own comment: the plan's
// hand-picked time-limit constants produced a bonus SATURATED ON 100 % of deliveries with an
// overdue rate of 0.000 — an unmissable "bonus" that was really a price. Nothing in
// `js/company.js` is a number somebody liked the look of.
//
// ── QUESTION 1 — does a hire actually earn anything ────────────────────────
//
// A driver is a `Courier` with its throttle capped at `lanes.AUTO_LEVELS[n].speed`, so the analytic
// stand-in is `sim_p7a.runCareer` with `skill` set to that same fraction and `dwell` set to the
// grade's board-reading time. Every (grade x hull) pairing is flown for `--mins` minutes on each of
// `--seeds` worlds, and the wage table in `js/company.js` is subtracted from what came back.
//
// ── QUESTION 2 — can a hire LOSE money ─────────────────────────────────────
//
// The brief's one design rule: *"Wages paid automatically must be able to hurt. A driver who
// always nets positive is a button that prints money, not a decision."* So this counts the
// pairings that lose, and reports the worst and the best. A sweep in which everything is
// profitable is a FAILED sweep, and the exit code says so.
//
// ── QUESTION 3 — where do the company tiers sit ────────────────────────────
//
// `COMPANY_TIERS` gates the driver cap and opens `js/ranks.js`'s two reserved courier rungs. The
// thresholds are solved against fleet-minutes at each cap, so a tier is roughly an hour of a
// full fleet away from the last rather than a number that looked round.
//
// ── THE CALIBRATION, AND WHY IT IS ONE NUMBER AND NOT FOUR ─────────────────
//
// The flight model is `sim_p7a`'s analytic one and inherits its stated limitation: it prices a leg
// as distance over cruise speed and CANNOT SEE A WALL. So it is an upper bound, and the only way
// to know by how much is to measure the same quantity in the running game —
// `tools/fleet_rate.mjs`, which is this phase's `tools/courier_rate.mjs`.
//
// Measured, one driver of each grade flown in parallel for 9 sim minutes in `wisp` hulls, in TWO
// different worlds (`docs/s2i_fleet_rate.json` and `_b.json`, 77 deliveries between them):
//
//     world 0x4e454f4e   1,457.7 CRD/min measured   against 1,848 modelled  → model 1.27x optimistic
//     world 987654321    2,175.7 CRD/min measured   against 1,848 modelled  → model 0.85x optimistic
//     POOLED             1,816.7 CRD/min            against 1,848 modelled  → **model 1.017x optimistic**
//
// **The first world alone was run first, and CALIBRATION was briefly set to 1/1.268 on the strength
// of it. That was a fitted number and the second world is what caught it**: the between-world
// spread is 1.5x, larger than the correction it was being asked to justify. Pooled, the analytic
// model is within 2 % of the running game — which is the same place S2-E's `courier_rate.mjs` left
// the player's own courier (0.995). So the calibration is 1.0 BECAUSE IT WAS MEASURED, not because
// nobody looked, and this constant exists so the next person can see that.
//
// **The per-grade ratios are NOT used and must not be.** Pooled they are 1.18 / 0.67 / 0.84 / 1.59 —
// with 5 to 15 deliveries per driver the between-driver spread swamps the grade effect they would
// be describing. The aggregate is the only statistic those runs support, because it pools all 77.
// One thing in them IS worth flagging rather than banking: the ACE under-earned the SEASONED in
// BOTH worlds. Two of two is not evidence, but it is not nothing either — see docs/S2I_NOTES.md.
//
// The sweep below keeps its own statistical power: 24 pairings x 6 worlds x 30 minutes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCareer, loadWorld } from './sim_p7a.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const E = await import(resolve(ROOT, 'js/economy.js'));
const C = await import(resolve(ROOT, 'js/company.js'));

const arg = (k, d) => {
  const h = process.argv.find(a => a.startsWith('--' + k + '='));
  return h === undefined ? d : h.slice(k.length + 3);
};
const SEEDS = +arg('seeds', 6);
const MINS = +arg('mins', 30);
const ONLY = arg('only', null);
const JSON_OUT = arg('json', 'docs/s2i_balance.json');

// Measured in the running game. See the header. Applied to `runCareer`'s gross and to nothing else
// — fuel is a function of TIME, not of gross, so scaling it too would double-count.
export const CALIBRATION = 1.0;

const HULLS = Object.keys(E.CRAFT);
const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const i = Math.max(0, Math.min(s.length - 1, (s.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1);
};

const seeds = [];
const worlds = new Map();
for (let i = 0; i < SEEDS; i++) { const s = 0x4e454f4e + i * 977; seeds.push(s); worlds.set(s, loadWorld(s)); }
console.log(`sim_s2i — ${SEEDS} worlds x ${MINS} min, ${C.GRADES.length} grades x ${HULLS.length} hulls`);
console.log(`analytic gross scaled by ${CALIBRATION.toFixed(4)} — MEASURED against the running game over `
  + `two worlds and 77 deliveries (1,816.7 vs 1,848 modelled). See the header\n`);

// ── 1 + 2. the pairing table ───────────────────────────────────────────────
//
// `policy: 'chain'` because a hired driver holding two parcels for the same trip is the behaviour
// `fleet.js`'s decision layer actually implements (it takes every job on the pad it can carry),
// and measuring `hop` would understate every multi-slot hull.
function pairSweep() {
  const rows = [];
  for (const g of C.GRADES) {
    for (const hull of HULLS) {
      const runs = seeds.map(s => runCareer({
        seed: s, policy: 'chain', minutes: MINS,
        skill: C.gradeSpeed(g.g), dwell: g.dwell,
        world: worlds.get(s), craft: hull,
      }));
      const gross = runs.map(r => r.crdPerMin * CALIBRATION);
      const fuel = runs.map(r => r.fuelSpent / Math.max(1e-6, r.minutes));
      const wage = C.wageOf({ grade: g.g, craft: hull });
      // NET IS COMPUTED FROM THE CALIBRATED GROSS, not from `r.crdPerMin`. The first version of
      // this line subtracted the wage from the RAW model output while the gross column beside it
      // printed the calibrated one — so the table showed a 30 % margin in one column and a 57 %
      // margin in the next, and the solver and the checks disagreed about the same pairing. A
      // derived quantity taken from the uncorrected source is this project's failure mode exactly.
      const net = gross.map((v, i) => v - fuel[i] - wage.total);
      rows.push({
        grade: g.g, gradeName: g.name, hull,
        cruise: cruiseOf(hull),
        grossP10: q(gross, 0.1), grossP50: q(gross, 0.5), grossP90: q(gross, 0.9),
        fuelPerMin: q(fuel, 0.5),
        base: wage.base, lease: wage.lease, wage: wage.total,
        netP10: q(net, 0.1), netP50: q(net, 0.5), netP90: q(net, 0.9),
        marginP50: +(q(net, 0.5) / Math.max(1, q(gross, 0.5))).toFixed(3),
        loses: q(net, 0.5) < 0,
        losesEverySeed: net.every(v => v < 0),
        signing: C.signingFee(g.g, hull),
        // How long the signing fee takes to earn back at the median net. Infinity when it never
        // does, which is the honest answer for a losing pairing.
        paybackMin: q(net, 0.5) > 0 ? +(C.signingFee(g.g, hull) / q(net, 0.5)).toFixed(1) : null,
        jobs: Math.round(runs.reduce((s, r) => s + r.jobs, 0) / runs.length),
        idleRate: +(runs.reduce((s, r) => s + r.idleRate, 0) / runs.length).toFixed(4),
      });
    }
  }
  return rows;
}
// CRAFT_SPEED without importing config.js's whole surface into the report.
function cruiseOf(hull) {
  const SP = { wisp: 62, kestrel: 66, lance: 84, drayman: 54, nocturne: 72, mammoth: 46 };
  return SP[hull];
}

// ── 3. the company ladder ──────────────────────────────────────────────────
//
// How many minutes of FLEET time each threshold is, at the cap that tier allows. The question the
// thresholds have to answer is "is the next rung about an hour away", and the only honest way to
// ask it is to divide the threshold by what a fleet of that size actually grosses.
function ladderSweep(pairs) {
  // The pairing a reasonable player would put a driver on: the best MEDIAN net for that grade.
  const bestFor = g => pairs.filter(p => p.grade === g).sort((a, b) => b.netP50 - a.netP50)[0];
  const out = [];
  let prev = 0;
  for (const t of C.COMPANY_TIERS) {
    const cap = t.cap;
    // A fleet at this cap: `cap` drivers, on the best pairing available at grade 1 (STEADY is the
    // grade the pool produces most often — see `candidates()`'s weighting).
    const b = bestFor(1);
    const fleetGross = b.grossP50 * cap;
    const nx = C.nextCompanyTier(t.gross);
    out.push({
      tier: t.tier, name: t.name, gross: t.gross, cap, opens: t.opens,
      fleetGrossPerMin: Math.round(fleetGross),
      minutesFromPrevious: nx ? null : null,
      minutesToNext: nx ? +((nx.gross - t.gross) / Math.max(1, fleetGross)).toFixed(1) : null,
      pairing: `${b.gradeName} in a ${b.hull}`,
    });
    prev = t.gross;
  }
  void prev;
  return out;
}

const report = { at: new Date().toISOString(), seeds: SEEDS, minutes: MINS, hulls: HULLS,
  calibration: +CALIBRATION.toFixed(4),
  leaseFrac: C.LEASE_FRAC, signingMinutes: C.SIGNING_MINUTES, arrearsMinutes: C.ARREARS_MINUTES,
  grades: C.GRADES.map(g => ({ ...g, speed: C.gradeSpeed(g.g) })) };

let pairs = null;
if (!ONLY || ONLY === 'pair') {
  pairs = pairSweep();
  report.pairs = pairs;
  console.log('grade     hull       cruise  gross p50   fuel   base  lease   wage    net p10/p50/p90   margin  payback');
  for (const r of pairs) {
    console.log(`${r.gradeName.padEnd(9)} ${r.hull.padEnd(9)} ${String(r.cruise).padStart(5)}`
      + `${String(r.grossP50).padStart(11)}${String(r.fuelPerMin).padStart(7)}`
      + `${String(r.base).padStart(7)}${String(r.lease).padStart(7)}${String(r.wage).padStart(7)}`
      + `   ${String(r.netP10).padStart(7)}${String(r.netP50).padStart(7)}${String(r.netP90).padStart(7)}`
      + `${(r.marginP50 * 100).toFixed(0).padStart(8)}%${(r.paybackMin === null ? '   never' : String(r.paybackMin).padStart(8))}`
      + (r.loses ? '   LOSES' : ''));
  }
  const losing = pairs.filter(p => p.loses);
  const winning = pairs.filter(p => !p.loses);
  const perGrade = C.GRADES.map(g => {
    const rows = pairs.filter(p => p.grade === g.g);
    const best = rows.slice().sort((a, b) => b.netP50 - a.netP50)[0];
    const worst = rows.slice().sort((a, b) => a.netP50 - b.netP50)[0];
    return { grade: g.g, name: g.name, best: best.hull, bestNet: best.netP50,
      bestMargin: best.marginP50, worst: worst.hull, worstNet: worst.netP50,
      anyProfitable: rows.some(r => !r.loses), losing: rows.filter(r => r.loses).length, of: rows.length };
  });
  report.perGrade = perGrade;
  report.summary = {
    pairings: pairs.length,
    losing: losing.length, losingShare: +(losing.length / pairs.length).toFixed(3),
    worst: losing.length ? losing.slice().sort((a, b) => a.netP50 - b.netP50)[0] : null,
    best: winning.length ? winning.slice().sort((a, b) => b.netP50 - a.netP50)[0] : null,
  };
  console.log('\nper grade — the best hull, the worst hull, and whether any hull works at all');
  for (const p of perGrade) {
    console.log(`  ${p.name.padEnd(9)} best ${p.best.padEnd(9)} ${String(p.bestNet).padStart(7)} CRD/min `
      + `(${(p.bestMargin * 100).toFixed(0)}% margin) · worst ${p.worst.padEnd(9)} ${String(p.worstNet).padStart(8)}`
      + ` · ${p.losing}/${p.of} hulls lose money`);
  }
  console.log(`\n  ${losing.length}/${pairs.length} pairings lose money at the median seed `
    + `(${(100 * losing.length / pairs.length).toFixed(0)} %)`);
  if (report.summary.worst) {
    console.log(`  worst: ${report.summary.worst.gradeName} in a ${report.summary.worst.hull} — `
      + `${report.summary.worst.netP50} CRD/min`);
  }
  if (report.summary.best) {
    console.log(`  best:  ${report.summary.best.gradeName} in a ${report.summary.best.hull} — `
      + `+${report.summary.best.netP50} CRD/min, signing fee back in ${report.summary.best.paybackMin} min`);
  }
}

if ((!ONLY || ONLY === 'ladder') && pairs) {
  report.ladder = ladderSweep(pairs);
  console.log('\ncompany tiers — how long the next rung is at this cap');
  for (const r of report.ladder) {
    console.log(`  ${String(r.tier)}  ${r.name.padEnd(15)} at ${String(r.gross).padStart(7)} fleet gross · cap ${r.cap}`
      + ` · ${String(r.fleetGrossPerMin).padStart(5)} CRD/min of fleet (${r.pairing})`
      + (r.minutesToNext === null ? ' · top rung' : ` · next rung ${r.minutesToNext} min away`)
      + (r.opens ? ` · opens ${r.opens}` : ''));
  }
}

// ── the wage SOLVER ────────────────────────────────────────────────────────
//
// `--solve` re-derives GRADES[].wage instead of asserting the shipped ones. It exists because the
// first draft of this table was hand-picked and the calibration then moved every number under it:
// the same wages that gave a 34 % best margin against the raw model gave 65 % against the measured
// one. A constant that has to be re-picked whenever a measurement lands is a constant nobody can
// keep honest.
//
// What it solves for, per grade: the margin on that grade's BEST pairing. The targets rise with
// the grade, because "a better driver is worth more of what they bring in" is the one property the
// ladder has to have for the hire card's arithmetic to mean anything. Everything else — how many
// pairings lose, how thin the bottom rung is — falls out and is checked below rather than aimed at.
const MARGIN_TARGET = [0.12, 0.18, 0.24, 0.30];

function solve() {
  const out = [];
  for (const g of C.GRADES) {
    // The gross this grade achieves in each hull, calibrated, with its fuel — computed ONCE and
    // then searched over wage, so the search is over a fixed measurement rather than re-flying.
    const rows = HULLS.map(hull => {
      const runs = seeds.map(s => runCareer({
        seed: s, policy: 'chain', minutes: MINS, skill: C.gradeSpeed(g.g), dwell: g.dwell,
        world: worlds.get(s), craft: hull,
      }));
      return {
        hull,
        gross: q(runs.map(r => r.crdPerMin * CALIBRATION), 0.5),
        fuel: q(runs.map(r => r.fuelSpent / Math.max(1e-6, r.minutes)), 0.5),
        lease: C.leasePerMin(hull),
      };
    });
    // Search the wage that puts the best pairing on its target margin. A scan and not an algebraic
    // solve, because `best` is an argmax over hulls and can change hull as the wage moves.
    let bestWage = 0, bestErr = Infinity, bestRow = null;
    for (let w = 0; w <= 1200; w += 5) {
      const nets = rows.map(r => ({ ...r, net: r.gross - r.fuel - r.lease - w }));
      const top = nets.slice().sort((a, b) => b.net - a.net)[0];
      const margin = top.net / Math.max(1, top.gross);
      const err = Math.abs(margin - MARGIN_TARGET[g.g]);
      if (err < bestErr) { bestErr = err; bestWage = w; bestRow = top; }
    }
    out.push({ grade: g.g, name: g.name, shipped: g.wage, solved: bestWage,
      onHull: bestRow.hull, margin: +(bestRow.net / bestRow.gross).toFixed(3),
      target: MARGIN_TARGET[g.g] });
  }
  return out;
}

if (arg('solve', null) !== null) {
  const sol = solve();
  console.log('\nWAGE SOLVER — the wage that puts each grade’s BEST pairing on its target margin');
  for (const r of sol) {
    console.log(`  ${r.name.padEnd(9)} shipped ${String(r.shipped).padStart(4)} → solved `
      + `${String(r.solved).padStart(4)} CRD/min  (best pairing ${r.onHull}, margin `
      + `${(r.margin * 100).toFixed(0)} % against a target of ${(r.target * 100).toFixed(0)} %)`);
  }
  console.log('\nPaste these into js/company.js GRADES[].wage and re-run without --solve.');
  process.exit(0);
}

// ── the two assertions this sweep exists to make ───────────────────────────
//
// A sweep that cannot fail is a sweep that measured nothing. These are the design's own
// requirements written as tests over the numbers above, and the exit code is theirs.
const checks = [];
if (pairs) {
  const losing = pairs.filter(p => p.loses).length;
  checks.push({
    name: 'a hire can LOSE money',
    pass: losing > 0,
    detail: `${losing} of ${pairs.length} (grade x hull) pairings have a NEGATIVE median net. `
      + `Zero would mean hiring is a button that prints credits.`,
  });
  checks.push({
    name: 'no grade is a strict trap',
    pass: report.perGrade.every(p => p.anyProfitable),
    detail: report.perGrade.map(p => `${p.name}: ${p.of - p.losing}/${p.of} hulls profitable`).join(' · '),
  });
  checks.push({
    name: 'the best pairing is a business, not a jackpot',
    pass: report.summary.best.marginP50 >= 0.08 && report.summary.best.marginP50 <= 0.45,
    detail: `best margin ${(report.summary.best.marginP50 * 100).toFixed(0)} % of gross `
      + `(${report.summary.best.gradeName} in a ${report.summary.best.hull}) — wanted 8–45 %`,
  });
  // The BEST pairing at the bottom grade, not any pairing. The first version of this check asked
  // whether ANY hull loses at p10 for a GREEN — which is satisfied by putting a green driver in a
  // mammoth, i.e. by a decision nobody makes, and says nothing about the bottom rung being a bet.
  // What matters is whether a bad world can wipe the margin off the hull a player WOULD choose.
  const g0 = pairs.filter(p => p.grade === 0).slice().sort((a, b) => b.netP50 - a.netP50)[0];
  checks.push({
    name: 'the bottom of the ladder is a bet, on the hull a player would actually pick',
    pass: g0.netP10 < 0.55 * g0.netP50,
    detail: `GREEN's best pairing is a ${g0.hull}: net p10 ${g0.netP10} / p50 ${g0.netP50} / p90 ${g0.netP90} `
      + `— a bad world leaves ${(100 * g0.netP10 / Math.max(1, g0.netP50)).toFixed(0)} % of the median margin `
      + `(wanted under 55 %)\n      every GREEN pairing at p10: `
      + pairs.filter(p => p.grade === 0).map(p => `${p.hull} ${p.netP10}`).join(' · '),
  });
}
report.checks = checks;
console.log('');
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);

const out = resolve(ROOT, JSON_OUT);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`\nwrote ${JSON_OUT}`);
process.exit(checks.some(c => !c.pass) ? 1 : 0);
