#!/usr/bin/env node
/**
 * Tutorial gate. Plain node, no deps, no browser.
 *
 *   node tools/tutorial_gate.mjs [--falsify] [--quiet]
 *
 * Flies each `tutorial` level with a scripted pilot that does the thing each hint asks for,
 * and asserts that every hint in js/ui/tutorial.js advanced because the PLAYER did it
 * (`why === 'done'`), never because the hint timed out. A gate that only checks "the tutorial
 * finished" cannot tell a trigger that fired from one that can never fire — both look green.
 * It also asserts makeTutorial() returns null on a normal level, so the hint layer costs
 * nothing everywhere else.
 *
 * --falsify replaces one hint's trigger with `() => false` and PASSES only if the gate goes
 * red. A check never proven to fail is not evidence (CONTRACTS §13).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const a = { falsify: process.argv.includes('--falsify'), quiet: process.argv.includes('--quiet') };

const { createWorld } = await import(join(ROOT, 'js/sim/world.js'));
const { CAMPAIGN } = await import(join(ROOT, 'js/data/levels.js'));
const { makeTutorial } = await import(join(ROOT, 'js/ui/tutorial.js'));

const KIT = { planeId: 'kestrel', loadout: ['bomb_std', 'rocket', null, null], upgrades: {} };
const G = 900;

/** Where a bomb released now would land in x, for a target at altitude ty. */
function impactX(p, ty) {
  const h = p.y - ty;
  if (h <= 0) return null;
  const vx = p.vx * 0.92, vy = p.vy * 0.92 - 30;
  return p.x + vx * ((vy + Math.sqrt(vy * vy + 2 * G * h)) / G);
}

/* --------------------------------------------------------------- the pilots */
// One per tutorial level, doing exactly what its hints ask: steer, climb, shoot the huts,
// take the balloon; then bomb the boat, fly a level approach, land, take off, collect.

function pilotFlight(w) {
  const p = w.player;
  let best = null, bd = 1e12;
  for (const e of w.ents) {
    if (e.dead || e.team === 0 || e.kind === 'pad') continue;
    const dx = e.x - p.x;
    if (dx < -300) continue;
    const d = Math.hypot(dx, e.y - p.y);
    if (d < bd) { bd = d; best = e; }
  }
  let ang;
  if (w.t < 5) ang = 0.55;                                   // the taught climb
  else if (best) ang = Math.atan2(best.y - p.y, Math.max(best.x - p.x, 120));
  else ang = 0.1;
  const g = w.terrain.heightAt(p.x + 500);
  if (p.y < g + 300) ang = Math.max(ang, 0.7);
  w.setStickAngle(Math.max(-1.2, Math.min(1.2, ang)));
  for (let i = 0; i < 4; i++) w.slots[i] = false;
  if (best && best.kind === 'ground' && p.ammo[0] > 0 && p.cool[0] <= 0) {
    const ix = impactX(p, best.y + best.h);
    if (ix !== null && ix > best.x - best.w - 30 && ix < best.x + best.w + 30) w.slots[0] = true;
  }
}

function pilotLanding(w) {
  const p = w.player;
  for (let i = 0; i < 4; i++) w.slots[i] = false;
  if (p.script) return;
  if (p.landed) {
    if (w.__landT === undefined) w.__landT = w.t;
    if (w.t > w.__landT + 2.5) w.takeOff();
    return;
  }
  const pad = w.ents.find((e) => e.kind === 'pad' && !e.dead);
  const boat = w.ents.find((e) => e.kind === 'ground' && !e.dead);
  const landDone = (w.mission.objectives.find((o) => o.type === 'land') || {}).done;
  let ang;
  if (boat) {
    ang = Math.atan2(boat.y + 700 - p.y, Math.max(boat.x - 1200 - p.x, 200));
    if (p.ammo[0] > 0 && p.cool[0] <= 0) {
      const ix = impactX(p, boat.y + boat.h);
      if (ix !== null && ix > boat.x - boat.w - 40 && ix < boat.x + boat.w + 40) w.slots[0] = true;
    }
    if (p.x > boat.x - 900) ang = Math.atan2(boat.y - p.y, Math.max(boat.x - p.x, 150));
  } else if (pad && !landDone) {
    // Descend early, arrive level — see DESIGN_NOTES, diving on final defeats the approach.
    const run = pad.x - 1100 - p.x;
    ang = run > 0
      ? Math.max(-0.5, Math.min(0.5, Math.atan2((pad.y - p.y) * 1.2, Math.max(run, 400))))
      : Math.max(-0.05, Math.min(0.05, (pad.y - p.y) * 0.0012));
  } else {
    const b = w.ents.find((e) => e.kind === 'balloon' && !e.dead);
    ang = b ? Math.atan2(b.y - p.y, Math.max(b.x - p.x, 150)) : 0.2;
  }
  const g = w.terrain.heightAt(p.x + 400);
  if (p.y < g + 120) ang = Math.max(ang, 0.7);
  w.setStickAngle(Math.max(-1.2, Math.min(1.2, ang)));
}

const PILOT = { 't-01': pilotFlight, 't-02': pilotLanding };

/* ------------------------------------------------------------------- sabotage */

/**
 * Replace the first hint trigger that is not the one already satisfied at t=0 with a
 * predicate that can never be true. If the gate stays green, it is not watching the triggers.
 */
function sabotage(tut) {
  const src = tut;
  let killed = false;
  return new Proxy(src, {
    get(o, k) {
      if (k === 'step') {
        return (w, dt) => {
          if (!killed && o.stepId === 'climb') { killed = true; o.__jam = true; }
          if (o.__jam && o.stepId === 'climb') return;      // the trigger never fires
          return o.step(w, dt);
        };
      }
      const v = o[k];
      return typeof v === 'function' ? v.bind(o) : v;
    },
  });
}

/* ----------------------------------------------------------------------- run */

let fails = 0;
const levels = CAMPAIGN.filter((l) => l.tutorial && PILOT[l.id]);
if (!levels.length) { console.log('no tutorial levels found'); process.exit(2); }

for (const level of levels) {
  const w = createWorld({ level, seed: level.seed, save: KIT });
  const real = makeTutorial(w);
  if (!real) { console.log(`FAIL ${level.id}: makeTutorial returned null for a tutorial level`); fails++; continue; }
  const tut = a.falsify && level.id === 't-01' ? sabotage(real) : real;

  const pilot = PILOT[level.id];
  const seen = [];
  let last = tut.stepId, t = 0;
  while (t < 60 * 200) {
    pilot(w);
    tut.step(w, 1 / 60);
    w.step(); w.drainEvents();
    if (tut.stepId !== last) { seen.push(`${last}:${tut.why}`); last = tut.stepId; }
    t++;
    if (tut.done && w.over) break;
  }
  const timedOut = seen.filter((x) => x.endsWith(':timeout'));
  const ok = tut.done && !timedOut.length && w.over === 'win';
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${level.id} "${level.name}": ${(t / 60).toFixed(1)}s outcome=${w.over || 'timeout'} ` +
              `hintsDone=${tut.done} steps=[${seen.join(', ')}]`);
  if (!ok && !a.quiet) {
    if (!tut.done) console.log(`       the hint script never finished — stuck on '${tut.stepId}'`);
    for (const s of timedOut) console.log(`       hint '${s.split(':')[0]}' advanced on a TIMEOUT, not on the player doing it`);
    if (w.over !== 'win') console.log(`       the level was not completed by the scripted pilot (outcome ${w.over || 'timeout'})`);
  }
}

// The hint layer must cost nothing on a normal level.
const normal = CAMPAIGN.find((l) => !l.tutorial);
const nullOk = makeTutorial(createWorld({ level: normal, seed: normal.seed, save: KIT })) === null;
if (!nullOk) fails++;
console.log(`${nullOk ? 'PASS' : 'FAIL'} makeTutorial(${normal.id}) === null`);

if (a.falsify) {
  const ok = fails > 0;
  console.log(`\nFALSIFY: jammed the t-01 'climb' trigger — gate went ${ok ? 'RED' : 'GREEN'}`);
  console.log(ok ? 'FALSIFY PASS — the gate watches the triggers, not just the finish'
                 : 'FALSIFY FAIL — the gate passed a tutorial with a trigger that can never fire');
  process.exit(ok ? 0 : 1);
}
process.exit(fails ? 1 : 0);
