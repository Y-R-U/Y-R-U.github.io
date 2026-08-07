// Effect ops, heat accrual, investigation rolls, unlocks and the exclusivity offer.
// Continuous ops rebuild `mods` every tick; one-shot ops fire once at activation.

import content from './content.js';

const ONE_SHOT = new Set(['absorb', 'rivalMood', 'rivalShips', 'rivalRep', 'lockBrand', 'freightPrice']);

export function emptyMods() {
  const per = () => Object.fromEntries(content.all('commodity').map(c => [c.id, 1]));
  return {
    ownPrice: per(), rivalPrice: per(), demandMult: per(), decayMult: per(),
    ownCost: { transit: 1, refine: 1, upkeep: 1, wages: 1 },
    rivalCost: { transit: 1, refine: 1, upkeep: 1, wages: 1 },
    rivalCash: 0, sharePull: 0, pull: 0, freight: 1,
  };
}

function eachCommodity(cid) {
  return cid === '*' ? content.all('commodity').map(c => c.id) : [cid];
}

export function applyOp(mods, op, owner) {
  if (ONE_SHOT.has(op.op)) return;
  const side = op.owner || owner || 'player';
  switch (op.op) {
    case 'ownPrice':
      for (const c of eachCommodity(op.commodity))
        (side === 'rival' ? mods.rivalPrice : mods.ownPrice)[c] *= op.mult;
      break;
    case 'rivalPrice':
      for (const c of eachCommodity(op.commodity))
        (side === 'rival' ? mods.ownPrice : mods.rivalPrice)[c] *= op.mult;
      break;
    case 'ownCost':
      (side === 'rival' ? mods.rivalCost : mods.ownCost)[op.stage] *= op.mult;
      break;
    case 'demandMult':
      for (const c of eachCommodity(op.commodity)) mods.demandMult[c] *= op.mult;
      break;
    case 'decayMult':
      for (const c of eachCommodity(op.commodity)) mods.decayMult[c] *= op.mult;
      break;
    case 'demandPull':
      mods.pull += side === 'rival' ? -op.frac : op.frac;
      break;
    case 'sharePull':
      mods.sharePull += op.perWeek;
      break;
    case 'rivalCash':
      mods.rivalCash += op.perWeek;
      break;
    default:
      break;
  }
}

export function computeMods(state) {
  const mods = emptyMods();
  for (const a of state.tactics.active) {
    const def = content.get('tactic', a.id);
    if (!def) continue;
    for (const op of def.effect) applyOp(mods, op, a.owner || 'player');
  }
  if (state.rival.undercutFor > 0) mods.freight *= state.rival.freightMult;
  for (const s of Object.keys(mods.rivalCost)) mods.rivalCost[s] *= state.rival.costMult;
  return mods;
}

// `band` is passed so an origin's contacts can lower the bar on the grey and illegal bands. A
// gutter company hears about these long before it is big enough to be offered them.
function meets(state, unlock, band) {
  if (!unlock) return true;
  const m = band ? (state.tacticUnlock?.[band] ?? 1) : 1;
  if (unlock.share != null && state.share.player < unlock.share * m) return false;
  if (unlock.cash != null && state.cash < unlock.cash * m) return false;
  if (unlock.modules) {
    const owned = state.sites.ledger?.modules || [];
    if (!unlock.modules.every(m => owned.includes(m))) return false;
  }
  return true;
}

export function requirementsMet(state, def) {
  const r = def.requires;
  if (!r) return true;
  if (r.dominance) {
    const d = r.dominance;
    if (state.locks[d.commodity] !== 'player' && state.share.player < d.share) return false;
  }
  return true;
}

// Ryland offers on share alone once the window opens; affording it is the player's problem,
// which is why `offer` can fire weeks before the tactic is buyable.
export function checkUnlocks(state, emit) {
  const b = content.balance;
  const offerDef = content.get('tactic', b.offer.tactic);
  if (offerDef && !state.tactics.offered.includes(offerDef.id)
      && state.week >= b.offer.weekMin && state.share.player >= offerDef.unlock.share) {
    state.tactics.offered.push(offerDef.id);
    emit({
      t: 'offer', tactic: offerDef.id, brand: b.offer.brand, commodity: b.offer.commodity,
      cost: offerDef.cost, units: b.offer.units,
      price: Math.round(content.get('commodity', b.offer.commodity).base * b.offer.priceMult),
    });
  }
  for (const def of content.all('tactic')) {
    if (state.tactics.unlocked.includes(def.id) || state.tactics.banned.includes(def.id)) continue;
    if (!meets(state, def.unlock, def.band)) continue;
    if (def.id === b.offer.tactic && !state.tactics.offered.includes(def.id)) continue;
    state.tactics.unlocked.push(def.id);
    emit({ t: 'unlock', tactic: def.id, band: def.band, story: def.story, name: def.name });
  }
}

// An origin that came up through the grey market pays less for the grey and illegal bands — the
// contacts are the whole inheritance. Legal tactics are full price for everybody.
export function costOf(state, def) {
  const m = state.tacticCost?.[def.band] ?? 1;
  return Math.round(def.cost * m);
}

export function activate(state, tacticId, emit) {
  const def = content.get('tactic', tacticId);
  if (!def) return false;
  if (!state.tactics.unlocked.includes(tacticId)) return false;
  if (state.tactics.banned.includes(tacticId)) return false;
  if (state.tactics.active.some(a => a.id === tacticId)) return false;
  if (!requirementsMet(state, def)) return false;
  const cost = costOf(state, def);
  if (state.cash < cost) return false;

  state.cash -= cost;
  const weeks = def.duration === 0 ? Infinity : def.duration * content.balance.tick.weeksPerQuarter;
  state.tactics.active.push({ id: tacticId, owner: 'player', weeksLeft: weeks, band: def.band });
  if (!state.tactics.owned.includes(tacticId)) state.tactics.owned.push(tacticId);

  for (const op of def.effect) {
    if (op.op === 'lockBrand') state.locks[op.commodity] = op.owner === 'rival' ? 'rival' : 'player';
    if (op.op === 'absorb') {
      state.rival.ships = Math.max(1, state.rival.ships - (op.ships || 0));
      // buying the brand moves the *target*, not this week's number, or the inertia term undoes it
      state.sharePulled = (state.sharePulled || 0) + (op.share || 0);
    }
    if (op.op === 'rivalMood') state.rival.mood = op.set;
  }

  if (tacticId === content.balance.offer.tactic) {
    const b = content.balance.offer;
    const c = content.get('commodity', b.commodity);
    state.contracts.push({
      id: `${b.brand}_supply`, with: b.brand, commodity: b.commodity, units: b.units,
      price: Math.round(c.base * b.priceMult), weeksLeft: def.duration * content.balance.tick.weeksPerQuarter,
      exclusive: true,
    });
  }

  emit({ t: 'tactic', tactic: tacticId, name: def.name, band: def.band, cost, story: def.story });
  return true;
}

export function tickActive(state, emit) {
  const keep = [];
  for (const a of state.tactics.active) {
    a.weeksLeft -= 1;
    if (a.weeksLeft <= 0) {
      const def = content.get('tactic', a.id);
      for (const op of def.effect) if (op.op === 'lockBrand' && state.locks[op.commodity] === 'player') delete state.locks[op.commodity];
      emit({ t: 'expire', tactic: a.id, name: def.name });
    } else keep.push(a);
  }
  state.tactics.active = keep;
}

export function accrueHeat(state, emit) {
  const b = content.balance.heat;
  let gained = 0;
  for (const a of state.tactics.active) {
    const def = content.get('tactic', a.id);
    gained += def?.heat || 0;
  }
  state.heat = Math.max(0, state.heat + gained - b.decayWeekly);
  if (gained > 0) emit({ t: 'heat', heat: Math.round(state.heat), gained, threshold: b.threshold });
}

export function rollInvestigation(state, rng, emit) {
  const b = content.balance.heat;
  if (state.heat <= b.threshold) return;
  if (state.investigateCooldown > 0) return;
  const p = Math.max(0, (b.investigateBase + (state.heat - b.threshold) * b.investigatePerPoint) * (1 - state.rep * b.repShield));
  if (!rng.chance(p)) return;

  const dirty = state.tactics.active
    .map(a => ({ a, def: content.get('tactic', a.id) }))
    .filter(x => x.def && x.def.penalty)
    .sort((x, y) => y.def.heat - x.def.heat)[0];
  if (!dirty) return;

  const pen = dirty.def.penalty;
  state.cash -= pen.fine;
  // a conviction takes back what the tactic took, not just this week's reading
  state.sharePulled = Math.max(0, (state.sharePulled || 0) - pen.shareLoss);
  state.share.player = Math.max(0, state.share.player - pen.shareLoss);
  state.share.rival = Math.min(1, state.share.rival + pen.shareLoss * 0.6);
  state.rep = Math.max(0, state.rep - pen.repLoss);
  state.heat = 0;
  state.convictions = (state.convictions || 0) + 1;
  state.investigateCooldown = b.cooldownWeeks;
  state.tactics.active = state.tactics.active.filter(a => a !== dirty.a);
  for (const op of dirty.def.effect) if (op.op === 'lockBrand' && state.locks[op.commodity] === 'player') delete state.locks[op.commodity];
  if (pen.ban) state.tactics.banned.push(dirty.def.id);

  emit({
    t: 'investigate', tactic: dirty.def.id, name: dirty.def.name, band: dirty.def.band,
    fine: pen.fine, shareLoss: pen.shareLoss, repLoss: pen.repLoss, banned: !!pen.ban, story: dirty.def.story,
  });
}

export default {
  emptyMods, applyOp, computeMods, checkUnlocks, activate, tickActive,
  accrueHeat, rollInvestigation, requirementsMet,
};
