#!/usr/bin/env node
// tools/cap_s2i.mjs — the S2-I capture pass. Every company screen and the driver feed, portrait
// and landscape, so they can be LOOKED AT rather than reported on.
//
//   node tools/cap_s2i.mjs                 # portrait 390x844
//   node tools/cap_s2i.mjs --land          # landscape 844x390
//   node tools/cap_s2i.mjs --only=feed
//
// Shots land in shots/s2i/ (gitignored, like every other render).
//
// The trap this file is written against is S2-H's: **its capture tool aimed every camera 180 deg
// away from its subject** and produced four districts of frames with no shopfront in them, which
// reads exactly like a dead feature. So every capture below asserts what it expects to be on
// screen BEFORE it presses the shutter, and prints the assertion.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const TAG = LAND ? 'land' : 'port';
const ONLY = args.only || null;
const OUT = resolve(ROOT, 'shots/s2i');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Advance the SIM by `seconds` of its own clock. `settle()` counts FRAMES and gives up after 25 s
// of wall time, so `settle(S, 900)` returns -1 having advanced whatever it managed — which on the
// first run of this tool was zero deliveries, i.e. a screenshot of the empty state dressed up as a
// screenshot of a working fleet.
async function advance(S, seconds, budgetMs = 240000) {
  const t0 = await evalJSON(S, '__state.t');
  const w0 = Date.now();
  while (Date.now() - w0 < budgetMs) {
    await settle(S, 240, 20000);
    const t = await evalJSON(S, '__state.t');
    if (t - t0 >= seconds) return +(t - t0).toFixed(1);
  }
  return +((await evalJSON(S, '__state.t')) - t0).toFixed(1);
}

async function shot(S, name, expect) {
  if (expect) console.log(`      expecting: ${expect}`);
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = resolve(OUT, `${name}_${TAG}.png`);
  writeFileSync(p, Buffer.from(data, 'base64'));
  console.log(`  → shots/s2i/${name}_${TAG}.png`);
  return p;
}

async function session(url) {
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}${url}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  return { S, close };
}

mkdirSync(OUT, { recursive: true });

// ── the three company screens ──────────────────────────────────────────────
if (!ONLY || ONLY === 'panel') {
  console.log(`company panel ${W}x${H}`);
  // Three drivers, a fleet gross past the LANE HOUSE rung so the ladder has something to show, and
  // enough in the account that no row is greyed for the wrong reason.
  const { S, close } = await session('/index.html?nosave=1&story=act2&fleet=3&tier=4&dpr=1');
  // The second argument is how long that gross took. Without it every per-minute readout on the
  // earnings screen divides a granted total by the three minutes this capture has been running,
  // and the screen prints 22,913 CRD/min — a picture of the fixture rather than of the screen.
  await hook(S, 'setFleetGross', 74000, 96);
  await hook(S, 'setCredits', 48000);
  // Let the drivers actually work, so the roster has real numbers on it rather than four zeros.
  // A screenshot of a roster before anybody has flown is a screenshot of the empty state.
  const flew = await advance(S, 200);
  console.log(`      flew ${flew} sim seconds`);
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  const before = await evalJSON(S, '({jobs:__state.company.jobs, gross:__state.company.gross, live:__state.company.live})');
  console.log(`      fleet has flown: ${before.jobs} deliveries, ${Math.round(before.gross)} CRD gross, ${before.live} live craft`);

  await hook(S, 'fleetPanel', 'roster');
  await settle(S, 8);
  await shot(S, 'roster', 'three driver rows with live status, gauges and a NET/MIN with a sign');

  await hook(S, 'fleetPanel', 'recruit');
  await settle(S, 8);
  await shot(S, 'recruit', 'the hull picker with lease-per-minute, then four candidates with their sums');

  await hook(S, 'fleetPanel', 'earnings');
  await settle(S, 8);
  await shot(S, 'earnings', 'the books — every line with its own sign — and the company ladder below');

  await close();
}

// ── the driver feed ────────────────────────────────────────────────────────
if (!ONLY || ONLY === 'feed') {
  console.log(`driver feed ${W}x${H}`);
  const { S, close } = await session('/index.html?nosave=1&story=act2&fleet=2&tier=4&dpr=1');
  await hook(S, 'setCredits', 48000);
  // The feed is only offered from a pad, so dock first — the same condition the roster's VIEW key
  // is disabled by.
  await hook(S, 'forceDock');
  await settle(S, 12);
  // Let the driver get off the deck and into the air, or the feed is a picture of a parked craft.
  console.log(`      flew ${await advance(S, 90)} sim seconds before opening the feed`);
  const v = await evalJSON(S, `(() => {
    const g = window.__game;
    const ids = Object.keys(g.ledger().drivers.reduce((o, d) => (o[d.id] = 1, o), {}));
    g.viewDriver(ids[0]);
    return { id: ids[0], rig: g.rigTarget() };
  })()`);
  await settle(S, 20);
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  const s = await evalJSON(S, `({ st: __state.company.statuses[${JSON.stringify(v.id)}], rig: __game.rigTarget(),
    dist: Math.hypot(__state.player.x - __state.company.statuses[${JSON.stringify(v.id)}].x,
                     __state.player.z - __state.company.statuses[${JSON.stringify(v.id)}].z) })`);
  console.log(`      camera is on the driver: ${s.rig.onDriver} · cabin off: ${!s.rig.cabin}`
    + ` · driver is ${Math.round(s.dist)} m from the player's pad · speed ${s.st.speed} m/s`);
  // NAME THE FILE AFTER THE RIG THAT IS ACTUALLY RUNNING. The first pass assumed the first shot
  // was chase and it was not — the default view is COCKPIT (save.js), so `feed_chase.png` was a
  // picture from inside the driver's hull with no hull in it, which reads as a dead feature.
  const mode1 = (await evalJSON(S, '__game.rigTarget()')).mode;
  await shot(S, `feed_${mode1}`, mode1 === 'chase'
    ? 'the hired craft on its chase boom with the DRIVER FEED strip and no player dashboard'
    : 'the view from inside the driver’s own cockpit — no hull, and still no player dashboard');

  await hook(S, 'toggleView');
  await settle(S, 14);
  const mode2 = (await evalJSON(S, '__game.rigTarget()')).mode;
  await shot(S, `feed_${mode2}`, mode2 === 'chase'
    ? 'the hired craft on its chase boom with the DRIVER FEED strip and no player dashboard'
    : 'the view from inside the driver’s own cockpit — no hull, and still no player dashboard');

  // Back to the view the player left in, so `feed_left` is comparable to the shots before it.
  await hook(S, 'toggleView');
  await settle(S, 10);
  await hook(S, 'viewDriver', null);
  await settle(S, 14);
  const back = await evalJSON(S, '__game.rigTarget()');
  console.log(`      left the feed: onPlayer ${back.onPlayer} · cabin back ${back.cabin}`);
  await shot(S, 'feed_left', 'back on the player’s own craft, dashboard restored');
  await close();
}

// ── the RECORD tab, with the two company licence rungs open ────────────────
if (!ONLY || ONLY === 'record') {
  console.log(`record tab ${W}x${H}`);
  const { S, close } = await session('/index.html?nosave=1&story=act2&fleet=1&tier=6&dpr=1');
  // The company rungs sit ON TOP of the lifetime ladder — `courierRank` refuses rung 7 to anybody
  // below HAULMASTER — so the licence has to be earned through the same `economy.earn()` path a
  // delivery takes before the fleet gross can mean anything.
  await hook(S, 'grantCredits', 90000);
  await hook(S, 'setFleetGross', 180000, 220);
  await hook(S, 'setCredits', 20000);
  await hook(S, 'forceDock');
  await settle(S, 14);
  // S2-E's hire panel opens itself on every dock while the player is grounded, and act two is
  // grounded until they hire. Without this the capture is a picture of the hire screen with the
  // ladder ghosted behind it.
  await hook(S, 'closeHirePanel');
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 6);
  await evalJSON(S, `(() => {
    const tabs = [...document.querySelectorAll('.dk-tab')];
    const rec = tabs[tabs.length - 1];
    rec.click();
    return rec.textContent;
  })()`);
  await settle(S, 10);
  const r = await evalJSON(S, '(() => { const d = __game.dockUI(); return d && d.ranks ? d.ranks.licence : null; })()');
  console.log(`      licence rung on the rail: ${r ? r.name : 'none'} on the ${r ? r.axis : '?'} axis`);
  await shot(S, 'record_company', 'the licence ladder with SPIRE HAULIER reached on the FLEET GROSS axis');
  await sleep(50);
  await close();
}

console.log('\ndone');
