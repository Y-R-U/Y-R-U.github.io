// node sim.mjs [runs] [weeks] — seeded headless games against js/sim/. No DOM, no three.
// The policy below is the harness's stand-in player, not part of the sim: it plays the §1 line.

import content from './js/sim/content.js';
import { newGame, loanOf } from './js/sim/state.js';
import { step } from './js/sim/step.js';
import { requirementsMet, costOf } from './js/sim/tactics.js';
import { createRng } from './js/sim/rng.js';

const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a));
const RUNS = parseInt(nums[0] || content.balance.targets.runs, 10);
const WEEKS = parseInt(nums[1] || '30', 10);
// --origin=silver|saved|gutter balances one difficulty; omitted runs the base numbers.
const ORIGIN = (process.argv.find(a => a.startsWith('--origin=')) || '=').split('=')[1] || null;
const TRACE = process.argv.includes('--trace');
// Three difficulties cannot share one band — easy is supposed to bust less and grow faster. An
// origin carries its own bust / share targets and they replace the base ones when it is selected.
const ORIGIN_T = ORIGIN ? (content.get('origin', ORIGIN)?.targets || null) : null;
const BUST_T = ORIGIN_T?.bust || content.balance.targets.bustRate;
const SHARE_T = ORIGIN_T?.share13 || content.balance.targets.shareAtWeek13;
const T = k => ORIGIN_T?.[k] ?? content.balance.targets[k];
const BUSTS = process.argv.includes('--busts');
// The yard discounts hulls and a broker can be talked down, so the price the live game charges is
// below the board. --yardcut models that as one multiplier on every hull the stand-in buys; it is
// the only way the harness can see a change that happens entirely in the UI.
const YARDCUT_ARG = parseFloat((process.argv.find(a => a.startsWith('--yardcut=')) || '=').split('=')[1]);
const YARDCUT = Number.isFinite(YARDCUT_ARG) ? YARDCUT_ARG : 1;
const hullCost = def => Math.round(def.cost * YARDCUT);
const buyHull = cls => ({ type: 'buyShip', class: cls, price: hullCost(content.get('ship', cls)) });
const TRACE_SEED = parseInt((process.argv.find(a => a.startsWith('--seed=')) || '=1').split('=')[1], 10);

const b = content.balance;
const f = (v, d = 1) => (v * 100).toFixed(d) + '%';
const k = v => Math.round(v).toLocaleString('en-US');

// Five stand-in players so the distribution is a distribution and not one deterministic line.
// `bands` is which tactic bands the style will touch — greedy skips the price war and saves
// for the cartel, which is the only way a stand-in ever reaches the illegal branch.
const LEGAL = ['legal'];
const BAND_RISK = { legal: 0, grey: 1, illegal: 2 };
// drawTo is how much of the credit line the style will actually use. A cautious operator does not
// draw the last of it to replace a hull, and that reluctance is most of what keeps it alive.
const STYLES = [
  { id: 'cautious', floor: 6000, coilWeek: 7, bands: LEGAL, extraRig: false, repayAbove: 15000, drawTo: 0.62 },
  { id: 'standard', floor: 3000, coilWeek: 5, bands: LEGAL, extraRig: false, repayAbove: 22000, drawTo: 0.74 },
  { id: 'aggressive', floor: 500, coilWeek: 4, bands: ['legal', 'grey'], extraRig: true, drawTo: 1 },
  { id: 'greedy', floor: 500, coilWeek: 4, bands: ['legal', 'illegal'], extraRig: true, drawTo: 1 },
  { id: 'reckless', floor: 1500, coilWeek: 1, bands: ['legal', 'grey', 'illegal'], extraRig: true, drawTo: 1, maxOut: true },
];

function policy(state, style) {
  const acts = [];
  // Nobody is handed a fleet any more: week 0 is a shopping trip, and borrowing to finish it is
  // the intended opening move for the origins that cannot cover a rig and a hauler outright.
  if (state.week === 0) {
    const acts = [];
    const rig = content.get('ship', 'ossa');
    const kite = content.get('ship', 'kite');
    let cash = state.cash;
    let debt = state.debt;
    // a rig with nothing to carry its ore earns exactly nothing, so one of each is the minimum
    // viable company and gets bought even if it takes the whole reserve. Extra hulls have to
    // leave RUNWAY behind them — the company burns for ~6 weeks before the first load sells.
    const RUNWAY = 15000;
    const need = rig.cost + kite.cost + 12000;
    if (cash < need && debt < loanOf(state).maxDraw * 0.7) {
      const want = need - cash;
      acts.push({ type: 'loan', amount: want });
      cash += want;
      debt += want;
    }
    if (cash >= hullCost(rig)) { acts.push(buyHull('ossa')); cash -= hullCost(rig); }
    if (cash >= hullCost(kite)) { acts.push(buyHull('kite')); cash -= hullCost(kite); }
    while (cash >= hullCost(kite) + RUNWAY && acts.filter(a => a.type === 'buyShip').length < (style.extraRig ? 3 : 2)) {
      acts.push(buyHull('kite'));
      cash -= hullCost(kite);
    }
    return acts;
  }
  // week 1 routes whatever arrived in the yard
  if (state.week === 1) {
    return state.ships.map(sh => ({
      type: 'route', ship: sh.id,
      legs: content.get('ship', sh.class).mine > 0 ? ['ledger', 'kestrel'] : ['ledger', 'ossian'],
    }));
  }

  const loan = loanOf(state);
  const cap = loan.maxDraw * (style.drawTo ?? 1);
  // the fee comes out of the proceeds, so a draw for exactly the shortfall lands short of it
  const draw = need => (need - state.cash) / (1 - (loan.drawFee || 0));
  // every hull, not just a rig — a hauler bought at week 6 and never given a loop is 18k of
  // upkeep that earns nothing, and no player would leave it parked
  for (const sh of state.ships) {
    if (sh.route) continue;
    acts.push({ type: 'route', ship: sh.id, legs: content.get('ship', sh.class).mine > 0 ? ['ledger', 'kestrel'] : ['ledger', 'ossian'] });
  }
  const mods = state.sites.ledger.modules;
  const coil = content.get('module', 'coilline');
  // a lost hull is unrecoverable if nobody ever replaces it, and every stand-in would
  const miners = state.ships.filter(sh => content.get('ship', sh.class).mine > 0).length;
  // A rig with nothing to carry for it earns nothing and neither does a hauler with nothing to
  // load, so getting back to one of each comes before everything, including the line, and neither
  // the coil reserve nor the style's own caution stands in the way of it.
  const crippled = miners < 1 || state.ships.length - miners < 1;
  // The line comes before a third hull, and it is the one thing every stand-in borrows for.
  // Six tonnes of filament is worth three loads of halide and rides in the same hold, so a hauler
  // bought first is 18k spent moving cargo that does not exist yet. The draw and the purchase go
  // in the same tick, or the week's costs eat the money on the way past and the company borrows
  // the same 17k forever without ever owning anything.
  if (!mods.includes('coilline') && !crippled && state.week >= style.coilWeek) {
    const buy = { type: 'buyModule', module: 'coilline', site: 'ledger' };
    if (state.cash >= coil.cost + style.floor) { acts.push(buy); return acts; }
    if (state.debt < loan.maxDraw * 0.9) {
      acts.push({ type: 'loan', amount: draw(coil.cost + style.floor) }, buy);
      return acts;
    }
  }
  const held = mods.includes('coilline') || crippled ? 0 : coil.cost;
  if (state.ships.length < (style.extraRig ? 4 : 3)) {
    const cls = miners < 1 ? 'ossa' : 'kite';
    const def = content.get('ship', cls);
    const line = crippled ? loan.maxDraw : cap;
    if (state.cash >= hullCost(def) + style.floor + held) acts.push(buyHull(cls));
    else if (state.debt < line) acts.push({ type: 'loan', amount: draw(hullCost(def) + style.floor + held) });
  }
  // maxOut draws the whole line at week two and never pays a credit of it back. It used to buy a
  // Dock Bay and a refinery it had no ore to feed as well, which left it permanently overdrawn —
  // and an unlock is gated on cash in hand, so it went whole games without being shown a tactic.
  if (style.maxOut && state.debt < cap) acts.push({ type: 'loan', amount: loan.maxDraw });
  // a real player borrows against the credit line to take the deal, which is what it is for
  const want = state.tactics.offered.find(id => !state.tactics.owned.includes(id));
  if (want) {
    const t = content.get('tactic', want);
    const need = Math.max(costOf(state, t) + style.floor, t.unlock.cash || 0);
    if (state.cash < need && state.debt < cap) acts.push({ type: 'loan', amount: draw(need) });
  }
  // riskiest affordable band first, not content order — content order made a cheap early grey
  // tactic hide everything after it from every style that could take one (gotcha 62)
  const pick = state.tactics.unlocked
    .filter(id => !state.tactics.owned.includes(id))
    .map(id => content.get('tactic', id))
    .filter(t => style.bands.includes(t.band) && state.cash >= costOf(state, t) + style.floor && requirementsMet(state, t))
    .sort((a, c) => BAND_RISK[c.band] - BAND_RISK[a.band])[0];
  if (pick) acts.push({ type: 'tactic', tactic: pick.id });
  if (state.cash < style.floor && state.debt < cap) acts.push({ type: 'loan', amount: 15000 });
  // paying the line down is the only move that lowers shock exposure, so at least one stand-in
  // has to make it or the deck has nothing to reward. Only the draw ABOVE the founding loan, and
  // never in a week that already borrowed or bought — the two actions cancelled and churned the
  // 2% draw fee.
  const excess = state.debt - (state.startDebt ?? b.start.debt);
  if (style.repayAbove && excess > 0 && !acts.length && state.cash > style.repayAbove) {
    acts.push({ type: 'repay', amount: Math.min(excess, state.cash - style.repayAbove) });
  }
  return acts;
}

function run(seed, opts = {}) {
  const rng = createRng(seed);
  let state = newGame(seed, 'tamber', ORIGIN);
  const style = opts.style || STYLES[seed % STYLES.length];
  const seen = {
    style: style.id, offerWeek: null, coilWeek: null, tacticWeek: null, unlockWeek: null,
    investigations: 0, quarters: [], peakHeat: 0,
    greyUnlockWeek: null, greyTakeWeek: null, illegalUnlockWeek: null, illegalTakeWeek: null,
    caughtAfterIllegal: false, banned: false, bustAfterFine: false, lastFineWeek: null,
    metBy20: 0, shocks: [], shockCash: 0, warns: {}, warnWeeks: {}, bustAfterShock: false, lastShockWeek: null,
  };
  const trace = [];
  for (let w = 0; w < WEEKS; w++) {
    const acts = policy(state, style);
    const r = step(state, { actions: acts, rng });
    state = r.state;
    for (const e of r.events) {
      if (e.t === 'offer' && seen.offerWeek === null) seen.offerWeek = e.week;
      if (e.t === 'unlock' && e.tactic === b.offer.tactic && seen.unlockWeek === null) seen.unlockWeek = e.week;
      if (e.t === 'unlock' && e.band === 'grey' && seen.greyUnlockWeek === null) seen.greyUnlockWeek = e.week;
      if (e.t === 'unlock' && e.band === 'illegal' && seen.illegalUnlockWeek === null) seen.illegalUnlockWeek = e.week;
      if (e.t === 'tactic' && e.band === 'grey' && seen.greyTakeWeek === null) seen.greyTakeWeek = e.week;
      if (e.t === 'tactic' && e.band === 'illegal' && seen.illegalTakeWeek === null) seen.illegalTakeWeek = e.week;
      if (e.t === 'module' && e.module === 'coilline') seen.coilWeek = e.week;
      if (e.t === 'tactic' && e.tactic === b.offer.tactic) seen.tacticWeek = e.week;
      if (e.t === 'investigate') {
        seen.investigations++;
        seen.lastFineWeek = e.week;
        seen.cashAtCatch = state.cash + e.fine;
        seen.catchBand = e.band;
        if (e.banned) seen.banned = true;
        if (e.band === 'illegal') seen.caughtAfterIllegal = true;
      }
      if (e.t === 'lose' && seen.lastFineWeek !== null && e.week - seen.lastFineWeek <= 2) seen.bustAfterFine = true;
      if (e.t === 'lose' && seen.lastShockWeek !== null && e.week - seen.lastShockWeek <= 2) seen.bustAfterShock = true;
      if (e.t === 'unlock' && e.week <= 20) seen.metBy20++;
      if (e.t === 'shock') { seen.shocks.push(e.id); seen.shockCash += e.cash; seen.lastShockWeek = e.week; }
      if (e.t === 'warn') seen.warns[e.level] = (seen.warns[e.level] || 0) + 1;
      if (e.t === 'quarter') seen.quarters.push(e);
    }
    seen.peakHeat = Math.max(seen.peakHeat, state.heat);
    for (const wn of state.warnings || []) seen.warnWeeks[wn.level] = (seen.warnWeeks[wn.level] || 0) + 1;
    if (opts.trace) trace.push({ week: state.week, events: r.events, snap: snapshot(state) });
    if (state.week === (b.targets.shareAtWeek || 13)) { seen.shareAt13 = state.share.player; seen.cashAt13 = state.cash; }
    if (state.over) break;
  }
  return { state, seen, trace };
}

function snapshot(s) {
  return {
    cash: Math.round(s.cash), debt: Math.round(s.debt), share: +(s.share.player * 100).toFixed(1),
    rival: +(s.share.rival * 100).toFixed(1), heat: Math.round(s.heat),
    stock: Object.fromEntries(Object.entries(s.sites.ledger.stock).map(([k, v]) => [k, Math.round(v)])),
    prices: Object.fromEntries(Object.entries(s.market).map(([k, v]) => [k, Math.round(v.price)])),
  };
}

function pct(arr, p) {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
}

function histogram(vals, lo, hi) {
  const h = {};
  for (let i = lo; i <= hi; i++) h[i] = 0;
  h.late = 0; h.never = 0;
  for (const v of vals) {
    if (v === null) h.never++;
    else if (v > hi) h.late++;
    else if (v >= lo) h[v]++;
    else h[lo] += 0, h[v] = (h[v] || 0) + 1;
  }
  return h;
}

if (process.argv.includes('--selftest')) {
  const fail = [];
  const ok = (name, cond) => { if (!cond) fail.push(name); console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`); };

  const rng = createRng(7);
  // no origin is handed a fleet any more, so a test that needs a hull has to buy one first
  const withFleet = seed => {
    const g = newGame(seed);
    g.cash += 60000;
    return step(g, { actions: [{ type: 'buyShip', class: 'kite' }, { type: 'buyShip', class: 'ossa' }], rng }).state;
  };

  let st = withFleet(7);
  const before = JSON.stringify(st);
  const out = step(st, { actions: [{ type: 'route', ship: st.ships[0].id, legs: ['ledger', 'ossian'] }], rng });
  ok('step does not mutate its input state', JSON.stringify(st) === before);
  ok('step returns a new state object', out.state !== st);
  ok('step returns events', Array.isArray(out.events) && out.events.length > 0);
  ok('every event carries t and week', out.events.every(e => e.t && typeof e.week === 'number'));

  const holdShare = (s2, x) => { s2.share.player = x; s2.hist.player = s2.hist.player.map(() => x * b.share.reachTotal); };

  st = newGame(8);
  holdShare(st, 0.40); st.cash = 200000;
  for (let i = 0; i < 4; i++) { st = step(st, { actions: [], rng }).state; st.cash = 200000; holdShare(st, 0.40); }
  st = step(st, { actions: [{ type: 'tactic', tactic: 'spec_collusion' }], rng }).state;
  ok('illegal tactic activates', st.tactics.active.some(a => a.id === 'spec_collusion'));
  ok('rival mood switches to cartel', st.rival.mood === 'cartel');
  let sawInvestigate = false, sawBan = false;
  for (let i = 0; i < 60 && !sawInvestigate; i++) {
    const r = step(st, { actions: [], rng });
    st = r.state;
    for (const e of r.events) if (e.t === 'investigate') { sawInvestigate = true; sawBan = e.banned; }
  }
  ok('heat crosses the threshold and an investigation fires', sawInvestigate);
  ok('spec_collusion bans on conviction', sawBan && st.tactics.banned.includes('spec_collusion'));

  st = newGame(11);
  st.week = b.shock.graceWeeks;
  st.debt = b.loan.maxDraw; st.cash = -b.loan.debtLimit * 0.4; st.lastCosts = 4000;
  let shockEv = null;
  for (let i = 0; i < 200 && !shockEv; i++) {
    const r = step(st, { actions: [], rng });
    st = r.state; st.cash = -b.loan.debtLimit * 0.4; st.over = null;
    shockEv = r.events.find(e => e.t === 'shock') || null;
  }
  ok('a shock fires for an overextended company', !!shockEv);
  ok('shock carries the render contract', !!shockEv && typeof shockEv.id === 'string'
    && typeof shockEv.title === 'string' && typeof shockEv.body === 'string'
    && typeof shockEv.cash === 'number' && typeof shockEv.week === 'number');
  ok('shock body has no unfilled tokens', !!shockEv && !/\{\w+\}/.test(shockEv.body));

  st = newGame(12);
  st.cash = -b.loan.debtLimit * 0.7; st.lastCosts = 4000;
  const wr = step(st, { actions: [], rng });
  const wev = wr.events.filter(e => e.t === 'warn');
  ok('a broke company is warned about its debt', wev.some(e => e.level === 'debt'));
  ok('warn carries the render contract', wev.every(e => e.id && e.level && typeof e.body === 'string'));
  ok('state.warnings is the standing set', Array.isArray(wr.state.warnings) && wr.state.warnings.length > 0);

  st = withFleet(13);
  st.ships[0].laidUp = 3;
  st.ships[0].route = ['ledger', 'ossian'];
  const lr = step(st, { actions: [], rng });
  ok('a laid-up hull does not depart', !lr.events.some(e => e.t === 'depart' && e.ship === st.ships[0].id));

  st = newGame(9);
  st.cash = -b.loan.debtLimit + 100;
  let sawLose = false;
  for (let i = 0; i < 6 && !sawLose; i++) {
    const r = step(st, { actions: [], rng });
    st = r.state;
    for (const e of r.events) if (e.t === 'lose') sawLose = true;
  }
  ok('bust fires when cash falls past the debt limit', sawLose && st.over === 'bust');

  st = newGame(10);
  holdShare(st, 0.60);
  for (let i = 0; i < 4; i++) { st = step(st, { actions: [], rng }).state; holdShare(st, 0.60); }
  st.week = b.win.checkFromWeek - 1;
  let sawWin = false;
  for (let i = 0; i < 10 && !sawWin; i++) {
    const r = step(st, { actions: [], rng });
    st = r.state;
    for (const e of r.events) if (e.t === 'win') sawWin = true;
    if (!sawWin) holdShare(st, 0.60);
  }
  ok('monopoly win fires after the hold streak', sawWin);

  console.log(fail.length ? `\n${fail.length} SELFTEST FAILURES` : '\nselftest clean');
  process.exit(fail.length ? 1 : 0);
}

if (TRACE) {
  const { trace, seen } = run(TRACE_SEED, { trace: true, style: STYLES[(process.argv.find(a=>a.startsWith('--style='))||'=1').split('=')[1]|0] });
  for (const t of trace) {
    const evs = t.events.filter(e => e.t !== 'price' && e.t !== 'share' && e.t !== 'cost');
    const line = evs.map(e => {
      if (e.t === 'depart') return `depart ${e.ship}→${e.to}`;
      if (e.t === 'arrive') return `arrive ${e.ship}@${e.site}`;
      if (e.t === 'mine') return `mine ${e.units}t${e.rich ? ' RICH' : ''}`;
      if (e.t === 'load') return `load ${JSON.stringify(e.cargo)}`;
      if (e.t === 'refine') return `refine ${e.units} ${e.into}`;
      if (e.t === 'deliver') return `DELIVER ${e.units} ${e.commodity} @${e.price} = ${e.credits}`;
      if (e.t === 'rival') return `RIVAL ${e.action}`;
      if (e.t === 'unlock') return `UNLOCK ${e.tactic}`;
      if (e.t === 'offer') return `*** OFFER ${e.tactic} (${e.brand}) ***`;
      if (e.t === 'tactic') return `*** TAKE ${e.tactic} ***`;
      if (e.t === 'module') return `*** BUILD ${e.module} (${e.cost}) ***`;
      if (e.t === 'quarter') return `=== QUARTER ${e.quarter}: you ${(e.share.player * 100).toFixed(1)}% them ${(e.share.rival * 100).toFixed(1)}% cash ${e.cash} ===`;
      return `${e.t}${e.tactic ? ' ' + e.tactic : ''}`;
    }).join(' | ');
    console.log(`w${String(t.week).padStart(2)} ${String(t.snap.share).padStart(5)}% r${String(t.snap.rival).padStart(5)}% cash ${String(t.snap.cash).padStart(7)} | ${line}`);
  }
  console.log('seen:', JSON.stringify(seen.quarters.length ? { ...seen, quarters: seen.quarters.length } : seen));
  process.exit(0);
}

const offerWeeks = [], share13 = [], cash13 = [], cashEnd = [], shareEnd = [];
const outcomes = {}; let busts = 0, coilBuilt = 0, tookDeal = 0, investigations = 0;
let coilWeeks = [], offerInWindow = 0;
const byStyle = {};
const grey = { unlocked: 0, unlockWeeks: [], taken: 0, by13: 0, by16: 0 };
const illegal = { unlocked: 0, unlockWeeks: [], taken: 0, caught: 0, banned: 0 };
let bustAfterFine = 0, peakHeats = [], catchCash = [], catchCashIllegal = [];
const metBy20 = [], shockCounts = [], shockDeck = {};
let investigatedOnce = 0, bustAfterShock = 0;
const warnWeeks = { debt: [], heat: [], contract: [] };

for (let i = 0; i < RUNS; i++) {
  const { state, seen } = run(1000 + i);
  offerWeeks.push(seen.offerWeek);
  if (seen.greyUnlockWeek !== null) {
    grey.unlocked++; grey.unlockWeeks.push(seen.greyUnlockWeek);
    if (seen.greyUnlockWeek <= 13) grey.by13++;
    if (seen.greyUnlockWeek <= 16) grey.by16++;
  }
  if (seen.greyTakeWeek !== null) grey.taken++;
  if (seen.illegalUnlockWeek !== null) { illegal.unlocked++; illegal.unlockWeeks.push(seen.illegalUnlockWeek); }
  if (seen.illegalTakeWeek !== null) {
    illegal.taken++;
    if (seen.caughtAfterIllegal) illegal.caught++;
    if (seen.banned) illegal.banned++;
  }
  if (seen.bustAfterFine) bustAfterFine++;
  if (seen.bustAfterShock) bustAfterShock++;
  if (seen.investigations > 0) investigatedOnce++;
  metBy20.push(seen.metBy20);
  shockCounts.push(seen.shocks.length);
  for (const id of seen.shocks) shockDeck[id] = (shockDeck[id] || 0) + 1;
  for (const lvl of Object.keys(warnWeeks)) warnWeeks[lvl].push(seen.warnWeeks[lvl] || 0);
  if (seen.cashAtCatch != null) (seen.catchBand === 'illegal' ? catchCashIllegal : catchCash).push(seen.cashAtCatch);
  peakHeats.push(seen.peakHeat);
  if (seen.offerWeek !== null && seen.offerWeek >= b.offer.weekMin && seen.offerWeek <= b.offer.weekMax) offerInWindow++;
  if (seen.shareAt13 != null) { share13.push(seen.shareAt13); cash13.push(seen.cashAt13); }
  if (seen.coilWeek) { coilBuilt++; coilWeeks.push(seen.coilWeek); }
  if (seen.tacticWeek) tookDeal++;
  investigations += seen.investigations;
  cashEnd.push(state.cash);
  shareEnd.push(state.share.player);
  if (BUSTS && (state.over === 'bust' || state.over === 'banned')) {
    const last = state.log.filter(e => e.t === 'shock' || e.t === 'investigate').slice(-2).map(e => `${e.t}:${e.id || e.tactic}@w${e.week}`).join(' ');
    console.log(`  bust seed ${1000 + i} ${seen.style.padEnd(11)} w${state.week} cash ${k(state.cash)} debt ${k(state.debt)} ships ${state.ships.length} | ${last}`);
  }
  const o = state.over || 'running';
  outcomes[o] = (outcomes[o] || 0) + 1;
  byStyle[seen.style] = byStyle[seen.style] || { n: 0, bust: 0, offer: 0, share13: [], shocks: 0, met20: [], invest: 0 };
  const bs = byStyle[seen.style];
  bs.n++;
  bs.shocks += seen.shocks.length;
  bs.met20.push(seen.metBy20);
  if (seen.investigations > 0) bs.invest++;
  if (state.over === 'bust' || state.over === 'banned') bs.bust++;
  if (seen.offerWeek !== null && seen.offerWeek >= b.offer.weekMin && seen.offerWeek <= b.offer.weekMax) bs.offer++;
  if (seen.shareAt13 != null) bs.share13.push(seen.shareAt13);
  if (state.over === 'bust' || state.over === 'banned') busts++;
}


console.log(`MONOPOLE — ${RUNS} seeded games, ${WEEKS} weeks each\n`);
console.log('offer week histogram (exclusive_supply):');
const h = histogram(offerWeeks, 6, 16);
console.log('  ' + Object.entries(h).filter(([, n]) => n > 0).map(([w, n]) => `${w}:${n}`).join('  '));
console.log(`  in window ${b.offer.weekMin}-${b.offer.weekMax}: ${offerInWindow}/${RUNS} = ${f(offerInWindow / RUNS)}`);
console.log(`  coil line built in ${coilBuilt}/${RUNS} (median week ${pct(coilWeeks, 0.5)}), deal taken ${tookDeal}/${RUNS}`);
console.log('');
console.log('player share at week 13:');
console.log(`  p10 ${f(pct(share13, 0.1))}  p25 ${f(pct(share13, 0.25))}  median ${f(pct(share13, 0.5))}  p75 ${f(pct(share13, 0.75))}  p90 ${f(pct(share13, 0.9))}`);
console.log(`  in band ${f(SHARE_T.min, 0)}-${f(SHARE_T.max, 0)}: ${share13.filter(v => v >= SHARE_T.min && v <= SHARE_T.max).length}/${share13.length}`);
console.log('');
console.log('cash:');
console.log(`  week 13   p10 ${k(pct(cash13, 0.1))}  median ${k(pct(cash13, 0.5))}  p90 ${k(pct(cash13, 0.9))}`);
console.log(`  week ${WEEKS}   p10 ${k(pct(cashEnd, 0.1))}  median ${k(pct(cashEnd, 0.5))}  p90 ${k(pct(cashEnd, 0.9))}`);
console.log(`  share w${WEEKS} p10 ${f(pct(shareEnd, 0.1))}  median ${f(pct(shareEnd, 0.5))}  p90 ${f(pct(shareEnd, 0.9))}`);
console.log('');
console.log('by style:');
for (const [name, v] of Object.entries(byStyle)) {
  console.log(`  ${name.padEnd(11)} n ${v.n}  bust ${f(v.bust / v.n).padStart(6)}  shocks/run ${(v.shocks / v.n).toFixed(2)}  median tactics met by w20 ${pct(v.met20, 0.5)}  investigated ${f(v.invest / v.n).padStart(6)}  median share w13 ${f(pct(v.share13, 0.5))}`);
}
console.log('');
console.log('shocks and warnings:');
console.log(`  shocks per run   p10 ${pct(shockCounts, 0.1)}  median ${pct(shockCounts, 0.5)}  p90 ${pct(shockCounts, 0.9)}  (total ${shockCounts.reduce((a, x) => a + x, 0)})`);
console.log('  deck draws:      ' + Object.entries(shockDeck).sort((a, c) => c[1] - a[1]).map(([id, n]) => `${id}:${n}`).join('  '));
console.log(`  busts within 2 weeks of a shock: ${bustAfterShock}`);
console.log('  weeks under a standing warning, per run:  ' + Object.entries(warnWeeks).map(([lvl, v]) => `${lvl} p50 ${pct(v, 0.5)} p90 ${pct(v, 0.9)}`).join('   ') + `  (of ${WEEKS})`);
console.log('');
console.log('content reach:');
console.log(`  tactics met by week 20   p10 ${pct(metBy20, 0.1)}  median ${pct(metBy20, 0.5)}  p90 ${pct(metBy20, 0.9)}  (of ${content.all('tactic').length})`);
console.log(`  investigated at least once ${investigatedOnce}/${RUNS} = ${f(investigatedOnce / RUNS)}`);
console.log('');
console.log('the shady half:');
console.log(`  grey unlocked    ${grey.unlocked}/${RUNS} = ${f(grey.unlocked / RUNS)}  (median week ${pct(grey.unlockWeeks, 0.5)}, by w13 ${f(grey.by13 / RUNS)}, by w16 ${f(grey.by16 / RUNS)})`);
console.log(`  grey taken       ${grey.taken}/${RUNS} = ${f(grey.taken / RUNS)}`);
console.log(`  illegal unlocked ${illegal.unlocked}/${RUNS} = ${f(illegal.unlocked / RUNS)}  (median week ${pct(illegal.unlockWeeks, 0.5)})`);
console.log(`  illegal taken    ${illegal.taken}/${RUNS} = ${f(illegal.taken / RUNS)}, caught ${illegal.caught} = ${f(illegal.caught / Math.max(1, illegal.taken))} of takers, banned ${illegal.banned}`);
console.log(`  peak heat        p50 ${Math.round(pct(peakHeats, 0.5))}  p90 ${Math.round(pct(peakHeats, 0.9))}  (threshold ${b.heat.threshold})`);
console.log(`  cash the week the fine lands, pre-fine — grey    p10 ${k(pct(catchCash, 0.1))}  p50 ${k(pct(catchCash, 0.5))}  p90 ${k(pct(catchCash, 0.9))}`);
console.log(`                                          illegal p10 ${k(pct(catchCashIllegal, 0.1))}  p50 ${k(pct(catchCashIllegal, 0.5))}  p90 ${k(pct(catchCashIllegal, 0.9))}`);
console.log('');
console.log(`outcomes: ${JSON.stringify(outcomes)}   investigations ${investigations}   busts within 2 weeks of a fine ${bustAfterFine}`);
console.log('');

const medShare13 = pct(share13, 0.5);
const greyRate = grey.unlocked / RUNS;
const rate = ids => {
  const g = ids.map(id => byStyle[id]).filter(Boolean);
  const n = g.reduce((a, v) => a + v.n, 0);
  return n ? g.reduce((a, v) => a + v.bust, 0) / n : 0;
};
const careful = rate(['cautious', 'standard']);
const careless = rate(['greedy', 'reckless']);
const caughtRate = illegal.taken ? illegal.caught / illegal.taken : 0;
const checks = [
  [`offer in weeks ${b.offer.weekMin}-${b.offer.weekMax}`, offerInWindow / RUNS, T('offerByWeek13'), v => v >= T('offerByWeek13'), f],
  ['bust rate', busts / RUNS, BUST_T, v => v >= BUST_T.min && v <= BUST_T.max, f],
  [`median share at week ${b.targets.shareAtWeek || 13}`, medShare13, SHARE_T, v => v >= SHARE_T.min && v <= SHARE_T.max, f],
  ['grey tactic reachable', greyRate, T('greyReachable'), v => v >= T('greyReachable'), f],
  ['grey reachable by week 16', grey.by16 / RUNS, T('greyReachableByWeek16'), v => v >= T('greyReachableByWeek16'), f],
  ['illegal tactic taken', illegal.taken / RUNS, T('illegalTaken'), v => v >= T('illegalTaken'), f],
  ['caught, of runs that went illegal', caughtRate, T('caughtWhenIllegal'), v => v >= T('caughtWhenIllegal').min && v <= T('caughtWhenIllegal').max, f],
  ['median tactics met by week 20', pct(metBy20, 0.5), b.targets.tacticsByWeek20, v => v >= b.targets.tacticsByWeek20, String],
  ['investigated at least once', investigatedOnce / RUNS, b.targets.investigatedOnce, v => v >= b.targets.investigatedOnce, f],
  ['careful bust rate', careful, T('carefulBustMax'), v => v <= T('carefulBustMax'), f],
  ['careless bust rate', careless, T('carelessBustMin'), v => v >= T('carelessBustMin'), f],
];
let pass = true;
for (const [name, val, target, ok, fmt] of checks) {
  const good = ok(val);
  if (!good) pass = false;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}: ${fmt(val)} (target ${typeof target === 'object' ? `${fmt(target.min)}–${fmt(target.max)}` : fmt(target)})`);
}
console.log('');
console.log(pass ? 'ALL TARGETS MET' : 'TARGETS NOT MET');
process.exitCode = pass ? 0 : 1;
