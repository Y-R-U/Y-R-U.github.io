// Deterministic tick-based battle sim. Pure JS (no DOM / three.js). See README.md for the
// event + state contract the renderer and HUD consume.
import { createRng } from './rng.js';
import { TICKS_PER_SEC, BEATS, DEFAULT_STATUSES, mergeRules } from './constants.js';
import { lookupUnit, lookupAbility, unitStats, addMods, activeSynergies, synergyAppliesTo, sumMods } from './stats.js';
import FIXTURE_DATA from './fixture_data.js';
import { evalGoals } from './story.js';

const TPS = TICKS_PER_SEC;
const secToTicks = (s) => Math.max(0, Math.round(s * TPS));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export { TICKS_PER_SEC };

export function prepareData(data) {
  if (data._prepared) return data;
  const d = { ...data };
  d._rules = mergeRules(data.rules || {});
  d._statuses = { ...DEFAULT_STATUSES, ...(data.statuses || {}) };
  Object.defineProperty(d, '_prepared', { value: true });
  return d;
}

function normaliseSquad(sq) {
  if (!sq) return { units: [] };
  if (Array.isArray(sq)) return { units: sq };
  return sq;
}

// Fill in missing/duplicate slots: tanks front, others back, mid lane first.
export function autoSlots(data, units) {
  const used = new Set();
  const out = units.map((u) => ({ ...u }));
  for (const u of out) {
    if (u.slot && !used.has(u.slot.col * 3 + u.slot.lane)) used.add(u.slot.col * 3 + u.slot.lane);
    else u.slot = null;
  }
  const laneOrder = [1, 0, 2];
  for (const u of out) {
    if (u.slot) continue;
    const role = lookupUnit(data, u.def).role;
    const cols = role === 'tank' ? [0, 1] : [1, 0];
    let placed = false;
    for (const c of cols) {
      for (const l of laneOrder) if (!used.has(c * 3 + l)) { u.slot = { col: c, lane: l }; used.add(c * 3 + l); placed = true; break; }
      if (placed) break;
    }
    if (!placed) throw new Error('sim: more than 6 units in a squad');
  }
  return out;
}

export function createBattle(opts = {}) {
  const data = prepareData(opts.data || FIXTURE_DATA);
  const rules = data._rules;
  const STAT = data._statuses;
  const seed = opts.seed ?? 1;
  const rng = createRng(seed);
  const player = normaliseSquad(opts.player);
  let waves = opts.enemyWaves || opts.waves || (opts.enemy ? [opts.enemy] : []);
  waves = waves.map(normaliseSquad);
  if (!waves.length) throw new Error('sim: no enemy waves');
  const inputQueue = (opts.inputs || []).map((i) => ({ ...i })).sort((a, b) => a.t - b.t);
  const recorded = [];
  let auto = opts.auto !== false;
  const record = opts.record !== false;
  // Dev cheats (js/sim/README "Dev cheats"): only from the config the dev module builds; game_state never sets them.
  const ch = { ...(opts.player?.cheats || {}), ...(opts.cheats || {}) };
  const cheats = { invulnerable: !!ch.invulnerable, oneHit: !!ch.oneHit };
  const cheating = cheats.invulnerable || cheats.oneHit;

  const events = [];
  let newEvents = [];
  const emit = (e) => { e.t = t; if (record) events.push(e); newEvents.push(e); };

  let t = 0;
  let shotSeq = 0;
  let phase = 'fight';
  let waveIdx = 0;
  let waveStartT = 0;
  let nextWaveAt = 0;
  let done = false;
  let result = null;
  let auraDirty = true;
  let otAnnounced = false;
  const pending = []; // impacts
  const manualQueue = new Set();
  const units = {}; // id -> internal unit
  let order = [];
  const playerIds = [];
  let enemyIds = [];
  const allEnemyIds = [];

  // ---------- unit construction
  function makeUnit(inst, side, wave, sideMods, sideSyn) {
    const def = lookupUnit(data, inst.def);
    const slot = inst.slot;
    const si = slot.col * 3 + slot.lane;
    const id = side === 'player' ? `p${si}` : `e${wave + 1}_${si}`;
    const base = unitStats(data, inst);
    const staticMods = {};
    addMods(staticMods, sideMods);
    for (const s of sideSyn) if (synergyAppliesTo(s, def)) addMods(staticMods, s.mods);
    const pos = rules.position?.[def.role] || {};
    let taunt = false;
    const posKeys = [];
    if (slot.col === 0 && pos.front) posKeys.push('front');
    if (slot.col === 1 && pos.back) posKeys.push('back');
    if (slot.lane !== 1 && pos.side) posKeys.push('side');
    if (slot.lane === 1 && pos.mid) posKeys.push('mid');
    for (const k of posKeys) { addMods(staticMods, pos[k].mods); if (pos[k].taunt) taunt = true; }
    const al = inst.abilityLevels || {};
    const ab = (k) => { const a = lookupAbility(data, def[k]); return a ? { def: a, level: al[k] || 1 } : null; };
    const maxHp = Math.round(base.hp * (1 + (staticMods.hp || 0)));
    const u = {
      id, side, wave, defId: def.id, def, name: def.name, role: def.role, faction: def.faction, rarity: def.rarity, model: def.model,
      level: inst.level || 1, rank: inst.rank ?? 0, uid: inst.uid, slot: { col: slot.col, lane: slot.lane }, slotIndex: si,
      base, staticMods, posBonus: posKeys, posTaunt: taunt,
      hp: inst.hp != null ? Math.min(inst.hp, maxHp) : maxHp, maxHp, shields: [], charge: inst.charge || 0, readyEmitted: false,
      statuses: [], alive: true, nextAttack: 0, busyUntil: 0, attackCount: 0,
      attack: ab('attack'), passive: ab('passive'), overdrive: ab('overdrive'),
      chargeRate: def.chargeRate ?? 1, lowHpFired: false, revived: false, lastIntervalT: 0,
      stats: { dealt: 0, taken: 0, healed: 0, shielded: 0, kills: 0, overdrives: 0 },
    };
    units[id] = u;
    return u;
  }

  const playerUnitsIn = autoSlots(data, player.units);
  const playerDefs = playerUnitsIn.map((u) => lookupUnit(data, u.def));
  const playerSyn = activeSynergies(data, playerDefs);
  const playerMods = sumMods(player.mods, ...(player.buffs || []).map((b) => data.buffs?.[b]?.mods));
  for (const inst of playerUnitsIn) playerIds.push(makeUnit(inst, 'player', 0, playerMods, playerSyn).id);
  let enemySyn = [];

  function spawnWave(w) {
    const sq = waves[w];
    const list = autoSlots(data, sq.units);
    enemySyn = activeSynergies(data, list.map((u) => lookupUnit(data, u.def)));
    const mods = sumMods(sq.mods);
    enemyIds = list.map((inst) => makeUnit(inst, 'enemy', w, mods, enemySyn).id);
    allEnemyIds.push(...enemyIds);
    order = [...playerIds, ...enemyIds];
    auraDirty = true;
    const startDelay = secToTicks(rules.startDelay ?? 1.0);
    for (const id of order) {
      const u = units[id];
      if (!u.alive) continue;
      u.nextAttack = t + startDelay + rng.int(0, secToTicks(0.6));
      u.busyUntil = 0;
    }
    waveStartT = t;
    otAnnounced = false;
    phase = 'fight';
    emit({ type: 'wave', phase: 'start', wave: w + 1, of: waves.length, units: [...enemyIds] });
    if (w > 0 && rules.waveHeal) for (const id of playerIds) { const u = units[id]; if (u.alive) heal(u, u, u.maxHp * rules.waveHeal, null); }
    for (const id of order) {
      const u = units[id];
      if (!u.alive) continue;
      if (u.side === 'enemy' || w === 0) firePassive(u, 'battle_start', {});
      firePassive(u, 'wave_start', {});
    }
  }

  // ---------- stats
  let auraMods = {};
  function recomputeAuras() {
    auraMods = {};
    for (const id of order) {
      const u = units[id];
      if (!u.alive || !u.passive || u.passive.def.trigger !== 'aura') continue;
      const aura = u.passive.def.aura;
      if (!aura) continue;
      const scale = 1 + ((u.passive.def.perLevel?.amount || 0) * (u.passive.level - 1)) / Math.max(0.01, Object.values(aura.mods || {}).find((v) => typeof v === 'number') || 1);
      for (const tgt of pickTargets(u, aura.to || { side: 'ally', pick: 'all' }, { noStealth: true })) {
        auraMods[tgt.id] = addMods(auraMods[tgt.id] || {}, aura.mods, scale);
      }
    }
    auraDirty = false;
  }

  function mods(u) {
    if (auraDirty) recomputeAuras();
    const m = addMods({}, u.staticMods);
    addMods(m, auraMods[u.id]);
    for (const s of u.statuses) if (s.def.mods) addMods(m, s.def.mods);
    return m;
  }

  function eff(u) {
    const m = mods(u);
    const crit = (m.crit || 0) >= 1 ? 1 : clamp(u.base.crit + (m.crit || 0), 0, rules.critCap);
    return {
      atk: u.base.atk * Math.max(0.1, 1 + (m.atk || 0)),
      def: Math.max(0, u.base.def * (1 + (m.def || 0))),
      interval: Math.max(0.3, u.base.spd / Math.max(0.2, 1 + (m.spd || 0))),
      crit, critDmg: u.base.critDmg + (m.critDmg || 0),
      dr: clamp(m.dr || 0, -0.5, rules.drCap),
      dmg: m.dmg || 0, heal: m.heal || 0, charge: Math.max(0, 1 + (m.charge || 0)), vs: m.vs || {},
    };
  }

  const hasFlag = (u, f) => u.statuses.some((s) => s.def[f]);
  const isStunned = (u) => hasFlag(u, 'stun');
  const shieldTotal = (u) => u.shields.reduce((s, x) => s + x.amt, 0);

  // ---------- targeting
  function sideUnits(side) {
    const ids = side === 'player' ? playerIds : enemyIds;
    const out = [];
    for (const id of ids) if (units[id].alive) out.push(units[id]);
    return out;
  }
  const other = (side) => (side === 'player' ? 'enemy' : 'player');

  function laneTarget(src, pool, opts = {}) {
    if (!pool.length) return null;
    let cands = pool;
    if (!opts.noStealth) { const vis = pool.filter((u) => !hasFlag(u, 'stealth')); if (vis.length) cands = vis; }
    // optional rule: some roles shoot over the screen in their own lane (rules.screenBypass)
    const byp = rules.screenBypass?.[src.role];
    if (byp && !opts.backline && !cands.some((u) => hasFlag(u, 'taunt'))) {
      const own = cands.filter((u) => u.slot.lane === src.slot.lane && u.slot.col === 1 && (byp === 'same_lane' || u.role === byp));
      if (own.length) return own[0];
    }
    if (!opts.ignoreTaunt) {
      const taunters = cands.filter((u) => (u.posTaunt && u.slot.col === 0 || hasFlag(u, 'taunt')) && Math.abs(u.slot.lane - src.slot.lane) <= 1);
      const forced = taunters.filter((u) => hasFlag(u, 'taunt'));
      const tpool = forced.length ? forced : taunters;
      if (tpool.length) return nearestLane(src, tpool);
    }
    if (rules.markedPreferred && !opts.backline) {
      const marked = cands.filter((u) => u.statuses.some((s) => s.id === 'marked'));
      // the screen still holds: a marked back-liner is only preferred once the front is empty
      const frontAlive = cands.some((u) => u.slot.col === 0);
      const ok = marked.filter((u) => u.slot.col === 0 || !frontAlive);
      if (ok.length) return nearestLane(src, ok);
    }
    const wantCol = opts.backline ? 1 : 0;
    let col = cands.filter((u) => u.slot.col === wantCol);
    if (!col.length) col = cands;
    return nearestLane(src, col);
  }

  function nearestLane(src, list) {
    let best = [], bd = 99;
    for (const u of list) {
      const d = Math.abs(u.slot.lane - src.slot.lane) * 2 + u.slot.col * 0.5;
      if (d < bd - 1e-9) { bd = d; best = [u]; } else if (Math.abs(d - bd) < 1e-9) best.push(u);
    }
    return best.length === 1 ? best[0] : best[Math.floor(rng.next() * best.length)];
  }

  // ctx: {other} the unit a trigger refers to (target/attacker)
  function pickTargets(src, spec, ctx = {}) {
    spec = spec || { side: 'enemy', pick: 'lane' };
    const side = spec.side === 'enemy' ? other(src.side) : src.side;
    if (spec.pick === 'self' || spec.side === 'self') return src.alive ? [src] : [];
    if (spec.pick === 'target' || spec.pick === 'attacker') return ctx.other && ctx.other.alive ? [ctx.other] : [];
    const pool = sideUnits(side);
    if (!pool.length) return [];
    const count = spec.count || 1;
    const vis = pool.filter((u) => !hasFlag(u, 'stealth'));
    const single = vis.length ? vis : pool;
    switch (spec.pick) {
      case 'all': return pool;
      case 'frontline': { const f = pool.filter((u) => u.slot.col === 0); return f.length ? f : pool; }
      case 'backline': return [laneTarget(src, pool, { backline: true, ignoreTaunt: true })];
      case 'lane_all': { const p = laneTarget(src, pool, ctx); return pool.filter((u) => u.slot.lane === p.slot.lane); }
      case 'column': { const p = laneTarget(src, pool, ctx); return pool.filter((u) => u.slot.col === p.slot.col); }
      case 'adjacent': { const p = laneTarget(src, pool, ctx); return pool.filter((u) => u.slot.col === p.slot.col && Math.abs(u.slot.lane - p.slot.lane) <= 1); }
      case 'lowest_hp': case 'lowest_hp_ally': return sortPick(single, (u) => u.hp / u.maxHp, count);
      case 'highest_hp': return sortPick(single, (u) => -u.hp, count);
      case 'highest_atk': return sortPick(single, (u) => -u.base.atk, count);
      case 'random': {
        const out = []; let bag = [];
        for (let i = 0; i < count; i++) {
          if (!bag.length) bag = rng.shuffle(single);
          out.push(bag.pop());
        }
        return out;
      }
      case 'lane': default: return [laneTarget(src, pool)];
    }
  }

  function sortPick(list, key, n) {
    return list.map((u) => [key(u), u.slotIndex, u]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, n).map((x) => x[2]);
  }

  function splashTargets(primary, frac) {
    const pool = sideUnits(primary.side);
    return pool.filter((u) => u !== primary && (
      (u.slot.col === primary.slot.col && Math.abs(u.slot.lane - primary.slot.lane) === 1) ||
      (u.slot.lane === primary.slot.lane && u.slot.col === primary.slot.col + 1))).map((u) => [u, frac]);
  }

  function boardPos(u) { return [u.side === 'player' ? -(u.slot.col + 1) : u.slot.col + 1, u.slot.lane]; }
  function travelTicks(src, dst, delivery) {
    const type = delivery?.type || 'projectile';
    if (type === 'melee' || type === 'instant') return 0;
    if (type === 'beam') return 1;
    if (type === 'area') return 2;
    const [ax, az] = boardPos(src), [bx, bz] = boardPos(dst);
    const dist = Math.hypot(ax - bx, az - bz);
    return Math.max(1, Math.ceil((dist / (delivery.speed || rules.projectileSpeed)) * TPS));
  }

  // ---------- effects
  function scaled(e, ability, level) {
    const pl = ability?.perLevel;
    if (!pl || level <= 1) return e;
    const k = level - 1;
    const o = { ...e };
    if (pl.mult && o.mult != null) o.mult += pl.mult * k;
    if (pl.chance && o.chance != null) o.chance = Math.min(1, o.chance + pl.chance * k);
    if (pl.duration && o.duration != null) o.duration += pl.duration * k;
    if (pl.amount) { if (o.pctMax != null) o.pctMax += pl.amount * k; if (o.type === 'charge') o.amount = (o.amount || 0) * (1 + pl.amount * k); }
    return o;
  }

  function rollHit(src, snap, e) {
    const isCrit = rng.next() < snap.crit;
    return { isCrit, varianceRoll: 1 + (rng.next() * 2 - 1) * rules.variance };
  }

  // Overtime (rules.overtime {start, dmgPerSec, healPenalty}): breaks tank+healer stalemates.
  function otSecs() { const o = rules.overtime; return o && phase === 'fight' ? Math.max(0, (t - waveStartT) / TPS - o.start) : 0; }
  const otDmg = () => { const s = otSecs(); return s > 0 ? 1 + rules.overtime.dmgPerSec * s : 1; };
  const otHeal = () => (otSecs() > 0 ? rules.overtime.healPenalty ?? 1 : 1);

  function computeDamage(src, snap, dst, e, roll, frac = 1) {
    let dmg = snap.atk * (e.mult ?? 1) * frac + (e.flat || 0);
    dmg *= 1 + snap.dmg + (snap.vs[dst.role] || 0);
    let adv = null;
    if (!e.ignoreTriangle) {
      if (BEATS[src.role] === dst.role) { dmg *= 1 + rules.triangle.adv; adv = 'adv'; }
      else if (BEATS[dst.role] === src.role) { dmg *= 1 - rules.triangle.resist; adv = 'resist'; }
    }
    const de = eff(dst);
    if (!e.pierce) dmg *= rules.defK / (rules.defK + de.def);
    dmg *= 1 - de.dr;
    if (roll.isCrit) dmg *= 1 + snap.critDmg;
    dmg *= roll.varianceRoll * otDmg();
    return { amount: Math.max(1, Math.round(dmg)), adv };
  }

  function applyDamage(src, dst, amount, info) {
    if (cheats.invulnerable && dst.side === 'player') amount = 0;
    else if (cheats.oneHit && dst.side === 'enemy' && src?.side === 'player') { dst.shields = []; amount = Math.max(amount, dst.hp); }
    let absorbed = 0;
    let rest = amount;
    for (const s of dst.shields) {
      const a = Math.min(s.amt, rest);
      s.amt -= a; rest -= a; absorbed += a;
      if (rest <= 0) break;
    }
    dst.shields = dst.shields.filter((s) => s.amt > 0);
    const before = dst.hp;
    dst.hp = Math.max(0, dst.hp - rest);
    const lost = before - dst.hp;
    if (src) src.stats.dealt += lost + absorbed;
    dst.stats.taken += lost + absorbed;
    const kill = dst.hp <= 0;
    emit({ type: 'hit', src: src?.id ?? null, dst: dst.id, amount: lost, absorbed, crit: !!info.crit, adv: info.adv || null,
      ability: info.ability || null, shot: info.shot ?? null, dot: !!info.dot, status: info.status || null,
      hp: dst.hp, maxHp: dst.maxHp, shield: Math.round(shieldTotal(dst)), kill });
    if (lost > 0) gainCharge(dst, (lost / dst.maxHp) * rules.charge.perHitTakenPctHp);
    if (kill) die(dst, src);
    else {
      if (src && !info.dot) firePassive(dst, 'on_damaged', { other: src });
      const th = dst.passive?.def.threshold ?? 0.4;
      if (!dst.lowHpFired && dst.passive?.def.trigger === 'low_hp' && dst.hp / dst.maxHp <= th) {
        dst.lowHpFired = true; firePassive(dst, 'low_hp', {});
      }
    }
    return { lost, kill };
  }

  function heal(src, dst, amount, ability) {
    if (!dst.alive) return 0;
    const a = Math.max(0, Math.min(Math.round(amount * otHeal()), dst.maxHp - dst.hp));
    dst.hp += a;
    src.stats.healed += a;
    emit({ type: 'heal', src: src.id, dst: dst.id, amount: a, ability: ability || null, hp: dst.hp, maxHp: dst.maxHp });
    return a;
  }

  function addShield(src, dst, amount, duration, ability) {
    if (!dst.alive) return;
    const room = Math.max(0, dst.maxHp * (rules.shieldCap ?? 9) - shieldTotal(dst));
    const a = Math.round(Math.min(amount * otHeal(), room));
    if (a <= 0) return;
    dst.shields.push({ amt: a, until: t + secToTicks(duration || 6) });
    src.stats.shielded += a;
    emit({ type: 'shield', src: src.id, dst: dst.id, amount: a, shield: Math.round(shieldTotal(dst)), ability: ability || null, duration: duration || 6 });
  }

  function applyStatus(src, dst, e, ability) {
    if (!dst.alive) return;
    if (e.chance != null && e.chance < 1 && rng.next() >= e.chance) return;
    let sdef = e.type === 'mods'
      ? { id: `mods_${ability?.id || 'x'}`, name: ability?.name || 'Mod', kind: Object.values(e.mods).some((v) => v < 0) ? 'debuff' : 'buff', icon: ability?.icon, mods: e.mods, stack: 'refresh' }
      : STAT[e.status];
    if (!sdef) throw new Error(`sim: unknown status '${e.status}'`);
    const dur = secToTicks(e.duration ?? sdef.duration ?? 3);
    const ex = dst.statuses.find((s) => s.id === sdef.id);
    const snapAtk = eff(src).atk;
    const mult = e.mult ?? sdef.dot?.mult ?? sdef.hot?.mult ?? 0;
    if (ex) {
      if (sdef.stack === 'stack') ex.stacks = Math.min(sdef.maxStacks || 5, ex.stacks + (e.stacks || 1));
      ex.until = Math.max(ex.until, t + dur);
      ex.src = src; ex.atk = Math.max(ex.atk, snapAtk); ex.mult = Math.max(ex.mult, mult);
    } else {
      dst.statuses.push({ id: sdef.id, def: sdef, until: t + dur, stacks: sdef.stack === 'stack' ? Math.min(sdef.maxStacks || 5, e.stacks || 1) : 1, src, atk: snapAtk, mult, nextTick: t + TPS, start: t });
    }
    if (sdef.mods && 'spd' in sdef.mods) { /* attack timer adjusts naturally on next attack */ }
    emit({ type: sdef.kind === 'buff' ? 'buff' : 'debuff', src: src.id, dst: dst.id, status: sdef.id, duration: dur / TPS,
      stacks: (ex || dst.statuses[dst.statuses.length - 1]).stacks, ability: ability?.id || null });
    if (sdef.stun || sdef.taunt || sdef.stealth) auraDirty = auraDirty || false;
  }

  function removeStatus(u, s, reason) {
    u.statuses.splice(u.statuses.indexOf(s), 1);
    emit({ type: 'status_end', dst: u.id, status: s.id, reason });
  }

  // Apply one ability's effect list from src to a set of targets (already landed).
  function applyEffects(src, ability, level, primary, effects, snap, roll, shot, frac = 1, ctx = {}) {
    for (const raw of effects) {
      const e = scaled(raw, ability, level);
      const tgts = e.target ? pickTargets(src, e.target, { other: primary }) : (primary ? [primary] : []);
      for (const dst of tgts) {
        if (!dst) continue;
        switch (e.type) {
          case 'damage': {
            if (!dst.alive) { emit({ type: 'fizzle', src: src.id, dst: dst.id, shot, ability: ability?.id }); break; }
            const { amount, adv } = computeDamage(src, snap, dst, e, roll, frac);
            const r = applyDamage(src, dst, amount, { crit: roll.isCrit, adv, ability: ability?.id, shot });
            if (e.status && !r.kill) applyStatus(src, dst, { type: 'status', ...e.status }, ability);
            if (ctx.basic && src.alive) {
              firePassive(src, 'on_hit', { other: dst });
              if (roll.isCrit) firePassive(src, 'on_crit', { other: dst });
            }
            break;
          }
          case 'heal': {
            const amt = e.pctMax != null ? dst.maxHp * e.pctMax : snap.atk * (e.mult ?? 1) * (1 + snap.heal);
            heal(src, dst, amt * frac, ability?.id); break;
          }
          case 'shield': {
            const amt = e.pctMax != null ? dst.maxHp * e.pctMax : snap.atk * (e.mult ?? 1) * (1 + snap.heal);
            addShield(src, dst, amt * frac, e.duration, ability?.id); break;
          }
          case 'status': case 'mods': applyStatus(src, dst, e, ability); break;
          case 'cleanse': {
            let n = e.count ?? 1;
            for (const s of [...dst.statuses].reverse()) { if (n <= 0) break; if (s.def.kind === 'debuff') { removeStatus(dst, s, 'cleanse'); n--; } }
            break;
          }
          case 'dispel': {
            let n = e.count ?? 1;
            if (dst.shields.length && n > 0) { dst.shields = []; n--; emit({ type: 'shield', src: src.id, dst: dst.id, amount: 0, shield: 0, ability: ability?.id, broken: true }); }
            for (const s of [...dst.statuses].reverse()) { if (n <= 0) break; if (s.def.kind === 'buff') { removeStatus(dst, s, 'dispel'); n--; } }
            break;
          }
          case 'charge': if (dst.alive) { dst.charge = clamp(dst.charge + (e.amount || 0), 0, 100); if (dst.charge < 100) dst.readyEmitted = false; } break;
          case 'revive': {
            if (dst.alive || dst.revived) break;
            dst.alive = true; dst.revived = true; dst.hp = Math.round(dst.maxHp * (e.pctMax ?? 0.3));
            dst.nextAttack = t + secToTicks(1); auraDirty = true;
            emit({ type: 'revive', src: src.id, dst: dst.id, hp: dst.hp, maxHp: dst.maxHp });
            break;
          }
        }
      }
    }
  }

  function firePassive(u, trigger, ctx) {
    const p = u.passive;
    if (!p || !u.alive || p.def.trigger !== trigger) return;
    if (p.def.once && u['_once_' + trigger]) return;
    if (p.def.chance != null && p.def.chance < 1 && rng.next() >= p.def.chance) return;
    if (p.def.once) u['_once_' + trigger] = true;
    const snap = eff(u);
    const roll = { isCrit: false, varianceRoll: 1 };
    const primary = ['on_hit', 'on_crit', 'on_damaged'].includes(trigger) && ctx.other ? ctx.other : u;
    const targets = [...new Set((p.def.effects || []).flatMap((e) => (e.target ? pickTargets(u, e.target, { other: ctx.other }) : [primary])))];
    emit({ type: 'ability', kind: 'passive', src: u.id, ability: p.def.id, trigger, targets: targets.map((x) => x.id), fireT: t, impactT: t });
    const prim = ['on_hit', 'on_crit', 'on_damaged'].includes(trigger) ? ctx.other : u;
    applyEffects(u, p.def, p.level, prim, p.def.effects || [], snap, roll, null);
  }

  function gainCharge(u, amt) {
    if (!u.alive || isStunned(u)) return;
    const m = eff(u).charge * u.chargeRate;
    u.charge = clamp(u.charge + amt * m, 0, 100);
    if (u.charge >= 100 && !u.readyEmitted) { u.readyEmitted = true; emit({ type: 'overdrive_ready', src: u.id }); }
  }

  function die(u, killer) {
    u.alive = false;
    u.hp = 0;
    u.shields = [];
    u.statuses = [];
    u.charge = 0;
    auraDirty = true;
    emit({ type: 'death', dst: u.id, src: killer?.id ?? null });
    if (killer && killer.alive && killer !== u) {
      killer.stats.kills++;
      gainCharge(killer, rules.charge.onKill);
      firePassive(killer, 'on_kill', { other: u });
    }
    for (const a of sideUnits(u.side)) firePassive(a, 'ally_death', { other: u });
  }

  // ---------- actions
  function basicAttack(u) {
    const ab = u.attack;
    if (!ab) return false;
    const def = ab.def;
    // every_n passives prime the coming attack
    if (u.passive?.def.trigger === 'every_n' && (u.attackCount + 1) % (u.passive.def.n || 3) === 0) firePassive(u, 'every_n', {});
    let targets;
    const sticky = units[u.stickyId];
    const spec = def.target || { side: 'enemy', pick: 'lane' };
    if ((spec.pick || 'lane') === 'lane' && spec.side !== 'ally' && sticky && sticky.alive && !hasFlag(sticky, 'stealth') && !forcedTauntOverride(u, sticky)) targets = [sticky];
    else targets = pickTargets(u, spec);
    if (!targets.length || !targets[0]) return false;
    if ((spec.pick || 'lane') === 'lane' && spec.side !== 'ally') u.stickyId = targets[0].id;
    const snap = eff(u);
    const delivery = def.delivery || { type: 'projectile' };
    const windup = secToTicks(delivery.windup ?? (delivery.type === 'melee' ? rules.meleeWindup : rules.windup));
    const fireT = t + windup;
    const roll = rollHit(u, snap, def);
    const main = targets[0];
    const shot = ++shotSeq;
    const impactT = fireT + travelTicks(u, main, delivery);
    emit({ type: 'attack', src: u.id, dst: main.id, targets: targets.map((x) => x.id), ability: def.id, delivery: delivery.type, fireT, impactT, shot, crit: roll.isCrit });
    pending.push({ at: Math.max(impactT, t + 1), src: u, ability: def, level: ab.level, primaryIds: targets.map((x) => x.id), snap, roll, shot, basic: true, splash: def.target?.splash });
    u.attackCount++;
    u.busyUntil = fireT;
    u.nextAttack = t + Math.max(windup + 1, secToTicks(snap.interval));
    firePassive(u, 'on_attack', { other: main });
    return true;
  }
  // A taunt *status* (e.g. an Overdrive) in lane ±1 pulls attackers off their sticky target.
  function forcedTauntOverride(u, sticky) {
    if (hasFlag(sticky, 'taunt')) return false;
    return sideUnits(sticky.side).some((x) => x !== sticky && hasFlag(x, 'taunt') && Math.abs(x.slot.lane - u.slot.lane) <= 1);
  }

  function castOverdrive(u) {
    const ab = u.overdrive;
    if (!ab) return false;
    const def = ab.def;
    const targets = pickTargets(u, def.target || { side: 'enemy', pick: 'all' });
    if (!targets.length || !targets[0]) return false;
    const snap = eff(u);
    const delivery = def.delivery || { type: 'area' };
    const windup = secToTicks(delivery.windup ?? 0.6);
    const fireT = t + windup;
    const shot = ++shotSeq;
    const perTarget = delivery.type === 'projectile';
    const impacts = targets.map((d) => fireT + travelTicks(u, d, delivery));
    const opp = def.target?.side === 'enemy' ? other(u.side) : u.side;
    emit({ type: 'ability', kind: 'overdrive', src: u.id, ability: def.id, targets: targets.map((x) => x.id), delivery: delivery.type,
      fireT, impactT: Math.max(...impacts), impacts, shot, area: { side: opp, pick: def.target?.pick || 'all' } });
    u.charge = 0; u.readyEmitted = false; u.stats.overdrives++;
    manualQueue.delete(u.id);
    if (perTarget) {
      targets.forEach((d, i) => pending.push({ at: Math.max(impacts[i], t + 1), src: u, ability: def, level: ab.level, primaryIds: [d.id], snap, roll: rollHit(u, snap, def), shot, splash: def.target?.splash }));
    } else {
      pending.push({ at: Math.max(fireT + (delivery.type === 'area' ? 2 : 1), t + 1), src: u, ability: def, level: ab.level, primaryIds: targets.map((x) => x.id), snap, roll: rollHit(u, snap, def), shot, splash: def.target?.splash, perRoll: true });
    }
    for (const p of pending) if (p.shot === shot) { p.fireT = fireT; p.overdrive = true; }
    const busy = windup + secToTicks(rules.overdriveRecover);
    u.busyUntil = t + busy;
    u.nextAttack = Math.max(u.nextAttack, t + busy);
    return true;
  }

  function resolveImpact(p) {
    const src = p.src;
    if (p.basic && src.alive) gainCharge(src, rules.charge.perAttack);
    // A dead attacker's shots in flight still land (feels right visually).
    for (const id of p.primaryIds) {
      const dst = units[id];
      const roll = p.perRoll ? rollHit(src, p.snap, p.ability) : p.roll;
      applyEffects(src, p.ability, p.level, dst, p.ability.effects || [], p.snap, roll, p.shot, 1, { basic: p.basic });
      if (p.splash && dst) {
        for (const [s, frac] of splashTargets(dst, p.splash)) {
          applyEffects(src, p.ability, p.level, s, (p.ability.effects || []).filter((e) => e.type === 'damage'), p.snap, roll, p.shot, frac);
        }
      }
    }
  }

  // ---------- inputs
  function applyInput(inp) {
    recorded.push({ ...inp });
    if (inp.type === 'overdrive') {
      const u = units[inp.unit];
      if (u && u.side === 'player' && u.alive) manualQueue.add(u.id);
    } else if (inp.type === 'auto') auto = !!inp.value;
    else if (inp.type === 'forfeit') finish(false, 'forfeit');
  }

  // ---------- tick
  function tickOnce() {
    t++;
    while (inputQueue.length && inputQueue[0].t <= t) applyInput(inputQueue.shift());
    if (done) return;

    if (pending.length) {
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        if (p.overdrive && p.fireT > t - 1 && p.src.alive && isStunned(p.src)) {
          const shot = p.shot;
          for (let j = pending.length - 1; j >= 0; j--) if (pending[j].shot === shot) pending.splice(j, 1);
          i = -1;
          p.src.charge = clamp(rules.charge.stunRefund ?? 50, 0, 100);
          emit({ type: 'cancel', src: p.src.id, ability: p.ability.id, shot, refund: p.src.charge });
        }
      }
      const due = [];
      for (let i = 0; i < pending.length; i++) if (pending[i].at <= t) due.push(pending.splice(i--, 1)[0]);
      for (const p of due) resolveImpact(p);
    }
    if (checkEnd()) return;

    if (phase === 'gap') {
      if (t >= nextWaveAt) { waveIdx++; spawnWave(waveIdx); }
      return;
    }

    for (const id of order) {
      const u = units[id];
      if (!u.alive) continue;
      for (const s of [...u.statuses]) {
        if ((s.def.dot || s.def.hot) && t >= s.nextTick) {
          s.nextTick += TPS;
          const amt = s.atk * s.mult * s.stacks;
          if (s.def.dot) applyDamage(s.src, u, Math.max(1, Math.round(amt * otDmg())), { dot: true, status: s.id, ability: s.id });
          else heal(s.src, u, amt, s.id);
          if (!u.alive) break;
        }
        if (u.alive && t >= s.until && u.statuses.includes(s)) removeStatus(u, s, 'expire');
      }
      if (!u.alive) continue;
      if (u.shields.length) u.shields = u.shields.filter((s) => s.until > t);
      if (u.passive?.def.trigger === 'interval' && t - u.lastIntervalT >= secToTicks(u.passive.def.every || 5)) {
        u.lastIntervalT = t; firePassive(u, 'interval', {});
      }
      gainCharge(u, rules.charge.perSec / TPS);
    }
    if (checkEnd()) return;

    for (const id of order) {
      const u = units[id];
      if (!u.alive || t < u.busyUntil || isStunned(u)) continue;
      if (u.charge >= 100 && u.overdrive && (u.side === 'enemy' || auto || manualQueue.has(u.id))) {
        if (castOverdrive(u)) continue;
      }
      if (t >= u.nextAttack) basicAttack(u);
      if (checkEnd()) return;
    }
    if (rules.overtime && !otAnnounced && t - waveStartT >= secToTicks(rules.overtime.start)) { otAnnounced = true; emit({ type: 'overtime', wave: waveIdx + 1, dmgPerSec: rules.overtime.dmgPerSec, healPenalty: rules.overtime.healPenalty }); }
    if (!cheats.invulnerable && t - waveStartT > secToTicks(rules.waveTimeout)) finish(false, 'timeout');
  }

  function checkEnd() {
    if (done) return true;
    if (!playerIds.some((id) => units[id].alive)) { finish(false, 'defeat'); return true; }
    if (phase === 'fight' && !enemyIds.some((id) => units[id].alive)) {
      emit({ type: 'wave', phase: 'clear', wave: waveIdx + 1, of: waves.length });
      if (waveIdx + 1 < waves.length) {
        phase = 'gap';
        nextWaveAt = t + secToTicks(rules.waveGap);
        pending.length = 0;
        for (const id of playerIds) {
          const u = units[id];
          if (rules.waveClear === 'all') { u.statuses = []; u.shields = []; }
          else if (rules.waveClear === 'debuffs') u.statuses = u.statuses.filter((s) => s.def.kind === 'buff');
          u.stickyId = null;
        }
      } else { finish(true, 'victory'); return true; }
    }
    return false;
  }

  function finish(win, reason) {
    done = true;
    phase = 'done';
    const lost = playerIds.filter((id) => !units[id].alive);
    const integ = integrity(playerIds);
    let stars = 0;
    const st = { ...(rules.stars || {}), ...(opts.stars || {}) };
    if (win) stars = (st.threeMaxTime != null ? lost.length === 0 && t / TPS <= st.threeMaxTime : lost.length === 0) ? 3 : (st.twoMaxLost != null ? lost.length <= st.twoMaxLost : integ >= (st.two ?? 0.4)) ? 2 : 1;
    let goals;
    if (opts.goals?.length) {
      goals = evalGoals(opts.goals, goalCtx(win, lost.length, integ));
      stars = goals.filter(Boolean).length;
    }
    const stats = {};
    for (const id of [...playerIds, ...allEnemyIds]) stats[id] = { ...units[id].stats };
    const mvp = playerIds.slice().sort((a, b) => (units[b].stats.dealt + units[b].stats.healed + units[b].stats.shielded * 0.5) - (units[a].stats.dealt + units[a].stats.healed + units[a].stats.shielded * 0.5))[0];
    result = {
      win, reason, stars, seed, ticks: t, time: t / TPS,
      waves: waves.length, wavesCleared: win ? waves.length : waveIdx,
      integrity: integ, enemyIntegrity: integrity(enemyIds),
      survivors: playerIds.filter((id) => units[id].alive), lost,
      playerHp: Object.fromEntries(playerIds.map((id) => [id, units[id].hp])),
      uids: Object.fromEntries(playerIds.map((id) => [id, units[id].uid ?? null])),
      stats, mvp, inputs: recorded.slice(), auto,
      ...(goals ? { goals } : {}),
      ...(cheating ? { cheats: { ...cheats } } : {}),
    };
    emit({ type: 'end', win, reason, stars, result });
  }

  // Star-goal context (story.js evalGoal); game_state rebuilds the same from result + squad.
  function goalCtx(win, lost, integ) {
    const roles = {}, factions = {};
    for (const id of playerIds) { const u = units[id]; roles[u.role] = (roles[u.role] || 0) + 1; factions[u.faction] = (factions[u.faction] || 0) + 1; }
    return { win, time: t / TPS, lost, deployed: playerIds.length, roles, factions, integrity: integ };
  }

  function integrity(ids) {
    let hp = 0, max = 0;
    for (const id of ids) { hp += units[id].hp; max += units[id].maxHp; }
    return max ? hp / max : 0;
  }

  // ---------- views (stable objects, refreshed in place after each step)
  const views = {};
  const state = { t: 0, time: 0, tps: TPS, phase, wave: 1, waves: waves.length, auto, seed,
    player: { units: [], integrity: 1, hp: 0, maxHp: 0, synergies: playerSyn },
    enemy: { units: [], integrity: 1, hp: 0, maxHp: 0, synergies: [] },
    units: views, done: false, cheats: cheating ? { ...cheats } : null };

  function abView(a) { return a ? { id: a.def.id, name: a.def.name, icon: a.def.icon, level: a.level, kind: a.def.kind } : null; }
  function view(u) {
    let v = views[u.id];
    if (!v) {
      v = views[u.id] = { id: u.id, uid: u.uid ?? null, side: u.side, wave: u.wave + 1, def: u.defId, name: u.name, role: u.role, faction: u.faction,
        rarity: u.rarity, model: u.model, level: u.level, rank: u.rank, slot: u.slot, slotIndex: u.slotIndex, posBonus: u.posBonus,
        abilities: { attack: abView(u.attack), passive: abView(u.passive), overdrive: abView(u.overdrive) } };
    }
    v.hp = u.hp; v.maxHp = u.maxHp; v.hpPct = u.hp / u.maxHp; v.shield = Math.round(shieldTotal(u));
    v.charge = Math.floor(u.charge); v.chargePct = u.charge / 100; v.overdriveReady = u.alive && u.charge >= 100 && !!u.overdrive;
    v.alive = u.alive; v.stunned = u.alive && isStunned(u);
    v.statuses = u.statuses.map((s) => ({ id: s.id, kind: s.def.kind, icon: s.def.icon, stacks: s.stacks, remaining: Math.max(0, (s.until - t) / TPS) }));
    return v;
  }

  function refresh() {
    state.t = t; state.time = t / TPS; state.phase = phase; state.wave = waveIdx + 1; state.auto = auto; state.done = done;
    state.player.units = playerIds.map((id) => view(units[id]));
    state.enemy.units = enemyIds.map((id) => view(units[id]));
    state.enemy.synergies = enemySyn;
    for (const [k, ids] of [['player', playerIds], ['enemy', enemyIds]]) {
      let hp = 0, max = 0;
      for (const id of ids) { hp += units[id].hp; max += units[id].maxHp; }
      state[k].hp = hp; state[k].maxHp = max; state[k].integrity = max ? hp / max : 0;
    }
    state.waveTimeLeft = Math.max(0, rules.waveTimeout - (t - waveStartT) / TPS);
    state.overtime = otSecs() > 0;
    state.overtimeMult = otDmg();
  }

  spawnWave(0);
  refresh();

  const battle = {
    tps: TPS,
    events,
    state,
    get done() { return done; },
    get result() { return result; },
    get t() { return t; },
    step(n = 1) {
      newEvents = [];
      for (let i = 0; i < n && !done; i++) tickOnce();
      refresh();
      return newEvents;
    },
    runToEnd(maxTicks = 20000) { const out = []; while (!done && t < maxTicks) out.push(...battle.step(100)); if (!done) finish(false, 'timeout'); refresh(); return out; },
    fireOverdrive(unitId) {
      const u = units[unitId];
      if (done || !u || u.side !== 'player' || !u.alive || u.charge < 100) return false;
      applyInput({ t: t + 1, type: 'overdrive', unit: unitId });
      return true;
    },
    forfeit() {
      if (done) return [];
      newEvents = [];
      recorded.push({ t, type: 'forfeit' });
      finish(false, 'forfeit');
      refresh();
      return newEvents;
    },
    setAuto(v) { if (!!v !== auto) applyInput({ t: t + 1, type: 'auto', value: !!v }); return auto; },
    inputs: recorded,
    // The renderer may peek where a unit stands without reaching into internals.
    unit(id) { return views[id] || null; },
  };
  return battle;
}

export function simulateBattle(opts) {
  const b = createBattle({ ...opts, record: opts.record ?? false });
  b.runToEnd(opts.maxTicks);
  return opts.record ? { result: b.result, events: b.events } : b.result;
}
