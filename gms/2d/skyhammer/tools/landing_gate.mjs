#!/usr/bin/env node
/**
 * Landing gate. Plain node, no deps, no browser.
 *
 *   node tools/landing_gate.mjs [--falsify] [--quiet]
 *
 * Flies every plane tier against the real js/sim/landing.js and reports whether the approach
 * square can actually be flown. Nothing here is patched or stubbed except under --falsify: the
 * whole point is that this measures the shipped file.
 *
 * It exists because "no human has ever landed in this game" was true for months while the
 * mechanic looked implemented, and because the failure was silent — the plane simply flew over
 * the deck slightly too fast and nothing said so.
 *
 * THREE PROFILES, because one number cannot answer three questions:
 *
 *   LEVEL      the crude pilot: hold a fixed altitude straight across the ship. This is NOT how
 *              you land; it is a probe. Its ratio is the TIGHTNESS figure — how much of an
 *              unskilled pass the square still accepts. Comparable across rule changes because
 *              the pilot never changes. Reported, never asserted on.
 *   APPROACH   the real js/sim/autopilot.js flying its own approach. Its ratio is the PLAYABILITY
 *              figure, and it is what the gate passes or fails on: a square nobody can fly into
 *              is not tight, it is broken.
 *   WRONG WAY  the same crude pilot, flying east to west straight through the square. Must land
 *              ZERO times, in every tier, at every altitude. This is the only instrument that can
 *              see the direction rule, and without it "you must be moving toward the boat" is an
 *              untested sentence in a comment.
 *
 * The first two fly a grid of start distances x approach altitudes deliberately spanning both
 * sides of the square (the -60 and +240 offsets are outside it) and including a 400-unit start
 * that is far too late, so the ratios characterise the window rather than confirm a happy path.
 *
 * --falsify runs FOUR sabotages, one per claim this file makes, and passes only if each is caught
 * by the instrument that is supposed to see it. A gate that has never been proven to fail is not
 * evidence (CONTRACTS §13). Note what is NOT sabotaged any more: the near-pad throttle zone. It
 * was falsified here while speed gated the landing; speed no longer does, so breaking it now
 * changes nothing and the check had quietly stopped being evidence. A sabotage that sabotages
 * nothing is worse than no sabotage, so it is gone rather than left in to look thorough.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = { falsify: process.argv.includes('--falsify'), quiet: process.argv.includes('--quiet') };

const { createWorld } = await import(join(ROOT, 'js/sim/world.js'));
const { makeAutopilot } = await import(join(ROOT, 'js/sim/autopilot.js'));
const { GATE } = await import(join(ROOT, 'js/sim/landing.js'));
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

const clampN = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------- sabotages
// Each one is a REPLACEMENT world.landing.check, written the way the rule would look if the
// claim in landing.js were false. They deliberately do not call approachBox.

/**
 * The obvious alternative design, and the geometry the first revision of this rule actually used:
 * accept anywhere the plane's AABB overlaps the pad's — a 460 x 190 slab on the ship's centre —
 * with today's direction rule and nothing else.
 *
 * It is stated with the CURRENT two conditions on purpose. The historical rule also demanded
 * `speed < landSpeed` and `|ang| < 0.25`, and comparing that against a square that tests neither
 * measures the conditions rather than the geometry, which is not the claim. The claim is that a
 * 90-unit square somewhere specific is a real target and "be over the boat" is not.
 */
const sabOldSlab = (world) => (p) => {
  if (p.script || p.landed || p.dead) return;
  if (p.vx <= 0) return;
  for (const e of world.ents) {
    if (e.kind !== 'pad' || e.dead) continue;
    if (Math.abs(p.x - e.x) > e.w + p.w || Math.abs(p.y - e.y) > e.h + p.h) continue;
    p.script = { kind: 'land', t: 0, x0: p.x, y0: p.y, ang0: p.ang, pad: e };
    return;
  }
};

/** The same square, the same size, moved amidships — i.e. `lead` chosen by taste, not roll-out. */
const sabAmidships = (world) => (p) => {
  if (p.script || p.landed || p.dead) return;
  const h = GATE.size * 0.5;
  for (const e of world.ents) {
    if (e.kind !== 'pad' || e.dead) continue;
    const deckY = e.deckY !== undefined ? e.deckY : e.y - e.h;
    if (Math.abs(p.x - e.x) > h || Math.abs(p.y - (deckY + GATE.rise)) > h) continue;
    if (p.vx <= 0) continue;
    p.script = { kind: 'land', t: 0, x0: p.x, y0: p.y, ang0: p.ang, pad: e };
    return;
  }
};

/** The real square with the direction rule deleted. */
const sabNoDir = (world) => (p) => {
  if (p.script || p.landed || p.dead) return;
  const h = GATE.size * 0.5;
  for (const e of world.ents) {
    if (e.kind !== 'pad' || e.dead) continue;
    const deckY = e.deckY !== undefined ? e.deckY : e.y - e.h;
    if (Math.abs(p.x - (e.x - e.w - GATE.lead)) > h) continue;
    if (Math.abs(p.y - (deckY + GATE.rise)) > h) continue;
    p.script = { kind: 'land', t: 0, x0: p.x, y0: p.y, ang0: p.ang, pad: e };
    return;
  }
};

/** The square inflated back to something you cannot miss. */
const sabHuge = (world) => (p) => {
  if (p.script || p.landed || p.dead) return;
  const h = GATE.size * 2.5;
  for (const e of world.ents) {
    if (e.kind !== 'pad' || e.dead) continue;
    const deckY = e.deckY !== undefined ? e.deckY : e.y - e.h;
    if (Math.abs(p.x - (e.x - e.w - GATE.lead)) > h || Math.abs(p.y - (deckY + GATE.rise)) > h) continue;
    if (p.vx <= 0) continue;
    p.script = { kind: 'land', t: 0, x0: p.x, y0: p.y, ang0: p.ang, pad: e };
    return;
  }
};

/**
 * The only sabotage here that is not a `check` replacement. The near-pad idle target as it stood
 * while `speed < landSpeed` was an accept condition: `landSpeed * 0.8`, which is below stall in
 * every tier, so the aeroplane stalls in level flight near the ship and the nose drops on its own.
 */
const sabSubStall = (world) => {
  const real = world.landing.check.bind(world.landing);
  world.landing.idleTarget = (def) => (def.landSpeed || def.stall * 1.5) * 0.8;
  return real;
};

const SAB = { slab: sabOldSlab, mid: sabAmidships, nodir: sabNoDir, huge: sabHuge, substall: sabSubStall };

/**
 * One approach.
 * @param profile  'level' | 'approach' | 'wrongway'
 * @param sab      null or a key of SAB
 */
function attempt(planeId, startDx, holdY, profile, sab) {
  const world = createWorld({ level: LEVEL, seed: 7, save: { planeId, loadout: [null, null, null, null], upgrades: {} } });
  const p = world.player;
  const pad = world.ents.find((e) => e.kind === 'pad');
  if (sab) world.landing.check = SAB[sab](world);

  const west = profile === 'wrongway';
  p.x = pad.x + (west ? startDx : -startDx);
  p.y = DECK_Y + holdY;
  p.ang = west ? Math.PI : 0;
  p.speed = p.def.cruise;

  const bot = profile === 'approach' ? makeAutopilot() : null;
  let t = 0, entrySpeed = null, wentAround = false, stalledNear = 0;
  const limit = profile === 'approach' ? 60 * 240 : 60 * 120;
  while (!world.over && !p.landed && t < limit) {
    if (bot) bot.step(world, 1 / 60);
    else if (!p.script) {
      const hold = clampN((DECK_Y + holdY - p.y) * 0.004, -0.2, 0.2);
      world.setStickAngle(west ? Math.PI - hold : hold);
    }
    if (!p.script) entrySpeed = p.speed;      // the last speed before the settle took over
    world.step(); world.drainEvents();
    if (!west && p.vx < -1) wentAround = true;
    // The stall flag near the ship IN LEVEL FLIGHT is a defect, not a statistic: flyToward
    // answers a stall by dragging the nose down, i.e. the game takes the controls away exactly
    // where the player is trying to place the aeroplane in a 90-unit box. The |ang| filter is
    // load-bearing — stalling out of a deliberate 0.8 rad climb is the flight model working, and
    // the autopilot's go-around does exactly that. Only the level case is the throttle's fault.
    if (!p.script && !p.landed && Math.abs(p.x - pad.x) < 1500 && p.stalling && Math.abs(p.ang) < 0.3) stalledNear++;
    if (!bot && (west ? p.x < pad.x - 3000 : p.x > pad.x + 3000)) break;
    if (bot && p.x > world.level.length - 200) break;
    t++;
  }
  return { landed: p.landed, entrySpeed: p.landed ? entrySpeed : null, wentAround, stalledNear,
           touchdownX: p.landed ? p.x - pad.x : null };
}

function sweep(profile, sab) {
  const rows = [];
  for (const def of PLANES) {
    let landed = 0, first = 0, tried = 0, esLo = Infinity, esHi = -Infinity, tdLo = Infinity, tdHi = -Infinity;
    let stalls = 0;
    for (const dx of STARTS) {
      for (const alt of ALTS) {
        const r = attempt(def.id, dx, alt, profile, sab);
        tried++;
        if (r.stalledNear) stalls++;
        if (r.landed) {
          landed++;
          if (!r.wentAround) first++;
          tdLo = Math.min(tdLo, r.touchdownX); tdHi = Math.max(tdHi, r.touchdownX);
          if (r.entrySpeed != null) { esLo = Math.min(esLo, r.entrySpeed); esHi = Math.max(esHi, r.entrySpeed); }
        }
      }
    }
    rows.push({ id: def.id, cruise: def.cruise, landSpeed: def.landSpeed ?? Math.round(def.stall * 1.5),
                landed, first, tried, esLo, esHi, tdLo, tdHi, stalls });
  }
  return rows;
}

const pad = (s, n) => String(s).padStart(n);
const rng = (lo, hi, n) => pad(isFinite(lo) ? Math.round(lo) + '..' + Math.round(hi) : '-', n);

function report(title, rows, showRows = !a.quiet) {
  const tiersOk = rows.filter((r) => r.landed > 0).length;
  const tot = rows.reduce((n, r) => n + r.landed, 0), att = rows.reduce((n, r) => n + r.tried, 0);
  const fst = rows.reduce((n, r) => n + r.first, 0);
  if (showRows) {
    console.log(`\n${title}`);
    console.log(`plane      tier  cruise  landSpeed   speed at the gate   landed/attempted   first pass   touchdown x - pad.x`);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      console.log(`${r.id.padEnd(10)} ${pad(i + 1, 4)} ${pad(r.cruise, 7)} ${pad(r.landSpeed, 10)} ` +
                  `${rng(r.esLo, r.esHi, 19)}  ${pad(r.landed + '/' + r.tried, 16)}   ` +
                  `${pad(r.first + '/' + r.tried, 10)}   ${rng(r.tdLo, r.tdHi, 12)}`);
    }
  }
  console.log(`${title.padEnd(34)} ${tiersOk}/${rows.length} tiers   ${tot}/${att} landed   ${fst}/${att} without a go-around`);
  return { tiersOk, tot, fst, att, rows };
}

const offDeck = (...sets) => sets.flatMap((s) => s.rows).filter((r) => r.landed && (r.tdLo < -170 || r.tdHi > 170));

const level = report('LEVEL    (crude fixed-altitude pass)', sweep('level', null));
const appr = report('APPROACH (real js/sim/autopilot.js)', sweep('approach', null));
const wrong = report('WRONGWAY (crude pass, flying west)', sweep('wrongway', null));

console.log(`\n("speed at the gate" is the speed on the tick before the settle took over. It is well over`);
console.log(` landSpeed on purpose — arriving fast is allowed now; only position and direction are tested.)`);
console.log(`(the deck is pad.x -170 .. +170; every touchdown above must be inside that or the aeroplane landed on water)`);
// The LEVEL profile is the instrument for this one: it holds altitude by construction, so every
// stall it records is the near-pad throttle's doing and nothing else.
const stalled = level.rows.filter((r) => r.stalls);
const off = offDeck(level, appr);
console.log(off.length ? `OFF-DECK TOUCHDOWNS: ${off.map((r) => r.id).join(', ')}` : `every touchdown, both forward profiles, finished on the deck`);
console.log(wrong.tot === 0 ? `no aeroplane, in any tier, landed while flying away from the ship` : `WRONG-WAY LANDINGS: ${wrong.tot}`);
console.log(stalled.length
  ? `STALLED IN LEVEL FLIGHT NEAR THE SHIP: ${stalled.map((r) => `${r.id} ${r.stalls}/${r.tried}`).join(', ')}`
  : `no tier stalled in level flight within 1500 units of the ship, on any of the ${level.att} passes`);

const clean = appr.tiersOk === PLANES.length && !off.length && wrong.tot === 0 && !stalled.length;

if (a.falsify) {
  if (!clean) {
    console.log(`\nFALSIFY UNSTAGEABLE — the unsabotaged build already fails, so no break proves anything`);
    process.exit(2);
  }
  const results = [];

  // 1. THE SQUARE'S POSITION. Claim: it is at the START of the boat because the settle roll-out
  //    (landSpeed * 1.2 / 2, 148..269 units) has to finish on the deck. Move it amidships and the
  //    fast tiers must roll off the bow. The off-deck check is the instrument.
  console.log(`\n--- FALSIFY 1: the square moved amidships (centred on pad.x, same size) ---`);
  const mid = report('LEVEL    (square amidships)', sweep('level', 'mid'), false);
  const midOff = offDeck(mid);
  console.log(`         off-deck touchdowns: ${midOff.map((r) => r.id).join(', ') || 'none'}` +
              `   worst touchdown x: ${Math.round(Math.max(...mid.rows.map((r) => (isFinite(r.tdHi) ? r.tdHi : -1e9))))}`);
  results.push(['square position', midOff.length > 0]);

  // 2. THE SQUARE'S SIZE. Claim: 90 units is a real target you can miss. Inflate it 5x and the
  //    crude pilot — who is not trying to land — must start landing far more often.
  console.log(`\n--- FALSIFY 2: the square inflated 5x (450 units a side) ---`);
  const huge = report('LEVEL    (square inflated)', sweep('level', 'huge'), false);
  console.log(`         crude-pass ratio: ${level.tot}/${level.att} at 90 units, ${huge.tot}/${huge.att} at 450` +
              `  (x${(huge.tot / Math.max(1, level.tot)).toFixed(2)})`);
  results.push(['square size', huge.tot >= level.tot * 1.5]);

  // 3. THE DIRECTION RULE. Claim: you must be moving toward the ship. Delete it and the wrong-way
  //    profile — which flies straight through the square heading west — must start landing.
  console.log(`\n--- FALSIFY 3: the direction rule deleted ---`);
  const nodir = report('WRONGWAY (direction rule deleted)', sweep('wrongway', 'nodir'), false);
  console.log(`         wrong-way landings: ${wrong.tot}/${wrong.att} with the rule, ${nodir.tot}/${nodir.att} without it`);
  results.push(['direction rule', nodir.tot > 0]);

  // 4. THE GEOMETRY. Claim: a 90-unit square in one specific place is a real target, and the
  //    obvious alternative — "accept anywhere over the boat", the 460x190 slab this rule started
  //    life as — is something a pilot who is not trying to land blunders into.
  console.log(`\n--- FALSIFY 4: accept window replaced by "your AABB overlaps the boat" ---`);
  const slab = report('LEVEL    (overlap the boat)', sweep('level', 'slab'), false);
  console.log(`         crude-pass ratio: ${level.tot}/${level.att} with the square, ${slab.tot}/${slab.att} with the slab` +
              `  (x${(slab.tot / Math.max(1, level.tot)).toFixed(2)})`);
  results.push(['square geometry vs "over the boat"', slab.tot >= level.tot * 1.5]);

  // 5. THE NEAR-PAD THROTTLE. Claim: `landing.idleTarget` sits above stall, so the game does not
  //    take the nose off the player mid-approach. Put it back to the `landSpeed * 0.8` it was
  //    while speed gated the landing, and the level profile's stall counter must go off.
  console.log(`\n--- FALSIFY 5: near-pad idle pushed back below stall ---`);
  const sub = report('LEVEL    (idle below stall)', sweep('level', 'substall'), false);
  const subStalls = sub.rows.filter((r) => r.stalls);
  console.log(`         tiers stalling near the ship: ${subStalls.length}/9 with the idle below stall,` +
              ` ${stalled.length}/9 with it above`);
  results.push(['near-pad idle above stall', subStalls.length > 0]);

  const bad = results.filter(([, ok]) => !ok);
  console.log(bad.length
    ? `\nFALSIFY FAIL — unseen by their instruments: ${bad.map(([n]) => n).join(', ')}`
    : `\nFALSIFY PASS — all ${results.length} sabotages caught: ${results.map(([n]) => n).join(', ')}`);
  process.exit(bad.length ? 1 : 0);
}

process.exit(clean ? 0 : 1);
