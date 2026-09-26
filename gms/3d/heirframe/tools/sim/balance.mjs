// Balance bot: plays Tense contracts through the real game_state actions and resolveHit fights.
// node tools/sim/balance.mjs [--hours 60] [--seed 1] [--quiet] [--json]
import { createGame } from '../../js/sim/game_state.js';
import { createRng } from '../../js/sim/rng.js';
import { createSaveStore, memoryStorage } from '../../js/sim/save.js';
import { tickCombatant, computeStats, makeCombatant, resolveHit } from '../../js/sim/stats.js';
import { createEnemy } from '../../js/sim/enemies.js';
import { rollItem } from '../../js/sim/loot.js';
import { FRAMES, SKILLS } from '../../js/data/frames.js';
import { chooseEnemySkill } from '../../js/sim/enemies.js';
import { sitesFor } from '../../js/sim/missions.js';
import { itemFR, tuneCost } from '../../js/sim/loot.js';
import { RARITY_INDEX } from '../../js/data/loot.js';
import { xpNext } from '../../js/sim/economy.js';
import { L } from '../../js/data/balance.js';
import { mkUpgrade, framePrice } from '../../js/sim/economy.js';
import { DISTRICTS } from '../../js/data/districts.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));
const HOURS = +(args.hours || 60);
const SEED = args.seed || 1;
const QUIET = !!args.quiet;
const ROTATE = !!args.rotate;  // play the spare frames one contract in four (sync them for Mk tiers)
const HUMAN = 1.25;          // humans are slower than the bot at walking/reading
const OVERHEAD = 40;         // board, results card, travel to the first marker (s)
const FRAME_ORDER = ['brawler', 'gunner', 'ghost'];

export function runBalance({ hours = HOURS, seed = SEED, quiet = QUIET, rotate = ROTATE, log = console.log } = {}) {
  const game = createGame({ seed, store: createSaveStore(memoryStorage()) });
  game.noAutosave = true;
  const S = game.state;
  const brng = createRng('balance|' + seed);
  const out = { spent: {}, deathLog: [], milestones: {}, hourly: [], ttk: [], deaths: 0, fails: 0, contracts: 0, idleRich: 0, notes: [] };
  const ms = (k, v = S.playSeconds) => { if (out.milestones[k] == null) out.milestones[k] = Math.round(v); };
  game.on('equip', p => { if (p.prev == null || S.playSeconds > 0) if (S.playSeconds > 0 && p.item) ms('firstUpgrade'); });
  game.on('loot', p => { for (const it of p.items || []) if (it.rarity === 'relic') ms('firstRelic'); });
  game.on('frame:buy', () => { const n = game.ownedFrames().length; ms(['', 'frame1', 'frame2', 'frame3'][n]); });
  game.on('levelUp', p => { ms('level' + p.level); });
  out.xpBy = {}; out.grades = {};
  game.on('xp', p => { out.xpBy[p.source] = (out.xpBy[p.source] || 0) + p.gained; hourXp += p.gained / L(S.player.level); });
  let hourXp = 0, hourContracts = 0;
  game.on('contract:accept', p => { const g = p.mission.grade; out.grades[g] = (out.grades[g] || 0) + 1; });

  const advance = (sec, moving = false) => {
    let t = sec;
    while (t > 0) { const d = Math.min(t, 5); game.tick(d, { moving }); t -= d; }
  };

  // ---- one fight: player vs a pack ---------------------------------------------------------
  function fight(spawns) {
    const p = game.playerCombatant();
    const enemies = spawns.map(s => game.spawnEnemy(s)).filter(e => !e.nonCombat);
    const dt = 0.1;
    let t = 0, combo = 0, lastHitT = -9;
    const ranged = p.skills.attack.kind === 'ranged';
    while (enemies.some(e => e.alive) && t < 240) {
      t += dt;
      tickCombatant(p, dt, { moving: ranged && Math.floor(t) % 3 === 0 });
      if (!p.alive) break;
      const alive = enemies.filter(e => e.alive);
      const engaged = alive.slice(0, 4);
      for (const e of alive) tickCombatant(e, dt);
      // repair kit
      if (p.hp < p.stats.hp * 0.3 && S.consumables.repairKit > 0) game.useConsumable('repairKit');
      const target = engaged.reduce((a, b) => (a.hp <= b.hp ? a : b));
      // skills first
      for (const k of ['heir', 's1', 's2', 's3']) {
        const sk = p.skills[k];
        if (!sk || !game.useSkill(p, sk)) continue;
        if (sk.kind === 'self' || sk.kind === 'distract' || sk.kind === 'blink') {
          if (sk.id === 'r_sponsored' || sk.id === 'h_pulse') for (const e of engaged.slice(0, 3)) for (const st of sk.applies || []) if (e.rank !== 'boss' && e.rank !== 'champion') e.statuses.push({ ...st });
          continue;
        }
        if (sk.kind === 'summon') { // turret: model as 10 s of extra hits
          const shots = Math.round(sk.summon.t * sk.summon.rate * 0.7);
          for (let i = 0; i < shots; i++) { const tg = enemies.find(e => e.alive); if (!tg) break; const r = game.hit(p, tg, { base: sk.summon.base, kind: 'ranged' }); if (r.killed) game.kill(tg); }
          continue;
        }
        const n = sk.kind === 'aoe' ? 3 : sk.kind === 'cone' || sk.kind === 'dash' || sk.kind === 'line' ? 2 : 1;
        const pellets = sk.pellets || sk.hits || 1;
        for (const e of engaged.filter(x => x.alive).slice(0, n)) {
          for (let i = 0; i < pellets; i++) { const r = game.hit(p, e, sk, { pellet: i > 0 }); if (r.killed) { game.kill(e); break; } }
        }
      }
      // basic attack
      if (target.alive && game.useSkill(p, p.skills.attack)) {
        if (t - lastHitT > (p.skills.attack.comboReset || 9)) combo = 0;
        const r = game.hit(p, target, p.skills.attack, { comboIndex: combo++, backstab: !target.alerted && p.skills.attack.backstab });
        lastHitT = t;
        if (r.killed) game.kill(target);
        if (r.chain) { const other = engaged.find(e => e !== target && e.alive); if (other) { const r2 = game.hit(p, other, { base: (p.skills.attack.base || 10) * r.chain.pct, kind: 'ranged' }); if (r2.killed) game.kill(other); } }
      }
      // enemies act (after a 1.5 s approach)
      if (t > 1.5) for (const e of engaged) {
        if (!e.alive || e.statuses.some(s => s.stun || s.id === 'distracted' || s.id === 'disabled')) continue;
        const sk = chooseEnemySkill(e, e.skills.e_pistol || e.skills.e_zap || e.skills.e_burst ? 9 : 2);
        if (!sk || !game.useSkill(e, sk)) continue;
        const avoid = sk.telegraph ? 0.55 : 0.2;
        if (brng.next() < avoid) continue;
        const shots = sk.shots || 1;
        for (let i = 0; i < shots; i++) game.hit(e, p, sk, { frontal: false });
        if (!p.alive) break;
      }
    }
    if (!p.alive) out.deathLog.push({ frame: game.activeFrame().frameId, lvl: S.player.level, units: enemies.map(e => `${e.defId}:${e.rank}:${e.level}`).join(' ') , left: enemies.filter(e => e.alive).length, district: S.districts.current });
    return { time: t, died: !p.alive };
  }

  // ---- mission time model -----------------------------------------------------------------
  function missionTime(m) {
    const sites = sitesFor(m.district);
    const pos = id => sites.find(s => s.id === id) || { x: 0, z: 0 };
    const speed = game.playerCombatant().stats.moveSpeed;
    let t = 0, cur = { x: 0, z: 0 };
    const go = id => { const p = pos(id); t += Math.hypot(p.x - cur.x, p.z - cur.z) / speed + 3; cur = p; };
    for (const s of m.steps) {
      switch (s.type) {
        case 'goto': case 'exfil': go(s.site); break;
        case 'pickup': case 'deliver': t += 3; break;
        case 'hack': for (const id of s.sites) { go(id); t += s.time; } break;
        case 'photo': go(s.site); t += s.holdTime * s.shots + 8; break;
        case 'tail': t += s.duration; break;
        case 'escort': for (const id of s.path) { const p = pos(id); t += Math.hypot(p.x - cur.x, p.z - cur.z) / 3; cur = p; } break;
        case 'defend': t += s.duration; break;
        case 'race': t += s.par * 0.9; break;
        case 'destroy': for (const o of s.objs) { go(o.site); t += 4; } break;
        case 'capture': t += 5; break;
        case 'choose': t += 8; break;
        case 'survive': t += s.seconds; break;
        default: t += 5;
      }
    }
    return t;
  }

  // ---- policies ----------------------------------------------------------------------------
  // players work the newest district that still levels to them (early districts cap at maxLvl + 5)
  function bestDistrict() {
    const lv = S.player.level;
    const ok = S.districts.unlocked.map(id => DISTRICTS[id]).filter(d => d.minLvl <= lv);
    return ok.reduce((a, d) => (d.maxLvl > a.maxLvl ? d : a), ok[0] || DISTRICTS[S.districts.current]).id;
  }
  function pickContract() {
    const best = bestDistrict();
    if (best !== S.districts.current && game.travel(best).ok) { game.refreshBoard(); advance(15); }
    const b = game.board();
    if (b.story) return b.story;
    const oc = S.overclock.active;
    const cards = b.cards.filter(c => oc || c.level <= S.player.level + 3);
    // in Overclock, Elite clears unlock the next tier
    if (oc) { const el = cards.find(c => c.grade === 'elite'); if (el && recent.slice(-3).every(Boolean)) return el; }
    if (!cards.length) return null;
    return cards.reduce((a, c) => (c.payout.credits + c.payout.xp * 0.5 > a.payout.credits + a.payout.xp * 0.5 ? c : a));
  }

  function spend() {
    // frames
    const owned = game.ownedFrames();
    const price = game.framePrice();
    if (owned.length < 3 && price != null && S.player.level >= 5 && S.credits >= price) {
      const next = FRAME_ORDER.find(id => !S.frames.some(f => f.frameId === id));
      const r = game.buyFrame(next);
      if (r.ok) {
        advance(30);
        // play the first owned frame; others get gear when they become active
        if (owned.length >= 1) game.swapFrame(owned[0].uid, { force: true });
        if (S.frames.some(f => f.rental)) game.returnRental();
        game.equipBest();
      }
    }
    // the next licence comes first once you are near its target level (2nd ~15, 3rd ~25)
    const n = game.ownedFrames().length;
    let saving = n < 3 && S.player.level >= [5, 14, 24][n] ? game.framePrice() || 0 : 0;
    // Mk tiers: main frame first, then the others
    const main = game.ownedFrames()[0] || game.activeFrame();
    for (const f of [main, ...game.ownedFrames().filter(x => x !== main)]) {
      if (f.rental) continue;
      const up = mkUpgrade(f, S.player.level);
      if (up?.ok && S.credits >= up.cost * 1.1 + saving) game.upgradeMk(f.uid);
    }
    // tuning: equipped items, cheapest first, keep a reserve for the next frame
    const reserve = Math.max(saving, owned.length < 3 && S.player.level >= 5 ? (price || 0) * 0.5 : 0);
    const act = game.activeFrame();
    const eq = Object.values(act.equipped).filter(Boolean).map(game.itemByUid).filter(Boolean);
    eq.sort((a, b) => (tuneCost(a)?.credits ?? 1e18) - (tuneCost(b)?.credits ?? 1e18));
    for (const it of eq) {
      const c = tuneCost(it);
      if (!c || it.tune >= 10) continue;
      if (S.credits - c.credits < reserve) break;
      if (c.chance < 0.5 && S.credits < c.credits * 4) continue;
      game.tune(it.uid);
    }
    // repair kits
    while (S.consumables.repairKit < 3 && S.credits > 20 * L(S.player.level) * 10) if (!game.buyConsumable('repairKit').ok) break;
    // stash
    if (game.freeStash() > S.stashSize * 0.85) game.buyStash();
    // the main frame's next Mk tier outranks luxuries once its level gate is near
    const mainUp = main.rental ? null : mkUpgrade(main, S.player.level + 3);
    if (mainUp?.ok) saving += mainUp.cost;
    // rich: buy the materials the next tune is missing from the broker
    if (S.player.level >= 15 && !saving) for (const it of eq) {
      const c = tuneCost(it);
      if (!c || it.tune >= 10) continue;
      const miss = Object.entries(c.mats).filter(([k, v]) => (S.materials[k] || 0) < v);
      const cost = miss.reduce((a, [k, v]) => a + game.brokerPrice(k, v - (S.materials[k] || 0)), 0);
      if (miss.length && S.credits > (cost + c.credits) * 3) {
        for (const [k, v] of miss) game.buyMaterial(k, v - (S.materials[k] || 0));
        out.spent.broker = (out.spent.broker || 0) + cost;
        game.tune(it.uid);
      }
    }
    // rich: Sal's Special relic, then homes / paints / stash from the next-goal chip
    if (S.player.level >= 15 && !saving) {
      const mk = game.refreshMarket && S.market?.shift === S.shiftIndex ? S.market : game.refreshMarket();
      const sp = mk.stock.findIndex(e => e.special && !e.sold);
      if (sp >= 0 && S.credits > mk.stock[sp].price * 5) { const r = game.buyMarket(sp); if (r.ok) out.spent.special = (out.spent.special || 0) + 1; }
      const goal = game.nextGoal();
      if (goal && S.credits > goal.cost * 2) {
        const [kind, id] = goal.id.split(':');
        const r = kind === 'home' ? game.buyHome(id) : kind === 'paint' ? game.buyPaint(id) : kind === 'stash' ? game.buyStash() : { ok: false };
        if (r.ok) out.spent[kind] = (out.spent[kind] || 0) + 1;
      }
    }
  }

  // from level 20 with three frames, one contract in four goes to the least-synced spare frame
  function pickFrame() {
    const owned = game.ownedFrames();
    if (!rotate || owned.length < 3 || S.player.level < 20) return;
    const main = owned[0];
    const spare = owned.slice(1).sort((a, b) => a.sync - b.sync)[0];
    const want = out.contracts % 4 === 3 ? spare : main;
    if (game.activeFrame() !== want) { game.swapFrame(want.uid, { force: true }); game.repair(); game.equipBest(); }
  }

  // endgame: push the highest Overclock that is not failing too often
  const recent = [];
  function pickThreat() {
    if (S.player.level < 60) return;
    const n = S.overclock.active || 0;
    const last = recent.slice(-4);
    let want = n;
    if (last.filter(x => !x).length >= 2) want = Math.max(0, n - 1);
    else if (last.length === 4 && last.every(Boolean)) want = Math.min(n + 1, Math.max(1, S.overclock.unlocked));
    if (want !== n) { recent.length = 0; game.setThreat(want ? 'overclock:' + want : 'tense'); }
  }

  function tidyStash() {
    // salvage non-upgrades up to custom; keep better stuff for other frames
    const frames = S.frames;
    for (const it of S.stash.slice()) {
      if (it.equippedOn || it.heirCore) continue;
      const useful = frames.some(f => f.equipped[it.slot] !== undefined && itemFR(it) > itemFR(game.itemByUid(f.equipped[it.slot])));
      if (!useful || RARITY_INDEX[it.rarity] <= RARITY_INDEX.tuned) game.salvage(it.uid);
    }
  }

  // ---- main loop -----------------------------------------------------------------------------
  let nextHour = 3600, lastCredits = 0, richSince = null;
  const end = hours * 3600;
  while (S.playSeconds < end) {
    pickFrame();
    pickThreat();
    const m = pickContract();
    if (!m) { game.rerollBoard(); advance(10); continue; }
    const acc = game.acceptContract(m.id);
    if (!acc.ok) { game.refreshBoard(); continue; }
    const mission = acc.mission;
    // planner par times are the design intent; players land around 1.0-1.4x par, plus fights
    let t = OVERHEAD + Math.max(mission.parTime || 180, missionTime(mission)) * brng.range(1.0, 1.4);
    let failed = false;
    const packs = [...mission.enemies.map(e => e.units)];
    if (mission.boss) packs.push([{ defId: mission.boss.defId, rank: undefined, level: mission.boss.level }]);
    if (mission.twist?.enemies) packs.push(...mission.twist.enemies.map(e => e.units));
    if (mission.target && ['bounty', 'assassinate', 'wetwork', 'repo'].includes(mission.archetype)) packs.push([{ defId: mission.target.defId, rank: mission.target.rank === 'champion' ? 'champion' : mission.target.rank, level: mission.level }]);
    if (mission.twist) game.fireTwist();
    for (const units of packs) {
      const f = fight(units);
      t += f.time * HUMAN;
      if (f.died) {
        out.deaths++;
        const r = game.playerWrecked();
        t += 30;
        if (!r.checkpoint) { failed = true; break; }
      }
    }
    advance(t, true);
    if (!failed && S.contract) {
      while (S.contract) { const r = game.completeStep({ outcome: 'kill' }); if (r.done || r.failed || !S.contract) break; }
      if (S.contract) {
        const res = game.finishContract({ time: t * 0.8 });
        out.contracts++;
        if (out.contracts === 1) ms('firstContract');
        void res;
      }
    } else if (S.contract) game.failContract('wrecked');
    if (failed) out.fails++;
    recent.push(!failed);
    game.repair();
    game.equipBest();
    tidyStash();
    spend();
    game.equipBest();
    // idle-rich check (credits > 3x the next big want)
    const goal = game.nextGoal();
    if (goal && S.credits > goal.cost * 3) { if (richSince == null) richSince = S.playSeconds; }
    else richSince = null;
    if (richSince != null && S.playSeconds - richSince > 7200) { out.idleRich++; richSince = S.playSeconds; }
    if (S.playSeconds >= nextHour) {
      const f = game.activeFrame();
      const row = { h: Math.round(S.playSeconds / 360) / 10, level: S.player.level, credits: S.credits, earned: S.stats.creditsEarned, income: S.stats.creditsEarned - lastCredits,
        fr: game.frameFR(f), frame: f.frameId + (f.rental ? '' : ' ' + ['I', 'II', 'III', 'IV', 'V', 'VI'][f.tier]), sync: f.sync, avgIlvl: avgIlvl(f), maxTune: maxTune(f),
        contracts: out.contracts, deaths: out.deaths, fails: out.fails, story: S.story.mission, ttk: ttkGrunt(), incomePerL: Math.round((S.stats.creditsEarned - lastCredits) / L(S.player.level)), xpPerMinL: Math.round(hourXp / 60 * 10) / 10 };
      hourXp = 0;
      lastCredits = S.stats.creditsEarned;
      out.hourly.push(row);
      if (!quiet) log(fmtRow(row));
      nextHour += 3600;
    }
  }
  out.final = { overclock: S.overclock, spent: out.spent, homes: S.homesOwned, paints: S.paints, stash: S.stashSize, level: S.player.level, credits: S.credits, story: S.story.mission, frames: S.frames.map(f => `${f.frameId}:${f.tier}`), relics: S.loot.relicsFound };
  return out;

  function avgIlvl(f) { const its = Object.values(f.equipped).filter(Boolean).map(game.itemByUid); return its.length ? Math.round(its.reduce((a, i) => a + i.ilvl, 0) / its.length) : 0; }
  function maxTune(f) { return Math.max(0, ...Object.values(f.equipped).filter(Boolean).map(u => game.itemByUid(u).tune)); }
  function ttkGrunt() {
    // basic attack only, equal-level Knuckle, no crit variance averaging over 30 trials
    const p0 = game.playerCombatant();
    let total = 0;
    for (let i = 0; i < 30; i++) {
      const e = game.spawnEnemy({ defId: 'knuckle', level: S.player.level });
      const p = { ...p0, statuses: [], cooldowns: {}, hidden: false, momentum: 0, charge: 0, hp: p0.stats.hp, alive: true };
      let t = 0, combo = 0;
      const sk = p.skills.attack;
      const interval = sk.interval / p.stats.atkSpeed;
      while (e.alive && t < 60) { game.hit(p, e, sk, { comboIndex: combo++ }); if (e.alive) t += interval; }
      total += t;
    }
    return Math.round(total / 30 * 10) / 10;
  }
}

// ECONOMY §9: grunt TTK at equal level with average gear (Tuned +3 in every slot, Mk I), basic attack only.
export function ttkTable(levels = [1, 5, 10, 20, 30, 40, 50, 60], trials = 40) {
  const rng = createRng('ttk');
  const out = {};
  for (const fid of Object.keys(FRAMES)) {
    const d = FRAMES[fid];
    out[fid] = levels.map(lvl => {
      let tot = 0;
      for (let n = 0; n < trials; n++) {
        const items = d.slots.map(slot => Object.assign(rollItem(rng, { ilvl: lvl, slot, rarity: 'tuned' }), { tune: 3 }));
        const st = computeStats({ frameDef: d, level: lvl, items });
        const p = makeCombatant({ id: 'p', level: lvl, stats: st, faction: 'player', kind: 'player' });
        const sk = SKILLS[d.skills.attack];
        const e = createEnemy({ defId: 'knuckle', level: lvl }, { threat: { hp: 1, dmg: 1 } });
        let t = 0, c = 0;
        while (e.alive && t < 60) { resolveHit(p, e, sk, rng, { comboIndex: c++ }); if (e.alive) t += sk.interval / st.atkSpeed; }
        tot += t;
      }
      return Math.round(tot / trials * 100) / 100;
    });
  }
  return { levels, byFrame: out };
}

function fmtRow(r) {
  return `${String(r.h).padStart(5)}h L${String(r.level).padStart(2)} cr ${String(r.credits).padStart(9)} +${String(r.income).padStart(8)}/h (${r.incomePerL}xL) FR ${String(r.fr).padStart(5)} ${r.frame.padEnd(10)} sync ${String(r.sync).padStart(2)} ilvl ${String(r.avgIlvl).padStart(2)} +${r.maxTune} ttk ${r.ttk}s xp/min ${r.xpPerMinL}xL c${r.contracts} d${r.deaths} f${r.fails} ${r.story}`;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const t0 = Date.now();
  const r = runBalance();
  const hm = s => (s == null ? '—' : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
  const M = r.milestones;
  console.log('\nMilestones (target):');
  const rows = [
    ['first contract / level 2', M.level2, '5 min'], ['first upgrade equipped', M.firstUpgrade, '<= 8 min'], ['first frame', M.frame1, '30-45 min (brief: 45-75)'],
    ['level 8 (Act 1)', M.level8, '1.3 h'], ['second frame', M.frame2, '3-4 h'], ['third frame', M.frame3, '7-9 h'], ['first Relic', M.firstRelic, '3-5 h'],
    ['level 15', M.level15, '3.4 h'], ['level 20', M.level20, '5.5 h'], ['level 30', M.level30, '11.3 h'], ['level 40', M.level40, '19.1 h'], ['level 50', M.level50, '28-32 h'], ['level 60', M.level60, '~40 h'],
  ];
  for (const [k, v, tgt] of rows) console.log(`  ${k.padEnd(26)} ${hm(v).padStart(8)}   target ${tgt}`);
  console.log('xp by source', r.xpBy, 'grades', r.grades);
  console.log(`contracts ${r.contracts}, deaths ${r.deaths}, fails ${r.fails}, idle-rich 2h windows ${r.idleRich}, final`, r.final, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  const tt = ttkTable();
  console.log('\nGrunt TTK, average gear (Tuned +3, Mk I), target 1.5-4 s:');
  console.log('  ' + 'frame'.padEnd(9) + tt.levels.map(l => ('L' + l).padStart(6)).join(''));
  for (const [f, row] of Object.entries(tt.byFrame)) console.log('  ' + f.padEnd(9) + row.map(v => String(v).padStart(6)).join(''));
  console.log('spent', r.final.spent);
  if (args.json) console.log(JSON.stringify(r));
}
