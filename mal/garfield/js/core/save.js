const KEY = 'garfield_hh_v1';

// Same shape as ui.settings (js/ui/ui.js DEFAULT_SETTINGS).
export const DEFAULT_SETTINGS = {
  musicOn: true, music: 0.35, sfx: 0.8, voice: 0.9, subtitles: true,
  quality: 'auto', camSens: 1, invertY: false, names: { garfield: 'Garfield', jon: 'Jon' },
};

function defaults() {
  return {
    introSeen: false, levelsUnlocked: 1, levelsDone: [], belly: 0.3,
    settings: structuredClone(DEFAULT_SETTINGS),
    chapterUnlockSeen: false, levelUnlockSeen: 0,
    // wave 3 (D14): additive, so an old save just reads these defaults
    ch1FreeSeen: false, ch2MenuSeen: false, ch2IntroSeen: false, ch2FreeSeen: false,
    ch2: { levelsUnlocked: 1, levelsDone: [], levelUnlockSeen: 0 },
    arenaUnlocked: false, arenaSeen: false, arenaBest: {},
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw), base = defaults();
    const settings = { ...base.settings, ...(d.settings || {}) };
    settings.names = { ...base.settings.names, ...(d.settings?.names || {}) };
    const ch2 = { ...base.ch2, ...(d.ch2 || {}) };
    if (!Array.isArray(ch2.levelsDone)) ch2.levelsDone = [];
    return { ...base, ...d, settings, ch2, arenaBest: { ...(d.arenaBest || {}) } };
  } catch { return defaults(); }
}

export const save = {
  data: read(),
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch {} },
  set(patch) { Object.assign(this.data, patch); this.write(); },
  reset() { const keep = this.data.settings; this.data = defaults(); this.data.settings = keep; this.write(); },
  markDone(n) {
    const d = this.data;
    if (!d.levelsDone.includes(n)) d.levelsDone.push(n);
    d.levelsUnlocked = Math.min(10, Math.max(d.levelsUnlocked, n + 1));
    this.write();
  },
  markDone2(n) {
    const c = this.data.ch2;
    if (!c.levelsDone.includes(n)) c.levelsDone.push(n);
    c.levelsUnlocked = Math.min(10, Math.max(c.levelsUnlocked, n + 1));
    if (n === 7) this.data.arenaUnlocked = true;
    this.write();
  },
  get ch1Complete() { return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((n) => this.data.levelsDone.includes(n)); },
  get ch2Complete() { return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((n) => this.data.ch2.levelsDone.includes(n)); },
};
