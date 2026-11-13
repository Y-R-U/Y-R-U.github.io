// node tools/econ_sweep.mjs [--careers=6] [--matches=300] [--perday=10] [--workers=6] [--mins=2.6]
// Whole careers in the real sim: a fresh save, the ?auto bot as the player, PLAY (ladder) every match, the rating moving the
// roster. Each day: claim the login reward, play `perday` matches (Classic, or the Mode of the Day every third match).
// Prints coins per match and per hour, and how many matches each locker tier costs. Flags < 3 or > 300 matches.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createSim, SIM_DT } from '../js/sim/sim.js';
import { createBots } from '../js/sim/bots.js';
import { makePlayers } from '../js/sim/match.js';
import { buildRoster } from '../js/meta/roster.js';
import { defaults } from '../js/meta/save.js';
import { applyMatch } from '../js/meta/progress.js';
import { claimLogin } from '../js/meta/daily.js';
import { matchEvents } from '../js/meta/events.js';
import { SHOP, CROWD_SLOTS } from '../js/meta/shop.js';
import { LEAGUES } from '../js/meta/leagues.js';

const ARGS = isMainThread ? Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; })) : workerData.args;
const MATCHES = +(ARGS.matches || 300), PERDAY = +(ARGS.perday || 10);

async function career(c) {
  const map = (await import('../js/world/map.js')).generateMap(1);
  const save = defaults();
  let t = Date.UTC(2026, 10, 16, 9, 0) + c * 7 * 86400000;
  const log = [];
  for (let m = 0; m < MATCHES; m++) {
    let login = 0;
    if (m % PERDAY === 0) { if (m) t += 86400000 - PERDAY * 160000; login = claimLogin(save, t); save.coins += login; save.stats.coinsEarned += login; }
    const ev = matchEvents(t, 'classic');
    const mode = m % 3 === 2 && ev.featured ? ev.featured : 'classic';
    const mev = matchEvents(t, mode);
    const seed = `career${c}:${m}`;
    const roster = buildRoster({ seed, rating: save.rating, count: 7 });
    const mk = makePlayers({ seed, mode, allBots: true, roster });
    const sim = createSim({ seed, map, players: mk.players, mode, config: mev.sim });
    const bots = createBots({ sim, indices: mk.botIndices, specs: mk.botSpecs, seed });
    let crown = 0, slayer = 0;
    while (sim.state.phase !== 'over') {
      bots.update(); sim.step();
      for (const e of sim.drainEvents()) if (e.type === 'elim' && e.by === 0 && mev.slayer && sim.state.crowds[e.victim].rank < sim.state.crowds[0].rank) slayer++;
      if (sim.state.phase === 'play' && sim.state.leader === 0) crown += SIM_DT;
    }
    const me = sim.state.crowds[0];
    const before = save.coins;
    const rep = applyMatch(save, { place: me.rank, count: me.count, best: me.best, kills: me.kills, recruited: me.recruited, crownSecs: crown, mode, coinMul: mev.coinMul,
      slayer: mev.slayer ? { n: slayer, bonus: mev.slayer } : null }, t);
    log.push({ m, mode, place: me.rank, coins: save.coins - before, login, league: save.league, level: save.level, total: save.stats.coinsEarned });
    t += 160000;
  }
  return log;
}

if (!isMainThread) parentPort.on('message', async (cs) => { const out = []; for (const c of cs) out.push(await career(c)); parentPort.postMessage(out); });

if (isMainThread && fileURLToPath(import.meta.url) === process.argv[1]) {
  const N = +(ARGS.careers || 6), W = Math.min(N, +(ARGS.workers || 6)), MIN = +(ARGS.mins || 2.6);
  const chunks = Array.from({ length: W }, () => []);
  for (let c = 0; c < N; c++) chunks[c % W].push(c);
  const t0 = Date.now();
  const logs = (await Promise.all(chunks.map((cs) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { args: ARGS } });
    w.once('message', (m) => { res(m); w.terminate(); }); w.once('error', rej); w.postMessage(cs);
  })))).flat();
  console.log(`${N} careers × ${MATCHES} matches (${PERDAY}/day, every 3rd match in the Mode of the Day) in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${MIN} min per match incl. lobby and results`);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const per = (from, to) => mean(logs.map((l) => (l[Math.min(to, l.length) - 1].total - (from ? l[from - 1].total : 0)) / (Math.min(to, l.length) - from)));
  console.log('\nmatches      coins/match (incl. login, level-ups, daily, cup)  coins/hour   league at end   level at end');
  for (const [a, b] of [[0, 10], [10, 50], [50, 100], [100, 200], [200, MATCHES]]) {
    if (a >= MATCHES) continue;
    const end = Math.min(b, MATCHES) - 1, cpm = per(a, Math.min(b, MATCHES));
    const lg = mean(logs.map((l) => l[end].league)), lv = mean(logs.map((l) => l[end].level));
    console.log(`${String(a + 1).padStart(4)}–${String(Math.min(b, MATCHES)).padEnd(6)}${cpm.toFixed(0).padStart(28)}${(cpm * 60 / MIN).toFixed(0).padStart(28)}   ${LEAGUES[Math.round(lg)].name.padEnd(9)} (${lg.toFixed(1)})   ${lv.toFixed(1)}`);
  }
  const cum = (n) => mean(logs.map((l) => l[Math.min(n, l.length) - 1].total));
  const matchesFor = (price) => { for (let n = 1; n <= MATCHES; n++) if (cum(n) >= price) return n; return Infinity; };
  const steady = per(Math.min(100, MATCHES - 1), MATCHES);
  const est = (price) => { const n = matchesFor(price); return Number.isFinite(n) ? n : Math.round(MATCHES + (price - cum(MATCHES)) / steady); };
  console.log('\nlocker tier (cheapest → dearest priced item per slot): matches of earnings to afford it from a fresh save, alone');
  const flags = [];
  const rows = [];
  for (const slot of Object.keys(SHOP)) {
    const prices = [...new Set(SHOP[slot].map((x) => x.price).filter((p) => p > 0))].sort((a, b) => a - b);
    const cells = prices.map((p) => { const n = est(p); if (n < 3 || n > 300) flags.push(`${slot} ${p} → ${n} matches`); return `${p}:${n}`; });
    rows.push(`  ${slot.padEnd(7)} ${cells.join('  ')}`);
  }
  console.log(rows.join('\n'));
  const all = Object.values(SHOP).flat().reduce((a, x) => a + x.price, 0), crowd = CROWD_SLOTS.flatMap((s) => SHOP[s]).reduce((a, x) => a + x.price, 0);
  console.log(`\nwhole locker ${all} coins ≈ ${est(all)} matches (≈ ${(est(all) * MIN / 60).toFixed(0)} h); crowd cosmetics alone ${crowd} ≈ ${est(crowd)} matches`);
  console.log(flags.length ? 'FLAGGED (< 3 or > 300 matches): ' + flags.join('; ') : 'no item under 3 or over 300 matches');
}
