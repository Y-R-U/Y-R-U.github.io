// ===== Global Game State =====
import { SKILLS, BACKPACK_SLOTS, SKILL_LEVEL_CAP, xpForLevel } from './config.js';

const SAVE_KEY = 'crpg_save_v1';

function makeDefaultSkills() {
  const skills = {};
  for (const id of Object.keys(SKILLS)) {
    skills[id] = { level: 1, xp: 0 };
  }
  return skills;
}

function makeDefaultState() {
  return {
    player: {
      x: 20.5, y: 40.5,       // world tile coords (float)
      hp: 100, maxHp: 100,
      gold: 0,
      combatLevel: 1,
      skills: makeDefaultSkills(),
      buffs: [],               // [{id, stat, amount, endsAt}]
      inDungeon: false,
      dungeonId: null,
    },
    inventory: {
      equipped: {
        head: null, chest: null, legs: null,
        hands: null, feet: null, ring: null, amulet: null,
        weapon: null, offhand: null,
      },
      backpack: Array(BACKPACK_SLOTS).fill(null), // [{id, qty}]
    },
    world: {
      seed: Math.floor(Math.random() * 0xFFFFFF),
      time: 0,              // game ticks
      dungeonCooldowns: {}, // dungeonId -> unix ms when re-available
    },
    dungeon: null,           // active dungeon state or null
    flags: {
      debugMode: false,
      newGame: true,
    },
    lastSaved: null,
  };
}

// ===== State Singleton =====
let _state = makeDefaultState();

export function getState() { return _state; }

export function setState(partial) {
  Object.assign(_state, partial);
}

// ===== Save / Load =====
export function saveGame() {
  try {
    _state.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(_state));
    return true;
  } catch(e) {
    console.error('Save failed', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.player || !parsed.inventory) return false;
    // Merge to ensure new fields present
    _state = deepMerge(makeDefaultState(), parsed);
    return true;
  } catch(e) {
    console.error('Load failed', e);
    _state = makeDefaultState();
    return false;
  }
}

export function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  _state = makeDefaultState();
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

// ===== Skill Helpers =====
export function getSkill(id) {
  return _state.player.skills[id] || { level: 1, xp: 0 };
}

export function setSkillXP(id, xp) {
  if (!_state.player.skills[id]) _state.player.skills[id] = { level: 1, xp: 0 };
  _state.player.skills[id].xp = xp;
}

export function setSkillLevel(id, level) {
  if (!_state.player.skills[id]) _state.player.skills[id] = { level: 1, xp: 0 };
  _state.player.skills[id].level = Math.min(level, SKILL_LEVEL_CAP);
}

// ===== Combat Level calc (RS-style) =====
export function calcCombatLevel() {
  const s = _state.player.skills;
  const atk  = (s.attack?.level   || 1);
  const str  = (s.strength?.level || 1);
  const def  = (s.defence?.level  || 1);
  const hp   = (s.hitpoints?.level || 1);
  const mag  = (s.magic?.level    || 1);
  const rng  = (s.ranged?.level   || 1);
  return Math.max(1, Math.floor(
    (atk + str + def + hp) / 4 + Math.max(mag, rng) / 6
  ));
}

// ===== Max HP from Hitpoints skill =====
export function calcMaxHp() {
  const hpLvl = _state.player.skills.hitpoints?.level || 1;
  return 100 + Math.floor((hpLvl - 1) / 10) * 10;
}

// ===== Active buffs =====
export function addBuff(id, stat, amount, durationSec) {
  const endsAt = Date.now() + durationSec * 1000;
  _state.player.buffs = _state.player.buffs.filter(b => b.id !== id);
  _state.player.buffs.push({ id, stat, amount, endsAt });
}

export function getBuffBonus(stat) {
  const now = Date.now();
  _state.player.buffs = _state.player.buffs.filter(b => b.endsAt > now);
  return _state.player.buffs
    .filter(b => b.stat === stat)
    .reduce((sum, b) => sum + b.amount, 0);
}

// ===== Inventory helpers =====
export function addToBackpack(itemId, qty = 1) {
  const inv = _state.inventory;
  // Stack if stackable
  for (let i = 0; i < inv.backpack.length; i++) {
    const slot = inv.backpack[i];
    if (slot && slot.id === itemId) {
      slot.qty = (slot.qty || 1) + qty;
      return true;
    }
  }
  // Empty slot
  for (let i = 0; i < inv.backpack.length; i++) {
    if (!inv.backpack[i]) {
      inv.backpack[i] = { id: itemId, qty };
      return true;
    }
  }
  return false; // Full
}

export function removeFromBackpack(itemId, qty = 1) {
  const inv = _state.inventory;
  for (let i = 0; i < inv.backpack.length; i++) {
    const slot = inv.backpack[i];
    if (slot && slot.id === itemId) {
      slot.qty -= qty;
      if (slot.qty <= 0) inv.backpack[i] = null;
      return true;
    }
  }
  return false;
}

export function hasItem(itemId, qty = 1) {
  let total = 0;
  for (const slot of _state.inventory.backpack) {
    if (slot && slot.id === itemId) total += (slot.qty || 1);
  }
  return total >= qty;
}

export function getEquipped(slot) {
  return _state.inventory.equipped[slot] || null;
}

export function equipItem(itemDef, slot) {
  const inv = _state.inventory;
  const old = inv.equipped[slot];
  if (old) addToBackpack(old.id, 1);
  inv.equipped[slot] = { id: itemDef.id, qty: 1 };
  removeFromBackpack(itemDef.id, 1);
}

export function unequipItem(slot) {
  const inv = _state.inventory;
  const item = inv.equipped[slot];
  if (!item) return false;
  const added = addToBackpack(item.id, 1);
  if (added) {
    inv.equipped[slot] = null;
    return true;
  }
  return false; // Backpack full
}

// ===== Equipment stat bonuses =====
export function getEquipBonus(stat) {
  const inv = _state.inventory;
  let total = 0;
  for (const slot of Object.values(inv.equipped)) {
    if (!slot) continue;
    const item = _getItemDef(slot.id);
    if (!item) continue;
    if (stat === 'atk' && item.atkBonus) total += item.atkBonus;
    if (stat === 'str' && item.strBonus) total += item.strBonus;
    if (stat === 'def' && item.defBonus) total += item.defBonus;
    if (stat === 'mag' && item.magBonus) total += item.magBonus;
    if (stat === 'rng' && item.rngBonus) total += item.rngBonus;
  }
  return total;
}

// Lazy import to avoid circular
let _itemsRef = null;
function _getItemDef(id) {
  if (!_itemsRef) {
    // Will be set by main.js after import
    return null;
  }
  return _itemsRef[id] || null;
}
export function setItemsRef(items) { _itemsRef = items; }
