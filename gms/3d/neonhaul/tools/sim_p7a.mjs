// tools/sim_p7a.mjs — the P7a balance harness.
//
// Runs whole courier careers through the REAL js/economy.js, js/missions.js, js/zones.js and
// js/city.js in node, with a virtual clock and an analytic flight model, and reports the
// distributions the phase is actually judged on: credits per run, credits per minute, time to
// tier 2, time to afford every shop line, the unreachable-job rate and the idle-with-nothing-to-do
// rate. No browser, no renderer, no puppeteer. A thousand careers take a couple of seconds, which
// is why the P7a numbers are measured instead of asserted.
//
// It is an ANALYTIC flight model, and that is a stated limitation, not an oversight: it prices a
// leg as distance / cruise speed plus a fixed accel and dock overhead, so it cannot see a wall the
// autopilot gets stuck on. It is a balance instrument. The in-browser `?auto=1` soak is the thing
// that tests the flying, and P7a cannot run it because main.js belongs to another agent this phase
// (docs/P7A_WIRING.md).
//
// usage:
//   node tools/sim_p7a.mjs                     # the default report
//   node tools/sim_p7a.mjs --runs=400 --minutes=25
//   node tools/sim_p7a.mjs --json=out.json
//   node tools/sim_p7a.mjs --policy=chain --runs=1 --trace

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const { CityModel } = await import(resolve(ROOT, 'js/city.js'));
const { ZoneField, KIND } = await import(resolve(ROOT, 'js/zones.js'));
const { Missions } = await import(resolve(ROOT, 'js/missions.js'));
const E = await import(resolve(ROOT, 'js/economy.js'));
const { FLIGHT } = await import(resolve(ROOT, 'js/config.js'));

const J = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

export function loadWorld(seed) {
  const landmarks = J('data/landmarks.json');
  const names = J('data/names.json');
  const clients = J('data/clients.json').clients;
  const city = new CityModel({ landmarks, names, seed: seed === undefined ? 0x4e454f4e : seed });
  const zones = new ZoneField({ city, clients });
  return { city, zones, clients, landmarks, names };
}

// ── the analytic flight model ──────────────────────────────────────────────
// One leg: accelerate, cruise, decelerate, then the dock sequence. The overheads are §6.2's and
// §7.2's own numbers rather than invented ones:
//   ACCEL_PENALTY  1.35 s from rest to cruise and the same back (§6.2's ACC_FWD = 0.74 x MAX_FWD)
//   CLIMB          vertical is a separate axis capped at MAX_VERT (§6.2), so a 300 m climb costs
//                  real time and a pad at 380 m is genuinely a longer job than a pad at 40 m
//   DOCK           0.6 s hold + 0.5 s ease (§7.2) + panel read + 1.2 s re-dock grace
const FLY = {
  ACCEL: 2.7,
  DOCK: 0.6 + 0.5 + 1.2,
  PANEL: 2.2,                 // a player reading the panel and pressing ACCEPT
  VERT: FLIGHT.MAX_VERT,
};

function legTime(from, to, speed, skill = 1) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  const dy = Math.abs((to.y === undefined ? from.y : to.y) - from.y);
  const horiz = d / (speed * skill);
  const vert = dy / FLY.VERT;
  // The axes overlap — you climb while you fly — so the leg is the longer of the two plus a share
  // of the shorter, never their sum.
  return Math.max(horiz, vert) + Math.min(horiz, vert) * 0.25 + FLY.ACCEL;
}

// ── the career simulation ──────────────────────────────────────────────────
//
// Policies. `hop` is the natural loop the game is designed around (the pickup is the pad you are
// standing on, so after a delivery you take the next job from where you landed). The other four
// exist to answer one question: does any single repeatable route dominate?
// `reckless` never charges voluntarily, which is the only way to exercise §7.4.3's tow.
const POLICIES = ['hop', 'chain', 'greedy', 'hubcamp', 'repeat', 'dawdle', 'reckless'];

export function runCareer({
  seed = 0x4e454f4e, policy = 'hop', minutes = 20, skill = 1.0, dwell = 1.0,
  world = null, trace = false, buy = false, rng = Math.random,
} = {}) {
  const W = world || loadWorld(seed);
  const { zones, city, clients } = W;
  const missions = new Missions({ zones, city, clients, seed: city.seed });
  const state = E.newState();

  const hub = zones.padAt(...zones.hubChunk);
  let pad = hub;
  let pos = { x: hub.x, y: hub.y, z: hub.z };
  let t = 0;
  const horizon = minutes * 60;

  const log = [];
  const ev = [];
  let idleSeconds = 0, flightSeconds = 0, dockSeconds = 0, towEvents = 0, strandedTicks = 0;
  let tier2At = null, tier2Jobs = null;
  const affordAt = {};
  const purchases = [];
  let repeatPad = null;

  const note = (kind, extra) => { if (trace) ev.push({ t: +t.toFixed(1), kind, ...extra }); };

  // Charge as a RHYTHM, not an interrupt (§7.4.0 target 2): divert at 25 %, exactly what §2.6's
  // autopilot REFUEL state does, so the sim and the soak agree on the policy being measured.
  function maybeCharge() {
    if (policy === 'reckless') return;            // never tops up — the tow is the only refill
    if (E.cellFrac(state) >= 0.25) return;
    const near = pad.charge ? { pad, dist: 0 } : zones.nearestCharge(pos.x, pos.z);
    if (!near) return;
    if (near.dist > 0) {
      flyTo(near.pad);
      pad = near.pad;
    }
    t += FLY.DOCK * dwell; dockSeconds += FLY.DOCK * dwell;
    const r = E.buyCharge(state);
    note('charge', { units: +r.units.toFixed(1), cost: r.cost, credits: state.credits });
    // §7.4.0 target 4 — this is the state the phase must never be able to reach.
    if (state.cellUnits <= 0 && state.credits <= 0) strandedTicks++;
  }

  // Burn `dt` seconds of cell. Returns true if the cell went flat and the tow fired, in which case
  // ONLY the seconds actually flown were charged and the caller still owes the rest of its leg.
  //
  // **This function is the harness's own instance of the project's dominant failure mode and it
  // was caught by an impossible result rather than by inspection.** The first version discarded
  // the unflown remainder of the leg on a tow, so a tow TELEPORTED the craft to its destination —
  // and `reckless` (never pay for fuel, take the free tow every time) came out as the highest
  // earning policy in the game at 852 CRD/min. A strategy beating every other strategy is not a
  // finding, it is a broken experiment. See docs/P7A_NOTES.md.
  function burn(dt, flying) {
    const step = 0.5;
    let left = dt;
    while (left > 0) {
      const s = Math.min(step, left);
      const r = E.tickCell(state, s, { speed: flying ? E.maxFwd(state) : 0, boosting: false });
      if (r === 'flat') {
        // §7.4.3's tow: free, plus 15 units. The player limps at 12 m/s to the nearest CHARGE pad
        // and RESUMES FROM THERE — the tow is a detour, never a shortcut.
        const near = zones.nearestCharge(pos.x, pos.z);
        const towDist = near ? near.dist : 0;
        const towT = towDist / E.CELL.TOW_SPEED;
        t += towT; flightSeconds += towT;
        if (near) { pos = { x: near.pad.x, y: near.pad.y, z: near.pad.z }; pad = near.pad; }
        E.tow(state);
        towEvents++;
        note('tow', { dist: Math.round(towDist), credits: state.credits, cell: +state.cellUnits.toFixed(1) });
        // `reckless` deliberately flies on the tow's 15 free units alone — maximum tow pressure,
        // which is how the "nothing can strand you" clause gets exercised hundreds of times.
        if (policy !== 'reckless') E.buyCharge(state);
        if (state.cellUnits <= 0 && state.credits <= 0) strandedTicks++;
        return true;
      }
      t += s; left -= s;
      if (flying) flightSeconds += s; else dockSeconds += s;
    }
    return false;
  }

  // Fly to a point, re-planning from wherever a tow drops us. The guard is a harness safety net:
  // if it ever trips, the tow is not making progress and that is a balance failure, not a rounding
  // one, so it is counted rather than swallowed.
  let towLoops = 0;
  function flyTo(target) {
    for (let i = 0; i < 24; i++) {
      const dt = legTime(pos, target, E.maxFwd(state), skill);
      if (!burn(dt, true)) { pos = { x: target.x, y: target.y === undefined ? pos.y : target.y, z: target.z }; return true; }
      towLoops++;
    }
    pos = { x: target.x, y: target.y === undefined ? pos.y : target.y, z: target.z };
    return false;
  }

  function recordAfford() {
    for (const id of Object.keys(E.CRAFT)) {
      if (id === 'wisp' || affordAt[id] !== undefined) continue;
      if (state.credits >= E.CRAFT[id].price && E.unlockedCraft(state.tier).includes(id)) affordAt[id] = t / 60;
    }
    for (const line of Object.keys(E.UPGRADES)) {
      const k = 'up_' + line;
      if (affordAt[k] !== undefined) continue;
      const p = E.upgradePrice(state, line);
      if (p !== null && state.credits >= p) affordAt[k] = t / 60;
    }
  }

  // pick the jobs to accept at `pad` from `board`
  function choose(board) {
    const free = E.cargoSlots(state) - E.occupiedSlots(state);
    const ok = board.filter(j => missions.canAccept(j, state).ok);
    if (!ok.length) return [];
    if (policy === 'greedy') return [ok.slice().sort((a, b) => b.base - a.base)[0]];
    if (policy === 'hubcamp') return [ok.slice().sort((a, b) => a.km - b.km)[0]];
    if (policy === 'chain') {
      // fill the hold: take the cheapest-slot jobs whose destinations are closest together
      const sorted = ok.slice().sort((a, b) => a.parcel.slots - b.parcel.slots || a.km - b.km);
      const take = [];
      let room = free;
      for (const j of sorted) {
        if (j.parcel.slots > room) continue;
        take.push(j); room -= j.parcel.slots;
        if (room <= 0) break;
      }
      return take;
    }
    return [ok[Math.floor(rng() * ok.length) % ok.length]];    // hop / dawdle / repeat
  }

  while (t < horizon) {
    maybeCharge();

    if (policy === 'repeat') {
      // The degenerate strategy: find one pad and grind it forever, returning to it after every
      // delivery. If THIS beats the natural loop, the game has a dominant route.
      if (!repeatPad) repeatPad = pad;
      if (pad.key !== repeatPad.key) {
        flyTo(repeatPad);
        pad = repeatPad;
        t += FLY.DOCK * dwell; dockSeconds += FLY.DOCK * dwell;
      }
    }
    if (policy === 'hubcamp' && pad.key !== hub.key) {
      flyTo(hub);
      pad = hub;
      t += FLY.DOCK * dwell; dockSeconds += FLY.DOCK * dwell;
    }

    missions.lock(pad.key);
    const board = missions.board(pad, state, t);
    const take = choose(board);
    missions.lock(null);

    if (!take.length) {
      // Nothing on this pad's board can be accepted. This is the "idle with nothing to do" state
      // and the time spent leaving it is the cost the harness reports.
      const alt = zones.nearest(pos.x, pos.z, p => p.kind === KIND.PAD && p.key !== pad.key, 2400);
      if (!alt) { idleSeconds += 30; t += 30; continue; }
      const t0 = t;
      flyTo(alt.pad);
      idleSeconds += (t - t0) + FLY.DOCK;
      t += FLY.DOCK * dwell; dockSeconds += FLY.DOCK * dwell;
      pad = alt.pad;
      continue;
    }

    for (const j of take) {
      t += FLY.PANEL * dwell; dockSeconds += FLY.PANEL * dwell;
      missions.accept(j, state, t);
      note('accept', { km: j.km, base: j.base, slots: j.parcel.slots, rush: j.rush, dest: j.dest.name });
    }
    t += FLY.DOCK * dwell; dockSeconds += FLY.DOCK * dwell;

    // route: always fly to the nearest outstanding destination
    while (state.cargo.length) {
      maybeCharge();
      let best = null, bestD = Infinity;
      for (const p of state.cargo) {
        const d = Math.hypot(p.dest.x - pos.x, p.dest.z - pos.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      const target = best.dest;
      flyTo(target);
      t += FLY.DOCK * dwell; dockSeconds += FLY.DOCK * dwell;
      const destPad = zones.padAt(...target.key.split(',').map(Number));
      const res = missions.deliver(destPad, state, t);
      if (res.ok) {
        pad = destPad;
        for (const r of res.receipts) {
          log.push({
            t: t / 60, credits: r.credits, base: r.base, km: r.km, risk: r.risk,
            elapsed: r.elapsed, limit: r.limit, timeBonus: r.timeBonus, chainBonus: r.chainBonus,
            rushMul: r.rushMul, othersHeld: r.othersHeld, overdue: r.overdue,
          });
        }
        note('deliver', { credits: res.credits, lifetime: state.lifetime, tier: state.tier });
        if (tier2At === null && state.tier >= 2) { tier2At = t / 60; tier2Jobs = state.stats.delivered; }
        recordAfford();
        if (buy) {
          // spend on the cheapest upgrade the moment it is affordable, so the run measures a
          // progressing player rather than a hoarder
          const opts = Object.keys(E.UPGRADES)
            .map(l => ({ l, p: E.upgradePrice(state, l) }))
            .filter(o => o.p !== null && state.credits >= o.p)
            .sort((a, b) => a.p - b.p);
          if (opts.length) {
            const r = E.buyUpgrade(state, opts[0].l);
            if (r.ok) purchases.push({ t: t / 60, line: opts[0].l, level: r.level, price: r.price });
          }
        }
      } else break;
      if (t >= horizon) break;
    }
  }

  const mins = t / 60;
  const earned = state.lifetime;
  return {
    policy, seed, minutes: +mins.toFixed(2),
    jobs: state.stats.delivered, lifetime: earned, credits: state.credits,
    crdPerMin: +(earned / Math.max(1e-6, mins)).toFixed(1),
    crdPerJob: state.stats.delivered ? +(earned / state.stats.delivered).toFixed(1) : 0,
    tier: state.tier, tier2At, tier2Jobs,
    tows: towEvents, towLoops, stranded: strandedTicks,
    idleSeconds: +idleSeconds.toFixed(1), idleRate: +(idleSeconds / t).toFixed(4),
    flightSeconds: +flightSeconds.toFixed(1), dockSeconds: +dockSeconds.toFixed(1),
    fuelSpent: state.stats.spentFuel,
    fuelShare: earned ? +(state.stats.spentFuel / earned).toFixed(4) : 0,
    unreachable: missions.stats(),
    affordAt, purchases, log, events: ev, state,
  };
}

// ── statistics ─────────────────────────────────────────────────────────────
const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const i = clampI((s.length - 1) * p, 0, s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return +(s[lo] + (s[hi] - s[lo]) * (i - lo)).toFixed(2);
};
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : null);
function dist(a) {
  return { n: a.length, mean: mean(a), p05: q(a, 0.05), p50: q(a, 0.5), p95: q(a, 0.95), min: q(a, 0), max: q(a, 1) };
}

export function sweep({ runs = 300, minutes = 20, policies = POLICIES, seeds = 12 } = {}) {
  const out = {};
  const worlds = new Map();
  for (const policy of policies) {
    const rows = [];
    for (let i = 0; i < runs; i++) {
      const seed = (0x4e454f4e + (i % seeds) * 7919) | 0;
      if (!worlds.has(seed)) worlds.set(seed, loadWorld(seed));
      // skill and dwell vary the "player": 0.72 is someone still learning the sticks, 1.0 is
      // someone flying the cruise line properly. `dawdle` doubles the time spent on pads.
      const skill = policy === 'dawdle' ? 0.72 : 0.78 + (i % 7) * 0.045;
      const dwell = policy === 'dawdle' ? 2.4 : 1.0;
      let seq = i * 2654435761 % 4294967296;
      const rng = () => ((seq = (seq * 1103515245 + 12345) % 2147483648) / 2147483648);
      rows.push(runCareer({ seed, policy, minutes, skill, dwell, world: worlds.get(seed), rng }));
    }
    const perJob = [];
    for (const r of rows) for (const l of r.log) perJob.push(l.credits);
    out[policy] = {
      runs: rows.length,
      crdPerMin: dist(rows.map(r => r.crdPerMin)),
      crdPerJob: dist(rows.map(r => r.crdPerJob)),
      earningsPerRun: dist(rows.map(r => r.lifetime)),
      payPerDelivery: dist(perJob),
      jobs: dist(rows.map(r => r.jobs)),
      tier2Minutes: dist(rows.filter(r => r.tier2At !== null).map(r => r.tier2At)),
      tier2Jobs: dist(rows.filter(r => r.tier2Jobs !== null).map(r => r.tier2Jobs)),
      tier2Reached: rows.filter(r => r.tier2At !== null).length / rows.length,
      idleRate: dist(rows.map(r => r.idleRate)),
      fuelShare: dist(rows.map(r => r.fuelShare)),
      tows: dist(rows.map(r => r.tows)),
      stranded: rows.reduce((s, r) => s + r.stranded, 0),
      unreachableRate: dist(rows.map(r => r.unreachable.unreachableRate)),
      timeBonusMean: mean(rows.flatMap(r => r.log.map(l => l.timeBonus))),
      chainBonusMean: mean(rows.flatMap(r => r.log.map(l => l.chainBonus))),
      overdueRate: (() => { const all = rows.flatMap(r => r.log); return all.length ? +(all.filter(l => l.overdue).length / all.length).toFixed(4) : 0; })(),
    };
  }
  return out;
}

// time-to-afford, from a single long non-buying career per seed
export function affordTable({ minutes = 90, seeds = 8, policy = 'hop' } = {}) {
  const rows = [];
  for (let i = 0; i < seeds; i++) {
    const seed = (0x4e454f4e + i * 7919) | 0;
    let seq = (i + 1) * 22695477 % 4294967296;
    const rng = () => ((seq = (seq * 1103515245 + 12345) % 2147483648) / 2147483648);
    rows.push(runCareer({ seed, policy, minutes, skill: 0.85, rng }));
  }
  const keys = new Set();
  for (const r of rows) for (const k of Object.keys(r.affordAt)) keys.add(k);
  const out = {};
  for (const k of keys) {
    const vals = rows.map(r => r.affordAt[k]).filter(v => v !== undefined);
    out[k] = { reachedIn: vals.length + '/' + rows.length, minutes: dist(vals) };
  }
  return out;
}

// The same careers, but SPENDING: buy the cheapest available upgrade the moment it is affordable.
// "Time to afford" measured on a hoarder overstates progression; this is what a player who
// actually shops experiences, and it is where the L2/L3 prices show up.
export function progression({ minutes = 90, seeds = 8 } = {}) {
  const steps = new Map();
  for (let i = 0; i < seeds; i++) {
    const seed = (0x4e454f4e + i * 7919) | 0;
    let seq = (i + 3) * 22695477 % 4294967296;
    const rng = () => ((seq = (seq * 1103515245 + 12345) % 2147483648) / 2147483648);
    const r = runCareer({ seed, policy: 'hop', minutes, skill: 0.85, buy: true, rng });
    const seen = new Map();
    for (const p of r.purchases) {
      const k = p.line + ' L' + p.level;
      if (!seen.has(k)) seen.set(k, p);
    }
    for (const [k, p] of seen) {
      if (!steps.has(k)) steps.set(k, { price: p.price, at: [] });
      steps.get(k).at.push(p.t);
    }
  }
  const out = {};
  for (const [k, v] of [...steps.entries()].sort((a, b) => a[1].price - b[1].price)) {
    out[k] = { price: v.price, reachedIn: v.at.length + '/' + seeds, minutes: dist(v.at) };
  }
  return out;
}

// ── cli ────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => {
    const hit = process.argv.find(a => a.startsWith('--' + k + '='));
    return hit === undefined ? d : hit.split('=').slice(1).join('=');
  };
  const runs = +arg('runs', 240);
  const minutes = +arg('minutes', 20);
  const only = arg('policy', null);
  const trace = process.argv.includes('--trace');

  if (trace) {
    const r = runCareer({ policy: only || 'hop', minutes, trace: true, skill: 0.85 });
    for (const e of r.events) console.log(JSON.stringify(e));
    console.log(JSON.stringify({ jobs: r.jobs, lifetime: r.lifetime, crdPerMin: r.crdPerMin, tier2At: r.tier2At, tier2Jobs: r.tier2Jobs, tows: r.tows, idleRate: r.idleRate }, null, 2));
    process.exit(0);
  }

  const t0 = Date.now();
  const s = sweep({ runs, minutes, policies: only ? [only] : POLICIES });
  const afford = affordTable({});
  const prog = progression({});
  const report = { at: new Date().toISOString(), runs, minutes, ms: Date.now() - t0, policies: s, afford, progression: prog };

  const pad = (v, n) => String(v).padStart(n);
  console.log(`\nNEONHAUL P7a balance sweep — ${runs} careers x ${minutes} min per policy  (${report.ms} ms)\n`);
  console.log('policy    CRD/min(p05/p50/p95)      CRD/job   jobs  tier2:min  tier2:jobs  idle%  fuel%  tows  stranded');
  for (const [k, v] of Object.entries(s)) {
    console.log(
      k.padEnd(9) +
      pad(v.crdPerMin.p05, 6) + '/' + pad(v.crdPerMin.p50, 6) + '/' + pad(v.crdPerMin.p95, 6) + '   ' +
      pad(v.crdPerJob.p50, 7) + pad(v.jobs.p50, 7) + pad(v.tier2Minutes.p50, 10) + pad(v.tier2Jobs.p50, 12) +
      pad((v.idleRate.p50 * 100).toFixed(1), 7) + pad((v.fuelShare.p50 * 100).toFixed(1), 7) +
      pad(v.tows.p50, 6) + pad(v.stranded, 10));
  }
  const meds = Object.entries(s).map(([k, v]) => [k, v.crdPerMin.p50]);
  const top = meds.slice().sort((a, b) => b[1] - a[1]);
  console.log(`\ndominance: best=${top[0][0]} ${top[0][1]} CRD/min, worst=${top[top.length - 1][0]} ${top[top.length - 1][1]}, ratio ${(top[0][1] / top[top.length - 1][1]).toFixed(2)}x`);
  console.log('\ntime to afford (median minutes, non-buying `hop` career):');
  for (const [k, v] of Object.entries(afford)) console.log('  ' + k.padEnd(12) + pad(v.minutes.p50, 8) + '   reached ' + v.reachedIn);

  console.log('\nupgrade path (buying career, median minute the purchase happens):');
  for (const [k, v] of Object.entries(prog)) console.log('  ' + k.padEnd(12) + pad(v.price, 7) + ' CRD ' + pad(v.minutes.p50, 8) + ' min   reached ' + v.reachedIn);

  const out = arg('json', null);
  if (out) { mkdirSync(dirname(resolve(ROOT, out)), { recursive: true }); writeFileSync(resolve(ROOT, out), JSON.stringify(report, null, 2)); console.log('\nwrote ' + out); }
}
