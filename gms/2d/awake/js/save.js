(function () {
  const STATE_KEY = "awake.state.v1";
  const SETTINGS_KEY = "awake.settings.v1";
  const ARCHIVE_KEY = "awake.archive.v1";

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn("Save read failed", key, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("Save write failed", key, err);
    }
  }

  window.CodexHorrorSave = {
    loadState() {
      const state = read(STATE_KEY, null);
      if (!state || typeof state !== "object") return null;
      return Object.assign({}, state, {
        flags: state.flags && typeof state.flags === "object" ? state.flags : {},
        inventory: Array.isArray(state.inventory) ? state.inventory : [],
        history: Array.isArray(state.history) ? state.history : [],
      });
    },
    saveState(state) {
      write(STATE_KEY, state);
    },
    clearState() {
      localStorage.removeItem(STATE_KEY);
    },
    hasActiveRun() {
      const state = read(STATE_KEY, null);
      return !!(state && state.active && !state.ended);
    },
    loadSettings() {
      return Object.assign({
        music: true,
        sound: true,
        volume: 0.55,
      }, read(SETTINGS_KEY, {}));
    },
    saveSettings(settings) {
      write(SETTINGS_KEY, settings);
    },
    loadArchive() {
      const archive = read(ARCHIVE_KEY, []);
      return Array.isArray(archive) ? archive : [];
    },
    recordArchive(entry) {
      const archive = this.loadArchive();
      archive.unshift(Object.assign({ at: Date.now() }, entry));
      write(ARCHIVE_KEY, archive.slice(0, 20));
    },
  };
})();
