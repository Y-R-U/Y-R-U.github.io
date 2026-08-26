#!/usr/bin/env node
/**
 * Landing gate. Plain node, no deps, no browser.
 *
 *   node tools/landing_gate.mjs [--falsify] [--quiet]
 *
 * Flies every plane tier against the real js/sim/landing.js and reports whether CONTRACTS §9 can
 * actually be satisfied. Nothing here is patched or stubbed except under --falsify: the whole
 * point is that this measures the shipped file.
 *
 * It exists because "no human has ever landed in this game" was true for months while the
 * mechanic looked implemented, and because the failure was silent — the plane simply flew over
 * the deck slightly too fast and nothing said so.
 *
 * TWO PROFILES, because one number cannot answer both questions:
 *
 *   LEVEL     the original pilot: hold a fixed altitude across the ship and let the near-pad
 *             throttle do the rest. This is NOT how you land; it is a probe. Its ratio is the
 *             TIGHTNESS figure — how much of a crude, unskilled pass at the ship the window
 *             still accepts. It is directly comparable with the pre-gate baseline of 167/270,
 *             because the pilot has not changed.
 *   APPROACH  the real js/sim/autopilot.js, flying its own approach. Its ratio is the
 *             PLAYABILITY figure — can a competent pilot get in from a spread of starting
 *             positions. This is what the gate passes or fails on: a window nobody can fly
 *             through is not tight, it is broken.
 *
 * Each profile flies a grid of start distances x approach altitudes, deliberately spanning both
 * sides of the window (the -60 and +240 offsets are outside it) and including a 400-unit start
 * that is far too late, so the ratios characterise the window rather than confirm a happy path.
 *
 * --falsify runs TWO sabotages, because there are two things here that can silently rot:
 *   1. the near-pad slow zone stops scaling with the aircraft (the original tier-6+ bug)
 *   2. the accept window goes back to the old pad-centred slab
 * and PASSES only if each is caught by the instrument that is supposed to see it. A gate that
 * has never been proven to fail is not evidence (CONTRACTS §13).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = { falsify: process.argv.includes('--falsify'), quiet: process.argv.includes('--quiet') };

const { createWorld } = await import(join(ROOT, 'js/sim/world.js'));
const { makeAutopilot } = await import(join(ROOT, 'js/sim/autopilot.js'));
const { PLANES } = await import(join(ROOT, 'js/data/planes.js'));

const PAD_X = 12000, DECK_Y = 120;
const LEVEL = {
  id: 'landing-probe', act: 1, name: 'Landing Probe', biome: 'sea', length: 22000, seed: 4242,
  timeOfDay: 'day', weather: 'clear',
  objectives: [{ type: 'land', padId: 'carrier' }],
  spawns: [{ at: PAD_X, kind: 'pad', padId: 'carrier', y: DECK_Y }],
  waves: [], reward: { money: 1, xp: 1 }, par: 150, intro: 'landing probe',
};

const STARTS = [6000, 3000, 1600, 900, 400];
const ALTS = [-60, 10, 60, 110, 160, 240];

/** The rule as it stood before the approach gate: your AABB overlaps the pad's, anywhere on it. */
function oldCheck(world) {
  return (p) => {
    if (p.script || p.landed || p.dead) return;
    if (Math.abs(p.ang) >= 0.25 || p.vx <= 0) return;
    if (p.speed >= (p.def.landSpeed || p.def.stall * 1.3)) return;
    for (const e of world.ents) {
      if (e.kind !== 'pad' || e.dead) continue;
      if (Math.abs(p.x - e.x) > e.w + p.w) continue;
      if (Math.abs(p.y - e.y) > e.h + p.h) continue;
      p.script = { kind: 'land', t: 0, x0: p.x, y0: p.y, ang0: p.ang, pad: e };
      return;
    }
  };
}

/**
 * One approach.
 * @param profile  'level' (hold holdY, the crude probe) or 'approach' (the real autopilot)
 * @param sab      null | 'zone' (pin nearPad to the old fixed reach) | 'box' (pin the old window)
 */
function attempt(planeId, startDx, holdY, profile, sab) {
  const world = createWorld({ level: LEVEL, seed: 7, save: { planeId, loadout: [null, null, null, null], upgrades: {} } });
  const p = world.player;
  const pad = world.ents.find((e) => e.kind === 'pad');
  if (sab === 'zone') {
    // The pre-fix rule, reinstated verbatim: a fixed pad-sized zone that ignores the aircraft.
    world.landing.nearPad = (pl) => Math.abs(pl.x - pad.x) < pad.w * 4 && Math.abs(pl.y - pad.y) < pad.h * 4;
  }
  if (sab === 'box') world.landing.check = oldCheck(world);

  p.x = pad.x - startDx; p.y = DECK_Y + holdY; p.ang = 0; p.speed = p.def.cruise;
  const bot = profile === 'approach' ? makeAutopilot() : null;
  let t = 0, minSpeed = Infinity, wentAround = false;
  const limit = profile === 'approach' ? 60 * 240 : 60 * 120;
  while (!world.over && !p.landed && t < limit) {
    if (bot) bot.step(world, 1 / 60);
    else if (!p.script) world.setStickAngle(Math.max(-0.2, Math.min(0.2, (DECK_Y + holdY - p.y) * 0.004)));
    world.step(); world.drainEvents();
    if (!p.script) minSpeed = Math.min(minSpeed, p.speed);
    if (p.vx < -1) wentAround = true;      // the bot turned back for another circuit
    // the autopilot is allowed to go around, so it only gets cut off when it runs out of level
    if (!bot && p.x > pad.x + 3000) break;
    if (bot && p.x > world.level.length - 200) break;
    t++;
  }
  return { landed: p.landed, minSpeed, wentAround, touchdownX: p.landed ? p.x - pad.x : null };
}

function sweep(profile, sab) {
  const rows = [];
  for (const def of PLANES) {
    let landed = 0, first = 0, tried = 0, minSpeed = Infinity, tdLo = Infinity, tdHi = -Infinity;
    for (const dx of STARTS) {
      for (const alt of ALTS) {
        const r = attempt(def.id, dx, alt, profile, sab);
        tried++;
        if (r.landed) { landed++; if (!r.wentAround) first++; tdLo = Math.min(tdLo, r.touchdownX); tdHi = Math.max(tdHi, r.touchdownX); }
        minSpeed = Math.min(minSpeed, r.minSpeed);
      }
    }
    rows.push({ id: def.id, cruise: def.cruise, stall: def.stall,
                landSpeed: def.landSpeed ?? Math.round(def.stall * 1.5), minSpeed, landed, first, tried, tdLo, tdHi });
  }
  return rows;
}

const pad = (s, n) => String(s).padStart(n);
function report(title, rows) {
  const tiersOk = rows.filter((r) => r.landed > 0).length;
  const tot = rows.reduce((n, r) => n + r.landed, 0), att = rows.reduce((n, r) => n + r.tried, 0);
  const fst = rows.reduce((n, r) => n + r.first, 0);
  if (!a.quiet) {
    console.log(`\n${title}`);
    console.log(`plane      tier  cruise  stall  landSpeed   min speed reached   landed/attempted   first pass   touchdown x - pad.x`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ok = r.minSpeed < r.landSpeed;
      console.log(`${r.id.padEnd(10)} ${pad(i + 1, 4)} ${pad(r.cruise, 7)} ${pad(r.stall, 6)} ${pad(r.landSpeed, 10)} ` +
                  `${pad(Math.round(r.minSpeed), 19)}${ok ? ' ' : '*'}  ${pad(r.landed + '/' + r.tried, 16)}   ` +
                  `${pad(r.first + '/' + r.tried, 10)}   ${pad(r.landed ? Math.round(r.tdLo) + '..' + Math.round(r.tdHi) : '-', 12)}`);
    }
  }
  console.log(`${title.padEnd(34)} ${tiersOk}/${rows.length} tiers can land   ${tot}/${att} approaches put the aeroplane on the deck   ${fst}/${att} of them without a go-around`);
  return { tiersOk, tot, fst, att, rows };
}

const level = report('LEVEL   (crude fixed-altitude pass)', sweep('level', null));
const appr = report('APPROACH (real js/sim/autopilot.js)', sweep('approach', null));
console.log(`\n(* = never got below landSpeed, so CONTRACTS §9 can never trigger in that aircraft)`);
console.log(`(the deck is pad.x -170 .. +170; every touchdown above must be inside that or the aeroplane landed on water)`);
const offDeck = [...level.rows, ...appr.rows].filter((r) => r.landed && (r.tdLo < -170 || r.tdHi > 170));
console.log(offDeck.length ? `OFF-DECK TOUCHDOWNS: ${offDeck.map((r) => r.id).join(', ')}` : `every touchdown, both profiles, finished on the deck`);

if (a.falsify) {
  console.log(`\n--- FALSIFY 1: near-pad reach pinned back to the fixed e.w*4 = 680 units ---`);
  const zone = report('LEVEL   (zone sabotaged)', sweep('level', 'zone'));
  const fast = zone.rows.slice(5);                      // vampire and up: the tiers the fix was for
  const brokeFast = fast.every((r) => r.landed === 0);
  console.log(`         tiers 6-9 that can no longer land: ${fast.filter((r) => r.landed === 0).map((r) => r.id).join(', ') || 'none'}`);

  console.log(`\n--- FALSIFY 2: accept window pinned back to the old pad-centred slab ---`);
  console.log(`    (|dx| <= pad.w + p.w, |dy| <= pad.h + p.h, |ang| < 0.25 — 460 x 190 on the ship's centre)`);
  const box = report('LEVEL   (window sabotaged)', sweep('level', 'box'));
  // The crude pilot is the instrument that can see this: a slab centred on the ship accepts a
  // great deal more of a lazy level pass than a window over the stern does. If loosening the
  // window back to the old rule does NOT move this number, the tightening was never real.
  const loosened = box.tot >= level.tot * 1.5;
  console.log(`         crude-pass ratio: ${level.tot}/${level.att} with the gate, ${box.tot}/${box.att} with the old slab` +
              `  (x${(box.tot / Math.max(1, level.tot)).toFixed(2)})`);

  // A sabotage that sabotages nothing is worse than none: each break must be visible to the
  // instrument that owns it and must NOT be the only thing keeping the other one honest.
  const staged = level.tiersOk === PLANES.length && appr.tiersOk === PLANES.length;
  if (!staged) {
    console.log(`\nFALSIFY UNSTAGEABLE — the unsabotaged build already fails, so neither break proves anything`);
    process.exit(2);
  }
  const ok = brokeFast && loosened;
  console.log(ok
    ? '\nFALSIFY PASS — the zone break goes red on tiers 6-9, and the window break moves the crude-pass ratio'
    : `\nFALSIFY FAIL — ${!brokeFast ? 'the old fixed zone still lands the fast tiers' : ''}` +
      `${!loosened ? ' the old slab did not loosen the crude-pass ratio; the window is not what is holding the line' : ''}`);
  process.exit(ok ? 0 : 1);
}

// The APPROACH profile is the pass criterion. The LEVEL ratio is reported, never asserted on:
// it is a description of tightness, and tightening it is the point of the exercise.
process.exit(appr.tiersOk === PLANES.length ? 0 : 1);
