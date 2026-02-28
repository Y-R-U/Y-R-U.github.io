// ===== Combat System =====
import { COMBAT_TICK_MS } from '../config.js';
import { getState, getEquipBonus, getBuffBonus } from '../state.js';
import { awardXP } from '../skills/skillEngine.js';
import { rollLoot } from './loot.js';
import {
  spawnHit, spawnMagicHit, spawnDeath, spawnItemDrop,
  showDamage, showHeal, showGold
} from '../engine/particles.js';
import { playHit, playMiss, playDeath } from '../engine/audio.js';
import { addToBackpack } from '../state.js';

let lastTick = 0;
let currentTarget = null;

export function setTarget(enemy) {
  if (currentTarget) currentTarget.targeted = false;
  currentTarget = enemy;
  if (enemy) enemy.targeted = true;
}

export function getTarget() { return currentTarget; }

export function clearTarget() {
  if (currentTarget) currentTarget.targeted = false;
  currentTarget = null;
}

export function update(player, enemies, nowMs) {
  if (!player || player.isDead()) return;

  const aggroRadius = player.getAggroRadius();
  const liveEnemies = enemies.filter(e => !e.dead);

  // Auto-target nearest enemy in aggro range if no current target
  if (!currentTarget || currentTarget.dead || !liveEnemies.includes(currentTarget)) {
    currentTarget = null;
    let nearest = null, nearestDist = aggroRadius;
    for (const e of liveEnemies) {
      const d = e.distTo(player);
      if (d < nearestDist) { nearestDist = d; nearest = e; }
    }
    if (nearest) setTarget(nearest);
  }

  // Combat tick
  if (currentTarget && !currentTarget.dead && nowMs - lastTick >= COMBAT_TICK_MS) {
    lastTick = nowMs;
    _doPlayerAttack(player, currentTarget);

    // Enemy counter-attack if in melee range
    if (currentTarget && !currentTarget.dead && currentTarget.distTo(player) <= 1.5) {
      _doEnemyAttack(currentTarget, player);
    }
  }

  // Enemy attacks for all enemies in melee range (non-targeted ones also attack)
  for (const e of liveEnemies) {
    if (e === currentTarget) continue;
    if (e.distTo(player) <= 1.5 && nowMs - (e._lastAtk || 0) >= COMBAT_TICK_MS * 1.5) {
      e._lastAtk = nowMs;
      _doEnemyAttack(e, player);
    }
  }
}

function _doPlayerAttack(player, enemy) {
  const st = getState();
  const atkSkill = st.player.skills.attack?.level || 1;
  const defSkill = st.player.skills.defence?.level || 1;

  // Determine attack type based on equipped weapon
  const weapon = st.inventory.equipped.weapon;
  let atkType = 'melee';
  let atkStat = player.getAttackStat();   // accuracy
  let strStat = player.getStrengthStat(); // max hit (melee only)

  if (weapon) {
    const { ITEMS } = _lazyItems();
    const wDef = ITEMS[weapon.id];
    if (wDef) {
      if (wDef.rngBonus) { atkType = 'ranged'; atkStat = (st.player.skills.ranged?.level || 1) + wDef.rngBonus; }
      if (wDef.magBonus) { atkType = 'magic';  atkStat = (st.player.skills.magic?.level  || 1) + wDef.magBonus; }
    }
  }

  // Miss chance (based on attack/accuracy stat)
  const missChance = Math.max(0, 0.15 - atkSkill * 0.002);
  if (Math.random() < missChance) {
    showDamage(enemy.x, enemy.y, 'MISS');
    playMiss();
    return;
  }

  // Block chance (if offhand)
  const offhand = st.inventory.equipped.offhand;
  if (offhand) {
    const blockChance = Math.min(0.30, defSkill * 0.003);
    if (Math.random() < blockChance) {
      showDamage(enemy.x, enemy.y, 'BLOCK');
      awardXP('defence', 5, player);   // blocking trains defence faster
      return;
    }
  }

  // Small passive defence XP on any successful attack (slow training)
  awardXP('defence', 1, player);

  // Damage — melee uses strength for max hit; ranged/magic use their skill stat
  let raw;
  if (atkType === 'melee') {
    raw = (strStat * (0.8 + Math.random() * 0.4)) - enemy.def;
  } else {
    raw = (atkStat * (0.8 + Math.random() * 0.4)) - enemy.def;
  }
  const dmg = Math.max(1, Math.floor(raw));

  enemy.takeDamage(dmg);
  showDamage(enemy.x, enemy.y, dmg);

  if (atkType === 'magic') spawnMagicHit(enemy.x, enemy.y);
  else spawnHit(enemy.x, enemy.y);
  playHit();

  // Award XP per hit
  const xpMulti = Math.max(1, Math.floor(dmg * 0.1));
  if (atkType === 'melee') {
    awardXP('attack',    Math.floor(enemy.xp * 0.04 * xpMulti), player);
    awardXP('strength',  Math.floor(enemy.xp * 0.04 * xpMulti), player);
    awardXP('hitpoints', Math.floor(enemy.xp * 0.02 * xpMulti), player);
  } else if (atkType === 'ranged') {
    awardXP('ranged',    Math.floor(enemy.xp * 0.06 * xpMulti), player);
    awardXP('hitpoints', Math.floor(enemy.xp * 0.04 * xpMulti), player);
  } else {
    awardXP('magic',     Math.floor(enemy.xp * 0.06 * xpMulti), player);
    awardXP('hitpoints', Math.floor(enemy.xp * 0.04 * xpMulti), player);
  }

  // On kill
  if (enemy.dead) {
    _onEnemyKill(enemy, atkType, player);
  }
}

function _doEnemyAttack(enemy, player) {
  const st = getState();
  const atkStat = enemy.atk;

  // Miss
  if (Math.random() < 0.05) return;

  const reduced = player.takeDamage(atkStat);
  showDamage(player.x, player.y, reduced);

  // Defence XP for taking hits — faster than passive (taking damage = active defence training)
  awardXP('defence', Math.max(2, Math.floor(reduced * 0.2)), player);

  // Draining effect
  if (enemy.drains) {
    const drain = Math.floor(reduced * 0.3);
    if (drain > 0) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + drain);
      showHeal(enemy.x, enemy.y, drain);
    }
  }
}

async function _onEnemyKill(enemy, atkType, player) {
  const st = getState();
  // Gold drop
  const [gMin, gMax] = enemy.gold;
  const gold = gMin + Math.floor(Math.random() * (gMax - gMin + 1));
  if (gold > 0) {
    st.player.gold += gold;
    showGold(enemy.x, enemy.y, gold);
  }

  // XP on kill
  const killXP = enemy.xp;
  if (atkType === 'melee') {
    awardXP('attack',    Math.floor(killXP * 0.3), player);
    awardXP('strength',  Math.floor(killXP * 0.3), player);
    awardXP('hitpoints', Math.floor(killXP * 0.4), player);
  } else if (atkType === 'ranged') {
    awardXP('ranged',    Math.floor(killXP * 0.6), player);
    awardXP('hitpoints', Math.floor(killXP * 0.4), player);
  } else {
    awardXP('magic',     Math.floor(killXP * 0.6), player);
    awardXP('hitpoints', Math.floor(killXP * 0.4), player);
  }

  // Loot roll
  const drops = rollLoot(enemy);
  for (const drop of drops) {
    const added = addToBackpack(drop.id, drop.qty || 1);
    if (added) {
      spawnItemDrop(enemy.x, enemy.y);
      const { showFloatText } = await import('../engine/particles.js');
      const itemName = drop.id.replace(/_/g, ' ');
      showFloatText(enemy.x, enemy.y, itemName, '#4ecca3');
    }
  }

  // Death particles
  spawnDeath(enemy.x, enemy.y, enemy.glyph, enemy.color);
  playDeath();

  clearTarget();
}

let _itemsCache = null;
function _lazyItems() {
  if (!_itemsCache) {
    // Dynamic import fallback
    _itemsCache = { ITEMS: {} };
    import('../config.js').then(m => { _itemsCache.ITEMS = m.ITEMS; });
  }
  return _itemsCache;
}

// Pre-load ITEMS
import('../config.js').then(m => { _itemsCache = { ITEMS: m.ITEMS }; });
