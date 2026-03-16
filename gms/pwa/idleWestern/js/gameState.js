/**
 * gameState.js - Game state management, save/load, core calculations
 */

const GameState = (() => {
  const SAVE_KEY = 'idleWestern_save';
  const COMPLETIONS_KEY = 'idleWestern_completions';
  const SAVE_INTERVAL = 30000; // 30s auto-save
  const OFFLINE_CAP_HOURS = 8;
  const OFFLINE_RATE = 0.5; // 50% of active rate

  let state = null;

  function createFreshState() {
    return {
      coins: 0,
      totalEarned: 0,
      totalTaps: 0,
      tapValue: 1,
      tapUpgradesBought: [],

      businesses: {},
      // Each business: { owned: 0 }

      // Prestige
      pioneerStars: 0,
      totalPrestiges: 0,
      lifetimeEarned: 0, // never resets

      // Active buffs: [{ id, effect, mult, endsAt }]
      buffs: [],

      // Achievements unlocked: ['id1', 'id2', ...]
      achievements: [],

      // Stats
      eventsClicked: 0,

      // Timestamps
      lastSave: Date.now(),
      lastTick: Date.now(),
      gameStarted: Date.now(),

      // Story
      storyShown: false,

      // Difficulty: 'easy' | 'medium' | 'hard' | null (not yet chosen)
      difficulty: null,

      // Buy mode
      buyMode: 1, // 1, 10, or -1 for max

      // Version for migration
      version: 1
    };
  }

  function init() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      try {
        state = JSON.parse(saved);
        // Ensure all fields exist (migration safety)
        const fresh = createFreshState();
        for (const key in fresh) {
          if (!(key in state)) state[key] = fresh[key];
        }
        // Migration: existing players with progress but no difficulty → hard
        if (state.difficulty === undefined || state.difficulty === null) {
          if (state.totalEarned > 0 || state.storyShown) {
            state.difficulty = 'hard';
          }
        }
      } catch (e) {
        console.warn('Save corrupted, starting fresh');
        state = createFreshState();
      }
    } else {
      state = createFreshState();
    }

    // Initialize any missing business entries
    for (const biz of GameData.BUSINESSES) {
      if (!state.businesses[biz.id]) {
        state.businesses[biz.id] = { owned: 0 };
      }
    }

    // Start auto-save
    setInterval(save, SAVE_INTERVAL);

    // Save on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) save();
    });

    return state;
  }

  function save() {
    state.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function getState() {
    return state;
  }

  function resetForPrestige() {
    const stars = calcPrestigeStars();
    if (stars <= 0) return false;

    state.pioneerStars += stars;
    state.totalPrestiges++;

    // Reset game progress
    state.coins = 0;
    state.totalEarned = 0;
    state.totalTaps = 0;
    state.tapValue = 1;
    state.tapUpgradesBought = [];
    state.businesses = {};
    state.buffs = [];

    for (const biz of GameData.BUSINESSES) {
      state.businesses[biz.id] = { owned: 0 };
    }

    save();
    return true;
  }

  function hardReset() {
    state = createFreshState();
    for (const biz of GameData.BUSINESSES) {
      state.businesses[biz.id] = { owned: 0 };
    }
    // difficulty reset to null so player picks again
    // completions NOT cleared (separate localStorage key)
    save();
  }

  // --- Calculations ---

  function getPrestigeMultiplier() {
    return 1 + (state.pioneerStars * 0.05);
  }

  function calcPrestigeStars() {
    return Math.floor(Math.sqrt(state.totalEarned / 1000000));
  }

  function getBuffMultiplier(effectType) {
    const now = Date.now();
    let mult = 1;
    for (const buff of state.buffs) {
      if (buff.effect === effectType && buff.endsAt > now) {
        mult *= buff.mult;
      }
    }
    return mult;
  }

  // --- Difficulty ---

  function getDifficultyConfig() {
    const key = state.difficulty || 'hard';
    return GameData.DIFFICULTY_CONFIG[key] || GameData.DIFFICULTY_CONFIG.hard;
  }

  function getDifficultyMult() {
    const config = getDifficultyConfig();
    const tiers = config.tiers;
    if (!tiers || tiers.length === 0) return 1;

    // Current game totals
    let totalBiz = 0;
    const oilLevel = state.businesses.oil?.owned || 0;
    for (const biz of GameData.BUSINESSES) {
      totalBiz += state.businesses[biz.id]?.owned || 0;
    }

    // Last matching tier wins (tiers ordered ascending)
    let mult = 1;
    for (const tier of tiers) {
      if (totalBiz >= tier.totalBiz && oilLevel >= tier.oilLevel) {
        mult = tier.mult;
      }
    }
    return mult;
  }

  // --- Completion tracking (separate localStorage, survives hard reset) ---

  function getCompletions() {
    try {
      const raw = localStorage.getItem(COMPLETIONS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { easy: false, medium: false, hard: false };
  }

  function saveCompletion(difficulty) {
    const completions = getCompletions();
    completions[difficulty] = true;
    localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
  }

  function isDifficultyUnlocked(diffKey) {
    const config = GameData.DIFFICULTY_CONFIG[diffKey];
    if (!config) return false;
    if (!config.unlockRequires) return true;
    return getCompletions()[config.unlockRequires] === true;
  }

  function cleanExpiredBuffs() {
    const now = Date.now();
    state.buffs = state.buffs.filter(b => b.endsAt > now);
  }

  function addBuff(id, effect, mult, durationSec) {
    state.buffs.push({
      id,
      effect,
      mult,
      endsAt: Date.now() + durationSec * 1000
    });
  }

  function getTapValue() {
    const base = state.tapValue;
    const prestigeMult = getPrestigeMultiplier();
    const buffMult = getBuffMultiplier('tap_mult');
    const diffMult = getDifficultyMult();
    return base * prestigeMult * buffMult * diffMult;
  }

  function getBusinessIncome(bizDef) {
    const owned = state.businesses[bizDef.id]?.owned || 0;
    if (owned === 0) return 0;
    const milestoneMult = GameData.getMilestoneMultiplier(owned);
    return bizDef.baseIncome * owned * milestoneMult;
  }

  function getTotalIncomePerSec() {
    let total = 0;
    for (const biz of GameData.BUSINESSES) {
      total += getBusinessIncome(biz);
    }
    const prestigeMult = getPrestigeMultiplier();
    const buffMult = getBuffMultiplier('income_mult');
    const diffMult = getDifficultyMult();
    return total * prestigeMult * buffMult * diffMult;
  }

  function getBaseIncomePerSec() {
    // Without buffs, for offline calc
    let total = 0;
    for (const biz of GameData.BUSINESSES) {
      total += getBusinessIncome(biz);
    }
    return total * getPrestigeMultiplier() * getDifficultyMult();
  }

  /**
   * Get the offline earnings business multiplier.
   * Formula: numBusinessTypesOwned + sum of floor(highestBizLevel / 100) bonuses
   * e.g. highest biz at level 300: mult = numBiz + (1 + 2 + 3) = numBiz + 6
   * At level 100: numBiz + 1, at 200: numBiz + 3, at 300: numBiz + 6
   */
  function getOfflineBusinessMultiplier() {
    let typesOwned = 0;
    let highestLevel = 0;
    for (const biz of GameData.BUSINESSES) {
      const owned = state.businesses[biz.id]?.owned || 0;
      if (owned > 0) typesOwned++;
      if (owned > highestLevel) highestLevel = owned;
    }
    if (typesOwned === 0) return 1;

    // Cumulative bonus from highest business: for each 100 mark, add that mark/100
    // lvl 300 -> 1 + 2 + 3 = 6
    let levelBonus = 0;
    const hundreds = Math.floor(highestLevel / 100);
    for (let i = 1; i <= hundreds; i++) {
      levelBonus += i;
    }

    return typesOwned + levelBonus;
  }

  function calcOfflineEarnings() {
    const now = Date.now();
    const elapsed = Math.min(
      (now - state.lastTick) / 1000,
      OFFLINE_CAP_HOURS * 3600
    );

    if (elapsed < 5) return 0; // Less than 5 seconds, not worth showing

    const income = getBaseIncomePerSec() * OFFLINE_RATE;
    const bizMult = getOfflineBusinessMultiplier();
    return income * elapsed * bizMult;
  }

  function doTick(deltaMs) {
    const deltaSec = deltaMs / 1000;
    const income = getTotalIncomePerSec();
    const earned = income * deltaSec;

    state.coins += earned;
    state.totalEarned += earned;
    state.lifetimeEarned += earned;
    state.lastTick = Date.now();

    cleanExpiredBuffs();
  }

  function tap() {
    const value = getTapValue();
    state.coins += value;
    state.totalEarned += value;
    state.lifetimeEarned += value;
    state.totalTaps++;
    return value;
  }

  function buyBusiness(bizId, count) {
    const biz = GameData.BUSINESSES.find(b => b.id === bizId);
    if (!biz) return false;

    const owned = state.businesses[bizId].owned;
    const cost = count === 1
      ? GameData.getBusinessCost(biz, owned)
      : GameData.getBusinessCostN(biz, owned, count);

    if (state.coins < cost) return false;

    state.coins -= cost;
    state.businesses[bizId].owned += count;
    return true;
  }

  function getMaxBuyable(bizId) {
    const biz = GameData.BUSINESSES.find(b => b.id === bizId);
    if (!biz) return 0;

    let owned = state.businesses[bizId].owned;
    let budget = state.coins;
    let count = 0;

    while (true) {
      const cost = GameData.getBusinessCost(biz, owned + count);
      if (budget < cost) break;
      budget -= cost;
      count++;
      if (count > 10000) break; // safety
    }
    return count;
  }

  function buyTapUpgrade(upgradeId) {
    if (state.tapUpgradesBought.includes(upgradeId)) return false;
    const upgrade = GameData.TAP_UPGRADES.find(u => u.id === upgradeId);
    if (!upgrade || state.coins < upgrade.cost) return false;

    state.coins -= upgrade.cost;
    state.tapValue *= upgrade.mult;
    state.tapUpgradesBought.push(upgradeId);
    return true;
  }

  function isBusinessUnlocked(bizDef) {
    return state.totalEarned >= bizDef.unlockCost || state.businesses[bizDef.id]?.owned > 0;
  }

  function isBusinessVisible(bizDef) {
    // Show if unlocked, or if the previous business is owned
    if (isBusinessUnlocked(bizDef)) return true;
    const idx = GameData.BUSINESSES.indexOf(bizDef);
    if (idx <= 0) return true;
    const prevBiz = GameData.BUSINESSES[idx - 1];
    return (state.businesses[prevBiz.id]?.owned || 0) > 0;
  }

  function unlockAchievement(id) {
    if (!state.achievements.includes(id)) {
      state.achievements.push(id);
      return true;
    }
    return false;
  }

  function checkAchievements() {
    const unlocked = [];

    if (state.totalTaps >= 1 && unlockAchievement('first_tap'))
      unlocked.push('first_tap');

    let totalOwned = 0;
    let typesOwned = 0;
    for (const biz of GameData.BUSINESSES) {
      const o = state.businesses[biz.id]?.owned || 0;
      totalOwned += o;
      if (o > 0) typesOwned++;
    }
    if (totalOwned >= 1 && unlockAchievement('first_hire'))
      unlocked.push('first_hire');

    if (state.totalEarned >= 1000 && unlockAchievement('earn_1k'))
      unlocked.push('earn_1k');
    if (state.totalEarned >= 1000000 && unlockAchievement('earn_1m'))
      unlocked.push('earn_1m');
    if (state.totalEarned >= 1000000000 && unlockAchievement('earn_1b'))
      unlocked.push('earn_1b');

    if ((state.businesses.saloon?.owned || 0) > 0 && unlockAchievement('own_saloon'))
      unlocked.push('own_saloon');
    if ((state.businesses.railroad?.owned || 0) > 0 && unlockAchievement('own_railroad'))
      unlocked.push('own_railroad');
    if ((state.businesses.oil?.owned || 0) > 0 && unlockAchievement('own_oil'))
      unlocked.push('own_oil');

    if (state.totalPrestiges >= 1 && unlockAchievement('prestige_1'))
      unlocked.push('prestige_1');
    if (state.totalPrestiges >= 5 && unlockAchievement('prestige_5'))
      unlocked.push('prestige_5');

    if (state.totalTaps >= 1000 && unlockAchievement('tap_1000'))
      unlocked.push('tap_1000');
    if (state.totalTaps >= 10000 && unlockAchievement('tap_10000'))
      unlocked.push('tap_10000');

    if (state.eventsClicked >= 10 && unlockAchievement('event_10'))
      unlocked.push('event_10');

    if (typesOwned >= 10 && unlockAchievement('all_biz')) {
      unlocked.push('all_biz');
      // Mark current difficulty as completed
      if (state.difficulty) {
        saveCompletion(state.difficulty);
      }
    }

    return unlocked;
  }

  return {
    init, save, getState, hardReset,
    resetForPrestige, calcPrestigeStars, getPrestigeMultiplier,
    getBuffMultiplier, addBuff, cleanExpiredBuffs,
    getDifficultyConfig, getDifficultyMult,
    getCompletions, saveCompletion, isDifficultyUnlocked,
    getTapValue, getBusinessIncome, getTotalIncomePerSec, getBaseIncomePerSec,
    getOfflineBusinessMultiplier,
    calcOfflineEarnings, doTick, tap,
    buyBusiness, getMaxBuyable, buyTapUpgrade,
    isBusinessUnlocked, isBusinessVisible,
    checkAchievements
  };
})();
