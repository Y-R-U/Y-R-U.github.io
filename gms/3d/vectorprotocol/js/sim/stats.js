// Stat resolution: unit def + level/rank + mods -> combat stats. Also synergies + power rating.
import { DEFAULT_RULES, mergeRules } from './constants.js';

export const MOD_KEYS = ['hp', 'atk', 'def', 'spd', 'crit', 'critDmg', 'dr', 'dmg', 'heal', 'charge'];

export function emptyMods() { return {}; }

export function addMods(into, m, scale = 1) {
  if (!m) return into;
  for (const k in m) {
    if (k === 'vs') {
      into.vs = into.vs || {};
      for (const r in m.vs) into.vs[r] = (into.vs[r] || 0) + m.vs[r] * scale;
    } else if (typeof m[k] === 'number') into[k] = (into[k] || 0) + m[k] * scale;
  }
  return into;
}

export function sumMods(...list) {
  const out = {};
  for (const m of list) addMods(out, m);
  return out;
}

export function lookupUnit(data, def) {
  if (def && typeof def === 'object') return def;
  const u = data.units?.[def] || data.enemies?.[def];
  if (!u) throw new Error(`sim: unknown unit def '${def}'`);
  return u;
}

export function lookupAbility(data, a) {
  if (!a) return null;
  if (typeof a === 'object') return a;
  const ab = data.abilities?.[a];
  if (!ab) throw new Error(`sim: unknown ability '${a}'`);
  return ab;
}

// Base stats at level/rank, before battle mods.
export function unitStats(data, inst) {
  const rules = data._rules || mergeRules(data.rules);
  const def = lookupUnit(data, inst.def);
  const lvl = Math.max(1, inst.level || 1);
  const rank = inst.rank ?? (data.economy?.startRank?.[def.rarity] ?? 0);
  const rm = (rules.rankMult || DEFAULT_RULES.rankMult)[Math.min(rank, rules.rankMult.length - 1)] ?? 1;
  const g = def.growth || { hp: 0.08, atk: 0.07, def: 0.06 };
  const b = def.base;
  return {
    hp: Math.round(b.hp * (1 + (g.hp || 0) * (lvl - 1)) * rm),
    atk: Math.round(b.atk * (1 + (g.atk || 0) * (lvl - 1)) * rm),
    def: Math.round(b.def * (1 + (g.def || 0) * (lvl - 1)) * rm),
    spd: b.spd || 1.5,
    crit: b.crit ?? 0.05,
    critDmg: b.critDmg ?? 0.5,
  };
}

// Single-number power rating for UI / matchmaking. Weighted on effective dps*ehp.
export function unitPower(data, inst, mods) {
  const s = unitStats(data, inst);
  const m = mods || {};
  const hp = s.hp * (1 + (m.hp || 0));
  const atk = s.atk * (1 + (m.atk || 0) + (m.dmg || 0));
  const def = s.def * (1 + (m.def || 0));
  const aps = (1 + (m.spd || 0)) / s.spd;
  const crit = 1 + Math.min(0.75, s.crit + (m.crit || 0)) * (s.critDmg + (m.critDmg || 0));
  const ehp = hp * (1 + def / 300) / Math.max(0.4, 1 - (m.dr || 0));
  const dps = atk * aps * crit;
  const al = inst.abilityLevels || {};
  const abil = 1 + 0.04 * (((al.attack || 1) - 1) + ((al.passive || 1) - 1) + ((al.overdrive || 1) - 1));
  return Math.round(Math.sqrt(ehp * dps) * abil / 2);
}

export function squadPower(data, units, mods) {
  return units.reduce((s, u) => s + unitPower(data, u, mods), 0);
}

// Active synergies for a side. Returns [{id, name, tier, count, mods, to, faction?, role?}]
export function activeSynergies(data, defs) {
  const out = [];
  const byFaction = {}, byRole = {};
  for (const d of defs) {
    byFaction[d.faction] = (byFaction[d.faction] || 0) + 1;
    byRole[d.role] = (byRole[d.role] || 0) + 1;
  }
  for (const s of data.synergies || []) {
    if (s.kind === 'faction' || s.kind === 'role') {
      const n = s.kind === 'faction' ? (byFaction[s.faction] || 0) : (byRole[s.role] || 0);
      let best = null, ti = -1;
      (s.tiers || []).forEach((t, i) => { if (n >= t.count) { best = t; ti = i; } });
      if (best) out.push({ id: s.id, name: s.name, kind: s.kind, faction: s.faction, role: s.role, tier: ti + 1, count: n, mods: best.mods, to: best.to || s.to || s.kind });
    } else if (s.kind === 'roles') {
      const ok = Object.entries(s.need || {}).every(([r, c]) => (byRole[r] || 0) >= c);
      if (ok) out.push({ id: s.id, name: s.name, kind: 'roles', tier: 1, count: defs.length, mods: s.mods, to: s.to || 'all' });
    }
  }
  return out;
}

export function synergyAppliesTo(syn, def) {
  if (syn.to === 'all') return true;
  if (syn.to === 'faction') return def.faction === syn.faction;
  if (syn.to === 'role') return def.role === syn.role;
  return true;
}
