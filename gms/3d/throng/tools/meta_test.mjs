// node tools/meta_test.mjs [--break=ladder|ladder-slight|curve|curve-slight|names|names-slight|hash|daily|economy|save|progress]
// Pure meta-layer checks. Each --break arm makes one real input wrong and must turn the run red.
import { LADDER, rankOf, ratingAt, ratingDelta, around, rowAt } from '../js/meta/ladder.js';
import { LEAGUES, leagueOf, nextLeague } from '../js/meta/leagues.js';
import { playerFor } from '../js/meta/names.js';
import { hash32, unit, rngFrom } from '../js/meta/hash.js';
import { buildRoster } from '../js/meta/roster.js';
import { challengeFor, dayKey, claimLogin, loginState, LOGIN_REWARDS } from '../js/meta/daily.js';
import { ECON, spend, earn } from '../js/meta/economy.js';
import { SHOP, buy, equip } from '../js/meta/shop.js';
import { defaults, migrate, load, write, memoryStorage, SAVE_KEY } from '../js/meta/save.js';
import { applyMatch } from '../js/meta/progress.js';

const BREAK = (process.argv.find((a) => a.startsWith('--break=')) || '').slice(8);
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const DAY = 86400000;
const T0 = Date.parse('2026-11-12T08:00:00Z');

// 1. Ladder monotonicity
{
  const cfg = BREAK === 'ladder' ? { ...LADDER, k: -10 } : BREAK === 'ladder-slight' ? { ...LADDER, lossMul: -0.2 } : LADDER;
  let prev = Infinity;
  for (let r = 0; r <= LADDER.span + 200; r += 7) { const k = rankOf(r, cfg); check(k <= prev, `rankOf not monotone at rating ${r}`); prev = k; }
  let pr = Infinity;
  for (let k = 1; k <= LADDER.population; k = Math.ceil(k * 1.3)) { const r = ratingAt(k, cfg); check(r <= pr, `ratingAt not monotone at rank ${k}`); pr = r; }
  check(rankOf(0, cfg) === LADDER.population, 'rating 0 is not dead last');
  check(rankOf(LADDER.span, cfg) === 1, 'top rating is not rank 1');
  for (const rating of [0, 150, 700, 1600, 2500, 3200, 4500]) {
    // Non-increasing with place (the 0 floor and the loss cap may tie the last places), strictly better for a win.
    for (let p = 1; p < 8; p++) check(ratingDelta(rating, p, cfg) >= ratingDelta(rating, p + 1, cfg), `delta at ${rating}: place ${p} worse than ${p + 1}`);
    check(ratingDelta(rating, 1, cfg) > ratingDelta(rating, 4, cfg), `delta at ${rating}: a win is not better than 4th`);
    check(rating + ratingDelta(rating, 8, cfg) >= 0, 'rating went negative');
  }
  for (let i = 1; i < LEAGUES.length; i++) check(LEAGUES[i].min > LEAGUES[i - 1].min, `league ${LEAGUES[i].name} threshold not above the previous`);
  check(nextLeague(2, LEAGUES[2].min - 5) === 2 && nextLeague(2, LEAGUES[2].min - 100) < 2, 'demotion hysteresis wrong');
}

// 2. Rank curve sanity: career sims (same models as tools/ladder_tune.mjs)
{
  const cfg = BREAK === 'curve' ? { ...LADDER, k: 3 } : BREAK === 'curve-slight' ? { ...LADDER, k: 7 } : LADDER;
  const run = (lo, hi, seed, n = 900) => {
    const r = rngFrom(seed);
    let rating = 0, wins = 0, at = -1;
    for (let m = 0; m < n; m++) {
      const t = leagueOf(rating).index / 7, w = lo.map((v, i) => v + (hi[i] - v) * t);
      let x = r() * w.reduce((a, b) => a + b, 0), place = 8;
      for (let i = 0; i < 8; i++) { x -= w[i]; if (x <= 0) { place = i + 1; break; } }
      if (place === 1) wins++;
      rating += ratingDelta(rating, place, cfg);
      if (at < 0 && rankOf(rating, cfg) <= 100) at = wins;
    }
    return { at, final: rankOf(rating, cfg) };
  };
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const strong = Array.from({ length: 60 }, (_, i) => run([42, 20, 14, 9, 6, 4, 3, 2], [30, 20, 15, 12, 9, 7, 4, 3], 's' + i));
  const never = Array.from({ length: 60 }, (_, i) => run([0, 0, 0, 34, 28, 18, 12, 8], [0, 0, 0, 26, 26, 20, 16, 12], 'n' + i));
  const sw = med(strong.map((c) => (c.at < 0 ? 1e9 : c.at)));
  const nf = med(never.map((c) => c.final));
  check(sw >= 58 && sw <= 84, `strong player reaches top 100 after ${sw} wins (want ~60-80)`);
  check(nf >= 800 && nf <= 6000, `never-top-3 player stalls at #${nf} (want low thousands)`);
  check(never.every((c) => c.at < 0), 'a never-top-3 player reached the top 100');
}

// 3. Names: neighbours never near-identical, rosters distinct
{
  const key = BREAK === 'names' ? (r) => 'rank:' + Math.floor(r / 6) : BREAK === 'names-slight' ? (r) => 'rank:' + (r === 12010 ? 12009 : r) : (r) => 'rank:' + r;
  for (const start of [1, 500, 12000, 150000, 287000]) {
    const names = [];
    for (let r = start; r < start + 30; r++) names.push(playerFor(key(r)).name);
    check(new Set(names).size === names.length, `duplicate names among 30 neighbours at #${start}`);
  }
  for (const s of ['a', 'b', 'c', 'd', 'e', 'f']) {
    const ro = buildRoster({ seed: s, rating: 600 });
    check(ro.length === 7, 'roster size');
    check(new Set(ro.map((p) => p.name)).size === 7, `roster ${s} has a duplicate name`);
    check(ro.filter((p) => p.human).length === 2, `roster ${s} should have exactly 2 human-feeling bots`);
    check(ro.every((p) => p.flag && p.flag.length >= 2), 'roster player without a flag');
  }
  const rows = around(1200, { name: 'Me' });
  check(rows.filter((r) => r.me).length === 1 && rows.every((r, i) => i === 0 || r.rank === rows[i - 1].rank + 1), 'around() rows not contiguous');
  check(rowAt(42).name === rowAt(42).name, 'ladder rows not deterministic');
}

// 4. Hash avalanche (the snake-eee bug: consecutive keys picking the same name)
{
  const fnv = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const u = BREAK === 'hash' ? (k) => fnv(k) / 4294967296 : unit;
  let gap = 0;
  for (let i = 0; i < 2000; i++) gap += Math.abs(u('rank:' + i) - u('rank:' + (i + 1)));
  gap /= 2000;
  check(gap > 0.25, `neighbouring keys hash too close together (mean gap ${gap.toFixed(3)}, want ~0.33)`);
  check(hash32('x') === hash32('x'), 'hash not deterministic');
}

// 5. Daily: date-driven and deterministic
{
  const key = (t) => dayKey(t) + (BREAK === 'daily' ? ':' + Math.random() : '');
  check(JSON.stringify(challengeFor(key(T0))) === JSON.stringify(challengeFor(key(T0 + 3600000))), 'challenge differs within one UTC day');
  check(dayKey(T0) === '2026-11-12' && dayKey(Date.parse('2026-11-12T23:59:59Z')) === '2026-11-12' && dayKey(Date.parse('2026-11-13T00:00:00Z')) === '2026-11-13', 'UTC day boundaries wrong');
  const kinds = new Set(), seq = [];
  for (let d = 0; d < 60; d++) { const c = challengeFor(dayKey(T0 + d * DAY)); kinds.add(c.kind); seq.push(c.text); check(c.target > 0 && c.coins > 0, 'challenge without target/reward'); }
  check(kinds.size >= 5, `only ${kinds.size} challenge kinds over 60 days`);
  check(new Set(seq).size >= 15, 'daily challenges repeat too much');
  const s = defaults();
  let got = 0;
  for (let d = 0; d < 9; d++) { got += claimLogin(s, T0 + d * DAY); check(claimLogin(s, T0 + d * DAY + 1000) === 0, 'login reward claimed twice in a day'); }
  check(got === LOGIN_REWARDS.reduce((a, b) => a + b, 0) + LOGIN_REWARDS[0] + LOGIN_REWARDS[1], `9 days of login paid ${got}`);
  check(loginState(s, T0 + 20 * DAY).canClaim, 'a missed day blocks the calendar');
}

// 6. Economy never negative, always whole coins
{
  if (BREAK === 'economy') ECON.levelCoins = () => NaN;
  const r = rngFrom('econ');
  const s = defaults();
  let bad = '';
  for (let i = 0; i < 4000 && !bad; i++) {
    const op = Math.floor(r() * 5);
    if (op === 0) spend(s, Math.floor(r() * 900));
    else if (op === 1) { const slot = Object.keys(SHOP)[Math.floor(r() * 5)]; const it = SHOP[slot][Math.floor(r() * SHOP[slot].length)]; buy(s, slot, it.id); equip(s, slot, it.id); }
    else if (op === 2) applyMatch(s, { place: 1 + Math.floor(r() * 8), count: Math.floor(r() * 900), best: Math.floor(r() * 1000), kills: Math.floor(r() * 4), recruited: Math.floor(r() * 500), crownSecs: r() * 40, left: r() < 0.05 }, T0 + i * 3600000);
    else if (op === 3) claimLogin(s, T0 + i * 3600000);
    else earn(s, -50);
    if (!Number.isInteger(s.coins) || s.coins < 0) bad = `coins became ${s.coins} after op ${op} (#${i})`;
    if (!(s.rating >= 0)) bad = `rating became ${s.rating}`;
  }
  check(!bad, bad);
  const p = defaults();
  check(!buy(p, 'color', 'uv').ok && p.coins === 0 && p.equip.color === 'blue', 'bought an item with no coins');
  check(!spend(p, -10) && p.coins === 0, 'negative spend accepted');
  check(!equip(p, 'color', 'uv'), 'equipped an item not owned');
}

// 7. Save: migration, round trip, savedAt
{
  const legacy = memoryStorage({ 'throng.name': 'Aaron', 'throng.muted': '1' });
  const s0 = load(legacy);
  check(s0.name === 'Aaron' && !s0.settings.music && !s0.settings.sfx && s0.v === 1, 'wave-1 name/mute not migrated');
  check(load(memoryStorage({ [SAVE_KEY]: '{not json' })).coins === 0, 'corrupt save did not fall back to defaults');
  const partial = migrate({ v: 1, coins: 777, rating: 'lots', stats: { wins: 3 }, equip: { color: 'mint' }, extra: 1 });
  check(partial.coins === 777 && partial.rating === 0 && partial.stats.wins === 3 && partial.stats.matches === 0 && partial.equip.plate === 'classic' && partial.equip.color === 'mint', 'partial v1 save not filled/sanitised');
  const st = memoryStorage();
  const s = defaults(); s.coins = 1234; s.rating = 456; s.owned.color = ['mint']; s.daily.loginStep = 3;
  write(st, s, 1000);
  if (BREAK === 'save') { const raw = JSON.parse(st.getItem(SAVE_KEY)); delete raw.v; st.setItem(SAVE_KEY, JSON.stringify(raw)); }
  const back = load(st);
  check(back.coins === 1234 && back.rating === 456 && back.owned.color[0] === 'mint' && back.daily.loginStep === 3, 'save did not round-trip');
  const a = back.savedAt; write(st, back, 500);
  check(load(st).savedAt > a, 'savedAt did not advance on write');
}

// 8. Progress: one match through the whole meta layer
{
  const s = defaults();
  const R = applyMatch(s, { place: BREAK === 'progress' ? 8 : 1, count: 700, best: 800, kills: 2, recruited: 400, crownSecs: 30 }, T0);
  check(R.delta > 0 && s.rating > 0 && R.after.rank < R.before.rank, 'a win from the bottom did not climb');
  check(R.firstWin && R.coins.some((c) => c.id === 'firstwin'), 'first win of the day not paid');
  const R2 = applyMatch(s, { place: 1, count: 700, best: 800, kills: 2, recruited: 400 }, T0 + 60000);
  check(!R2.firstWin, 'first-win bonus paid twice in a day');
  check(s.stats.matches === 2 && s.stats.wins === 2 && s.stats.streak === 2 && s.stats.bestCrowd === 800, 'stats not tracked');
  check(R.total === R.coins.reduce((a, c) => a + c.n, 0) && s.coins === R2.after.coins, 'coin total does not match its rows');
  const top = defaults(); top.rating = 4000; top.league = 7;
  const L = applyMatch(top, { place: 8, left: true }, T0);
  check(L.delta < 0 && L.total === 0 && top.stats.streak === 0, 'leaving a match at the top was free');
}

console.log(`${fails.length ? 'FAIL' : 'PASS'} meta_test${BREAK ? ` (break=${BREAK})` : ''}`);
for (const f of fails) console.log('  - ' + f);
process.exit(fails.length ? 1 : 0);
