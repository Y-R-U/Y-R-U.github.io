// LASTWALL — per-run powerup draft: pick 1 of 3, limited rerolls.
// Cadence: levels 5,10,15,20 then every 10 (CFG.draftLevels). Effects stack.
import { pick } from './utils.js';

// rarity: 0 common, 1 rare, 2 epic
export const POOL = [
  { id: 'dmg1',   ic: '🗡', name: 'SHARPENED',   desc: '+25% damage (and knockback with it)', r: 0, apply: m => m.dmg *= 1.25 },
  { id: 'atk1',   ic: '⚡', name: 'FRENZY',      desc: '+20% attack speed', r: 0, apply: m => m.atk *= 1.2 },
  { id: 'kb1',    ic: '🥊', name: 'HAYMAKER',    desc: '+35% knockback. Send them flying.', r: 0, apply: m => m.kb *= 1.35 },
  { id: 'spd1',   ic: '👟', name: 'FLEET',       desc: '+12% move speed', r: 0, apply: m => m.spd *= 1.12 },
  { id: 'hp1',    ic: '❤', name: 'THICK SKIN',  desc: '+30 max HP (heals 30)', r: 0, apply: m => m.hpAdd += 30 },
  { id: 'serum1', ic: '⬢', name: 'HARVESTER',   desc: '+30% serum from kills', r: 0, apply: m => m.serum *= 1.3 },
  { id: 'boost1', ic: '⏱', name: 'LONG BURN',   desc: '+50% boost duration', r: 0, apply: m => m.boostDur *= 1.5 },
  { id: 'crit1',  ic: '🎯', name: 'WEAK SPOTS',  desc: '+12% crit chance (2× dmg & launch)', r: 0, apply: m => m.crit += .12 },
  { id: 'life1',  ic: '🩸', name: 'LEECH',       desc: 'Heal 4% of damage dealt', r: 1, apply: m => m.lifesteal += .04 },
  { id: 'super1', ic: '★', name: 'CAPACITOR',   desc: 'Superweapon charges 40% faster', r: 1, apply: m => m.superRate *= 1.4 },
  { id: 'dmg2',   ic: '⚔', name: 'EXECUTIONER', desc: '+45% damage', r: 1, apply: m => m.dmg *= 1.45 },
  { id: 'kb2',    ic: '💥', name: 'WRECKING BALL', desc: '+70% knockback. Comedy.', r: 1, apply: m => m.kb *= 1.7 },
  { id: 'reroll', ic: '🎲', name: 'MULLIGAN',    desc: '+2 rerolls for this run', r: 1, apply: m => m.rerolls += 2 },
  { id: 'giant',  ic: '🦾', name: 'JUGGERNAUT',  desc: '+60 max HP but −10% speed', r: 1, apply: m => { m.hpAdd += 60; m.spd *= .9; } },
  { id: 'glass',  ic: '💀', name: 'GLASS CANNON', desc: '+80% damage, −30 max HP', r: 2, apply: m => { m.dmg *= 1.8; m.hpAdd -= 30; } },
  { id: 'volat',  ic: '🧨', name: 'VOLATILE STRAIN', desc: 'Kills knock nearby infected back', r: 2, apply: m => m.volatile = true },
];

export function rollChoices(taken) {
  // 3 distinct options, weighted by rarity (epic ~10%, rare ~28%)
  const opts = [];
  const avail = POOL.filter(p => !taken.has(p.id) || p.id.match(/dmg|atk|kb|spd|hp1|serum|crit/)); // stackables can repeat
  let guard = 60;
  while (opts.length < 3 && guard-- > 0) {
    const r = Math.random();
    const tier = r < .1 ? 2 : r < .38 ? 1 : 0;
    const cand = avail.filter(p => p.r === tier && !opts.includes(p));
    if (!cand.length) continue;
    opts.push(pick(cand));
  }
  while (opts.length < 3) { const c = POOL.filter(p => !opts.includes(p)); opts.push(pick(c)); }
  return opts;
}
