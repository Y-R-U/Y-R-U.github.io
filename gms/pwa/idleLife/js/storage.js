// ============================================================
// LIFE IDLE - Storage Module  v2.0
// Save / load game state via localStorage
// ============================================================

const SAVE_KEY = 'lifeIdle_v2';
const AUTOSAVE_INTERVAL = 30000; // 30 seconds

const Storage = (() => {
  function save(state) {
    try {
      const payload = {
        coins:         state.coins,
        totalEarned:   state.totalEarned,
        jobs:          state.jobs,
        businesses:    state.businesses,
        upgrades:      [...(state.upgrades instanceof Set ? state.upgrades : new Set(state.upgrades || []))],
        // Prestige & meta (persist across prestige resets)
        prestigeLevel:  state.prestigeLevel  || 0,
        prestigePoints: state.prestigePoints || 0,
        lifetimeCoins:  state.lifetimeCoins  || 0,
        totalTaps:      state.totalTaps      || 0,
        achievements:   [...(state.achievements instanceof Set ? state.achievements : new Set(state.achievements || []))],
        lastSave: Date.now()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Save failed:', e);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Restore Sets
      data.upgrades     = new Set(data.upgrades     || []);
      data.achievements = new Set(data.achievements || []);
      return data;
    } catch (e) {
      console.warn('Load failed:', e);
      return null;
    }
  }

  function clear() {
    localStorage.removeItem(SAVE_KEY);
  }

  // Calculate offline earnings based on income/sec and elapsed time
  function calcOfflineEarnings(incomePerSec, lastSave) {
    if (!lastSave) return 0;
    const elapsed = Math.min((Date.now() - lastSave) / 1000, 8 * 3600); // cap 8h
    return incomePerSec * elapsed;
  }

  let autosaveTimer = null;
  function startAutosave(getStateFn) {
    if (autosaveTimer) clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => save(getStateFn()), AUTOSAVE_INTERVAL);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save(getStateFn());
    });
    window.addEventListener('beforeunload', () => save(getStateFn()));
  }

  return { save, load, clear, calcOfflineEarnings, startAutosave };
})();
