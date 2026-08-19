#!/usr/bin/env node
// S2-F's ROUTE SWEEP. `js/lanes.js` is pure — no THREE, no DOM — so the router the browser flies
// is the router this file runs, and the ladder's ordering is measured over thousands of trips
// instead of asserted from four numbers that looked reasonable.
//
//   node tools/sim_s2f.mjs            # the sweep
//   node tools/sim_s2f.mjs --falsify  # …and prove each check can fail
//
// What it has to establish, because the whole design rests on it:
//
//   1. every `lane` waypoint really is ON a lane — the right altitude for its axis, and a cross
//      coordinate on the corridor lattice, on the correct side for the direction of travel
//   2. the autopilot is ALWAYS the long way round: route length > straight-line length, at every
//      rung, on every trip
//   3. the ladder is monotone in TIME — rung 3 beats rung 2 beats rung 1 beats rung 0
//   4. hand-flying still wins. A ladder whose top rung beats a thumb has deleted the game.

import { planLaneRoute, directLength, ALT, CORR, LANE_SEP, LOT, lanePhase, AUTO_LEVELS }
  from '../js/lanes.js';
import { WORLD_SEED, CRAFT_SPEED } from '../js/config.js';

const FALSIFY = process.argv.includes('--falsify');
const SEED = WORLD_SEED;
const MAXFWD = CRAFT_SPEED.wisp;          // the free hull — the worst case for every rung
const N = 4000;

// A deterministic pair generator, so two runs sweep the same trips.
function* trips(n) {
  let s = 0x1234567;
  const r = () => { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return (s >>> 0) / 4294967296; };
  for (let k = 0; k < n; k++) {
    const span = 300 + r() * 5200;
    const a = r() * Math.PI * 2;
    const from = { x: (r() - 0.5) * 8000, y: 40 + r() * 180, z: (r() - 0.5) * 8000 };
    yield [from, { x: from.x + Math.cos(a) * span, y: 30 + r() * 200, z: from.z + Math.sin(a) * span }];
  }
}

// ── check 1: is this waypoint on a lane? ──────────────────────────────────
// Written as a predicate over a waypoint PAIR (where the leg came from, where it goes), because a
// lane has a direction and the side of the corridor is what encodes it.
function onLane(prev, wp) {
  const dx = wp.x - prev.x, dz = wp.z - prev.z;
  // A lane leg moves along ONE axis exactly. Inferring the axis from which delta is larger would
  // pass a diagonal, which is the one thing a lane can never be.
  if (Math.abs(dx) > 1e-9 && Math.abs(dz) > 1e-9) return { ok: false, why: `a lane leg moved on both axes (${dx.toFixed(2)}, ${dz.toFixed(2)})` };
  const alongX = Math.abs(dx) > Math.abs(dz);
  const fam = ALT.indexOf(wp.y);
  if (fam < 0) return { ok: false, why: `altitude ${wp.y} is not a lane altitude` };
  if (((fam & 1) === 0) !== alongX) return { ok: false, why: `alt ${wp.y} runs along ${(fam & 1) ? 'Z' : 'X'} but the leg runs along ${alongX ? 'X' : 'Z'}` };
  if (wp.y !== prev.y) return { ok: false, why: 'a lane leg changed altitude' };
  const cross = alongX ? wp.z : wp.x;
  const dir = alongX ? Math.sign(dx) : Math.sign(dz);
  const centre = cross - dir * LANE_SEP;
  const p = lanePhase(fam, SEED);
  const off = Math.abs(centre - (p + Math.round((centre - p) / CORR) * CORR));
  if (off > 1e-6) return { ok: false, why: `cross ${cross.toFixed(2)} is ${off.toFixed(2)} m off the corridor lattice` };
  return { ok: true, centre };
}

function measure(from, to, level, mutate) {
  let plan = planLaneRoute(from, to, { seed: SEED, level });
  if (mutate) plan = mutate(plan);
  const spec = AUTO_LEVELS[level];
  let bad = null, laneMetres = 0;
  let p = from;
  for (const q of plan.legs) {
    if (q.kind === 'lane') {
      const r = onLane(p, q);
      if (!r.ok && !bad) bad = r.why;
      laneMetres += Math.hypot(q.x - p.x, q.z - p.z);
    }
    p = q;
  }
  const direct = directLength(from, to);
  return { plan, bad, laneMetres, direct,
    time: plan.total / (spec.speed * MAXFWD),
    handTime: direct / MAXFWD };
}

const rows = [];
let laneFail = 0, shortcut = 0, checked = 0;
const times = AUTO_LEVELS.map(() => []);
const lanePct = AUTO_LEVELS.map(() => []);
for (const [from, to] of trips(N)) {
  for (let lv = 0; lv < AUTO_LEVELS.length; lv++) {
    const m = measure(from, to, lv);
    checked++;
    if (m.bad) { laneFail++; if (laneFail < 4) rows.push(`  L${lv} ${m.bad}`); }
    if (m.plan.total <= m.direct) shortcut++;
    times[lv].push(m.time);
    lanePct[lv].push(m.laneMetres / m.plan.total);
  }
}

const med = a => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

console.log(`\nNEONHAUL S2-F — lane route sweep · ${N} trips x ${AUTO_LEVELS.length} rungs = ${checked} routes`);
console.log(`seed 0x${SEED.toString(16)} · hull wisp, MAX_FWD ${MAXFWD} m/s\n`);
console.log('  rung        alt X/Z   speed   median time   median on-lane   vs hand-flown');
for (let lv = 0; lv < AUTO_LEVELS.length; lv++) {
  const s = AUTO_LEVELS[lv];
  const t = med(times[lv]);
  const hand = med(trips(N) && [...trips(N)].map(([a, b]) => directLength(a, b) / MAXFWD));
  console.log(`  L${lv} ${s.name.padEnd(9)} ${String(ALT[s.famX]).padStart(3)}/${String(ALT[s.famZ]).padStart(3)}   `
    + `${s.speed.toFixed(2)}    ${t.toFixed(1)} s        ${(mean(lanePct[lv]) * 100).toFixed(1)} %`
    + `          ${(t / hand).toFixed(2)}x slower`);
}

const monotone = times.every((_, lv) => lv === 0 || med(times[lv]) < med(times[lv - 1]));
const handWins = med(times[times.length - 1]) > med([...trips(N)].map(([a, b]) => directLength(a, b) / MAXFWD));

console.log('');
const line = (name, pass, det) => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${det}`);
line('S1 every `lane` waypoint is on a real corridor at a real lane altitude',
  laneFail === 0, `${checked} routes checked, ${laneFail} illegal lane legs` + (rows.length ? `\n${rows.join('\n')}` : ''));
line('S2 the autopilot is always the long way round',
  shortcut === 0, `${shortcut} of ${checked} routes came out no longer than the straight line`);
line('S3 the ladder is monotone in time',
  monotone, AUTO_LEVELS.map((s, lv) => `L${lv} ${med(times[lv]).toFixed(1)} s`).join('  >  '));
line('S4 hand-flying still beats the top rung',
  handWins, `L3 median ${med(times[3]).toFixed(1)} s against a hand-flown ${med([...trips(N)].map(([a, b]) => directLength(a, b) / MAXFWD)).toFixed(1)} s`);

if (FALSIFY) {
  console.log('\n── FALSIFICATION ─────────────────────────────────────────────────────');
  // F1 — nudge a lane waypoint off the lattice by 10 m. S1 must catch it.
  let caught = 0, seen = 0;
  for (const [from, to] of trips(200)) {
    const m = measure(from, to, 2, plan => {
      const i = plan.legs.findIndex(l => l.kind === 'lane');
      if (i < 0) return plan;
      const legs = plan.legs.map((l, k) => (k === i ? { ...l, x: l.x + 10, z: l.z + 10 } : l));
      return { ...plan, legs };
    });
    seen++;
    if (m.bad) caught++;
  }
  line('F1 S1 catches a lane waypoint nudged 10 m off the lattice',
    caught === seen, `${caught} of ${seen} corrupted routes rejected`);

  // F2 — put a lane leg at an altitude that is not a lane altitude.
  let c2 = 0, s2 = 0;
  for (const [from, to] of trips(200)) {
    const m = measure(from, to, 2, plan => {
      const i = plan.legs.findIndex(l => l.kind === 'lane');
      if (i < 0) return plan;
      return { ...plan, legs: plan.legs.map((l, k) => (k === i ? { ...l, y: 111 } : l)) };
    });
    s2++;
    if (m.bad) c2++;
  }
  line('F2 S1 catches a lane leg flown at 111 m, which is not a lane altitude',
    c2 === s2, `${c2} of ${s2} rejected`);

  // F3 — S2 must be able to see a route that IS a shortcut. Replace the plan with the straight
  // line and confirm the "always longer" check fails.
  let c3 = 0, s3 = 0;
  for (const [from, to] of trips(200)) {
    const m = measure(from, to, 0, plan => ({ ...plan, total: directLength(from, to) * 0.9 }));
    s3++;
    if (m.plan.total <= m.direct) c3++;
  }
  line('F3 S2 catches a route shorter than the straight line',
    c3 === s3, `${c3} of ${s3} shortcut routes detected — S2’s zero is a real zero`);

  // F4 — the corridor lattice really is over the ROADS. materials.js paints the road centreline at
  // multiples of LOT; if a phase were not a multiple of LOT the lanes would run over rooftops.
  const phases = ALT.map((_, a) => lanePhase(a, SEED));
  const allOnRoad = phases.every(p => Math.abs(p / LOT - Math.round(p / LOT)) < 1e-9);
  const offRoad = phases.map(p => p + 7).every(p => Math.abs(p / LOT - Math.round(p / LOT)) < 1e-9);
  line('F4 every corridor centre lands on a road centreline (a multiple of LOT)',
    allOnRoad && !offRoad, `phases [${phases.join(', ')}] against LOT ${LOT} — all multiples: ${allOnRoad}; `
    + `the same test on the phases + 7 m: ${offRoad} (it must be false, or the test passes anything)`);
}

const failed = laneFail > 0 || shortcut > 0 || !monotone || !handWins;
process.exit(failed ? 1 : 0);
