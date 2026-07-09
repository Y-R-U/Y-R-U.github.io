// Persistent profile (localStorage) + the player-changeable settings.
// ?nosave keeps everything in memory for tests.

import { CFG, FLAG } from './config.js';

const DEFAULT = () => ({
  cash: 250,
  ownedCars: ['beater'],
  activeCar: 'beater',
  upgrades: {},                 // carId -> {eng,armor,tire,nitro,paint}
  story: { node: 'S01', done: [], trust: { police: 35, gang: 35 }, exposure: 0, ending: null },
  missions: {},                 // missionId -> { medal: 1|2|3, best: seconds }
  endlessBest: [],              // top scores [{score,time,date}]
  discovered: [],               // hotspot ids seen (minimap reveal)
  settings: {
    side: 'right',              // action buttons side ('right' = joystick left)
    firePos: 'below',           // fire button above/below enter
    btnSize: 'm', zoom: 1, shake: true,
    quality: 'high',            // high | med | low
    sfx: true, music: true,
  },
  stats: { smashed: 0, kills: 0, driven: 0, missionsDone: 0 },
});

let profile = null;

export function loadProfile() {
  if (profile) return profile;
  profile = DEFAULT();
  if (!FLAG.nosave) {
    try {
      const raw = localStorage.getItem(CFG.saveKey);
      if (raw) {
        const d = JSON.parse(raw);
        profile = { ...profile, ...d };
        profile.story = { ...DEFAULT().story, ...(d.story || {}) };
        profile.story.trust = { ...DEFAULT().story.trust, ...(d.story?.trust || {}) };
        profile.settings = { ...DEFAULT().settings, ...(d.settings || {}) };
        profile.stats = { ...DEFAULT().stats, ...(d.stats || {}) };
      }
    } catch (e) { console.warn('save load failed', e); }
  }
  if (FLAG.cash != null) profile.cash += FLAG.cash;
  return profile;
}

let saveT = null;
export function saveProfile() {
  if (FLAG.nosave || !profile) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(CFG.saveKey, JSON.stringify(profile)); } catch { }
  }, 250);
}

export function resetProfile() {
  profile = DEFAULT();
  if (!FLAG.nosave) { try { localStorage.removeItem(CFG.saveKey); } catch { } }
  return profile;
}

export const P = () => profile || loadProfile();

// upgrades accessor (always returns a full record)
export function carUpgrades(carId) {
  const p = P();
  if (!p.upgrades[carId]) p.upgrades[carId] = { eng: 0, armor: 0, tire: 0, nitro: false, paint: 0 };
  return p.upgrades[carId];
}

// ── custom levels store (shared with the editor) ──
export function customLevels() {
  try { return JSON.parse(localStorage.getItem(CFG.levelsKey) || '{}'); } catch { return {}; }
}
export function saveCustomLevel(lv) {
  const all = customLevels();
  all[lv.id] = lv;
  try { localStorage.setItem(CFG.levelsKey, JSON.stringify(all)); return true; }
  catch (e) { console.warn('level save failed', e); return false; }
}
export function deleteCustomLevel(id) {
  const all = customLevels();
  delete all[id];
  try { localStorage.setItem(CFG.levelsKey, JSON.stringify(all)); } catch { }
}
