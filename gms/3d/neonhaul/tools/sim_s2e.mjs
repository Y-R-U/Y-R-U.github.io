#!/usr/bin/env node
// ⚠ **STALE AS OF §S2-Q, AND KEPT ONLY AS THE RECORD OF HOW THE OLD ARC WAS TUNED.**
//
// This tool swept the 84-MINUTE WINDOW: how long a player should get to bank 50,000 credits before
// the crew arrive. That window is deleted. Act one now ends at the first DOCK at or above
// `Story.SEIZE_AT` (2,500) and act two asks for `Story.SUMMONS` (10,000) — see js/story.js. Nothing
// in any gate's path reads this file and its `docs/s2e_balance.json` describes a rule the game no
// longer has, so do not quote either number at anybody. `tools/courier_rate.mjs` reports the two
// live targets against the measured courier rate; that is the tool this one was replaced by.
// tools/sim_s2e.mjs — S2-E's two balance questions, both swept rather than picked.
//
//   node tools/sim_s2e.mjs                        # both sweeps
//   node tools/sim_s2e.mjs --json=docs/s2e_balance.json
//   node tools/sim_s2e.mjs --seeds=12 --only=debt
//
// The precedent this file exists because of is in js/economy.js's own comment: the plan's
// hand-picked time-limit constants produced a bonus SATURATED ON 100 % of deliveries with an
// overdue rate of 0.000 — an unmissable "bonus" that was really a price. Nothing below is a number
// somebody liked the look of.
//
// ── QUESTION 1 — the debt window ───────────────────────────────────────────
//
// $50,000, no visible clock, and Aaron's requirement: *"a real risk of running out of time"*, with
// the target distribution "a focused player who routes well keeps the car on most runs, a dawdler
// loses it on most, and almost nobody coasts to it". So the deadline is a WINDOW in minutes of
// play, and the sweep asks, for each candidate window, what fraction of each pilot class is
// holding 50,000 CRD when it closes.
//
// The player must HOLD the money, not merely have grossed it — the Boss takes what is in the
// account. So the measured quantity is `bank` (liquid credits) at the mark, not `lifetime`. That
// makes spending a real risk, which is the tension the story wants: every upgrade is a bet that it
// earns back before they come.
//
// ── QUESTION 2 — the hire block ────────────────────────────────────────────
//
// Blocks are 5 minutes (fixed by Aaron). The price is swept against the addendum's target: burn at
// 30–50 % of gross across the early hires, and a reasonably-playing pilot failing to cover a block
// on under ~10 % of blocks. What a hire block is worth is therefore an empirical quantity — what a
// pilot actually grosses in five minutes in that hull, at that point in their career — and the
// only way to get it is to run five-minute windows and look.
//
// The flight model is sim_p7a's analytic one and inherits its stated limitation: it prices a leg as
// distance over cruise speed and cannot see a wall. It is a balance instrument, not a playtest.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCareer, loadWorld } from './sim_p7a.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const E = await import(resolve(ROOT, 'js/economy.js'));

const arg = (k, d) => {
  const h = process.argv.find(a => a.startsWith('--' + k + '='));
  return h === undefined ? d : h.slice(k.length + 3);
};
const SEEDS = +arg('seeds', 10);
const ONLY = arg('only', null);
const DEBT = +arg('debt', 50000);

const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const i = Math.max(0, Math.min(s.length - 1, (s.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1);
};
const pct = (n, d) => (d ? +(100 * n / d).toFixed(1) : 0);

// A seeded rng, so a re-run reproduces. Math.random would make every sweep a different experiment.
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The four pilots. `dawdle` and the 0.72 skill are the EXISTING policies sim_p7a already carries
// (it is what re-derived the time-limit constants), used here unchanged so the two sweeps are
// talking about the same players.
const PILOTS = [
  { id: 'focused', policy: 'chain', skill: 0.95, dwell: 0.85, buy: false,
    who: 'routes well, chains parcels, banks everything' },
  { id: 'normal', policy: 'hop', skill: 0.85, dwell: 1.0, buy: false,
    who: 'takes the nearest job off the pad it landed on' },
  { id: 'casual', policy: 'hop', skill: 0.78, dwell: 1.6, buy: false,
    who: 'plays properly but reads the board, looks around, takes the scenic line' },
  { id: 'invest', policy: 'hop', skill: 0.85, dwell: 1.0, buy: true,
    who: 'the same pilot as `normal`, but spends on upgrades — money that is not in the account' },
  { id: 'dawdle', policy: 'hop', skill: 0.72, dwell: 2.4, buy: false,
    who: 'sightsees; the 0.72-skill 2.4x-dwell pilot sim_p7a already uses' },
];

// ── 1. the debt window ─────────────────────────────────────────────────────

function debtSweep({ craft = 'kestrel', minutes = 150 } = {}) {
  const worlds = new Map();
  const world = s => { if (!worlds.has(s)) worlds.set(s, loadWorld(s)); return worlds.get(s); };
  const runs = [];
  for (const P of PILOTS) {
    for (let k = 0; k < SEEDS; k++) {
      const seed = 0x4e454f4e + k * 7919;
      const rng = mulberry(seed ^ 0x5e2e);
      const r = runCareer({ seed, policy: P.policy, minutes, skill: P.skill, dwell: P.dwell,
        buy: P.buy, world: world(seed), rng, craft });
      // The first moment the account HOLDS the debt. `bank` is liquid credits at the instant of
      // payment, which is the only quantity the Boss can actually take.
      let payAt = null;
      for (const row of r.log) if (row.bank >= DEBT) { payAt = row.t; break; }
      runs.push({ pilot: P.id, seed, payAt, jobs: r.jobs, crdPerMin: r.crdPerMin,
        endBank: r.credits, endLifetime: r.lifetime });
    }
  }

  // For each candidate window, the share of each pilot class holding the debt when it closes.
  const windows = [];
  for (let T = 40; T <= 130; T += 2) {
    const row = { minutes: T, by: {} };
    for (const P of PILOTS) {
      const mine = runs.filter(r => r.pilot === P.id);
      const kept = mine.filter(r => r.payAt !== null && r.payAt <= T).length;
      row.by[P.id] = pct(kept, mine.length);
    }
    windows.push(row);
  }

  const payAt = {};
  for (const P of PILOTS) {
    const mine = runs.filter(r => r.pilot === P.id);
    const got = mine.map(r => r.payAt).filter(v => v !== null);
    payAt[P.id] = { n: mine.length, reached: got.length,
      p10: q(got, 0.1), p50: q(got, 0.5), p90: q(got, 0.9),
      crdPerMin: q(mine.map(r => r.crdPerMin), 0.5) };
  }
  return { craft, minutes, debt: DEBT, seeds: SEEDS, payAt, windows, runs };
}

// The window that best hits the target band. Scored, not eyeballed: distance from the middle of
// each target interval, so the choice is reproducible and a changed target moves it.
function pickWindow(sweep) {
  // The target distribution, straight out of the addendum: a focused pilot keeps the car on most
  // runs, a dawdler loses it on most, and nobody coasts. `casual` is the swing class — it is the
  // one that has to feel like a live risk, so its band straddles a coin flip.
  const TARGET = { focused: [0.70, 1.00], normal: [0.55, 0.95], casual: [0.25, 0.65], dawdle: [0.00, 0.30] };
  let best = null;
  for (const w of sweep.windows) {
    let score = 0, inBand = true;
    for (const [k, [lo, hi]] of Object.entries(TARGET)) {
      const v = (w.by[k] || 0) / 100;
      const mid = (lo + hi) / 2;
      score += ((v - mid) / Math.max(0.05, hi - lo)) ** 2;
      if (v < lo || v > hi) inBand = false;
    }
    const row = { minutes: w.minutes, score: +score.toFixed(3), inBand, by: w.by };
    if (!best || (row.inBand && !best.inBand) || (row.inBand === best.inBand && row.score < best.score)) best = row;
  }
  return best;
}

// ── 2. the hire block ──────────────────────────────────────────────────────
//
// A hire block is five minutes. What matters is what the pilot GROSSES inside one, in the hull
// they are hiring, at the point in the career they are hiring it — so this walks a career's
// delivery log with a five-minute sliding window and reports the distribution of window gross.
// It does NOT divide a career total by its length: the first five minutes of a career (empty hold,
// walking to the first board) is the block that decides whether the loop is survivable, and an
// average over ninety minutes hides it completely.

function blockSweep({ craft = 'wisp', minutes = 30, block = 5 } = {}) {
  const worlds = new Map();
  const world = s => { if (!worlds.has(s)) worlds.set(s, loadWorld(s)); return worlds.get(s); };
  const out = {};
  for (const P of PILOTS.filter(p => p.id !== 'invest')) {
    const blocks = [], first = [];
    for (let k = 0; k < SEEDS; k++) {
      const seed = 0x4e454f4e + k * 7919;
      const rng = mulberry(seed ^ 0xb10c);
      const r = runCareer({ seed, policy: P.policy, minutes, skill: P.skill, dwell: P.dwell,
        buy: false, world: world(seed), rng, craft });
      // Non-overlapping windows: the loop is "hire a block, work it, hire the next", so the blocks
      // a player actually experiences are consecutive and disjoint.
      for (let b = 0; b * block < minutes; b++) {
        const lo = b * block, hi = lo + block;
        const gross = r.log.filter(x => x.t > lo && x.t <= hi).reduce((s, x) => s + x.credits, 0);
        blocks.push(gross);
        if (b === 0) first.push(gross);
      }
    }
    out[P.id] = { n: blocks.length, blocks, first,
      grossP10: q(blocks, 0.1), grossP50: q(blocks, 0.5), grossP90: q(blocks, 0.9),
      firstP50: q(first, 0.5), firstP10: q(first, 0.1) };
  }
  return { craft, block, minutes, byPilot: out };
}

// Price the block. For each candidate, the burn share against the MEDIAN block and the share of
// blocks a pilot fails to cover — the two numbers the addendum's target is written in.
function priceSweep(bs) {
  const rows = [];
  for (let price = 200; price <= 2400; price += 25) {
    const row = { price, by: {} };
    for (const [pilot, d] of Object.entries(bs.byPilot)) {
      const uncovered = d.blocks.filter(g => g < price).length;
      row.by[pilot] = { burnAtP50: +(price / Math.max(1, d.grossP50)).toFixed(3),
        uncovered: pct(uncovered, d.blocks.length) };
    }
    rows.push(row);
  }
  // The band: burn 30-50 % of the NORMAL pilot's median block, and under 10 % of `normal`'s blocks
  // uncovered. `dawdle` is allowed to fail more often — that is the loop having teeth.
  const inBand = rows.filter(r => r.by.normal.burnAtP50 >= 0.30 && r.by.normal.burnAtP50 <= 0.50
    && r.by.normal.uncovered < 10);
  const pick = inBand.length
    ? inBand.reduce((a, b) => (Math.abs(a.by.normal.burnAtP50 - 0.40) <= Math.abs(b.by.normal.burnAtP50 - 0.40) ? a : b))
    : null;
  return { rows, pick };
}

// ── report ─────────────────────────────────────────────────────────────────

const t0 = Date.now();
const report = { at: new Date().toISOString(), seeds: SEEDS, debt: DEBT };

if (ONLY !== 'hire') {
  // The borrowed hull is `kestrel` or `nocturne` — above the player's licence tier. Both are run,
  // because which one ships changes the window and "we measured one and shipped the other" is the
  // shape of half this project's logged mistakes.
  for (const craft of ['kestrel', 'nocturne']) {
    const s = debtSweep({ craft });
    report[`debt_${craft}`] = { payAt: s.payAt, windows: s.windows, pick: pickWindow(s) };
    console.log(`\n── DEBT ${DEBT} — borrowed ${craft.toUpperCase()}, ${SEEDS} seeds x ${PILOTS.length} pilots ──`);
    console.log('pilot     CRD/min  reached  payAt p10/p50/p90 (min)');
    for (const P of PILOTS) {
      const d = s.payAt[P.id];
      console.log(`${P.id.padEnd(9)} ${String(d.crdPerMin).padStart(7)}  ${String(d.reached + '/' + d.n).padStart(7)}  `
        + `${String(d.p10).padStart(5)} ${String(d.p50).padStart(5)} ${String(d.p90).padStart(5)}`);
    }
    console.log('\nwindow  focused  normal  casual  invest  dawdle   (% still holding the car)');
    for (const w of s.windows) {
      if (w.minutes % 4) continue;
      console.log(`${String(w.minutes).padStart(5)}m  ${String(w.by.focused).padStart(7)} `
        + `${String(w.by.normal).padStart(7)} ${String(w.by.invest).padStart(7)} ${String(w.by.dawdle).padStart(7)}`);
    }
    const p = report[`debt_${craft}`].pick;
    console.log(`\nPICK ${p.minutes} min  (score ${p.score}, in band ${p.inBand})  `
      + `focused ${p.by.focused} / normal ${p.by.normal} / casual ${p.by.casual} / dawdle ${p.by.dawdle}`);
  }
}

if (ONLY !== 'debt') {
  // The hire fleet's base hull. `wisp` is the free tier-1 starter and the natural clunker: it is
  // what a player who has just lost everything can be handed for the price of a block.
  const bs = blockSweep({ craft: 'wisp' });
  const ps = priceSweep(bs);
  report.hire = { block: bs.block, craft: bs.craft,
    byPilot: Object.fromEntries(Object.entries(bs.byPilot).map(([k, v]) =>
      [k, { n: v.n, grossP10: v.grossP10, grossP50: v.grossP50, grossP90: v.grossP90,
        firstP10: v.firstP10, firstP50: v.firstP50 }])),
    rows: ps.rows, pick: ps.pick };
  console.log(`\n── HIRE — ${bs.block} min blocks in a ${bs.craft.toUpperCase()} ──`);
  console.log('pilot     block gross p10/p50/p90    first block p10/p50');
  for (const [k, v] of Object.entries(bs.byPilot)) {
    console.log(`${k.padEnd(9)} ${String(v.grossP10).padStart(7)} ${String(v.grossP50).padStart(7)} `
      + `${String(v.grossP90).padStart(7)}    ${String(v.firstP10).padStart(7)} ${String(v.firstP50).padStart(7)}`);
  }
  console.log('\nprice   burn@p50(normal)  uncovered% normal / dawdle');
  for (const r of ps.rows) {
    if (r.price % 200) continue;
    console.log(`${String(r.price).padStart(5)}   ${String(r.by.normal.burnAtP50).padStart(16)}  `
      + `${String(r.by.normal.uncovered).padStart(6)} / ${String(r.by.dawdle.uncovered).padStart(6)}`);
  }
  console.log(ps.pick ? `\nPICK ${ps.pick.price} CRD / ${bs.block} min  `
    + `(burn ${(ps.pick.by.normal.burnAtP50 * 100).toFixed(1)} % of the normal pilot's median block, `
    + `${ps.pick.by.normal.uncovered} % uncovered)`
    : '\nNO PRICE in the target band — widen the sweep or revisit the target.');
}

report.ms = Date.now() - t0;
const jsonPath = arg('json', null);
if (jsonPath) {
  const out = resolve(ROOT, jsonPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`\nwrote ${jsonPath}`);
}
