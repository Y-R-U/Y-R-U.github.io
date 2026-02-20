// xp.js — XP tracking, level-up triggers
const XPSystem = (() => {
  const MAX_LEVEL = 15;
  // XP required to reach each level (cumulative from level 0)
  const XP_THRESHOLDS = [
    0,    // level 0 -> 1
    50,   // level 1 -> 2
    120,  // level 2 -> 3
    220,  // level 3 -> 4
    350,  // level 4 -> 5
    520,  // level 5 -> 6
    730,  // level 6 -> 7
    990,  // level 7 -> 8
    1300, // level 8 -> 9
    1680, // level 9 -> 10
    2120, // level 10 -> 11
    2640, // level 11 -> 12
    3250, // level 12 -> 13
    3970, // level 13 -> 14
    4800  // level 14 -> 15
  ];

  let currentXP = 0;
  let currentLevel = 1;
  let onLevelUp = null;
  let totalXPGained = 0;

  function init(levelUpCallback) {
    currentXP = 0;
    currentLevel = 1;
    onLevelUp = levelUpCallback;
    totalXPGained = 0;
  }

  function addXP(amount) {
    if (currentLevel >= MAX_LEVEL) return;
    currentXP += amount;
    totalXPGained += amount;
    checkLevelUp();
  }

  function checkLevelUp() {
    while (currentLevel < MAX_LEVEL) {
      const threshold = XP_THRESHOLDS[currentLevel - 1];
      if (currentXP >= threshold) {
        currentLevel++;
        if (onLevelUp) onLevelUp(currentLevel);
        if (currentLevel >= MAX_LEVEL) break;
      } else {
        break;
      }
    }
  }

  function getLevel() { return currentLevel; }
  function getXP() { return currentXP; }
  function getMaxLevel() { return MAX_LEVEL; }

  function getXPForNextLevel() {
    if (currentLevel >= MAX_LEVEL) return XP_THRESHOLDS[MAX_LEVEL - 1];
    return XP_THRESHOLDS[currentLevel - 1];
  }

  function getXPForCurrentLevel() {
    if (currentLevel <= 1) return 0;
    return XP_THRESHOLDS[currentLevel - 2];
  }

  function getXPProgress() {
    const current = getXPForCurrentLevel();
    const next = getXPForNextLevel();
    return (currentXP - current) / (next - current);
  }

  function getThreshold(level) {
    return XP_THRESHOLDS[level - 1] || XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
  }

  function getTotalXP() { return totalXPGained; }

  return {
    init, addXP, getLevel, getXP, getMaxLevel,
    getXPForNextLevel, getXPForCurrentLevel, getXPProgress,
    getThreshold, getTotalXP, XP_THRESHOLDS, MAX_LEVEL
  };
})();
