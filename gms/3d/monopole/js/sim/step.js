// step(state, { actions, rng }) -> { state, events }. Pure: the input state is never mutated.
// The ten stages run in BUILD_PLAN §6 order. The 3D never reads state; it replays events.

import content from './content.js';
import { clone } from './state.js';
import * as market from './market.js';
import * as tactics from './tactics.js';
import * as rival from './rival.js';
import * as shocks from './shocks.js';
import * as warn from './warn.js';
import { createRng } from './rng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const total = obj => Object.values(obj || {}).reduce((a, b) => a + b, 0);

function routeBetween(sys, a, b) {
  return sys.routes.find(r => (r.from === a && r.to === b) || (r.from === b && r.to === a)) || null;
}

function stockRoom(site) {
  return Math.max(0, (site.hold || 0) - total(site.stock));
}

// a converter's feed buffer is held back from haulers, or the station is stripped the same
// week the ore lands and the refinery never sees a tonne of it
function feedstock(site) {
  const weeks = content.balance.market.feedWeeks;
  const r = {};
  for (const mid of site.modules || []) {
    const m = content.get('module', mid);
    if (m?.converts) r[m.converts.from] = (r[m.converts.from] || 0) + m.converts.per * m.converts.rate * weeks;
  }
  return r;
}

function freeStock(site) {
  const held = feedstock(site);
  let n = 0;
  for (const cid of Object.keys(site.stock || {})) n += Math.max(0, site.stock[cid] - (held[cid] || 0));
  return n;
}

export function step(state, { actions = [], rng } = {}) {
  const s = clone(state);
  const gen = rng || createRng(((s.seed || 1) + s.week * 7919) >>> 0);
  const events = [];
  // s.week is incremented below before anything emits, so it already IS the week the tick produced
  const emit = e => { const ev = { week: s.week, ...e }; events.push(ev); s.log.push(ev); };

  if (s.over) return { state: s, events };

  if (!s.shocks) { s.shocks = []; s.shockCooldown = 0; s.warnings = []; s.warned = {}; s.convictions = 0; }
  s.week += 1;
  const sys = content.get('system', s.system);
  const b = content.balance;
  const ledger = s.sites.ledger;
  let revenue = 0;
  let fuelBill = 0;

  applyActions(s, actions, emit);

  const mods = tactics.computeMods(s);
  shocks.foldMods(s, mods);
  rival.foldEffects(s, mods);

  // 1 — advance ETAs; arrivals dock, unload, take on the next leg
  for (const sh of s.ships) {
    sh.arrived = false;
    if (sh.laidUp > 0 || !sh.leg) continue;
    sh.eta -= 1;
    if (sh.eta > 0) continue;
    sh.at = sh.leg.to;
    sh.leg = null;
    sh.eta = 0;
    sh.arrived = true;
    sh.dwell = 0;
    emit({ t: 'arrive', ship: sh.id, class: sh.class, site: sh.at, cargo: { ...sh.cargo } });

    const site = s.sites[sh.at];
    if (site.kind === 'market') {
      for (const cid of Object.keys(sh.cargo)) {
        const units = sh.cargo[cid];
        if (units <= 0) continue;
        const price = market.priceFor(s, cid, mods, 'player');
        const credits = units * price;
        s.cash += credits;
        revenue += credits;
        s.flow[cid] = (s.flow[cid] || 0) + units;
        emit({ t: 'deliver', ship: sh.id, site: sh.at, commodity: cid, units: Math.round(units), price: Math.round(price), credits: Math.round(credits) });
      }
      sh.cargo = {};
    } else if (site.owner === 'player') {
      for (const cid of Object.keys(sh.cargo)) {
        const room = stockRoom(site);
        const moved = Math.min(sh.cargo[cid], room);
        if (moved <= 0) continue;
        site.stock[cid] = (site.stock[cid] || 0) + moved;
        sh.cargo[cid] -= moved;
        if (sh.cargo[cid] <= 0.001) delete sh.cargo[cid];
      }
    }
  }

  for (const sh of s.ships) {
    if (sh.leg || sh.laidUp > 0) continue;
    const def = content.get('ship', sh.class);
    const site = s.sites[sh.at];
    const held = total(sh.cargo);

    if (site.kind === 'belt' && def.mine > 0 && site.reserve > 0) {
      const rich = gen.chance(b.mining.richVeinChance) ? b.mining.richVeinMult : 1;
      const cut = Math.min(def.hold - held, def.mine * site.yield * site.reserve * b.mining.yieldMult * rich);
      if (cut > 0) {
        sh.cargo.ore = (sh.cargo.ore || 0) + cut;
        site.reserve = Math.max(0, site.reserve - b.mining.reserveDrainPerWeek);
        site.worked = (site.worked || 0) + 1;
        emit({ t: 'mine', ship: sh.id, site: sh.at, commodity: 'ore', units: Math.round(cut), rich: rich > 1 });
      }
    } else if (site.owner === 'player' && def.mine === 0 && def.hold > 0) {
      let room = def.hold - held;
      const taken = {};
      const reserved = feedstock(site);
      for (const cid of s.loadOrder) {
        if (room <= 0) break;
        const have = Math.max(0, (site.stock[cid] || 0) - (reserved[cid] || 0));
        const take = Math.min(have, room);
        if (take <= 0.001) continue;
        site.stock[cid] -= take;
        sh.cargo[cid] = (sh.cargo[cid] || 0) + take;
        taken[cid] = Math.round(take);
        room -= take;
      }
      if (Object.keys(taken).length) emit({ t: 'load', ship: sh.id, site: sh.at, cargo: taken });
    }
    sh.dwell += 1;
  }

  for (const sh of s.ships) {
    if (sh.leg || sh.laidUp > 0 || !sh.route || sh.route.length < 2) continue;
    const def = content.get('ship', sh.class);
    const site = s.sites[sh.at];
    const held = total(sh.cargo);
    const canLoadHere = (site.kind === 'belt' && def.mine > 0 && site.reserve > 0)
      || (site.owner === 'player' && def.mine === 0 && freeStock(site) > 0.5);
    const idleAtHome = held < 0.5 && site.owner === 'player' && def.mine === 0;
    if (idleAtHome) continue;
    if (canLoadHere && held < def.hold - 0.5 && sh.dwell < b.tick.maxDwell) continue;

    const at = sh.route.indexOf(sh.at);
    const nextIdx = at < 0 ? sh.routeIdx : (at + 1) % sh.route.length;
    const to = sh.route[nextIdx];
    if (to === sh.at) continue;
    const rt = routeBetween(sys, sh.at, to);
    if (!rt) continue;
    const weeks = Math.max(1, Math.round(rt.weeks / def.speed));
    sh.routeIdx = nextIdx;
    sh.leg = { from: sh.at, to, weeks, arc: rt.arc };
    sh.eta = weeks;
    sh.dwell = 0;
    fuelBill += rt.fuel * mods.ownCost.transit;
    emit({ t: 'depart', ship: sh.id, class: sh.class, from: sh.leg.from, to, weeks, arc: rt.arc, cargo: { ...sh.cargo } });
  }

  // 2 — production
  for (const site of Object.values(s.sites)) {
    if (site.owner !== 'player' || !site.modules) continue;
    for (const mid of site.modules) {
      const m = content.get('module', mid);
      if (!m || !m.converts) continue;
      const cv = m.converts;
      const runs = Math.min(cv.rate, Math.floor((site.stock[cv.from] || 0) / cv.per));
      if (runs <= 0) continue;
      site.stock[cv.from] -= runs * cv.per;
      site.stock[cv.into] = (site.stock[cv.into] || 0) + runs;
      emit({ t: 'refine', site: site.id, module: mid, from: cv.from, into: cv.into, units: runs, consumed: runs * cv.per });
    }
  }

  // 3 — contract deliveries; shortfall penalties
  const keptContracts = [];
  for (const c of s.contracts) {
    c.weeksLeft -= 1;
    const have = ledger.stock[c.commodity] || 0;
    const units = Math.min(c.units, Math.floor(have));
    if (units > 0) {
      const price = Math.max(c.price, market.priceFor(s, c.commodity, mods, 'player'));
      const credits = units * price;
      ledger.stock[c.commodity] = have - units;
      s.cash += credits;
      revenue += credits;
      s.flow[c.commodity] = (s.flow[c.commodity] || 0) + units;
      emit({ t: 'deliver', contract: c.id, with: c.with, site: 'ledger', commodity: c.commodity, units, price: Math.round(price), credits: Math.round(credits) });
    }
    const short = c.units - units;
    if (short > 0) {
      const fee = short * c.price * b.contract.shortfallFrac;
      s.cash -= fee;
      emit({ t: 'shortfall', contract: c.id, commodity: c.commodity, units: short, fee: Math.round(fee) });
    }
    if (c.weeksLeft > 0) keptContracts.push(c);
    else emit({ t: 'contractEnd', contract: c.id, with: c.with });
  }
  s.contracts = keptContracts;

  // 4 — market clear
  market.decayStock(s, mods);
  market.clear(s, mods, gen, emit);

  // 5 — rival decides and executes one action
  rival.tickEffects(s);
  rival.execute(s, rival.decide(s, gen), emit);
  rival.earn(s, mods);

  // 6 — tactic effects apply; heat accrues
  tactics.tickActive(s, emit);
  tactics.accrueHeat(s, emit);

  // 7 — investigation roll
  if (s.investigateCooldown > 0) s.investigateCooldown -= 1;
  tactics.rollInvestigation(s, gen, emit);

  // 8 — costs
  let wages = 0;
  for (const sh of s.ships) {
    const def = content.get('ship', sh.class);
    wages += def.upkeep * (sh.leg ? 1 : b.costs.idleUpkeepMult);
  }
  wages *= mods.ownCost.wages;
  let modUpkeep = 0;
  for (const site of Object.values(s.sites)) {
    if (site.owner !== 'player' || !site.modules) continue;
    for (const mid of site.modules) {
      const m = content.get('module', mid);
      if (!m) continue;
      modUpkeep += m.upkeep * (m.converts ? mods.ownCost.refine : 1);
    }
  }
  modUpkeep *= b.costs.moduleUpkeepMult * mods.ownCost.upkeep;
  const fuel = fuelBill * b.costs.fuelMult;
  const interest = s.debt * b.loan.interestWeekly;
  const costs = wages + modUpkeep + fuel + interest + b.costs.overheadWeekly;
  s.cash -= costs;
  s.lastCosts = costs;
  emit({
    t: 'cost', wages: Math.round(wages), modules: Math.round(modUpkeep), fuel: Math.round(fuel),
    interest: Math.round(interest), overhead: b.costs.overheadWeekly, total: Math.round(costs),
    cash: Math.round(s.cash), revenue: Math.round(revenue),
  });

  // 8b — the shock deck, after costs so `lastCosts` is this week's and before the bust check
  shocks.tick(s, gen, emit);

  // 9 — recompute share
  s.hist.player.push(revenue);
  while (s.hist.player.length > b.share.window) s.hist.player.shift();
  const pV = s.hist.player.reduce((a, x) => a + x, 0) / s.hist.player.length;
  // The Reach is a fixed pot of freight value, so hulls the rival cannot fill earn it nothing
  // and every credit the player takes comes out of somebody.
  const rBoost = s.rival.undercutFor > 0 ? b.share.undercutBoost : 1;
  const pull = clamp(mods.pull, 0, 0.6);
  const p = pV * (1 + pull);
  // a rival paying more for the contested line moves less of it
  const rSqueeze = 1 / clamp(mods.rivalPrice[b.offer.commodity] ?? 1, 0.5, 2);
  const rCap = s.rival.ships * b.share.rivalPerShip * rBoost * (1 - pull) * rSqueeze;
  const fringe = b.share.otherBase * (1 + b.share.otherDrift * s.week);
  const reach = Math.max(b.share.reachTotal * (1 + b.share.reachDrift * s.week), p + fringe);
  const r = clamp(reach - p - fringe, 0, rCap);
  const o = Math.max(0, reach - p - r);
  const tot = Math.max(1, p + r + o);
  const target = { player: p / tot, rival: r / tot, other: o / tot };
  for (const k of ['player', 'rival', 'other']) {
    s.share[k] += (target[k] - s.share[k]) * (1 - b.share.inertia);
  }
  s.share.player = clamp(s.share.player + mods.sharePull, 0, 1);
  s.share.other = Math.max(s.share.other, b.share.otherFloor);
  s.share.rival = Math.max(0, s.share.rival);
  const sum = s.share.player + s.share.rival + s.share.other;
  for (const k of ['player', 'rival', 'other']) s.share[k] /= sum;
  emit({ t: 'share', player: s.share.player, rival: s.share.rival, other: s.share.other });

  // §6 does not place the unlock check in a stage; it is gated on share, so it reads this
  // week's share rather than last week's
  tactics.checkUnlocks(s, emit);

  if (s.week % b.tick.weeksPerQuarter === 0) {
    emit({
      t: 'quarter', quarter: s.week / b.tick.weeksPerQuarter, week: s.week,
      share: { ...s.share }, cash: Math.round(s.cash), debt: Math.round(s.debt),
      heat: Math.round(s.heat), rivalAction: s.rival.lastAction,
    });
  }

  warn.update(s, emit);

  // 10 — win / lose
  if (s.cash < -b.loan.debtLimit) {
    s.over = 'bust';
    emit({ t: 'lose', reason: 'bust', cash: Math.round(s.cash), week: s.week });
  } else if (s.convictions >= b.heat.revokeAt || (s.convictions > 1 && s.rep <= b.heat.revokeRep)) {
    s.over = 'banned';
    emit({ t: 'lose', reason: 'banned', cash: Math.round(s.cash), week: s.week });
  } else if (s.week >= b.win.checkFromWeek) {
    const tier = s.share.player >= b.win.monopoly ? 'monopoly' : s.share.player >= b.win.duopoly ? 'duopoly' : null;
    s.holdStreak = tier ? s.holdStreak + 1 : 0;
    if (tier && s.holdStreak >= b.win.holdWeeks) {
      s.over = tier;
      emit({ t: 'win', tier, share: s.share.player, week: s.week });
    }
  }

  return { state: s, events };
}

function applyActions(s, actions, emit) {
  for (const a of actions || []) {
    switch (a.type) {
      case 'route': {
        const sh = s.ships.find(x => x.id === a.ship);
        if (!sh) break;
        sh.route = a.legs.slice();
        sh.routeIdx = Math.max(0, sh.route.indexOf(sh.at));
        emit({ t: 'order', order: 'route', ship: sh.id, legs: sh.route.slice() });
        break;
      }
      case 'assign': {
        const sh = s.ships.find(x => x.id === a.ship);
        if (!sh) break;
        sh.route = [sh.at, a.to];
        sh.routeIdx = 0;
        emit({ t: 'order', order: 'assign', ship: sh.id, to: a.to });
        break;
      }
      case 'buyModule': {
        const m = content.get('module', a.module);
        const site = s.sites[a.site || 'ledger'];
        if (!m || !site || site.owner !== 'player' || s.cash < m.cost) break;
        s.cash -= m.cost;
        site.modules.push(m.id);
        site.hold += m.hold || 0;
        emit({ t: 'module', module: m.id, name: m.name, site: site.id, cost: m.cost });
        break;
      }
      case 'buyShip': {
        const def = content.get('ship', a.class);
        if (!def || s.cash < def.cost) break;
        s.cash -= def.cost;
        const id = `${def.id}-${s.ships.length + 1}`;
        s.ships.push({ id, class: def.id, at: 'ledger', leg: null, eta: 0, cargo: {}, route: null, routeIdx: 0, dwell: 0, arrived: false, laidUp: 0 });
        emit({ t: 'ship', ship: id, class: def.id, name: def.name, cost: def.cost });
        break;
      }
      case 'tactic':
        tactics.activate(s, a.tactic, emit);
        break;
      case 'loan': {
        const amt = Math.min(a.amount, content.balance.loan.maxDraw - s.debt);
        if (amt <= 0) break;
        const fee = amt * content.balance.loan.drawFee;
        s.debt += amt;
        s.cash += amt - fee;
        emit({ t: 'loan', amount: Math.round(amt), fee: Math.round(fee), debt: Math.round(s.debt) });
        break;
      }
      case 'repay': {
        const amt = Math.min(a.amount, s.debt, Math.max(0, s.cash));
        if (amt <= 0) break;
        s.debt -= amt;
        s.cash -= amt;
        emit({ t: 'repay', amount: Math.round(amt), debt: Math.round(s.debt) });
        break;
      }
      case 'loadOrder':
        s.loadOrder = a.order.slice();
        break;
      default:
        break;
    }
  }
}

export default step;
