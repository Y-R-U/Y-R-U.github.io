// Player settings. Lives inside save.data.settings so ENGINE's save file is the only store.

import { haptics } from '../core/haptics.js';

export const DEFAULTS = Object.freeze({
  music: true,
  sfx: true,
  haptics: true,
  reduceFx: false,
  fullscreen: true,   // ask for fullscreen on start and on resume; some people hate it
  hand: 'right',      // 'right' | 'left' — mirrors the in-flight thumb buttons
  currency: 'gbp',    // symbol only, no conversion — see units.js
  speedUnit: 'mph',   // mph | kmh | kn
  altUnit: 'ft',      // ft | m
  musicOff: {},       // { [trackId]: true } — the tracks the player has switched off
  fps: false,         // corner frame-rate readout — off by default, on for measuring a real device
});

let bound = null;     // { save, audio }
const subs = new Set();

const clone = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : v);

export const prefs = {};
for (const k of Object.keys(DEFAULTS)) prefs[k] = clone(DEFAULTS[k]);

export function bindPrefs(save, audio) {
  bound = { save, audio };
  const src = (save && save.data && save.data.settings) || {};
  for (const k of Object.keys(DEFAULTS)) {
    prefs[k] = src[k] !== undefined ? clone(src[k]) : clone(DEFAULTS[k]);
  }
  apply();
  return prefs;
}

/** Fires on every setting change, so a live screen can repaint without a remount. */
export function onPrefsChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function setPref(key, value) {
  if (!(key in DEFAULTS)) return;
  prefs[key] = clone(value);
  persist();
  apply();
  for (const fn of subs) { try { fn(key, prefs[key]); } catch (e) { console.warn('[prefs] subscriber', e); } }
}

export function togglePref(key) {
  setPref(key, !prefs[key]);
  return prefs[key];
}

/* ------------------------------------------------------- disabled music ids */

export function isTrackOn(id) { return !prefs.musicOff[id]; }

export function setTrackOn(id, on) {
  const next = { ...prefs.musicOff };
  if (on) delete next[id]; else next[id] = true;
  setPref('musicOff', next);
}

export function setTracksOn(ids, on) {
  const next = { ...prefs.musicOff };
  for (const id of ids) { if (on) delete next[id]; else next[id] = true; }
  setPref('musicOff', next);
}

function persist() {
  if (bound && bound.save && bound.save.data) {
    bound.save.data.settings = { ...prefs, musicOff: { ...prefs.musicOff } };
    if (typeof bound.save.flush === 'function') bound.save.flush();
  }
}

function apply() {
  // haptics.buzz() from the frame loop reads the module's own flag, not this one. Nothing ever
  // set it, so the Haptics switch silently governed only the UI's own taps while every hit in
  // the air kept buzzing regardless of the setting.
  try { haptics.setEnabled(!!prefs.haptics); } catch { /* no navigator.vibrate here */ }
  const a = bound && bound.audio;
  if (a) {
    if (typeof a.setMusic === 'function') a.setMusic(prefs.music);
    if (typeof a.setSfx === 'function') a.setSfx(prefs.sfx);
    if (typeof a.setDisabledTracks === 'function') a.setDisabledTracks(prefs.musicOff);
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.hand = prefs.hand;
    document.documentElement.dataset.reduceFx = prefs.reduceFx ? '1' : '0';
  }
}

/** Haptics gate for anything that buzzes. */
export function buzz(ms = 12) {
  if (!prefs.haptics) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* some browsers throw on gesture-less vibrate */ }
  }
}
