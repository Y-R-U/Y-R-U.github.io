// node sim.mjs [runs] [weeks] — seeded headless games against js/sim/. No DOM, no three.
// The policy below is the harness's stand-in player, not part of the sim: it plays the §1 line.

import content from './js/sim/content.js';
import { newGame } from './js/sim/state.js';
import { step } from './js/sim/step.js';
import { requirementsMet } from './js/sim/tactics.js';
import { createRng } from './js/sim/rng.js';

const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a));
const RUNS = parseInt(nums[0] || content.balance.targets.runs, 10);
const WEEKS = parseInt(nums[1] || '30', 10);
const TRACE = process.argv.includes('--trace');
const BUSTS = process.argv.includes('--busts');
const TRACE_SEED = parseInt((process.argv.find(a => a.startsWith('--seed=')) || '=1').split('=')[1], 10);

const b = content.balance;
const f = (v, d = 1) => (v * 100).toFixed(d) + '%';
const k = v => Math.round(v).toLocaleString('en-US');

// Five stand-in players so the distribution is a distribution and not one deterministic line.
// `bands` is which tactic bands the style will touch — greedy skips the price war and saves
// for the cartel, which is the only way a stand-in ever reaches the illegal branch.
const LEGAL = ['legal'];
const BAND_RISK = { legal: 0, grey: 1, illegal: 2 };
const STYLES = [
  { id: 'cautious', floor: 6000, coilWeek: 7, bands: LEGAL, extraRig: false, repayAbove: 15000 },
  { id: 'standard', floor: 3000, coilWeek: 5, bands: LEGAL, extraRig: false, repayAbove: 22000 },
  { id: 'aggressive', floor: 500, coilWeek: 4, bands: ['legal', 'grey'], extraRig: true },
  { id: 'greedy', floor: 500, coilWeek: 4, bands: ['legal', 'illegal'], extraRig: true },
  { id: 'reckless', floor: 0, coilWeek: 1, bands: ['legal', 'grey', 'illegal'], extraRig: true, sprawl: true },
];

function policy(state, style) {
  const acts = [];
  if (state.week === 0) {
    for (const sh of state.ships) {
      const def = content.get('ship', sh.class);
      acts.push({ type: 'route', ship: sh.id, legs: def.mine > 0 ? ['ledger', 'kestrel'] : ['ledger', 'ossian'] });
    }
    if (style.extraRig) acts.push({ type: 'loan', amount: 30000 });
    return acts;
  }
  if (style.extraRig && state.week === 1) {
    acts.push({ type: 'buyShip', class: 'ossa' });
    return acts;
  }
  const newRig = state.ships.find(sh => !sh.route && content.get('ship', sh.class).mine > 0);
  if (newRig) acts.push({ type: 'route', ship: newRig.id, legs: ['ledger', 'kestrel'] });
  // a lost hull is unrecoverable if nobody ever replaces it, and every stand-in would
  const miners = state.ships.filter(sh => content.get('ship', sh.class).mine > 0).length;
  if (state.ships.length < b.start.ships.length) {
    const cls = miners < 1 ? 'ossa' : 'kite';
    const def = content.get('ship', cls);
    if (state.cash >= def.cost + style.floor) acts.push({ type: 'buyShip', class: cls });
    else if (state.debt < b.loan.maxDraw) acts.push({ type: 'loan', amount: def.cost + style.floor - state.cash });
  }
  if (style.sprawl) {
    if (state.debt < b.loan.maxDraw) acts.push({ type: 'loan', amount: b.loan.maxDraw });
    if (state.week === 3) acts.push({ type: 'buyShip', class: 'kite' });
    if (state.week === 4) acts.push({ type: 'buyModule', module: 'bay', site: 'ledger' });
    if (state.week === 5) acts.push({ type: 'buyModule', module: 'refinery', site: 'ledger' });
    const idle = state.ships.find(sh => !sh.route && content.get('ship', sh.class).mine === 0);
    if (idle) acts.push({ type: 'route', ship: idle.id, legs: ['ledger', 'ossian'] });
  }

  const mods = state.sites.ledger.modules;
  const coil = content.get('module', 'coilline');
  if (!mods.includes('coilline') && state.week >= style.coilWeek && state.cash >= coil.cost + style.floor) {
    acts.push({ type: 'buyModule', module: 'coilline', site: 'ledger' });
    return acts;
  }
  // a real player borrows against the credit line to take the deal, which is what it is for
  const want = state.tactics.offered.find(id => !state.tactics.owned.includes(id));
  if (want) {
    const t = content.get('tactic', want);
    const need = Math.max(t.cost + style.floor, t.unlock.cash || 0);
    if (state.cash < need && state.debt < b.loan.maxDraw) acts.push({ type: 'loan', amount: need - state.cash });
  }
  // riskiest affordable band first, not content order — content order made a cheap early grey
  // tactic hide everything after it from every style that could take one (gotcha 62)
  const pick = state.tactics.unlocked
    .filter(id => !state.tactics.owned.includes(id))
    .map(id => content.get('tactic', id))
    .filter(t => style.bands.includes(t.band) && state.cash >= t.cost + style.floor && requirementsMet(state, t))
    .sort((a, c) => BAND_RISK[c.band] - BAND_RISK[a.band])[0];
  if (pick) acts.push({ type: 'tactic', tactic: pick.id });
  if (state.cash < style.floor && state.debt < b.loan.maxDraw) acts.push({ type: 'loan', amount: 15000 });
  // paying the line down is the only move that lowers shock exposure, so at least one stand-in
  // has to make it or the deck has nothing to reward. Only the draw ABOVE the founding loan, and
  // never in a week that already borrowed or bought — the two actions cancelled and churned the
  // 2% draw fee.
  const excess = state.debt - b.start.debt;
  if (style.repayAbove && excess > 0 && !acts.length && state.cash > style.repayAbove) {
    acts.push({ type: 'repay', amount: Math.min(excess, state.cash - style.repayAbove) });
  }
  return acts;
}

function run(seed, opts = {}) {
  const rng = createRng(seed);
  let state = newGame(seed);
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
    if (state.week === 13) { seen.shareAt13 = state.share.player; seen.cashAt13 = state.cash; }
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

  let st = newGame(7);
  const before = JSON.stringify(st);
  const rng = createRng(7);
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

  st = newGame(13);
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
console.log(`  in band ${f(b.targets.shareAtWeek13.min, 0)}-${f(b.targets.shareAtWeek13.max, 0)}: ${share13.filter(v => v >= b.targets.shareAtWeek13.min && v <= b.targets.shareAtWeek13.max).length}/${share13.length}`);
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
  ['offer in weeks 9-13', offerInWindow / RUNS, b.targets.offerByWeek13, v => v >= b.targets.offerByWeek13, f],
  ['bust rate', busts / RUNS, b.targets.bustRate, v => v >= b.targets.bustRate.min && v <= b.targets.bustRate.max, f],
  ['median share at week 13', medShare13, b.targets.shareAtWeek13, v => v >= b.targets.shareAtWeek13.min && v <= b.targets.shareAtWeek13.max, f],
  ['grey tactic reachable', greyRate, b.targets.greyReachable, v => v >= b.targets.greyReachable, f],
  ['grey reachable by week 16', grey.by16 / RUNS, b.targets.greyReachableByWeek16, v => v >= b.targets.greyReachableByWeek16, f],
  ['illegal tactic taken', illegal.taken / RUNS, b.targets.illegalTaken, v => v >= b.targets.illegalTaken, f],
  ['caught, of runs that went illegal', caughtRate, b.targets.caughtWhenIllegal, v => v >= b.targets.caughtWhenIllegal.min && v <= b.targets.caughtWhenIllegal.max, f],
  ['median tactics met by week 20', pct(metBy20, 0.5), b.targets.tacticsByWeek20, v => v >= b.targets.tacticsByWeek20, String],
  ['investigated at least once', investigatedOnce / RUNS, b.targets.investigatedOnce, v => v >= b.targets.investigatedOnce, f],
  ['careful bust rate', careful, b.targets.carefulBustMax, v => v <= b.targets.carefulBustMax, f],
  ['careless bust rate', careless, b.targets.carelessBustMin, v => v >= b.targets.carelessBustMin, f],
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
