#!/usr/bin/env node
// A long ?auto=1 run that samples __state on a timer. Screenshot-only checks miss state and
// balance bugs entirely, so this asserts on values, not on pictures.
//
//   node tools/soak.mjs --mins=10
//   node tools/soak.mjs --mins=30 --lite --headed
//
// Two caveats carried over from voidcast, both learned the hard way:
//   · the software renderer runs the sim slower than wall-clock, so progress is measured from
//     __state.t (the sim's own clock) and never from elapsed wall time;
//   · --virtual-time-budget does not advance a WebGL sim. Everything here is real time.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup, logs } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();

const MINS = +(args.mins || 10);
const HZ = +(args.hz || 2);
const W = +(args.w || 844), H = +(args.h || 390);
const DPR = +(args.dpr || 1);
const OUT = resolve(ROOT, args.out || 'shots/_soak.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const ctx = await open({ w: W, h: H, dpr: DPR, headed: !!args.headed, mobile: !!args.mobile });
  const { S, base, close } = ctx;

  const url = `${base}/index.html?auto=1&nosave&dpr=${DPR}${args.lite ? '&lite=1' : ''}${args.perf ? '&perf=1' : ''}`;
  await S('Page.navigate', { url });
  await waitFor(S, 'window.__ready', 30000);
  await settle(S, 60);

  // Boot compiles every shader and pre-warms the 5x5 near ring (§3.2.3), which is a 30-80 ms
  // frame that then sits in the 90-frame rolling window and gets reported as the worst frame of a
  // ten-minute run that had settled inside two seconds. Clear it, exactly as budget.mjs does.
  await evalJSON(S, 'window.__game.resetPerf()');
  await settle(S, 30);

  const start = await evalJSON(S, 'window.__state');
  console.log(`soak ${MINS} min  quality=${start.quality}  mode=${start.mode}`);
  if (start.mode !== 'auto') console.log('  note: autopilot not implemented yet — that lands in P4. Sampling the idle sim.');

  const samples = [];
  const seenErrors = new Set();
  let lastSimT = start.t, stuckSince = Date.now();
  const t0 = Date.now();

  while (Date.now() - t0 < MINS * 60000) {
    let s;
    try { s = await evalJSON(S, 'window.__state'); } catch (e) { console.error('  page went away: ' + e.message); break; }
    samples.push({
      t: s.t, fps: s.fps, frame: s.ms.frame, worst: s.ms.worst, gen: s.ms.gen,
      draws: s.draws, tris: s.tris, credits: s.credits, tier: s.tier, lifetime: s.lifetime,
      chunks: s.city.chunks, queued: s.city.queued, dock: s.dock, job: s.job, parked: s.parked,
    });
    for (const e of s.errors) {
      const k = e.kind + '|' + e.msg;
      if (!seenErrors.has(k)) { seenErrors.add(k); console.error(`  [${e.kind}] ${e.msg}`); }
    }
    // Progress is the SIM's clock, not the wall's.
    if (s.t > lastSimT + 0.5) { lastSimT = s.t; stuckSince = Date.now(); }
    else if (Date.now() - stuckSince > 30000) {
      console.error(`  sim clock stalled at t=${s.t} for 30 s — the loop is parked or dead`);
      stuckSince = Date.now();
    }
    if (samples.length % (HZ * 60) === 0) {
      const m = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`  ${m}m  simT ${s.t.toFixed(0)}s  ${s.fps.toFixed(0)}fps  ${s.draws} draws  ${(s.tris / 1000).toFixed(0)}k  `
        + `cr ${s.credits}  tier ${s.tier}  err ${s.errors.length}`);
    }
    await sleep(1000 / HZ);
  }

  const end = samples[samples.length - 1] || {};
  await close();

  const frames = samples.map(s => s.frame).filter(Number.isFinite);
  const report = {
    at: new Date().toISOString(), mins: MINS, quality: start.quality, mode: start.mode,
    samples: samples.length,
    simSeconds: +(((end.t || 0) - start.t)).toFixed(1),
    wallSeconds: +((Date.now() - t0) / 1000).toFixed(1),
    meanFrame: frames.length ? +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(3) : null,
    worstFrame: samples.length ? +Math.max(...samples.map(s => s.worst)).toFixed(3) : null,
    maxDraws: samples.length ? Math.max(...samples.map(s => s.draws)) : 0,
    maxTris: samples.length ? Math.max(...samples.map(s => s.tris)) : 0,
    errors: [...seenErrors],
    series: samples,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`\nsim ${report.simSeconds}s over ${report.wallSeconds}s wall  `
    + `(${report.wallSeconds ? (report.simSeconds / report.wallSeconds).toFixed(2) : '—'}x)  `
    + `mean ${report.meanFrame}ms  worst ${report.worstFrame}ms  errors ${report.errors.length}`);
  console.log(`→ ${OUT}`);
  if (report.errors.length) process.exit(1);
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
