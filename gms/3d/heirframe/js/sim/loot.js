// Diablo-style item generator (DESIGN §6, ECONOMY §5-6).
import {
  SLOTS, BASES, RARITIES, RARITY_INDEX, RARITY_BANDS, AFFIXES, POWERS, HEIRLOOM_SETS, HEIR_CORE, SALVAGE, KILL_DROPS,
  CACHE_RULES, BAD_LUCK, RELIC_NO_REPEAT, WEAPON_ELEMENTS, ELEMENTS, SCALING_STATS,
} from '../data/loot.js';
import { COSTS, TUNE_TABLE, TUNE_MAX, TUNE_PITY, RANK_CREDITS } from '../data/economy.js';
import { L } from '../data/balance.js';
import { primaryFor } from './stats.js';

const round3 = v => Math.round(v * 1000) / 1000;

export function newLootState() {
  return { badLuck: 0, recentRelics: [], heirloomPieces: [], serial: 0, relicsFound: 0 };
}

export function uid(rng, prefix = 'it') {
  return `${prefix}_${rng.int(0, 2 ** 30).toString(36)}${rng.int(0, 2 ** 30).toString(36)}`;
}

export function rarityWeights(level, q = 0) {
  const band = RARITY_BANDS.find(b => level <= b.max);
  return band.w.map((w, i) => (i <= 1 ? w / (1 + q) : i >= 3 ? w * (1 + q) ** (i - 2) : w));
}

export function rollRarity(rng, { level = 1, q = 0, minRarity, noHeirloom } = {}) {
  const w = rarityWeights(level, q);
  const floor = minRarity ? RARITY_INDEX[minRarity] : 0;
  const entries = RARITIES.map((r, i) => [r.id, i < floor || (noHeirloom && r.id === 'heirloom') ? 0 : w[i]]);
  if (entries.every(e => e[1] <= 0)) return RARITIES[floor].id;
  return rng.weighted(entries);
}

function affixValue(rng, def, ilvl, q) {
  const [lo, hi] = def.value;
  let v = Math.min((lo + (hi - lo) * rng.next()) * (1 + 0.1 * q), hi * 1.25);
  const quality = (v - lo) / (hi - lo || 1);
  if (def.scales) v = Math.max(1, Math.round(v * L(ilvl)));
  else if (def.stat === 'energy') v = Math.round(v);
  else v = round3(v);
  return { value: v, q: Math.round(Math.min(1.25, quality) * 100) / 100 };
}

function rollAffix(rng, slot, ilvl, q, exclude, weaponElement) {
  const pool = AFFIXES.filter(a => a.slots.includes(slot) && !exclude.has(a.id));
  if (!pool.length) return null;
  const def = rng.pick(pool);
  const a = { id: def.id, stat: def.stat, ...affixValue(rng, def, ilvl, q) };
  if (def.element) a.element = def.id === 'elemDmg' && weaponElement && rng.chance(0.6) ? weaponElement : rng.pick(ELEMENTS);
  return a;
}

export function affixLabel(a) {
  const def = AFFIXES.find(x => x.id === a.id);
  if (!def) return a.id;
  const pct = `${Math.round(a.value * 1000) / 10}%`;
  return def.label.replace('{v}', a.value).replace('{p}', pct).replace('{e}', a.element ? a.element[0].toUpperCase() + a.element.slice(1) : '');
}

function pickSlot(rng, opts) {
  if (opts.slot) return opts.slot;
  if (opts.rentalOnly) return rng.pick(['weapon', 'chip']);
  if (opts.rental) return rng.weighted(SLOTS.map(s => [s, s === 'weapon' || s === 'chip' ? 3 : 1]));
  return rng.pick(SLOTS);
}

// opts: {ilvl, slot, rarity, q, rental, lootState, minRarity, forceAffixes:[ids], element, name}
export function rollItem(rng, opts = {}) {
  const ilvl = Math.max(1, Math.round(opts.ilvl || 1));
  const q = opts.q || 0;
  let rarity = opts.rarity || rollRarity(rng, { level: ilvl, q, minRarity: opts.minRarity });
  if (rarity === 'heirloom') return rollHeirloom(rng, { ilvl, q, lootState: opts.lootState });
  let slot = pickSlot(rng, opts);
  let power = null;
  if (rarity === 'relic') {
    const recent = opts.lootState?.recentRelics || [];
    const bySlot = opts.slot ? POWERS.filter(p => p.slot === opts.slot) : POWERS;
    let pool = bySlot.filter(p => !recent.includes(p.id));
    if (!pool.length) pool = bySlot;
    power = rng.pick(pool);
    slot = power.slot;
    if (opts.lootState) {
      opts.lootState.recentRelics = [...recent, power.id].slice(-RELIC_NO_REPEAT);
      opts.lootState.relicsFound = (opts.lootState.relicsFound || 0) + 1;
    }
  }
  const r = RARITIES[RARITY_INDEX[rarity]];
  const base = rng.pick(BASES[slot].filter(b => ilvl >= (b.minLevel || 1)));
  const item = {
    uid: uid(rng), baseId: base.id, slot, rarity, ilvl, reqLevel: Math.max(1, ilvl - 2),
    primary: primaryFor(slot, ilvl, r.mult, base.tilt),
    affixes: [], powers: power ? [power.id] : [], tune: 0, tuneFails: {}, recal: null, recalCount: 0,
  };
  if (slot === 'weapon') item.element = opts.element || rng.weighted(WEAPON_ELEMENTS);
  const used = new Set();
  for (const id of opts.forceAffixes || []) {
    const def = AFFIXES.find(a => a.id === id);
    if (!def) continue;
    const a = { id, stat: def.stat, ...affixValue(rng, def, ilvl, q) };
    if (def.element) a.element = item.element || rng.pick(ELEMENTS);
    item.affixes.push(a); used.add(id);
  }
  while (item.affixes.length < r.affixes) {
    const a = rollAffix(rng, slot, ilvl, q, used, item.element);
    if (!a) break;
    used.add(a.id); item.affixes.push(a);
  }
  item.name = opts.name || itemName(item, base, power);
  return item;
}

export function itemName(item, base, power) {
  base = base || BASES[item.slot].find(b => b.id === item.baseId);
  if (item.rarity === 'relic' && power) return `${power.name} ${base.name}`;
  if (item.rarity === 'prototype') return `Prototype ${base.name}`;
  if (item.rarity === 'scrap') return `Salvaged ${base.name}`;
  if (item.rarity === 'custom') return `Custom ${base.name}`;
  if (item.rarity === 'tuned') return `Tuned ${base.name}`;
  return base.name;
}

export function allHeirloomPieces() {
  return Object.values(HEIRLOOM_SETS).flatMap(s => s.pieces.map(p => ({ ...p, set: s.id })));
}

// smart loot: the first missing piece of the set with the most pieces owned (then random)
export function rollHeirloom(rng, { ilvl, q = 0, lootState, pieceId } = {}) {
  const all = allHeirloomPieces();
  let piece = pieceId && all.find(p => p.id === pieceId);
  if (!piece) {
    const owned = new Set(lootState?.heirloomPieces || []);
    const missing = all.filter(p => !owned.has(p.id));
    const pool = missing.length ? missing : all;
    const setCounts = {};
    for (const id of owned) { const p = all.find(x => x.id === id); if (p) setCounts[p.set] = (setCounts[p.set] || 0) + 1; }
    const best = Math.max(0, ...pool.map(p => setCounts[p.set] || 0));
    piece = rng.pick(pool.filter(p => (setCounts[p.set] || 0) === best));
  }
  const r = RARITIES[RARITY_INDEX.heirloom];
  const item = {
    uid: uid(rng, 'hl'), baseId: piece.id, slot: piece.slot, rarity: 'heirloom', ilvl, reqLevel: Math.max(1, ilvl - 2),
    primary: primaryFor(piece.slot, ilvl, r.mult), affixes: [], powers: [], set: piece.set, name: piece.name, lore: piece.lore,
    tune: 0, tuneFails: {}, recal: null, recalCount: 0,
  };
  if (piece.slot === 'weapon') item.element = piece.element || 'kinetic';
  const used = new Set();
  while (item.affixes.length < r.affixes) {
    const a = rollAffix(rng, piece.slot, ilvl, q, used, item.element);
    if (!a) break;
    used.add(a.id); item.affixes.push(a);
  }
  if (lootState) lootState.heirloomPieces = [...new Set([...(lootState.heirloomPieces || []), piece.id])];
  return item;
}

export function makeHeirCore(rng, ilvl) {
  return {
    uid: uid(rng, 'hc'), baseId: HEIR_CORE.id, slot: 'core', rarity: 'heirloom', ilvl, reqLevel: 1, name: HEIR_CORE.name, lore: HEIR_CORE.lore,
    primary: primaryFor('core', ilvl, HEIR_CORE.primaryMult), affixes: [], powers: [], heirCore: true, bound: true,
    tune: 0, tuneFails: {}, recal: null, recalCount: 0,
  };
}

// Frame Rating contribution of an item (DESIGN §6.6). Same-slot items compare cleanly.
const AFFIX_W = { credits: 0.5, lootLuck: 0.5, hackSpd: 0.5, stealth: 0.6, aoe: 0.8, dodgeCd: 0.8, energy: 0.8, enRegen: 0.8 };
export function itemFR(item) {
  if (!item) return 0;
  const r = RARITIES[RARITY_INDEX[item.rarity]];
  let fr = item.ilvl * 10 * r.mult * (1 + 0.06 * (item.tune || 0));
  for (const a of item.affixes || []) fr += item.ilvl * 2 * (0.5 + 0.5 * Math.min(1, a.q ?? 0.5)) * (AFFIX_W[a.id] ?? 1);
  if (item.powers?.length) fr += item.ilvl * 3;
  if (item.set) fr += item.ilvl * 3;
  if (item.heirCore) fr += item.ilvl * 5;
  return Math.round(fr);
}

export function isUpgrade(item, equipped) {
  return itemFR(item) > itemFR(equipped);
}

// ---- fabricator ------------------------------------------------------------------------------

export function salvageYield(item, rng) {
  const out = {};
  for (const [m, [lo, hi]] of Object.entries(SALVAGE[item.rarity] || {})) {
    const n = rng.int(lo, hi);
    if (n) out[m] = n;
  }
  for (let k = 1; k <= (item.tune || 0); k++) {
    const [, sa, ci, fl, hs] = TUNE_TABLE[k];
    const refund = { scrapAlloy: sa, circuitry: ci, flux: fl, heirShard: hs };
    for (const [m, n] of Object.entries(refund)) if (n) out[m] = (out[m] || 0) + Math.floor(n / 2);
  }
  return out;
}

export function tuneCost(item) {
  const k = (item.tune || 0) + 1;
  if (k > TUNE_MAX + (item.maxTuneBonus || 0)) return null;
  const row = TUNE_TABLE[Math.min(k, TUNE_MAX)];
  const t = COSTS.tune;
  return {
    k,
    credits: Math.round(t.base * L(item.ilvl) * t.growth ** (k - 1) * (t.rarity[item.rarity] || 1)),
    mats: { scrapAlloy: row[1], circuitry: row[2], flux: row[3], heirShard: row[4] },
    chance: Math.min(1, row[0] + TUNE_PITY * (item.tuneFails?.[k] || 0)),
  };
}

// Caller has already checked + deducted cost. Mutates item.
export function applyTune(item, rng) {
  const c = tuneCost(item);
  if (!c) return { ok: false, reason: 'max' };
  if (rng.next() < c.chance) {
    item.tune = c.k;
    return { ok: true, success: true, tune: item.tune };
  }
  item.tuneFails = { ...item.tuneFails, [c.k]: (item.tuneFails?.[c.k] || 0) + 1 };
  return { ok: true, success: false, tune: item.tune, nextChance: tuneCost(item).chance };
}

export function recalibrateCost(item) {
  const n = (item.recalCount || 0) + 1;
  return {
    credits: Math.round(COSTS.recalibrate.base * L(item.ilvl) * (n + 1)),
    mats: { circuitry: COSTS.recalibrate.circuitry, flux: RARITY_INDEX[item.rarity] >= RARITY_INDEX.prototype ? 1 : 0 },
  };
}

// Reroll affix at index. Once chosen, only that index can ever be rerolled (item.recal).
export function applyRecalibrate(item, index, rng, q = 0) {
  if (item.recal != null && item.recal !== index) return { ok: false, reason: 'locked', index: item.recal };
  const old = item.affixes[index];
  if (!old) return { ok: false, reason: 'index' };
  const exclude = new Set(item.affixes.map(a => a.id));
  const a = rollAffix(rng, item.slot, item.ilvl, q, exclude, item.element) || { ...old };
  item.affixes[index] = a;
  item.recal = index;
  item.recalCount = (item.recalCount || 0) + 1;
  return { ok: true, affix: a, old };
}

// ---- drops ---------------------------------------------------------------------------------

// ctx: {rank, level (enemy), riderLevel, q, rental, lootState, overclock, powers:[ids], killCreditsPct, creditsPct}
export function rollKillLoot(rng, ctx) {
  const out = { credits: 0, items: [] };
  const [cChance, cBase] = RANK_CREDITS[ctx.rank] || RANK_CREDITS.grunt;
  if (rng.next() < cChance) {
    out.credits = Math.max(1, Math.round(cBase * L(ctx.level) * rng.range(0.7, 1.3) * (1 + (ctx.creditsPct || 0) + (ctx.killCreditsPct || 0)) * (ctx.creditMult || 1)));
  }
  const d = KILL_DROPS[ctx.rank] || KILL_DROPS.grunt;
  const q = ctx.q || 0;
  const cap = ctx.overclock != null ? 60 + ctx.overclock : (ctx.riderLevel ?? ctx.level) + 2;
  const ilvl = Math.max(1, Math.min(ctx.level, cap));
  let n = 0;
  if (rng.next() < Math.min(1, d.chance * (1 + q / 2))) n += d.count;
  if (d.extra && rng.next() < Math.min(1, d.extra * (1 + q / 2))) n++;
  if (ctx.powers?.includes('scavenger') && ctx.rank === 'elite') n++;
  const ls = ctx.lootState;
  let gotProto = false;
  for (let i = 0; i < n; i++) {
    let minRarity = i === 0 ? d.minRarity : undefined;
    if (d.forced && i === 0) minRarity = d.forced;
    const it = rollItem(rng, { ilvl, q, minRarity, rental: ctx.rental, lootState: ls });
    if (RARITY_INDEX[it.rarity] >= RARITY_INDEX.prototype) gotProto = true;
    out.items.push(it);
  }
  if (ls && (ctx.riderLevel ?? ctx.level) >= BAD_LUCK.fromLevel) {
    if (gotProto) ls.badLuck = 0;
    else if (++ls.badLuck >= BAD_LUCK.threshold) {
      out.items.push(rollItem(rng, { ilvl, q, minRarity: 'prototype', rental: ctx.rental, lootState: ls }));
      ls.badLuck = 0; out.pity = true;
    }
  }
  return out;
}

// end-of-mission cache (MISSIONS §7)
export function rollCache(rng, grade, ctx) {
  const rule = CACHE_RULES[grade] || CACHE_RULES.street;
  let minRarity = rule.min;
  for (const [rar, p] of rule.upgrade || []) if (rng.next() < p) { minRarity = rar; break; }
  if (minRarity === 'relic' && ctx.level < 15) minRarity = 'prototype';
  const cap = ctx.overclock != null ? 60 + ctx.overclock : (ctx.riderLevel ?? ctx.level) + 2;
  return rollItem(rng, { ilvl: Math.min(ctx.level, cap), q: ctx.q || 0, minRarity, rental: ctx.rental, lootState: ctx.lootState });
}

// Warehouse market (ECONOMY §4): 6 parts at the rider's level + Sal's Special relic
export function marketStock(rng, level, { rental } = {}) {
  const rar = ['standard', 'standard', 'tuned', 'tuned', 'custom', level >= 8 ? 'prototype' : 'custom'];
  const items = rar.map(r => {
    const it = rollItem(rng, { ilvl: level, rarity: r, rental });
    return { item: it, price: Math.round(COSTS.market.base * L(level) * COSTS.market.rarity[r]) };
  });
  if (level >= 15) {
    const it = rollItem(rng, { ilvl: level, rarity: 'relic' });
    items.push({ item: it, price: Math.round(COSTS.market.salsSpecial * L(level)), special: true });
  }
  return items;
}

export { SLOTS, RARITIES, RARITY_INDEX, SCALING_STATS };
