// The save document, and the one function that makes an untrusted one safe to run. Pure: no DOM,
// no storage — js/game/savestore.js owns the bytes.

export const SAVE_VERSION = 1;

// `preset` is the graphics preset the player chose. It lives in the save rather than in the
// quality panel's own state because FORGE shipped without a picker and a slow laptop had no way
// back from `high`; a setting the player cannot re-open is not a setting.
export const DEFAULTS = {
  preset: null,           // null = pick from the device at boot
  renderScale: null,      // null = whatever the preset says; a number is a deliberate override
  shadows: null,
  flip: false,
  uiScale: 1,
  motion: 1,
  volume: 0.8,
  mute: false,
  ambience: 0.7,
  haptics: true,
  invertY: false,
};

const num = (v, def) => (Number.isFinite(+v) ? +v : def);
const clamp = (v, lo, hi, def) => Math.min(hi, Math.max(lo, num(v, def)));

export function blank(t = 0) {
  return {
    version: SAVE_VERSION,
    created: t,
    played: 0,
    level: null,
    at: null,
    flags: {},
    items: {},
    quests: {},
    settings: { ...DEFAULTS },
  };
}

export function normalise(raw) {
  if (!raw || typeof raw !== 'object') return { doc: null, error: 'not a save', warnings: [] };
  const v = num(raw.version, 0);
  if (v > SAVE_VERSION) {
    return { doc: null, error: `saved by a newer build (v${v}; this one reads v${SAVE_VERSION})`, warnings: [] };
  }
  const warnings = [];
  const doc = blank(num(raw.created, 0));
  doc.played = Math.max(0, num(raw.played, 0));
  doc.level = typeof raw.level === 'string' ? raw.level : null;
  doc.at = raw.at && typeof raw.at === 'object'
    ? { x: num(raw.at.x, 0), z: num(raw.at.z, 0), yaw: num(raw.at.yaw, 0) }
    : null;

  for (const [k, val] of Object.entries(raw.flags || {})) {
    if (typeof k === 'string') doc.flags[k] = val;
  }
  for (const [k, val] of Object.entries(raw.items || {})) {
    if (Number.isFinite(+val)) doc.items[k] = +val;
  }
  for (const [k, q] of Object.entries(raw.quests || {})) {
    if (q && typeof q.s === 'string') doc.quests[k] = { s: q.s, n: num(q.n, 0) };
  }

  const s = raw.settings || {};
  const S = doc.settings;
  if (typeof s.preset === 'string') S.preset = s.preset;
  if (Number.isFinite(+s.renderScale)) S.renderScale = clamp(s.renderScale, 0.5, 1.5, 1);
  if (typeof s.shadows === 'string') S.shadows = s.shadows;
  S.flip = !!s.flip;
  S.mute = !!s.mute;
  S.haptics = s.haptics !== false;
  S.invertY = !!s.invertY;
  S.uiScale = clamp(s.uiScale, 0.85, 1.4, 1);
  S.motion = clamp(s.motion, 0, 1, 1);
  S.volume = clamp(s.volume, 0, 1, 0.8);
  S.ambience = clamp(s.ambience, 0, 1, 0.7);
  if (v && v < SAVE_VERSION) warnings.push(`upgraded save v${v} → v${SAVE_VERSION}`);
  return { doc, error: null, warnings };
}
