// node tools/mode_sweep.mjs [--modes=classic,teams,koth,lcs,infection] [--leagues=0,2,7] [--matches=60] [--workers=8]
//                           [--variant=base|flip|fair] [--map=1|vary] [--set=mode.key:value,...] [--econ] [--seed0=20000]
// Balance sweeps in the real sim on the real map: crowd 0 is the ?auto bot (the "you" of every table) against sim-online
// rosters at each league's rating. Prints one table per mode, ratios rather than raw totals.
// Teams variants: flip = crowd 0 plays for Red (odd side); fair = crowd 0 gets a roster bot's spec instead of the auto
// player's, so both sides are drawn from the same pool.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createSim, SIM_DT } from '../js/sim/sim.js';
import { createBots } from '../js/sim/bots.js';
import { makePlayers } from '../js/sim/match.js';
import { buildRoster } from '../js/meta/roster.js';
import { LEAGUES } from '../js/meta/leagues.js';
import { CONFIG } from '../js/config.js';

const ARGS = isMainThread
  ? Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }))
  : workerData.args;

function applySet(spec) {
  for (const kv of String(spec || '').split(',').filter(Boolean)) {
    const [path, v] = kv.split(':');
    const keys = path.split('.');
    let o = CONFIG.MODES;
    if (keys[0] === 'SIM') { o = CONFIG.SIM; keys.shift(); }
    while (keys.length > 1) o = o[keys.shift()];
    o[keys[0]] = v.includes('/') ? v.split('/').map((s) => s.split(';').map(Number)) : +v;
  }
}
applySet(ARGS.set);

let mapGen = null, map1 = null;
async function mapFor(seed) {
  if (!mapGen) mapGen = (await import('../js/world/map.js')).generateMap;
  if (ARGS.map === 'vary') return mapGen(seed);
  return map1 || (map1 = mapGen(+(ARGS.map || 1)));
}

export async function runOne({ mode, li, seed, variant }) {
  const map = await mapFor(seed);
  const rating = LEAGUES[li].min + 20;
  const roster = buildRoster({ seed, rating, count: variant === 'fair' ? 8 : 7 });
  const draft = { snake: 'snake', top: 'top', nodraft: 'none', fair: 'none' }[variant];
  const mk = makePlayers({ seed, mode, allBots: true, roster: roster.slice(0, 7), ...(draft ? { teamDraft: draft } : {}) });
  const players = mk.players, specs = mk.botSpecs.slice();
  if (variant === 'fair') { const r = roster[7]; specs[0] = { persona: r.persona, skill: r.skill, aggr: r.aggr, throttle: r.throttle, human: r.human }; }
  if (variant === 'flip' && mode === 'teams') players.forEach((p, i) => { p.team = (i + 1) % 2; });
  const sim = createSim({ seed, map, players, mode });
  const bots = createBots({ sim, indices: mk.botIndices, specs, seed });
  const S = sim.state, nc = S.crowds.length;
  const out = { mode, li, seed, variant, circleDeaths: [], crowdDeaths: 0, lateLeads: 0, holderChanges: 0, contested: 0, playTicks: 0,
    countSum: new Array(nc).fill(0), alive60: -1, outside: new Array(nc).fill(0), outsidePeak: new Array(nc).fill(0) };
  let lastHolder = -2;
  const maxTicks = Math.round((S.duration + 8) / SIM_DT);
  while (S.phase !== 'over' && S.tick < maxTicks) {
    bots.update();
    sim.step();
    const t = S.duration - S.timeLeft;
    for (const e of sim.drainEvents()) {
      if (e.type === 'elim') {
        if (e.by < 0) {
          const c = S.crowds[e.victim];
          out.circleDeaths.push({ t, peak: out.outsidePeak[e.victim], secs: out.outside[e.victim] * SIM_DT, stage: S.circle ? S.circle.stage : 0, r: S.circle ? S.circle.r : 0, best: c.best });
        } else out.crowdDeaths++;
      } else if (e.type === 'lead' && S.phase === 'play' && S.timeLeft <= 30) out.lateLeads++;
    }
    if (S.phase !== 'play') continue;
    out.playTicks++;
    for (let i = 0; i < nc; i++) out.countSum[i] += S.crowds[i].alive ? S.crowds[i].count : 0;
    if (mode === 'koth') {
      const h = S.zone.holder;
      if (h !== lastHolder && h >= 0 && lastHolder !== -2) out.holderChanges++;
      if (h >= 0) lastHolder = h;
      let n = 0;
      for (const c of S.crowds) if (c.alive && (c.x - S.zone.x) ** 2 + (c.z - S.zone.z) ** 2 <= S.zone.r ** 2) n++;
      if (n > 1) out.contested++;
    }
    if (mode === 'lcs') {
      const cc = S.circle;
      for (let i = 0; i < nc; i++) {
        const c = S.crowds[i];
        if (!c.alive) continue;
        if ((c.x - cc.x) ** 2 + (c.z - cc.z) ** 2 > cc.r * cc.r) { out.outside[i]++; out.outsidePeak[i] = Math.max(out.outsidePeak[i], c.count); }
        else { out.outside[i] = 0; out.outsidePeak[i] = 0; }
      }
      if (out.alive60 < 0 && t >= 60) out.alive60 = S.crowds.filter((c) => !c.out).length;
      if (S.tick % 30 === 0) (out.aliveT ||= []).push(S.crowds.filter((c) => !c.out).length);
    }
  }
  const t = S.duration - S.timeLeft;
  const w = S.crowds.find((c) => c.rank === 1);
  const counts = S.crowds.map((c) => (c.alive ? c.count : 0));
  const sorted = counts.slice().sort((a, b) => b - a);
  Object.assign(out, {
    end: t, endReason: S.endReason || '', leadChanges: S.leadChanges, p0rank: S.crowds[0].rank, p0count: counts[0], p0best: S.crowds[0].best, p0kills: S.crowds[0].kills,
    p0recruited: S.crowds[0].recruited,
    winner: w.index, winnerScore: w.score, winnerCount: counts[w.index], top2: sorted[1] > 0 ? sorted[0] / sorted[1] : 99,
    scores: S.crowds.map((c) => c.score), horde: S.crowds.map((c) => c.horde), outs: S.crowds.map((c) => c.out), counts,
    teams: S.teams ? S.teams.map((x) => x.score) : null, winSide: S.teams ? w.team : -1, p0side: S.crowds[0].team,
    meanCount: out.countSum.map((s) => s / Math.max(1, out.playTicks)),
  });
  delete out.countSum; delete out.outside; delete out.outsidePeak;
  if (mode === 'lcs') out.alive15 = out.aliveT[Math.max(0, Math.floor(t - 15))];
  if (mode === 'infection') out.hordeEat = S.crowds.map((c) => c.stolen);
  if (mode === 'lcs' && out.alive60 < 0) out.alive60 = S.crowds.filter((c) => !c.out).length;
  return out;
}

if (!isMainThread) {
  parentPort.on('message', async (jobs) => {
    const res = [];
    for (const j of jobs) res.push(await runOne(j));
    parentPort.postMessage(res);
  });
}

export async function sweep(jobs, workers = 8, args = ARGS) {
  const file = fileURLToPath(import.meta.url);
  const chunks = Array.from({ length: workers }, () => []);
  jobs.forEach((j, k) => chunks[k % workers].push(j));
  const parts = await Promise.all(chunks.filter((c) => c.length).map((c) => new Promise((res, rej) => {
    const w = new Worker(file, { workerData: { args } });
    w.once('message', (m) => { res(m); w.terminate(); });
    w.once('error', rej);
    w.postMessage(c);
  })));
  return parts.flat();
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = (n, d) => `${(100 * n / Math.max(1, d)).toFixed(0)}%`;
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const P = (v, n) => String(v).padStart(n);

function tables(rs) {
  const byKey = {};
  for (const r of rs) (byKey[`${r.mode}|${r.variant}`] ||= {}) && ((byKey[`${r.mode}|${r.variant}`][r.li] ||= []).push(r));
  for (const [key, rows] of Object.entries(byKey)) {
    const [mode, variant] = key.split('|');
    console.log(`\n== ${mode}${variant !== 'base' ? ' (' + variant + ')' : ''}`);
    if (mode === 'classic') {
      console.log('league     n   you place  win   top3  you final  winner final  lead chg');
      for (const [li, a] of Object.entries(rows)) console.log(`${LEAGUES[li].name.padEnd(9)}${P(a.length, 4)}${P(mean(a.map((r) => r.p0rank)).toFixed(2), 11)}${P(pct(a.filter((r) => r.p0rank === 1).length, a.length), 6)}${P(pct(a.filter((r) => r.p0rank <= 3).length, a.length), 6)}${P(mean(a.map((r) => r.p0count)).toFixed(0), 11)}${P(mean(a.map((r) => r.winnerCount)).toFixed(0), 14)}${P(mean(a.map((r) => r.leadChanges)).toFixed(1), 10)}`);
    }
    if (mode === 'teams') {
      console.log('league     n  blue win  your side win  you place  win margin (win/lose score)  close (<1.2x)');
      for (const [li, a] of Object.entries(rows)) {
        const blue = a.filter((r) => r.winSide === 0).length, mine = a.filter((r) => r.winSide === r.p0side).length;
        const margin = a.map((r) => Math.max(...r.teams) / Math.max(1, Math.min(...r.teams)));
        console.log(`${LEAGUES[li].name.padEnd(9)}${P(a.length, 4)}${P(pct(blue, a.length), 10)}${P(pct(mine, a.length), 15)}${P(mean(a.map((r) => r.p0rank)).toFixed(2), 11)}${P(q(margin, 0.5).toFixed(2), 16)} median${P(pct(margin.filter((m) => m < 1.2).length, a.length), 19)}`);
      }
    }
    if (mode === 'koth') {
      console.log('league     n  you place  win   lead chg  holder chg  winner=biggest avg crowd  =biggest at end  winner pts share  2+ in zone  top-2 pts ratio');
      for (const [li, a] of Object.entries(rows)) {
        const big = a.filter((r) => r.meanCount.indexOf(Math.max(...r.meanCount)) === r.winner).length;
        const share = a.map((r) => r.winnerScore / Math.max(1e-6, r.scores.reduce((x, y) => x + y, 0)));
        const t2 = a.map((r) => { const s = r.scores.slice().sort((x, y) => y - x); return s[0] / Math.max(1, s[1]); });
        console.log(`${LEAGUES[li].name.padEnd(9)}${P(a.length, 4)}${P(mean(a.map((r) => r.p0rank)).toFixed(2), 11)}${P(pct(a.filter((r) => r.p0rank === 1).length, a.length), 6)}${P(mean(a.map((r) => r.leadChanges)).toFixed(1), 10)}${P(mean(a.map((r) => r.holderChanges)).toFixed(1), 12)}${P(pct(big, a.length), 26)}${P(pct(a.filter((r) => r.counts.indexOf(Math.max(...r.counts)) === r.winner).length, a.length), 17)}${P((100 * mean(share)).toFixed(0) + '%', 18)}${P((100 * mean(a.map((r) => r.contested / r.playTicks))).toFixed(0) + '%', 12)}${P(q(t2, 0.5).toFixed(2), 17)}`);
      }
    }
    if (mode === 'lcs') {
      console.log('league     n  end s p10/med/p90  in 60-90  one left  alive@60  alive 15s before end  late lead chg  circle deaths  dumb (peak>=40)  crowd elims  you place');
      for (const [li, a] of Object.entries(rows)) {
        const ends = a.map((r) => r.end), cd = a.flatMap((r) => r.circleDeaths);
        const dumb = cd.filter((d) => d.peak >= 40).length;
        console.log(`${LEAGUES[li].name.padEnd(9)}${P(a.length, 4)}${P(`${q(ends, 0.1).toFixed(0)}/${q(ends, 0.5).toFixed(0)}/${q(ends, 0.9).toFixed(0)}`, 18)}${P(pct(ends.filter((e) => e >= 60 && e <= 90.01).length, a.length), 10)}${P(pct(a.filter((r) => r.endReason === 'last').length, a.length), 10)}${P(mean(a.map((r) => r.alive60)).toFixed(1), 10)}${P(mean(a.map((r) => r.alive15)).toFixed(1), 22)}${P(mean(a.map((r) => r.lateLeads)).toFixed(1), 15)}${P((cd.length / a.length).toFixed(1), 15)}${P((dumb / a.length).toFixed(2), 17)}${P(mean(a.map((r) => r.crowdDeaths)).toFixed(1), 13)}${P(mean(a.map((r) => r.p0rank)).toFixed(2), 11)}`);
        const byStage = [0, 1, 2, 3, 4].map((s) => cd.filter((d) => d.stage === s).length);
        console.log(`           circle deaths by stage 0..4: ${byStage.join('/')}; median seconds outside before dying ${q(cd.map((d) => d.secs), 0.5).toFixed(1)}; peak count while outside p50/p90 ${q(cd.map((d) => d.peak), 0.5)}/${q(cd.map((d) => d.peak), 0.9)}`);
      }
    }
    if (mode === 'infection') {
      console.log('league     n  horde wins  all-horde  survivors@end  survivor score p10/med/p90  spread (max-min)  you place  you infected');
      for (const [li, a] of Object.entries(rows)) {
        const hw = a.filter((r) => r.horde[r.winner]).length;
        const surv = a.flatMap((r) => r.scores.filter((s, i) => !r.horde[i]));
        const spread = a.map((r) => { const s = r.scores.filter((x, i) => !r.horde[i]); return s.length > 1 ? Math.max(...s) - Math.min(...s) : 0; });
        console.log(`${LEAGUES[li].name.padEnd(9)}${P(a.length, 4)}${P(pct(hw, a.length), 12)}${P(pct(a.filter((r) => r.endReason === 'horde').length, a.length), 11)}${P(mean(a.map((r) => r.horde.filter((h) => !h).length)).toFixed(1), 15)}${P(`${q(surv, 0.1).toFixed(0)}/${q(surv, 0.5).toFixed(0)}/${q(surv, 0.9).toFixed(0)}`, 28)}${P(q(spread, 0.5).toFixed(0), 18)}${P(mean(a.map((r) => r.p0rank)).toFixed(2), 11)}${P(pct(a.filter((r) => r.horde[0]).length, a.length), 14)}`);
      }
    }
  }
}

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const modes = String(ARGS.modes || 'classic,teams,koth,lcs,infection').split(',');
  const leagues = String(ARGS.leagues || '0,2,7').split(',').map(Number);
  const N = +(ARGS.matches || 60), seed0 = +(ARGS.seed0 || 20000);
  const variants = String(ARGS.variant || 'base').split(',');
  const jobs = [];
  for (const mode of modes) for (const variant of variants) for (const li of leagues) for (let m = 0; m < N; m++) jobs.push({ mode, li, seed: seed0 + m * 7919 + li * 131, variant });
  const t0 = Date.now();
  const rs = await sweep(jobs, +(ARGS.workers || 8));
  console.log(`${rs.length} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s (map ${ARGS.map || 1}${ARGS.set ? ', set ' + ARGS.set : ''})`);
  tables(rs);
  if (ARGS.json) (await import('node:fs')).writeFileSync(ARGS.json, JSON.stringify(rs));
}
