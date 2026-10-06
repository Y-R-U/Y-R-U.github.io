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
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw), base = defaults();
    const settings = { ...base.settings, ...(d.settings || {}) };
    settings.names = { ...base.settings.names, ...(d.settings?.names || {}) };
    return { ...base, ...d, settings };
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
};
