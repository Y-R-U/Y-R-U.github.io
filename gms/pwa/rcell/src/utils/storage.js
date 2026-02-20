// storage.js — localStorage save/load with versioning
const Storage = (() => {
  const SAVE_KEY = 'rcell_v1';
  const DEFAULT_STATE = {
    version: 1,
    dnaPoints: 0,
    metaUnlocked: [],
    bestWave: 0,
    totalRuns: 0,
    hasWon: false,
    totalKills: 0
  };

  function save(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Save failed:', e);
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== DEFAULT_STATE.version) {
        return migrate(data);
      }
      return Object.assign({}, DEFAULT_STATE, data);
    } catch (e) {
      console.warn('Load failed:', e);
      return null;
    }
  }

  function migrate(data) {
    // Future migrations go here
    return Object.assign({}, DEFAULT_STATE, data, { version: DEFAULT_STATE.version });
  }

  function loadOrDefault() {
    return load() || Object.assign({}, DEFAULT_STATE);
  }

  function clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function getDefault() {
    return Object.assign({}, DEFAULT_STATE);
  }

  return { save, load, loadOrDefault, clear, getDefault, SAVE_KEY };
})();
