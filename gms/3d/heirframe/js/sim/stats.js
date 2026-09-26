// Stat assembly (ECONOMY §1) and combat resolution.
import { BALANCE, L, enemyHpMult } from '../data/balance.js';
import { SYNC_BONUS_PER_RANK, MK_TIERS, MK_DAMAGE_SHARE } from '../data/frames.js';
import { SLOT_PRIMARY, SCALING_STATS, ELEMENTS, HEIRLOOM_SETS, POWERS } from '../data/loot.js';
import { TUNE_BONUS } from '../data/economy.js';
import { clamp } from './util.js';

export { L };

const ADDITIVE = ['critChance', 'critDmg', 'cdr', 'lifeSteal', 'thornsPct', 'backstabPct', 'vsElitePct', 'aoePct', 'stealthPct',
  'hackSpeedPct', 'creditsPct', 'lootLuck', 'dmgPct', 'weaponDamage', 'xpPct', 'repairCostPct', 'heirPct', 'killCreditsPct', 'reflectRanged'];
const MULTIPLIED = { hpPct: 'hp', shieldPct: 'shield', armorPct: 'armor', energyRegenPct: 'energyRegen', movePct: 'moveSpeed', dodgeCdPct: 'dodgeCd', shieldRegenPct: 'shieldRegen', atkSpdPct: 'atkSpeed' };

// Flat stats an item grants (primary × L(iLvl) × rarityMult × tune, plus affixes).
export function itemStats(item) {
  const out = {};
  const add = (k, v) => { out[k] = (out[k] || 0) + v; };
  const tune = 1 + TUNE_BONUS * (item.tune || 0);
  for (const [k, v] of Object.entries(item.primary || {})) add(k, v * tune);
  for (const a of item.affixes || []) {
    if (a.stat === 'elemPct') add('elemPct_' + a.element, a.value);
    else if (a.stat === 'resist') add('resist_' + a.element, a.value);
    else add(a.stat, a.value);
  }
  return out;
}

// Primary block for a slot at an item level; exported for loot.js.
export function primaryFor(slot, ilvl, rarityMult, tilt = {}) {
  const out = {};
  for (const [k, v] of Object.entries(SLOT_PRIMARY[slot] || {})) {
    const scaled = SCALING_STATS.includes(k) ? v * L(ilvl) : v;
    const val = scaled * rarityMult * (tilt[k] || 1);
    out[k] = SCALING_STATS.includes(k) || k === 'energy' ? Math.round(val) : Math.round(val * 1000) / 1000;
  }
  return out;
}

// Set bonuses active for a list of equipped items: [{setId, count, bonus}]
export function activeSets(items) {
  const counts = {};
  for (const it of items) if (it?.set) counts[it.set] = (counts[it.set] || 0) + 1;
  const out = [];
  for (const [id, n] of Object.entries(counts)) {
    const set = HEIRLOOM_SETS[id];
    for (const [need, bonus] of Object.entries(set.bonuses)) if (n >= +need) out.push({ setId: id, need: +need, ...bonus });
  }
  return out;
}

// frameDef + frame instance {sync} + riderLevel + equipped items + extras (legacy, perks, buffs as stat maps)
export function computeStats({ frameDef, sync = 1, tier = 0, level = 1, items = [], extras = [] }) {
  const Lv = L(level);
  const mk = frameDef.rental ? 1 : MK_TIERS[tier]?.mult ?? 1;
  const syncMul = (1 + SYNC_BONUS_PER_RANK * (sync - 1)) * mk;
  const b = frameDef.base;
  const s = {
    level,
    hp: b.hp * Lv * syncMul, shield: (b.shield || 0) * Lv * syncMul, armor: (b.armor || 0) * Lv * syncMul,
    energy: b.energy * (1 + SYNC_BONUS_PER_RANK * (sync - 1)), energyRegen: b.energyRegen,
    moveSpeed: b.moveSpeed, critChance: b.critChance, critDmg: b.critDmg, detectMult: b.detectMult, dodgeCd: b.dodgeCd,
    shieldRegen: (b.shield || 0) * Lv * syncMul * BALANCE.combat.shieldRegenPct, atkSpeed: 1,
    hackSpeed: 1 + (b.hackSpeedPct || 0), rageFrac: b.rageFrac || 0, element: null,
  };
  for (const k of ADDITIVE) s[k] = s[k] || 0;
  const pct = {};
  const apply = map => {
    for (const [k, v] of Object.entries(map || {})) {
      if (MULTIPLIED[k]) pct[k] = (pct[k] || 0) + v;
      else s[k] = (s[k] || 0) + v;
    }
  };
  const equipped = items.filter(Boolean);
  for (const it of equipped) {
    apply(itemStats(it));
    if (it.slot === 'weapon' && it.element) s.element = it.element;
  }
  const sets = activeSets(equipped);
  for (const sb of sets) apply(sb.stats);
  s.powers = equipped.flatMap(it => it.powers || []);
  for (const p of s.powers) apply(POWERS.find(x => x.id === p)?.stats);
  s.setBonuses = sets.map(x => ({ setId: x.setId, need: x.need, desc: x.desc, hook: x.hook }));
  for (const e of extras) apply(e);

  // shield regen scales with final shield
  const shieldBase = s.shield;
  for (const [k, v] of Object.entries(pct)) {
    const key = MULTIPLIED[k];
    if (key === 'dodgeCd') s.dodgeCd *= 1 - v;
    else s[key] *= 1 + v;
  }
  if (s.shield !== shieldBase || pct.shieldRegenPct) s.shieldRegen = s.shield * BALANCE.combat.shieldRegenPct * (1 + (pct.shieldRegenPct || 0));

  const c = BALANCE.caps;
  s.critChance = clamp(s.critChance, 0, c.critChance);
  s.critDmg = clamp(s.critDmg, 1, c.critMult);
  s.cdr = clamp(s.cdr, 0, c.cdr);
  s.moveSpeed = Math.min(s.moveSpeed, b.moveSpeed * (1 + c.movePct));
  s.dodgeCd = Math.max(c.dodgeCdFloor, s.dodgeCd);
  s.detectMult = Math.max(c.detectFloor, s.detectMult * (1 - s.stealthPct));
  s.lifeSteal = clamp(s.lifeSteal, 0, c.lifeSteal);
  s.creditsPct = BALANCE.softSum(s.creditsPct * 100) / 100;
  s.lootLuck = BALANCE.softSum(s.lootLuck * 100) / 100;
  s.hackSpeed *= 1 + s.hackSpeedPct;
  s.resist = {}; s.elemPct = {};
  for (const e of ELEMENTS) {
    s.resist[e] = clamp(s['resist_' + e] || 0, 0, 0.75); delete s['resist_' + e];
    s.elemPct[e] = s['elemPct_' + e] || 0; delete s['elemPct_' + e];
  }
  s.weaponDamage = Math.round(s.weaponDamage);
  // dmgScale: multiply a skill's `base` by this to get pre-crit damage
  s.dmgScale = Lv * (1 + s.weaponDamage / (BALANCE.combat.weaponK * Lv)) * (1 + s.dmgPct) * (1 + (mk - 1) * MK_DAMAGE_SHARE);
  s.tier = tier; s.sync = sync;
  for (const k of ['hp', 'shield', 'armor', 'energy']) s[k] = Math.round(s[k]);
  s.hp = Math.max(1, s.hp);
  return s;
}

// enemy def + level + rank + threat multipliers -> stats
export function enemyStats(def, level, rankDef, threat = { hp: 1, dmg: 1 }, extra = {}) {
  const Lv = L(level);
  const b = def.base;
  const s = {
    level,
    hp: Math.round(b.hp * Lv * rankDef.hp * threat.hp * enemyHpMult(level)),
    shield: Math.round((b.shield || 0) * Lv * Math.sqrt(rankDef.hp) * threat.hp),
    armor: Math.round((b.armor || 0) * Lv),
    energy: 100, energyRegen: 10, moveSpeed: def.move ?? 4, critChance: 0.05, critDmg: 1.5, atkSpeed: 1,
    dmgScale: b.dmg * Lv * rankDef.dmg * threat.dmg, dmgPct: 0, cdr: 0, lifeSteal: 0, thornsPct: 0, backstabPct: 0, vsElitePct: 0,
    reflectRanged: 0, stunResist: def.stunResist || 0, frontalDR: def.frontalDR || 0, element: null,
    resist: Object.fromEntries(ELEMENTS.map(e => [e, def.resist?.[e] || 0])), elemPct: Object.fromEntries(ELEMENTS.map(e => [e, 0])),
    powers: [], setBonuses: [],
  };
  if (extra.shieldPct) s.shield = Math.round(Math.max(s.shield, s.hp * (extra.shieldFloor || 0)) * (1 + extra.shieldPct));
  if (extra.dmgPct) s.dmgScale *= 1 + extra.dmgPct;
  if (extra.reflectRanged) s.reflectRanged = extra.reflectRanged;
  s.shieldRegen = s.shield * BALANCE.combat.shieldRegenPct;
  return s;
}

export function armorDR(armor, attackerLevel) {
  const c = BALANCE.combat;
  return clamp(armor / (armor + c.armorK * L(attackerLevel)), 0, c.maxDR);
}

// average damage per second of a skill for UI/sim (no crit variance, no armor)
export function skillDps(stats, skill) {
  const critAvg = 1 + stats.critChance * (stats.critDmg - 1);
  const hitBase = skill.combo ? skill.combo.reduce((a, b) => a + b, 0) / skill.combo.length : (skill.base || 0) * (skill.pellets || skill.hits || 1);
  const interval = skill.basic ? skill.interval / stats.atkSpeed : Math.max(skill.cooldown || 1, 0.1);
  return hitBase * stats.dmgScale * critAvg / interval;
}

export function effectiveHp(stats, attackerLevel) {
  return (stats.hp + stats.shield) / (1 - armorDR(stats.armor, attackerLevel));
}


// ---- live combatants ------------------------------------------------------------------------

export function makeCombatant({ id, name = id, level = 1, stats, faction = 'neutral', kind = 'enemy', rank = 'grunt', tags = [], passive = null, skills = {} }) {
  return {
    id, name, level, kind, faction, rank, tags, passive, skills, stats,
    hp: stats.hp, shield: stats.shield, energy: stats.energy,
    cooldowns: {}, statuses: [], hidden: false, alive: true, alerted: kind !== 'enemy', sinceHit: 99, idle: 0,
    momentum: 0, momentumT: 0, stunBuild: 0, still: 0, moving: false, charge: 0,
  };
}

// swap stats keeping hp/shield fractions (equip mid-mission, level-up)
export function restat(c, stats, { heal = false } = {}) {
  const hpF = heal ? 1 : c.hp / (c.stats.hp || 1);
  const shF = heal ? 1 : c.stats.shield ? c.shield / c.stats.shield : 1;
  c.stats = stats;
  c.level = stats.level ?? c.level;
  c.hp = Math.max(1, Math.round(stats.hp * hpF));
  c.shield = Math.round(stats.shield * shF);
  c.energy = heal ? stats.energy : Math.min(c.energy, stats.energy);
}

export const hasStatus = (c, id) => c.statuses.some(s => s.id === id);
export function statusMult(c, key) {
  let m = 1;
  for (const s of c.statuses) if (s[key]) m *= s[key];
  return m;
}
export const isStunned = c => c.statuses.some(s => s.stun || s.id === 'stun' || s.id === 'disabled' || s.id === 'distracted');

export function addStatus(c, st) {
  let s = { ...st };
  if (s.stun && c.stats.stunResist) s.t *= 1 - clamp(c.stats.stunResist, 0, 0.9);
  if (s.bossImmune && (c.rank === 'boss' || c.rank === 'champion')) return false;
  const ex = c.statuses.find(x => x.id === s.id);
  if (ex) { Object.assign(ex, s, { t: Math.max(ex.t, s.t) }); }
  else c.statuses.push(s);
  if (s.id === 'cloak') c.hidden = true;
  return true;
}

export function removeStatus(c, id) {
  c.statuses = c.statuses.filter(s => s.id !== id);
  if (id === 'cloak') c.hidden = false;
}

// Advance timers. Returns events [{type:'death'|'statusEnd'|'dot', ...}]. opts.moving/opts.still from engine.
export function tickCombatant(c, dt, opts = {}) {
  const out = [];
  if (!c.alive) return out;
  const st = c.stats;
  c.sinceHit += dt;
  c.idle += dt;
  if (opts.moving != null) { c.moving = opts.moving; c.still = opts.moving ? 0 : c.still + dt; }
  for (const k of Object.keys(c.cooldowns)) if ((c.cooldowns[k] -= dt) <= 0) delete c.cooldowns[k];
  c.energy = Math.min(st.energy, c.energy + st.energyRegen * dt);
  if (c.sinceHit >= BALANCE.combat.shieldRegenDelay && c.shield < st.shield) c.shield = Math.min(st.shield, c.shield + st.shieldRegen * dt);
  if (c.momentum && (c.momentumT -= dt) <= 0) c.momentum = 0;
  if (c.stunBuild > 0) c.stunBuild = Math.max(0, c.stunBuild - 0.2 * dt);
  for (let i = c.statuses.length - 1; i >= 0; i--) {
    const s = c.statuses[i];
    if (s.dot) {
      const d = s.dot * dt;
      c.hp -= d;
      out.push({ type: 'dot', id: c.id, amount: d, status: s.id, src: s.src });
      if (c.hp <= 0) { c.hp = 0; c.alive = false; out.push({ type: 'death', id: c.id, by: s.src }); return out; }
    }
    if ((s.t -= dt) <= 0) {
      c.statuses.splice(i, 1);
      if (s.id === 'cloak') c.hidden = false;
      out.push({ type: 'statusEnd', id: c.id, status: s.id });
    }
  }
  return out;
}

export function energyCost(c, skill, opts = {}) {
  if (!skill.energy) return 0;
  let cost = skill.energy * (opts.energyCostMult || 1);
  if (c.stats.powers?.includes('coldstart') && c.idle >= 5) cost = 0;
  return cost;
}

export function skillReady(c, skill, opts = {}) {
  if (!c.alive || isStunned(c)) return false;
  if (c.cooldowns[skill.id] > 0) return false;
  if (skill.hpCostPct && c.hp <= c.stats.hp * skill.hpCostPct) return false;
  return c.energy >= energyCost(c, skill, opts);
}

// Spend resources and start the cooldown. Returns false when not ready.
export function useSkill(c, skill, opts = {}) {
  if (!skillReady(c, skill, opts)) return false;
  c.energy -= energyCost(c, skill, opts);
  if (skill.hpCostPct) c.hp -= c.stats.hp * skill.hpCostPct;
  const cd = skill.basic
    ? (skill.interval || 1) / (c.stats.atkSpeed * statusMult(c, 'atkSpeedMult'))
    : (skill.cooldown || 0) * (1 - c.stats.cdr);
  if (cd > 0) c.cooldowns[skill.id] = cd;
  c.idle = 0;
  for (const st of skill.selfStatus || []) addStatus(c, { ...st, src: c.id });
  return true;
}

// Resolve one hit. Mutates defender (and attacker for lifesteal/thorns/momentum/cloak).
// opts: {comboIndex, backstab (engine: from behind or unalerted), frontal (hit came from defender's front),
//        falloff, dryRun, pellet (skip per-pellet momentum)}
export function resolveHit(attacker, defender, skill, rng, opts = {}) {
  const C = BALANCE.combat;
  const A = attacker.stats, D = defender.stats;
  const element = skill.element || A.element || 'kinetic';
  const res = { hit: false, miss: false, crit: false, backstab: false, amount: 0, shieldDmg: 0, hullDmg: 0, killed: false, element, statuses: [], blocked: false };
  if (!defender.alive || defender.invulnerable) return res;

  let evasion = D.evasion || 0;
  if (defender.passive === 'steady' && defender.moving) evasion += 0.15;
  for (const s of defender.statuses) if (s.evasion) evasion += s.evasion;
  if (!skill.unavoidable && evasion > 0 && rng.next() < Math.min(evasion, BALANCE.caps.evasion)) { res.miss = true; return res; }
  res.hit = true;

  let base = skill.combo ? skill.combo[(opts.comboIndex || 0) % skill.combo.length] : (skill.base ?? 1);
  let dmg = base * A.dmgScale * (opts.falloff ?? 1);
  dmg *= 1 + (A.elemPct?.[element] || 0);

  let critChance = A.critChance + (skill.critBonus || 0);
  if (attacker.passive === 'steady' && attacker.still >= 1) critChance += 0.25;
  let forceCrit = attacker.statuses.some(s => s.guaranteedCrit);
  if (skill.backstab && (opts.backstab || attacker.hidden)) {
    res.backstab = true;
    dmg *= C.backstabMult * (1 + (A.backstabPct || 0));
  }
  if (forceCrit || rng.next() < critChance) {
    res.crit = true;
    dmg *= A.critDmg;
    if (A.powers?.includes('lullaby')) attacker.energy = Math.min(A.energy, attacker.energy + 2);
  }
  if (attacker.passive === 'momentum' && attacker.momentum) dmg *= 1 + 0.04 * attacker.momentum;
  if (A.vsElitePct && ['elite', 'champion', 'boss'].includes(defender.rank)) dmg *= 1 + A.vsElitePct;
  if (A.powers?.includes('overdrive') && attacker.energy >= A.energy - 0.5) dmg *= 1.3;
  if (A.powers?.includes('tidewater') && isStunned(defender)) dmg *= 1.35;
  if (skill.executeBelow && defender.hp < D.hp * skill.executeBelow) dmg *= skill.executeMult || 2;
  if (attacker.charge) { dmg *= 1 + attacker.charge; attacker.charge = 0; }
  for (const s of attacker.statuses) if (s.dmgMult) dmg *= s.dmgMult;
  for (const s of defender.statuses) if (s.dmgTakenMult) dmg *= s.dmgTakenMult;
  if (opts.frontal) {
    const fr = Math.max(D.frontalDR || 0, ...defender.statuses.map(s => s.frontalDR || 0));
    if (fr) { dmg *= 1 - fr; res.blocked = true; }
  }
  dmg *= 1 - (D.resist?.[element] || 0);

  const el = C.elements[element] || C.elements.kinetic;
  let armor = D.armor;
  if (D.powers?.includes('renewal') && defender.hp < D.hp * 0.3) armor *= 1.4;
  const dr = armorDR(armor, attacker.level);
  if (opts.dryRun) { res.amount = Math.round(dmg * (1 - dr)); return res; }

  let remaining = dmg;
  if (defender.shield > 0) {
    const sh = Math.min(defender.shield, remaining * el.vsShield);
    defender.shield -= sh;
    res.shieldDmg = sh;
    remaining -= sh / el.vsShield;
    if (defender.shield <= 0) res.shieldBroke = true;
  }
  if (remaining > 0) {
    const hull = remaining * el.vsHull * (1 - dr);
    defender.hp -= hull;
    res.hullDmg = hull;
  }
  res.amount = Math.round(res.shieldDmg + res.hullDmg);
  res.shieldDmg = Math.round(res.shieldDmg); res.hullDmg = Math.round(res.hullDmg);
  defender.sinceHit = 0;
  if (defender.kind === 'enemy') defender.alerted = true;
  if (defender.stats.rageFrac) defender.energy = Math.min(D.energy, defender.energy + res.amount * D.rageFrac / Math.max(1, L(defender.level)) );
  if (defender.stats.powers?.includes('kinetic_battery')) defender.charge = Math.min(1, defender.charge + res.amount / D.hp);

  // element riders
  if (element === 'thermal' && res.amount > 0) {
    addStatus(defender, { id: 'burn', t: el.burnT, dot: dmg * el.burnPct / el.burnT * (1 - dr), src: attacker.id });
    res.statuses.push('burn');
  }
  if (element === 'shock') {
    res.chain = { count: A.powers?.includes('chainlightning') ? 3 : el.chain, pct: el.chainPct };
    defender.stunBuild += el.stunBuild;
    if (defender.stunBuild >= 1) { defender.stunBuild = 0; addStatus(defender, { id: 'stun', t: 1, stun: true, src: attacker.id }); res.statuses.push('stun'); }
  }
  for (const st of skill.applies || []) {
    if (st.chance != null && rng.next() >= st.chance) continue;
    if (addStatus(defender, { ...st, src: attacker.id })) res.statuses.push(st.id);
  }
  if (A.lifeSteal && res.amount) attacker.hp = Math.min(A.hp, attacker.hp + res.amount * A.lifeSteal);
  if (skill.kind === 'melee' && D.thornsPct && res.amount) {
    attacker.hp -= res.amount * D.thornsPct; res.thorns = Math.round(res.amount * D.thornsPct);
  }
  if (skill.kind === 'ranged' && D.reflectRanged && res.amount) {
    attacker.hp -= res.amount * D.reflectRanged; res.thorns = Math.round(res.amount * D.reflectRanged);
  }
  if (attacker.hp <= 0 && attacker.alive) { attacker.hp = 0; attacker.alive = false; res.attackerDied = true; }
  if (attacker.passive === 'momentum' && !opts.pellet) { attacker.momentum = Math.min(attacker.momentumMax || 5, attacker.momentum + 1); attacker.momentumT = 3; }
  if (attacker.hidden && !skill.keepsCloak) removeStatus(attacker, 'cloak');
  if (forceCrit) attacker.statuses = attacker.statuses.filter(s => !s.guaranteedCrit || s.id === 'cloak' && attacker.hidden);
  if (defender.hidden) removeStatus(defender, 'cloak');
  if (defender.hp <= 0) {
    res.overkill = Math.round(-defender.hp);
    defender.hp = 0; defender.alive = false; res.killed = true;
    if (A.powers?.includes('brighter_future')) attacker.hp = Math.min(A.hp, attacker.hp + A.hp * 0.03);
  }
  return res;
}

export function heal(c, amount) { if (c.alive) c.hp = Math.min(c.stats.hp, c.hp + amount); }
