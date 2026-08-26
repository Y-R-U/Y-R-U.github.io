// The one place a mode id turns into behaviour. world.js consults this and nothing else.
//
// Two entry points, both no-ops for Story:
//   resolveLevel(modeId, level, ctx)  — BEFORE the world exists. Returns the level to build.
//                                       For 'story' it returns the SAME object it was handed.
//   makeMode(world, modeId, ctx)      — AFTER the world exists. Returns null for 'story'.
//
// A mode installs hooks; it never asks world.step() to branch on a mode id.

import { SURVIVAL, TIME_ATTACK, BOSS_RUSH, WEEKLY_EVENTS, getWeeklyEvent } from '../data/modes.js';
import { ENEMIES } from '../data/enemies.js';
import { WEAPONS } from '../data/weapons.js';
import { ECON } from '../data/tuning.js';
import { makeRng } from '../core/rng.js';
import { makeEnt } from './spawn.js';

export const STORY = 'story';

const BOSS_RUSH_LENGTH = 26000;
const BOSS_RUSH_BIOME = 'coast';
const INTERMISSION = 2.6;          // seconds of calm between boss stages
const SURVIVAL_CULL_DIST = 5200;   // ground/flak this far from the player are recycled
const SURVIVAL_ENT_CAP = 64;

/** Toughest fighter each act fields — stands in for the rival ace, which has no row yet. */
const ACE_BY_ACT = { 1: 'bf109', 2: 'fw190', 3: 'mig_ghost', 4: 'jet_fighter', 5: 'cyber_interceptor' };

/* ------------------------------------------------------------------ mode resolution */

/**
 * 'event' is not a mode of its own: it is a base mode plus a modifier set. Everything
 * downstream reads `{ id, base, event }` so nothing has to know that.
 */
export function resolveMode(modeId, ctx = {}) {
  const id = modeId || STORY;
  if (id !== 'event') return { id, base: id, event: null };
  const ev = ctx.event
    || (ctx.eventId ? WEEKLY_EVENTS.find((e) => e.id === ctx.eventId) : null)
    || getWeeklyEvent(ctx.date);
  return { id: 'event', base: (ev && ev.forcesMode) || STORY, event: ev || null };
}

export function modeIds() {
  return [STORY, 'survival', 'timeattack', 'bossrush', 'event'];
}

/* ---------------------------------------------------------------- level resolution */

export function resolveLevel(modeId, level, ctx = {}) {
  const m = resolveMode(modeId, ctx);
  if (m.id === STORY) return level;                       // the safety property, stated once
  let lv = level;
  if (m.base === 'survival') lv = survivalLevel(level, ctx);
  else if (m.base === 'bossrush') lv = bossRushLevel(level, ctx);
  if (m.event) lv = applyEventToLevel(lv, m.event, ctx);
  return lv;
}

function survivalLevel(level, ctx) {
  const S = SURVIVAL;
  return {
    id: 'survival', act: 1, name: S.name, biome: S.biome,
    length: S.length, seed: (ctx.seed ?? (level && level.seed) ?? 1) >>> 0,
    timeOfDay: S.startTimeOfDay, weather: S.startWeather,
    terrainProfile: 'rolling',
    objectives: [], spawns: [], waves: [],
    reward: { money: 0, xp: 0 }, par: 0,
    intro: 'Endless waves. Stay up.',
    modeLevel: 'survival',
  };
}

function bossRushLevel(level, ctx) {
  return {
    id: 'bossrush', act: 5, name: BOSS_RUSH.name, biome: BOSS_RUSH_BIOME,
    length: BOSS_RUSH_LENGTH, seed: (ctx.seed ?? (level && level.seed) ?? 1) >>> 0,
    timeOfDay: 'dusk', weather: 'clear', terrainProfile: 'flat',
    objectives: [], spawns: [], waves: [],
    reward: { money: BOSS_RUSH.reward.money, xp: BOSS_RUSH.reward.xp }, par: 0,
    intro: 'Five bosses. No shopping.', boss: true,
    modeLevel: 'bossrush',
  };
}

/** Density and forced-condition modifiers. Never mutates the level it was given. */
function applyEventToLevel(lv, ev, ctx) {
  const out = { ...lv, eventId: ev.id, eventName: ev.name };
  const rng = makeRng((((ctx.seed ?? lv.seed ?? 1) >>> 0) ^ 0x1d4c3b17) >>> 0);
  if (ev.forceTimeOfDay) out.timeOfDay = ev.forceTimeOfDay;
  if (ev.forceWeather) out.weather = ev.forceWeather;

  let spawns = (out.spawns || []).slice();
  if (ev.flakDensityMult > 1) spawns = densify(spawns, ev.flakDensityMult, 'flak', 0, out.length, rng);
  // "Balloons everywhere" has to mean something on a level that shipped with none, so
  // this multiplier carries a floor the flak one does not.
  if (ev.balloonDensityMult > 1) spawns = densify(spawns, ev.balloonDensityMult, 'balloon', 6, out.length, rng);
  out.spawns = spawns;

  if (ev.extraRivalWave) {
    const ace = ACE_BY_ACT[Math.max(1, Math.min(5, out.act || 1))] || 'bf109';
    out.waves = [...(out.waves || []), { at: Math.round((out.length || 14000) * 0.55), kind: ace, n: 2, spacing: 520, rival: true }];
  }
  return out;
}

function densify(spawns, mult, entKind, floor, length, rng) {
  const rowKind = (s) => { const r = ENEMIES[s.def || s.kind]; return r ? r.kind : null; };
  const seeds = spawns.filter((s) => rowKind(s) === entKind);
  const have = seeds.length;
  const want = Math.max(Math.round(have * mult), floor);
  if (want <= have) return spawns;
  const out = spawns.slice();
  const fallback = entKind === 'balloon' ? 'balloon' : 'flakLight';
  for (let i = have; i < want; i++) {
    const src = seeds.length ? seeds[i % seeds.length] : { def: fallback, y: entKind === 'balloon' ? undefined : 'ground' };
    const at = seeds.length
      ? clampX(src.at + rng.range(-1400, 1400), length)
      : clampX(1200 + ((i + 0.5) / want) * (length - 2400) + rng.range(-500, 500), length);
    out.push({ ...src, at: Math.round(at), eventExtra: true });
  }
  return out;
}

function clampX(x, length) { return Math.max(700, Math.min(length - 700, x)); }

/* ------------------------------------------------------------------------ runtime */

export function makeMode(world, modeId, ctx = {}) {
  const m = resolveMode(modeId, ctx);
  if (m.id === STORY) return null;

  const hooks = [];
  const rt = {
    id: m.id, base: m.base, event: m.event,
    eventId: m.event ? m.event.id : null,
    state: {},
    notes: [],                 // data gaps found at build time; the harness prints these
  };

  if (m.base === 'survival') hooks.push(survivalHooks(world, rt, m.event));
  else if (m.base === 'bossrush') hooks.push(bossRushHooks(world, rt));
  else if (m.base === 'timeattack') hooks.push(timeAttackHooks(world, rt));
  // Event hooks run LAST so a global money multiplier lands on top of a mode's own payout.
  if (m.event) hooks.push(eventHooks(world, rt, m.event));

  const call = (name, arg) => { for (const h of hooks) if (h[name]) h[name](arg); };

  rt.init = () => {
    // The only kill funnel reachable without editing damage.js. Wrapped once, here,
    // so no mode needs a line anywhere else in the sim.
    const mission = world.mission;
    const inner = mission.onKill.bind(mission);
    // The mode hook runs BEFORE mission.onKill, not after: the inner call can complete the
    // last objective, which wins the level and snapshots results inside this same call. A
    // hook running after it would have its money silently dropped from the payout.
    mission.onKill = (w, ent) => { call('onKill', ent); inner(w, ent); };
    call('init');
  };
  rt.step = (dt) => call('step', dt);
  rt.beforeFinish = () => call('beforeFinish');
  rt.afterFinish = (results) => {
    results.mode = rt.id;
    results.modeBase = rt.base;
    results.eventId = rt.eventId;
    if (rt.event) results.eventName = rt.event.name;
    call('afterFinish', results);
  };
  rt.info = () => ({ id: rt.id, base: rt.base, event: rt.eventId, ...rt.state });
  return rt;
}

/* ---------------------------------------------------------------------- survival */

function survivalHooks(world, rt, event) {
  const S = SURVIVAL;
  const noHeal = !!(event && event.survivalNoHeal);
  const T = S.tiers;
  const lastGap = Math.max(1, T[T.length - 1].atSeconds - T[T.length - 2].atSeconds);

  const st = rt.state;
  st.tier = 0; st.interval = S.spawnIntervalStart; st.spawnEvents = 0; st.spawned = 0;
  st.bonuses = 0; st.bonusesTaken = 0; st.culled = 0; st.overflow = 0; st.hpMult = 1; st.countMult = 1;

  let timer = S.spawnIntervalStart * 0.5;   // first wave lands half an interval in
  let carry = 0;
  let nextBonus = S.bonusEvery;
  const mine = [];        // mode-spawned ents still alive
  const bonusBalloons = [];

  function tierIndex(t) {
    if (t < T[T.length - 1].atSeconds) {
      let i = 0;
      for (let k = 0; k < T.length; k++) if (t >= T[k].atSeconds) i = k;
      return i;
    }
    return (T.length - 1) + Math.floor((t - T[T.length - 1].atSeconds) / lastGap);
  }

  function tierRule(i) {
    const n = T.length;
    if (i < n) return { pool: T[i].pool, hpMult: T[i].hpMult, countMult: T[i].countMult, over: 0 };
    const last = T[n - 1], over = i - (n - 1);
    return {
      pool: last.pool,
      hpMult: last.hpMult * Math.pow(S.overflowHpMultPerTier, over),
      countMult: last.countMult * Math.pow(S.overflowCountMultPerTier, over),
      over,
    };
  }

  const intervalFor = (i) => Math.max(S.spawnIntervalMin, S.spawnIntervalStart - i * S.spawnIntervalDecayPerTier);

  function spawnOne(rowId, hpMult) {
    const p = world.player;
    if (!p) return null;
    const row = ENEMIES[rowId];
    if (!row) return null;
    const L = world.level.length;
    const dir = p.vx >= 0 ? 1 : -1;
    let x, opts = {}, y;
    if (row.kind === 'fighter') {
      x = p.x + dir * world.cam.vw * 0.9;
      y = 460 + world.rng.range(0, 760);
      opts = { facing: -dir };
    } else {
      x = p.x + dir * world.rng.range(1300, 3200);
      if (x < 700 || x > L - 700) x = p.x - dir * world.rng.range(1300, 3200);
      y = undefined;
    }
    x = Math.max(600, Math.min(L - 600, x));
    const e = makeEnt(world, rowId, x, y, opts);
    if (!e) return null;
    if (hpMult !== 1) { e.hp = e.hpMax = Math.max(1, Math.round(e.hpMax * hpMult)); }
    e.modeSpawn = true;
    world.ents.push(e);
    mine.push(e);
    return e;
  }

  function dropBonus() {
    const p = world.player;
    if (!p) return;
    const dir = p.vx >= 0 ? 1 : -1;
    const L = world.level.length;
    let x = p.x + dir * world.rng.range(900, 1800);
    x = Math.max(600, Math.min(L - 600, x));
    const e = makeEnt(world, 'balloon', x, world.terrain.heightAt(x) + world.rng.range(420, 760));
    if (!e) return;
    // A supply drop, not a scenery balloon: it carries the bonus money and, unless the
    // week says otherwise, the repair. BEHAVIOUR.balloon reads def.money, so give it a
    // def of its own rather than editing the shared row.
    e.def = { ...e.def, money: SURVIVAL.bonusReward.money, name: 'Supply Drop' };
    e.bonus = true;
    e.modeSpawn = true;
    world.ents.push(e);
    mine.push(e);
    bonusBalloons.push(e);
    st.bonuses++;
    world.push({ e: 'ui', what: 'wave', n: 1, kind: 'supply' });
  }

  function resupply() {
    const p = world.player;
    if (!p || p.dead) return;
    p.fuel = p.fuelMax;
    p.lowFuelFired = false;
    for (let i = 0; i < 4; i++) {
      const w = WEAPONS[p.loadout[i]];
      if (w) p.ammo[i] = Math.round((w.ammo || 0) + p.def.ammoBonus);
    }
    if (!noHeal) p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.25);
  }

  function cull() {
    const p = world.player;
    if (!p) return;
    for (let i = mine.length - 1; i >= 0; i--) {
      const e = mine[i];
      if (e.dead || e.despawn) { mine.splice(i, 1); continue; }
      if (e.kind !== 'ground' && e.kind !== 'flak') continue;
      if (e.t > 8 && Math.abs(e.x - p.x) > SURVIVAL_CULL_DIST) { e.despawn = true; st.culled++; mine.splice(i, 1); }
    }
    if (mine.length > SURVIVAL_ENT_CAP) {
      mine.sort((a, b) => Math.abs(b.x - p.x) - Math.abs(a.x - p.x));
      while (mine.length > SURVIVAL_ENT_CAP) {
        const e = mine.shift();
        if (e.kind === 'ground' || e.kind === 'flak') { e.despawn = true; st.culled++; }
      }
    }
  }

  return {
    step(dt) {
      const i = tierIndex(world.t);
      const rule = tierRule(i);
      st.tier = i; st.overflow = rule.over;
      st.hpMult = rule.hpMult; st.countMult = rule.countMult;
      st.interval = intervalFor(i);

      timer -= dt;
      if (timer <= 0) {
        timer += st.interval;
        let n = Math.floor(rule.countMult);
        carry += rule.countMult - n;
        if (carry >= 1) { n++; carry -= 1; }
        n = Math.max(1, n);
        for (let k = 0; k < n; k++) {
          if (spawnOne(world.rng.pick(rule.pool), rule.hpMult)) st.spawned++;
        }
        st.spawnEvents++;
      }

      if (world.t >= nextBonus) { nextBonus += S.bonusEvery; dropBonus(); }
      for (let k = bonusBalloons.length - 1; k >= 0; k--) {
        const b = bonusBalloons[k];
        if (b.despawn) { bonusBalloons.splice(k, 1); continue; }
        if (b.dead) { bonusBalloons.splice(k, 1); st.bonusesTaken++; resupply(); }
      }

      cull();
    },

    onKill(ent) {
      if (ent.kind === 'balloon') return;
      st.killed = (st.killed || 0) + 1;
    },

    afterFinish(res) {
      const killed = totalKills(world);
      res.survivedSeconds = world.t;
      res.tier = st.tier + 1;
      res.overflowTiers = st.overflow;
      res.waves = st.spawnEvents;
      res.spawned = st.spawned;
      res.killsTotal = killed;
      res.supplyDrops = st.bonuses;
      res.suppliesTaken = st.bonusesTaken;
      res.spawnInterval = Math.round(st.interval * 100) / 100;
      res.stars = 0;
      res.headline = world.over === 'bingo' ? 'OUT OF FUEL' : 'SHOT DOWN';
      res.score = Math.round(world.t) + killed * 5;
      res.lines = [
        ['Survived', fmtTime(world.t)],
        ['Wave tier', `${st.tier + 1}${st.overflow ? ` (+${st.overflow})` : ''}`],
        ['Kills', String(killed)],
        ['Supplies', `${st.bonusesTaken}/${st.bonuses}`],
      ];
    },
  };
}

/* --------------------------------------------------------------------- boss rush */

function bossRushHooks(world, rt) {
  const B = BOSS_RUSH;
  const order = B.order.slice();
  const missing = order.filter((id) => !ENEMIES[id] || ENEMIES[id].kind !== 'boss');
  const live = order.filter((id) => ENEMIES[id] && ENEMIES[id].kind === 'boss');
  for (const id of missing) rt.notes.push(`BOSS_RUSH.order references '${id}', which is not a boss row in enemies.js — the stage is DROPPED, not substituted`);

  const st = rt.state;
  st.stage = 0; st.stages = live.length; st.declaredStages = order.length;
  st.bossesDown = 0; st.missing = missing.slice();
  const log = [];
  let boss = null, phase = 'intermission', wait = 1.6, stage = -1, stageStart = 0;

  function startStage() {
    stage++;
    if (stage >= live.length) { world.win(); return; }
    const p = world.player;
    const id = live[stage];
    const x = Math.min(world.level.length - 1400, (p ? p.x : 1200) + 1900);
    const e = makeEnt(world, id, x);
    if (!e) { rt.notes.push(`makeEnt failed for boss '${id}'`); return; }
    e.modeSpawn = true;
    world.ents.push(e);
    boss = e;
    phase = 'fight';
    stageStart = world.t;
    st.stage = stage + 1;
    st.bossName = e.def.name;
    world.push({ e: 'ui', what: 'wave', n: 1, kind: id, boss: true, stage: stage + 1, of: live.length });
  }

  function betweenStages() {
    const p = world.player;
    if (!p || p.dead) return;
    if (B.refuelBetween) {
      p.fuel = p.fuelMax;
      p.lowFuelFired = false;
      for (let i = 0; i < 4; i++) {
        const w = WEAPONS[p.loadout[i]];
        if (w) p.ammo[i] = Math.round((w.ammo || 0) + p.def.ammoBonus);
      }
    }
    // "heal to 50%, and no more" — a player above that keeps what they have.
    p.hp = Math.max(p.hp, p.hpMax * B.healBetween);
  }

  return {
    init() {
      st.bossOrder = live.slice();
      if (!live.length) rt.notes.push('BOSS_RUSH.order resolved to zero bosses — the run cannot be won');
    },

    step(dt) {
      if (phase === 'intermission') {
        wait -= dt;
        if (wait <= 0) startStage();
        return;
      }
      if (!boss) return;
      // Airborne bosses drift; without a leash they walk out of the arena mid-fight.
      if (!boss.dead) {
        if (boss.x < world.cam.x - 900) boss.x = world.cam.x + world.cam.vw * 0.9;
        if (boss.x > world.level.length - 400) boss.x = world.level.length - 400;
        return;
      }
      st.bossesDown++;
      log.push({ id: live[stage], name: boss.def.name, stage: stage + 1, seconds: world.t - stageStart });
      boss = null;
      phase = 'intermission';
      wait = INTERMISSION;
      betweenStages();
    },

    beforeFinish() {
      // The reward table IS the payout (DESIGN §9): a lump sum on a clear, partial credit
      // otherwise. Per-boss kill money would be ~53k on top and make the table meaningless.
      const cleared = world.over === 'win' && st.bossesDown >= live.length && live.length > 0;
      world.stats.money = cleared
        ? B.reward.money
        : st.bossesDown * B.partialReward.moneyPerBossDown;
      st.cleared = cleared;
    },

    afterFinish(res) {
      res.bossesDown = st.bossesDown;
      res.bossesTotal = live.length;
      res.bossesDeclared = order.length;
      res.missingBosses = missing.slice();
      res.cleared = !!st.cleared;
      res.stages = log.map((l) => ({ ...l, seconds: Math.round(l.seconds * 10) / 10 }));
      res.xp = st.cleared ? B.reward.xp : st.bossesDown * B.partialReward.xpPerBossDown;
      res.headline = st.cleared ? 'GAUNTLET CLEARED' : `${st.bossesDown}/${live.length} BOSSES DOWN`;
      res.lines = [
        ['Bosses downed', `${st.bossesDown}/${live.length}`],
        ['Time', fmtTime(world.t)],
        ...log.map((l) => [l.name, fmtTime(l.seconds)]),
      ];
      if (missing.length) res.lines.push(['Missing from data', missing.join(', ')]);
    },
  };
}

/* -------------------------------------------------------------------- time attack */

function timeAttackHooks(world, rt) {
  const A = TIME_ATTACK;
  const st = rt.state;
  st.par = world.level.par || 0;

  return {
    beforeFinish() {
      const par = world.level.par || 0;
      const win = world.over === 'win';
      const f = par ? world.t / par : Infinity;
      const medal = !win ? null : f <= A.goldTimeFactor ? 'gold' : f <= A.silverTimeFactor ? 'silver' : 'none';
      st.medal = medal; st.factor = f;
      if (!win) return;
      // The level's completion reward is replaced by the medal's; kill money stays.
      world.stats.money -= (world.level.reward && world.level.reward.money) || 0;
      world.stats.money += (A.reward[medal] || A.reward.none).money;
    },

    afterFinish(res) {
      const A2 = TIME_ATTACK;
      res.stars = 0;                                   // Time Attack has medals, not stars
      res.medal = st.medal;
      res.par = st.par;
      res.parFactor = Number.isFinite(st.factor) ? Math.round(st.factor * 1000) / 1000 : null;
      res.goldTime = st.par ? st.par * A2.goldTimeFactor : null;
      res.silverTime = st.par ? st.par * A2.silverTimeFactor : null;
      res.xp = st.medal ? (A2.reward[st.medal] || A2.reward.none).xp : 0;
      res.headline = st.medal ? (st.medal === 'none' ? 'NO MEDAL' : st.medal.toUpperCase()) : 'SHOT DOWN';
      res.lines = [
        ['Time', fmtTime(world.t)],
        ['Par', st.par ? fmtTime(st.par) : '—'],
        ['Gold under', st.par ? fmtTime(st.par * A2.goldTimeFactor) : '—'],
        ['Silver under', st.par ? fmtTime(st.par * A2.silverTimeFactor) : '—'],
        ['Medal', st.medal ? st.medal : 'none'],
      ];
    },
  };
}

/* -------------------------------------------------------------------- weekly event */

function eventHooks(world, rt, ev) {
  const st = rt.state;
  st.eventName = ev.name;
  let extra = 0;

  const perKindMult = {};
  if (ev.flakMoneyMult > 1) perKindMult.flak = ev.flakMoneyMult;
  if (ev.balloonMoneyMult > 1) perKindMult.balloon = ev.balloonMoneyMult;
  st.perKindMoneyMult = perKindMult;

  return {
    onKill(ent) {
      const mult = perKindMult[ent.kind];
      if (!mult) return;
      // killEnt has already paid the base; top it up to `mult` times that.
      const base = Math.round(((ent.def && ent.def.money) || ECON.moneyPerKill[ent.kind] || 10) * (world.moneyMult || 1));
      const add = Math.round(base * (mult - 1));
      world.stats.money += add;
      extra += add;
    },

    beforeFinish() {
      const m = (ev.moneyMult || 1) * (ev.bonusMoneyMult || 1);
      st.moneyMult = m;
      st.bonusMoney = extra;
      if (m !== 1) world.stats.money = Math.round(world.stats.money * m);
    },

    afterFinish(res) {
      res.event = { id: ev.id, name: ev.name, desc: ev.desc };
      res.eventMoneyMult = st.moneyMult || 1;
      res.eventKindBonus = extra;
      res.lines = [...(res.lines || []), ['Event', ev.name]];
      if ((st.moneyMult || 1) !== 1) res.lines.push(['Event bonus', `x${st.moneyMult}`]);
    },
  };
}

/* -------------------------------------------------------------------------- utils */

function totalKills(world) {
  let n = 0;
  for (const k in world.stats.kills) n += world.stats.kills[k];
  return n;
}

function fmtTime(s) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
