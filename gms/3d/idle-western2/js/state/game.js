// The pure economy: no DOM, no renderer, no wall clock or unseeded randomness (test-boot and test-economy check). Fixed 0.1 s steps.
// API (docs/ENGINE.md): state, simTime, data, tick, act, quote, stats, totals, on, advanceOffline, serialize.
import * as E from './economy.js?v=20261004a';
import { newLineState, stepLine, sellPile } from './lines.js?v=20261004a';
import { pickEvent, nextGap, mulberry32 } from './events.js?v=20261004a';
import { offlineClosedForm } from './offline.js?v=20261004a';
import { SAVE_VERSION, GAME_ID } from './save.js?v=20261004a';
import { managerFor, newManagerState } from './managers.js?v=20261004a';
import { ECON, LINES } from '../data/lines.js?v=20261004a';
import { DISTRICTS, COURIER } from '../data/districts.js?v=20261004a';
import { MANAGERS } from '../data/managers.js?v=20261004a';
import { EVENTS, EVENT_GAP, SPECIAL_GAP } from '../data/events.js?v=20261004a';

const STEP = 0.1;

export const DEFAULT_DATA = {
  econ: ECON, lines: LINES, districts: DISTRICTS, courier: COURIER, managers: MANAGERS,
  events: EVENTS, eventGap: EVENT_GAP, specialGap: SPECIAL_GAP,
};

const STATS0 = { taps: 0, bootTaps: 0, pileTaps: 0, harvests: 0, events: 0, levels: 0, upgrades: 0, couriers: 0, comboMax: 0, crits: 0, plays: 1 };

export function freshState(data, seed = 1) {
  const lines = {};
  for (const l of data.lines) lines[l.id] = newLineState();
  return {
    seed,
    cash: 0, lifetime: 0,
    lines,
    districts: [data.districts[0].id],
    managers: {},
    events: { nextFrequent: 45, nextSpecial: 200, active: [], mults: [], seq: 0, courierNext: 20 },
    couriers: [],
    combo: { n: 0, last: -99 },
    bootstrap: { done: false },
    returnHarvest: {},
    settings: { tier: 'auto', sound: true, reducedMotion: false, qty: 1 },
    stats: { ...STATS0 },
    hints: {},
    clock: { hi: 0 },
  };
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function normalize(s, fresh, data) {
  const out = fresh;
  for (const k in s) {
    if (k === 'lines') continue;
    if (isObj(out[k]) && isObj(s[k]) && !['managers', 'returnHarvest', 'hints'].includes(k)) out[k] = Object.assign(out[k], s[k]);
    else out[k] = s[k];
  }
  for (const l of data.lines) out.lines[l.id] = Object.assign(newLineState(), s.lines?.[l.id] || {});
  out.stats = Object.assign({ ...STATS0 }, s.stats || {});
  for (const k of ['districts', 'couriers']) if (!Array.isArray(out[k])) out[k] = fresh[k] || [];
  if (!out.districts.includes(data.districts[0].id)) out.districts.unshift(data.districts[0].id);
  out.events.active = Array.isArray(out.events.active) ? out.events.active : [];
  out.events.mults = Array.isArray(out.events.mults) ? out.events.mults : [];
  return out;
}

export function createGame({ data: given = {}, save = null, seed = 1, rng = null, nowWall = () => 0, allowCheat = false } = {}) {
  const data = { ...DEFAULT_DATA, ...given };
  if (given.econ) data.econ = { ...ECON, ...given.econ };
  const X = data.econ;
  let simTime = 0;
  let state = freshState(data, seed);
  if (save && save.s) {
    state = normalize(save.s, state, data);
    simTime = save.simTime || 0;
    seed = save.seed ?? seed;
    state.seed = seed;
  }
  rng = rng || mulberry32((seed ^ Math.floor(simTime * 7)) >>> 0);
  const lineById = Object.fromEntries(data.lines.map((l) => [l.id, l]));
  const mgrById = Object.fromEntries(data.managers.map((m) => [m.id, m]));
  const districtById = Object.fromEntries(data.districts.map((d) => [d.id, d]));
  const subs = new Map();
  const D = {};
  for (const l of data.lines) D[l.id] = { P: 0, Pbase: 0, sigma: 0, cap: 0, speed: 1, cycleSec: l.cycleSec, crit: 0, auto: false, price: 1, m: 1 };
  const G = { offlineCap: X.offlineCapSec, incomePerSec: 0, gross: 0 };
  const wasFull = {}, pendSold = {}, tipped = new Set();
  let tickNo = 0, statsTick = -1, acc = 0, dirty = true;
  const statsCache = {};

  function emit(type, payload) {
    const set = subs.get(type);
    if (set) for (const fn of [...set]) { try { fn(payload); } catch (e) { /* listeners never break the sim */ } }
  }

  function earn(cash) {
    if (!(cash > 0)) return;
    state.cash += cash;
    state.lifetime += cash;
  }

  function derive() {
    dirty = false;
    let offline = X.offlineCapSec;
    let allEv = 1;
    for (const e of state.events.mults) if (!e.lineId && e.until > simTime) allEv *= e.mult;
    let inc = 0, gross = 0;
    for (const l of data.lines) {
      const ls = state.lines[l.id], d = D[l.id];
      if (ls.lv <= 0) { d.P = d.Pbase = d.sigma = d.cap = 0; d.auto = false; continue; }
      const mid = ls.mgr, mdef = mid ? mgrById[mid] : null;
      const tk = mdef ? mdef.kind : null, tv = mdef ? mdef.value : 0;
      const speed = 1 + (tk === 'speed' ? tv : 0);
      let price = E.priceMult(ls.thr, X);
      let sigma = X.sigmaWalkIn;
      if (mid) {
        const s0 = E.sigmaBase(ls.thr, X) + (tk === 'sigma' ? tv : 0);
        if (s0 > 1) price *= s0;
        sigma = Math.min(1, s0);
      }
      let m = ls.lv * l.rate * E.milestoneMult(ls.lv, X) * E.boostMult(l, ls.boost) * price * speed;
      if (tk === 'star' && ls.lv >= 50) m *= 1 + tv;
      let ev = allEv;
      for (const e of state.events.mults) if (e.lineId === l.id && e.until > simTime) ev *= e.mult;
      d.Pbase = m;
      d.P = m * ev;
      d.m = m / (ls.lv * l.rate);
      d.sigma = sigma;
      d.speed = speed;
      d.cycleSec = l.cycleSec / speed;
      d.crit = 0;
      d.price = price;
      d.auto = tk === 'autopile' && !!mid;
      d.cap = E.shelfCap(m, ls.sto, tk === 'shelf' ? 1 + tv : 1, X);
      if (mid && tk === 'offline') offline += tv;
      gross += d.P;
      inc += d.auto ? d.P : d.P * sigma;
    }
    G.offlineCap = Math.min(24 * 3600, offline);
    G.incomePerSec = inc;
    G.gross = gross;
  }

  function costMult(lineId) {
    const mid = lineId && state.lines[lineId]?.mgr;
    return mid && mgrById[mid]?.kind === 'cost' ? 1 - mgrById[mid].value : 1;
  }

  function rewardBase(lineId) {
    let b = Math.max(G.incomePerSec, G.gross * 0.6, 1);
    const mid = lineId && state.lines[lineId]?.mgr;
    if (mid && mgrById[mid]?.kind === 'events') b *= 1 + mgrById[mid].value;
    return b;
  }

  const tapValue = () => (state.bootstrap.done ? X.tapK * Math.max(G.gross, 0.1) : X.bootTap);

  function ownedIds() {
    const out = [];
    for (const l of data.lines) if (state.lines[l.id].lv > 0) out.push(l.id);
    return out;
  }

  function pickLine() {
    const ids = ownedIds();
    return ids.length ? ids[Math.floor(rng() * ids.length)] : null;
  }

  function spawn(def) {
    const ev = state.events;
    const e = { id: 'e' + ++ev.seq, kind: def.id, art: def.art || def.id, emoji: def.emoji, name: def.name, lineId: def.lineless ? null : pickLine(), born: simTime, expires: simTime + def.lifeSec };
    ev.active.push(e);
    emit('event:spawn', { event: e });
  }

  function spawnEvents() {
    const ev = state.events;
    if (simTime >= ev.nextFrequent) {
      ev.nextFrequent = simTime + nextGap(data.eventGap, rng);
      const def = data.events.find((d) => d.frequent);
      if (def && !ev.active.some((e) => e.kind === def.id)) spawn(def);
    }
    if (simTime >= ev.nextSpecial) {
      ev.nextSpecial = simTime + nextGap(data.specialGap, rng);
      if (ev.active.some((e) => !data.events.find((d) => d.id === e.kind)?.frequent)) return;
      const def = pickEvent(data.events, rng, (d) => !d.frequent && (!d.district || state.districts.includes(d.district)));
      if (def) spawn(def);
    }
  }

  function expireEvents() {
    const ev = state.events;
    for (let i = ev.active.length - 1; i >= 0; i--) {
      const e = ev.active[i];
      if (e.expires > simTime) continue;
      ev.active.splice(i, 1);
      emit('event:expire', { event: e });
    }
    if (ev.mults.length && ev.mults.some((m) => m.until <= simTime)) {
      ev.mults = ev.mults.filter((m) => m.until > simTime);
      dirty = true;
    }
  }

  function stepCouriers() {
    if (!data.courier || !state.bootstrap.done) return;
    const ev = state.events;
    for (let i = state.couriers.length - 1; i >= 0; i--) {
      if (state.couriers[i].t1 <= simTime) emit('courier:gone', { courier: state.couriers.splice(i, 1)[0] });
    }
    if (simTime >= ev.courierNext) {
      ev.courierNext = simTime + nextGap(data.courier.gap, rng);
      const lineId = pickLine();
      if (!lineId) return;
      const c = { id: 'c' + ++ev.seq, lineId, t0: simTime, t1: simTime + data.courier.life };
      state.couriers.push(c);
      emit('courier:spawn', { courier: c });
    }
  }

  function step(h) {
    simTime += h;
    derive();
    for (const l of data.lines) {
      const ls = state.lines[l.id];
      if (ls.lv <= 0) continue;
      const d = D[l.id];
      const sold = stepLine(ls, d, h);
      if (sold > 0) {
        earn(sold);
        ls.earned += sold;
        pendSold[l.id] = (pendSold[l.id] || 0) + sold;
      }
      if (d.auto && ls.stock >= d.cap - 1e-9 && ls.stock > 0) {
        const cash = sellPile(ls, X.pileMult);
        earn(cash);
        ls.earned += cash;
        emit('pileSold', { lineId: l.id, cash, auto: true });
      }
      const full = ls.stock >= d.cap - 1e-9 && d.cap > 0;
      if (full && !wasFull[l.id]) emit('full', { lineId: l.id });
      wasFull[l.id] = full;
      while (ls.cyc >= 1) {
        ls.cyc -= 1;
        emit('produced', { lineId: l.id, units: 1 });
        if (pendSold[l.id]) { emit('sold', { lineId: l.id, cash: pendSold[l.id] }); pendSold[l.id] = 0; }
      }
    }
    expireEvents();
    if (state.bootstrap.done) spawnEvents();
    stepCouriers();
  }

  const fail = (code, msg) => ({ ok: false, code, msg });

  function pay(cost, fn) {
    if (!(cost >= 0) || !isFinite(cost)) return fail('bad', 'Not for sale');
    if (state.cash < cost) return fail('funds', 'Not enough cash');
    state.cash -= cost;
    fn();
    dirty = true;
    return { ok: true, delta: { cash: -cost } };
  }

  function lineOk(lineId) {
    const line = lineById[lineId], ls = state.lines[lineId];
    return line && ls && ls.lv > 0 ? [line, ls] : [null, null];
  }

  function levelQty(line, ls, qty) {
    if (qty === 'max') return Math.max(1, E.maxAffordable(line, ls.lv, state.cash, costMult(line.id)));
    return Math.max(1, Math.min(1000, qty | 0 || 1));
  }

  function permitBlock(d) {
    const prev = data.districts[data.districts.indexOf(d) - 1];
    return prev && !state.districts.includes(prev.id) ? 'Open ' + prev.name + ' first' : null;
  }

  function assignManager(lineId, managerId) {
    for (const l of data.lines) if (state.lines[l.id].mgr === managerId && l.id !== lineId) state.lines[l.id].mgr = null;
    state.lines[lineId].mgr = managerId;
  }

  function claim(e) {
    const def = data.events.find((d) => d.id === e.kind) || {};
    const r = def.reward || {};
    const out = { cash: 0 };
    if (r.kind === 'cashSec') {
      out.jackpot = rng() < (r.jackpot || 0);
      out.cash = rewardBase(e.lineId) * r.sec * (out.jackpot ? r.jackpotMult : 1);
      earn(out.cash);
    } else if (r.kind === 'lineMult' || r.kind === 'allMult') {
      state.events.mults.push({ lineId: r.kind === 'lineMult' ? e.lineId : null, mult: r.mult, until: simTime + r.sec });
      out.mult = r.mult; out.sec = r.sec;
    }
    state.stats.events++;
    dirty = true;
    return out;
  }

  const acts = {
    tap(p) {
      state.stats.taps++;
      if (!state.bootstrap.done) {
        state.stats.bootTaps++;
        const v = X.bootTap;
        earn(v);
        emit('tap', { kind: 'boot', cash: v, x: p?.x, y: p?.y });
        return { ok: true, delta: { cash: v } };
      }
      const c = state.combo;
      c.n = simTime - c.last <= X.comboWindow ? c.n + 1 : 1;
      c.last = simTime;
      if (c.n > state.stats.comboMax) state.stats.comboMax = c.n;
      const combo = E.comboMult(c.n, X);
      const crit = rng() < Math.min(X.critCap, X.tapCrit);
      if (crit) state.stats.crits++;
      const v = tapValue() * combo * (crit ? X.tapCritMult : 1);
      earn(v);
      emit('tap', { kind: 'hustle', cash: v, combo, comboN: c.n, crit, x: p?.x, y: p?.y });
      return { ok: true, delta: { cash: v }, combo, crit };
    },
    tapPile({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line || ls.stock <= 0) return fail('empty');
      const h = state.returnHarvest[lineId];
      let mult = X.pileMult;
      if (h) {
        const mid = ls.mgr;
        mult *= X.returnHarvest + (mid && mgrById[mid]?.kind === 'harvest' ? mgrById[mid].value : 0);
        delete state.returnHarvest[lineId];
        state.stats.harvests++;
      }
      const cash = sellPile(ls, mult);
      earn(cash);
      ls.earned += cash;
      state.stats.pileTaps++;
      emit('pileSold', { lineId, cash, harvest: !!h });
      if (h) emit('harvest', { lineId, cash });
      return { ok: true, delta: { cash }, harvest: !!h };
    },
    tapCourier({ id }) {
      const i = state.couriers.findIndex((c) => c.id === id);
      if (i < 0) return fail('gone');
      const [c] = state.couriers.splice(i, 1);
      const cash = rewardBase(c.lineId) * data.courier.rewardSec;
      earn(cash);
      state.stats.couriers++;
      emit('courier:tap', { courier: c, cash });
      return { ok: true, delta: { cash } };
    },
    courierTap({ lineId, shipmentId }) {
      if (shipmentId != null && tipped.has(shipmentId)) return fail('gone');
      const c = state.couriers.find((x) => x.lineId === lineId) || state.couriers[0];
      if (!c) return fail('none', 'No tip waiting');
      const r = acts.tapCourier({ id: c.id });
      if (!r.ok) return r;
      if (shipmentId != null) { tipped.add(shipmentId); if (tipped.size > 64) tipped.delete(tipped.values().next().value); }
      emit('courierTap', { lineId: lineId || c.lineId, shipmentId, cash: r.delta.cash });
      return r;
    },
    unlock({ lineId }) {
      const line = lineById[lineId], ls = state.lines[lineId];
      if (!line) return fail('bad');
      if (ls.lv > 0) return fail('owned');
      if (!state.districts.includes(line.district)) return fail('locked', 'District locked');
      const r = pay(line.baseCost, () => {
        ls.lv = 1;
        if (!state.bootstrap.done) { state.bootstrap.done = true; state.events.nextFrequent = simTime + 45; state.events.nextSpecial = simTime + 200; }
        const own = managerFor(data, lineId);
        if (own && state.managers[own.id]) assignManager(lineId, own.id);
      });
      if (r.ok) { emit('unlocked', { lineId }); emit('bought', { lineId, kind: 'unlock' }); }
      return r;
    },
    level({ lineId, qty = 1 }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const n = levelQty(line, ls, qty);
      const before = ls.lv, tierBefore = E.visualTier(before);
      const r = pay(E.bulkCost(line, ls.lv, n, costMult(lineId)), () => { ls.lv += n; });
      if (!r.ok) return r;
      state.stats.levels += n;
      for (const t of X.milestones) if (t > before && t <= ls.lv) emit('milestone', { lineId, level: t, mult: X.milestoneMult });
      if (E.visualTier(ls.lv) !== tierBefore) emit('tier', { lineId, tier: E.visualTier(ls.lv) });
      emit('bought', { lineId, kind: 'level', qty: n, level: ls.lv });
      return { ...r, qty: n, level: ls.lv };
    },
    throughput({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const next = line.throughput[ls.thr];
      if (!next) return fail('max', 'Fully staffed');
      const r = pay(next.cost, () => { ls.thr++; });
      if (r.ok) { state.stats.upgrades++; emit('bought', { lineId, kind: 'throughput', glyph: next.glyph, name: next.name, sigma: next.sigma }); }
      return { ...r, glyph: next.glyph, name: next.name };
    },
    storage({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      if (ls.sto >= line.storage.length) return fail('max');
      const r = pay(line.storage[ls.sto], () => { ls.sto++; });
      if (r.ok) { state.stats.upgrades++; emit('bought', { lineId, kind: 'storage', level: ls.sto }); }
      return r;
    },
    boost({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const next = line.boosts[ls.boost];
      if (!next) return fail('max');
      const r = pay(next.cost, () => { ls.boost++; });
      if (r.ok) { state.stats.upgrades++; emit('bought', { lineId, kind: 'boost', glyph: next.glyph, name: next.name, mult: next.mult }); }
      return { ...r, glyph: next.glyph, name: next.name };
    },
    hire({ lineId, managerId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const def = managerId ? mgrById[managerId] : managerFor(data, lineId);
      if (!def || def.lineId !== lineId) return fail('bad');
      if (ls.mgr === def.id) return fail('owned');
      if (state.managers[def.id]) { assignManager(lineId, def.id); dirty = true; emit('bought', { lineId, kind: 'manager', managerId: def.id, cost: 0 }); return { ok: true, delta: { cash: 0 } }; }
      const r = pay(def.hireCost, () => {
        state.managers[def.id] = newManagerState();
        assignManager(lineId, def.id);
      });
      if (r.ok) emit('bought', { lineId, kind: 'manager', managerId: def.id });
      return r;
    },
    claimEvent({ eventId }) {
      const ev = state.events;
      const i = ev.active.findIndex((e) => e.id === eventId);
      if (i < 0) return fail('gone');
      const [e] = ev.active.splice(i, 1);
      const reward = claim(e);
      emit('event:claim', { event: e, reward });
      return { ok: true, delta: { cash: reward.cash }, reward };
    },
    permit({ districtId }) {
      const d = districtById[districtId];
      if (!d || state.districts.includes(districtId)) return fail('bad');
      const block = permitBlock(d);
      if (block) return fail('locked', block);
      const r = pay(d.permitCost, () => { state.districts.push(districtId); });
      if (r.ok) { emit('district', { districtId }); emit('bought', { kind: 'permit', districtId }); }
      return r;
    },
    setting({ key, value }) { state.settings[key] = value; return { ok: true }; },
    hint({ id }) { state.hints[id] = true; return { ok: true }; },
    cheat({ cash = 0, unlockAll = false, managers = false, levels = 0 }) {
      if (!allowCheat) return fail('unknown');
      earn(cash);
      if (unlockAll) {
        state.bootstrap.done = true;
        for (const d of data.districts) if (!state.districts.includes(d.id)) state.districts.push(d.id);
        derive();
        for (const l of data.lines) {
          const ls = state.lines[l.id];
          ls.lv = Math.max(ls.lv, 1 + Math.floor(levels * (1 - l.order / (data.lines.length + 2))));
          const def = managers && !ls.mgr ? managerFor(data, l.id) : null;
          if (def) { state.managers[def.id] ||= newManagerState(); ls.mgr = def.id; }
        }
        derive();
        for (const l of data.lines) state.lines[l.id].stock = D[l.id].cap * (0.2 + 0.6 * rng());
      }
      dirty = true;
      return { ok: true };
    },
  };

  const game = {
    get state() { return state; },
    get simTime() { return simTime; },
    data,
    tick(dt) {
      dt = Math.min(1, Math.max(0, +dt || 0));
      acc += dt;
      while (acc >= STEP - 1e-9) { acc -= STEP; step(STEP); }
      tickNo++;
    },
    act(type, payload = {}) {
      const fn = Object.prototype.hasOwnProperty.call(acts, type) ? acts[type] : null;
      if (!fn) return { ok: false, code: 'unknown' };
      tickNo++;
      if (dirty) derive();
      try {
        const r = fn(payload || {});
        derive();
        return r;
      } catch (e) {
        return { ok: false, code: 'error', msg: String(e && e.message) };
      }
    },
    quote(type, p = {}) {
      if (dirty) derive();
      const line = lineById[p.lineId], ls = state.lines[p.lineId];
      const no = { cost: Infinity, qty: 0, affordable: false };
      const q = (cost, extra) => ({ cost, qty: 1, affordable: isFinite(cost) && state.cash >= cost, ...extra });
      switch (type) {
        case 'unlock': return line ? q(ls.lv > 0 ? Infinity : line.baseCost, { locked: !state.districts.includes(line.district) }) : no;
        case 'level': {
          if (!line) return no;
          const lv = Math.max(1, ls.lv);
          const qty = p.qty === 'max' ? Math.max(1, E.maxAffordable(line, lv, state.cash, costMult(line.id))) : Math.max(1, p.qty | 0 || 1);
          const cost = E.bulkCost(line, lv, qty, costMult(line.id));
          return { cost, qty, affordable: ls.lv > 0 && state.cash >= cost, after: lv + qty };
        }
        case 'throughput': {
          const n = line && line.throughput[ls.thr];
          return n ? q(n.cost, { glyph: n.glyph, name: n.name, sigma: n.sigma, step: ls.thr }) : no;
        }
        case 'storage': return line && ls.sto < line.storage.length ? q(line.storage[ls.sto], { step: ls.sto }) : no;
        case 'boost': {
          const n = line && line.boosts[ls.boost];
          return n ? q(n.cost, { glyph: n.glyph, name: n.name, mult: n.mult, step: ls.boost }) : no;
        }
        case 'hire': {
          if (!line) return no;
          const def = p.managerId ? mgrById[p.managerId] : managerFor(data, line.id);
          if (!def || ls.mgr === def.id) return no;
          return q(state.managers[def.id] ? 0 : def.hireCost, { owned: !!state.managers[def.id], managerId: def.id });
        }
        case 'permit': {
          const d = districtById[p.districtId];
          if (!d || state.districts.includes(d.id)) return no;
          const block = permitBlock(d);
          return { cost: d.permitCost, qty: 1, affordable: !block && state.cash >= d.permitCost, blocked: block };
        }
        default: return no;
      }
    },
    stats(lineId) {
      if (statsTick !== tickNo) { statsTick = tickNo; for (const k in statsCache) statsCache[k]._fresh = false; if (dirty) derive(); }
      let s = statsCache[lineId];
      if (s && s._fresh) return s;
      const line = lineById[lineId], ls = state.lines[lineId];
      if (!line) return null;
      s = statsCache[lineId] || (statsCache[lineId] = {});
      const d = D[lineId];
      s.owned = ls.lv > 0;
      s.level = ls.lv;
      s.managed = !!ls.mgr;
      s.managerId = ls.mgr;
      s.manager = ls.mgr ? mgrById[ls.mgr] : null;
      s.sigma = s.owned ? d.sigma : 0;
      s.sigmaUpgrades = ls.thr;
      s.grossPerSec = s.owned ? d.P : 0;
      s.rate = s.grossPerSec;
      s.perSec = s.owned ? (d.auto ? d.P : d.P * d.sigma) : 0;
      s.shelfCap = d.cap;
      s.stock = ls.stock;
      s.stockRatio = d.cap > 0 ? Math.min(1, ls.stock / d.cap) : 0;
      s.cycle01 = ls.cyc % 1;
      s.cycleSec = Math.round(d.cycleSec * 100) / 100;
      s.boostMult = s.owned ? d.m : 1;
      s.milestoneMult = E.milestoneMult(ls.lv, X);
      s.nextMilestone = E.nextMilestone(ls.lv, X);
      s.visualTier = E.visualTier(ls.lv);
      s.full = s.owned && d.cap > 0 && ls.stock >= d.cap - 1e-9;
      s.unlockable = !s.owned && state.districts.includes(line.district);
      s.districtOpen = state.districts.includes(line.district);
      s.nextThroughput = line.throughput[ls.thr] || null;
      s.nextBoost = line.boosts[ls.boost] || null;
      s.boosts = ls.boost;
      s.storageLevel = ls.sto;
      s.harvest = !!state.returnHarvest[lineId];
      s.crit = d.crit;
      s.earned = ls.earned;
      s.autoPile = d.auto;
      s._fresh = true;
      return s;
    },
    totals() {
      if (dirty) derive();
      return {
        incomePerSec: G.incomePerSec, grossPerSec: G.gross, tapValue: tapValue(),
        comboMult: E.comboMult(simTime - state.combo.last <= X.comboWindow ? state.combo.n : 0, X), offlineCapSec: G.offlineCap,
      };
    },
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type).delete(fn);
    },
    advanceOffline(seconds) {
      const wallNow = nowWall();
      const want = Math.max(0, +seconds || 0);
      let avail = want;
      let clockBack = false;
      if (wallNow > 0) {
        const start = Math.max(wallNow - want * 1000, state.clock.hi || 0);
        avail = Math.max(0, (wallNow - start) / 1000);
        clockBack = wallNow < (state.clock.hi || 0);
      }
      derive();
      const cap = G.offlineCap;
      const sec = Math.min(cap, avail);
      const empty = { awaySec: want, creditedSec: 0, cash: 0, lines: {}, piles: 0, harvest: [], capSec: cap, clockBack };
      if (sec < 5) { if (sec > 0) game.tick(Math.min(1, sec)); return empty; }
      const report = offlineClosedForm(D, state, sec);
      report.awaySec = want;
      report.creditedSec = sec;
      report.capSec = cap;
      report.capped = avail > cap;
      report.clockBack = clockBack;
      earn(report.cash);
      simTime += sec;
      const ev = state.events;
      ev.nextFrequent = Math.max(ev.nextFrequent, simTime + 20);
      ev.nextSpecial = Math.max(ev.nextSpecial, simTime + 60);
      ev.courierNext = Math.max(ev.courierNext, simTime + 10);
      expireEvents();
      state.combo.n = 0;
      report.harvest = [];
      if (sec >= 60) {
        for (const id of ownedIds()) if (state.lines[id].stock > 0) { state.returnHarvest[id] = true; report.harvest.push(id); }
      }
      if (wallNow > 0) state.clock.hi = Math.max(state.clock.hi || 0, wallNow);
      dirty = true;
      tickNo++;
      emit('offline', { report });
      return report;
    },
    serialize() {
      return JSON.stringify({ game: GAME_ID, v: SAVE_VERSION, build: data.build || '', savedAt: nowWall(), simTime, seed, s: state });
    },
  };
  derive();
  return game;
}
