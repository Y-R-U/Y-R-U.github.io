#!/usr/bin/env node
// tools/sim_s2j.mjs — S2-J's one balance question, swept rather than picked.
//
//   node tools/sim_s2j.mjs                            # the whole sweep
//   node tools/sim_s2j.mjs --seeds=6 --mins=30
//   node tools/sim_s2j.mjs --json=docs/s2j_balance.json
//
// ── THE QUESTION ───────────────────────────────────────────────────────────
//
// The brief's constraint on this phase, in its own words: **"A shady trade must be a real
// trade-off, not a better payout. If the dodgy option simply pays more, nobody will ever run the
// legit side and half the game dies."**
//
// That is a claim about a distribution, so it is measured against one. Six POLICIES are flown
// through the real economy and the real `js/company.js`, on the same worlds, with the same fleet,
// for the same wall of sim minutes, and the only difference between them is which drivers are
// running off the books and when:
//
//   clean      four drivers, everything on the books
//   one_off    one of the four running
//   two_off    two of the four running
//   all_off    all four running, always — the "it just pays more" policy
//   burst      all four running, but only while the charter's exposure is under BURST_CEIL; they go
//              back on the books above it and come back when the file has cooled. A player who is
//              watching the gauge.
//   shell      TWO charters. Three drivers legit on charter A, one running on charter B — which
//              costs a founding fee and starts at SOLE TRADER with a cap of one. Laundering, and
//              the reason `GROUP_MAX` exists.
//
// ── HOW A DELIVERY GETS INTO THIS FILE ─────────────────────────────────────
//
// It is not modelled. `sim_p7a.runCareer` already flies a complete career and returns `log`, one
// row per RECEIPT, with the credits `economy.payout` actually paid and the minute it landed. So a
// driver here is a career's delivery log replayed against a real `company.js` company on a real
// clock — `payWages` every second, `creditDelivery` at every receipt — and every exposure point, bust,
// fine, suspension and wage premium is the shipped code doing it, not an equation about it.
//
// The stated limitation is `sim_p7a`'s and is inherited unchanged: its flight model prices a leg as
// distance over cruise speed and CANNOT SEE A WALL, so the gross is an upper bound. It is the same
// bound on every policy, and the sweep's conclusions are about the DIFFERENCES between policies,
// which is the quantity that bound cancels out of. S2-I's `tools/fleet_rate.mjs` is what checked
// that bound against the running game (pooled 1,816.7 vs 1,848 modelled, ratio 1.017).
//
// ── WHAT MUST HOLD ─────────────────────────────────────────────────────────
//
// Five properties, asserted at the end, and the process EXITS NON-ZERO if any stops holding. They
// are written so that both failure directions are caught: a shady branch nobody would use is as
// broken as one everybody would.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCareer, loadWorld } from './sim_p7a.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const E = await import(resolve(ROOT, 'js/economy.js'));
const C = await import(resolve(ROOT, 'js/company.js'));
const R = await import(resolve(ROOT, 'js/ranks.js'));

const arg = (k, d) => {
  const h = process.argv.find(a => a.startsWith('--' + k + '='));
  return h === undefined ? d : h.slice(k.length + 3);
};
const SEEDS = +arg('seeds', 12);
const MINS = +arg('mins', 90);
const JSON_OUT = arg('json', 'docs/s2j_balance.json');
const VERBOSE = process.argv.includes('--verbose');

// The roster every policy flies. Fixed, because the question is about the BRANCH and a policy
// sweep that also moved the hulls would be measuring two things. `lance` is S2-I's viable hull —
// 14 of 24 pairings lose money and this is one that does not, so the clean arm is a company a
// player would actually be running rather than one that was doomed before the branch opened.
const ROSTER = [
  { grade: 2, craft: 'lance' },
  { grade: 1, craft: 'lance' },
  { grade: 1, craft: 'lance' },
  { grade: 0, craft: 'lance' },
];
// `burst`'s ceiling. Chosen as EXPOSURE.WATCH exactly — the point at which the costs begin — so the
// policy is "run while it is free, stop when it starts costing", which is the obvious thing a
// player reading the gauge would do. It is not tuned to win.
const BURST_CEIL = C.EXPOSURE.WATCH;

const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const i = Math.max(0, Math.min(s.length - 1, (s.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(1);
};
const mean = a => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : 0);

// ── the delivery logs ──────────────────────────────────────────────────────
//
// One career per (seed, roster slot). The slot is folded into the career seed so four drivers in
// one world are four DIFFERENT careers — in the game each `FleetDriver` gets its own `Missions`
// instance for exactly this reason, and four identical logs would make a fleet's earnings four
// copies of one driver's luck rather than four samples of it.
const seeds = [];
for (let i = 0; i < SEEDS; i++) seeds.push(0x4e454f4e + i * 977);
const worldCache = new Map();
function worldFor(s) {
  if (!worldCache.has(s)) worldCache.set(s, loadWorld(s));
  return worldCache.get(s);
}

const logs = new Map();     // `${seed}:${slot}` -> [{ t (seconds), credits }]
function logFor(seed, slot) {
  const key = `${seed}:${slot}`;
  if (logs.has(key)) return logs.get(key);
  const spec = ROSTER[slot];
  const careerSeed = seed + slot * 7919;
  const r = runCareer({
    seed: careerSeed, policy: 'chain', minutes: MINS,
    skill: C.gradeSpeed(spec.grade), dwell: C.gradeOf(spec.grade).dwell,
    world: worldFor(careerSeed), craft: spec.craft,
  });
  const out = r.log.map(l => ({ t: l.t * 60, credits: l.credits }));
  logs.set(key, out);
  return out;
}

// ── one policy, one world ──────────────────────────────────────────────────
//
// The clock is REAL: `payWages` is called every second with the same `dt` and `now` the game passes
// it, so the exposure decay, the arrears path and the suspension expiry are all exercised by the same
// code the frame loop runs. The account is seeded far above the payroll because this arm is
// measuring NET, not solvency — S2-I's A6 already measures what happens when the account is empty.
const STARTING = 5000000;

function runPolicy(policy, seed) {
  const group = C.newGroup({ seed });
  const econ = E.newState({ credits: STARTING });
  C.openBranch(group, 0);

  // Charter A. Founded through the shipped transaction, fee and all — a policy that skipped it
  // would be comparing a company that paid to exist against one that did not.
  const a = C.foundCompany(group, econ, 'ALPHA HAULAGE', 0);
  const coA = a.company;
  // `shell` founds one extra charter and `shell2` two. A shell can never hold more than ONE driver
  // and that is not a rule, it is a consequence: the driver cap is a company tier, company tiers are
  // reached on CHARTER gross, and off-book work does not touch charter gross. A shell therefore
  // stays SOLE TRADER forever. Laundering is capped at one hull per registration, which is why
  // GROUP_MAX matters at all.
  const shells = policy === 'shell' ? 1 : policy === 'shell2' ? 2 : 0;
  const shellCos = [];
  for (let i = 0; i < shells; i++) {
    const b = C.foundCompany(group, econ, `SHELL ${i + 1}`, 0);
    shellCos.push(b.company);
  }
  // The fleet is FIXED at four drivers on a top-tier charter for this experiment, and it is a
  // fixture, said out loud: every arm gets the same fleet so the only thing that varies is which
  // drivers are running. What that fixture cannot see — the charter ladder gating the driver cap,
  // and therefore an off-book charter running a SMALLER fleet all hour — is a different question
  // and it is measured separately in `ladderSweep()` below, from SOLE TRADER, with nothing wound
  // on. Folding the two together produced a table in which one_off, two_off and all_off were
  // byte-identical, because the first off-book hire froze the cap at one and no second driver was
  // ever hired in any of them.
  coA.gross = C.COMPANY_TIERS[C.COMPANY_TIERS.length - 1].gross;

  const offSet = { clean: [], one_off: [0], two_off: [0, 1], all_off: [0, 1, 2, 3],
    burst: [0, 1, 2, 3], shell: [0], shell2: [0, 1] }[policy];
  const drivers = [];
  ROSTER.forEach((spec, slot) => {
    const co = slot < shells ? shellCos[slot] : coA;
    const cand = { id: `d${slot}`, name: `D${slot}`, grade: spec.grade };
    const r = C.hire(co, econ, cand, spec.craft, 0, group);
    if (!r.ok) throw new Error(`hire refused: ${r.why}`);
    r.driver.offBook = offSet.includes(slot);
    drivers.push({ slot, co, rec: r.driver, log: logFor(seed, slot), next: 0, hireAt: 0 });
  });
  // After the hires, so the ladder position this arm reports is what the fleet EARNED and not the
  // fixture. Every charter-gross figure below is therefore a delta from zero.
  coA.gross = 0;

  const horizon = MINS * 60;
  const dt = 1;
  let busts = 0, runsMade = 0, suspendedSeconds = 0, exposureSum = 0, samples = 0;
  let peakExposure = 0, markedAt = null;

  for (let now = dt; now <= horizon; now += dt) {
    for (const co of group.companies) C.payWages(co, econ, dt, now);

    // `burst` is the managed policy: back on the books above the ceiling, off them again once the
    // file has cooled. It reads `co.exposure` — the same number the gauge on the screen shows — so it
    // is a policy a player could actually run and not one with privileged information.
    if (policy === 'burst') {
      for (const d of drivers) d.rec.offBook = (d.co.exposure || 0) < BURST_CEIL;
    }

    for (const d of drivers) {
      while (d.next < d.log.length && d.log[d.next].t + d.hireAt <= now) {
        const row = d.log[d.next++];
        const wasOff = !!d.rec.offBook;
        const res = C.creditDelivery(d.co, econ, d.rec, row.credits, 1, now);
        if (wasOff && res.offBook) {
          runsMade++;
          if (res.busted) busts++;
        }
      }
    }
    for (const co of group.companies) {
      if (C.suspended(co, now)) suspendedSeconds += dt / group.companies.length;
      exposureSum += co.exposure || 0; samples++;
      peakExposure = Math.max(peakExposure, co.exposure || 0);
      if (markedAt === null && (co.exposure || 0) >= C.EXPOSURE.FLAG) markedAt = now;
    }
  }

  const net = econ.credits - STARTING;
  const mins = horizon / 60;
  // Signing fees are a ONE-OFF and are identical across every policy — four hires, same grades,
  // same hulls. Over a short horizon they dominate the net and make every arm look like a loss,
  // which is a statement about the horizon and not about the branch. `opsNet` takes them back out.
  // Founding fees are NOT taken out: `shell` pays a second one and that is a real cost of the
  // policy rather than a constant across the table.
  const signing = group.companies.reduce((s, c) => s + (c.signing || 0), 0);
  const LA = C.ledger(coA, horizon);
  const LS = shellCos.map(c => C.ledger(c, horizon));
  const sum = f => LS.reduce((n, L) => n + f(L), 0);
  return {
    policy, seed,
    net: Math.round(net), netPerMin: +(net / mins).toFixed(1),
    signing: Math.round(signing), opsPerMin: +((net + signing) / mins).toFixed(1),
    // The CHARTER ladder's axis. This is the number the shady branch does not move, and it is the
    // whole reason the trade-off is a trade-off rather than a tax.
    charterGross: C.groupGross(group),
    shadyGross: C.groupShady(group),
    runs: runsMade, busts, bustRate: runsMade ? +(busts / runsMade).toFixed(3) : 0,
    // How big the fleet actually got, which is the compounding term above made visible.
    hired: drivers.length, hiredAt: drivers.map(d => +(d.hireAt / 60).toFixed(1)),
    tierA: C.companyTier(coA.gross).tier,
    fines: LA.shady.fines + sum(L => L.shady.fines),
    lostLegit: LA.shady.lostLegit + sum(L => L.shady.lostLegit),
    wages: LA.wages + sum(L => L.wages),
    founding: group.companies.reduce((n, c) => n + (c.fee || 0), 0),
    suspensions: (coA.suspensions | 0) + shellCos.reduce((n, c) => n + (c.suspensions | 0), 0),
    suspendedFrac: +(suspendedSeconds / horizon).toFixed(3),
    exposureMean: +(exposureSum / Math.max(1, samples)).toFixed(3),
    exposurePeak: +peakExposure.toFixed(3),
    // For `shell` this is the LEGIT charter's file, which is the whole point of the policy.
    exposureA: +(coA.exposure || 0).toFixed(3), exposureAPeak: +(coA.exposurePeak || 0).toFixed(3),
    exposureB: shellCos.length ? +Math.max(...shellCos.map(c => c.exposurePeak || 0)).toFixed(3) : null,
    marked: markedAt !== null,
    shadyRank: R.shadyRank(C.groupShady(group)).name,
  };
}

// ── EXPERIMENT 2 — what the branch costs you on the CHARTER LADDER ─────────
//
// A separate experiment because it answers a separate question, and mixing it into the one above
// destroyed both: with staged hiring, `one_off`, `two_off` and `all_off` came out byte-identical,
// because the first off-book hire froze the driver cap at one and no second driver was ever hired
// in any of the three. A table with three identical rows in it is not a measurement of the thing
// that made them identical.
//
// Here NOTHING is wound on. Every arm starts at SOLE TRADER with a cap of one and the act-two
// starting float, and hires the next driver the moment the shipped `driverCap()` allows one and the
// shipped `signingFee()` is affordable. The quantity being measured is not the net — it is **how
// big a fleet each arm ends the hour with, and which charter tier it reached**, because the driver
// cap is a company tier and company tiers are reached on charter gross that a run does not produce.
//
//   clean       nobody off the books
//   last_off    the most recently hired driver runs; the charter still grows on the others
//   first_off   the FIRST hire runs, from the first minute. The naive "it just pays more" policy,
//               and the interesting thing about it is what it does to the charter.
//   shell       the charter stays clean and a SECOND registration carries one running driver —
//               which is a hull the charter's own cap could not have held.
const LADDER_ROSTER = [
  { grade: 2, craft: 'lance' },
  { grade: 1, craft: 'lance' },
  { grade: 1, craft: 'lance' },
  { grade: 0, craft: 'lance' },
  { grade: 1, craft: 'lance' },        // the shell's driver
];
// What act two actually leaves in the account on the seized branch is 90 CRD plus whatever the
// player has flown since. 20,000 is a player who has been hiring and working for a while — enough
// to register a charter and sign one driver, and not enough to skip the ladder.
const LADDER_START = 20000;

const ladderLogs = new Map();
function ladderLog(seed, slot) {
  const key = `${seed}:L${slot}`;
  if (ladderLogs.has(key)) return ladderLogs.get(key);
  const spec = LADDER_ROSTER[slot];
  const careerSeed = seed + slot * 7919;
  const r = runCareer({
    seed: careerSeed, policy: 'chain', minutes: MINS,
    skill: C.gradeSpeed(spec.grade), dwell: C.gradeOf(spec.grade).dwell,
    world: worldFor(careerSeed), craft: spec.craft,
  });
  const out = r.log.map(l => ({ t: l.t * 60, credits: l.credits }));
  ladderLogs.set(key, out);
  return out;
}

function runLadder(arm, seed) {
  const group = C.newGroup({ seed });
  const econ = E.newState({ credits: LADDER_START });
  C.openBranch(group, 0);
  const a = C.foundCompany(group, econ, 'ALPHA HAULAGE', 0);
  if (!a.ok) throw new Error('charter A refused: ' + a.why);
  const coA = a.company;
  let shell = null;
  const drivers = [];
  const horizon = MINS * 60;
  const dt = 1;
  let founded2 = false;

  for (let now = dt; now <= horizon; now += dt) {
    for (const co of group.companies) C.payWages(co, econ, dt, now);

    // The shell is founded the moment it is affordable, which is the decision a player makes.
    if (arm === 'shell' && !founded2 && econ.credits >= C.foundFee(group) * 2) {
      const b = C.foundCompany(group, econ, 'SHELL 1', now);
      if (b.ok) { shell = b.company; founded2 = true; group.active = 0; }
    }
    // Charter A hires as the cap and the account allow. In `first_off` the very first hire runs.
    const nA = drivers.filter(d => d.co === coA).length;
    if (nA < C.driverCap(coA) && nA < 4 && C.liveDrivers(group) < C.GROUP_LIVE) {
      const spec = LADDER_ROSTER[nA];
      const fee = C.signingFee(spec.grade, spec.craft);
      if (econ.credits >= fee) {
        const r = C.hire(coA, econ, { id: `a${nA}`, name: `A${nA}`, grade: spec.grade },
          spec.craft, now, group);
        if (r.ok) drivers.push({ co: coA, rec: r.driver, log: ladderLog(seed, nA), next: 0, hireAt: now });
      }
    }
    if (shell && !drivers.some(d => d.co === shell) && C.liveDrivers(group) < C.GROUP_LIVE) {
      const spec = LADDER_ROSTER[4];
      const fee = C.signingFee(spec.grade, spec.craft);
      if (econ.credits >= fee) {
        const r = C.hire(shell, econ, { id: 's0', name: 'S0', grade: spec.grade }, spec.craft, now, group);
        if (r.ok) { r.driver.offBook = true; drivers.push({ co: shell, rec: r.driver, log: ladderLog(seed, 4), next: 0, hireAt: now }); }
      }
    }
    // Who is running, re-evaluated each second because `last_off` follows the roster as it grows.
    const onA = drivers.filter(d => d.co === coA);
    onA.forEach((d, i) => {
      d.rec.offBook = arm === 'first_off' ? i === 0
        : arm === 'last_off' ? i === onA.length - 1 && onA.length > 1
          : false;
    });

    for (const d of drivers) {
      while (d.next < d.log.length && d.log[d.next].t + d.hireAt <= now) {
        const row = d.log[d.next++];
        C.creditDelivery(d.co, econ, d.rec, row.credits, 1, now);
      }
    }
  }
  const net = econ.credits - LADDER_START;
  return {
    arm, seed,
    netPerMin: +(net / (horizon / 60)).toFixed(1),
    hired: drivers.length,
    onCharter: drivers.filter(d => d.co === coA).length,
    tier: C.companyTier(coA.gross).tier,
    charterGross: Math.round(coA.gross),
    shadyGross: C.groupShady(group),
    exposureA: +(coA.exposurePeak || 0).toFixed(3),
    companies: group.companies.length,
  };
}

// ── the sweep ──────────────────────────────────────────────────────────────

const POLICIES = ['clean', 'one_off', 'two_off', 'all_off', 'burst', 'shell', 'shell2'];
console.log(`sim_s2j — ${POLICIES.length} policies x ${SEEDS} worlds x ${MINS} min, `
  + `roster ${ROSTER.map(r => C.gradeOf(r.grade).name + '/' + r.craft).join(' ')}`);
console.log(`EXPOSURE.PAY ${C.EXPOSURE.PAY}  PER_RUN ${C.EXPOSURE.PER_RUN}  DECAY ${C.EXPOSURE.DECAY_S}s  `
  + `bust ${C.EXPOSURE.BUST_BASE}+${C.EXPOSURE.BUST_SLOPE}h  fine x${C.EXPOSURE.FINE_MULT}  `
  + `legit floor ${C.EXPOSURE.LEGIT_FLOOR}  wage top ${C.EXPOSURE.WAGE_TOP}\n`);

const table = [];
for (const p of POLICIES) {
  const runs = seeds.map(s => runPolicy(p, s));
  const nets = runs.map(r => r.opsPerMin);
  const fullNets = runs.map(r => r.netPerMin);
  const row = {
    policy: p, n: runs.length,
    // `net*` are the OPERATING figures (signing taken out — see runPolicy). `fullP50` is the whole
    // bill including the hires, printed so the amortisation is visible rather than hidden.
    netP10: q(nets, 0.1), netP50: q(nets, 0.5), netP90: q(nets, 0.9), netMean: mean(nets),
    fullP50: q(fullNets, 0.5), signing: Math.round(mean(runs.map(r => r.signing))),
    charterP50: q(runs.map(r => r.charterGross), 0.5),
    shadyP50: q(runs.map(r => r.shadyGross), 0.5),
    runs: Math.round(mean(runs.map(r => r.runs))),
    bustRate: +mean(runs.map(r => r.bustRate)).toFixed(3),
    fines: Math.round(mean(runs.map(r => r.fines))),
    lostLegit: Math.round(mean(runs.map(r => r.lostLegit))),
    wages: Math.round(mean(runs.map(r => r.wages))),
    founding: Math.round(mean(runs.map(r => r.founding))),
    hired: +mean(runs.map(r => r.hired)).toFixed(2),
    tierA: +mean(runs.map(r => r.tierA)).toFixed(2),
    suspensions: +mean(runs.map(r => r.suspensions)).toFixed(2),
    suspendedFrac: +mean(runs.map(r => r.suspendedFrac)).toFixed(3),
    exposureMean: +mean(runs.map(r => r.exposureMean)).toFixed(3),
    exposurePeak: +mean(runs.map(r => r.exposurePeak)).toFixed(3),
    exposureAPeak: +mean(runs.map(r => r.exposureAPeak)).toFixed(3),
    markedShare: +(runs.filter(r => r.marked).length / runs.length).toFixed(2),
    seeds: VERBOSE ? runs : undefined,
  };
  table.push(row);
  console.log(`${p.padEnd(9)} net/min p10 ${String(row.netP10).padStart(7)}  p50 ${String(row.netP50).padStart(7)}  `
    + `p90 ${String(row.netP90).padStart(7)} | charter ${String(row.charterP50).padStart(7)}  `
    + `shady ${String(row.shadyP50).padStart(7)} | runs ${String(row.runs).padStart(3)}  `
    + `bust ${String(row.bustRate).padStart(5)}  susp ${String(row.suspensions).padStart(5)}  `
    + `exposure ${String(row.exposureMean).padStart(5)}/${String(row.exposurePeak).padStart(5)} | `
    + `hired ${String(row.hired).padStart(4)} tierA ${String(row.tierA).padStart(4)} | `
    + `fines ${String(row.fines).padStart(6)}  lost legit ${String(row.lostLegit).padStart(6)}`);
}

const byPolicy = Object.fromEntries(table.map(r => [r.policy, r]));
const best = table.slice().sort((a, b) => b.netP50 - a.netP50)[0];



// ── the five properties ────────────────────────────────────────────────────
//
// Each is written so it can fail in BOTH directions where that is meaningful. "The shady side is
// not simply better" and "the shady side is worth having at all" are different failures and a
// single check would hide one of them.
const checks = [
  {
    name: 'a pure off-book policy is NOT the best policy',
    // The brief's actual constraint. If `all_off` tops the table the branch is a strictly better
    // payout and the legit half of the game is dead.
    pass: best.policy !== 'all_off',
    detail: `best net/min p50 is ${best.policy} at ${best.netP50}; all_off is ${byPolicy.all_off.netP50}`,
  },
  {
    name: 'the branch is worth having — some off-book policy beats clean',
    // The other direction. A trade-off nobody would ever take is not a trade-off.
    pass: table.some(r => r.policy !== 'clean' && r.netP50 > byPolicy.clean.netP50),
    detail: `clean ${byPolicy.clean.netP50}; beaten by `
      + (table.filter(r => r.policy !== 'clean' && r.netP50 > byPolicy.clean.netP50)
        .map(r => `${r.policy} ${r.netP50}`).join(', ') || 'NOTHING'),
  },
  {
    name: 'off-book gross does not climb the CHARTER ladder',
    // The fifth cost, and the one that is invisible in a net column. `all_off` must be far behind
    // `clean` on the quantity that opens LANE MARSHAL and SPIRE HAULIER.
    pass: byPolicy.all_off.charterP50 < byPolicy.clean.charterP50 * 0.35,
    detail: `charter gross p50 — clean ${byPolicy.clean.charterP50}, all_off ${byPolicy.all_off.charterP50} `
      + `(${(byPolicy.all_off.charterP50 / Math.max(1, byPolicy.clean.charterP50) * 100).toFixed(0)} % of it)`,
  },
  {
    name: 'running everything off the books gets the charter suspended',
    pass: byPolicy.all_off.suspensions >= 1 && byPolicy.clean.suspensions === 0,
    detail: `suspensions per ${MINS} min — all_off ${byPolicy.all_off.suspensions}, `
      + `burst ${byPolicy.burst.suspensions}, clean ${byPolicy.clean.suspensions}`,
  },
  {
    name: 'a shell charter keeps the legit charter cool, and that is what a second company buys',
    // `exposureAPeak` is charter A's file. Under `shell` it must never have been read at all, while
    // the same off-book volume under `one_off` puts a real file on the only charter there is.
    pass: byPolicy.shell.exposureAPeak < C.EXPOSURE.WATCH && byPolicy.one_off.exposureAPeak >= C.EXPOSURE.WATCH,
    detail: `legit charter's PEAK exposure — shell ${byPolicy.shell.exposureAPeak} (WATCH is ${C.EXPOSURE.WATCH}), `
      + `one_off ${byPolicy.one_off.exposureAPeak}. The SAME driver (roster slot 0) is running in both `
      + `arms; the only difference is which charter they are registered to.`,
  },
  {
    name: 'the shell is priced, and what it buys is a legit charter with NOTHING on its file',
    // ── WHY THIS IS NOT A CHECK ON THE NET ──────────────────────────────
    // The first version asserted that the shell's OPERATING net beat `one_off`'s. It does not, and
    // the reason is instructive: at one runner the exposure saving is worth a few per cent while the
    // bust sequence — which is deterministic per charter seed and FEEDS BACK (a bust adds exposure,
    // which raises the next bust's chance) — swings the arm by hundreds of CRD/min. Measured at 8
    // worlds x 60 min the shell's net came out 121 CRD/min BELOW one_off against a p10-p90 spread
    // of 375 on the same arm. That is a difference smaller than its own noise, and this project has
    // twenty-two recorded instances of banking one of those.
    //
    // So the check is the MECHANISM, which has no dice in it at all: under a shell the legit
    // charter's file is empty, so it loses nothing to `legitMult` and its payroll carries no
    // premium — and under `one_off`, running the SAME driver on the SAME charter as the legit
    // three, it loses both.
    pass: byPolicy.shell.lostLegit === 0 && byPolicy.one_off.lostLegit > 0
      && byPolicy.shell.exposureAPeak === 0 && byPolicy.shell.founding > byPolicy.one_off.founding,
    detail: `legit pay lost to exposure — shell ${byPolicy.shell.lostLegit}, one_off ${byPolicy.one_off.lostLegit}\n`
      + `      legit charter's peak file — shell ${byPolicy.shell.exposureAPeak}, one_off ${byPolicy.one_off.exposureAPeak}\n`
      + `      founding fees paid — shell ${byPolicy.shell.founding}, one_off ${byPolicy.one_off.founding}\n`
      + `      NET is deliberately NOT asserted here: shell ${byPolicy.shell.netP50} vs one_off `
      + `${byPolicy.one_off.netP50} against a p10-p90 spread of `
      + `${(byPolicy.shell.netP90 - byPolicy.shell.netP10).toFixed(0)} on the shell arm alone — the `
      + `difference is smaller than its own noise and is reported, not banked`,
  },
  {
    name: 'a shell can never hold more than one driver, and that is a consequence not a rule',
    // The cap is a company tier; company tiers are reached on CHARTER gross; off-book work does not
    // touch charter gross. So a charter that exists to run dirty work stays SOLE TRADER forever.
    // Asserted against the shipped `driverCap` rather than against the sentence above it.
    pass: (() => {
      const co = C.newCompany({ shady: true });
      co.shadyGross = 5000000; co.jobs = 900;
      return C.driverCap(co) === 1;
    })(),
    detail: `a charter with 5,000,000 CRD of OFF-BOOK gross and 900 deliveries on it has `
      + `driverCap ${(() => { const c = C.newCompany({ shady: true }); c.shadyGross = 5000000; return C.driverCap(c); })()} `
      + `— still SOLE TRADER, because ${C.COMPANY_TIERS[1].name} needs ${C.COMPANY_TIERS[1].gross} of `
      + `CHARTER gross and a run does not produce any`,
  },
];

// ── experiment 2 runs here, and adds its own two properties ───────────────
const LADDER_ARMS = ['clean', 'last_off', 'first_off', 'shell'];
const ladder = [];
console.log(`\nEXPERIMENT 2 — from SOLE TRADER with ${LADDER_START} CRD, nothing wound on:`);
for (const arm of LADDER_ARMS) {
  const runs = LADDER_ARMS.length ? seeds.map(sd => runLadder(arm, sd)) : [];
  const row = {
    arm, n: runs.length,
    netP50: q(runs.map(r => r.netPerMin), 0.5),
    hired: +mean(runs.map(r => r.hired)).toFixed(2),
    onCharter: +mean(runs.map(r => r.onCharter)).toFixed(2),
    tier: +mean(runs.map(r => r.tier)).toFixed(2),
    charterP50: q(runs.map(r => r.charterGross), 0.5),
    shadyP50: q(runs.map(r => r.shadyGross), 0.5),
    exposureA: +mean(runs.map(r => r.exposureA)).toFixed(3),
    companies: +mean(runs.map(r => r.companies)).toFixed(2),
  };
  ladder.push(row);
  console.log(`  ${arm.padEnd(10)} net/min ${String(row.netP50).padStart(7)} | drivers hired ${row.hired} `
    + `(${row.onCharter} on the charter) | charter tier ${row.tier} on ${String(row.charterP50).padStart(6)} `
    + `| shady ${String(row.shadyP50).padStart(6)} | legit file ${row.exposureA}`);
}
const byArm = Object.fromEntries(ladder.map(r => [r.arm, r]));
checks.push({
  name: 'running the branch on your ONLY charter costs you the driver cap, and that compounds',
  pass: byArm.first_off.tier < byArm.clean.tier && byArm.first_off.hired < byArm.clean.hired,
  detail: `after ${MINS} min from SOLE TRADER — clean reached charter tier ${byArm.clean.tier} with `
    + `${byArm.clean.hired} drivers hired; first_off reached tier ${byArm.first_off.tier} with `
    + `${byArm.first_off.hired}. The cap is a company tier, company tiers are reached on CHARTER `
    + `gross, and a run produces none — so the naive policy freezes its own fleet.`,
});
checks.push({
  name: 'a shell buys a hull the charter’s own cap could not have carried',
  // The positive reason to own more than one company, stated as a number rather than as a story.
  pass: byArm.shell.hired > byArm.clean.hired && byArm.shell.tier >= byArm.clean.tier
    && byArm.shell.exposureA === 0,
  detail: `shell ends with ${byArm.shell.hired} drivers across ${byArm.shell.companies} charters `
    + `against clean's ${byArm.clean.hired} across ${byArm.clean.companies}; its legit charter still `
    + `reached tier ${byArm.shell.tier} (clean ${byArm.clean.tier}) with a file reading `
    + `${byArm.shell.exposureA}. last_off, which runs the same one driver on the ONE charter, ends at `
    + `tier ${byArm.last_off.tier} with a file of ${byArm.last_off.exposureA}.`,
});

console.log('');
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);

// ── the shady ladder's thresholds ──────────────────────────────────────────
//
// Printed rather than asserted, because the rungs are a PACING decision and the sweep's job is to
// say how long each one takes at a rate the game actually produces. `two_off` is the reference
// policy: a fleet with half its drivers running, which is what a player who has decided to use the
// branch without living on it looks like.
const ref = byPolicy.two_off.shadyP50 / MINS;      // shady CRD per minute
console.log(`\nSHADY LADDER pacing at the two_off rate (${ref.toFixed(0)} off-book CRD/min):`);
const pacing = R.SHADY_TIERS.map((t, i) => {
  const prev = i ? R.SHADY_TIERS[i - 1].at : 0;
  return { rung: t.rung, name: t.name, at: t.at,
    minsTotal: +(t.at / Math.max(1, ref)).toFixed(0),
    minsFromPrev: +((t.at - prev) / Math.max(1, ref)).toFixed(0) };
});
for (const p of pacing) {
  console.log(`  ${String(p.rung).padStart(2)}  ${p.name.padEnd(15)} ${String(p.at).padStart(7)}  `
    + `${String(p.minsTotal).padStart(4)} min total  (+${p.minsFromPrev} from the last)`);
}

mkdirSync(resolve(ROOT, 'docs'), { recursive: true });
writeFileSync(resolve(ROOT, JSON_OUT), JSON.stringify({
  seeds: SEEDS, minutes: MINS, roster: ROSTER, burstCeil: BURST_CEIL,
  exposure: C.EXPOSURE, shadyTiers: R.SHADY_TIERS, foundFee: C.FOUND,
  table, ladder, ladderStart: LADDER_START, checks, pacing, at: new Date().toISOString(),
}, null, 1));
console.log(`\nwrote ${JSON_OUT}`);

const failed = checks.filter(c => !c.pass);
if (failed.length) {
  console.log(`\n${failed.length} of ${checks.length} properties FAILED — this is a test, not a printout.`);
  process.exit(1);
}
console.log(`\nall ${checks.length} properties hold.`);
