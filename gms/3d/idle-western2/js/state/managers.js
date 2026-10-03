// Managers, items, strongboxes, merge and auto-equip (ported from Idle Life 2 state/managers.js).
export function managerFor(data, lineId) {
  return data.managers.find((m) => m.lineId === lineId && !m.seasonal) || null;
}

export function managerSlots(levels, level) {
  return levels.slots[Math.max(0, Math.min(levels.slots.length - 1, (level || 1) - 1))];
}

export function newManagerState(levels) {
  return { level: 1, slots: new Array(levels ? managerSlots(levels, 1) : 1).fill(null) };
}

export function rollRarity(odds, rng) {
  let r = rng();
  for (let i = 0; i < odds.length; i++) if ((r -= odds[i]) < 0) return i;
  return odds.length - 1;
}

export function addItem(state, defId, rarity) {
  const it = { id: 'i' + ++state.itemSeq, def: defId, rarity, equipped: null };
  state.items.push(it);
  return it;
}

export function openBox(state, data, kind, rng) {
  const c = data.boxes[kind] || data.boxes.basic;
  const out = [];
  for (let i = 0; i < c.n; i++) {
    const def = data.items[Math.floor(rng() * data.items.length)];
    out.push(addItem(state, def.id, rollRarity(c.odds, rng)));
  }
  return out;
}

export function equippedCount(state) {
  let n = 0;
  for (const it of state.items) if (it.equipped) n++;
  return n;
}

const PRIORITY = { price: 6, speed: 5, sigma: 4, crit: 3, shelf: 2, offline: 1 };

export function itemScore(data, it, ctx) {
  const def = data.items.find((d) => d.id === it.def);
  if (!def) return 0;
  let p = PRIORITY[def.stat] || 0;
  if (def.stat === 'sigma' && ctx && ctx.sigma >= 1) p = 0.5;
  if (def.stat === 'crit' && ctx && ctx.crit >= ctx.critCap) p = 0.4;
  return data.rarityScore[it.rarity] * 10 + p;
}

export function fitSlots(m, levels) {
  if (!Array.isArray(m.slots)) m.slots = [];
  const n = managerSlots(levels, m.level);
  while (m.slots.length < n) m.slots.push(null);
}

export function unequip(state, itemId) {
  const it = state.items.find((x) => x.id === itemId);
  if (!it || !it.equipped) return 'bad';
  const m = state.managers[it.equipped];
  if (m) m.slots = m.slots.map((s) => (s === itemId ? null : s));
  it.equipped = null;
  return null;
}

export function equip(state, levels, itemId, managerId) {
  const it = state.items.find((x) => x.id === itemId);
  const m = state.managers[managerId];
  if (!it || !m) return 'bad';
  fitSlots(m, levels);
  if (it.equipped === managerId) return null;
  const free = m.slots.indexOf(null);
  if (free < 0) return 'full';
  if (it.equipped) unequip(state, itemId);
  m.slots[free] = it.id;
  it.equipped = managerId;
  return null;
}

export function merge(state, itemId, maxRarity) {
  const it = state.items.find((x) => x.id === itemId);
  if (!it) return { err: 'bad' };
  if (it.rarity >= maxRarity) return { err: 'max' };
  const same = state.items.filter((x) => x.def === it.def && x.rarity === it.rarity);
  if (same.length < 3) return { err: 'need3' };
  const use = [it, ...same.filter((x) => x !== it && !x.equipped), ...same.filter((x) => x !== it && x.equipped)].slice(0, 3);
  const slotOf = it.equipped;
  for (const x of use) if (x.equipped) unequip(state, x.id);
  state.items = state.items.filter((x) => !use.includes(x));
  return { item: addItem(state, it.def, it.rarity + 1), slotOf };
}

export function autoEquip(state, data, levels, managerId, ctx) {
  const m = state.managers[managerId];
  if (!m) return 'bad';
  fitSlots(m, levels);
  for (const id of m.slots) if (id) unequip(state, id);
  const pool = state.items.filter((x) => !x.equipped).sort((a, b) => itemScore(data, b, ctx) - itemScore(data, a, ctx));
  const used = new Set();
  for (const it of pool) {
    const free = m.slots.indexOf(null);
    if (free < 0) break;
    if (used.has(it.def)) continue;
    used.add(it.def);
    m.slots[free] = it.id;
    it.equipped = managerId;
  }
  return null;
}
