// The player-facing quality control: which preset a save's settings actually describe, what moving
// one of the two dials does to that, and the one-off auto-detect for a machine that has never
// chosen. Pure — settings in, a settings patch out.

import { Quality } from '../engine/quality.js';

export const PRESET_ORDER = ['potato', 'low', 'medium', 'high', 'ultra'];
export const DEFAULT_PRESET = 'medium';
export const DIALS = ['renderScale', 'shadows'];
export const SHADOW_MODES = ['off', 'hard', 'soft', 'softhigh'];
export const AUTO_MIN_FPS = 40;
export const AUTO_AFTER = 6;

export const PRESET_ROWS = PRESET_ORDER.map(n => [n, Quality.presets[n].label]);
export const SHADOW_ROWS = [['off', 'Off'], ['hard', 'Hard'], ['soft', 'Soft'], ['softhigh', 'Softest']];

const named = (n, fallback) => (PRESET_ORDER.includes(n) ? n
  : PRESET_ORDER.includes(fallback) ? fallback : DEFAULT_PRESET);

export const labelOf = name => Quality.presets[named(name)].label;

// `fallback` is the preset the engine picked for this device, used until the save has one of its
// own — so a desktop that has never chosen keeps the high it boots at.
export function resolve(settings = {}, fallback = DEFAULT_PRESET) {
  const preset = named(settings.preset, fallback);
  const base = Quality.presets[preset];
  const out = { preset, custom: false, label: base.label };
  for (const k of DIALS) {
    out[k] = settings[k] ?? base[k];
    if (out[k] !== base[k]) out.custom = true;
  }
  if (out.custom) out.label = 'Custom';
  return out;
}

export const pickPreset = name => ({ preset: named(name), renderScale: null, shadows: null });

// A dial put back on the preset's own value stops being an override, so the label goes back from
// Custom to the preset rather than lying about it for ever. Either way the preset is written down:
// touching a dial counts as choosing, and the auto-detect leaves a chosen save alone.
export function setDial(settings, key, value, fallback) {
  const { preset } = resolve(settings, fallback);
  return { preset, [key]: value === Quality.presets[preset][key] ? null : value };
}

export function autoChoice(fps, from = DEFAULT_PRESET) {
  if (!(fps > 0)) return null;
  const i = PRESET_ORDER.indexOf(named(from));
  if (fps >= AUTO_MIN_FPS) return { preset: PRESET_ORDER[i], lowered: false };
  return { preset: PRESET_ORDER[Math.max(0, i - 1)], lowered: true };
}
