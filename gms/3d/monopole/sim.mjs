// node sim.mjs [runs] [weeks] — seeded headless games against js/sim/. No DOM, no three.
// The policy below is the harness's stand-in player, not part of the sim: it plays the §1 line.

import content from './js/sim/content.js';
import { newGame } from './js/sim/state.js';
import { step } from './js/sim/step.js';
import { createRng } from './js/sim/rng.js';

const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a));
const RUNS = parseInt(nums[0] || content.balance.targets.runs, 10);
const WEEKS = parseInt(nums[1] || '30', 10);
const TRACE = process.argv.includes('--trace');
const TRACE_SEED = parseInt((process.argv.find(a => a.startsWith('--seed=')) || '=1').split('=')[1], 10);

const b = content.balance;

// Three stand-in players so the distribution is a distribution and not one deterministic line.
const STYLES = [
  { id: 'cautious', floor: 6000, coilWeek: 7, grey: false, extraRig: false },
  { id: 'standard', floor: 3000, coilWeek: 5, grey: false, extraRig: false },
  { id: 'aggressive', floor: 500, coilWeek: 4, grey: true, extraRig: true },
  { id: 'reckless', floor: 0, coilWeek: 1, grey: true, extraRig: true, sprawl: true },
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
  for (const id of state.tactics.unlocked) {
    if (state.tactics.owned.includes(id)) continue;
    const t = content.get('tactic', id);
    if (t.band !== 'legal' && !style.grey) continue;
    if (state.cash < t.cost + style.floor) continue;
    acts.push({ type: 'tactic', tactic: id });
    break;
  }
  if (state.cash < style.floor && state.debt < b.loan.maxDraw) acts.push({ type: 'loan', amount: 15000 });
  return acts;
}

function run(seed, opts = {}) {
  const rng = createRng(seed);
  let state = newGame(seed);
  const style = opts.style || STYLES[seed % STYLES.length];
  const seen = { style: style.id, offerWeek: null, coilWeek: null, tacticWeek: null, unlockWeek: null, investigations: 0, quarters: [] };
  const trace = [];
  for (let w = 0; w < WEEKS; w++) {
    const acts = policy(state, style);
    const r = step(state, { actions: acts, rng });
    state = r.state;
    for (const e of r.events) {
      if (e.t === 'offer' && seen.offerWeek === null) seen.offerWeek = e.week;
      if (e.t === 'unlock' && e.tactic === b.offer.tactic && seen.unlockWeek === null) seen.unlockWeek = e.week;
      if (e.t === 'module' && e.module === 'coilline') seen.coilWeek = e.week;
      if (e.t === 'tactic' && e.tactic === b.offer.tactic) seen.tacticWeek = e.week;
      if (e.t === 'investigate') seen.investigations++;
      if (e.t === 'quarter') seen.quarters.push(e);
    }
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

for (let i = 0; i < RUNS; i++) {
  const { state, seen } = run(1000 + i);
  offerWeeks.push(seen.offerWeek);
  if (seen.offerWeek !== null && seen.offerWeek >= b.offer.weekMin && seen.offerWeek <= b.offer.weekMax) offerInWindow++;
  if (seen.shareAt13 != null) { share13.push(seen.shareAt13); cash13.push(seen.cashAt13); }
  if (seen.coilWeek) { coilBuilt++; coilWeeks.push(seen.coilWeek); }
  if (seen.tacticWeek) tookDeal++;
  investigations += seen.investigations;
  cashEnd.push(state.cash);
  shareEnd.push(state.share.player);
  const o = state.over || 'running';
  outcomes[o] = (outcomes[o] || 0) + 1;
  byStyle[seen.style] = byStyle[seen.style] || { n: 0, bust: 0, offer: 0, share13: [] };
  const bs = byStyle[seen.style];
  bs.n++;
  if (state.over === 'bust') bs.bust++;
  if (seen.offerWeek !== null && seen.offerWeek >= b.offer.weekMin && seen.offerWeek <= b.offer.weekMax) bs.offer++;
  if (seen.shareAt13 != null) bs.share13.push(seen.shareAt13);
  if (state.over === 'bust') busts++;
}

const f = (v, d = 1) => (v * 100).toFixed(d) + '%';
const k = v => Math.round(v).toLocaleString('en-US');

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
  console.log(`  ${name.padEnd(11)} n ${v.n}  bust ${f(v.bust / v.n)}  offer-in-window ${f(v.offer / v.n)}  median share w13 ${f(pct(v.share13, 0.5))}`);
}
console.log('');
console.log(`outcomes: ${JSON.stringify(outcomes)}   investigations ${investigations}`);
console.log('');

const medShare13 = pct(share13, 0.5);
const checks = [
  ['offer in weeks 9-13', offerInWindow / RUNS, b.targets.offerByWeek13, v => v >= b.targets.offerByWeek13, f],
  ['bust rate', busts / RUNS, b.targets.bustRateMax, v => v <= b.targets.bustRateMax, f],
  ['median share at week 13', medShare13, b.targets.shareAtWeek13, v => v >= b.targets.shareAtWeek13.min && v <= b.targets.shareAtWeek13.max, f],
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
