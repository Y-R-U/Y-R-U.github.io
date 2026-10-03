// The pure economy: no DOM, no renderer, no wall clock or unseeded randomness (test-boot and test-economy check). Fixed 0.1 s steps.
// API and every state field / act / bus event: docs/ECONOMY.md.
import * as E from './economy.js?v=20261004d';
import { newLineState, stepLine, sellPile } from './lines.js?v=20261004d';
import { pickEvent, nextGap, mulberry32 } from './events.js?v=20261004d';
import { offlineClosedForm } from './offline.js?v=20261004d';
import { SAVE_VERSION, GAME_ID } from './save.js?v=20261004d';
import { managerFor, managerSlots, newManagerState, openBox, equip, unequip, merge, autoEquip, fitSlots } from './managers.js?v=20261004d';
import { contractsView, statValue } from './goals.js?v=20261004d';
import { deathPreview, bountyMult, disguiseFor, epitaphFor } from './prestige.js?v=20261004d';
import { seasonLive, seasonYear, newSeasonState } from './season.js?v=20261004d';
import { ECON, LINES, LINKS } from '../data/lines.js?v=20261004d';
import { DISTRICTS, COURIER } from '../data/districts.js?v=20261004d';
import { MANAGERS, MANAGER_LEVELS } from '../data/managers.js?v=20261004d';
import { ITEMS, RARITIES, RARITY_SCORE, STRONGBOXES } from '../data/items.js?v=20261004d';
import { EVENTS, EVENT_GAP, SPECIAL_GAP, FIRST_EVENT } from '../data/events.js?v=20261004d';
import { CONTRACTS } from '../data/contracts.js?v=20261004d';
import { ACHIEVEMENTS, ACHIEVEMENT_MULT } from '../data/achievements.js?v=20261004d';
import { HATS, POMFREY_HATS, FRONTAGES } from '../data/hats.js?v=20261004d';
import { STAGES, CONSTRUCTION } from '../data/construction.js?v=20261004d';
import { EJECT, PIANO } from '../data/saloon.js?v=20261004d';
import { BOUNTY } from '../data/bounty.js?v=20261004d';
import * as EPITAPHS from '../data/epitaphs.js?v=20261004d';
import { SEASON, KEEPSAKES, KEEPSAKE_TARGET } from '../data/season.js?v=20261004d';
import { DAY } from '../data/day.js?v=20261004d';
import { dayAt, readClock } from './dayclock.js?v=20261004d';
import { BARK_CHARS, BARK_PRIORITY, BARK_GATE, CHAR_LINE } from '../data/barks.js?v=20261004d';

const STEP = 0.1;

export const DEFAULT_DATA = {
  econ: ECON, lines: LINES, links: LINKS, districts: DISTRICTS, courier: COURIER,
  managers: MANAGERS, managerLevels: MANAGER_LEVELS,
  items: ITEMS, rarities: RARITIES, rarityScore: RARITY_SCORE, boxes: STRONGBOXES,
  events: EVENTS, eventGap: EVENT_GAP, specialGap: SPECIAL_GAP, firstEvent: FIRST_EVENT,
  contracts: CONTRACTS, achievements: ACHIEVEMENTS, achievementMult: ACHIEVEMENT_MULT,
  hats: HATS, pomfreyHats: POMFREY_HATS, frontages: FRONTAGES,
  stages: STAGES, construction: CONSTRUCTION, eject: EJECT, piano: PIANO,
  bounty: BOUNTY, epitaphs: EPITAPHS, season: SEASON, keepsakes: KEEPSAKES, keepsakeTarget: KEEPSAKE_TARGET,
  barkChars: BARK_CHARS, barkPriority: BARK_PRIORITY, barkGate: BARK_GATE, charLine: CHAR_LINE,
  day: DAY,
};

const STATS0 = {
  taps: 0, bootTaps: 0, mudCoins: 0, pileTaps: 0, harvests: 0, events: 0, levels: 0, upgrades: 0, couriers: 0, comboMax: 0, crits: 0, plays: 1,
  hurries: 0, ejects: 0, flings: 0, flingTrough: 0, flingDentist: 0, flingJail: 0, flingPomfrey: 0,
  pianoTaps: 0, frenzies: 0, wrongNotes: 0, duels: 0, duelGold: 0, duelBoot: 0, brawls: 0, brawlHits: 0, robberies: 0, bartCaught: 0,
  stagecoaches: 0, tumbleweeds: 0, teethEarned: 0, boxesOpened: 0, merges: 0, ghosts: 0, deeds: 0, deaths: 0,
};

export function freshState(data, seed = 1) {
  const lines = {};
  for (const l of data.lines) lines[l.id] = newLineState();
  return {
    seed,
    cash: 0, lifetime: 0, allTime: 0,
    teeth: 0, boxes: { basic: 0, silver: 0, gold: 0 },
    bounty: 0, bountyFloor: 1, gen: 1, graves: [], built: [], deeds: [data.districts[0].id], disguise: null,
    lines,
    districts: [data.districts[0].id],
    build: {},
    own: 0, hat: 0, pomfrey: data.hats.length - 1,
    managers: {}, items: [], itemSeq: 0,
    contracts: {}, achievements: {}, keepsakes: {}, links: {},
    events: { nextFrequent: 1e12, nextSpecial: 1e12, active: [], mults: [], seq: 0, courierNext: 20 },
    saloon: { next: 0, held: null, last: [], piano: [], frenzyAt: -1e9, brawlAt: -1e9, seq: 0 },
    couriers: [],
    combo: { n: 0, last: -99 },
    taps: { tokens: data.econ.tapBurst, at: 0 },
    bootstrap: { done: false, hat: 0, opening: false, skip: false },
    returnHarvest: {},
    barks: { last: -1e9, nextIdle: 60, once: {} },
    season: { id: data.season ? data.season.id : null, year: 0, ecto: 0, xp: 0, rank: 0, ghost: null, nextGhost: 0, seq: 0, live: false },
    flags: {},
    sunday: false,
    settings: { tier: 'auto', sound: true, reducedMotion: false, qty: 1 },
    stats: { ...STATS0 },
    hints: {},
    clock: { hi: 0 },
  };
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const KEYED = ['managers', 'contracts', 'achievements', 'keepsakes', 'links', 'returnHarvest', 'hints', 'build', 'flags'];

function normalize(s, fresh, data) {
  const out = fresh;
  for (const k in s) {
    if (k === 'lines') continue;
    if (isObj(out[k]) && isObj(s[k]) && !KEYED.includes(k)) out[k] = Object.assign(out[k], s[k]);
    else out[k] = s[k];
  }
  for (const l of data.lines) out.lines[l.id] = Object.assign(newLineState(), s.lines?.[l.id] || {});
  out.stats = Object.assign({ ...STATS0 }, s.stats || {});
  for (const k of ['districts', 'couriers', 'items', 'graves', 'built', 'deeds']) if (!Array.isArray(out[k])) out[k] = fresh[k] || [];
  for (const k of KEYED) if (!isObj(out[k])) out[k] = {};
  if (!out.districts.includes(data.districts[0].id)) out.districts.unshift(data.districts[0].id);
  for (const id in out.build) if (!data.lines.some((l) => l.id === id) || !isObj(out.build[id])) delete out.build[id];
  for (const m of Object.values(out.managers)) { m.level = m.level || 1; if (!Array.isArray(m.slots)) m.slots = [null]; }
  for (const it of out.items) if (it.equipped && !out.managers[it.equipped]) it.equipped = null;
  out.itemSeq = Math.max(out.itemSeq || 0, ...out.items.map((i) => +String(i.id).slice(1) || 0));
  out.events.active = Array.isArray(out.events.active) ? out.events.active : [];
  out.events.mults = Array.isArray(out.events.mults) ? out.events.mults : [];
  if (!Array.isArray(out.saloon.last)) out.saloon.last = [];
  if (!Array.isArray(out.saloon.piano)) out.saloon.piano = [];
  return out;
}

export function createGame({ data: given = {}, save = null, seed = 1, rng = null, nowWall = () => 0, allowCheat = false, dayClock = null } = {}) {
  const data = { ...DEFAULT_DATA, ...given };
  if (given.econ) data.econ = { ...ECON, ...given.econ };
  if (given.construction) data.construction = { ...CONSTRUCTION, ...given.construction };
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
  const barkRng = mulberry32((seed ^ 0x5eed ^ Math.floor(simTime)) >>> 0);
  const lineById = Object.fromEntries(data.lines.map((l) => [l.id, l]));
  const mgrById = Object.fromEntries(data.managers.map((m) => [m.id, m]));
  const itemById = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const districtById = Object.fromEntries(data.districts.map((d) => [d.id, d]));
  const eventById = Object.fromEntries(data.events.map((e) => [e.id, e]));
  const subs = new Map();
  const D = {};
  for (const l of data.lines) D[l.id] = { P: 0, Pbase: 0, sigma: 0, cap: 0, speed: 1, cycleSec: l.cycleSec, crit: 0, auto: false, price: 1, m: 1, link: 0 };
  const G = { mult: 1, offlineCap: X.offlineCapSec, incomePerSec: 0, gross: 0, hat: 1, bounty: 1, duel: 1 };
  const wasFull = {}, pendSold = {}, tipped = new Set();
  let wallNow = nowWall();
  let clockFn = typeof dayClock === 'function' ? dayClock : null, nightAvg = null;
  // W18: night comes from the game clock (injected by the renderer, else the pure simTime clock), never the phone's.
  function day() {
    if (clockFn) { try { const v = readClock(clockFn(), data.day); if (v) return v; } catch (e) { /* fall back */ } }
    return dayAt(simTime, data.day);
  }
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
    state.allTime += cash;
  }

  function addTeeth(n, source) {
    if (!(n > 0)) return;
    state.teeth += n;
    state.stats.teethEarned += n;
    emit('teeth', { n, total: state.teeth, source });
  }

  function addBox(kind, source, n = 1) {
    if (!data.boxes[kind] || !(n > 0)) return;
    state.boxes[kind] = (state.boxes[kind] || 0) + n;
    emit('box', { kind, n, source });
  }

  // ---- barks (W5): sentence gate here, everything else in the audio layer (docs/ECONOMY.md §8) ----
  function speaker(trig) {
    const table = data.barkChars[trig];
    if (!table) return null;
    const here = Object.entries(table).filter(([c]) => !data.charLine[c] || state.lines[data.charLine[c]]?.lv > 0);
    const pool = here.length ? here : Object.entries(table);
    let total = 0;
    for (const [, w] of pool) total += w;
    let r = barkRng() * total;
    for (const [c, w] of pool) if ((r -= w) <= 0) return c;
    return pool[pool.length - 1][0];
  }

  function bark(trig, force = false) {
    const B = data.barkGate, b = state.barks;
    const prio = force || data.barkPriority.includes(trig);
    if (simTime - b.last < (prio ? B.prioGap : B.gap)) return;
    const char = speaker(trig);
    if (!char) return;
    b.last = simTime;
    b.nextIdle = simTime + nextGap(B.idle, barkRng);
    emit('bark', { char, trig, prio });
  }

  // ---- derived rates ----
  function itemStats(mgrId, out) {
    out.speed = 0; out.price = 0; out.shelf = 0; out.sigma = 0; out.crit = 0; out.offline = 0;
    const m = mgrId && state.managers[mgrId];
    if (!m) return out;
    for (const id of m.slots) {
      if (!id) continue;
      const it = state.items.find((x) => x.id === id);
      const def = it && itemById[it.def];
      if (def) out[def.stat] += def.values[it.rarity];
    }
    return out;
  }
  const IS = {};

  function keepsakePower(kind, id) {
    let p = 0;
    for (const k in state.keepsakes) {
      const t = state.keepsakes[k]?.target;
      if (t && t.kind === kind && (kind === 'character' || t.id === id)) p += (data.keepsakes[k]?.power || 0) * (data.keepsakeTarget[kind] || 1);
    }
    return p;
  }

  function eventRunning() {
    return state.events.active.some((e) => !e.frequent);
  }

  function derive() {
    dirty = false;
    const B = data.bounty;
    G.bounty = bountyMult(state.bounty, state.bountyFloor, B);
    G.hat = data.hats[state.hat]?.mult || 1;
    let ach = 0;
    for (const k in state.achievements) if (state.achievements[k]) ach++;
    const gm = G.bounty * G.hat * (1 + B.grave * state.graves.length) * (1 + data.achievementMult * ach) * (1 + keepsakePower('character'));
    G.mult = gm;
    G.duel = 1;
    let offline = X.offlineCapSec;
    let allEv = 1;
    for (const e of state.events.mults) if (!e.lineId && e.until > simTime) allEv *= e.mult;
    const quiet = !eventRunning();
    const night = nightAvg ?? (day().night ? 1 : 0);
    const link = {};
    for (const k of data.links) if (state.links[k.id] && state.lines[k.to]?.lv > 0) link[k.to] = (link[k.to] || 0) + k.mult;
    let inc = 0, gross = 0;
    for (const l of data.lines) {
      const ls = state.lines[l.id], d = D[l.id];
      if (ls.lv <= 0) { d.P = d.Pbase = d.sigma = d.cap = 0; d.auto = false; continue; }
      const mid = ls.mgr, mdef = mid ? mgrById[mid] : null, mst = mid ? state.managers[mid] : null;
      const it = itemStats(mid, IS);
      const tk = mdef ? mdef.kind : null, tv = mdef ? mdef.value : 0;
      const speed = 1 + it.speed + (tk === 'speed' ? tv : 0);
      let price = E.priceMult(ls.thr, X) * (1 + it.price);
      let sigma = X.sigmaWalkIn;
      if (mid) {
        const s0 = E.sigmaBase(ls.thr, X) + it.sigma + (tk === 'sigma' ? tv : 0);
        if (s0 > 1) price *= s0;
        sigma = Math.min(1, s0);
      }
      let m = ls.lv * l.rate * E.milestoneMult(ls.lv, X) * E.boostMult(l, ls.boost) * price * speed;
      if (mst) m *= data.managerLevels.mult[Math.min(data.managerLevels.mult.length, mst.level) - 1];
      if (tk === 'star' && ls.lv >= 50) m *= 1 + tv;
      if (tk === 'quiet' && quiet) m *= 1 + tv;
      if (tk === 'night' && night) m *= 1 + tv * night;
      if (tk === 'duel') G.duel = Math.max(G.duel, 1 + tv);
      m *= 1 + keepsakePower('line', l.id) + (mid ? keepsakePower('manager', mid) : 0);
      m *= 1 + (link[l.id] || 0);
      m *= gm;
      const crit = Math.min(X.critCap, it.crit);
      m *= 1 + crit * (X.saleCritMult - 1);
      let ev = allEv;
      for (const e of state.events.mults) if (e.lineId === l.id && e.until > simTime) ev *= e.mult;
      d.Pbase = m;
      d.P = m * ev;
      d.m = m / (ls.lv * l.rate);
      d.sigma = sigma;
      d.speed = speed;
      d.cycleSec = l.cycleSec / speed;
      d.crit = crit;
      d.price = price;
      d.link = link[l.id] || 0;
      d.auto = tk === 'autopile' && !!mid;
      d.cap = E.shelfCap(m, ls.sto, (1 + it.shelf) * (tk === 'shelf' ? 1 + tv : 1), X);
      if (mid && tk === 'offline') offline += tv;
      if (mid && mdef.offline) offline += mdef.offline;
      if (mid) offline += it.offline;
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

  // Event rewards scale with income; Lulu (kind 'events') boosts every event while she manages anything.
  function rewardBase() {
    let b = Math.max(G.incomePerSec, G.gross * 0.6, 1);
    for (const l of data.lines) {
      const mid = state.lines[l.id].mgr;
      if (mid && mgrById[mid]?.kind === 'events') { b *= 1 + mgrById[mid].value; break; }
    }
    return b;
  }

  const tapValue = () => (state.bootstrap.done ? Math.max(X.tapK * G.gross, X.tapFloor || 0) : X.bootTap);
  const spendable = () => state.cash + (state.bootstrap.done ? 0 : state.bootstrap.hat);

  function ownedIds() {
    const out = [];
    for (const l of data.lines) if (state.lines[l.id].lv > 0) out.push(l.id);
    return out;
  }

  function pickLine() {
    const ids = ownedIds();
    return ids.length ? ids[Math.floor(rng() * ids.length)] : null;
  }

  // ---- taps: one shared budget for street, hurry and piano taps (W13 "under the tap cap") ----
  function spendTap() {
    const T = state.taps;
    T.tokens = Math.min(X.tapBurst, T.tokens + Math.max(0, simTime - T.at) * X.tapRate);
    T.at = simTime;
    if (T.tokens < 1) return false;
    T.tokens -= 1;
    return true;
  }

  function mudTap(p, kind = 'mud') {
    state.stats.bootTaps++;
    if (state.bootstrap.skip) {
      earn(X.bootTap);
      emit('tap', { kind: 'coin', cash: X.bootTap, x: p?.x, y: p?.y });
      return { ok: true, delta: { cash: X.bootTap } };
    }
    state.stats.mudCoins++;
    state.bootstrap.hat += X.bootTap;
    emit('tap', { kind, coin: X.bootTap, hat: state.bootstrap.hat, coins: Math.round(state.bootstrap.hat / X.bootTap), x: p?.x, y: p?.y });
    return { ok: true, delta: { cash: 0, hat: X.bootTap }, hat: state.bootstrap.hat };
  }

  function hustle(p, kind) {
    const c = state.combo;
    c.n = simTime - c.last <= X.comboWindow ? c.n + 1 : 1;
    c.last = simTime;
    if (c.n > state.stats.comboMax) state.stats.comboMax = c.n;
    const combo = E.comboMult(c.n, X);
    const crit = rng() < Math.min(X.critCap, X.tapCrit);
    if (crit) state.stats.crits++;
    const v = tapValue() * combo * (crit ? X.tapCritMult : 1);
    earn(v);
    emit('tap', { kind, cash: v, combo, comboN: c.n, crit, x: p?.x, y: p?.y });
    return { ok: true, delta: { cash: v }, combo, crit };
  }

  function bankHat() {
    const h = state.bootstrap.hat;
    if (!(h > 0)) return 0;
    state.bootstrap.hat = 0;
    earn(h);
    emit('hat:bank', { cash: h, coins: Math.round(h / X.bootTap) });
    return h;
  }

  // ---- hats & frontages (W3/W14) ----
  function updateHat(quiet = false) {
    let open = 0, own = 0;
    for (const l of data.lines) {
      if (state.lines[l.id].lv > 0) open++;
      if (state.lines[l.id].lv > 0 || state.build[l.id]) own++;
    }
    if (own !== state.own) { state.own = own; emit('own', { own, frontages: data.frontages.length }); }
    let tier = 0;
    data.hats.forEach((h, i) => { if (open >= h.owned) tier = i; });
    if (tier !== state.hat) {
      const up = tier > state.hat;
      state.hat = tier;
      state.pomfrey = data.hats.length - 1 - tier;
      dirty = true;
      if (up && !quiet) {
        emit('hat:promo', { tier, hat: data.hats[tier], pomfrey: state.pomfrey, pomfreyHat: data.pomfreyHats[state.pomfrey] });
        emit('beat', { sec: 3, kind: 'hat' });
        bark(state.pomfrey === 0 ? 'hat_thimble' : 'hat_promo');
      }
    }
    if (open === data.lines.length && !state.flags.halfTown) {
      state.flags.halfTown = true;
      if (!quiet) { emit('half_town', { own }); bark('half_town', true); }
    }
  }

  // ---- construction (W13) ----
  function startBuild(lineId) {
    const line = lineById[lineId], C = data.construction;
    const rebrand = state.built.includes(lineId);
    const acq = rebrand ? 'rebrand' : line.acq;
    const T = rebrand ? C.rebrandSec : line.buildT;
    state.build[lineId] = { stage: 0, t: 0, T, acq };
    emit('build:start', { lineId, acq, T });
    if (acq !== 'built') emit('beat', { lineId, sec: Math.min(8, T), kind: acq });
    else bark('build');
    updateHat();
    updateBuild(lineId, false);
  }

  function updateBuild(lineId, live = true) {
    const b = state.build[lineId];
    if (!b) return;
    const C = data.construction;
    if (b.acq === 'built') {
      const stage = Math.min(data.stages.length - 1, Math.floor((b.t / b.T) * data.stages.length + 1e-9));
      while (b.stage < stage) {
        b.stage++;
        if (!live) continue;
        emit('build:stage', { lineId, stage: b.stage, name: data.stages[b.stage] });
        if (C.cutStages[b.stage]) emit('beat', { lineId, sec: C.cutSec, kind: 'build:' + data.stages[b.stage] });
        if (b.stage === data.stages.length - 1) bark('sign_raise');
      }
    }
    if (b.t >= b.T - 1e-9) finishBuild(lineId, live);
  }

  function finishBuild(lineId, live = true) {
    const b = state.build[lineId];
    delete state.build[lineId];
    const ls = state.lines[lineId];
    ls.lv = Math.max(1, ls.lv);
    if (!state.built.includes(lineId)) state.built.push(lineId);
    const own = managerFor(data, lineId);
    if (own && state.managers[own.id]) assignManager(lineId, own.id);
    const first = !state.bootstrap.done;
    if (first) {
      state.bootstrap.done = true;
      state.events.nextFrequent = simTime + data.firstEvent.frequent;
      state.events.nextSpecial = simTime + data.firstEvent.special;
    }
    if (lineId === 'saloon') {
      state.saloon.next = simTime + 6;
      if (live && !state.flags.saloonBrawl && state.gen === 1) {
        state.flags.saloonBrawl = true;
        const def = eventById.brawl;
        if (def && !eventRunning()) { spawn(def); state.events.nextSpecial = simTime + data.specialGap[0]; }
      }
    }
    dirty = true;
    derive();
    emit('build:done', { lineId, acq: b?.acq || 'built', offline: !live });
    emit('unlocked', { lineId });
    if (live) {
      if (first) bark('first_business', true);
      else if (b && b.acq !== 'built' && b.acq !== 'rebrand' && data.barkChars['acquire_' + lineId]) bark('acquire_' + lineId, true);
      else if (data.barkChars['acquire_' + lineId] && b?.acq === 'built') bark('acquire_' + lineId, true);
    }
    updateHat(!live);
  }

  function stepBuilds(h) {
    for (const id of Object.keys(state.build)) {
      state.build[id].t += h;
      updateBuild(id);
    }
  }

  // ---- events and specials (W8/W9) ----
  function spawn(def) {
    const ev = state.events;
    const e = { id: 'e' + ++ev.seq, kind: def.id, art: def.art || def.id, emoji: def.emoji, name: def.name, lineId: def.lineId || (def.lineless ? null : pickLine()), born: simTime, expires: simTime + def.lifeSec };
    if (def.frequent) e.frequent = true;
    else { e.special = true; e.phase = 'wind'; e.hits = 0; }
    if (def.game) e.game = def.game;
    ev.active.push(e);
    dirty = true;
    emit('event:spawn', { event: e });
    if (e.special) {
      emit('special:wind', { kind: e.kind, event: e });
      if (data.barkChars[e.kind]) bark(e.kind);
    }
    return e;
  }

  function specialOk(d) {
    return !d.frequent && (!d.district || state.districts.includes(d.district)) && (!d.lineId || state.lines[d.lineId]?.lv > 0);
  }

  function spawnEvents() {
    const ev = state.events;
    if (simTime >= ev.nextFrequent) {
      ev.nextFrequent = simTime + nextGap(data.eventGap, rng);
      const def = data.events.find((d) => d.frequent);
      if (def && !ev.active.some((e) => e.kind === def.id)) spawn(def);
    }
    if (simTime >= ev.nextSpecial) {
      if (eventRunning()) { ev.nextSpecial = simTime + 30; return; }
      ev.nextSpecial = simTime + nextGap(data.specialGap, rng);
      const def = pickEvent(data.events, rng, specialOk);
      if (def) spawn(def);
    }
  }

  function removeEvent(e) {
    const i = state.events.active.indexOf(e);
    if (i >= 0) state.events.active.splice(i, 1);
    dirty = true;
  }

  function expireEvents() {
    const ev = state.events;
    for (let i = ev.active.length - 1; i >= 0; i--) {
      const e = ev.active[i];
      if (e.phase === 'live' && e.liveUntil <= simTime) { settle(e, {}); continue; }
      if (e.expires > simTime) continue;
      if (e.phase === 'live') { settle(e, {}); continue; }
      removeEvent(e);
      emit('event:expire', { event: e });
      if (e.special) emit('special:end', { kind: e.kind, event: e, expired: true });
    }
    if (ev.mults.length && ev.mults.some((m) => m.until <= simTime)) {
      ev.mults = ev.mults.filter((m) => m.until > simTime);
      dirty = true;
    }
  }

  // Same source + line refreshes instead of stacking (a fling every 15 s must not compound to ×2^n).
  function pushMult(lineId, mult, sec, src) {
    const ex = src && state.events.mults.find((m) => m.src === src && m.lineId === (lineId || null));
    if (ex) { ex.until = Math.max(ex.until, simTime + sec); ex.mult = Math.max(ex.mult, mult); }
    else state.events.mults.push({ lineId: lineId || null, mult, until: simTime + sec, src: src || null });
    dirty = true;
  }

  function duelTier(r, p) {
    if (p.early) return 'basic';
    const ms = +p.ms;
    if (!(ms >= 0)) return 'basic';
    return ms < r.gold ? 'gold' : ms < r.silver ? 'silver' : 'basic';
  }

  // Pays an event (tumbleweed, stagecoach) or settles a special. p: {score, ms, early, lineId}.
  function settle(e, p) {
    const def = eventById[e.kind] || {};
    const r = def.reward || {};
    removeEvent(e);
    const out = { cash: 0, teeth: 0, boxes: [] };
    const base = rewardBase();
    if (r.kind === 'cashSec') {
      out.jackpot = rng() < (r.jackpot || 0);
      out.cash = base * r.sec * (out.jackpot ? r.jackpotMult : 1);
      earn(out.cash);
      if (out.jackpot && r.jackpotTeeth) { addTeeth(r.jackpotTeeth, e.kind); out.teeth = r.jackpotTeeth; }
      if (e.kind === 'tumbleweed') state.stats.tumbleweeds++;
    } else if (r.kind === 'lineMult' || r.kind === 'allMult') {
      let lineId = null;
      if (r.kind === 'lineMult') lineId = p.lineId && state.lines[p.lineId]?.lv > 0 ? p.lineId : e.lineId || pickLine();
      pushMult(lineId, r.mult, r.sec, e.kind);
      out.mult = r.mult; out.sec = r.sec; out.lineId = lineId;
      if (e.kind === 'stagecoach') state.stats.stagecoaches++;
    } else if (r.kind === 'duel') {
      out.tier = duelTier(r, p);
      out.early = !!p.early;
      out.ms = p.ms ?? null;
      out.cash = base * r.cashSec * G.duel;
      earn(out.cash);
      addBox(r.boxes[out.tier], 'duel', G.duel > 1 ? 2 : 1);
      out.boxes.push(r.boxes[out.tier]);
      if (r.lineMult) pushMult(r.lineMult.lineId, r.lineMult.mult, r.lineMult.sec, 'duel');
      state.stats.duels++;
      if (out.tier === 'gold') state.stats.duelGold++;
      if (out.early) state.stats.duelBoot++;
      emit('duel:result', { tier: out.tier, ms: out.ms, early: out.early, cash: out.cash });
      if (out.early) bark('duel_boot');
      else if (out.tier !== 'basic') bark('duel_win');
    } else if (r.kind === 'brawl') {
      const hits = Math.max(e.hits || 0, Math.min(r.max, Math.floor(+p.score || 0)));
      for (let k = e.hits || 0; k < hits; k++) { const c = base * r.hitSec; earn(c); out.cash += c; }
      out.score = hits;
      if (hits >= r.silverAt) { addBox('silver', 'brawl'); out.boxes.push('silver'); }
      for (const m of r.mults) pushMult(m.lineId, m.mult, m.sec, 'brawl');
      state.stats.brawls++;
    } else if (r.kind === 'robbery') {
      const s = Math.max(e.hits || 0, Math.min(r.max, Math.floor(+p.score || 0)));
      out.score = s;
      out.tier = r.tiers.find(([n]) => s >= n)[1];
      out.cash = base * r.cashSec * (s / r.max);
      earn(out.cash);
      addBox(out.tier, 'robbery');
      out.boxes.push(out.tier);
      out.caught = s >= r.tiers[1][0];
      state.stats.robberies++;
      if (out.caught) { state.stats.bartCaught++; addTeeth(r.teeth, 'robbery'); out.teeth = r.teeth; }
      bark(out.caught ? 'robbery_caught' : 'robbery_crash', out.caught);
    }
    state.stats.events++;
    dirty = true;
    emit('event:claim', { event: e, reward: out });
    if (e.special) emit('special:end', { kind: e.kind, event: e, reward: out });
    return out;
  }

  function liveSpecial(kind, id) {
    return state.events.active.find((e) => e.special && e.kind === kind && (!id || e.id === id)) || null;
  }

  // ---- couriers (tip riders) ----
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

  // ---- saloon ejections (W4/W6) ----
  function ejectGap() {
    const J = data.eject, lv = state.lines.saloon?.lv || 0;
    const f = Math.max(J.gapFloor, 1 - J.gapPerMilestone * E.milestoneCount(lv, X));
    return nextGap(J.gap, rng) * f;
  }

  function stepSaloon() {
    const sl = state.lines.saloon;
    if (!sl || sl.lv <= 0) return;
    const S = state.saloon, J = data.eject;
    if (S.held && simTime >= S.held.until) throwDrunk(null);
    if (!S.held && simTime >= S.next) {
      const pool = J.kinds.filter((k) => sl.lv >= k.minLv);
      let r = rng() * pool.reduce((s, k) => s + k.w, 0), kind = pool[0].id;
      for (const k of pool) if ((r -= k.w) <= 0) { kind = k.id; break; }
      S.held = { id: 'j' + ++S.seq, kind, born: simTime, until: simTime + J.holdSec };
      S.next = simTime + J.holdSec + ejectGap();
      emit('eject', { id: S.held.id, kind, holdSec: J.holdSec, level: sl.lv });
      bark('eject');
    }
  }

  function targetFor(dir) {
    const T = data.eject.targets;
    if (T[dir]) return dir;
    for (const k in T) if (T[k].dir === dir) return k;
    return null;
  }

  function throwDrunk(target) {
    const S = state.saloon, J = data.eject, held = S.held;
    S.held = null;
    state.stats.ejects++;
    const out = { id: held.id, kind: held.kind, target, auto: !target, cash: 0, teeth: 0 };
    if (!target) {
      const recent = S.last.slice(-J.noRepeat);
      const pool = J.landing.filter((t) => !recent.includes(t));
      out.target = pool[Math.floor(rng() * pool.length)] || J.landing[0];
    } else {
      const T = J.targets[target];
      out.cash = rewardBase() * T.sec;
      earn(out.cash);
      if (T.lineMult && state.lines[T.lineMult.lineId]?.lv > 0) { pushMult(T.lineMult.lineId, T.lineMult.mult, T.lineMult.sec, 'fling'); out.mult = T.lineMult; }
      if (T.teeth && rng() < T.teethChance) { addTeeth(T.teeth, 'fling'); out.teeth = T.teeth; }
      state.stats.flings++;
      const key = 'fling' + target[0].toUpperCase() + target.slice(1);
      if (key in state.stats) state.stats[key]++;
    }
    S.last.push(out.target);
    if (S.last.length > 6) S.last.shift();
    emit('fling', out);
    if (target) bark(data.barkChars['fling_' + target] ? 'fling_' + target : 'fling');
    return out;
  }

  // ---- Ghost Town season (W12) ----
  function seasonDef() {
    return data.season && seasonLive(data.season, wallNow) ? data.season : null;
  }

  function seasonState(def) {
    const y = seasonYear(wallNow);
    let st = state.season;
    if (!st || st.id !== def.id || st.year !== y) st = state.season = newSeasonState(def, y);
    return st;
  }

  function seasonGain(def, st, n) {
    st.ecto += n;
    st.xp += n;
    while (st.rank < def.ranks.length && st.xp >= def.ranks[st.rank].xp) {
      const rk = def.ranks[st.rank];
      st.rank++;
      if (rk.keepsake && !state.keepsakes[rk.keepsake]) state.keepsakes[rk.keepsake] = { target: { kind: 'character' }, season: def.id, year: st.year };
      if (rk.box) addBox(rk.box, 'season');
      if (rk.teeth) addTeeth(rk.teeth, 'season');
      if (rk.manager && !state.managers[rk.manager]) state.managers[rk.manager] = newManagerState(data.managerLevels);
      dirty = true;
      emit('season', { kind: 'rank', rank: st.rank, reward: rk });
    }
  }

  function stepSeason() {
    const def = seasonDef();
    const was = state.season?.live;
    if (!def) { if (state.season) { state.season.live = false; state.season.ghost = null; } if (was) emit('season', { kind: 'end' }); return; }
    const st = seasonState(def);
    st.live = true;
    if (!was) emit('season', { kind: 'live', id: def.id });
    if (!state.bootstrap.done) return;
    if (st.ghost && simTime >= st.ghost.until) { emit('ghost:gone', { ghost: st.ghost }); st.ghost = null; }
    if (!st.ghost && simTime >= st.nextGhost) {
      st.ghost = { id: 'g' + ++st.seq, born: simTime, until: simTime + def.ghostLife };
      st.nextGhost = simTime + def.ghostLife + nextGap(def.ghostGap, rng) * (day().witching ? data.day.witchingGhostGap : 1);
      emit('ghost:spawn', { ghost: st.ghost });
    }
  }

  // ---- slow (1 Hz) checks ----
  function slowStep() {
    checkUnlocks();
    stepSeason();
    const b = state.barks;
    if (state.bootstrap.done && simTime >= b.nextIdle && simTime - b.last >= data.barkGate.gap) bark('idle');
  }

  function checkUnlocks() {
    for (const k of data.links) {
      const on = state.lines[k.from]?.lv >= k.minLv && state.lines[k.to]?.lv > 0;
      if (on && !state.links[k.id]) { state.links[k.id] = true; dirty = true; emit('link', { id: k.id, from: k.from, to: k.to }); bark('link'); }
    }
    for (const a of data.achievements) {
      if (state.achievements[a.id]) continue;
      if (statValue(state, data, a.stat) >= a.n) { state.achievements[a.id] = true; dirty = true; emit('achievement', { id: a.id, achievement: a }); }
    }
  }

  function step(h) {
    simTime += h;
    if (!state.bootstrap.opening) { state.bootstrap.opening = true; if (state.gen === 1) bark('opening', true); }
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
      const mdef = ls.mgr ? mgrById[ls.mgr] : null;
      while (ls.cyc >= 1) {
        ls.cyc -= 1;
        emit('produced', { lineId: l.id, units: 1 });
        if (pendSold[l.id]) { emit('sold', { lineId: l.id, cash: pendSold[l.id] }); pendSold[l.id] = 0; }
        if (mdef?.kind === 'teeth' && ++ls.tc >= mdef.value) { ls.tc = 0; addTeeth(1, 'manager'); }
      }
    }
    stepBuilds(h);
    expireEvents();
    if (state.bootstrap.done) spawnEvents();
    stepCouriers();
    stepSaloon();
    slowAcc += h;
    if (slowAcc >= 1) { slowAcc = 0; slowStep(); }
  }

  const fail = (code, msg) => ({ ok: false, code, msg });

  function pay(cost, fn) {
    if (!(cost >= 0) || !isFinite(cost)) return fail('bad', 'Not for sale');
    if (state.cash < cost && spendable() >= cost) bankHat();
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

  function gateContracts(d) {
    const idx = data.districts.indexOf(d), prev = data.districts[idx - 1];
    const out = { done: 0, need: d.needContracts || 0, autoClaim: [], district: prev?.id || null };
    if (!prev) return out;
    for (const c of contractsView(state, data)) {
      if (c.district !== prev.id || !c.done) continue;
      out.done++;
      if (!c.claimed) out.autoClaim.push(c.id);
    }
    return out;
  }

  function permitBlock(d) {
    if (state.deeds.includes(d.id)) return null;
    const prev = data.districts[data.districts.indexOf(d) - 1];
    if (prev && !state.districts.includes(prev.id)) return 'Open ' + prev.name + ' first';
    if (prev && gateContracts(d).done < (d.needContracts || 0)) return `Finish ${d.needContracts} ${prev.name} demands`;
    return null;
  }

  const permitCost = (d) => (state.deeds.includes(d.id) ? 0 : d.permitCost);

  function grantReward(r, source) {
    const out = { teeth: 0, boxes: [], cash: 0 };
    if (!r) return out;
    if (r.teeth) { addTeeth(r.teeth, source); out.teeth = r.teeth; }
    if (r.box) { addBox(r.box, source); out.boxes.push(r.box); }
    if (r.cashSec) { out.cash = rewardBase() * r.cashSec; earn(out.cash); }
    return out;
  }

  function claimContractNow(c) {
    state.contracts[c.id] = 'claimed';
    const got = grantReward(c.reward, 'contract');
    emit('contract', { id: c.id, reward: c.reward });
    return got;
  }

  function assignManager(lineId, managerId) {
    for (const l of data.lines) if (state.lines[l.id].mgr === managerId && l.id !== lineId) state.lines[l.id].mgr = null;
    state.lines[lineId].mgr = managerId;
    fitSlots(state.managers[managerId], data.managerLevels);
  }

  function buildLeft(b) { return Math.max(0, b.T - b.t); }

  // "Save for X" (PT#5): the next business in street order, else the next Deed. eta assumes piles get sold (gross);
  // etaIdle assumes they don't. hint: 'buy' (affordable now), 'save' (≤ saveSec away: stop spending), 'grind'.
  function nextGoal() {
    let g = null;
    const building = Object.keys(state.build);
    for (const l of data.lines) {
      if (state.lines[l.id].lv > 0 || state.build[l.id] || !state.districts.includes(l.district)) continue;
      g = { kind: 'line', id: l.id, lineId: l.id, name: l.name, emoji: l.emoji, cost: l.baseCost, blocked: null };
      break;
    }
    if (!g) {
      const d = data.districts.find((x) => !state.districts.includes(x.id));
      if (!d) return null;
      g = { kind: 'deed', id: d.id, districtId: d.id, name: d.name + ' Deed', emoji: d.emoji, cost: permitCost(d), blocked: permitBlock(d) };
    }
    const have = g.kind === 'line' ? spendable() : state.cash;
    const left = Math.max(0, g.cost - have);
    const gross = state.bootstrap.done ? G.gross : 0, sold = state.bootstrap.done ? G.incomePerSec : 0;
    g.have = have;
    g.p01 = g.cost > 0 ? Math.min(1, have / g.cost) : 1;
    g.affordable = left <= 0;
    g.eta = left <= 0 ? 0 : gross > 0 ? left / gross : null;
    g.etaIdle = left <= 0 ? 0 : sold > 0 ? left / sold : null;
    g.building = building;
    const best = bestBuy();
    g.bestBuy = best;
    // Save only when no upgrade would get you there sooner: buy first iff cost/left < gain/income.
    const sooner = best && gross > 0 && best.cost < left && best.cost * gross < best.gain * left;
    g.hint = g.blocked ? 'blocked' : g.affordable ? 'buy' : g.eta != null && g.eta <= X.saveSec && !sooner ? 'save' : 'grind';
    // What to stop spending for right now: the goal, else a best buy that is only a few seconds away.
    const bbEta = best && gross > 0 ? Math.max(0, best.cost - state.cash) / gross : null;
    g.save = g.hint === 'save' ? { kind: 'goal', id: g.id, cost: g.cost, eta: g.eta }
      : best && !best.affordable && bbEta != null && bbEta <= X.saveBestSec ? { kind: 'upgrade', act: best.act, lineId: best.lineId, qty: best.qty || 1, cost: best.cost, eta: bbEta } : null;
    return g;
  }

  // The upgrade with the shortest payback (cost / extra gross $/s), for a "best buy" glow. Hire counts the walk-in
  // share it lifts (σ 0.35 → 0.6) as its gain.
  function bestBuy() {
    let best = null;
    const consider = (act, lineId, cost, gain, extra) => {
      if (!(gain > 0) || !isFinite(cost)) return;
      const pay = cost / gain;
      if (!best || pay < best.payback) best = { act, lineId, cost, gain, payback: pay, affordable: state.cash >= cost, ...extra };
    };
    for (const l of data.lines) {
      const ls = state.lines[l.id], d = D[l.id];
      if (ls.lv <= 0) continue;
      const P = d.Pbase, cm = costMult(l.id), lv = ls.lv;
      const ms = (n) => Math.pow(X.milestoneMult, E.milestoneCount(n, X));
      consider('level', l.id, E.bulkCost(l, lv, 1, cm), P * ((lv + 1) / lv * ms(lv + 1) / ms(lv) - 1), { qty: 1 });
      const m = E.nextMilestone(lv, X);
      if (m && m - lv > 1 && m - lv <= 25) consider('level', l.id, E.bulkCost(l, lv, m - lv, cm), P * (m / lv * X.milestoneMult - 1), { qty: m - lv });
      if (l.throughput[ls.thr]) consider('throughput', l.id, l.throughput[ls.thr].cost, P * (X.sigmaPrice - 1));
      if (l.boosts[ls.boost]) consider('boost', l.id, l.boosts[ls.boost].cost, P * (l.boosts[ls.boost].mult - 1));
      if (!ls.mgr) { const def = managerFor(data, l.id); if (def && !def.seasonal) consider('hire', l.id, state.managers[def.id] ? 0.01 : def.hireCost, P * (X.sigma0 - X.sigmaWalkIn)); }
    }
    return best;
  }

  const acts = {
    tap(p) {
      state.stats.taps++;
      if (!state.bootstrap.done) return mudTap(p);
      if (!spendTap()) return { ok: true, capped: true, delta: { cash: 0 } };
      return hustle(p, 'hustle');
    },
    hat() {
      if (state.bootstrap.hat <= 0) return fail('empty', 'Your hat is empty');
      const cash = bankHat();
      return { ok: true, delta: { cash } };
    },
    pile(p) { return p && p.lineId ? acts.tapPile(p) : acts.hat(); },
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
      const cash = rewardBase() * data.courier.rewardSec;
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
    buy({ lineId }) {
      const line = lineById[lineId], ls = state.lines[lineId];
      if (!line) return fail('bad');
      if (ls.lv > 0) return fail('owned');
      if (state.build[lineId]) return fail('building', 'Already being built');
      if (!state.districts.includes(line.district)) return fail('locked', 'Block locked');
      const r = pay(line.baseCost, () => startBuild(lineId));
      if (r.ok) emit('bought', { lineId, kind: 'unlock', acq: state.build[lineId]?.acq || 'built' });
      return r.ok ? { ...r, build: state.build[lineId] || null } : r;
    },
    unlock(p) { return acts.buy(p); },
    'build:hurry'(p) {
      const lineId = p.lineId, b = state.build[lineId];
      if (!b) return fail('none', 'Nothing being built');
      state.stats.taps++;
      let r;
      if (!state.bootstrap.done) r = mudTap(p, 'mud');
      else {
        if (!spendTap()) return { ok: true, capped: true, delta: { cash: 0 }, left: buildLeft(b) };
        r = hustle(p, 'hurry');
      }
      b.t = Math.min(b.T, b.t + data.construction.hurrySec);
      state.stats.hurries++;
      emit('build:hurry', { lineId, left: buildLeft(b), x: p?.x, y: p?.y });
      bark('hurry');
      updateBuild(lineId);
      return { ...r, left: state.build[lineId] ? buildLeft(state.build[lineId]) : 0, done: !state.build[lineId] };
    },
    hurry(p) { return acts['build:hurry'](p); },
    level({ lineId, qty = 1 }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const n = levelQty(line, ls, qty);
      const before = ls.lv, tierBefore = E.visualTier(before);
      const r = pay(E.bulkCost(line, ls.lv, n, costMult(lineId)), () => { ls.lv += n; });
      if (!r.ok) return r;
      state.stats.levels += n;
      for (const t of X.milestones) if (t > before && t <= ls.lv) emit('milestone', { lineId, level: t, mult: X.milestoneMult });
      if ([25, 50, 100].some((t) => t > before && t <= ls.lv)) bark('levelup');
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
    glyph({ lineId, kind }) {
      if (kind === 'boost') return acts.boost({ lineId });
      if (kind === 'storage') return acts.storage({ lineId });
      return acts.throughput({ lineId });
    },
    hire({ lineId, managerId }) {
      const [line, ls] = lineOk(lineId);
      if (!line) return fail('bad');
      const def = managerId ? mgrById[managerId] : managerFor(data, lineId);
      if (!def || def.lineId !== lineId) return fail('bad');
      if (ls.mgr === def.id) return fail('owned');
      if (state.managers[def.id]) { assignManager(lineId, def.id); dirty = true; emit('bought', { lineId, kind: 'manager', managerId: def.id, cost: 0 }); return { ok: true, delta: { cash: 0 } }; }
      if (def.seasonal) return fail('locked', 'Earned in the season');
      const r = pay(def.hireCost, () => {
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
      if (state.teeth < q.teeth) return fail('teeth', 'Need more 🦷');
      const r = pay(q.cost, () => { state.teeth -= q.teeth; m.level++; fitSlots(m, data.managerLevels); });
      if (r.ok) emit('bought', { kind: 'managerLevel', managerId, level: m.level });
      return r;
    },
    equip({ itemId, managerId }) {
      if (!managerId) return fail('bad', 'Items go on managers');
      const err = equip(state, data.managerLevels, itemId, managerId);
      if (err) return fail(err);
      dirty = true;
      emit('equip', { itemId, managerId });
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
      if (r.slotOf) equip(state, data.managerLevels, r.item.id, r.slotOf);
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
    openBox({ kind }) {
      if (!data.boxes[kind]) return fail('bad');
      if (!(state.boxes[kind] > 0)) return fail('empty', 'No strongbox');
      state.boxes[kind]--;
      const items = openBox(state, data, kind, rng);
      state.stats.boxesOpened++;
      for (const it of items) emit('item', { item: it, source: 'box' });
      emit('box:open', { kind, items });
      bark('strongbox');
      dirty = true;
      return { ok: true, items };
    },
    claimEvent(p) {
      const e = state.events.active.find((x) => x.id === p.eventId);
      if (!e) return fail('gone');
      const reward = settle(e, p);
      return { ok: true, delta: { cash: reward.cash }, reward };
    },
    'event:claim'(p) { return acts.claimEvent(p); },
    'special:begin'({ id, eventId }) {
      const e = state.events.active.find((x) => x.special && x.id === (id || eventId));
      if (!e) return fail('gone');
      if (e.phase === 'live') return fail('owned');
      e.phase = 'live';
      e.started = simTime;
      e.liveUntil = simTime + (e.game?.sec || 30);
      e.expires = Math.max(e.expires, e.liveUntil + 5);
      emit('special:start', { kind: e.kind, event: e });
      return { ok: true, event: e };
    },
    'duel:result'(p) {
      const e = liveSpecial('duel', p.id || p.eventId);
      if (!e) return fail('gone');
      const reward = settle(e, p);
      return { ok: true, delta: { cash: reward.cash }, reward };
    },
    'brawl:hit'(p) {
      const e = liveSpecial('brawl', p.id || p.eventId);
      if (!e || e.phase !== 'live') return fail('gone');
      const r = eventById.brawl.reward;
      if (e.hits >= r.max) return fail('max');
      e.hits++;
      state.stats.brawlHits++;
      const cash = rewardBase() * r.hitSec;
      earn(cash);
      emit('brawl:hit', { event: e, n: e.hits, cash });
      if (e.hits >= r.max) settle(e, { score: e.hits });
      return { ok: true, delta: { cash }, n: e.hits };
    },
    'robbery:hit'(p) {
      const e = liveSpecial('robbery', p.id || p.eventId);
      if (!e || e.phase !== 'live') return fail('gone');
      const r = eventById.robbery.reward;
      if (e.hits >= r.max) return fail('max');
      e.hits++;
      emit('robbery:hit', { event: e, n: e.hits });
      return { ok: true, n: e.hits };
    },
    fling({ dir }) {
      const S = state.saloon;
      if (!S.held) return fail('none', 'Nobody to throw');
      const target = targetFor(dir);
      if (!target) return fail('bad');
      const out = throwDrunk(target);
      return { ok: true, delta: { cash: out.cash }, ...out };
    },
    piano(p) {
      const P = data.piano, S = state.saloon;
      S.piano = S.piano.filter((t) => simTime - t <= P.frenzyWindow);
      S.piano.push(simTime);
      state.stats.pianoTaps++;
      const recent = S.piano.filter((t) => simTime - t <= P.tempoWindow).length;
      const tempo = Math.min(P.tempoMax, 1 + 0.12 * Math.max(0, recent - 1));
      let frenzy = false, brawl = false;
      if (S.piano.length >= P.frenzyTaps && simTime - S.frenzyAt > P.frenzyWindow) {
        frenzy = true;
        S.frenzyAt = simTime;
        state.stats.frenzies++;
        if (simTime - S.brawlAt >= P.frenzyCooldown) { brawl = true; S.brawlAt = simTime; }
        emit('piano:frenzy', { brawl });
        bark('frenzy');
      }
      const wrong = !frenzy && barkRng() < P.wrongChance;
      if (wrong) { state.stats.wrongNotes++; bark('wrong_note'); }
      let r = { ok: true, delta: { cash: 0 } };
      if (state.bootstrap.done && state.lines.saloon?.lv > 0 && spendTap()) r = hustle(p, 'piano');
      emit('piano', { n: state.stats.pianoTaps, tempo, wrong, frenzy });
      if (!frenzy && !wrong) bark('piano');
      return { ...r, tempo, wrong, frenzy, brawl };
    },
    'ghost:tap'({ id } = {}) {
      const def = seasonDef();
      const st = def && state.season;
      if (!st || !st.ghost || (id && st.ghost.id !== id)) return fail('gone');
      const g = st.ghost;
      st.ghost = null;
      state.stats.ghosts++;
      const ecto = def.ectoPerGhost * (day().witching ? data.day.witchingEcto : 1);
      seasonGain(def, st, ecto);
      emit('ghost:tap', { ghost: g, ecto, total: st.ecto });
      bark('ghost');
      return { ok: true, ecto };
    },
    permit({ districtId }) {
      const d = districtById[districtId];
      if (!d || state.districts.includes(districtId)) return fail('bad');
      const block = permitBlock(d);
      if (block) return fail('locked', block);
      const gate = gateContracts(d);
      const reopen = state.deeds.includes(d.id);
      const r = pay(permitCost(d), () => {
        const view = contractsView(state, data);
        if (!reopen) for (const id of gate.autoClaim) claimContractNow(view.find((c) => c.id === id));
        state.districts.push(districtId);
        if (!reopen) state.deeds.push(districtId);
      });
      if (r.ok) {
        state.stats.deeds++;
        emit('district', { districtId });
        emit('deed', { district: districtId, reopen });
        emit('bought', { kind: 'permit', districtId });
        emit('beat', { sec: 3, kind: 'deed' });
        bark('deed', true);
      }
      return r.ok ? { ...r, claimed: reopen ? [] : gate.autoClaim } : r;
    },
    deed({ districtId, district }) { return acts.permit({ districtId: districtId || district }); },
    claimContract({ id }) {
      const c = contractsView(state, data).find((x) => x.id === id);
      if (!c || !c.visible) return fail('bad');
      if (c.claimed) return fail('owned');
      if (!c.done) return fail('locked', 'Not done yet');
      return { ok: true, reward: claimContractNow(c) };
    },
    prestige() {
      const B = data.bounty;
      const pv = deathPreview(state, B);
      if (!pv.available) return fail('locked', 'Open Bank Block and own Boot Hill first');
      const EP = data.epitaphs;
      const name = state.disguise?.name || 'The Stranger';
      const grave = { gen: state.gen, name, epitaph: epitaphFor(state.seed, state.gen, name, data.hats[state.hat].name, EP), bounty: pv.total, hat: state.hat, allTime: state.allTime };
      state.graves.push(grave);
      state.bounty += pv.bounty;
      state.bountyFloor = Math.max(state.bountyFloor || 1, B.firstFloor);
      state.gen++;
      state.stats.deaths++;
      const keep = {};
      for (const k of ['seed', 'allTime', 'teeth', 'boxes', 'bounty', 'bountyFloor', 'gen', 'graves', 'built', 'deeds', 'managers', 'items', 'itemSeq', 'contracts', 'achievements', 'keepsakes', 'season', 'sunday', 'settings', 'stats', 'hints', 'clock', 'barks']) keep[k] = state[k];
      const fresh = freshState(data, state.seed);
      for (const k in state) delete state[k];
      Object.assign(state, fresh, keep);
      state.districts = state.deeds.slice();
      state.cash = pv.starterCash;
      state.bootstrap.opening = true;
      state.bootstrap.skip = true;
      state.disguise = disguiseFor(state.seed, state.gen, EP);
      state.stats.plays++;
      for (const l of data.lines) state.lines[l.id].mgr = null;
      for (const it of state.items) if (it.equipped && !state.managers[it.equipped]) it.equipped = null;
      dirty = true;
      derive();
      emit('prestige', { gen: state.gen, bounty: pv.bounty, total: state.bounty, mult: pv.nextMult, grave, disguise: state.disguise, starterCash: pv.starterCash });
      emit('beat', { sec: 8, kind: 'prestige' });
      bark('fake_death', true);
      return { ok: true, bounty: pv.bounty, mult: pv.nextMult, grave, disguise: state.disguise };
    },
    fakeDeath() { return acts.prestige(); },
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
    sunday({ on } = {}) {
      state.sunday = on == null ? !state.sunday : !!on;
      emit('sunday', { on: state.sunday });
      return { ok: true, on: state.sunday };
    },
    barkOnce({ id }) {
      if (typeof id !== 'string' || !id) return fail('bad');
      state.barks.once[id] = 1;
      return { ok: true };
    },
    setting({ key, value }) {
      if (typeof key !== 'string') return fail('bad');
      state.settings[key] = value;
      return { ok: true };
    },
    hint({ id }) { state.hints[id] = true; return { ok: true }; },
    cheat({ cash = 0, unlockAll = false, managers = false, levels = 0, teeth = 0, boxes = 0 }) {
      if (!allowCheat) return fail('unknown');
      earn(cash);
      state.teeth += teeth;
      for (let i = 0; i < boxes; i++) addBox('silver', 'cheat');
      if (unlockAll) {
        state.bootstrap.done = true;
        for (const d of data.districts) {
          if (!state.districts.includes(d.id)) state.districts.push(d.id);
          if (!state.deeds.includes(d.id)) state.deeds.push(d.id);
        }
        derive();
        for (const l of data.lines) {
          const ls = state.lines[l.id];
          delete state.build[l.id];
          ls.lv = Math.max(ls.lv, 1 + Math.floor(levels * (1 - l.order / (data.lines.length + 2))));
          if (!state.built.includes(l.id)) state.built.push(l.id);
          const def = managers && !ls.mgr ? managerFor(data, l.id) : null;
          if (def) { state.managers[def.id] ||= newManagerState(data.managerLevels); ls.mgr = def.id; }
        }
        updateHat(true);
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
        const r = fn(payload && typeof payload === 'object' ? payload : {});
        derive();
        return r;
      } catch (e) {
        return { ok: false, code: 'error', msg: String(e && e.message) };
      }
    },
    quote(type, p = {}) {
      if (dirty) derive();
      p = p && typeof p === 'object' ? p : {};
      const line = lineById[p.lineId], ls = state.lines[p.lineId];
      const no = { cost: Infinity, qty: 0, affordable: false };
      const q = (cost, extra) => ({ cost, qty: 1, affordable: isFinite(cost) && state.cash >= cost, ...extra });
      switch (type) {
        case 'buy':
        case 'unlock': {
          if (!line) return no;
          const building = !!state.build[line.id];
          const cost = ls.lv > 0 || building ? Infinity : line.baseCost;
          const rebrand = state.built.includes(line.id);
          return { cost, qty: 1, affordable: isFinite(cost) && spendable() >= cost, locked: !state.districts.includes(line.district), building, acq: rebrand ? 'rebrand' : line.acq, T: rebrand ? data.construction.rebrandSec : line.buildT };
        }
        case 'level': {
          if (!line) return no;
          const lv = Math.max(1, ls.lv);
          const qty = p.qty === 'max' ? Math.max(1, E.maxAffordable(line, lv, state.cash, costMult(line.id))) : Math.max(1, p.qty | 0 || 1);
          const cost = E.bulkCost(line, lv, qty, costMult(line.id));
          return { cost, qty, affordable: ls.lv > 0 && state.cash >= cost, after: lv + qty };
        }
        case 'throughput': {
          const n = line && ls.lv > 0 && line.throughput[ls.thr];
          return n ? q(n.cost, { glyph: n.glyph, name: n.name, sigma: n.sigma, step: ls.thr }) : no;
        }
        case 'storage': return line && ls.lv > 0 && ls.sto < line.storage.length ? q(line.storage[ls.sto], { step: ls.sto }) : no;
        case 'boost': {
          const n = line && ls.lv > 0 && line.boosts[ls.boost];
          return n ? q(n.cost, { glyph: n.glyph, name: n.name, mult: n.mult, step: ls.boost }) : no;
        }
        case 'hire': {
          if (!line) return no;
          const def = p.managerId ? mgrById[p.managerId] : managerFor(data, line.id);
          if (!def || ls.mgr === def.id) return no;
          if (def.seasonal && !state.managers[def.id]) return no;
          return q(state.managers[def.id] ? 0 : def.hireCost, { owned: !!state.managers[def.id], managerId: def.id });
        }
        case 'managerLevel': {
          const m = state.managers[p.managerId], def = mgrById[p.managerId];
          const ML = data.managerLevels;
          if (!m || !def || m.level >= ML.max) return no;
          const base = lineById[def.lineId].managerCost;
          const cost = base * ML.cash[m.level], teeth = ML.teeth[m.level];
          return { cost, teeth, qty: 1, affordable: state.cash >= cost && state.teeth >= teeth, level: m.level + 1 };
        }
        case 'deed':
        case 'permit': {
          const d = districtById[p.districtId || p.district];
          if (!d || state.districts.includes(d.id)) return no;
          const block = permitBlock(d);
          const cost = permitCost(d);
          const reopen = state.deeds.includes(d.id);
          const gate = gateContracts(d);
          return { cost, qty: 1, affordable: !block && state.cash >= cost, blocked: block, reopen, contracts: reopen ? { ...gate, need: 0, autoClaim: [] } : gate };
        }
        case 'prestige': {
          const pv = deathPreview(state, data.bounty);
          return { cost: 0, qty: 1, affordable: pv.available, ...pv };
        }
        default: return no;
      }
    },
    stats(lineId) {
      if (lineId == null) return { nextGoal: nextGoal(), day: day(), totals: game.totals() };
      if (statsTick !== tickNo) { statsTick = tickNo; for (const k in statsCache) statsCache[k]._fresh = false; if (dirty) derive(); }
      let s = statsCache[lineId];
      if (s && s._fresh) return s;
      const line = lineById[lineId], ls = state.lines[lineId];
      if (!line) return null;
      s = statsCache[lineId] || (statsCache[lineId] = {});
      const d = D[lineId], b = state.build[lineId];
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
      s.building = b ? { stage: b.stage, stageName: data.stages[b.stage], t: b.t, T: b.T, left: buildLeft(b), p01: Math.min(1, b.t / b.T), acq: b.acq } : null;
      s.unlockable = !s.owned && !b && state.districts.includes(line.district);
      s.districtOpen = state.districts.includes(line.district);
      s.nextThroughput = line.throughput[ls.thr] || null;
      s.nextBoost = line.boosts[ls.boost] || null;
      s.boosts = ls.boost;
      s.storageLevel = ls.sto;
      s.harvest = !!state.returnHarvest[lineId];
      s.crit = d.crit;
      s.link = s.owned ? d.link : 0;
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
        globalMult: G.mult, hatMult: G.hat, bountyMult: G.bounty, teeth: state.teeth, hat: state.hat, pomfrey: state.pomfrey, own: state.own,
      };
    },
    managerSlots(level) { return managerSlots(data.managerLevels, level); },
    goals() { return { contracts: contractsView(state, data) }; },
    deathPreview() { return deathPreview(state, data.bounty); },
    hatInfo() {
      return { tier: state.hat, hat: data.hats[state.hat], next: data.hats[state.hat + 1] || null, pomfrey: state.pomfrey, pomfreyHat: data.pomfreyHats[state.pomfrey], own: state.own, frontages: data.frontages.length, mine: data.lines.length };
    },
    special() { return state.events.active.find((e) => e.special) || null; },
    nextGoal() { if (dirty) derive(); return nextGoal(); },
    day() { return day(); },
    setDayClock(fn) { clockFn = typeof fn === 'function' ? fn : null; dirty = true; },
    seasonInfo() {
      const def = seasonDef();
      if (!def) return { live: false };
      const st = seasonState(def);
      return { live: true, id: def.id, def, ecto: st.ecto, xp: st.xp, rank: st.rank, ranks: def.ranks.length, xpNext: def.ranks[st.rank]?.xp ?? null, ghost: st.ghost };
    },
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type).delete(fn);
    },
    advanceOffline(seconds) {
      wallNow = nowWall();
      const want = Math.max(0, +seconds || 0);
      let avail = want;
      let clockBack = false;
      if (wallNow > 0) {
        const start = Math.max(wallNow - want * 1000, state.clock.hi || 0);
        avail = Math.max(0, (wallNow - start) / 1000);
        clockBack = wallNow < (state.clock.hi || 0);
      }
      nightAvg = data.day.night[1] - data.day.night[0];
      derive();
      const cap = G.offlineCap;
      const sec = Math.min(cap, avail);
      const empty = { awaySec: want, creditedSec: 0, cash: 0, lines: {}, piles: 0, harvest: [], built: [], teeth: 0, capSec: cap, clockBack };
      if (sec < 5) { nightAvg = null; dirty = true; if (sec > 0) game.tick(Math.min(1, sec)); return empty; }
      checkUnlocks();
      derive();
      const report = offlineClosedForm(D, state, sec);
      const teeth0 = state.teeth;
      for (const l of data.lines) {
        const ls = state.lines[l.id], mdef = ls.mgr ? mgrById[ls.mgr] : null;
        if (ls.lv > 0 && mdef?.kind === 'teeth') {
          const n = ls.tc + sec / D[l.id].cycleSec;
          addTeeth(Math.floor(n / mdef.value), 'offline');
          ls.tc = Math.floor(n % mdef.value);
        }
      }
      report.built = [];
      const done = Object.keys(state.build).map((id) => [id, buildLeft(state.build[id])]).sort((a, b) => a[1] - b[1]);
      for (const [id, left] of done) {
        if (left > sec) { state.build[id].t += sec; updateBuild(id, false); continue; }
        state.build[id].t = state.build[id].T;
        finishBuild(id, false);
        report.built.push(id);
        const part = offlineClosedForm({ [id]: D[id] }, state, sec - left);
        report.cash += part.cash;
        report.lines[id] = part.cash;
      }
      report.teeth = state.teeth - teeth0;
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
      state.saloon.held = null;
      state.saloon.next = Math.max(state.saloon.next, simTime + 10);
      if (state.season?.ghost) state.season.ghost = null;
      expireEvents();
      state.combo.n = 0;
      report.harvest = [];
      if (sec >= 60) {
        for (const id of ownedIds()) if (state.lines[id].stock > 0) { state.returnHarvest[id] = true; report.harvest.push(id); }
      }
      if (wallNow > 0) state.clock.hi = Math.max(state.clock.hi || 0, wallNow);
      nightAvg = null;
      dirty = true;
      tickNo++;
      emit('offline', { report });
      if (sec >= 600) bark('offline_return', true);
      return report;
    },
    serialize() {
      return JSON.stringify({ game: GAME_ID, v: SAVE_VERSION, build: data.build || '', savedAt: nowWall(), simTime, seed, s: state });
    },
  };
  updateHat(true);
  derive();
  return game;
}
