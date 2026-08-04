// Price clearing, demand curves, elasticity, stock decay.

import content from './content.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function priceFor(state, cid, mods, owner = 'player') {
  const m = state.market[cid];
  if (!m) return 0;
  const side = owner === 'rival' ? mods.rivalPrice[cid] : mods.ownPrice[cid];
  const freight = owner === 'rival' ? 1 : mods.freight;
  return m.price * (side ?? 1) * freight;
}

export function decayStock(state, mods) {
  for (const site of Object.values(state.sites)) {
    if (!site.stock) continue;
    for (const cid of Object.keys(site.stock)) {
      const c = content.get('commodity', cid);
      const rate = (c?.decay || 0) * content.balance.market.stockDecayMult * (mods.decayMult[cid] ?? 1);
      if (rate > 0) site.stock[cid] = Math.max(0, site.stock[cid] * (1 - rate));
    }
  }
}

export function clear(state, mods, rng, emit) {
  const b = content.balance.market;
  const moved = {};
  for (const c of content.all('commodity')) {
    const m = state.market[c.id];
    const demand = c.baseDemand * (mods.demandMult[c.id] ?? 1) * (1 + b.demandDrift * state.week);
    const supply = c.baseSupply + (state.flow[c.id] || 0);
    const ratio = demand / Math.max(1, supply);
    const target = c.base * clamp(Math.pow(ratio, c.elasticity), c.minMult, c.maxMult);
    m.last = m.price;
    m.price = m.price + (target - m.price) * b.priceStep;
    m.price *= 1 + b.noise * rng.signed();
    m.price = clamp(m.price, c.base * c.minMult, c.base * c.maxMult);
    m.demand = demand;
    m.supply = supply;
    moved[c.id] = Math.round(m.price);
  }
  state.flow = {};
  emit({ t: 'price', prices: moved });
}

export default { clear, priceFor, decayStock };
