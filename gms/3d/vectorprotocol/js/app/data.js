// Game data access: design's js/data/index.js when it lands, else the sim's fixture dataset.
import { load } from './modules.js';

let DATA = null;
let ST = null;   // sim stats module (power + synergies) when available

export async function loadData() {
  const d = await load('data');
  DATA = d?.default || d?.DATA || null;
  if (!DATA) { const f = await load('fixture'); DATA = f?.default || f?.DATA || f?.FIXTURE || null; }
  if (!DATA) DATA = { units: {}, abilities: {}, maps: [], economy: {}, synergies: [], buffs: {}, hq: {}, recruit: {}, events: {} };
  DATA.enemies = DATA.enemies || {};
  const sb = await load('sim_battle');
  if (sb?.prepareData) { try { DATA = sb.prepareData(DATA); } catch (e) { console.warn('[data] prepareData failed', e); } }
  ST = await load('stats');
  return DATA;
}

export const data = () => DATA;
export const unitDef = (id) => (typeof id === 'object' ? id : DATA.units[id] || DATA.enemies[id]);
export const ability = (id) => (typeof id === 'object' ? id : DATA.abilities?.[id]);
export const maps = () => DATA.maps || [];
export const mapByIndex = (n) => maps().find((m) => m.order === +n) || maps()[+n - 1];
export function levelById(id) {
  for (const m of maps()) for (const l of m.levels) if (l.id === id) return { map: m, level: l };
  return null;
}

const RANK_MULT = [1, 1.15, 1.32, 1.52, 1.75, 2.0];
export function unitStats(def, level = 1, rank = 0) {
  def = unitDef(def);
  if (!def) return { hp: 0, atk: 0, def: 0, spd: 1 };
  const g = def.growth || {}, b = def.base || {};
  const rm = (DATA.rules?.rankMult || RANK_MULT)[rank] || 1;
  const L = level - 1;
  return {
    hp: Math.round(b.hp * (1 + (g.hp || 0) * L) * rm), atk: Math.round(b.atk * (1 + (g.atk || 0) * L) * rm),
    def: Math.round(b.def * (1 + (g.def || 0) * L) * rm), spd: b.spd, crit: b.crit || 0, critDmg: b.critDmg || 0.5,
  };
}
export function unitPower(def, level = 1, rank = 0, abilityLevels) {
  if (ST?.unitPower) { try { return ST.unitPower(DATA, { def, level, rank, abilityLevels }); } catch (e) { /* fall through */ } }
  const s = unitStats(def, level, rank);
  const w = DATA.economy?.power || { hp: 0.1, atk: 1, def: 0.5 };
  return Math.round(s.hp * w.hp + (s.atk / (s.spd || 1.5)) * 1.5 * w.atk + s.def * w.def);
}
export function synergies(defs) {
  defs = defs.map(unitDef).filter(Boolean);
  if (ST?.activeSynergies) { try { return ST.activeSynergies(DATA, defs); } catch (e) { /* fall through */ } }
  return [];
}
export const rules = () => DATA._rules || {};
export function wavePower(wave) {
  return (wave.units || []).reduce((a, u) => a + unitPower(u.def, u.level || 1, u.rank || 0), 0);
}
