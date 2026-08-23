#!/usr/bin/env node
// tools/courier_rate.mjs — what does a courier ACTUALLY earn, in the real game?
//
//   node tools/courier_rate.mjs --mins=10 [--lite] [--headed]
//
// `tools/sim_s2e.mjs` swept the debt window against `sim_p7a`'s analytic flight model, and that
// model's own header states its limitation: **it prices a leg as distance over cruise speed and
// cannot see a wall.** Every figure it produced is therefore an upper bound on a real pilot, and
// `js/story.js`'s 84-minute window is built on those figures.
//
// This closes the loop by measuring the same quantity — lifetime gross per SIM minute — through
// `?courier=1`, which flies the real flight model, the real collision, the real docking hold and the
// real board. The number it produces is the honest divisor for the window.
//
// Sim time, never wall time: the headless renderer runs the sim slower than the clock and every
// derived rate would be wrong. `__state.t` is the sim's own clock.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const MINS = +(args.mins || 10);
const W = +(args.w || 844), H = +(args.h || 390);
const OUT = resolve(ROOT, args.out || 'shots/_courier_rate.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const Story = await import(resolve(ROOT, 'js/story.js'));

const { S, base, close } = await open({ w: W, h: H, dpr: 1, headed: !!args.headed });
await S('Page.navigate', { url: `${base}/index.html?courier=1&nosave=1&dpr=1${args.lite ? '&lite=1' : ''}` });
await waitFor(S, 'window.__ready', 60000);
await settle(S, 60);

const t0 = Date.now();
const samples = [];
let last = await evalJSON(S, '({t:__state.t, lifetime:__state.lifetime, credits:__state.credits})');
console.log(`courier rate — ${MINS} wall minutes, sampling __state.t`);

while (Date.now() - t0 < MINS * 60000) {
  await sleep(5000);
  let s;
  try {
    s = await evalJSON(S, `({t:__state.t, lifetime:__state.lifetime, credits:__state.credits,
      tier:__state.tier, jobs:__state.stats.delivered, fps:__state.fps, tows:__state.stats.tows,
      story:__state.story ? {warmth:__state.story.warmth, rate:__state.story.rate, earned:__state.story.earned} : null})`);
  } catch (e) { console.error('page went away: ' + e.message); break; }
  samples.push(s);
  last = s;
  const mins = s.t / 60;
  if (samples.length % 6 === 0) {
    console.log(`  sim ${mins.toFixed(1)} min · ${s.jobs} jobs · ${s.lifetime} gross · `
      + `${(s.lifetime / Math.max(0.01, mins)).toFixed(1)} CRD/min · bank ${s.credits} · fps ${s.fps}`);
  }
}

const mins = last.t / 60;
const perMin = last.lifetime / Math.max(0.01, mins);
// The two numbers that decide whether the window is fair. A courier who must HOLD 50,000 pays for
// fuel out of the same purse, so the bankable rate is the one the debt is actually paid from.
const bankPerMin = last.credits / Math.max(0.01, mins);
// §S2-P — the arc's targets are the SEIZURE and the SUMMONS, not the 50 000, which is the shadow.
// Both are reported, because they are the two numbers a first-time player is actually asked for.
const projected = Story.DEBT / Math.max(1e-6, bankPerMin);
const toSeize = Math.max(0, Story.SEIZE_AT - 250) / Math.max(1e-6, bankPerMin);
const toSummons = Story.SUMMONS / Math.max(1e-6, bankPerMin);

const report = {
  at: new Date().toISOString(), wallMins: MINS, simMins: +mins.toFixed(2),
  jobs: last.jobs, tier: last.tier, tows: last.tows,
  lifetime: last.lifetime, credits: last.credits,
  grossPerMin: +perMin.toFixed(1), bankPerMin: +bankPerMin.toFixed(1),
  minutesToDebt: +projected.toFixed(1),
  minutesToSeizure: +toSeize.toFixed(1),
  minutesToSummons: +toSummons.toFixed(1),
  seizeAt: Story.SEIZE_AT, summons: Story.SUMMONS,
  simSweptGrossPerMin: 733.3,          // sim_s2e's `normal` pilot, docs/s2e_balance.json
  optimismRatio: +(733.3 / Math.max(1e-6, perMin)).toFixed(3),
  samples,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log(`\n  ${mins.toFixed(1)} sim min · ${last.jobs} jobs · tier ${last.tier} · ${last.tows} tows`);
console.log(`  gross ${report.grossPerMin} CRD/min   (sim_s2e's normal pilot: 733.3 — the analytic`);
console.log(`                                          model is ${report.optimismRatio}x optimistic)`);
console.log(`  bankable ${report.bankPerMin} CRD/min -> ${report.minutesToSeizure} min from a 250 CRD start to the ${Story.SEIZE_AT} seizure`);
console.log(`  ${report.minutesToSummons} min more for the ${Story.SUMMONS} summons · ${report.minutesToDebt} min for the ${Story.DEBT} shadow`);
console.log(`  the shipped window is ${report.window} min`);
console.log(`\nwrote ${OUT.replace(ROOT + '/', '')}`);
await close();
