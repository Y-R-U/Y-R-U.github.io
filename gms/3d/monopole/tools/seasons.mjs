// What does breaking the rules actually buy you, per difficulty?
//
// Holds the play skill constant and varies only which tactic bands the stand-in will touch, then
// reports the share distribution at the season deadline. That is the experiment behind the three
// win tiers: the thresholds are set so the ladder falls out of measurement rather than being
// asserted and then tuned toward.
//
//   node tools/seasons.mjs                 200 runs per cell, 52 weeks
//   node tools/seasons.mjs 400 60

import content from '../js/sim/content.js';
import { newGame } from '../js/sim/state.js';
import { step } from '../js/sim/step.js';
import { createRng } from '../js/sim/rng.js';
import { requirementsMet, costOf } from '../js/sim/tactics.js';

const RUNS = +(process.argv[2] || 200);
const WEEKS = +(process.argv[3] || 52);
const b = content.balance;
const BAND_RISK = { legal: 0, grey: 1, illegal: 2 };

const CLEANLINESS = [
  { id: 'clean', bands: ['legal'] },
  { id: 'grey', bands: ['legal', 'grey'] },
  { id: 'dirty', bands: ['legal', 'grey', 'illegal'] },
];

// One *strong* operator, three different appetites for risk. It has to be strong: a mediocre
// stand-in measures the mediocre ceiling, and the win thresholds would then be set to reward
// mediocrity. It expands the fleet as fast as it can fund it and keeps every hull on a loop.
function policy(state, bands, loan) {
  const acts = [];
  const floor = 2500;
  const FLEET = 7;
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
    if (cash < need && debt < loan.maxDraw * 0.7) {
      const want = need - cash;
      acts.push({ type: 'loan', amount: want });
      cash += want;
      debt += want;
    }
    if (cash >= rig.cost) { acts.push({ type: 'buyShip', class: 'ossa' }); cash -= rig.cost; }
    if (cash >= kite.cost) { acts.push({ type: 'buyShip', class: 'kite' }); cash -= kite.cost; }
    while (cash >= kite.cost + RUNWAY && acts.filter(a => a.type === 'buyShip').length < 3) {
      acts.push({ type: 'buyShip', class: 'kite' });
      cash -= kite.cost;
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

  for (const sh of state.ships) {
    if (sh.route) continue;
    acts.push({ type: 'route', ship: sh.id, legs: content.get('ship', sh.class).mine > 0 ? ['ledger', 'kestrel'] : ['ledger', 'ossian'] });
  }
  // Hulls alone hit a wall fast: one refinery clears 12 halide a week and one coil line draws 6
  // filament out of it whatever the fleet does. Growth is a matched set — a rig to dig it, a
  // refinery to cook it, a line to draw it — and the next missing piece of the set is always the
  // best thing to spend on.
  const mods = state.sites.ledger.modules;
  const coil = content.get('module', 'coilline');
  const rigs = state.ships.filter(sh => content.get('ship', sh.class).mine > 0).length;
  const haulers = state.ships.length - rigs;
  const refineries = mods.filter(m => m === 'refinery').length;
  const lines = mods.filter(m => m === 'coilline').length;
  const next = lines < refineries ? { module: 'coilline' }
    : rigs < refineries ? { ship: 'ossa' }
      : haulers < Math.max(1, Math.ceil(refineries / 2)) ? { ship: 'kite' }
        : state.ships.length < FLEET ? { module: 'refinery', opens: true } : null;
  if (next && state.week >= 2) {
    const def = next.ship ? content.get('ship', next.ship) : content.get('module', next.module);
    const first = lines < 1;
    // A half-built set is the worst place to run out of money — a second refinery with no line
    // behind it is 460 a week of upkeep for nearly nothing — so a new set only opens once the
    // whole rig-refinery-line trio is covered.
    const set = content.get('ship', 'ossa').cost + content.get('module', 'refinery').cost + coil.cost;
    const ceiling = loan.maxDraw * (first ? 0.85 : 0.6);
    const keep = first ? floor : Math.max(floor, state.lastCosts * 4);
    // opening a new set is judged on what the whole trio will cost against cash plus the credit
    // still available, not on this week's cash — otherwise it never opens one at all
    const capacity = state.cash + Math.max(0, ceiling - state.debt);
    if (!next.opens || capacity >= set + keep) {
      const buy = next.ship
        ? { type: 'buyShip', class: next.ship }
        : { type: 'buyModule', module: next.module, site: 'ledger' };
      const short = (def.cost + keep - state.cash) / (1 - (loan.drawFee || 0));
      if (short <= 0) { acts.push(buy); return acts; }
      // The draw and the purchase go in the same tick, or the week's costs eat the money on the
      // way past and the company borrows the same 17k forever without ever owning anything.
      if (state.debt < ceiling) {
        acts.push({ type: 'loan', amount: short }, buy);
        return acts;
      }
    }
  }
  const want = state.tactics.offered.find(id => !state.tactics.owned.includes(id));
  if (want) {
    const t = content.get('tactic', want);
    const need = Math.max(costOf(state, t) + floor, t.unlock.cash || 0);
    if (state.cash < need && state.debt < loan.maxDraw) acts.push({ type: 'loan', amount: (need - state.cash) / (1 - (loan.drawFee || 0)) });
  }
  // an expired tactic is a tactic you can run again, and a price war that is never relaunched
  // measures the appetite for one week of it rather than for the strategy
  const pick = state.tactics.unlocked
    .filter(id => !state.tactics.active.some(a => a.id === id))
    .map(id => content.get('tactic', id))
    .filter(t => bands.includes(t.band) && state.cash >= costOf(state, t) + floor && requirementsMet(state, t))
    .sort((a, c) => BAND_RISK[c.band] - BAND_RISK[a.band])[0];
  if (pick) acts.push({ type: 'tactic', tactic: pick.id });
  const excess = state.debt - (state.startDebt ?? b.start.debt);
  const cushion = Math.max(20000, state.lastCosts * 6);
  if (excess > 0 && !acts.length && state.cash > cushion) {
    acts.push({ type: 'repay', amount: Math.min(excess, state.cash - cushion) });
  }
  return acts;
}

const MARKS = [26, 39, 52, 65];

function run(seed, origin, bands) {
  const rng = createRng(seed);
  let state = newGame(seed, 'tamber', origin);
  const loan = state.loan;
  const at = {};
  let peak = 0;
  for (let w = 0; w < WEEKS; w++) {
    const r = step(state, { actions: policy(state, bands, loan), rng });
    state = r.state;
    peak = Math.max(peak, state.share.player);
    if (MARKS.includes(state.week)) at[state.week] = state.share.player;
    if (state.over === 'bust') break;
  }
  for (const m of MARKS) if (at[m] == null) at[m] = state.over === 'bust' ? 0 : state.share.player;
  return { share: state.share.player, peak, at, bust: state.over === 'bust', over: state.over };
}

const pctl = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)] ?? 0; };
const f = v => (v * 100).toFixed(1) + '%';

const origins = ['silver', 'saved', 'gutter'];
const table = {};

for (const origin of origins) {
  for (const c of CLEANLINESS) {
    const shares = [];
    const peaks = [];
    const at = Object.fromEntries(MARKS.map(m => [m, []]));
    let busts = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = run(2000 + i, origin, c.bands);
      peaks.push(r.peak);
      for (const m of MARKS) at[m].push(r.at[m]);
      if (r.bust) busts++; else shares.push(r.share);
    }
    table[`${origin}/${c.id}`] = {
      bust: busts / RUNS,
      p50: pctl(shares, 0.5), p75: pctl(shares, 0.75), p90: pctl(shares, 0.9), max: pctl(shares, 1),
      peak50: pctl(peaks, 0.5), peak90: pctl(peaks, 0.9),
      marks: Object.fromEntries(MARKS.map(m => [m, pctl(at[m], 0.5)])),
      n: shares.length,
    };
  }
}

console.log(`\nshare at week ${WEEKS}, ${RUNS} runs per cell — survivors only\n`);
console.log('origin   appetite   bust     p50      p90     best   peak50   |  w26     w39     w52     w65');
for (const origin of origins) {
  for (const c of CLEANLINESS) {
    const r = table[`${origin}/${c.id}`];
    const m = MARKS.map(k => f(r.marks[k]).padStart(7)).join(' ');
    console.log(`${origin.padEnd(9)}${c.id.padEnd(11)}${f(r.bust).padStart(6)}  ${f(r.p50).padStart(7)}  ${f(r.p90).padStart(7)}  ${f(r.max).padStart(6)}  ${f(r.peak50).padStart(7)}  | ${m}`);
  }
}

// What each candidate threshold would mean: the fraction of runs in each cell that clear it.
const W = b.win;
const tiers = [['oligopoly', W.oligopoly ?? 0.22], ['duopoly', W.duopoly], ['monopoly', W.monopoly]];
console.log(`\nreach rate against the current thresholds\n`);
console.log('origin   appetite  ' + tiers.map(([n, v]) => `${n} ${f(v)}`.padStart(18)).join(''));
for (const origin of origins) {
  for (const c of CLEANLINESS) {
    const shares = [];
    for (let i = 0; i < RUNS; i++) {
      const r = run(2000 + i, origin, c.bands);
      if (!r.bust) shares.push(r.share);
    }
    const cells = tiers.map(([, v]) => f(shares.filter(s => s >= v).length / RUNS).padStart(18));
    console.log(`${origin.padEnd(9)}${c.id.padEnd(10)}` + cells.join(''));
  }
}
console.log();
