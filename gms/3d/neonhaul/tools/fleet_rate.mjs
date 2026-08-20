#!/usr/bin/env node
// tools/fleet_rate.mjs — what does a HIRED DRIVER actually earn, in the real game?
//
//   node tools/fleet_rate.mjs --mins=6 [--drivers=2] [--hull=wisp] [--headed]
//
// `tools/sim_s2i.mjs` swept the wage table against `sim_p7a`'s analytic flight model, and that
// model's own header states its limitation: **it prices a leg as distance over cruise speed and
// cannot see a wall.** Every figure it produced is an upper bound. This closes the loop by
// measuring the same quantity — fleet gross per SIM minute — through the running game, where the
// drivers are real `Courier` instances flying real `Flight` models off real boards.
//
// It is the S2-E precedent applied to this phase: `tools/courier_rate.mjs` measured the PLAYER's
// courier at 737.3 CRD/min against the model's 733.3, an optimism ratio of 0.995, and that is the
// only reason the 84-minute debt window is known to be real rather than a harness artefact.
//
// **Everything is measured as a DELTA.** `?fleet=n` winds the company ladder on far enough to
// allow n drivers (the cap is a company tier), so the absolute `gross` starts non-zero and reading
// it as earnings would be reading the fixture. Sim time, never wall time: the headless renderer
// runs the sim slower than the clock.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const MINS = +(args.mins || 6);
const DRIVERS = +(args.drivers || 2);
const HULL = args.hull || 'wisp';
const W = +(args.w || 844), H = +(args.h || 390);
const OUT = resolve(ROOT, args.out || 'shots/_fleet_rate.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const C = await import(resolve(ROOT, 'js/company.js'));

const { S, base, close } = await open({ w: W, h: H, dpr: 1, headed: !!args.headed });
// `--seed=` is a DIFFERENT WORLD, not a different run of the same one. With one driver per grade
// the between-driver spread swamps the grade effect at this sample size, and the only way to tell
// a real ordering from a draw is to ask a second world the same question.
const SEED = args.seed ? `&seed=${args.seed}` : '';
await S('Page.navigate', {
  url: `${base}/index.html?courier=0&nosave=1&story=act2&fleet=${DRIVERS}&tier=4&dpr=1${SEED}`,
});
await waitFor(S, 'window.__ready', 60000);
await settle(S, 60);
// A fat balance so the payroll is never short — this run is measuring what a driver EARNS, and an
// arrears walk-out mid-run would silently turn it into a measurement of a smaller fleet.
await hook(S, 'setCredits', 5000000);

// --grades measures ONE DRIVER OF EACH GRADE IN PARALLEL, in a single session. That matters: four
// sequential runs would each sample a different stretch of the world and a different board history,
// and the grade curve is exactly the thing a between-run difference would forge. The agency list is
// weighted so it cannot be re-rolled into one of each; `hireGrade` synthesises the candidate and
// runs the SHIPPED transaction.
if (args.grades) {
  const ids0 = await evalJSON(S, 'window.__game.ledger().drivers.map(d => d.id)');
  for (const id of ids0) await hook(S, 'releaseDriver', id);
  await hook(S, 'setFleetGross', 200000);          // the cap is a company tier; four needs the top one
  for (let g = 0; g < 4; g++) await hook(S, 'hireGrade', g, HULL, `m${g}`);
  await settle(S, 20);
} else if (HULL !== 'wisp') {
  // A different hull: release and re-hire on it, through the same shipped transaction.
  const ids = await evalJSON(S, 'window.__game.ledger().drivers.map(d => d.id)');
  for (const id of ids) await hook(S, 'releaseDriver', id);
  for (let i = 0; i < DRIVERS; i++) await hook(S, 'hireDriver', i, HULL);
  await settle(S, 20);
}

const roster = await evalJSON(S, `window.__game.ledger().drivers.map(d => ({
  id: d.id, name: d.name, grade: d.grade, gradeName: d.gradeName, craft: d.craft,
  wage: d.wagePerMin, base: d.base, lease: d.lease }))`);
console.log(`fleet rate — ${MINS} wall minutes, ${roster.length} drivers`);
for (const d of roster) {
  console.log(`  ${d.name.padEnd(16)} ${d.gradeName.padEnd(9)} ${d.craft.padEnd(9)} `
    + `wage ${d.wage} = ${d.base} driver + ${d.lease} lease · sim_s2i rates this grade at `
    + `${C.RATED_GROSS[d.grade]} CRD/min gross in a wisp`);
}

const zero = await evalJSON(S, `({ t: __state.t, gross: __state.company.gross, jobs: __state.company.jobs,
  wages: __state.company.wages, fuel: __state.company.fuel,
  per: window.__game.ledger().drivers.map(d => ({ id: d.id, gross: d.gross, jobs: d.jobs, fuel: d.fuel })) })`);

const t0 = Date.now();
const samples = [];
let last = zero;
while (Date.now() - t0 < MINS * 60000) {
  await sleep(10000);
  let s;
  try {
    s = await evalJSON(S, `({ t: __state.t, gross: __state.company.gross, jobs: __state.company.jobs,
      wages: __state.company.wages, fuel: __state.company.fuel, fps: __state.fps,
      per: window.__game.ledger().drivers.map(d => ({ id: d.id, gross: d.gross, jobs: d.jobs, fuel: d.fuel })),
      st: Object.values(__state.company.statuses).map(x => ({ state: x.state, leg: x.leg,
        deliveries: x.deliveries, escapes: x.escapes, stucks: x.stucks, cell: x.cell, towing: x.towing })) })`);
  } catch (e) { console.error('page went away: ' + e.message); break; }
  samples.push(s);
  last = s;
  const mins = (s.t - zero.t) / 60;
  if (samples.length % 3 === 0) {
    console.log(`  sim ${mins.toFixed(1)} min · ${s.jobs - zero.jobs} deliveries · `
      + `+${Math.round(s.gross - zero.gross)} CRD gross · ${((s.gross - zero.gross) / Math.max(0.01, mins)).toFixed(1)} CRD/min · fps ${s.fps}`);
  }
}

const mins = (last.t - zero.t) / 60;
const dGross = last.gross - zero.gross;
const dWages = last.wages - zero.wages;
const dFuel = last.fuel - zero.fuel;
const perDriver = roster.map(d => {
  const a = zero.per.find(p => p.id === d.id) || { gross: 0, jobs: 0, fuel: 0 };
  const b = (last.per || []).find(p => p.id === d.id) || a;
  const gross = (b.gross - a.gross) / Math.max(1e-6, mins);
  const fuel = (b.fuel - a.fuel) / Math.max(1e-6, mins);
  return {
    ...d, jobs: b.jobs - a.jobs,
    measuredGrossPerMin: +gross.toFixed(1),
    ratedGrossPerMin: C.RATED_GROSS[d.grade],
    // The number this whole file exists to produce. >1 means the analytic sweep is OPTIMISTIC
    // about a driver, which is the direction the missing collision geometry predicts.
    optimism: +(C.RATED_GROSS[d.grade] / Math.max(1e-6, gross)).toFixed(3),
    measuredNetPerMin: +(gross - fuel - d.wage).toFixed(1),
    fuelPerMin: +fuel.toFixed(1),
  };
});
const ratedTotal = roster.reduce((s, d) => s + C.RATED_GROSS[d.grade], 0);
const wageTotal = roster.reduce((s, d) => s + d.wage, 0);

const report = {
  at: new Date().toISOString(), wallMins: MINS, simMins: +mins.toFixed(2), hull: HULL,
  drivers: roster.length,
  fleetGross: Math.round(dGross), fleetWages: Math.round(dWages), fleetFuel: Math.round(dFuel),
  jobs: last.jobs - zero.jobs,
  grossPerMin: +(dGross / Math.max(1e-6, mins)).toFixed(1),
  wagePerMin: wageTotal,
  netPerMin: +((dGross - dFuel) / Math.max(1e-6, mins) - wageTotal).toFixed(1),
  ratedGrossPerMin: ratedTotal,
  optimismRatio: +(ratedTotal / Math.max(1e-6, dGross / Math.max(1e-6, mins))).toFixed(3),
  perDriver, samples,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log(`\n  ${mins.toFixed(2)} sim min · ${report.jobs} deliveries`);
console.log(`  MEASURED fleet gross  ${report.grossPerMin} CRD/min`);
console.log(`  sim_s2i RATED total   ${report.ratedGrossPerMin} CRD/min  → the analytic model is `
  + `${report.optimismRatio}x optimistic about a driver`);
console.log(`  payroll               ${report.wagePerMin} CRD/min`);
console.log(`  MEASURED net          ${report.netPerMin} CRD/min  ${report.netPerMin > 0 ? '(the fleet pays for itself)' : '(THE FLEET LOSES MONEY)'}`);
for (const d of perDriver) {
  console.log(`    ${d.name.padEnd(16)} ${d.gradeName.padEnd(9)} ${d.jobs} jobs · measured `
    + `${d.measuredGrossPerMin} vs rated ${d.ratedGrossPerMin} (${d.optimism}x) · net ${d.measuredNetPerMin}`);
}
console.log(`\nwrote ${OUT.replace(ROOT + '/', '')}`);
await close();
