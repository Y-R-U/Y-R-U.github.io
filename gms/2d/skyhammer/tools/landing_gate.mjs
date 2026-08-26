#!/usr/bin/env node
/**
 * Landing gate. Plain node, no deps, no browser.
 *
 *   node tools/landing_gate.mjs [--falsify] [--quiet]
 *
 * Flies an ideal approach in EVERY plane tier against the real js/sim/landing.js and reports
 * whether CONTRACTS §9 can actually be satisfied. Nothing here is patched or stubbed: the
 * whole point is that this measures the shipped file.
 *
 * It exists because "no human has ever landed in this game" was true for months while the
 * mechanic looked implemented, and because the failure was silent — the plane simply flew
 * over the deck slightly too fast and nothing said so. Tiers 6-9 were physically unable to
 * land at all: the near-pad slow zone was a fixed 680 world units while a vector needs 1219
 * to bleed cruise down to landSpeed.
 *
 * Each tier flies a grid of approaches (start distance x approach altitude) so the number is
 * a robustness figure, not one lucky line.
 *
 * --falsify pins the near-pad reach back to the old fixed `e.w * 4` and PASSES only if the
 * fast tiers stop landing. A gate that has never been proven to fail is not evidence.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = { falsify: process.argv.includes('--falsify'), quiet: process.argv.includes('--quiet') };

const { createWorld } = await import(join(ROOT, 'js/sim/world.js'));
const { PLANES } = await import(join(ROOT, 'js/data/planes.js'));

const PAD_X = 12000, DECK_Y = 120;
const LEVEL = {
  id: 'landing-probe', act: 1, name: 'Landing Probe', biome: 'sea', length: 22000, seed: 4242,
  timeOfDay: 'day', weather: 'clear',
  objectives: [{ type: 'land', padId: 'carrier' }],
  spawns: [{ at: PAD_X, kind: 'pad', padId: 'carrier', y: DECK_Y }],
  waves: [], reward: { money: 1, xp: 1 }, par: 150, intro: 'landing probe',
};

// The grid deliberately spans BOTH sides of the §9 window (deckY - 15 .. deckY + 175) and
// includes an approach established far too late, so landed/attempted characterises how tight
// the window is rather than just confirming a happy path. Two of the six altitudes and the
// 400-unit start are expected to fail in every aircraft; that is the point.
const STARTS = [6000, 3000, 1600, 900, 400];
const ALTS = [-60, 10, 60, 110, 160, 240];

/** One ideal approach: hold `holdY`, wings level, let the near-pad throttle do the rest. */
function attempt(planeId, startDx, holdY, pinOldZone) {
  const world = createWorld({ level: LEVEL, seed: 7, save: { planeId, loadout: [null, null, null, null], upgrades: {} } });
  const p = world.player;
  const pad = world.ents.find((e) => e.kind === 'pad');
  if (pinOldZone) {
    // The pre-fix rule, reinstated verbatim: a fixed pad-sized zone that ignores the aircraft.
    world.landing.nearPad = (pl) => Math.abs(pl.x - pad.x) < pad.w * 4 && Math.abs(pl.y - pad.y) < pad.h * 4;
  }
  p.x = pad.x - startDx; p.y = DECK_Y + holdY; p.ang = 0; p.speed = p.def.cruise;
  let t = 0, minSpeed = Infinity;
  while (!world.over && !p.landed && t < 60 * 120) {
    if (!p.script && !p.landed) world.setStickAngle(Math.max(-0.2, Math.min(0.2, (DECK_Y + holdY - p.y) * 0.004)));
    world.step(); world.drainEvents();
    if (!p.script) minSpeed = Math.min(minSpeed, p.speed);
    if (p.x > pad.x + 3000) break;
    t++;
  }
  return { landed: p.landed, minSpeed };
}

const rows = [];
let tiersOk = 0;
for (const def of PLANES) {
  let landed = 0, tried = 0, minSpeed = Infinity;
  for (const dx of STARTS) {
    for (const alt of ALTS) {
      const r = attempt(def.id, dx, alt, a.falsify);
      tried++;
      if (r.landed) landed++;
      minSpeed = Math.min(minSpeed, r.minSpeed);
    }
  }
  if (landed > 0) tiersOk++;
  rows.push({ id: def.id, name: def.name, cruise: def.cruise, stall: def.stall,
              landSpeed: def.landSpeed ?? Math.round(def.stall * 1.5), minSpeed, landed, tried });
}

const pad = (s, n) => String(s).padStart(n);
console.log(`plane      tier  cruise  stall  landSpeed   min speed reached   landed/attempted`);
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const ok = r.minSpeed < r.landSpeed;
  console.log(`${r.id.padEnd(10)} ${pad(i + 1, 4)} ${pad(r.cruise, 7)} ${pad(r.stall, 6)} ${pad(r.landSpeed, 10)} ` +
              `${pad(Math.round(r.minSpeed), 19)}${ok ? ' ' : '*'}  ${pad(r.landed + '/' + r.tried, 16)}`);
}
console.log(`(* = never got below landSpeed, so CONTRACTS §9 can never trigger in that aircraft)`);

const totalLanded = rows.reduce((n, r) => n + r.landed, 0);
const totalTried = rows.reduce((n, r) => n + r.tried, 0);
console.log(`\n${tiersOk}/${rows.length} tiers can land   ${totalLanded}/${totalTried} approaches put the aeroplane on the deck`);

if (a.falsify) {
  const fast = rows.slice(5);                       // vampire and up: the tiers the fix was for
  const broken = fast.filter((r) => r.landed === 0);
  const ok = broken.length === fast.length && tiersOk < rows.length;
  console.log(`\nFALSIFY: near-pad reach pinned back to the fixed e.w*4 = 680 units.`);
  console.log(`         tiers 6-9 that can no longer land: ${broken.map((r) => r.id).join(', ') || 'none'}`);
  console.log(ok ? 'FALSIFY PASS — the gate goes red when the zone stops scaling with the aircraft'
                 : 'FALSIFY FAIL — the gate still passed with the old broken zone; it is not evidence');
  process.exit(ok ? 0 : 1);
}
process.exit(tiersOk === rows.length ? 0 : 1);
