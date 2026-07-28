// save.js — localStorage persistence. One blob, versioned key.

import { SAVE_KEY } from './config.js';

const DEFAULT = () => ({
  v: 1,
  subs: 0,
  perm: {},
  story: { unlocked: 1, stars: {}, seen: {}, done: false },
  best: { score: 0, rank: 1e10, clears: 0 },
  skins: ['default'],
  skin: 'default',
  events: {},
  stats: { runs: 0, mass: 0, props: 0, bestCombo: 0, peakViewers: 0, landmarks: 0 },
  settings: { sfx: true, music: true, quality: 'auto', invert: false },
  seenIntro: false,
  seenHelp: false,
});

let data = null;
let noSave = false;

export function loadSave() {
  noSave = /[?&]nosave\b/.test(location.search);
  if (noSave) { data = DEFAULT(); return data; }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      data = Object.assign(DEFAULT(), p);
      data.story = Object.assign(DEFAULT().story, p.story || {});
      data.best = Object.assign(DEFAULT().best, p.best || {});
      data.stats = Object.assign(DEFAULT().stats, p.stats || {});
      data.settings = Object.assign(DEFAULT().settings, p.settings || {});
      data.perm = p.perm || {};
      data.events = p.events || {};
      data.skins = p.skins && p.skins.length ? p.skins : ['default'];
    } else data = DEFAULT();
  } catch (e) {
    data = DEFAULT();
  }
  return data;
}

export function save() {
  if (noSave || !data) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* quota / private mode */ }
}

export function S() { return data || loadSave(); }

export function addSubs(n) {
  const s = S();
  s.subs = Math.max(0, Math.round(s.subs + n));
  save();
}

export function unlockSkin(id) {
  const s = S();
  if (!s.skins.includes(id)) { s.skins.push(id); save(); return true; }
  return false;
}

export function wipe() {
  data = DEFAULT();
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  return data;
}
