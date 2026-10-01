// ctx.settings: get/set/on, persisted in localStorage 'synthwild.settings'.
const KEY = 'synthwild.settings';
const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const DEFAULTS = {
  music: 0.6, sfx: 0.8, voice: 0.9, narrator: 'baritone', muteAll: false, musicOn: true, sfxOn: true, voiceOn: true,
  fullscreen: false, renderDistance: touch ? 6 : 8, quality: touch ? 'med' : 'high', fov: 75, showFps: false,
  sensitivity: 1, invertY: false, leftHanded: false, uiScale: 1, view: 'first',
  autoJump: true, aimAssist: true, noFallDamage: false, keepInventory: false, toolsNeverBreak: false,
  peaceful: false, alwaysDay: false, mobGrief: false, buildMobs: false, highContrast: false, subtitles: true, guide: true, treeFelling: true,
  introSeen: false,
};

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

const values = load();
const subs = new Map();
let bus = null;
let saveT = 0;

function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(values)); } catch {} }, 150);
}

export const settings = {
  DEFAULTS,
  init(ctx) { bus = ctx?.bus || bus; },
  get(k) { return k in values ? values[k] : DEFAULTS[k]; },
  set(k, v) {
    if (values[k] === v) return;
    values[k] = v;
    persist();
    for (const fn of subs.get(k) || []) { try { fn(v, k); } catch (e) { console.error(e); } }
    for (const fn of subs.get('*') || []) { try { fn(v, k); } catch (e) { console.error(e); } }
    bus?.emit('settings:change', { key: k, value: v });
  },
  // fn(value, key); returns an unsubscribe. key '*' hears every change.
  on(k, fn) {
    if (!subs.has(k)) subs.set(k, new Set());
    subs.get(k).add(fn);
    return () => subs.get(k).delete(fn);
  },
  all() { return { ...values }; },
  reset() { for (const k of Object.keys(DEFAULTS)) if (k !== 'introSeen') settings.set(k, DEFAULTS[k]); },
  // Effective 0..1 gain for a channel ('music'|'sfx'|'voice'), folding in the mutes.
  gain(ch) {
    if (values.muteAll) return 0;
    if (values[ch + 'On'] === false) return 0;
    return +values[ch] || 0;
  },
};

export default settings;
