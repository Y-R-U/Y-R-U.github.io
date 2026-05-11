(function () {
  const STATE_KEY = "blackGlassHouse.state.v1";
  const SETTINGS_KEY = "blackGlassHouse.settings.v1";
  const ENDINGS_KEY = "blackGlassHouse.endings.v1";

  function freshState() {
    return {
      active: false,
      currentRoom: window.BlackGlassStory.start,
      inventory: [],
      flags: {},
      visited: [],
      history: [],
      dread: 0,
      lastEffect: "",
      startedAt: Date.now(),
    };
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn("Save read failed", key, err);
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("Save write failed", key, err);
    }
  }

  window.BlackGlassSave = {
    freshState,
    loadState() {
      const state = loadJson(STATE_KEY, null);
      if (!state || typeof state !== "object") return freshState();
      return Object.assign(freshState(), state, {
        inventory: Array.isArray(state.inventory) ? state.inventory : [],
        flags: state.flags && typeof state.flags === "object" ? state.flags : {},
        visited: Array.isArray(state.visited) ? state.visited : [],
        history: Array.isArray(state.history) ? state.history : [],
      });
    },
    saveState(state) {
      saveJson(STATE_KEY, state);
    },
    clearState() {
      localStorage.removeItem(STATE_KEY);
    },
    hasActiveRun() {
      const state = loadJson(STATE_KEY, null);
      return !!(state && state.active && !state.ended);
    },
    loadSettings() {
      return Object.assign({
        music: true,
        volume: 0.55,
        textSpeed: "normal",
        introSeen: false,
      }, loadJson(SETTINGS_KEY, {}));
    },
    saveSettings(settings) {
      saveJson(SETTINGS_KEY, settings);
    },
    loadEndings() {
      const endings = loadJson(ENDINGS_KEY, []);
      return Array.isArray(endings) ? endings : [];
    },
    recordEnding(id) {
      const endings = new Set(this.loadEndings());
      endings.add(id);
      saveJson(ENDINGS_KEY, Array.from(endings));
    },
  };
})();
