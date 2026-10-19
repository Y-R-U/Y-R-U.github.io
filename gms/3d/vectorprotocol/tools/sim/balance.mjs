// Balance harness. node tools/sim/balance.mjs [--quick] [--only=progress|matchups] [--seed=N | --seeds=1,2,3]
//   [--policy=straight|grinder|smart] [--hours=45] [--rules='{json}'] [--fixture] [--nosnaps] [--json=out.json]
// Full slow run for reports: --seeds=1,2,3 --hours=60   (smart policy is ~5 min cpu per seed)
// 1) player simulations through the story with the real game_state facade and js/data
// 2) matchup tables (role / faction / per-unit / composition) at equal power
import { writeFileSync } from 'node:fs';
import { loadData } from '../../js/sim/data.js';
import { prepareData, simulateBattle, autoSlots } from '../../js/sim/battle.js';
import { createGame } from '../../js/sim/game_state.js';
import { createRng } from '../../js/sim/rng.js';
import { squadPower } from '../../js/sim/stats.js';
import * as P from '../../js/sim/progression.js';
import { allLevels } from '../../js/sim/story.js';
import FIXTURE from '../../js/sim/fixture_data.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const QUICK = !!args.quick;
const SEED = +(args.seed || 1);

// ---- time model (real seconds the player spends)
export const TIME = {
  speed: 2,          // players mostly watch at x2
  overhead: 15,      // squad screen + results + taps per battle
  upgradeSession: 2, // per upgrade action (tap-through)
  dayHours: 1.5,     // a virtual "day" passes per 1.5 h of play (event rotation / daily limits)
  stallLimit: 3,     // consecutive losses on the same level = stalled
  hardWallHours: 8,
  eventPowerPick: 0.95,
  starPower: 0.8,    // star players attempt a level's open goals once its power is <= 80% of theirs
  starRetry: 1.15,   // after 2 failed attempts, retry when power has grown 15%
  completeStall: 150, // completionist phase stops after this many battles without a new star // grinders pick the highest event tier at <= 95% of their power (else the lowest)  // stuck this long on one level = give up (reported as a hard wall)
};

async function getData() {
  if (args.fixture) { const D = prepareData(FIXTURE); D._source = 'fixture (forced)'; return D; }
  let D = await loadData();
  if (D._source === 'fixture') {
    // design data may exist partially (units/abilities/enemies before index.js)
    try {
      const [u, a, e] = await Promise.all(['units', 'abilities', 'enemies'].map((f) => import(`../../js/data/${f}.js`).then((m) => m.default)));
      D = prepareData({ ...FIXTURE, units: u, abilities: a, enemies: e, _partial: true });
      D._source = 'js/data units/abilities/enemies + fixture rest';
    } catch { /* fixture only */ }
  }
  return D;
}

// ---------------------------------------------------------------- player policies
function spendAll(g, D, policy, st = {}) {
  const E = P.econ(D);
  let actions = 0;
  const squad = () => g.formation().map((f) => g.unit(f.uid)).filter(Boolean);
  // 1. rank-ups
  for (const u of squad()) if (g.rankUp(u.uid).ok) actions++;
  // 1b. surplus shards (max-rank units) -> chips
  if (g.convertAllShards?.().ok) actions++;
  // 2. arena shop -> shards toward the squad unit nearest a rank-up, else scrap
  const shop = D.arena?.shop || [];
  for (let guard = 0; guard < 20; guard++) {
    const sh = shop.find((s) => s.item.shardsChoice);
    const need = squad().filter((u) => u.rankUpCost && u.rank < u.maxRank).sort((a, b) => (a.rankUpCost.shards - a.shards) - (b.rankUpCost.shards - b.shards))[0];
    let bought = false;
    if (sh && need && g.canAfford(sh.cost)) { bought = g.buyArena(sh.id, need.def).ok; if (bought) st.shop = (st.shop || 0) + sh.item.shardsChoice; }
    else { const sc = shop.find((s) => s.item.scrap); if (sc && g.canAfford(sc.cost) && g.wallet.arena_tokens > (sh?.cost.arena_tokens || 0) * 2) bought = g.buyArena(sc.id).ok; }
    if (!bought) break;
    actions++;
  }
  // 3. scrap into the squad, lowest level first
  for (let pass = 0; pass < 3; pass++) {
    for (const u of squad().sort((a, b) => a.level - b.level)) {
      const share = Math.ceil((g.wallet.scrap || 0) / Math.max(1, squad().length - pass));
      if (g.feedScrap(u.uid, share).ok) actions++;
    }
  }
  for (const u of squad()) if (g.rankUp(u.uid).ok) actions++;
  // smart: a squad unit at its level cap with the shards for its next rank → save credits for that first
  let reserve = 0;
  if (policy.smart) {
    const ready = squad().filter((u) => u.rankUpCost && u.rank < u.maxRank && u.level >= u.levelCap && u.shards >= u.rankUpCost.shards);
    if (ready.length) reserve = Math.min(...ready.map((u) => u.rankUpCost.credits));
  }
  const spare = () => Math.max(0, (g.wallet.credits || 0) - reserve);
  // 4. HQ, cheapest first, keep half the credits for leveling
  const hq = Object.values(D.hq || {}).map((h) => ({ h, c: P.hqCost(h, g.save.hq[h.id] || 0) })).filter((x) => (g.save.hq[x.h.id] || 0) < (x.h.max || 1)).sort((a, b) => (a.c.credits || 0) - (b.c.credits || 0));
  for (const { h, c } of hq) if ((c.credits || 0) <= spare() * 0.5 && g.upgradeHq(h.id).ok) actions++;
  // 5. abilities: overdrive > passive > attack
  for (const which of ['overdrive', 'passive', 'attack']) {
    for (const u of squad()) {
      const c = P.abilityCost(E, u.abilityLevels[which] || 1);
      if (c.credits <= spare() * 0.35 && g.upgradeAbility(u.uid, which).ok) actions++;
    }
  }
  // 6. recruit with surplus
  const banners = g.banners();
  for (const b of banners) {
    for (let i = 0; i < 5; i++) {
      const k = Object.keys(b.cost || {})[0];
      const emptySlot = g.save.units.length < g.slots;
      const have = k === 'credits' ? (policy.smart ? spare() : g.wallet.credits || 0) : g.wallet[k] || 0;
      // smart players only Street Hire to fill a slot (commons are cheap filler, credits rank units up)
      if (k === 'credits' && policy.smart && !emptySlot) break;
      if (!k || have < b.cost[k] * (k === 'credits' && !emptySlot ? 2.5 : 1)) break;
      const rr = g.recruit(b.id, 1);
      if (rr.ok) { actions++; for (const x of rr.results || []) if (x.shards) st.dupes = (st.dupes || 0) + x.shards; }
    }
  }
  if (!policy.smart) g.autoFormation();
  return actions;
}

// Smart player: tries unit subsets + placements against the actual level, keeps the best.
function smartFormation(g, D, waves, rng) {
  const owned = g.units().sort((a, b) => b.power - a.power);
  const n = Math.min(g.slots, owned.length);
  const subsets = [];
  const top = owned.slice(0, n);
  subsets.push(top);
  const byRole = (r) => owned.filter((u) => u.role === r);
  // triad-guaranteed subset
  if (n >= 3) {
    const t = [byRole('tank')[0], byRole('archer')[0], byRole('mage')[0]].filter(Boolean);
    const rest = owned.filter((u) => !t.includes(u)).slice(0, n - t.length);
    subsets.push([...t, ...rest]);
  }
  // faction-stacked subsets
  for (const f of ['corporate', 'rogue', 'experimental']) {
    const fu = owned.filter((u) => u.faction === f).slice(0, n);
    if (fu.length >= Math.min(n, 2)) subsets.push([...fu, ...owned.filter((u) => !fu.includes(u))].slice(0, n));
  }
  subsets.length = Math.min(subsets.length, 4);
  for (let i = 0; i < 2; i++) {
    const s = top.slice();
    const bench = owned.slice(n);
    if (!bench.length) break;
    s[rng.int(0, s.length - 1)] = rng.pick(bench);
    if (new Set(s).size === s.length) subsets.push(s);
  }
  const placements = (s) => {
    const out = [];
    const base = autoSlots(D, s.map((u) => ({ def: u.def, uid: u.uid })));
    out.push(base);
    for (let k = 0; k < 3; k++) {
      const slots = rng.shuffle([0, 1, 2, 3, 4, 5]);
      const pl = s.map((u, i) => {
        const role = u.role;
        const pref = role === 'tank' ? [0, 1, 2] : [3, 4, 5];
        return { def: u.def, uid: u.uid, pref };
      });
      const used = new Set();
      const res = [];
      for (const p of pl.sort(() => 0)) {
        const choice = (k % 2 ? slots : [...p.pref.filter((x) => slots.includes(x)), ...slots]).find((x) => !used.has(x));
        used.add(choice);
        res.push({ def: p.def, uid: p.uid, slot: { col: Math.floor(choice / 3), lane: choice % 3 } });
      }
      out.push(res);
    }
    return out;
  };
  let best = null, bestScore = -1;
  const mods = g.squadMods();
  const sims = 2;
  for (const s of subsets) {
    for (const pl of placements(s)) {
      const units = pl.map((p) => { const u = g.unit(p.uid); return { def: u.def, level: u.level, rank: u.rank, abilityLevels: u.abilityLevels, slot: p.slot, uid: u.uid }; });
      let score = 0;
      for (let i = 0; i < sims; i++) {
        const r = simulateBattle({ data: D, player: { units, mods }, enemyWaves: waves, seed: rng.int(1, 1e9) });
        score += r.win ? 1 + r.integrity : r.wavesCleared * 0.2 + (1 - r.enemyIntegrity) * 0.2;
      }
      if (score > bestScore) { bestScore = score; best = units; }
    }
  }
  if (best) g.setFormation(best.map((u) => ({ uid: u.uid, slot: u.slot })));
  return bestScore / sims;
}

function runPlayer(D, policy, seed, maxHours) {
  let clockMs = 1.7e12;
  const g = createGame({ data: D, storage: false, now: () => clockMs, autosave: false });
  g.newGame({ seed });
  const rng = createRng(seed * 7919);
  const levels = allLevels(D);
  const T = { story: 0, star: 0, arena: 0, event: 0, upgrade: 0 };
  const T4 = { story: 0, star: 0, arena: 0, event: 0, upgrade: 0 };
  const starFail = {}, starBlock = {};
  // smart memory: arena win-rate estimate per rival difficulty, event tiers lost recently (blocked until power grows)
  const arenaEma = [0.8, 0.6, 0.45], evBlock = {};
  // binding constraint: time-weighted, per squad unit stuck at its level cap below max rank
  const bind = { shards: 0, credits: 0, both: 0, free: 0 };
  const shardSrc = {};
  let storyDone = null;
  const perMap = {};
  const stalls = [];
  const income = {};
  const snaps = [];
  // What capped the player: squad levels vs caps, ranks vs max, shards toward the next rank, wallet.
  function snapshot(label) {
    const sq = g.formation().map((f) => g.unit(f.uid)).filter(Boolean).map((u) =>
      `${u.def}(${u.rarity[0]}) L${u.level}/${u.levelCap} R${u.rank}/${u.maxRank} sh ${u.shards}/${u.rankUpCost?.shards ?? '-'} ab ${u.abilityLevels.attack}${u.abilityLevels.passive}${u.abilityLevels.overdrive}/${u.abilityCap}`);
    const w = Object.entries(g.wallet).filter(([, v]) => v).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
    return `${label} — power ${g.power()} — ${sq.join(' · ')} — wallet: ${w} — hq ${JSON.stringify(g.save.hq)}`;
  }
  let consecutive = 0, lastDay = 0, stallStart = null, hardWall = null;
  const hours = () => (T.story + T.star + T.arena + T.event + T.upgrade) / 3600;
  const totalStars = () => Object.values(g.save.story.levels).reduce((a, r) => a + (r.stars || 0), 0);
  const mapOf = (lid) => levels.find((l) => l.id === lid)?.mapId;
  const pm = (m) => (perMap[m] ||= { story: 0, star: 0, stars: 0, arena: 0, event: 0, upgrade: 0, battles: 0, losses: 0, grind: 0, stalledLevels: [], maxConsec: 0, power: 0 });
  let curMap = levels[0]?.mapId;

  function play(cfg, kind) {
    const r = simulateBattle(cfg);
    const out = g.completeBattle(r);
    const secs = r.time / TIME.speed + TIME.overhead;
    const inc = (income[kind === 'story' && cfg.id && g.save.story.levels[cfg.id]?.clears > 1 ? 'replay' : kind] ||= { secs: 0, n: 0, wins: 0, xp: 0 });
    inc.secs += secs; inc.n++; if (r.win) inc.wins++;
    for (const [k, v] of Object.entries(out.currency || {})) inc[k] = (inc[k] || 0) + v;
    for (const v of Object.values(out.xp || {})) inc.xp += v;
    for (const v of Object.values(out.shards || {})) inc.shards = (inc.shards || 0) + v;
    if (!r.win) pm(curMap)[r.reason] = (pm(curMap)[r.reason] || 0) + 1;
    T[kind] += secs; pm(curMap)[kind] += secs; pm(curMap).battles++;
    // sensitivity: same run if repeat arena/event battles were watched at x4 instead of x2
    T4.upgrade = T.upgrade;
    T4[kind] += kind === 'arena' || kind === 'event' ? r.time / 4 + TIME.overhead : secs;
    const acts = spendAll(g, D, policy, shardSrc);
    for (const v of Object.values(out.shards || {})) shardSrc[kind] = (shardSrc[kind] || 0) + v;
    T.upgrade += acts * TIME.upgradeSession; pm(curMap).upgrade += acts * TIME.upgradeSession;
    for (const f of g.formation()) {
      const u = g.unit(f.uid);
      if (!u || u.level < u.levelCap) { bind.free += secs; continue; }
      if (u.rank >= u.maxRank || !u.rankUpCost) continue;
      const sh = u.shards < u.rankUpCost.shards, cr = (g.wallet.credits || 0) < u.rankUpCost.credits;
      bind[sh && cr ? 'both' : sh ? 'shards' : cr ? 'credits' : 'free'] += secs;
    }
    clockMs += (secs + acts * TIME.upgradeSession) * 1000 * (24 / TIME.dayHours);
    return { r, out };
  }

  // Star play: replay a cleared level with open goals once it's comfortably under our power.
  function starCandidate() {
    const p = g.power();
    let best = null;
    for (const l of levels) {
      const rec = g.save.story.levels[l.id];
      if (!rec?.clears || rec.stars >= 3 || (starBlock[l.id] || 0) > p || l.power > p * TIME.starPower) continue;
      if (!best || l.power < best.power) best = l;
    }
    return best;
  }
  function playStar() {
    const l = starCandidate();
    if (!l) return false;
    const keep = g.formation();
    g.goalFormation(l.id);
    const cfg = g.startLevel(l.id);
    if (!cfg.ok) { starBlock[l.id] = Infinity; g.setFormation(keep); return false; }
    const { out } = play(cfg, 'star');
    if (policy.smart) g.setFormation(keep.filter((f) => g.unit(f.uid)));
    if (out.newStars) { pm(l.mapId).stars += out.newStars; starFail[l.id] = 0; }
    else if ((starFail[l.id] = (starFail[l.id] || 0) + 1) >= 2) { starFail[l.id] = 0; starBlock[l.id] = g.power() * TIME.starRetry; }
    return true;
  }

  function grindSession(n) {
    for (let i = 0; i < n; i++) {
      if (policy.stars && i % 2 === 0 && playStar()) continue;
      // daily events first, best tier that looks winnable, else arena
      let done = false;
      for (const ev of g.activeEvents()) {
        if (ev.kind === 'raid') continue;
        const tiers = (ev.tiers || []).slice().reverse();
        for (const t of tiers) {
          const rec = g.save.events[ev.id]?.[t.id];
          const used = rec && rec.lastDay === g.day() ? rec.today : 0;
          const dimOk = !ev.diminish || (ev.diminish[Math.min(used, ev.diminish.length - 1)] || 0) >= 0.5;
          if (!dimOk || (t.power && t.power > g.power() * TIME.eventPowerPick && t !== tiers[tiers.length - 1])) continue;
          const bk = ev.id + ':' + t.id;
          if (policy.smart && evBlock[bk] > g.power() && t !== tiers[tiers.length - 1]) continue;
          const cfg = g.startEvent(ev.id, t.id);
          if (!cfg.ok) continue;
          const { r } = play(cfg, 'event'); pm(curMap).grind++; done = true;
          if (policy.smart) { if (r.win) delete evBlock[bk]; else evBlock[bk] = g.power() * 1.08; }
          break;
        }
        if (done) break;
      }
      if (!done && g.hasFeature('arena')) {
        const rv = g.arenaRivals();
        // smart: the rival with the best expected value (harder rivals move the rating, and so the tier, faster)
        const idx = policy.smart ? [0, 1, 2].filter((i) => rv[i]).reduce((b, i) => (arenaEma[i] * (1 + 0.25 * i) > arenaEma[b] * (1 + 0.25 * b) ? i : b), 0) : 1;
        const cfg = g.startArena(rv[idx] ? idx : 0);
        if (cfg.ok) { const { r } = play(cfg, 'arena'); pm(curMap).grind++; done = true; arenaEma[idx] += 0.15 * ((r.win ? 1 : 0) - arenaEma[idx]); }
      }
      if (!done) replayPrev();
    }
  }

  function replayPrev() {
    const cur = g.nextLevel();
    const prev = cur && levels[levels.findIndex((l) => l.id === cur.id) - 1];
    if (!prev) return;
    const c = g.startLevel(prev.id);
    if (c.ok) play(c, 'story');
  }

  let guard = 0;
  while (hours() < maxHours && guard++ < 20000) {
    const lvl = g.nextLevel();
    if (!lvl) break;
    curMap = lvl.mapId;
    if (policy.smart && (consecutive > 0 || lvl.boss || lvl.elite)) smartFormation(g, D, lvl.waves, rng);
    else g.autoFormation();
    if (stallStart != null && hours() - stallStart > TIME.hardWallHours) { hardWall = lvl.id; break; }
    const cfg = g.startLevel(lvl.id);
    if (!cfg.ok) { console.log('cannot start', lvl.id, cfg.reason); break; }
    const { r } = play(cfg, 'story');
    pm(curMap).power = g.power();
    if (r.win) { consecutive = 0; stallStart = null; continue; }
    pm(curMap).losses++;
    consecutive++;
    pm(curMap).maxConsec = Math.max(pm(curMap).maxConsec, consecutive);
    if (consecutive === TIME.stallLimit) {
      stallStart = hours();
      snaps.push(snapshot(`stall ${lvl.id} @${hours().toFixed(1)}h (needs ~${lvl.power})`)); stalls.push({ level: lvl.id, hours: +hours().toFixed(2), power: g.power() }); pm(curMap).stalledLevels.push(lvl.id); }
    if (policy.grind) grindSession(policy.grindBatch || 4);
    else if (consecutive >= TIME.stallLimit) {
      // story-only player: replay the last cleared level to farm
      for (let i = 0; i < 3; i++) replayPrev();
    }
    // a "day" passed? daily events open again
    if (policy.grind && Math.floor(hours() / TIME.dayHours) > lastDay) { lastDay = Math.floor(hours() / TIME.dayHours); grindSession(2); }
  }
  const finishedStory = !g.nextLevel();
  const tAtStory = { ...T }, t4AtStory = { ...T4 };
  storyDone = finishedStory ? hours() : null;
  const starsAtStoryEnd = totalStars();
  // completionist phase: keep grinding + star play until stars plateau
  let completeHours = null;
  if (policy.stars && finishedStory) {
    curMap = 'post';
    let since = 0, last = totalStars(), g2 = 0;
    while (hours() < maxHours && since < TIME.completeStall && last < levels.length * 3 && g2++ < 20000) {
      const b0 = g.save.stats.battles;
      grindSession(4);
      if (g.save.stats.battles === b0) break;
      const now = totalStars();
      since = now > last ? 0 : since + (g.save.stats.battles - b0);
      last = now;
      if (Math.floor(hours() / TIME.dayHours) > lastDay) { lastDay = Math.floor(hours() / TIME.dayHours); }
    }
    completeHours = hours();
  }
  snaps.push(snapshot(`end @${hours().toFixed(1)}h`));
  const next = g.nextLevel();
  return { policy: policy.name, seed, hours: storyDone ?? hours(), storyDone, completeHours, starsAtStoryEnd, starsEnd: totalStars(), maxStars: levels.length * 3,
    T: tAtStory || T, Tall: T, T4: t4AtStory, hardWall, bind, shardSrc, income, snaps, perMap, stalls, finished: !next, reachedLevel: next?.id || 'END', power: g.power(), company: g.save.company.level, slots: g.slots, units: g.save.units.length };
}

function fmtH(s) { return (s / 3600).toFixed(2); }

const tsum = (T) => T.story + (T.star || 0) + T.arena + T.event + T.upgrade;
const grindPct = (T) => 100 * (T.arena + T.event) / Math.max(1, tsum(T));
const replayPct = (T) => 100 * (T.arena + T.event + (T.star || 0)) / Math.max(1, tsum(T));

function reportProgress(D, runs) {
  const lines = [];
  for (const run of runs) {
    lines.push(`\n### ${run.policy} (seed ${run.seed}) — ${run.finished || run.storyDone ? 'FINISHED' : (run.hardWall ? 'HARD WALL at ' : 'stopped at ') + run.reachedLevel} in ${run.hours.toFixed(1)} h; power ${run.power}, slots ${run.slots}, ${run.units} units`);
    const T = run.T;
    lines.push(`story-end time split: story ${fmtH(T.story)} h · star replays ${fmtH(T.star || 0)} h · arena ${fmtH(T.arena)} h · events ${fmtH(T.event)} h · upgrades ${fmtH(T.upgrade)} h · arena+events ${grindPct(T).toFixed(0)}% · all replay (incl. stars) ${replayPct(T).toFixed(0)}%` + (run.T4 ? ` · (grind at x4: ${(tsum(run.T4) / 3600).toFixed(1)} h, arena+events ${grindPct(run.T4).toFixed(0)}%)` : ''));
    if (run.bind) { const b = run.bind, tot = b.shards + b.credits + b.both || 1; lines.push(`rank-up blockers (unit-time at level cap): shards ${Math.round(100 * b.shards / tot)}% · credits ${Math.round(100 * b.credits / tot)}% · both ${Math.round(100 * b.both / tot)}%`); }
    if (run.shardSrc) lines.push('shard sources (whole run): ' + Object.entries(run.shardSrc).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · '));
    lines.push(`stars: ${run.starsAtStoryEnd}/${run.maxStars} at story end` + (run.completeHours != null ? `; completionist: ${run.starsEnd}/${run.maxStars} (${Math.round(100 * run.starsEnd / run.maxStars)}%) at ${run.completeHours.toFixed(1)} h` : ''));
    lines.push('income per hour by activity: ' + Object.entries(run.income).map(([k, v]) => `${k} [${v.n} battles, win ${Math.round(100 * v.wins / v.n)}%] ` + ['xp', 'credits', 'scrap', 'chips', 'arena_tokens', 'event_marks', 'shards'].filter((c) => v[c]).map((c) => `${c} ${Math.round(v[c] / (v.secs / 3600))}`).join(' ')).join(' | '));
    lines.push('| map | hours | battles | losses | grind battles | arena+events % | star h | new stars | max consec. losses | stalled at | power | timeouts/defeats |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [m, x] of Object.entries(run.perMap)) {
      const t = tsum(x);
      lines.push(`| ${m} | ${fmtH(t)} | ${x.battles} | ${x.losses} | ${x.grind} | ${(100 * (x.arena + x.event) / Math.max(1, t)).toFixed(0)}% | ${fmtH(x.star || 0)} | ${x.stars || 0} | ${x.maxConsec} | ${x.stalledLevels.join(', ') || '-'} | ${x.power} | ${x.timeout || 0}/${x.defeat || 0} |`);
    }
  }
  return lines.join('\n');
}

// Per-policy curve averaged over seeds: hours per map (wall clock while that map was the frontier).
function reportCurve(runs, policies) {
  const L = ['\n## Balance curve (mean over seeds; hours per map while it was the frontier)'];
  const maps = [...new Set(runs.flatMap((r) => Object.keys(r.perMap)))];
  L.push(`| policy | ${maps.join(' | ')} | story end h | finished | arena+events % | incl. stars % | stars at end |`);
  L.push(`|---|${maps.map(() => '---').join('|')}|---|---|---|---|---|`);
  for (const p of policies) {
    const rs = runs.filter((r) => r.policy === p.name);
    if (!rs.length) continue;
    const avg = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    const cells = maps.map((m) => { const v = rs.filter((r) => r.perMap[m]); return v.length ? (v.reduce((a, r) => a + tsum(r.perMap[m]), 0) / v.length / 3600).toFixed(1) + (v.length < rs.length ? `(${v.length})` : '') : '-'; });
    L.push(`| ${p.name.split(' ')[0]} | ${cells.join(' | ')} | ${avg((r) => r.hours).toFixed(1)} | ${rs.filter((r) => r.storyDone != null || r.finished).length}/${rs.length} | ${avg((r) => grindPct(r.T)).toFixed(0)}% | ${avg((r) => replayPct(r.T)).toFixed(0)}% | ${Math.round(avg((r) => 100 * r.starsAtStoryEnd / r.maxStars))}% |`);
  }
  return L.join('\n');
}

// ---------------------------------------------------------------- matchups
function matchups(D, trials) {
  const rng = createRng(SEED * 31);
  const units = Object.values(D.units).filter((u) => u.realm !== 'fantasy');
  const roles = ['tank', 'archer', 'mage'];
  const facs = ['corporate', 'rogue', 'experimental'];
  const LVL = 30, RANK = 3, AL = 3;
  const inst = (u) => ({ def: u.id, level: LVL, rank: RANK, abilityLevels: { attack: AL, passive: AL, overdrive: AL } });
  const fight = (a, b) => {
    const r = simulateBattle({ data: D, player: { units: autoSlots(D, a) }, enemyWaves: [{ units: autoSlots(D, b) }], seed: rng.int(1, 1e9) });
    return r.win ? 1 : 0;
  };
  // mirrored: play both sides so side order doesn't bias
  const duel = (a, b) => (fight(a, b) + (1 - fight(b, a))) / 2;
  const pickN = (pool, n) => rng.shuffle(pool).slice(0, n);
  const out = {};
  // role table
  out.role = {};
  for (const r1 of roles) for (const r2 of roles) {
    let w = 0;
    for (let i = 0; i < trials; i++) w += duel(pickN(units.filter((u) => u.role === r1), 3).map(inst), pickN(units.filter((u) => u.role === r2), 3).map(inst));
    (out.role[r1] ||= {})[r2] = w / trials;
  }
  // faction table, T/A/M squads
  const tam = (f) => roles.map((r) => rng.pick(units.filter((u) => u.role === r && (!f || u.faction === f)))).filter(Boolean);
  out.faction = {};
  for (const f1 of facs) for (const f2 of facs) {
    let w = 0;
    for (let i = 0; i < trials; i++) w += duel(tam(f1).map(inst), tam(f2).map(inst));
    (out.faction[f1] ||= {})[f2] = w / trials;
  }
  // per unit: unit + 3 random partners (role-mixed) vs random 4
  const comp4 = (fixed) => { const s = fixed ? [fixed] : []; const rs = rng.shuffle(['tank', 'archer', 'mage', rng.pick(roles)]); for (const r of rs) { if (s.length >= 4) break; const c = units.filter((u) => u.role === r && !s.includes(u)); s.push(rng.pick(c)); } return s.slice(0, 4); };
  out.unit = units.map((u) => {
    let w = 0;
    const n = +(args.unitTrials || Math.max(10, Math.round(trials / 2)));
    for (let i = 0; i < n; i++) w += duel(comp4(u).map(inst), comp4(null).map(inst));
    return { id: u.id, role: u.role, faction: u.faction, rarity: u.rarity, win: w / n };
  }).sort((a, b) => b.win - a.win);
  // per unit at honest rank (rarity start rank + 1, ≤ max)
  const E = P.econ(D);
  const honest = (u) => ({ ...inst(u), rank: Math.min(P.maxRank(E, u.rarity), (E.startRank[u.rarity] ?? 0) + 1) });
  out.rarity = {};
  for (const rar of ['common', 'rare', 'epic', 'legendary']) {
    const pool = units.filter((u) => u.rarity === rar);
    if (!pool.length) continue;
    let w = 0;
    for (let i = 0; i < trials; i++) { const u = rng.pick(pool); w += duel(comp4(u).map((x) => (x === u ? honest(x) : inst(x))), comp4(null).map(inst)); }
    out.rarity[rar] = w / trials;
  }
  // role-count compositions at 6 slots
  const comps = ['2/2/2', '1/2/3', '1/3/2', '2/3/1', '2/1/3', '3/2/1', '3/1/2', '1/4/1', '1/1/4', '0/3/3', '3/3/0', '3/0/3', '6/0/0', '0/6/0', '0/0/6', '4/1/1'];
  const build = (c) => { const [t, a, m] = c.split('/').map(Number); return [...pickN(units.filter((u) => u.role === 'tank'), t), ...pickN(units.filter((u) => u.role === 'archer'), a), ...pickN(units.filter((u) => u.role === 'mage'), m)]; };
  out.comp = comps.map((c) => {
    let w = 0;
    for (let i = 0; i < trials; i++) w += duel(build(c).map(inst), build(rng.pick(comps)).map(inst));
    return { comp: c, win: w / trials };
  }).sort((a, b) => b.win - a.win);
  // mono-faction 6 vs mixed 6 (2/2/2)
  out.mono = {};
  for (const f of facs) {
    let w = 0;
    const mono = () => { const fu = units.filter((u) => u.faction === f); const s = []; for (const r of ['tank', 'tank', 'archer', 'archer', 'mage', 'mage']) { const c = fu.filter((u) => u.role === r && !s.includes(u)); if (c.length) s.push(rng.pick(c)); } return s; };
    for (let i = 0; i < trials; i++) w += duel(mono().map(inst), build('2/2/2').map(inst));
    out.mono[f] = w / trials;
  }
  return out;
}

function reportMatchups(m) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const L = [];
  L.push('\n## Role table (row 3× role vs column 3× role, win% of row; L30 R3 A3)');
  L.push('| | tank | archer | mage |\n|---|---|---|---|');
  for (const r of ['tank', 'archer', 'mage']) L.push(`| ${r} | ${['tank', 'archer', 'mage'].map((c) => pct(m.role[r][c])).join(' | ')} |`);
  L.push('\n## Faction table (T/A/M squads)');
  L.push('| | corporate | rogue | experimental |\n|---|---|---|---|');
  for (const r of ['corporate', 'rogue', 'experimental']) L.push(`| ${r} | ${['corporate', 'rogue', 'experimental'].map((c) => pct(m.faction[r][c])).join(' | ')} |`);
  L.push('\n## Mono-faction 6 (2/2/2) vs random mixed 2/2/2: ' + Object.entries(m.mono).map(([f, w]) => `${f} ${pct(w)}`).join(', '));
  L.push('\n## Rarity at honest rank (start+1) in a random 4-squad vs random 4 (equal rank): ' + Object.entries(m.rarity).map(([f, w]) => `${f} ${pct(w)}`).join(', '));
  L.push('\n## Role-count compositions (6 slots T/A/M) vs random comps');
  L.push(m.comp.map((c) => `${c.comp} ${pct(c.win)}`).join(' · '));
  L.push('\n## Units (unit + 3 random partners vs random 4, equal level/rank)');
  L.push('top: ' + m.unit.slice(0, 6).map((u) => `${u.id}(${u.role[0]}) ${pct(u.win)}`).join(', '));
  L.push('bottom: ' + m.unit.slice(-6).map((u) => `${u.id}(${u.role[0]}) ${pct(u.win)}`).join(', '));
  const flagged = m.unit.filter((u) => u.win > 0.65 || u.win < 0.35);
  L.push('flagged (>65% or <35%): ' + (flagged.map((u) => `${u.id} ${pct(u.win)}`).join(', ') || 'none'));
  // rarity is meant to matter (RB stat multiplier), so outliers are judged against their rarity's mean
  const rmean = {};
  for (const r of ['common', 'rare', 'epic', 'legendary']) { const xs = m.unit.filter((u) => u.rarity === r); if (xs.length) rmean[r] = xs.reduce((a, u) => a + u.win, 0) / xs.length; }
  L.push('rarity means (equal rank): ' + Object.entries(rmean).map(([r, v]) => `${r} ${pct(v)}`).join(', '));
  const dev = m.unit.map((u) => ({ ...u, dev: u.win - rmean[u.rarity] })).sort((a, b) => b.dev - a.dev);
  L.push('vs rarity mean, outside ±10 pts: ' + (dev.filter((u) => Math.abs(u.dev) > 0.10).map((u) => `${u.id}(${u.rarity[0]}) ${u.dev > 0 ? '+' : ''}${Math.round(u.dev * 100)}`).join(', ') || 'none'));
  L.push('all (pts vs rarity mean): ' + dev.map((u) => `${u.id} ${u.dev > 0 ? '+' : ''}${Math.round(u.dev * 100)}`).join(', '));
  return L.join('\n');
}

// ---------------------------------------------------------------- main
let D = await getData();
if (args.rules) { const src = D._source; D = prepareData({ ...D, rules: { ...(D.rules || {}), ...JSON.parse(args.rules) } }); D._source = src + ' + rules ' + args.rules; }
console.log(`# Balance harness — data: ${D._source}; ${Object.keys(D.units).length} units, ${allLevels(D).length} story levels`);
const report = [];
const json = {};
if (args.only !== 'matchups') {
  const maxH = +(args.hours || 80);
  const policies = [
    { name: 'straight (story only)', grind: false },
    { name: 'grinder (story + arena/events)', grind: true, grindBatch: 4 },
    { name: 'smart (grinder + formation search + star goals)', grind: true, grindBatch: 4, smart: true, stars: true },
  ];
  const runs = [];
  const seeds = args.seeds ? String(args.seeds).split(',').map(Number) : [SEED];
  const only = args.policy ? policies.filter((p) => p.name.startsWith(args.policy)) : policies;
  for (const seed of seeds) for (const p of only) {
    const t = Date.now();
    const r = runPlayer(D, p, seed, maxH);
    r.cpu = (Date.now() - t) / 1000;
    runs.push(r);
    console.error(`  ${p.name} seed ${seed}: ${r.hours.toFixed(1)} h, reached ${r.reachedLevel} (${r.cpu.toFixed(1)} s cpu)`);
  }
  json.progress = runs;
  report.push('## Player simulations' + reportProgress(D, runs));
  for (const r of runs) report.push(`\nstalls (${r.policy}, seed ${r.seed}): ` + (r.stalls.map((s) => `${s.level}@${s.hours}h`).join(', ') || 'none'));
  if (!args.nosnaps) for (const r of runs) report.push(`\n#### snapshots — ${r.policy} (seed ${r.seed})\n` + r.snaps.slice(-6).map((x) => '- ' + x).join('\n'));
  report.push(reportCurve(runs, policies));
  if (seeds.length > 1) {
    report.push('\n## Multi-seed summary');
    for (const p of policies) {
      const rs = runs.filter((r) => r.policy === p.name);
      if (!rs.length) continue;
      const avg = (f) => (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1);
      report.push(`- ${p.name}: hours ${avg((r) => r.hours)} (${rs.map((r) => r.hours.toFixed(1)).join('/')}), finished ${rs.filter((r) => r.storyDone != null || r.finished).length}/${rs.length}, reached ${rs.map((r) => r.reachedLevel).join(' ')}, arena+events ${avg((r) => grindPct(r.T))}%, incl. stars ${avg((r) => replayPct(r.T))}%` + (rs.some((r) => r.completeHours) ? `, completionist ${avg((r) => r.completeHours || 0)} h at ${avg((r) => 100 * r.starsEnd / r.maxStars)}% stars` : ''));
    }
  }
}
if (args.only !== 'progress') {
  const m = matchups(D, QUICK ? 30 : 120);
  json.matchups = m;
  report.push(reportMatchups(m));
}
console.log(report.join('\n'));
if (args.json) writeFileSync(args.json, JSON.stringify(json, null, 1));
