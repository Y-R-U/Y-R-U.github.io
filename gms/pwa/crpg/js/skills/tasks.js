// ===== Skill Tasks (gathering, crafting, etc.) =====
import { SKILL_TASKS, ITEMS } from '../config.js';
import { doSkillAction, isTaskUnlocked, awardXP } from './skillEngine.js';
import { addToBackpack, hasItem, removeFromBackpack, addBuff, getState, setSkillLevel } from '../state.js';
import { showXP, showFloatText } from '../engine/particles.js';
import { playPickup } from '../engine/audio.js';

// ===== Mining =====
export function tryMine(taskId, player) {
  const task = SKILL_TASKS.mining.find(t => t.id === taskId);
  if (!task) return false;
  if (!isTaskUnlocked('mining', task.reqLvl)) {
    showFloatText(player.x, player.y, `Need Mining ${task.reqLvl}`, '#e94560');
    return false;
  }
  const result = doSkillAction('mining', task, player);
  if (result && result.success) {
    addToBackpack(result.product, 1);
    showXP(player.x, player.y, result.xp, 'Mining');
    showFloatText(player.x, player.y, result.product.replace('_',' '), '#c0c0c0');
    playPickup();
    return true;
  }
  return false;
}

// ===== Fishing =====
export function tryFish(taskId, player) {
  const task = SKILL_TASKS.fishing.find(t => t.id === taskId);
  if (!task) return false;
  if (!isTaskUnlocked('fishing', task.reqLvl)) {
    showFloatText(player.x, player.y, `Need Fishing ${task.reqLvl}`, '#e94560');
    return false;
  }
  if (!hasItem('fishing_rod')) {
    showFloatText(player.x, player.y, 'Need Fishing Rod', '#e94560');
    return false;
  }
  const result = doSkillAction('fishing', task, player);
  if (result && result.success) {
    addToBackpack(result.product, 1);
    showXP(player.x, player.y, result.xp, 'Fishing');
    showFloatText(player.x, player.y, result.product, '#4fc3f7');
    playPickup();
    return true;
  }
  return false;
}

// ===== Woodcutting =====
export function tryChop(taskId, player) {
  const task = SKILL_TASKS.woodcutting.find(t => t.id === taskId);
  if (!task) return false;
  if (!isTaskUnlocked('woodcutting', task.reqLvl)) {
    showFloatText(player.x, player.y, `Need WC ${task.reqLvl}`, '#e94560');
    return false;
  }
  const result = doSkillAction('woodcutting', task, player);
  if (result && result.success) {
    addToBackpack(result.product, 1);
    showXP(player.x, player.y, result.xp, 'WC');
    showFloatText(player.x, player.y, result.product.replace('_',' '), '#a5d6a7');
    playPickup();
    return true;
  }
  return false;
}

// ===== Cooking =====
export function tryCook(taskId, player) {
  const task = SKILL_TASKS.cooking.find(t => t.id === taskId);
  if (!task) return false;
  if (!isTaskUnlocked('cooking', task.reqLvl)) {
    showFloatText(player.x, player.y, `Need Cooking ${task.reqLvl}`, '#e94560');
    return false;
  }
  if (!hasItem(task.input)) {
    showFloatText(player.x, player.y, `Need ${task.input}`, '#e94560');
    return false;
  }
  removeFromBackpack(task.input, 1);
  const result = doSkillAction('cooking', task, player);
  if (result && result.success) {
    addToBackpack(result.output || task.output, 1);
    showXP(player.x, player.y, result.xp, 'Cooking');
    playPickup();
    return true;
  }
  return false;
}

// ===== Use consumable item =====
export function useItem(itemId, player) {
  if (!hasItem(itemId)) return false;
  const item = ITEMS[itemId];
  if (!item) return false;

  if (item.type === 'food' || (item.type === 'potion' && item.heal)) {
    const hp = item.heal || 0;
    if (hp > 0) {
      player.heal(hp);
      removeFromBackpack(itemId, 1);
      showFloatText(player.x, player.y, `+${hp} HP`, '#5f5');
      // Food gives cooking XP (eating = you prepared it)
      if (item.type === 'food') awardXP('cooking', hp, player);
      return true;
    }
  }

  // Strength potion — timed +str buff, stackable: extra dose extends timer +4min and +1 str
  if (item.type === 'potion' && item.buffStr) {
    const st  = getState();
    const now = Date.now();
    const existing = st.player.buffs.find(b => b.id === 'str_pot' && b.endsAt > now);
    removeFromBackpack(itemId, 1);
    if (existing) {
      existing.endsAt  += 240000;  // +4 minutes
      existing.amount  += 1;
      const minsLeft = Math.ceil((existing.endsAt - now) / 60000);
      showFloatText(player.x, player.y, `STR +${existing.amount} (${minsLeft}m)`, '#FF8F00');
    } else {
      addBuff('str_pot', 'str', item.buffStr, item.buffDur || 300);
      showFloatText(player.x, player.y, `+${item.buffStr} STR (5min)`, '#FF8F00');
    }
    return true;
  }

  if (item.type === 'potion' && item.buffAtk) {
    addBuff('atk_pot', 'atk', item.buffAtk, item.buffDur || 300);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `+${item.buffAtk} ATK`, '#FF8F00');
    return true;
  }
  if (item.type === 'potion' && item.buffDef) {
    addBuff('def_pot', 'def', item.buffDef, item.buffDur || 300);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `+${item.buffDef} DEF`, '#4ecca3');
    return true;
  }
  if (item.type === 'potion' && item.mana) {
    addBuff('mana_pot', 'mag', item.mana, item.buffDur || 300);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `+${item.mana} MAG`, '#4fc3f7');
    return true;
  }

  // Str Scroll — permanent +1 strength level
  if (item.permStr) {
    const st  = getState();
    const cur = st.player.skills.strength?.level || 1;
    setSkillLevel('strength', cur + item.permStr);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `STR permanently +${item.permStr}!`, '#FF6500');
    return true;
  }

  return false;
}
