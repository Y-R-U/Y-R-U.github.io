// ===== Skill Tasks (gathering, crafting, etc.) =====
import { SKILL_TASKS, ITEMS } from '../config.js';
import { doSkillAction, isTaskUnlocked } from './skillEngine.js';
import { addToBackpack, hasItem, removeFromBackpack, addBuff } from '../state.js';
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
      return true;
    }
  }
  if (item.type === 'potion' && item.buffAtk) {
    addBuff('str_pot', 'atk', item.buffAtk, item.buffDur || 60);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `+${item.buffAtk} ATK`, '#FF8F00');
    return true;
  }
  if (item.type === 'potion' && item.buffDef) {
    addBuff('def_pot', 'def', item.buffDef, item.buffDur || 60);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `+${item.buffDef} DEF`, '#4ecca3');
    return true;
  }
  if (item.type === 'potion' && item.mana) {
    addBuff('mana_pot', 'mag', item.mana, item.buffDur || 60);
    removeFromBackpack(itemId, 1);
    showFloatText(player.x, player.y, `+${item.mana} MAG`, '#4fc3f7');
    return true;
  }
  return false;
}
