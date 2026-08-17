#!/usr/bin/env node
// The frame-budget gate of §3.11.2. Renders each shot plus a ?auto=1 flight, samples __state at
// 10 Hz, and fails on any gate. Also runs the static fog/LOD check, which needs no rendering.
//
//   node tools/budget.mjs --headed              ← the only run whose ms numbers mean anything
//   node tools/budget.mjs --shot=fog_city
//   node tools/budget.mjs --lite --headed
//
// This runs on a Mac. --use-angle=metal on an M-series GPU is not an A15 at native resolution,
// so the 6.0 ms mean is a PROXY with a ~2.5x headroom factor, not a measurement. §1's shipping
// requirement is ticked by P10's phone step, never by this tool.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, cleanup, logs } from './shot.mjs';
import { GATES, FOG, preset } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();

const W = +(args.w || 844), H = +(args.h || 390);      // a phone-shaped viewport, landscape
const DPR = +(args.dpr || 2);
const HEADED = !!args.headed;
const LITE = !!args.lite;
const AUTO_SECS = +(args.autosecs || 60);
const OUT = resolve(ROOT, args.out || 'shots/_budget.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── the static check (§3.2.1) ──────────────────────────────────────────────
// C1: nothing pops at the LOD0 boundary. vis(R0) <= 0.45, for every variant and both presets,
// read out of config.js with no rendering at all. three.js's linear fog chunk is a smoothstep,
// not a lerp (three.module.js:13910, fog_fragment), which is why this is not a straight ratio.

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function staticFogCheck() {
  const rows = [];
  for (const low of [false, true]) {
    const Q = preset(low);
    const R0 = Q.ringNear * 256;            // conservative radius — the camera can sit at the far
    for (const name of Object.keys(FOG.variants)) {   // edge of its own chunk
      const near = low ? FOG.lowNear : FOG.variants[name].near;
      const far = low ? FOG.lowFar : FOG.variants[name].far;
      const V = near + (far - near) / FOG.clearMul;
      const vis = 1 - smoothstep(near, V, R0);
      rows.push({ preset: Q.name, variant: name, R0, near, far, V: +V.toFixed(1), vis: +vis.toFixed(4), pass: vis <= 0.45 });
    }
  }
  return rows;
}

// ── sampling ───────────────────────────────────────────────────────────────

async function sample(S, seconds, hz = 10) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    out.push(await evalJSON(S, 'window.__state'));
    await sleep(1000 / hz);
  }
  return out;
}

function reduce(samples) {
  const f = samples.filter(s => s && s.ms);
  if (!f.length) return null;
  const frames = f.map(s => s.ms.frame), worst = f.map(s => s.ms.worst), gen = f.map(s => s.ms.gen);
  return {
    n: f.length,
    fps: +(f.reduce((a, s) => a + s.fps, 0) / f.length).toFixed(1),
    draws: Math.max(...f.map(s => s.draws)),
    tris: Math.max(...f.map(s => s.tris)),
    meanFrame: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(3),
    worstFrame: +Math.max(...worst).toFixed(3),
    worstGen: +Math.max(...gen).toFixed(3),
    errors: f[f.length - 1].errors,
  };
}

function gate(label, r) {
  const fails = [];
  if (r.draws > GATES.draws) fails.push(`draws ${r.draws} > ${GATES.draws}`);
  if (r.tris > GATES.tris) fails.push(`tris ${r.tris} > ${GATES.tris}`);
  if (r.worstGen > GATES.msGen) fails.push(`worst ms.gen ${r.worstGen} > ${GATES.msGen}`);
  if (r.worstFrame > GATES.worstFrame) fails.push(`worst frame ${r.worstFrame} > ${GATES.worstFrame}`);
  if (r.meanFrame > GATES.meanFrame) fails.push(`mean frame ${r.meanFrame} > ${GATES.meanFrame}`);
  if (r.errors?.length) fails.push(`${r.errors.length} error(s) in __state.errors`);
  return { label, ...r, fails };
}

async function main() {
  const fog = staticFogCheck();
  for (const r of fog) {
    console.log(`fog/LOD  ${r.preset.padEnd(4)} ${r.variant.padEnd(11)} R0 ${String(r.R0).padStart(3)} m  V ${String(r.V).padStart(5)} m  vis ${r.vis.toFixed(3)}  ${r.pass ? 'ok' : 'FAIL (>0.45)'}`);
  }

  const ctx = await open({ w: W, h: H, dpr: DPR, headed: HEADED, sw: !!args.sw });
  const { S, base, close } = ctx;

  await S('Page.navigate', { url: `${base}/index.html?nosave` });
  await waitFor(S, 'window.__ready', 30000);
  const ids = args.shot ? [args.shot] : await evalJSON(S, 'window.__game.scenarios.map(s=>s.id)');

  const results = [];
  const q = LITE ? '&lite=1' : '';

  for (const id of ids) {
    logs.length = 0;
    await S('Page.navigate', { url: `${base}/index.html?shot=${id}&dpr=${DPR}&nosave&nohud${q}` });
    await waitFor(S, 'window.__ready', 30000);
    await settle(S, 90);
    await evalJSON(S, 'window.__game.resetPerf()');
    const r = gate(id, reduce(await sample(S, +(args.secs || 4))));
    results.push(r);
    console.log(row(r));
  }

  if (!args.skipauto) {
    logs.length = 0;
    await S('Page.navigate', { url: `${base}/index.html?auto=1&dpr=${DPR}&nosave${q}` });
    await waitFor(S, 'window.__ready', 30000);
    await settle(S, 60);
    const st = await evalJSON(S, 'window.__state');
    if (st.mode !== 'auto') {
      console.log(`auto      — autopilot not implemented yet (mode="${st.mode}"); the flight leg lands in P4. Sampled anyway.`);
    }
    await evalJSON(S, 'window.__game.resetPerf()');
    const r = gate('auto', reduce(await sample(S, AUTO_SECS)));
    results.push(r);
    console.log(row(r));
  }

  await close();

  const report = {
    at: new Date().toISOString(), headed: HEADED, lite: LITE, w: W, h: H, dpr: DPR,
    gates: GATES, fog, results,
    proxy: 'Mac/ANGLE numbers. Not a phone. §1 item 2 is ticked by P10 on a real device only.',
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  const bad = results.filter(r => r.fails.length).concat(fog.filter(f => !f.pass).map(f => ({ label: `fog:${f.preset}:${f.variant}`, fails: [`vis(${f.R0}) ${f.vis} > 0.45`] })));
  if (!HEADED) console.warn('\n⚠ headless — ms numbers are ANGLE/software. Re-run --headed for the gate.');
  if (bad.length) {
    console.error('\nBUDGET FAIL');
    for (const b of bad) console.error(`  ${b.label}: ${b.fails.join('; ')}`);
    process.exit(1);
  }
  console.log(`\nall gates pass → ${OUT}`);
}

const row = r => `${r.label.padEnd(12)} ${String(r.draws).padStart(4)} draws  ${(r.tris / 1000).toFixed(1).padStart(7)}k tris  `
  + `mean ${r.meanFrame.toFixed(2)}ms  worst ${r.worstFrame.toFixed(2)}ms  gen ${r.worstGen.toFixed(2)}ms  `
  + (r.fails.length ? 'FAIL: ' + r.fails.join('; ') : 'ok');

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
