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

/**
 * Switching airframe remembers the loadout you had on the old one and recalls the one you last
 * flew on the new one. Without the memory, moving to a plane with fewer hardpoints threw the
 * overflow away and moving back left the slots empty — a silent loss of things you had bought.
 * Anything the new airframe cannot carry is stowed, not binned (see `normaliseLoadout`).
 */
export function selectPlane(save, PLANES, id) {
  if (!ownsPlane(save, PLANES, id)) return false;
  const s = d(save);
  const from = s.planeId;
  if (!s.loadouts || typeof s.loadouts !== 'object') s.loadouts = {};
  if (from) s.loadouts[from] = loadout(save).slice(0, 4);
  s.planeId = id;
  const recalled = s.loadouts[id];
  if (Array.isArray(recalled)) {
    const l = loadout(save);
    for (let i = 0; i < 4; i++) l[i] = recalled[i] || null;
  }
  normaliseLoadout(save, (PLANES || []).find((p) => p.id === id));
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

/**
 * A weapon leaving a hardpoint always lands back in stores. Nothing the player has ever had may
 * be destroyed by a tap: the fresh save ships `loadout:['bomb_std','rocket',…]` while `weapons`
 * is unset, so clearing that rocket used to erase the only record it existed and put it back
 * behind a £1,100 price tag. `stow` is the choke point every removal goes through.
 */
function stow(save, id) {
  if (!id) return false;
  const s = d(save);
  if (!Array.isArray(s.weapons)) s.weapons = [];
  if (s.weapons.includes(id)) return false;
  s.weapons.push(id);
  return true;
}

export function ownedWeapons(save, WEAPONS) {
  const s = d(save);
  let changed = false;
  if (!Array.isArray(s.weapons)) { s.weapons = []; changed = true; }
  for (const w of specialWeapons(WEAPONS)) if (!w.price && !s.weapons.includes(w.id)) { s.weapons.push(w.id); changed = true; }
  for (const id of loadout(save)) if (stow(save, id)) changed = true;
  if (changed) flush(save);
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
  if (l[i] && l[i] !== weaponId) stow(save, l[i]);
  l[i] = weaponId || null;
  flush(save);
}

/** Ids sitting past this plane's hardpoint count — what a switch would have to unload. */
export function overflowWeapons(save, plane) {
  const l = loadout(save);
  const out = [];
  for (let i = slotCount(plane); i < 4; i++) if (l[i]) out.push(l[i]);
  return out;
}

/** Unload anything past the plane's hardpoint count — back to stores, never to the bin. */
export function normaliseLoadout(save, plane) {
  const l = loadout(save);
  const n = slotCount(plane);
  let changed = false;
  for (let i = n; i < 4; i++) if (l[i]) { stow(save, l[i]); l[i] = null; changed = true; }
  if (changed) flush(save);
  return l;
}

/* ---------------------------------------------------------------- progress */

/**
 * `levelsDone` is the store core/save.js writes when a mission is actually flown, and the one
 * carried in the fresh-save shape. The UI used to keep its own parallel `levels` map, so every
 * completed mission was recorded twice into two different keys and the campaign map read the one
 * the game never wrote — nothing would ever have unlocked from flying. One store now; a legacy
 * `levels` entry is still honoured on read so an existing save does not lose its stars.
 */
export function levelRecord(save, levelId) {
  const s = d(save);
  if (!s.levelsDone || typeof s.levelsDone !== 'object') s.levelsDone = {};
  const rec = s.levelsDone[levelId];
  if (rec) return rec;
  const legacy = s.levels && s.levels[levelId];
  return legacy || null;
}

export function levelStars(save, levelId) {
  const r = levelRecord(save, levelId);
  return r ? (r.stars || 0) : 0;
}

export function levelDone(save, levelId) {
  const r = levelRecord(save, levelId);
  // core/save.js records a win as {stars,best} with no `done` flag, and a genuine 0-star win is
  // possible, so the presence of a record counts as done on its own.
  return !!r && (r.done === true || (r.stars || 0) > 0 || r.best != null);
}

export function recordLevel(save, levelId, res) {
  const s = d(save);
  if (!s.levelsDone || typeof s.levelsDone !== 'object') s.levelsDone = {};
  const prev = levelRecord(save, levelId) || {};
  s.levelsDone[levelId] = {
    done: true,
    stars: Math.max(prev.stars || 0, res.stars || 0),
    best: prev.best != null && isFinite(prev.best) ? Math.min(prev.best, res.time || Infinity) : res.time,
  };
  flush(save);
}

/** A level is unlocked if it is the first, or the one before it is done. */
/**
 * Act 0 is the two tutorials. They are always available and they never gate anything: being made
 * to fly Flight School before Dawn Patrol will unlock is not a thing anyone asked for, and with
 * CAMPAIGN putting them at indices 0-1 the naive "previous level" rule locked a1-01 behind them.
 * So walk back to the previous level that actually gates.
 */
export function levelUnlocked(save, LEVELS, index) {
  if (index <= 0) return true;
  if ((d(save).unlockAll)) return true;
  const lv = LEVELS[index];
  if (lv && lv.act === 0) return true;
  for (let i = index - 1; i >= 0; i--) {
    const prev = LEVELS[i];
    if (!prev || prev.act === 0) continue;
    return levelDone(save, prev.id);
  }
  return true;
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

/**
 * Levels that are graded at all. Tutorials carry `stars:false` — timing a teaching level against
 * par punishes exactly the experimenting it is there to encourage — so they must count toward
 * neither the numerator nor the denominator of the star total.
 */
export function gradedLevels(LEVELS) {
  return (LEVELS || []).filter((l) => l && l.stars !== false);
}

export function totalStars(save, LEVELS) {
  return gradedLevels(LEVELS).reduce((n, l) => n + levelStars(save, l.id), 0);
}

export function maxStars(LEVELS) { return gradedLevels(LEVELS).length * 3; }

/** Group levels by act, in order, for the campaign map. */
export function acts(LEVELS, ACTS) {
  const map = new Map();
  LEVELS.forEach((l, i) => {
    // `l.act || 1` folded the act-0 tutorials into Act 1, because 0 is falsy. They are their own
    // section: two teaching missions do not belong inside DAWN PATROL.
    const a = l.act == null ? 1 : l.act;
    if (!map.has(a)) map.set(a, { act: a, name: (ACTS && ACTS[a] && ACTS[a].name) || actName(a), levels: [] });
    map.get(a).levels.push({ level: l, index: i });
  });
  return [...map.values()].sort((x, y) => x.act - y.act);
}

const ACT_NAMES = ['Flight School', 'Dawn Patrol', 'The Long Front', 'Iron Skies', 'Jet Age', 'Last Light'];
function actName(n) { return ACT_NAMES[n] || 'Act ' + n; }

/** Act 0 is the tutorial pair; it gets a name, not a number, on the campaign map. */
export function actLabel(n) { return n === 0 ? 'TRAINING' : 'ACT ' + n; }

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
