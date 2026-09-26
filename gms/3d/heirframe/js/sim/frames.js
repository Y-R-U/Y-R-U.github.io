// Frame instances (owned robots): skills with sync mods, Mk tiers, loadouts.
import { FRAMES, SKILLS, SYNC_MODS, MK_TIERS, OWNABLE_FRAMES } from '../data/frames.js';
import { deepClone } from './util.js';

export { FRAMES, SKILLS, OWNABLE_FRAMES, MK_TIERS };

export function frameDef(idOrInst) {
  const id = typeof idOrInst === 'string' ? idOrInst : idOrInst.frameId;
  const d = FRAMES[id];
  if (!d) throw new Error('unknown frame ' + id);
  return d;
}

export function newFrame(frameId, uid) {
  const d = frameDef(frameId);
  const equipped = Object.fromEntries(d.slots.map(s => [s, null]));
  return {
    uid, frameId, archetype: d.archetype, name: d.name, model: d.model, rental: !!d.rental,
    tier: 0, sync: 1, syncXp: 0, equipped, mods: {}, paint: d.rental ? 'rental_orange' : 'gloss_black', hpFrac: 1, wrecked: false,
  };
}

export const tierName = f => (f.rental ? 'Rental' : MK_TIERS[f.tier || 0].name);
export const maxSync = f => frameDef(f).maxSync;

// sync-mod ranks the frame has unlocked: [{rank, options, chosen}]
export function modRanks(f) {
  return (SYNC_MODS[f.frameId] || []).map(r => ({ rank: r.rank, unlocked: f.sync >= r.rank, options: r.options, chosen: f.mods?.[r.rank] || null }));
}

export function chooseMod(f, rank, optionId) {
  const r = (SYNC_MODS[f.frameId] || []).find(x => x.rank === rank);
  if (!r || f.sync < rank) return false;
  if (!r.options.some(o => o.id === optionId)) return false;
  f.mods = { ...f.mods, [rank]: optionId };
  return true;
}

function patchSkill(skill, patch) {
  const out = deepClone(skill);
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'baseMult') out.base = (out.base || 0) * v;
    else out[k] = deepClone(v);
  }
  return out;
}

// Resolved skills for a frame: {attack, s1, s2, s3, heir?} with chosen sync mods + extra hooks (relic powers, sets).
// opts.heirCore: frame has the Heir Core equipped. opts.hooks: [{skill, ...patch}] from stats.powers/setBonuses.
export function frameSkills(f, opts = {}) {
  const d = frameDef(f);
  const out = {};
  for (const [slot, id] of Object.entries(d.skills)) {
    if (slot === 'heir' && !opts.heirCore) continue;
    out[slot] = deepClone(SKILLS[id]);
  }
  for (const r of SYNC_MODS[f.frameId] || []) {
    const choice = f.mods?.[r.rank];
    if (!choice || f.sync < r.rank) continue;
    const opt = r.options.find(o => o.id === choice);
    const slot = Object.keys(out).find(k => out[k].id === opt.skill);
    if (slot) out[slot] = patchSkill(out[slot], { ...opt.patch, modId: opt.id });
  }
  for (const h of opts.hooks || []) {
    if (!h?.skill) continue;
    const slot = Object.keys(out).find(k => out[k].id === h.skill);
    if (slot) { const { skill, ...patch } = h; out[slot] = patchSkill(out[slot], patch); }
  }
  return out;
}

export function equippedUids(f) { return Object.values(f.equipped).filter(Boolean); }

export function canEquipItem(item, f, level) {
  const d = frameDef(f);
  if (!d.slots.includes(item.slot)) return { ok: false, reason: 'slot', slots: d.slots };
  if ((item.reqLevel || 1) > level) return { ok: false, reason: 'level', need: item.reqLevel };
  return { ok: true };
}
