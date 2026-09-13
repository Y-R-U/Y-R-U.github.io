// Derived stats. Recomputed ONLY when a weapon/passive/relic/sigil changes -
// never per frame. Multiplicative stats are multipliers (1.0 = base).
//
// Fold order is fixed and matters: base -> character -> passives -> relics ->
// sigils -> sanctum. Relics come after passives because a relic's job is to bend
// a build that already exists ("+50% damage, you cannot be healed"), and sanctum
// comes last because meta progression must feel like it lands on top of the run.
// LANE B-core owns this file.

import { PASSIVES } from '../data/passives.js';
import { RELICS } from '../data/relics.js';
import { SIGILS } from '../data/sigils.js';
import { SANCTUM } from '../data/meta.js';

// Stats stored as multipliers. Anything not listed here is additive.
export const MUL_STATS = {
  might: 1, area: 1, haste: 1, speed: 1, duration: 1, magnet: 1,
  luck: 1, curse: 1, growth: 1, greed: 1, sever: 1, critMult: 1, maxHpMul: 1,
};

export function baseStats() {
  return {
    might: 1, area: 1, haste: 1, speed: 1, duration: 1, amount: 0,
    pierce: 0, magnet: 1, luck: 1, armour: 0, regen: 0,
    crit: 0.05, critMult: 2, curse: 1, growth: 1, greed: 1, sever: 1,
    // Off-contract, requested in docs/lanes/B-core.md: world.js reads these to
    // set player.maxHp and player.revives. They are not read by anyone else.
    maxHpMul: 1, revives: 0,
  };
}

// `mul` is an ABSOLUTE multiplier (1.12 means x1.12), `add` is a flat addend.
// That is what js/data/passives.js writes, and CONTRACTS 7.2 says these stats
// ARE multipliers - so composing them is a multiply, never a 1+x.
function applyMul(s, stat, m) { s[stat] = (s[stat] === undefined ? 1 : s[stat]) * m; }
function applyAdd(s, stat, a) { s[stat] = (s[stat] === undefined ? 0 : s[stat]) + a; }

function fold(s, stat, value) {
  if (!stat || value === undefined || value === null) return;
  if (stat in MUL_STATS) applyMul(s, stat, value); else applyAdd(s, stat, value);
}

// A data entry may be {stat, mul}, {stat, add}, or a bare {stats:{...}} bag.
function foldEntry(s, entry) {
  if (!entry) return;
  if (entry.stat !== undefined) {
    if (entry.mul !== undefined) applyMul(s, entry.stat, entry.mul);
    else if (entry.add !== undefined) applyAdd(s, entry.stat, entry.add);
    else if (entry.value !== undefined) fold(s, entry.stat, entry.value);
    return;
  }
  if (entry.stats) for (const k in entry.stats) fold(s, k, entry.stats[k]);
}

export function recomputeStats(world) {
  const p = world.player;
  const s = baseStats();

  // 1. character trait
  const ch = world.character;
  if (ch) {
    if (ch.trait) foldEntry(s, ch.trait);
    if (Array.isArray(ch.traits)) for (let i = 0; i < ch.traits.length; i++) foldEntry(s, ch.traits[i]);
  }

  // 2. passives, level by level - levels[i] is the step INTO level i+1
  const owned = p.passives || {};
  for (const id in owned) {
    const def = PASSIVES[id];
    const lv = owned[id] | 0;
    if (!def || !def.levels || lv <= 0) continue;
    for (let i = 0; i < lv && i < def.levels.length; i++) foldEntry(s, def.levels[i]);
  }

  // 3. relics - the one place a data file holds a function (CONTRACTS 8.4)
  const relics = world.relics || [];
  for (let i = 0; i < relics.length; i++) {
    const r = typeof relics[i] === 'string' ? RELICS[relics[i]] : relics[i];
    if (r && typeof r.apply === 'function') {
      try { r.apply(s); } catch (e) { /* a bad relic must not kill the run */ }
    }
  }

  // 4. sigils - mostly rule-benders, but one may carry stats
  const sigils = world.sigils || [];
  for (let i = 0; i < sigils.length; i++) {
    const g = typeof sigils[i] === 'string' ? SIGILS[sigils[i]] : sigils[i];
    if (!g) continue;
    foldEntry(s, g);
    if (typeof g.apply === 'function') { try { g.apply(s); } catch (e) {} }
  }

  // 5. sanctum meta levels
  const meta = world.sanctum || {};
  for (const id in meta) {
    const node = SANCTUM[id];
    const lv = meta[id] | 0;
    if (!node || lv <= 0) continue;
    // `perLevel` is a FRACTIONAL gain per level: a mul stat gains
    // (1 + perLevel*level), an additive stat gains perLevel*level.
    const per = node.perLevel === undefined ? 0 : node.perLevel;
    if (!node.stat) continue;
    if (node.stat in MUL_STATS) applyMul(s, node.stat, 1 + per * lv);
    else applyAdd(s, node.stat, per * lv);
  }

  // 6. curse tier. A curse is a difficulty dial the player opts into: it raises
  // the horde (world.hpRamp reads stats.curse) and pays out in greed.
  if (world.curse) {
    s.curse *= 1 + world.curse * 0.14;
    s.greed *= 1 + world.curse * 0.10;
  }

  // clamps that keep the sim sane no matter what a relic does
  s.crit = Math.max(0, Math.min(0.95, s.crit));
  s.critMult = Math.max(1, s.critMult);
  s.speed = Math.max(0.2, s.speed);
  s.haste = Math.max(0.1, s.haste);
  s.area = Math.max(0.1, s.area);
  s.might = Math.max(0, s.might);
  s.maxHpMul = Math.max(0.1, s.maxHpMul);

  p.stats = s;
  return s;
}
