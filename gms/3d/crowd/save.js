'use strict';
/* ── save.js ── localStorage persistence ── */

const SaveSystem = (() => {
  const KEY = 'crowdrush3d';

  const DEFAULTS = {
    coins: 0,
    upgrades:      { speed: 0, magnet: 0, squad: 0, coinBonus: 0 },
    levelStars:    [0, 0, 0, 0, 0],
    unlockedLevel: 1,
    settings:      { sfx: true, music: true, vibrate: true },
  };

  let data = null;

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        data = Object.assign(_clone(DEFAULTS), parsed);
        data.upgrades  = Object.assign(_clone(DEFAULTS.upgrades),  data.upgrades  || {});
        data.settings  = Object.assign(_clone(DEFAULTS.settings),  data.settings  || {});
        if (!Array.isArray(data.levelStars) || data.levelStars.length !== 5) {
          data.levelStars = [0, 0, 0, 0, 0];
        }
      } else {
        data = _clone(DEFAULTS);
      }
    } catch (_) {
      data = _clone(DEFAULTS);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
  }

  // Dot-path getter e.g. get('settings.sfx')
  function get(path) {
    return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), data);
  }

  // Dot-path setter e.g. set('settings.sfx', false)
  function set(path, val) {
    const keys = path.split('.');
    let o = data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
    save();
  }

  function addCoins(n) {
    data.coins = Math.max(0, (data.coins || 0) + n);
    save();
  }

  function reset() {
    data = _clone(DEFAULTS);
    save();
  }

  function getData() { return data; }

  return { load, save, get, set, addCoins, reset, getData };
})();
