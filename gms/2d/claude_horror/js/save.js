// THE HOLLOW — local persistence.
// One key for the active run, one for settings, one for meta (endings collected, etc).

(function () {
  const KEY_STATE    = 'hollow.v1.state';
  const KEY_SETTINGS = 'hollow.v1.settings';
  const KEY_META     = 'hollow.v1.meta';

  const DEFAULT_STATE = () => ({
    currentRoom: 'bedroom',
    inventory: [],
    memories: [],
    flags: {},
    history: [],          // { kind:'room'|'choice'|'event', text, room?, t }
    startedAt: Date.now(),
    runId: cryptoId(),
  });

  const DEFAULT_SETTINGS = () => ({
    music: false,         // start off — autoplay needs user gesture anyway
    volume: 0.6,
    textSpeed: 'normal',
    introSeen: false,
  });

  const DEFAULT_META = () => ({
    endingsSeen: {},      // { acceptance: 1, watcher: 3, ... }
    runsCompleted: 0,
  });

  function cryptoId() {
    if (window.crypto && crypto.getRandomValues) {
      const a = new Uint32Array(2); crypto.getRandomValues(a);
      return a[0].toString(36) + a[1].toString(36);
    }
    return Math.random().toString(36).slice(2);
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback();
      const parsed = JSON.parse(raw);
      return Object.assign(fallback(), parsed);
    } catch (e) {
      return fallback();
    }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { /* quota / private mode — silent */ }
  }

  window.Save = {
    loadState:    () => load(KEY_STATE,    DEFAULT_STATE),
    saveState:    (s) => save(KEY_STATE,    s),
    clearState:   () => localStorage.removeItem(KEY_STATE),
    hasSavedRun:  () => {
      const s = load(KEY_STATE, DEFAULT_STATE);
      return Array.isArray(s.history) && s.history.length > 0;
    },
    freshState:   DEFAULT_STATE,

    loadSettings: () => load(KEY_SETTINGS, DEFAULT_SETTINGS),
    saveSettings: (s) => save(KEY_SETTINGS, s),

    loadMeta:     () => load(KEY_META, DEFAULT_META),
    saveMeta:     (m) => save(KEY_META, m),
    recordEnding: (id) => {
      const m = load(KEY_META, DEFAULT_META);
      m.endingsSeen[id] = (m.endingsSeen[id] || 0) + 1;
      m.runsCompleted += 1;
      save(KEY_META, m);
    },
  };
})();
