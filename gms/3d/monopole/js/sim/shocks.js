// One-off shocks: the only thing in the economy that can reach the debt limit on its own.
// Draw chance and card weights both read `exposure`, so overextension is what gets hit.

import content from './content.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const credits = n => `${Math.round(Math.abs(n)).toLocaleString('en-US')} credits`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function siteName(state, id) {
  const sys = content.get('system', state.system);
  return sys?.sites.find(s => s.id === id)?.name || id;
}

export function exposure(state) {
  const b = content.balance;
  const burn = Math.max(1, state.lastCosts || b.costs.overheadWeekly);
  const runway = (state.cash + b.loan.debtLimit) / burn;
  const ships = Math.max(1, state.ships.length);
  // leverage is what you drew *beyond* the founding loan — every company starts on b.start.debt,
  // so measuring against maxDraw would put the most cautious player at 0.75 in week one
  return {
    base: 1,
    leverage: clamp((state.debt - b.start.debt) / Math.max(1, b.loan.maxDraw - b.start.debt), 0, 1),
    thin: clamp(1 - runway / b.shock.safeRunway, 0, 1),
    transit: clamp(state.ships.filter(s => s.leg).length / ships, 0, 1),
    heat: clamp(state.heat / b.heat.threshold, 0, 1),
    fleet: clamp(ships / b.shock.fleetNorm, 0, 1),
    share: clamp(state.share.player / b.shock.shareNorm, 0, 1),
  };
}

export function strain(ex) {
  const w = content.balance.shock.strain;
  let s = 0;
  for (const k of Object.keys(w)) s += w[k] * (ex[k] || 0);
  return clamp(s, 0, 1);
}

function allowed(state, def) {
  const n = def.needs;
  if (!n) return true;
  if (n.ships != null && state.ships.filter(s => !s.laidUp).length < n.ships) return false;
  if (n.contracts != null && state.contracts.length < n.contracts) return false;
  if (n.debt != null && state.debt < n.debt) return false;
  if (n.heat != null && state.heat < n.heat) return false;
  return true;
}

function pick(state, ex, rng) {
  const deck = [];
  let total = 0;
  for (const def of content.all('event')) {
    if (!allowed(state, def)) continue;
    let w = 0;
    for (const k of Object.keys(def.weight)) w += def.weight[k] * (ex[k] || 0);
    if (w <= 0) continue;
    total += w;
    deck.push({ def, upTo: total });
  }
  if (!deck.length) return null;
  const r = rng() * total;
  return (deck.find(d => r < d.upTo) || deck[deck.length - 1]).def;
}

function pickShip(state, rng) {
  const live = state.ships.filter(s => !s.laidUp);
  if (!live.length) return null;
  const moving = live.filter(s => s.leg);
  const pool = moving.length ? moving : live;
  return pool[rng.int(pool.length)];
}

function base(state, of) {
  if (of === 'burn') return Math.max(content.balance.costs.overheadWeekly, state.lastCosts || 0);
  if (of === 'debt') return state.debt;
  if (of === 'cash') return Math.max(0, state.cash);
  return 1000;
}

function applyOps(state, def, rng, emit) {
  const vars = { brand: cap(content.balance.offer.brand), commodity: 'filament' };
  let cash = 0;
  for (const op of def.effect) {
    switch (op.op) {
      case 'cash': {
        const raw = base(state, op.of) * op.mult;
        cash += op.cap ? clamp(raw, -op.cap, op.cap) : raw;
        break;
      }
      case 'ship': {
        const sh = pickShip(state, rng);
        if (!sh) break;
        vars.ship = cap(sh.id);
        vars.site = siteName(state, sh.leg ? sh.leg.from : sh.at);
        if (op.lose && state.ships.length > 1) {
          const d = content.get('ship', sh.class);
          // hulls are collateral, so the underwriters pay the lender first — which is why the
          // week still reads as a loss on the cash line even though a settlement arrived
          const paid = (op.payout || 0) * d.cost;
          const offDebt = Math.min(state.debt, paid);
          state.debt -= offDebt;
          cash += paid - offDebt;
          vars.payout = credits(paid);
          state.ships = state.ships.filter(x => x !== sh);
          emit({ t: 'scrap', ship: sh.id, class: sh.class, reason: 'lost', payout: Math.round(paid) });
        } else {
          const weeks = op.layUp || 3;
          if (sh.leg) { sh.at = sh.leg.from; sh.leg = null; sh.eta = 0; }
          sh.laidUp = weeks;
          sh.dwell = 0;
          vars.weeks = weeks;
          emit({ t: 'layup', ship: sh.id, class: sh.class, weeks, site: sh.at });
        }
        break;
      }
      case 'contract': {
        const c = state.contracts[rng.int(state.contracts.length)];
        if (!c) break;
        vars.brand = cap(c.with);
        vars.commodity = content.get('commodity', c.commodity)?.name.toLowerCase() || c.commodity;
        cash -= c.units * c.price * (op.breakFrac || 0.25) * Math.min(4, c.weeksLeft);
        state.contracts = state.contracts.filter(x => x !== c);
        if (state.locks[c.commodity] === 'player') delete state.locks[c.commodity];
        emit({ t: 'contractEnd', contract: c.id, with: c.with, cancelled: true });
        break;
      }
      case 'mod':
        state.shocks.push({ kind: op.kind, commodity: op.commodity, stage: op.stage, mult: op.mult, weeksLeft: op.weeks });
        vars.weeks = op.weeks;
        if (op.commodity) vars.commodity = content.get('commodity', op.commodity)?.name.toLowerCase() || op.commodity;
        break;
      case 'heat':
        state.heat += op.add;
        break;
      case 'reserve': {
        const site = state.sites[op.site];
        if (site && site.reserve != null) site.reserve = Math.max(0.05, site.reserve * op.mult);
        vars.site = siteName(state, op.site);
        break;
      }
      default:
        break;
    }
  }
  state.cash += cash;
  vars.cash = credits(cash);
  return { cash, vars };
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

export function foldMods(state, mods) {
  for (const m of state.shocks || []) {
    if (m.kind === 'demandMult') mods.demandMult[m.commodity] *= m.mult;
    else if (m.kind === 'ownPrice') mods.ownPrice[m.commodity] *= m.mult;
    else if (m.kind === 'ownCost') mods.ownCost[m.stage] *= m.mult;
  }
}

export function tick(state, rng, emit) {
  const b = content.balance.shock;
  state.shocks = (state.shocks || []).filter(m => (m.weeksLeft -= 1) > 0);
  for (const sh of state.ships) if (sh.laidUp > 0) sh.laidUp -= 1;

  if (state.week < b.graceWeeks) return null;
  if (state.shockCooldown > 0) { state.shockCooldown -= 1; return null; }

  const ex = exposure(state);
  const age = 1 - (1 - b.ageFloor) * clamp(state.week / b.ageWeeks, 0, 1);
  if (!rng.chance(age * (b.baseChance + b.strainChance * strain(ex)))) return null;

  const def = pick(state, ex, rng);
  if (!def) return null;
  const { cash, vars } = applyOps(state, def, rng, emit);
  state.shockCooldown = b.cooldownWeeks;
  emit({ t: 'shock', id: def.id, title: def.title, body: fill(def.body, vars), cash: Math.round(cash) });
  return def.id;
}

export default { exposure, strain, foldMods, tick };
