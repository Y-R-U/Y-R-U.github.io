#!/usr/bin/env node
// tools/sim_s2d.mjs — S2-D's balance harness. Two questions, both measured through the REAL
// js/economy.js, js/missions.js and js/ranks.js in node.
//
//   node tools/sim_s2d.mjs                 # both reports
//   node tools/sim_s2d.mjs --json=docs/s2d_balance.json
//
// 1. THE STANDING LADDER. It reads NET WORTH, which economy.js has never had to produce, so there
//    was no distribution to hang ten rungs on. This runs careers that actually spend — upgrades
//    AND hulls — and reports the net worth a progressing pilot holds at each minute. The rungs are
//    quantiles of that, not a geometric series somebody liked the look of.
//
// 2. THE BORROWED HULL. The addendum starts the player in a hull above their licence tier and says
//    outright: *"S2-D should measure it rather than assume it."* So: the same careers, same seeds,
//    same policies, started in `wisp` / `kestrel` / `nocturne`, differenced.
//
// The flight model is sim_p7a's analytic one and inherits its stated limitation: it prices a leg
// as distance over cruise speed and cannot see a wall. It is a balance instrument.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCareer, loadWorld } from './sim_p7a.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = await import(resolve(ROOT, 'js/ranks.js'));
const E = await import(resolve(ROOT, 'js/economy.js'));

const arg = (k, d) => {
  const h = process.argv.find(a => a.startsWith('--' + k + '='));
  return h === undefined ? d : h.slice(k.length + 3);
};
const MINUTES = +arg('minutes', 90);
const SEEDS = +arg('seeds', 8);
const POLICIES = String(arg('policies', 'hop,chain,greedy')).split(',');

const q = (a, p) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const i = Math.max(0, Math.min(s.length - 1, (s.length - 1) * p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo));
};

// ── 1. net worth over time ─────────────────────────────────────────────────
// A career's log carries one row per delivery with `bank`, `hull`, `lifetime` and `tier` at the
// moment of payment; net worth is rebuilt from that through ranks.js so the sim and the game agree
// by construction rather than by a second copy of the arithmetic.
function worthAt(row, upgrades) {
  return R.netWorth({ credits: row.bank, craft: row.hull, upgrades });
}

function run() {
  const worlds = new Map();
  const world = s => {
    if (!worlds.has(s)) worlds.set(s, loadWorld(s));
    return worlds.get(s);
  };

  // THREE spending profiles, because the whole point of the standing axis is that it separates
  // them. `hoard` buys nothing, `fit` buys upgrades only, `spend` buys upgrades and the best hull
  // it can afford. All three gross the same — the licence ladder cannot tell them apart — so any
  // spread below is the second axis doing its job.
  const PROFILES = { hoard: { buy: false, buyHull: false },
    fit: { buy: true, buyHull: false }, spend: { buy: true, buyHull: true } };
  const tracks = [];
  for (const [profile, opt] of Object.entries(PROFILES))
  for (const policy of POLICIES) {
    for (let k = 0; k < SEEDS; k++) {
      const seed = 0x4e454f4e + k * 7919;
      const r = runCareer({ seed, policy, minutes: MINUTES, world: world(seed), ...opt,
        rng: mulberry(seed) });
      // The upgrade set at the END of the run is the closest thing to a per-row snapshot the log
      // carries; using it for every row would OVERSTATE early worth, so early rows are valued with
      // an empty upgrade set and the crossover is the first purchase. Cheap and honest: value each
      // row with the purchases that had happened by that time.
      const buys = r.purchases.slice();
      const rows = r.log.map(row => {
        const up = { thrust: 0, cargo: 0, cell: 0, eff: 0 };
        for (const b of buys) {
          if (b.t > row.t) break;
          if (b.line.startsWith('hull:')) { up.thrust = up.cargo = up.cell = up.eff = 0; }
          else up[b.line] = b.level;
        }
        return { t: row.t, worth: worthAt(row, up), lifetime: row.lifetime, tier: row.tier, hull: row.hull };
      });
      tracks.push({ profile, policy, seed, rows, final: r });
    }
  }

  // sample every 5 minutes, per profile
  const marks = [];
  for (let m = 5; m <= MINUTES; m += 5) {
    const row = { min: m, byProfile: {} };
    const lifes = [];
    for (const profile of Object.keys(PROFILES)) {
      const worths = [];
      for (const tr of tracks.filter(t => t.profile === profile)) {
        const upTo = tr.rows.filter(x => x.t <= m);
        if (!upTo.length) continue;
        const last = upTo[upTo.length - 1];
        worths.push(last.worth);
        if (profile === 'fit') lifes.push(last.lifetime);
      }
      row.byProfile[profile] = { n: worths.length, p10: q(worths, 0.1), p50: q(worths, 0.5), p90: q(worths, 0.9) };
    }
    row.lifetime = { p50: q(lifes, 0.5) };
    marks.push(row);
  }
  return { tracks, marks };
}

// A seeded rng so a re-run reproduces. Math.random would make every sweep a different experiment.
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 2. the borrowed hull ───────────────────────────────────────────────────
function hullEffect() {
  const out = {};
  const worlds = new Map();
  for (const craft of ['wisp', 'kestrel', 'nocturne']) {
    const gross = [], jobs = [], t2 = [];
    for (const policy of POLICIES) {
      for (let k = 0; k < SEEDS; k++) {
        const seed = 0x4e454f4e + k * 7919;
        if (!worlds.has(seed)) worlds.set(seed, loadWorld(seed));
        const r = runCareer({ seed, policy, minutes: 20, world: worlds.get(seed), craft, rng: mulberry(seed) });
        gross.push(r.lifetime); jobs.push(r.jobs);
        if (r.tier2At !== null) t2.push(+r.tier2At.toFixed(2));
      }
    }
    out[craft] = { n: gross.length, slots: E.CRAFT[craft].slots, speedRef: craft,
      gross: { p10: q(gross, 0.1), p50: q(gross, 0.5), p90: q(gross, 0.9) },
      jobs: { p50: q(jobs, 0.5) },
      tier2Min: { p50: q(t2.map(v => Math.round(v * 100)), 0.5) / 100, n: t2.length } };
  }
  return out;
}

const t0 = Date.now();
const { marks, tracks } = run();
const hulls = hullEffect();

console.log(`\n── NET WORTH over ${MINUTES} min · ${tracks.length} careers (${POLICIES.join('/')} x ${SEEDS} seeds), buying upgrades AND hulls\n`);
console.log('  min | lifetime p50 | worth: hoard p50 |  fit p50 | spend p50');
for (const m of marks) {
  const b = m.byProfile;
  console.log(`  ${String(m.min).padStart(3)} | ${String(m.lifetime.p50).padStart(12)} | ${String(b.hoard.p50).padStart(16)} `
    + `| ${String(b.fit.p50).padStart(8)} | ${String(b.spend.p50).padStart(9)}`);
}

console.log('\n── the ladder these thresholds produce, against the same careers\n');
console.log('  min | licence (same for all three) | standing hoard / fit / spend');
for (const m of marks) {
  const lic = R.courierRank(E.tierFor(m.lifetime.p50));
  const nm = k => R.standingRank(m.byProfile[k].p50, []).name;
  console.log(`  ${String(m.min).padStart(3)} | ${lic.name.padEnd(15)} (tier ${lic.tier})     | `
    + `${nm('hoard').padEnd(12)} ${nm('fit').padEnd(12)} ${nm('spend')}`);
}

console.log(`\n── THE BORROWED HULL — 20 min careers, identical seeds and policies, different starting hull\n`);
for (const [k, v] of Object.entries(hulls)) {
  console.log(`  ${k.padEnd(9)} ${String(v.slots)} slots · gross p10/p50/p90 ${v.gross.p10}/${v.gross.p50}/${v.gross.p90} CRD`
    + ` · ${v.jobs.p50} jobs · tier 2 at ${v.tier2Min.p50} min (${v.tier2Min.n}/${v.n} reached it)`);
}
const base = hulls.wisp.gross.p50;
for (const k of ['kestrel', 'nocturne']) {
  console.log(`  ${k} vs wisp: ${(100 * (hulls[k].gross.p50 / base - 1)).toFixed(1)} % on median gross`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

const json = arg('json', null);
if (json) {
  mkdirSync(dirname(resolve(ROOT, json)), { recursive: true });
  writeFileSync(resolve(ROOT, json), JSON.stringify({ at: new Date().toISOString(), minutes: MINUTES,
    seeds: SEEDS, policies: POLICIES, marks, hulls,
    standing: R.STANDING_RANKS, recovery: R.ASSET_RECOVERY }, null, 1));
  console.log('wrote', json);
}
