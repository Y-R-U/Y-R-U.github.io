// The game's data layer. No THREE, no DOM — everything else talks to the game through this, so
// the UI and the simulation never have to know about each other.

import { item, stackOf, fitsSlot, SLOTS } from './items.js';

export const SKILLS = [
  ['vitality', 'Vitality'], ['strength', 'Strength'], ['defence', 'Defence'],
  ['melee', 'Melee'], ['magic', 'Magic'], ['ranged', 'Ranged'],
  ['gathering', 'Gathering'], ['crafting', 'Crafting'], ['cooking', 'Cooking'],
  ['fishing', 'Fishing'], ['trade', 'Trade'], ['exploring', 'Exploring'],
];

const MAX_PACK = 40;

// The classic curve, compressed. Level 1 at 0, and the gap widens by ~11% a level.
const XP = [0];
for (let l = 1; l < 99; l++) XP.push(Math.floor(XP[l - 1] + 55 * Math.pow(1.104, l)));
export function levelFor(xp) {
  let l = 1;
  while (l < 99 && xp >= XP[l]) l++;
  return l;
}
export function xpBand(xp) {
  const l = levelFor(xp);
  const lo = XP[l - 1], hi = XP[Math.min(l, 98)];
  return { level: l, lo, hi, frac: hi > lo ? (xp - lo) / (hi - lo) : 1 };
}

class Inventory {
  constructor(game) {
    this.game = game;
    this.beltSize = 5;
    this.packSize = 0;
    this.forced = 0;
    this.slots = new Array(MAX_PACK + 10).fill(null);
  }

  get size() { return this.beltSize + this.packSize; }
  isBelt(i) { return i < this.beltSize; }

  // The test cycler's override. Held here rather than in the UI so equipping something can't
  // silently undo it — `Equipment.recompute` re-applies whatever is set.
  setSize(n) {
    this.forced = n || 0;
    if (n) {
      this.beltSize = Math.min(10, n);
      this.packSize = Math.min(MAX_PACK, Math.max(0, n - 10));
    } else {
      this.game.equip.recompute();
    }
    this.game.emit('change');
  }

  dropAt(i) {
    const s = this.slots[i];
    if (!s) return false;
    this.game.emit('drop', { index: i, id: s.id, qty: s.qty, pos: this.game.player.pos });
    if (this.slots[i] === s) this.removeAt(i, s.qty);
    return true;
  }

  // Belt fills first, deliberately: the quick-use slots are the ones you want a potion to land in.
  add(id, qty = 1) {
    if (!item(id)) return false;
    const max = stackOf(id);
    let left = qty;
    if (max > 1) {
      for (let i = 0; i < this.size && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.qty < max) {
          const take = Math.min(max - s.qty, left);
          s.qty += take; left -= take;
        }
      }
    }
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, left);
        this.slots[i] = { id, qty: take };
        left -= take;
      }
    }
    if (left < qty) this.game.emit('change');
    if (left < qty) this.game.emit('pickup', { id, qty: qty - left });
    return left === 0;
  }

  removeAt(i, qty = 1) {
    const s = this.slots[i];
    if (!s) return false;
    s.qty -= qty;
    if (s.qty <= 0) this.slots[i] = null;
    this.game.emit('change');
    return true;
  }

  countOf(id) {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (this.slots[i]?.id === id) n += this.slots[i].qty;
    return n;
  }

  firstFree() {
    for (let i = 0; i < this.size; i++) if (!this.slots[i]) return i;
    return -1;
  }

  moveTo(from, to) {
    if (from === to || to >= this.size || from >= this.size) return false;
    const a = this.slots[from], b = this.slots[to];
    if (a && b && a.id === b.id && stackOf(a.id) > 1) {
      const room = stackOf(a.id) - b.qty;
      const take = Math.min(room, a.qty);
      b.qty += take; a.qty -= take;
      if (a.qty <= 0) this.slots[from] = null;
    } else {
      this.slots[from] = b; this.slots[to] = a;
    }
    this.game.emit('change');
    return true;
  }

  useAt(i) {
    const s = this.slots[i];
    if (!s) return false;
    const it = item(s.id);
    if (!it) return false;
    const p = this.game.player;

    if (it.kind === 'use') {
      if (it.heal) p.hp = Math.min(p.hpMax, p.hp + it.heal);
      if (it.mana) p.mp = Math.min(p.mpMax, p.mp + it.mana);
      this.removeAt(i, 1);
      this.game.emit('used', { id: s.id });
      return true;
    }
    if (it.slot) {
      const slot = this.game.equip.freeSlotFor(s.id);
      if (!slot) return false;
      const swap = this.game.equip.slots[slot];
      this.removeAt(i, 1);
      this.game.equip.put(slot, s.id);
      if (swap) this.add(swap, 1);
      return true;
    }
    return false;
  }
}

class Equipment {
  constructor(game) {
    this.game = game;
    this.slots = Object.fromEntries(SLOTS.map(s => [s, null]));
  }

  // Rings and bracelets have several homes; take the first empty one, else the named one.
  freeSlotFor(id) {
    const cands = SLOTS.filter(s => fitsSlot(id, s));
    return cands.find(s => !this.slots[s]) || cands[0] || null;
  }

  put(slot, id) {
    this.slots[slot] = id;
    this.recompute();
    this.game.emit('equip', { slot, id });
    this.game.emit('change');
  }

  take(slot) {
    const id = this.slots[slot];
    if (!id) return null;
    this.slots[slot] = null;
    this.recompute();
    this.game.emit('change');
    return id;
  }

  // Equipment is what changes the inventory's shape: a belt adds a second row of quick slots,
  // a pack adds rows behind them.
  recompute() {
    let beltRows = 1, packRows = 0, armour = 0;
    for (const s of SLOTS) {
      const it = item(this.slots[s]);
      if (!it) continue;
      beltRows += it.beltRows || 0;
      packRows += it.packRows || 0;
      armour += it.armour || 0;
    }
    const inv = this.game.inv;
    if (inv.forced) {
      inv.beltSize = Math.min(10, inv.forced);
      inv.packSize = Math.min(MAX_PACK, Math.max(0, inv.forced - 10));
    } else {
      inv.beltSize = Math.min(10, beltRows * 5);
      inv.packSize = Math.min(MAX_PACK, packRows * 5);
    }
    this.game.player.armour = armour;
  }

  weapon() {
    const it = item(this.slots.handR) || item(this.slots.handL);
    return it?.weapon ? it : null;
  }
}

class GameState {
  constructor() {
    this.player = {
      pos: null, hp: 60, hpMax: 60, mp: 30, mpMax: 30, armour: 0,
      alive: true, inCombat: 0, target: null,
    };
    this.skills = Object.fromEntries(SKILLS.map(([k]) => [k, 0]));
    this.inv = new Inventory(this);
    this.equip = new Equipment(this);
    this.actors = [];
    this.spawnPoint = null;
    this.interactables = new Map();
    this.listeners = new Map();
    this.controlled = false;
  }

  on(evt, fn) {
    if (!this.listeners.has(evt)) this.listeners.set(evt, new Set());
    this.listeners.get(evt).add(fn);
    return () => this.listeners.get(evt).delete(fn);
  }

  emit(evt, data) {
    for (const fn of this.listeners.get(evt) || []) fn(data, this);
    if (evt !== '*') for (const fn of this.listeners.get('*') || []) fn(data, this, evt);
  }

  addXp(skill, amount) {
    if (!(skill in this.skills)) return;
    const before = levelFor(this.skills[skill]);
    this.skills[skill] += amount;
    const after = levelFor(this.skills[skill]);
    if (after > before) this.emit('levelup', { skill, level: after });
    this.emit('change');
  }

  addInteractable(o) { this.interactables.set(o.id, o); return o; }
  removeInteractable(id) { this.interactables.delete(id); }

  toast(text) { this.emit('toast', { text }); }
}

export const Game = new GameState();
