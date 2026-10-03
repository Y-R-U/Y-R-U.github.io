import * as E from './economy.js?v=20261004b';
import { newLineState, stepLine, sellPile } from './lines.js?v=20261004b';
import { pickEvent, nextGap, mulberry32, rushTier } from './events.js?v=20261004b';
import { offlineClosedForm } from './offline.js?v=20261004b';
import { SAVE_VERSION } from './save.js?v=20261004b';
import { managerSlots, newManagerState, openCrate, equip, unequip, merge, autoEquip, equippedCount, fitSlots } from './managers.js?v=20261004b';
import { newLife, addXp, stepLife, stepKidWork } from './life.js?v=20261004b';
import { contractsView, rollDaily, dailyView, giftView, statValue } from './goals.js?v=20261004b';
import { retirePreview, legacyMult } from './prestige.js?v=20261004b';
import { seasonLive, seasonYear, newSeasonState, seasonLineRate, seasonLevelCost, seasonMaxAffordable, seasonMult, seasonAvgMult } from './season.js?v=20261004b';
import { ECON, LINES, TALENTS } from '../data/lines.js?v=20261004b';
import { DISTRICTS, COURIER, SUPPLY, NIGHT } from '../data/districts.js?v=20261004b';
import { MANAGERS, MANAGER_LEVELS } from '../data/managers.js?v=20261004b';
import { ITEMS, RARITIES, RARITY_SCORE, CRATES } from '../data/items.js?v=20261004b';
import { EVENTS, EVENT_GAP, SPECIAL_GAP } from '../data/events.js?v=20261004b';
import { HOUSING, PARTNERS, PARTNER_NAMES, KID_NAMES, HEIR_NAMES, LIFE, LEGACY } from '../data/housing.js?v=20261004b';
import { CONTRACTS, DAILY_POOL, DAILY_REWARD, DAILY_BONUS, GIFT } from '../data/contracts.js?v=20261004b';
import { SEASONS, KEEPSAKES, KEEPSAKE_TARGET } from '../data/seasons.js?v=20261004b';
import { ACHIEVEMENTS, ACHIEVEMENT_MULT } from '../data/achievements.js?v=20261004b';

const STEP = 0.1;

export const DEFAULT_DATA = {
  econ: ECON, lines: LINES, talents: TALENTS,
  districts: DISTRICTS, courier: COURIER, supply: SUPPLY, night: NIGHT,
  managers: MANAGERS, managerLevels: MANAGER_LEVELS,
  items: ITEMS, rarities: RARITIES, rarityScore: RARITY_SCORE, crates: CRATES,
  events: EVENTS, eventGap: EVENT_GAP, specialGap: SPECIAL_GAP,
  housing: HOUSING, partners: PARTNERS, partnerNames: PARTNER_NAMES, kidNames: KID_NAMES, heirNames: HEIR_NAMES, life: LIFE, legacy: LEGACY,
  contracts: CONTRACTS, dailyPool: DAILY_POOL, dailyReward: DAILY_REWARD, dailyBonus: DAILY_BONUS, gift: GIFT,
  seasons: SEASONS, keepsakes: KEEPSAKES, keepsakeTarget: KEEPSAKE_TARGET,
  achievements: ACHIEVEMENTS, achievementMult: ACHIEVEMENT_MULT,
};

const STATS0 = {
  taps: 0, cans: 0, pileTaps: 0, harvests: 0, events: 0, pigeons: 0, levels: 0, upgrades: 0, couriers: 0,
  rush: 0, rushGold: 0, merges: 0, comboMax: 0, crits: 0, postcards: 0, plays: 1,
};

export function freshState(data, seed = 1) {
  const lines = {};
  for (const l of data.lines) lines[l.id] = newLineState();
  return {
    seed,
    cash: 0, tickets: 0, lifetime: 0,
    lines,
    districts: ['oldtown'],
    managers: {}, items: [], itemSeq: 0,
    housing: 0, contracts: {},
    events: { nextPigeon: 45, nextSpecial: 200, active: [], mults: [], seq: 0, order: null, courierNext: 20 },
    couriers: [],
    supply: { on: false, from: null, since: 0 },
    nightShift: [],
    combo: { n: 0, last: -99 },
    life: newLife(),
    family: { gen: 1, name: 'You', portraits: [], landmarks: [], legacy: 0, floor: 1, allTime: 0, heirlooms: [], talent: null, districts: ['oldtown'] },
    bootstrap: { cans: 0, done: false },
    returnHarvest: {},
    goals: { daily: null, gift: { step: 0, last: null } },
    achievements: {}, keepsakes: {}, seasons: {},
    settings: { tier: 'auto', sound: true, reducedMotion: false, qty: 1 },
    stats: { ...STATS0 },
    hints: {},
    clock: { hi: 0 },
  };
}

function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }

function normalize(s, fresh, data) {
  const out = fresh;
  for (const k in s) {
    if (k === 'lines') continue;
    if (isObj(out[k]) && isObj(s[k]) && !['managers', 'contracts', 'achievements', 'keepsakes', 'seasons', 'returnHarvest', 'hints'].includes(k)) out[k] = Object.assign(out[k], s[k]);
    else out[k] = s[k];
  }
  for (const l of data.lines) out.lines[l.id] = Object.assign(newLineState(), s.lines?.[l.id] || {});
  out.stats = Object.assign({ ...STATS0 }, s.stats || {});
  for (const k of ['districts', 'items', 'nightShift', 'couriers']) if (!Array.isArray(out[k])) out[k] = fresh[k] || [];
  if (!out.districts.includes('oldtown')) out.districts.unshift('oldtown');
  out.life = Object.assign(newLife(), s.life || {});
  if (!Array.isArray(out.life.kids)) out.life.kids = [];
  for (const k of out.life.kids) {
    k.work = k.work || {}; k.workSec = k.workSec || 0;
    if (!isFinite(k.bornXp)) k.bornXp = out.life.xp - (k.kidAge || 0) / data.life.xpYears;
  }
  if ('nextBirthAge' in out.life) { delete out.life.nextBirthAge; out.life.nextBirthXp = null; }
  for (const m of Object.values(out.managers)) { m.level = m.level || 1; m.slots = Array.isArray(m.slots) ? m.slots : [null]; }
  for (const it of out.items) if (it.equipped && !out.managers[it.equipped]) it.equipped = null;
  out.itemSeq = Math.max(out.itemSeq || 0, ...out.items.map((i) => +String(i.id).slice(1) || 0));
  out.events.active = Array.isArray(out.events.active) ? out.events.active : [];
  out.events.mults = Array.isArray(out.events.mults) ? out.events.mults : [];
  return out;
}

export function createGame({ data: given = {}, save = null, seed = 1, rng = null, nowWall = () => 0, allowCheat = false } = {}) {
  const data = { ...DEFAULT_DATA, ...given };
  if (given.econ) data.econ = { ...ECON, ...given.econ };
  if (given.life) data.life = { ...LIFE, ...given.life };
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
  const itemById = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const districtById = Object.fromEntries(data.districts.map((d) => [d.id, d]));
  const subs = new Map();
  const D = {};
  for (const l of data.lines) D[l.id] = { P: 0, Pbase: 0, sigma: 0, cap: 0, speed: 1, cycleSec: l.cycleSec, crit: 0, night: false, auto: false, offlineMult: 1, price: 1, m: 1 };
  const G = { mult: 1, costMult: 1, offlineCap: 3600, incomePerSec: 0, gross: 0, eventMult: 1, legacy: 1, charCrit: 0 };
  const wasFull = {}, pendSold = {}, tipped = new Set();
  let wallNow = nowWall(), hourNow = E.hourOf(wallNow), nightNow = false;
  let tickNo = 0, statsTick = -1, acc = 0, slowAcc = 1, dirty = true;
  const statsCache = {};

  function emit(type, payload) {
    const set = subs.get(type);
    if (set) for (const fn of [...set]) { try { fn(payload); } catch (e) { /* listeners never break the sim */ } }
  }

  function earn(cash) {
    if (!(cash > 0)) return;
    state.cash += cash;
    state.lifetime += cash;
    state.family.allTime += cash;
  }

  function itemStats(mgrId, out) {
    out.speed = 0; out.price = 0; out.shelf = 0; out.sigma = 0; out.crit = 0; out.offline = 0;
    if (!mgrId) return out;
    const m = state.managers[mgrId];
    if (!m) return out;
    for (const id of m.slots) {
      if (!id) continue;
      const it = state.items.find((x) => x.id === id);
      const def = it && itemById[it.def];
      if (def) out[def.stat] += def.values[it.rarity];
    }
    return out;
  }
  const IS = {}, HS = { speed: 0, price: 0, shelf: 0, sigma: 0, crit: 0, offline: 0 };

  function keepsakePower(kind, id) {
    let p = 0;
    for (const k in state.keepsakes) {
      const t = state.keepsakes[k].target;
      if (t && t.kind === kind && (kind === 'character' || t.id === id)) p += (data.keepsakes[k]?.power || 0) * (data.keepsakeTarget[kind] || 1);
    }
    return p;
  }

  function derive() {
    dirty = false;
    const L = data.legacy, fam = state.family, life = state.life;
    const house = data.housing[life.homeTier] || data.housing[0];
    const partner = life.partner ? data.partners.find((p) => p.id === life.partner.id) : null;
    const talent = fam.talent ? data.talents[fam.talent] : null;
    for (const k in HS) HS[k] = 0;
    for (const h of fam.heirlooms) { const d = itemById[h.def]; if (d) HS[d.stat] += d.values[h.rarity] || 0; }
    G.legacy = legacyMult(fam.legacy, fam.floor, L);
    let museums = 0;
    for (const lm of fam.landmarks) if (lm.kind === 'museum') museums++;
    let ach = 0;
    for (const k in state.achievements) if (state.achievements[k]) ach++;
    let gm = house.mult * (partner?.mult || 1) * G.legacy;
    gm *= 1 + L.portrait * fam.portraits.length + L.museum * museums;
    gm *= 1 + data.achievementMult * ach;
    gm *= 1 + keepsakePower('character');
    G.mult = gm;
    G.costMult = (partner?.cost || 1) * (talent?.cost || 1);
    G.eventMult = talent?.events || 1;
    let offline = house.offlineCapSec + (partner?.offlineSec || 0) + (talent?.offlineSec || 0) + HS.offline;
    let allEv = 1;
    for (const e of state.events.mults) if (!e.lineId && e.until > simTime) allEv *= e.mult;
    nightNow = E.inWindow(hourNow, data.night.from, data.night.to);
    let inc = 0, gross = 0;
    const kidsOn = {};
    for (const k of life.kids) if (k.workedLine && (k.stage === 'kid' || k.stage === 'teen')) kidsOn[k.workedLine] = true;
    for (const l of data.lines) {
      const ls = state.lines[l.id], d = D[l.id];
      if (ls.lv <= 0) { d.P = d.Pbase = d.sigma = d.cap = 0; d.auto = false; continue; }
      const mid = ls.mgr, mdef = mid ? mgrById[mid] : null, mst = mid ? state.managers[mid] : null;
      const it = itemStats(mid, IS);
      const tk = mdef ? mdef.kind : null, tv = mdef ? mdef.value : 0;
      const speed = 1 + it.speed + HS.speed + (tk === 'speed' ? tv : 0);
      let price = E.priceMult(ls.thr, X) * (1 + it.price + HS.price);
      let sigma = X.sigmaWalkIn;
      if (mid) {
        const s0 = E.sigmaBase(ls.thr, X) + it.sigma + HS.sigma + (tk === 'sigma' ? tv : 0);
        if (s0 > 1) price *= s0;
        sigma = Math.min(1, s0);
      }
      let m = ls.lv * l.rate * E.milestoneMult(ls.lv, X) * E.boostMult(l, ls.boost) * price * speed;
      if (mst) m *= data.managerLevels.mult[Math.min(data.managerLevels.mult.length, mst.level) - 1];
      if (tk === 'morning' && hourNow >= 6 && hourNow < 12) m *= 1 + tv;
      if (tk === 'dog' && life.dog) m *= 1 + tv;
      if (tk === 'star' && ls.lv >= 50) m *= 1 + tv;
      if (tk === 'night' && nightNow) m *= 1 + tv;
      m *= 1 + keepsakePower('line', l.id) + (mid ? keepsakePower('manager', mid) : 0);
      if (kidsOn[l.id]) m *= data.life.kidWorkMult;
      for (const lm of fam.landmarks) if (lm.kind === 'plaque' && lm.lineId === l.id) m *= 1 + L.plaque;
      if (talent?.lines?.includes(l.id)) m *= talent.mult;
      if (l.id === data.supply.to && state.supply.on && state.lines[state.supply.from]?.lv > 0) m *= data.supply.mult;
      m *= gm;
      const crit = Math.min(X.critCap, it.crit + HS.crit);
      m *= 1 + crit * (X.saleCritMult - 1);
      let ev = allEv;
      for (const e of state.events.mults) if (e.lineId === l.id && e.until > simTime) ev *= e.mult;
      d.night = state.nightShift.includes(l.id);
      d.Pbase = m;
      d.P = m * ev * (d.night && nightNow ? data.night.mult : 1);
      d.m = m / (ls.lv * l.rate);
      d.sigma = sigma;
      d.speed = speed;
      d.cycleSec = l.cycleSec / speed;
      d.crit = crit;
      d.price = price;
      d.auto = tk === 'autopile' && !!mid;
      d.cap = E.shelfCap(m, ls.sto, (1 + it.shelf + HS.shelf) * (tk === 'shelf' ? 1 + tv : 1), X);
      d.offlineMult = 1;
      if (mid && (tk === 'offline' || mdef.offline)) offline += mdef.offline || tv;
      if (mid) offline += it.offline;
      gross += d.P;
      inc += d.auto ? d.P : d.P * sigma;
    }
    G.offlineCap = Math.min(24 * 3600, offline);
    G.incomePerSec = inc;
    G.gross = gross;
  }

  function costMult(lineId) {
    let c = G.costMult;
    const mid = lineId && state.lines[lineId]?.mgr;
    if (mid && mgrById[mid]?.kind === 'cost') c *= 1 - mgrById[mid].value;
    return c;
  }

  function rewardBase(lineId) {
    let b = Math.max(G.incomePerSec, G.gross * 0.6, 1) * G.eventMult;
    const mid = lineId && state.lines[lineId]?.mgr;
    if (mid && mgrById[mid]?.kind === 'events') b *= 1 + mgrById[mid].value;
    return b;
  }

  function tapValue() {
    return X.tapK * Math.max(G.gross, 0.1);
  }

  function ownedIds(filter) {
    const out = [];
    for (const l of data.lines) if (state.lines[l.id].lv > 0 && (!filter || filter(l))) out.push(l.id);
    return out;
  }

  function pickLine(filter) {
    const ids = ownedIds(filter);
    return ids.length ? ids[Math.floor(rng() * ids.length)] : null;
  }

  function bestLine() {
    let best = null, p = -1;
    for (const id of ownedIds()) if (D[id].Pbase > p) { p = D[id].Pbase; best = id; }
    return best;
  }

  function grantReward(r, source) {
    const out = { tickets: 0, items: [], cash: 0 };
    if (!r) return out;
    if (r.tickets) { state.tickets += r.tickets; out.tickets = r.tickets; }
    if (r.crate) out.items = openCrate(state, data, r.crate, rng);
    if (r.cashSec) { out.cash = rewardBase() * r.cashSec; earn(out.cash); }
    for (const it of out.items) emit('item', { item: it, source });
    return out;
  }

  function spawnEvents() {
    const ev = state.events;
    if (simTime >= ev.nextPigeon) {
      ev.nextPigeon = simTime + nextGap(data.eventGap, rng);
      if (!ev.active.some((e) => e.kind === 'pigeon')) {
        const def = data.events.find((d) => d.id === 'pigeon');
        const e = { id: 'e' + ++ev.seq, kind: 'pigeon', emoji: def.emoji, name: def.name, lineId: null, born: simTime, expires: simTime + def.lifeSec };
        ev.active.push(e);
        emit('event:spawn', { event: e });
      }
    }
    if (simTime >= ev.nextSpecial) {
      ev.nextSpecial = simTime + nextGap(data.specialGap, rng);
      if (ev.active.some((e) => e.kind !== 'pigeon') || ev.order) return;
      const def = pickEvent(data.events, rng, (d) => !d.district || state.districts.includes(d.district));
      if (!def) return;
      const e = { id: 'e' + ++ev.seq, kind: def.id, emoji: def.emoji, name: def.name, lineId: def.id === 'parade' || def.id === 'wallet' || def.id === 'lucky' ? null : pickLine(), born: simTime, expires: simTime + def.lifeSec };
      if (def.game) e.game = def.game;
      ev.active.push(e);
      emit('event:spawn', { event: e });
    }
  }

  function expireEvents() {
    const ev = state.events;
    for (let i = ev.active.length - 1; i >= 0; i--) {
      const e = ev.active[i];
      if (e.expires > simTime) continue;
      ev.active.splice(i, 1);
      if (e.kind === 'pigeon' && state.life.dog && rng() < data.life.dogPigeonChance) {
        const r = claim(e, 0);
        emit('event:claim', { event: e, reward: r, by: 'dog' });
      } else emit('event:expire', { event: e });
    }
    if (ev.mults.length && ev.mults.some((m) => m.until <= simTime)) {
      ev.mults = ev.mults.filter((m) => m.until > simTime);
      dirty = true;
    }
    const o = ev.order;
    if (o && o.until <= simTime) { ev.order = null; emit('order:expire', { order: o }); }
  }

  function stepCouriers() {
    if (!state.districts.includes('suburbs') || !state.bootstrap.done) return;
    const ev = state.events;
    for (let i = state.couriers.length - 1; i >= 0; i--) {
      if (state.couriers[i].t1 <= simTime) emit('courier:gone', { courier: state.couriers.splice(i, 1)[0] });
    }
    if (simTime >= ev.courierNext) {
      ev.courierNext = simTime + nextGap(data.courier.gap, rng);
      const lineId = pickLine((l) => l.district === 'suburbs') || pickLine();
      if (!lineId) return;
      const c = { id: 'c' + ++ev.seq, lineId, t0: simTime, t1: simTime + data.courier.life };
      state.couriers.push(c);
      emit('courier:spawn', { courier: c });
    }
  }

  function orderProgress(lineId, cash) {
    const o = state.events.order;
    if (!o || o.lineId !== lineId) return;
    o.got += cash;
    if (o.got >= o.need) {
      state.events.order = null;
      const cashR = rewardBase(lineId) * o.cashSec;
      earn(cashR);
      const r = grantReward({ crate: o.crate }, 'order');
      emit('order:done', { order: o, cash: cashR, items: r.items });
    }
  }

  function seasonDef() {
    for (const s of data.seasons) if (seasonLive(s, wallNow)) return s;
    return null;
  }

  function seasonState(def) {
    const y = seasonYear(wallNow);
    let st = state.seasons[def.id];
    if (!st || st.year !== y) {
      const keepInside = st?.inside;
      st = state.seasons[def.id] = Object.assign(newSeasonState(def, y), { claimed: [] });
      st.inside = !!keepInside;
    }
    return st;
  }

  function seasonRate(def, st, away, mult = seasonMult(def, wallNow)) {
    let r = 0;
    for (const l of def.lines) r += seasonLineRate(def, l, st.lines[l.id]);
    return r * mult * (st.inside && !away ? 1 : def.awayRate);
  }

  function seasonGain(def, st, candy) {
    st.candy += candy;
    st.xp += candy;
    while (st.rank < def.ranks.length && st.xp >= def.ranks[st.rank].xp) {
      const rk = def.ranks[st.rank];
      st.rank++;
      const rw = rk.reward, got = grantReward(rw, 'season');
      if (rw.keepsake && !state.keepsakes[rw.keepsake]) state.keepsakes[rw.keepsake] = { target: { kind: 'character' }, crossGame: !!data.keepsakes[rw.keepsake]?.crossGame, season: def.id, year: st.year };
      if (rw.manager && !state.managers[rw.manager]) state.managers[rw.manager] = newManagerState(data.managerLevels);
      if (rw.title) state.family.title = rw.title;
      dirty = true;
      emit('season', { kind: 'rank', seasonId: def.id, rank: st.rank, reward: rw, items: got.items });
    }
    st.xpNext = st.rank < def.ranks.length ? def.ranks[st.rank].xp : null;
  }

  function stepSeason(h) {
    const def = seasonDef();
    if (!def) return;
    const st = seasonState(def);
    const r = seasonRate(def, st, false);
    for (const l of def.lines) { const ls = st.lines[l.id]; if (ls.lv > 0) ls.cyc = (ls.cyc + h / l.cycleSec) % 1; }
    if (r > 0) seasonGain(def, st, r * h);
  }

  function slowStep() {
    const before = state.life.age;
    if (state.bootstrap.done) addXp(state.life, data.life, data.life.xp.perMinute / 60);
    stepLife(state, data, rng, emitLife, bestLine());
    if (state.life.age !== before) dirty = true;
    const day = E.dayKey(wallNow);
    if (!state.goals.daily || state.goals.daily.day !== day) rollDaily(state, data, day);
    for (const a of data.achievements) {
      if (state.achievements[a.id]) continue;
      if (statValue(state, data, a.stat) >= a.n) {
        state.achievements[a.id] = true;
        dirty = true;
        emit('achievement', { id: a.id, achievement: a });
      }
    }
  }

  function emitLife(type, p) {
    if (type === 'life:beat') dirty = true;
    emit(type, p);
  }

  function step(h) {
    simTime += h;
    derive();
    const pile = X.pileMult;
    for (const l of data.lines) {
      const ls = state.lines[l.id];
      if (ls.lv <= 0) continue;
      const d = D[l.id];
      const sold = stepLine(ls, d, h);
      if (sold > 0) {
        earn(sold);
        ls.earned += sold;
        pendSold[l.id] = (pendSold[l.id] || 0) + sold;
        orderProgress(l.id, sold);
      }
      if (d.auto && ls.stock >= d.cap - 1e-9 && ls.stock > 0) {
        const cash = sellPile(ls, pile);
        earn(cash);
        ls.earned += cash;
        orderProgress(l.id, cash);
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
    stepKidWork(state, h, lineById);
    expireEvents();
    if (state.bootstrap.done) spawnEvents();
    stepCouriers();
    stepSeason(h);
    slowAcc += h;
    if (slowAcc >= 1) { slowAcc = 0; slowStep(); }
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
    if (state.family.districts.includes(d.id)) return null;
    const idx = data.districts.indexOf(d);
    const prev = data.districts[idx - 1];
    if (prev && !state.districts.includes(prev.id)) return 'Open ' + prev.name + ' first';
    if (prev && gateContracts(d).done < d.needContracts) return `Finish ${d.needContracts} ${prev.name} contracts`;
    return null;
  }

  function gateContracts(d) {
    const idx = data.districts.indexOf(d), prev = data.districts[idx - 1];
    const out = { done: 0, need: d.needContracts || 0, autoClaim: [], district: prev?.id || null };
    if (!prev) return out;
    for (const c of contractsView(state, data, equippedCount(state))) {
      if (c.district !== prev.id || !c.done) continue;
      out.done++;
      if (!c.claimed) out.autoClaim.push(c.id);
    }
    return out;
  }

  function claimContractNow(c) {
    state.contracts[c.id] = 'claimed';
    const got = grantReward(c.reward, 'contract');
    emit('contract', { id: c.id, reward: c.reward, items: got.items });
    return got;
  }

  function permitCost(d) {
    return state.family.districts.includes(d.id) ? 0 : d.permitCost * G.costMult;
  }

  function assignManager(lineId, managerId) {
    for (const l of data.lines) if (state.lines[l.id].mgr === managerId && l.id !== lineId) state.lines[l.id].mgr = null;
    state.lines[lineId].mgr = managerId;
    fitSlots(state.managers[managerId], data.managerLevels);
  }

  function claim(e, score) {
    const def = data.events.find((d) => d.id === e.kind) || {};
    const r = def.reward || {};
    const base = rewardBase(e.lineId);
    const out = { cash: 0, tickets: 0, items: [] };
    if (r.kind === 'cashSec') {
      out.jackpot = rng() < (r.jackpot || 0);
      out.cash = base * r.sec * (out.jackpot ? r.jackpotMult : 1);
      earn(out.cash);
      if (e.kind === 'pigeon') state.stats.pigeons++;
    } else if (r.kind === 'lineMult') {
      state.events.mults.push({ lineId: e.lineId, mult: r.mult, until: simTime + r.sec });
      out.mult = r.mult; out.sec = r.sec;
    } else if (r.kind === 'allMult') {
      state.events.mults.push({ lineId: null, mult: r.mult, until: simTime + r.sec });
      out.mult = r.mult; out.sec = r.sec;
    } else if (r.kind === 'tickets') {
      state.tickets += r.n;
      out.tickets = r.n;
    } else if (r.kind === 'order') {
      const lineId = e.lineId || pickLine();
      if (lineId) {
        derive();
        state.events.order = { lineId, need: r.needSec * Math.max(D[lineId].Pbase, 0.1), got: 0, until: simTime + r.windowSec, cashSec: r.cashSec, crate: r.crate };
        out.order = state.events.order;
        emit('order', { order: out.order });
      }
    } else if (r.kind === 'rush') {
      const s = Math.max(0, Math.min(def.game.max, Math.floor(+score || 0)));
      out.tier = rushTier(r.tiers, s);
      out.cash = base * r.cashSec * (s / def.game.max);
      earn(out.cash);
      out.items = grantReward({ crate: out.tier }, 'rush').items;
      state.stats.rush++;
      if (out.tier === 'gold') state.stats.rushGold++;
      out.score = s;
    } else if (r.kind === 'lucky') {
      const s = Math.max(0, Math.floor(+score || 0));
      out.score = s;
      if (s >= def.game.hits) out.items = grantReward({ crate: r.crate }, 'lucky').items;
    }
    state.stats.events++;
    dirty = true;
    return out;
  }

  const acts = {
    pickCan() {
      state.bootstrap.cans++;
      state.stats.cans++;
      emit('tap', { kind: 'can', cans: state.bootstrap.cans });
      return { ok: true };
    },
    cashCans() {
      const n = state.bootstrap.cans;
      if (!n) return fail('empty', 'No cans yet');
      state.bootstrap.cans = 0;
      const cash = n * X.canValue;
      earn(cash);
      emit('cans', { cans: n, cash });
      return { ok: true, delta: { cash } };
    },
    tap(p) {
      state.stats.taps++;
      if (!state.bootstrap.done) return acts.pickCan(p);
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
      orderProgress(lineId, cash);
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
    miniStart({ eventId }) {
      const e = state.events.active.find((x) => x.id === eventId);
      if (!e || !e.game) return fail('gone');
      if (!e.started) e.started = simTime;
      e.expires = Math.max(e.expires, simTime + (e.game.sec || 10) + 15);
      emit('event:start', { event: e });
      return { ok: true, event: e };
    },
    unlock({ lineId }) {
      const line = lineById[lineId], ls = state.lines[lineId];
      if (!line) return fail('bad');
      if (ls.lv > 0) return fail('owned');
      if (!state.districts.includes(line.district)) return fail('locked', 'District locked');
      const r = pay(line.baseCost * G.costMult, () => {
        ls.lv = 1;
        if (!state.bootstrap.done) { state.bootstrap.done = true; state.events.nextPigeon = simTime + 45; state.events.nextSpecial = simTime + 200; }
        const own = data.managers.find((m) => m.lineId === lineId && state.managers[m.id] && !m.seasonal);
        if (own) assignManager(lineId, own.id);
        addXp(state.life, data.life, data.life.xp.unlock);
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
      const crossed = E.milestoneCount(ls.lv, X) - E.milestoneCount(before, X);
      if (crossed > 0) {
        addXp(state.life, data.life, data.life.xp.milestone * crossed);
        for (const t of X.milestones) if (t > before && t <= ls.lv) emit('milestone', { lineId, level: t, mult: X.milestoneMult });
      }
      if (E.visualTier(ls.lv) !== tierBefore) emit('tier', { lineId, tier: E.visualTier(ls.lv) });
      emit('bought', { lineId, kind: 'level', qty: n, level: ls.lv });
      return { ...r, qty: n, level: ls.lv };
    },
    throughput({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const next = line.throughput[ls.thr];
      if (!next) return fail('max', 'Fully staffed');
      const r = pay(next.cost * G.costMult, () => { ls.thr++; });
      if (r.ok) { state.stats.upgrades++; emit('bought', { lineId, kind: 'throughput', glyph: next.glyph, name: next.name, sigma: next.sigma }); }
      return { ...r, glyph: next.glyph, name: next.name };
    },
    storage({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      if (ls.sto >= line.storage.length) return fail('max');
      const r = pay(line.storage[ls.sto] * G.costMult, () => { ls.sto++; });
      if (r.ok) { state.stats.upgrades++; emit('bought', { lineId, kind: 'storage', level: ls.sto }); }
      return r;
    },
    boost({ lineId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const next = line.boosts[ls.boost];
      if (!next) return fail('max');
      const r = pay(next.cost * G.costMult, () => { ls.boost++; });
      if (r.ok) { state.stats.upgrades++; emit('bought', { lineId, kind: 'boost', glyph: next.glyph, name: next.name, mult: next.mult }); }
      return { ...r, glyph: next.glyph, name: next.name };
    },
    hire({ lineId, managerId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const def = managerId ? mgrById[managerId] : data.managers.find((m) => m.lineId === lineId && !m.seasonal);
      if (!def || def.lineId !== lineId) return fail('bad');
      if (ls.mgr === def.id) return fail('owned');
      if (state.managers[def.id]) { assignManager(lineId, def.id); dirty = true; emit('bought', { lineId, kind: 'manager', managerId: def.id, cost: 0 }); return { ok: true, delta: { cash: 0 } }; }
      if (def.seasonal) return fail('locked');
      const r = pay(def.hireCost * G.costMult, () => {
        state.managers[def.id] = newManagerState(data.managerLevels);
        assignManager(lineId, def.id);
      });
      if (r.ok) emit('bought', { lineId, kind: 'manager', managerId: def.id });
      return r;
    },
    managerLevel({ managerId }) {
      const m = state.managers[managerId], def = mgrById[managerId];
      if (!m || !def) return fail('bad');
      const q = game.quote('managerLevel', { managerId });
      if (!isFinite(q.cost)) return fail('max');
      if (state.tickets < q.tickets) return fail('tickets', 'Need more 🎟️');
      const r = pay(q.cost, () => { state.tickets -= q.tickets; m.level++; fitSlots(m, data.managerLevels); });
      if (r.ok) emit('bought', { kind: 'managerLevel', managerId, level: m.level });
      return r;
    },
    equip({ itemId, target, managerId }) {
      const mid = managerId || (target && target.kind === 'manager' ? target.id : null);
      if (!mid) return fail('bad', 'Items go on managers');
      const err = equip(state, data, data.managerLevels, itemId, mid);
      if (err) return fail(err);
      dirty = true;
      emit('equip', { itemId, managerId: mid });
      return { ok: true };
    },
    unequip({ itemId }) {
      const err = unequip(state, itemId);
      if (err) return fail(err);
      dirty = true;
      emit('equip', { itemId, managerId: null });
      return { ok: true };
    },
    merge({ itemId }) {
      const r = merge(state, itemId, data.rarities.length - 1);
      if (r.err) return fail(r.err);
      if (r.slotOf) equip(state, data, data.managerLevels, r.item.id, r.slotOf);
      state.stats.merges++;
      dirty = true;
      emit('item', { item: r.item, source: 'merge' });
      return { ok: true, item: r.item };
    },
    autoEquip({ managerId } = {}) {
      const ids = managerId ? [managerId] : Object.keys(state.managers).filter((id) => data.lines.some((l) => state.lines[l.id].mgr === id));
      for (const id of ids) {
        const lineId = data.lines.find((l) => state.lines[l.id].mgr === id)?.id;
        const err = autoEquip(state, data, data.managerLevels, id, lineId ? { sigma: D[lineId].sigma, crit: D[lineId].crit, critCap: X.critCap } : null);
        if (err) return fail(err);
      }
      dirty = true;
      emit('equip', { managerId: managerId || null, auto: true });
      return { ok: true };
    },
    claimEvent({ eventId, score }) {
      const ev = state.events;
      const i = ev.active.findIndex((e) => e.id === eventId);
      if (i < 0) return fail('gone');
      const [e] = ev.active.splice(i, 1);
      const reward = claim(e, score);
      emit('event:claim', { event: e, reward });
      return { ok: true, delta: { cash: reward.cash }, reward };
    },
    permit({ districtId }) {
      const d = districtById[districtId];
      if (!d || state.districts.includes(districtId)) return fail('bad');
      const block = permitBlock(d);
      if (block) return fail('locked', block);
      const gate = gateContracts(d);
      const r = pay(permitCost(d), () => {
        const view = contractsView(state, data, equippedCount(state));
        for (const id of gate.autoClaim) claimContractNow(view.find((c) => c.id === id));
        state.districts.push(districtId);
        if (!state.family.districts.includes(districtId)) state.family.districts.push(districtId);
        addXp(state.life, data.life, data.life.xp.permit);
      });
      if (r.ok) { emit('district', { districtId }); emit('bought', { kind: 'permit', districtId }); }
      return r.ok ? { ...r, claimed: gate.autoClaim } : r;
    },
    housing({ tier }) {
      const h = data.housing[tier];
      if (!h || tier !== state.life.homeTier + 1) return fail('bad');
      if (state.life.age < (h.minAge || 0)) return fail('young', `Unlocks at age ${h.minAge}`);
      const r = pay(h.cost * G.costMult, () => {
        state.housing = tier;
        state.life.homeTier = tier;
        state.life.home = h.id;
        addXp(state.life, data.life, h.xp || 0);
      });
      if (r.ok) { emit('life:beat', { kind: 'move', tier, home: h.id }); emit('bought', { kind: 'housing', tier }); }
      return r;
    },
    partner({ choice }) {
      const life = state.life;
      if (life.partner) return fail('owned');
      if (!life.partnerOffer) return fail('locked', 'Move into the Apartment first');
      const ch = life.partnerOffer.choices;
      const p = typeof choice === 'number' ? ch[choice] : ch.find((x) => x.id === choice);
      if (!p) return fail('bad');
      life.partner = { id: p.id, name: p.name, emoji: p.emoji, perk: p.perk, age: life.age };
      life.partnerOffer = null;
      addXp(life, data.life, data.life.xp.partner);
      dirty = true;
      emit('life:beat', { kind: 'partner', choice: p.id, name: p.name });
      return { ok: true, partner: life.partner };
    },
    adoptDog({ name } = {}) {
      const life = state.life;
      if (life.dog) return fail('owned');
      if (!life.dogOffer) return fail('locked');
      life.dog = { name: String(name || 'Biscuit').slice(0, 16), since: state.family.gen };
      addXp(life, data.life, data.life.xp.dog);
      dirty = true;
      emit('life:beat', { kind: 'dog', name: life.dog.name });
      return { ok: true };
    },
    kidWork({ kidId, lineId }) {
      const k = state.life.kids.find((x) => x.id === kidId);
      if (!k || !lineOk(lineId)[0]) return fail('bad');
      if (k.stage !== 'kid' && k.stage !== 'teen') return fail('young', 'Too young to help');
      k.workedLine = lineId;
      dirty = true;
      emit('life:beat', { kind: 'work', kidId, lineId });
      return { ok: true };
    },
    supplyLink({ from }) {
      if (!state.districts.includes('harbour')) return fail('locked');
      const S = data.supply;
      from = from || S.from.find((id) => state.lines[id].lv > 0);
      if (!S.from.includes(from) || !(state.lines[from].lv > 0) || !(state.lines[S.to].lv > 0)) return fail('locked', 'Open Fish & Chips and a boat line');
      if (state.supply.on) { state.supply.from = from; dirty = true; return { ok: true, delta: { cash: 0 } }; }
      const r = pay(lineById[S.to].baseCost * S.costMult * G.costMult, () => { state.supply = { on: true, from, since: simTime }; });
      if (r.ok) emit('bought', { kind: 'supply', lineId: S.to, from });
      return r;
    },
    nightShift({ lineId, on }) {
      if (!state.districts.includes('downtown')) return fail('locked', 'Open Downtown first');
      if (!lineOk(lineId)[0]) return fail('bad');
      const list = state.nightShift.filter((x) => x !== lineId);
      if (on) {
        if (list.length >= data.night.slots) return fail('full', 'Two night shifts at most');
        list.push(lineId);
      }
      state.nightShift = list;
      dirty = true;
      emit('nightShift', { lineId, on: !!on });
      return { ok: true };
    },
    claimContract({ id }) {
      const c = contractsView(state, data, equippedCount(state)).find((x) => x.id === id);
      if (!c || !c.visible) return fail('bad');
      if (c.claimed) return fail('owned');
      if (!c.done) return fail('locked', 'Not done yet');
      return { ok: true, reward: claimContractNow(c) };
    },
    claimDaily({ index }) {
      const d = state.goals.daily;
      const g = d?.goals[index];
      const v = dailyView(state)[index];
      if (!g || !v) return fail('bad');
      if (g.claimed) return fail('owned');
      if (!v.done) return fail('locked');
      g.claimed = true;
      const got = grantReward(data.dailyReward, 'daily');
      if (!d.bonus && d.goals.every((x) => x.claimed)) {
        d.bonus = true;
        got.items.push(...grantReward(data.dailyBonus, 'daily').items);
      }
      emit('daily', { index, items: got.items });
      return { ok: true, reward: got };
    },
    claimGift() {
      const day = E.dayKey(wallNow);
      const g = state.goals.gift;
      if (g.last === day) return fail('owned', 'Come back tomorrow');
      const rw = data.gift[g.step];
      const got = grantReward(rw, 'gift');
      g.last = day;
      g.step = (g.step + 1) % data.gift.length;
      emit('gift', { reward: rw, items: got.items });
      return { ok: true, reward: got };
    },
    retire({ heirId, heirloomItemId }) {
      const pv = retirePreview(state, data.legacy);
      if (!pv.available) return fail('locked', 'Needs a teen heir and the Harbour');
      const life = state.life, fam = state.family, L = data.legacy;
      const teens = life.kids.filter((k) => k.stage === 'teen');
      const heir = life.kids.find((k) => k.id === heirId) || teens[0];
      let best = null, earned = -1;
      for (const id of ownedIds()) if (state.lines[id].earned > earned) { earned = state.lines[id].earned; best = id; }
      const gen = fam.gen;
      const lms = [
        { gen, kind: 'plaque', lineId: best, name: life.name },
        { gen, kind: 'statue', name: life.name },
        { gen, kind: 'museum', homeTier: life.homeTier, name: life.name },
      ];
      fam.portraits.push({ gen, name: life.name, age: life.age, homeTier: life.homeTier, home: data.housing[life.homeTier].id, lineId: best, partner: life.partner?.name || null, kids: life.kids.map((k) => k.name), talent: fam.talent });
      fam.landmarks.push(...lms);
      if (heirloomItemId) {
        const it = state.items.find((x) => x.id === heirloomItemId);
        if (it) {
          if (it.equipped) unequip(state, it.id);
          state.items = state.items.filter((x) => x !== it);
          fam.heirlooms.push({ def: it.def, rarity: it.rarity, gen });
        }
      }
      fam.legacy += pv.legacy;
      fam.floor = Math.max(fam.floor || 1, L.firstFloor);
      fam.gen++;
      fam.talent = heir.talent;
      fam.name = heir.name;
      const keep = {};
      for (const k of ['seed', 'managers', 'items', 'itemSeq', 'tickets', 'contracts', 'achievements', 'keepsakes', 'seasons', 'settings', 'stats', 'hints', 'goals', 'clock', 'family']) keep[k] = state[k];
      const dog = life.dog;
      const fresh = freshState(data, state.seed);
      for (const k in state) delete state[k];
      Object.assign(state, fresh, keep);
      state.life = newLife(heir.name);
      state.life.dog = dog;
      state.districts = fam.districts.slice();
      state.cash = pv.starterCash;
      state.stats.plays++;
      for (const it of state.items) if (it.equipped && !state.managers[it.equipped]) it.equipped = null;
      dirty = true;
      derive();
      emit('life:beat', { kind: 'retire', gen: fam.gen, heir: heir.name, talent: heir.talent });
      for (const lm of lms) emit('landmark', lm);
      emit('retired', { gen: fam.gen, legacy: pv.legacy, mult: pv.nextMult, heir: heir.name });
      return { ok: true, legacy: pv.legacy, mult: pv.nextMult, heir: heir.name };
    },
    seasonEnter({ seasonId } = {}) {
      const def = seasonDef();
      if (!def || (seasonId && seasonId !== def.id)) return fail('locked', 'Not in season');
      seasonState(def).inside = true;
      emit('season', { kind: 'enter', seasonId: def.id });
      return { ok: true };
    },
    seasonLeave() {
      for (const k in state.seasons) state.seasons[k].inside = false;
      emit('season', { kind: 'leave' });
      return { ok: true };
    },
    seasonUnlock({ lineId }) {
      const def = seasonDef();
      const l = def?.lines.find((x) => x.id === lineId);
      if (!l) return fail('bad');
      const st = seasonState(def), ls = st.lines[lineId];
      if (ls.lv > 0) return fail('owned');
      if (st.candy < l.cost) return fail('funds');
      st.candy -= l.cost;
      ls.lv = 1;
      emit('season', { kind: 'unlock', seasonId: def.id, lineId });
      return { ok: true };
    },
    seasonLevel({ lineId, qty = 1 }) {
      const def = seasonDef();
      const l = def?.lines.find((x) => x.id === lineId);
      if (!l) return fail('bad');
      const st = seasonState(def), ls = st.lines[lineId];
      if (ls.lv <= 0) return fail('bad');
      const n = qty === 'max' ? Math.max(1, seasonMaxAffordable(l, ls.lv, st.candy)) : Math.max(1, qty | 0);
      const cost = seasonLevelCost(l, ls.lv, n);
      if (st.candy < cost) return fail('funds');
      st.candy -= cost;
      ls.lv += n;
      emit('season', { kind: 'level', seasonId: def.id, lineId, level: ls.lv });
      return { ok: true, qty: n };
    },
    seasonBoost({ lineId }) {
      const def = seasonDef();
      const l = def?.lines.find((x) => x.id === lineId);
      if (!l) return fail('bad');
      const st = seasonState(def), ls = st.lines[lineId];
      if (ls.lv <= 0 || ls.boost >= def.boostCost.length) return fail('max');
      const cost = def.boostCost[ls.boost] * l.levelCost * 10;
      if (st.candy < cost) return fail('funds');
      st.candy -= cost;
      ls.boost++;
      emit('season', { kind: 'boost', seasonId: def.id, lineId, boost: ls.boost });
      return { ok: true };
    },
    assignKeepsake({ keepsakeId, target }) {
      const k = state.keepsakes[keepsakeId];
      if (!k) return fail('bad');
      if (target && !['character', 'line', 'manager'].includes(target.kind)) return fail('bad');
      if (target?.kind === 'line' && !lineById[target.id]) return fail('bad');
      if (target?.kind === 'manager' && !state.managers[target.id]) return fail('bad');
      k.target = target ? { kind: target.kind, id: target.kind === 'character' ? undefined : target.id } : null;
      dirty = true;
      emit('keepsake', { keepsakeId, target: k.target });
      return { ok: true };
    },
    setting({ key, value }) { state.settings[key] = value; return { ok: true }; },
    hint({ id }) { state.hints[id] = true; return { ok: true }; },
    postcardTaken() { state.stats.postcards++; return { ok: true }; },
    cheat({ cash = 0, unlockAll = false, managers = false, levels = 0, tickets = 0, items = 0 }) {
      if (!allowCheat) return fail('unknown');
      earn(cash);
      state.tickets += tickets;
      for (let i = 0; i < items; i++) openCrate(state, data, 'silver', rng);
      if (unlockAll) {
        state.bootstrap.done = true;
        for (const d of data.districts) {
          if (!state.districts.includes(d.id)) state.districts.push(d.id);
          if (!state.family.districts.includes(d.id)) state.family.districts.push(d.id);
        }
        derive();
        for (const l of data.lines) {
          const ls = state.lines[l.id];
          ls.lv = Math.max(ls.lv, 1 + Math.floor(levels * (1 - l.order / 14)));
          if (managers && !ls.mgr) {
            const def = data.managers.find((m) => m.lineId === l.id && !m.seasonal);
            state.managers[def.id] = state.managers[def.id] || newManagerState(data.managerLevels);
            ls.mgr = def.id;
          }
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
      wallNow = nowWall();
      hourNow = E.hourOf(wallNow);
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
        case 'unlock': return line ? q(ls.lv > 0 ? Infinity : line.baseCost * G.costMult, { locked: !state.districts.includes(line.district) }) : no;
        case 'level': {
          if (!line) return no;
          const lv = Math.max(1, ls.lv);
          const qty = p.qty === 'max' ? Math.max(1, E.maxAffordable(line, lv, state.cash, costMult(line.id))) : Math.max(1, p.qty | 0 || 1);
          const cost = E.bulkCost(line, lv, qty, costMult(line.id));
          return { cost, qty, affordable: ls.lv > 0 && state.cash >= cost, after: lv + qty };
        }
        case 'throughput': {
          const n = line && line.throughput[ls.thr];
          return n ? q(n.cost * G.costMult, { glyph: n.glyph, name: n.name, sigma: n.sigma, step: ls.thr }) : no;
        }
        case 'storage': return line && ls.sto < line.storage.length ? q(line.storage[ls.sto] * G.costMult, { step: ls.sto }) : no;
        case 'boost': {
          const n = line && line.boosts[ls.boost];
          return n ? q(n.cost * G.costMult, { glyph: n.glyph, name: n.name, mult: n.mult, step: ls.boost }) : no;
        }
        case 'hire': {
          if (!line) return no;
          const def = p.managerId ? mgrById[p.managerId] : data.managers.find((m) => m.lineId === line.id && !m.seasonal);
          if (!def || ls.mgr === def.id) return no;
          return q(state.managers[def.id] ? 0 : def.hireCost * G.costMult, { owned: !!state.managers[def.id], managerId: def.id });
        }
        case 'managerLevel': {
          const m = state.managers[p.managerId], def = mgrById[p.managerId];
          const ML = data.managerLevels;
          if (!m || !def || m.level >= ML.max) return no;
          const base = lineById[def.lineId].managerCost;
          const cost = base * ML.cash[m.level] * G.costMult, tickets = ML.tickets[m.level];
          return { cost, tickets, qty: 1, affordable: state.cash >= cost && state.tickets >= tickets, level: m.level + 1 };
        }
        case 'permit': {
          const d = districtById[p.districtId];
          if (!d || state.districts.includes(d.id)) return no;
          const block = permitBlock(d);
          const cost = permitCost(d);
          const reopen = state.family.districts.includes(d.id);
          const gate = gateContracts(d);
          return { cost, qty: 1, affordable: !block && state.cash >= cost, blocked: block, reopen, contracts: reopen ? { ...gate, need: 0, autoClaim: [] } : gate };
        }
        case 'housing': {
          const h = data.housing[p.tier];
          if (!h || p.tier !== state.life.homeTier + 1) return no;
          const young = state.life.age < (h.minAge || 0);
          const out = q(h.cost * G.costMult, { minAge: h.minAge || 0, young });
          if (young) out.affordable = false;
          return out;
        }
        case 'supplyLink': {
          const S = data.supply;
          if (state.supply.on) return { ...no, owned: true };
          const ready = state.districts.includes('harbour') && state.lines[S.to].lv > 0 && S.from.some((id) => state.lines[id].lv > 0);
          const cost = lineById[S.to].baseCost * S.costMult * G.costMult;
          return { cost, qty: 1, affordable: ready && state.cash >= cost, ready };
        }
        case 'retire': {
          const pv = retirePreview(state, data.legacy);
          return { cost: 0, qty: 1, affordable: pv.available, ...pv };
        }
        case 'seasonLevel': {
          const def = seasonDef(), l = def?.lines.find((x) => x.id === p.lineId);
          if (!l) return no;
          const sl = seasonState(def).lines[l.id];
          const lv = Math.max(1, sl.lv), candy = seasonState(def).candy;
          const qty = p.qty === 'max' ? Math.max(1, seasonMaxAffordable(l, lv, candy)) : Math.max(1, p.qty | 0 || 1);
          const cost = seasonLevelCost(l, lv, qty);
          return { cost, qty, affordable: sl.lv > 0 && candy >= cost, token: def.token };
        }
        case 'seasonUnlock': {
          const def = seasonDef(), l = def?.lines.find((x) => x.id === p.lineId);
          if (!l) return no;
          const st = seasonState(def);
          return { cost: st.lines[l.id].lv > 0 ? Infinity : l.cost, qty: 1, affordable: st.lines[l.id].lv <= 0 && st.candy >= l.cost, token: def.token };
        }
        case 'seasonBoost': {
          const def = seasonDef(), l = def?.lines.find((x) => x.id === p.lineId);
          if (!l) return no;
          const st = seasonState(def), sl = st.lines[l.id];
          if (sl.boost >= def.boostCost.length) return no;
          const cost = def.boostCost[sl.boost] * l.levelCost * 10;
          return { cost, qty: 1, affordable: sl.lv > 0 && st.candy >= cost, token: def.token, glyph: l.boosts[sl.boost][0], name: l.boosts[sl.boost][1] };
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
      s.nightShift = d.night;
      s.nightActive = d.night && nightNow;
      s.supply = state.supply.on && (lineId === data.supply.to || lineId === state.supply.from)
        ? { on: true, from: state.supply.from, to: data.supply.to, phase: ((simTime - state.supply.since) % data.supply.loopSec) / data.supply.loopSec }
        : null;
      s.kid = state.life.kids.find((k) => k.workedLine === lineId && (k.stage === 'kid' || k.stage === 'teen'))?.id || null;
      s.plaques = state.family.landmarks.filter((x) => x.kind === 'plaque' && x.lineId === lineId).length;
      s.crit = d.crit;
      s.earned = ls.earned;
      s.autoPile = d.auto;
      s._fresh = true;
      return s;
    },
    totals() {
      if (dirty) derive();
      return {
        incomePerSec: G.incomePerSec, grossPerSec: G.gross, tapValue: tapValue(), comboMult: E.comboMult(simTime - state.combo.last <= X.comboWindow ? state.combo.n : 0, X),
        offlineCapSec: G.offlineCap, globalMult: G.mult, legacyMult: G.legacy, costMult: G.costMult, night: nightNow, tickets: state.tickets,
      };
    },
    managerSlots(level) { return managerSlots(data.managerLevels, level); },
    goals() {
      const day = E.dayKey(wallNow);
      return { contracts: contractsView(state, data, equippedCount(state)), daily: dailyView(state), gift: giftView(state, data, day) };
    },
    retirePreview() { return retirePreview(state, data.legacy); },
    seasonInfo() {
      const def = seasonDef();
      if (!def) return { live: false };
      const st = seasonState(def), d = new Date(wallNow);
      return {
        live: true, id: def.id, def, inside: st.inside, candy: st.candy, xp: st.xp, rank: st.rank, xpNext: st.xpNext,
        ranks: def.ranks.length, rate: seasonRate(def, st, false), mult: seasonMult(def, wallNow),
        witching: E.inWindow(hourOf(wallNow), def.witching.from, def.witching.to),
        trickOrTreat: d.getMonth() + 1 === def.peak.month && d.getDate() === def.peak.day,
      };
    },
    seasonStats(lineId) {
      const def = seasonDef();
      const l = def?.lines.find((x) => x.id === lineId);
      if (!l) return null;
      const st = seasonState(def), ls = st.lines[lineId];
      const rate = seasonLineRate(def, l, ls) * seasonMult(def, wallNow) * (st.inside ? 1 : def.awayRate);
      return {
        owned: ls.lv > 0, level: ls.lv, perSec: rate, rate, sigma: 1, managed: true, stock: 0, stockRatio: 0.35, shelfCap: 0,
        cycle01: ls.cyc, cycleSec: l.cycleSec, visualTier: E.visualTier(ls.lv), full: false, unlockable: ls.lv <= 0,
        nextBoost: l.boosts[ls.boost] ? { glyph: l.boosts[ls.boost][0], name: l.boosts[ls.boost][1], mult: def.boostMult[ls.boost] } : null,
        nextMilestone: def.milestones.find((t) => ls.lv < t) || null, token: def.token,
      };
    },
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type).delete(fn);
    },
    advanceOffline(seconds) {
      wallNow = nowWall();
      hourNow = E.hourOf(wallNow);
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
      const empty = { awaySec: want, creditedSec: 0, cash: 0, lines: {}, piles: 0, harvest: [], candy: 0, capSec: cap, clockBack };
      if (sec < 5) { if (sec > 0) game.tick(Math.min(1, sec)); return empty; }
      const nightFrac = state.nightShift.length ? E.windowFraction(wallNow - sec * 1000, wallNow, data.night.from, data.night.to) : 0;
      const report = offlineClosedForm(D, state, sec, nightFrac, data.night.mult);
      report.awaySec = want;
      report.creditedSec = sec;
      report.capSec = cap;
      report.capped = avail > cap;
      report.clockBack = clockBack;
      earn(report.cash);
      const def = seasonDef();
      report.candy = 0;
      if (def) {
        const st = seasonState(def);
        const ss = Math.min(avail, def.awayCapSec);
        report.candy = seasonRate(def, st, true, seasonAvgMult(def, wallNow - ss * 1000, wallNow)) * ss;
        seasonGain(def, st, report.candy);
      }
      simTime += sec;
      stepKidWork(state, sec, lineById);
      const ev = state.events;
      ev.nextPigeon = Math.max(ev.nextPigeon, simTime + 20);
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
      return JSON.stringify({ game: 'il2', v: SAVE_VERSION, build: data.build || '', savedAt: nowWall(), simTime, seed, s: state });
    },
  };
  function hourOf(ms) { return E.hourOf(ms); }
  derive();
  return game;
}
