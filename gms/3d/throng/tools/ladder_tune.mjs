// node tools/ladder_tune.mjs [--grid] [--careers=200]
// Career simulation of the ladder curve. Placement odds per player model shift with the league (bots get tougher).
import { LADDER, rankOf, ratingDelta } from '../js/meta/ladder.js';
import { leagueOf } from '../js/meta/leagues.js';
import { rngFrom } from '../js/meta/hash.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const CAREERS = +(args.careers || 200);

// [place1..place8] weights at Bronze and at Legend; interpolated by league.
const MODELS = {
  strong: { lo: [42, 20, 14, 9, 6, 4, 3, 2], hi: [30, 20, 15, 12, 9, 7, 4, 3] },
  good: { lo: [22, 18, 16, 14, 11, 9, 6, 4], hi: [12, 14, 15, 15, 14, 12, 10, 8] },
  'never-top3': { lo: [0, 0, 0, 34, 28, 18, 12, 8], hi: [0, 0, 0, 26, 26, 20, 16, 12] },
  weak: { lo: [3, 5, 8, 12, 16, 18, 20, 18], hi: [1, 3, 6, 10, 15, 20, 22, 23] },
};

function sampler(model) {
  return (league, r) => {
    const t = league / 7;
    const w = model.lo.map((v, i) => v + (model.hi[i] - v) * t);
    let x = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 8; i++) { x -= w[i]; if (x <= 0) return i + 1; }
    return 8;
  };
}

function career(model, seed, cfg, maxMatches = 1500) {
  const r = rngFrom('career:' + seed);
  const pick = sampler(model);
  let rating = 0, wins = 0, top100At = -1, top100Wins = -1;
  const rankAt = {};
  for (let m = 1; m <= maxMatches; m++) {
    const place = pick(leagueOf(rating).index, r);
    if (place === 1) wins++;
    rating += ratingDelta(rating, place, cfg);
    if (top100At < 0 && rankOf(rating, cfg) <= 100) { top100At = m; top100Wins = wins; }
    if (m === 50 || m === 100 || m === 200 || m === 400 || m === 800) rankAt[m] = rankOf(rating, cfg);
  }
  return { top100At, top100Wins, rankAt, final: rankOf(rating, cfg) };
}

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const fmt = (n) => n < 0 ? 'never' : n.toLocaleString('en-US');

function evaluate(cfg, n = CAREERS) {
  const out = {};
  for (const [name, model] of Object.entries(MODELS)) {
    const cs = Array.from({ length: n }, (_, i) => career(model, name + i, cfg));
    const reached = cs.filter((c) => c.top100At > 0);
    out[name] = {
      reachedPct: reached.length / n,
      wins: reached.length ? [q(reached.map((c) => c.top100Wins), 0.25), q(reached.map((c) => c.top100Wins), 0.5), q(reached.map((c) => c.top100Wins), 0.75)] : null,
      matches: reached.length ? q(reached.map((c) => c.top100At), 0.5) : -1,
      rankAt: Object.fromEntries([50, 100, 200, 400, 800].map((m) => [m, q(cs.map((c) => c.rankAt[m]), 0.5)])),
      finalP: [q(cs.map((c) => c.final), 0.1), q(cs.map((c) => c.final), 0.5), q(cs.map((c) => c.final), 0.9)],
    };
  }
  return out;
}

function score(e) {
  const s = e.strong, n = e['never-top3'];
  let bad = 0;
  if (!s.wins) return 1e9;
  bad += Math.abs(s.wins[1] - 70) / 10;
  bad += (1 - s.reachedPct) * 10;
  const stall = n.rankAt[800];
  if (stall < 1000) bad += (1000 - stall) / 200;
  if (stall > 4000) bad += (stall - 4000) / 1000;
  if (e.weak.rankAt[800] < 20000) bad += 3;
  return bad;
}

function print(cfg, e) {
  console.log(`k ${cfg.k}  lossMul ${cfg.lossMul}  winBonus ${cfg.winBonus}  par ${JSON.stringify(cfg.par)}`);
  console.log('model         top100%  wins→top100 (p25/med/p75)  matches  rank@50     @100     @200     @400     @800   final p10/p50/p90');
  for (const [name, r] of Object.entries(e)) {
    const w = r.wins ? r.wins.join('/') : '—';
    console.log(`${name.padEnd(13)}${(r.reachedPct * 100).toFixed(0).padStart(6)}%  ${w.padStart(20)}  ${fmt(r.matches).padStart(10)}  ${[50, 100, 200, 400, 800].map((m) => fmt(r.rankAt[m]).padStart(8)).join(' ')}   ${r.finalP.map(fmt).join('/')}`);
  }
}

if (args.grid) {
  let best = null;
  for (const k of [8, 9, 10]) for (const lossMul of [0.8, 1]) for (const p43 of [5.7, 6.0]) for (const p33 of [5.2, 5.4, 5.6]) for (const p20 of [2.5, 2.7, 2.9]) {
    const cfg = { ...LADDER, k, lossMul, par: LADDER.par.map(([l, p]) => [l, l === 4.3 ? p43 : l === 3.3 ? p33 : l === 2.0 ? p20 : p]) };
    const e = evaluate(cfg, 60);
    const s = score(e);
    if (!best || s < best.s) best = { s, cfg };
  }
  console.log('best score', best.s.toFixed(2));
  print(best.cfg, evaluate(best.cfg));
} else {
  print(LADDER, evaluate(LADDER));
}
