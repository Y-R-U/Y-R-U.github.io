// Validate a DATA object against js/sim/SCHEMA.md. `node tools/sim/validate.mjs` checks js/data
// (or the fixture if js/data/index.js is missing). Exits 1 on errors.
import { pathToFileURL } from 'node:url';
import { ROLES, FACTIONS, ALL_FACTIONS, RARITIES, DEFAULT_STATUSES } from '../../js/sim/constants.js';

const EFFECTS = new Set(['damage', 'heal', 'shield', 'status', 'cleanse', 'dispel', 'charge', 'mods', 'revive']);
const PICKS = new Set(['lane', 'lowest_hp', 'highest_hp', 'highest_atk', 'random', 'backline', 'frontline', 'all', 'lane_all', 'column', 'adjacent', 'self', 'lowest_hp_ally', 'target', 'attacker']);
const TRIGGERS = new Set(['battle_start', 'wave_start', 'aura', 'on_attack', 'on_hit', 'on_crit', 'on_kill', 'on_damaged', 'low_hp', 'ally_death', 'every_n', 'interval']);
const DELIVERY = new Set(['melee', 'projectile', 'beam', 'instant', 'area']);
const GOALS = new Set(['win', 'no_losses', 'max_lost', 'time', 'max_units', 'no_role', 'min_role', 'min_faction', 'integrity']);
const MODKEYS = new Set(['hp', 'atk', 'def', 'spd', 'crit', 'critDmg', 'dr', 'dmg', 'heal', 'charge', 'vs']);

export function validateData(D) {
  const errs = [], warns = [];
  const E = (m) => errs.push(m), W = (m) => warns.push(m);
  const statuses = { ...DEFAULT_STATUSES, ...(D.statuses || {}) };
  const mods = (m, where) => { for (const k in m || {}) if (!MODKEYS.has(k)) E(`${where}: unknown mod key '${k}'`); };
  const spec = (t, where) => {
    if (!t) return;
    if (t.side && !['enemy', 'ally', 'self'].includes(t.side)) E(`${where}: bad target.side '${t.side}'`);
    if (t.pick && !PICKS.has(t.pick)) E(`${where}: bad target.pick '${t.pick}'`);
  };
  const ab = D.abilities || {};
  for (const [id, a] of Object.entries(ab)) {
    const w = `ability ${id}`;
    if (a.id && a.id !== id) E(`${w}: id mismatch '${a.id}'`);
    if (!['attack', 'passive', 'overdrive'].includes(a.kind)) E(`${w}: bad kind '${a.kind}'`);
    spec(a.target, w);
    if (a.delivery && !DELIVERY.has(a.delivery.type)) E(`${w}: bad delivery '${a.delivery.type}'`);
    if (a.kind === 'passive' && !TRIGGERS.has(a.trigger)) E(`${w}: bad trigger '${a.trigger}'`);
    if (a.trigger === 'aura') mods(a.aura?.mods, `${w}.aura`);
    if (a.kind !== 'passive' && !(a.effects || []).length) E(`${w}: no effects`);
    for (const e of a.effects || []) {
      if (!EFFECTS.has(e.type)) E(`${w}: unknown effect '${e.type}'`);
      if (e.type === 'status' && !statuses[e.status]) E(`${w}: unknown status '${e.status}'`);
      if (e.status && typeof e.status === 'object' && !statuses[e.status.status]) E(`${w}: unknown rider status '${e.status.status}'`);
      if (e.type === 'mods') mods(e.mods, w);
      spec(e.target, w);
    }
  }
  const allUnits = { ...(D.units || {}), ...(D.enemies || {}) };
  for (const [id, u] of Object.entries(allUnits)) {
    const w = `unit ${id}`;
    if (u.id !== id) E(`${w}: id mismatch '${u.id}'`);
    if (!ROLES.includes(u.role)) E(`${w}: bad role '${u.role}'`);
    if (!(D.units?.[id] && u.realm !== 'fantasy' ? FACTIONS : ALL_FACTIONS).includes(u.faction)) E(`${w}: bad faction '${u.faction}'`);
    if (u.realm && !['scifi', 'fantasy'].includes(u.realm)) E(`${w}: bad realm '${u.realm}'`);
    if (!RARITIES.includes(u.rarity)) E(`${w}: bad rarity '${u.rarity}'`);
    for (const k of ['hp', 'atk', 'def', 'spd']) if (!(u.base?.[k] > 0) && !(k === 'def' && u.base?.def === 0)) E(`${w}: base.${k} missing`);
    for (const k of ['attack', 'passive', 'overdrive']) {
      const r = u[k];
      if (!r) { if (k !== 'passive') E(`${w}: no ${k}`); continue; }
      const a = typeof r === 'object' ? r : ab[r];
      if (!a) E(`${w}: ${k} '${r}' not in abilities`);
      else if (a.kind !== k) E(`${w}: ${k} '${r}' has kind '${a.kind}'`);
    }
    if (!u.model) W(`${w}: no model id`);
  }
  const squad = (sq, w) => {
    const seen = new Set();
    for (const s of sq?.units || []) {
      if (!allUnits[s.def]) E(`${w}: unknown unit '${s.def}'`);
      if (s.slot) {
        const si = s.slot.col * 3 + s.slot.lane;
        if (!(s.slot.col === 0 || s.slot.col === 1) || ![0, 1, 2].includes(s.slot.lane)) E(`${w}: bad slot ${JSON.stringify(s.slot)}`);
        if (seen.has(si)) E(`${w}: duplicate slot ${si}`);
        seen.add(si);
      }
    }
    if ((sq?.units || []).length > 6) E(`${w}: >6 units`);
    if (!(sq?.units || []).length) E(`${w}: empty wave`);
  };
  const ids = new Set();
  for (const m of D.maps || []) {
    for (const l of m.levels || []) {
      const w = `level ${l.id}`;
      if (ids.has(l.id)) E(`${w}: duplicate id`);
      ids.add(l.id);
      if (!(l.waves || []).length || l.waves.length > 3) E(`${w}: needs 1-3 waves`);
      (l.waves || []).forEach((wv, i) => squad(wv, `${w} wave ${i + 1}`));
      for (const id of Object.keys(l.rewards?.shards || {})) if (!allUnits[id]) E(`${w}: shard reward for unknown unit '${id}'`);
      for (const r of [l.rewards, l.firstClear]) if (r?.focusShards != null && !(r.focusShards > 0)) E(`${w}: focusShards must be a positive number`);
      for (const id of [...(l.rewards?.cards || []), ...(l.firstClear?.cards || [])]) if (!D.units?.[id]) E(`${w}: card reward unknown '${id}'`);
      if (l.goals) {
        if (l.goals.length !== 3) E(`${w}: goals must have 3 entries`);
        if (l.goals[0]?.type !== 'win') W(`${w}: goal 0 is not 'win'`);
        for (const g of l.goals) {
          if (!GOALS.has(g.type)) E(`${w}: unknown goal '${g.type}'`);
          if (g.type === 'time' && !(g.max > 0)) E(`${w}: time goal needs max`);
          if ((g.type === 'no_role' || g.type === 'min_role') && !ROLES.includes(g.role)) E(`${w}: goal role '${g.role}'`);
          if (g.type === 'min_faction' && !FACTIONS.includes(g.faction)) E(`${w}: goal faction '${g.faction}'`);
        }
      }
      for (const r of Object.values(l.goalRewards || {})) for (const id of r.cards || []) if (!D.units?.[id]) E(`${w}: goal reward card unknown '${id}'`);
    }
    for (const [i, c] of (m.chests || []).entries()) {
      if (!(c.stars > 0) || c.stars > (m.levels || []).length * 3) E(`map ${m.id} chest ${i}: bad stars ${c.stars}`);
      for (const id of c.rewards?.cards || []) if (!D.units?.[id]) E(`map ${m.id} chest ${i}: card unknown '${id}'`);
      for (const id of Object.keys(c.rewards?.buffs || {})) if (!D.buffs?.[id]) E(`map ${m.id} chest ${i}: buff unknown '${id}'`);
    }
  }
  for (const [id, u] of Object.entries(D.units || {})) if (u.recruitable && !ids.has(u.recruitable)) E(`unit ${id}: recruitable level '${u.recruitable}' unknown`);
  for (const [id, b] of Object.entries(D.buffs || {})) mods(b.mods, `buff ${id}`);
  for (const s of D.synergies || []) for (const t of s.tiers || [s]) mods(t.mods, `synergy ${s.id}`);
  for (const [id, h] of Object.entries(D.hq || {})) {
    mods(h.mods, `hq ${id}`);
    for (const [c, arr] of Object.entries(h.cost || {})) if (Array.isArray(arr) && arr.length < (h.max || 1)) E(`hq ${id}: cost.${c} shorter than max`);
    if (h.requires?.hq && !D.hq[h.requires.hq]) E(`hq ${id}: requires unknown '${h.requires.hq}'`);
  }
  for (const [id, b] of Object.entries(D.recruit || {})) {
    const sum = Object.values(b.rates || {}).reduce((a, x) => a + x, 0);
    if (Math.abs(sum - 1) > 0.01) W(`banner ${id}: rates sum ${sum.toFixed(3)}`);
    if (Array.isArray(b.pool)) for (const u of b.pool) if (!D.units?.[u]) E(`banner ${id}: unknown pool unit '${u}'`);
  }
  for (const [id, ev] of Object.entries(D.events || {})) (ev.tiers || []).forEach((t) => (t.waves || []).forEach((wv, i) => squad(wv, `event ${id}/${t.id} wave ${i + 1}`)));
  for (const u of D.economy?.start?.units || []) if (!D.units?.[u.def]) E(`economy.start: unknown unit '${u.def}'`);
  for (const [slot, lid] of Object.entries(D.economy?.slotUnlocks || {})) if (!ids.has(lid)) E(`economy.slotUnlocks[${slot}]: unknown level '${lid}'`);
  return { errors: errs, warnings: warns };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { loadData } = await import('../../js/sim/data.js');
  const D = await loadData();
  const { errors, warnings } = validateData(D);
  console.log(`data source: ${D._source}`);
  for (const w of warnings) console.log('warn:', w);
  for (const e of errors) console.log('ERROR:', e);
  console.log(`${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
}
