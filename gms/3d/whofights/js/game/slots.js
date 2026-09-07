// Which ability sits on which number key.
//
// Twenty slots: 1-9 and 0 are the first ten and Shift with the same keys is the second ten
// (js/input.js `slotFor`). The player may rearrange them — Aaron's son asked for that last —
// and the arrangement lives in the save, so it survives a reload and a promotion.
//
// Pure. The rules are all about holes: an empty slot 7 beside a full slot 8 is an arrangement
// somebody made on purpose and nothing here is allowed to tidy it up.

import { SLOTS } from './save.js';

export { SLOTS };

export const blank = () => new Array(SLOTS).fill(null);

// The arrangement, made safe against a table that has moved on and a save that has been edited.
// Anything the player no longer holds is dropped; anything they hold that is not on the bar yet
// goes into the first free slot, in the order they woke it. That is what makes a newly absorbed
// ability appear on the bar without the player having to go and put it there.
export function normalise(slots, held = []) {
  const have = new Set(held);
  const out = blank();
  const placed = new Set();
  for (let i = 0; i < SLOTS; i++) {
    const id = Array.isArray(slots) ? slots[i] : null;
    if (typeof id !== 'string' || !id) continue;
    if (!have.has(id) || placed.has(id)) continue;   // dropped, or listed twice
    out[i] = id;
    placed.add(id);
  }
  for (const id of held) {
    if (placed.has(id)) continue;
    const free = out.indexOf(null);
    if (free < 0) break;                              // twenty is twenty
    out[free] = id;
    placed.add(id);
  }
  return out;
}

export const indexOf = (slots, id) => (Array.isArray(slots) ? slots.indexOf(id) : -1);

// Put `id` on slot `i`. If it was already somewhere else the two SWAP rather than the old one
// being emptied — dragging a thing onto an occupied slot and having the occupant vanish is how
// you lose an ability you were using.
export function assign(slots, i, id) {
  const out = [...(Array.isArray(slots) ? slots : blank())];
  while (out.length < SLOTS) out.push(null);
  if (!Number.isInteger(i) || i < 0 || i >= SLOTS) return out.slice(0, SLOTS);
  const from = id ? out.indexOf(id) : -1;
  const was = out[i];
  out[i] = id || null;
  if (from >= 0 && from !== i) out[from] = was;
  return out.slice(0, SLOTS);
}

export function clear(slots, i) {
  return assign(slots, i, null);
}

// Move what is on `a` to `b` and the other way about. What a drag would do, if anything here
// dragged.
export function swap(slots, a, b) {
  const out = [...(Array.isArray(slots) ? slots : blank())];
  while (out.length < SLOTS) out.push(null);
  if ([a, b].some(i => !Number.isInteger(i) || i < 0 || i >= SLOTS)) return out.slice(0, SLOTS);
  [out[a], out[b]] = [out[b], out[a]];
  return out.slice(0, SLOTS);
}

// The bar, resolved: twenty entries, each the ability object or null. `list` is what
// js/game/session.js `awakened()` returns.
export function resolve(slots, list = []) {
  const by = new Map(list.map(a => [a.id, a]));
  const arranged = normalise(slots, list.map(a => a.id));
  return arranged.map(id => (id ? by.get(id) || null : null));
}

// How many of the twenty are filled, which is what the Bronze gate counts.
export const filled = slots => (Array.isArray(slots) ? slots.filter(Boolean).length : 0);

// Which page a slot is on, and where it sits across that page. Two pages of ten: the plain number
// row and the same row with Shift.
export const PAGE = 10;
export const pageOf = i => Math.floor(i / PAGE);
export const columnOf = i => i % PAGE;
