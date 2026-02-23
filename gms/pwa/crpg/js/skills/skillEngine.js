// ===== Skill XP & Level Engine =====
import { SKILLS, SKILL_LEVEL_CAP, xpForLevel } from '../config.js';
import { getState, getSkill, setSkillXP, setSkillLevel, saveGame } from '../state.js';
import { spawnLevelUp } from '../engine/particles.js';
import { playLevelUp } from '../engine/audio.js';

// Level-up callback (set by HUD)
let _onLevelUp = null;
export function setLevelUpCallback(fn) { _onLevelUp = fn; }

/**
 * Award XP to a skill.
 * player is the Player entity (for position, used for particles).
 * Returns true if levelled up.
 */
export function awardXP(skillId, amount, player) {
  if (!SKILLS[skillId] || amount <= 0) return false;
  const st = getState();
  const sk = st.player.skills[skillId];
  if (!sk) return false;
  if (sk.level >= SKILL_LEVEL_CAP) return false;

  sk.xp += amount;

  // Check level up(s)
  let levelled = false;
  while (sk.level < SKILL_LEVEL_CAP) {
    const needed = xpForLevel(sk.level);
    if (sk.xp >= needed) {
      sk.xp -= needed;
      sk.level++;
      levelled = true;
      _handleLevelUp(skillId, sk.level, player);
    } else {
      break;
    }
  }

  return levelled;
}

function _handleLevelUp(skillId, newLevel, player) {
  if (player) spawnLevelUp(player.x, player.y);
  playLevelUp();

  // Flash overlay
  const flash = document.getElementById('levelup-flash');
  if (flash) { flash.style.display = 'block'; setTimeout(() => { flash.style.display = 'none'; }, 1000); }

  // Special on-level-up effects
  if (skillId === 'hitpoints' && newLevel % 10 === 0) {
    const st = getState();
    st.player.maxHp += 10;
    st.player.hp = Math.min(st.player.hp + 10, st.player.maxHp);
  }

  if (_onLevelUp) _onLevelUp(skillId, newLevel);

  // Auto-save on level up
  saveGame();
}

/**
 * Check if a skill task is unlocked.
 */
export function isTaskUnlocked(skillId, reqLevel) {
  const sk = getSkill(skillId);
  return sk.level >= reqLevel;
}

/**
 * Get XP progress for a skill as a fraction (0–1).
 */
export function getSkillProgress(skillId) {
  const sk = getSkill(skillId);
  if (sk.level >= SKILL_LEVEL_CAP) return 1;
  const needed = xpForLevel(sk.level);
  return Math.min(1, sk.xp / needed);
}

/**
 * Get XP needed for next level.
 */
export function getXpToNext(skillId) {
  const sk = getSkill(skillId);
  if (sk.level >= SKILL_LEVEL_CAP) return 0;
  return xpForLevel(sk.level) - sk.xp;
}

/**
 * Perform a skill action (gathering, etc.)
 * Returns { success, xp, product } or null if not unlocked.
 */
export function doSkillAction(skillId, taskDef, player) {
  if (!isTaskUnlocked(skillId, taskDef.reqLvl)) return null;
  const levelled = awardXP(skillId, taskDef.xp, player);
  return {
    success: true,
    xp: taskDef.xp,
    levelled,
    product: taskDef.product || null,
  };
}
