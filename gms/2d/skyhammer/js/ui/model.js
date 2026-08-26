import * as U from './units.js';

// Every read and write the UI makes against `save`. Tolerates save.data or a flat save object,
// so it keeps working whichever shape core/save.js settles on (CONTRACTS §11).

const CURVE_DEFAULT = 1.34;

export function d(save) {
  if (!save) return {};
  if (save.data && typeof save.data === 'object') return save.data;
  return save;
}

function flush(save) {
  if (save && typeof save.flush === 'function') save.flush();
}

/* ------------------------------------------------------------------- money */

export function getMoney(save) {
  const v = d(save).money;
  return typeof v === 'number' ? v : 0;
}

export function setMoney(save, v) {
  d(save).money = Math.max(0, Math.round(v));
  flush(save);
}

export function spend(save, cost) {
  if (getMoney(save) < cost) return false;
  setMoney(save, getMoney(save) - cost);
  return true;
}

/* ------------------------------------------------------------------ planes */

export function ownedPlanes(save, PLANES) {
  const s = d(save);
  if (!Array.isArray(s.planes)) s.planes = PLANES && PLANES.length ? [PLANES[0].id] : [];
  return s.planes;
}

export function ownsPlane(save, PLANES, id) {
  return ownedPlanes(save, PLANES).includes(id);
}

export function currentPlaneId(save, PLANES) {
  const s = d(save);
  if (!s.planeId || !(PLANES || []).some((p) => p.id === s.planeId)) {
    s.planeId = PLANES && PLANES.length ? PLANES[0].id : null;
  }
  return s.planeId;
}

export function currentPlane(save, PLANES) {
  const id = currentPlaneId(save, PLANES);
  return (PLANES || []).find((p) => p.id === id) || (PLANES || [])[0] || null;
}

export function buyPlane(save, PLANES, id) {
  const p = (PLANES || []).find((x) => x.id === id);
  if (!p) return false;
  if (ownsPlane(save, PLANES, id)) return true;
  if (!spend(save, p.price)) return false;
  ownedPlanes(save, PLANES).push(id);
  flush(save);
  return true;
}

export function selectPlane(save, PLANES, id) {
  if (!ownsPlane(save, PLANES, id)) return false;
  d(save).planeId = id;
  flush(save);
  return true;
}

/* ---------------------------------------------------------------- upgrades */
// Upgrades are per-plane (Aircraft Evolution does the same). A flat legacy
// { armor: 3 } object is read as "applies to whatever plane you are on".

// Upgrades are GLOBAL, not per-plane (D31). `sim/plane.js` reads a flat map, so per-plane
// storage silently fed it zeros. planeId is kept in the signature for call-site readability.
export function upgradeLevel(save, planeId, upgId) {
  const u = d(save).upgrades;
  if (!u) return 0;
  if (typeof u[upgId] === 'number') return u[upgId];
  let best = 0;                                  // migrate a legacy per-plane save
  for (const k of Object.keys(u)) {
    const v = u[k];
    if (v && typeof v === 'object' && typeof v[upgId] === 'number') best = Math.max(best, v[upgId]);
  }
  return best;
}

export function setUpgradeLevel(save, planeId, upgId, lvl) {
  const s = d(save);
  if (!s.upgrades || typeof s.upgrades !== 'object') s.upgrades = {};
  s.upgrades[upgId] = lvl;
  flush(save);
}

export function upgradePrice(upg, level, ECON) {
  const curve = (ECON && ECON.upgradeCurve) || CURVE_DEFAULT;
  return Math.round(upg.base * Math.pow(curve, level));
}

/**
 * The displayed value of one upgrade row for one plane.
 * UPGRADES[].step(level) is the cumulative bonus at that level.
 */
export function upgradeStat(upg, plane, level, WEAPONS) {
  const bonus = typeof upg.step === 'function' ? upg.step(level) : level;
  const gun = plane && WEAPONS ? WEAPONS[plane.mainGun] : null;
  switch (upg.id) {
    case 'armor': return { value: (plane ? plane.hp : 0) + bonus, unit: 'hp', dp: 0 };
    case 'speed': return { value: U.speedVal((plane ? plane.cruise : 0) + bonus), unit: U.speedLabel(), dp: 0 };
    case 'turn': return { value: (plane ? plane.turnRate : 0) + bonus, unit: 'rad/s', dp: 2 };
    case 'gun': return { value: (gun ? gun.dmg : 0) + bonus, unit: 'dmg', dp: 1 };
    case 'ammo': return { value: bonus, unit: '+rds', dp: 0, prefix: '+' };
    default: return { value: bonus, unit: '', dp: 1 };
  }
}

export function buyUpgrade(save, plane, upg, ECON) {
  const lvl = upgradeLevel(save, plane.id, upg.id);
  if (lvl >= upg.max) return 'max';
  const price = upgradePrice(upg, lvl, ECON);
  if (!spend(save, price)) return 'poor';
  setUpgradeLevel(save, plane.id, upg.id, lvl + 1);
  return 'ok';
}

/* ----------------------------------------------------------------- weapons */

export function specialWeapons(WEAPONS) {
  return Object.values(WEAPONS || {})
    .filter((w) => w.slotType === 'special')
    .sort((a, b) => (a.tier || 0) - (b.tier || 0) || (a.price || 0) - (b.price || 0));
}

export function ownedWeapons(save, WEAPONS) {
  const s = d(save);
  if (!Array.isArray(s.weapons)) {
    s.weapons = specialWeapons(WEAPONS).filter((w) => !w.price).map((w) => w.id);
  }
  return s.weapons;
}

export function ownsWeapon(save, WEAPONS, id) {
  return ownedWeapons(save, WEAPONS).includes(id);
}

export function buyWeapon(save, WEAPONS, id) {
  const w = (WEAPONS || {})[id];
  if (!w) return false;
  if (ownsWeapon(save, WEAPONS, id)) return true;
  if (!spend(save, w.price || 0)) return false;
  ownedWeapons(save, WEAPONS).push(id);
  flush(save);
  return true;
}

/* ----------------------------------------------------------------- loadout */

export function slotCount(plane) {
  return Math.max(1, Math.min(4, (plane && plane.slots) || 4));
}

export function loadout(save) {
  const s = d(save);
  if (!Array.isArray(s.loadout) || s.loadout.length !== 4) {
    s.loadout = [s.loadout && s.loadout[0], null, null, null].slice(0, 4);
    while (s.loadout.length < 4) s.loadout.push(null);
  }
  return s.loadout;
}

export function setSlot(save, i, weaponId) {
  const l = loadout(save);
  if (i < 0 || i > 3) return;
  if (weaponId) {
    const dup = l.indexOf(weaponId);
    if (dup >= 0 && dup !== i) l[dup] = null;   // a weapon can only sit in one slot
  }
  l[i] = weaponId || null;
  flush(save);
}

/** Trim anything sitting past the current plane's slot count. */
export function normaliseLoadout(save, plane) {
  const l = loadout(save);
  const n = slotCount(plane);
  let changed = false;
  for (let i = n; i < 4; i++) if (l[i]) { l[i] = null; changed = true; }
  if (changed) flush(save);
  return l;
}

/* ---------------------------------------------------------------- progress */

export function levelRecord(save, levelId) {
  const s = d(save);
  if (!s.levels || typeof s.levels !== 'object') s.levels = {};
  return s.levels[levelId] || null;
}

export function levelStars(save, levelId) {
  const r = levelRecord(save, levelId);
  return r ? (r.stars || 0) : 0;
}

export function levelDone(save, levelId) {
  return levelStars(save, levelId) > 0 || !!(levelRecord(save, levelId) || {}).done;
}

export function recordLevel(save, levelId, res) {
  const s = d(save);
  if (!s.levels || typeof s.levels !== 'object') s.levels = {};
  const prev = s.levels[levelId] || {};
  s.levels[levelId] = {
    done: true,
    stars: Math.max(prev.stars || 0, res.stars || 0),
    best: prev.best != null ? Math.min(prev.best, res.time || Infinity) : res.time,
  };
  flush(save);
}

/** A level is unlocked if it is the first, or the one before it is done. */
export function levelUnlocked(save, LEVELS, index) {
  if (index <= 0) return true;
  if ((d(save).unlockAll)) return true;
  return levelDone(save, LEVELS[index - 1].id);
}

export function nextLevel(save, LEVELS) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (!levelDone(save, LEVELS[i].id) && levelUnlocked(save, LEVELS, i)) return LEVELS[i];
  }
  return LEVELS[LEVELS.length - 1] || null;
}

export function starsFor(time, par, ECON) {
  const t = (ECON && ECON.starTimes) || [0.7, 1.0];
  if (!par) return 3;
  if (time <= par * t[0]) return 3;
  if (time <= par * t[1]) return 2;
  return 1;
}

export function totalStars(save, LEVELS) {
  return LEVELS.reduce((n, l) => n + levelStars(save, l.id), 0);
}

/** Group levels by act, in order, for the campaign map. */
export function acts(LEVELS, ACTS) {
  const map = new Map();
  LEVELS.forEach((l, i) => {
    const a = l.act || 1;
    if (!map.has(a)) map.set(a, { act: a, name: (ACTS && ACTS[a] && ACTS[a].name) || actName(a), levels: [] });
    map.get(a).levels.push({ level: l, index: i });
  });
  return [...map.values()].sort((x, y) => x.act - y.act);
}

const ACT_NAMES = ['', 'Dawn Patrol', 'The Long Front', 'Iron Skies', 'Jet Age', 'Last Light'];
function actName(n) { return ACT_NAMES[n] || 'Act ' + n; }

/** What the player could buy next with the money they have — the results-screen nudge. */
export function affordableNudge(save, PLANES, WEAPONS, UPGRADES, ECON) {
  const m = getMoney(save);
  const plane = currentPlane(save, PLANES);

  const lockedPlane = (PLANES || []).filter((p) => !ownsPlane(save, PLANES, p.id)).sort((a, b) => a.price - b.price)[0];
  if (lockedPlane && lockedPlane.price <= m) {
    return { kind: 'plane', label: `New airframe: ${lockedPlane.name}`, price: lockedPlane.price, icon: 'gun' };
  }
  const lockedWpn = specialWeapons(WEAPONS).filter((w) => !ownsWeapon(save, WEAPONS, w.id)).sort((a, b) => a.price - b.price)[0];
  if (lockedWpn && lockedWpn.price <= m) {
    return { kind: 'weapon', label: `New ordnance: ${lockedWpn.name}`, price: lockedWpn.price, icon: lockedWpn.icon };
  }
  let best = null;
  for (const u of UPGRADES || []) {
    const lvl = upgradeLevel(save, plane && plane.id, u.id);
    if (lvl >= u.max) continue;
    const price = upgradePrice(u, lvl, ECON);
    if (price <= m && (!best || price > best.price)) best = { kind: 'upgrade', label: `${u.name} → ${lvl + 1}`, price, icon: 'gun' };
  }
  if (best) return best;
  if (lockedWpn) return { kind: 'save', label: `Save for ${lockedWpn.name}`, price: lockedWpn.price, icon: lockedWpn.icon, short: lockedWpn.price - m };
  return null;
}
