// Everything the player can own, in one table.
//
// The save has always had a counted bag (`doc.items` in js/game/save.js) and until now nothing
// ever put anything in it but marks. This is the table that says what a key in that bag means:
// what it is called, what kind of thing it is, and — for the three that do something — what
// happens when it is in the hand slot and used.
//
// Pure. `use()` returns a DESCRIPTION of what should happen rather than doing it, because what
// "heal 45" means depends on whether there is a fight running and this module must not know.
// js/game/session.js is where the description meets the world.
//
// Weapons are not listed twice: js/game/weapons.js owns them, because their numbers are combat
// balance and have to be reachable from a node test without any of this. Their bag rows are
// generated from it.

import { WEAPONS, buyable } from './weapons.js';
import { priceOf, tuning } from './economy.js';

export const KINDS = ['currency', 'weapon', 'tool', 'potion', 'stone'];

// What a thing in the hand does. `kind` on the returned description is what session.js switches
// on; anything it does not recognise is a refusal rather than a silent nothing.
export const MARKS = 'marks';
export const STONE = 'stone.awakening';
export const POTION = 'potion.healing';
export const DRAUGHT = 'potion.greater';
export const ROPE = 'rope';

const EXTRA = {
  [MARKS]: {
    id: MARKS, name: 'Marks', kind: 'currency', stack: Infinity,
    blurb: 'What the Society pays in and what everyone else takes. Nobody calls them anything else.',
  },
  [STONE]: {
    id: STONE, name: 'Awakening stone', kind: 'stone', stack: 99, hand: true,
    blurb: 'A dull grey lump that is warm on one side. Hold it and it goes somewhere — and one of '
      + 'the things you were always able to do, you can now do.',
  },
  [POTION]: {
    id: POTION, name: 'Healing potion', kind: 'potion', stack: 99, hand: true,
    blurb: 'Tastes of iron and pennyroyal. Closes what is open. Does nothing at all for what is '
      + 'broken underneath.',
  },
  [DRAUGHT]: {
    id: DRAUGHT, name: 'Adventurer’s draught', kind: 'potion', stack: 99, hand: true, heal: 110,
    blurb: 'What the Society issues to people it expects back. Tastes of nothing at all, which is '
      + 'the expensive part, and closes rather more than a wound.',
  },
  [ROPE]: {
    id: ROPE, name: 'Snare rope', kind: 'tool', stack: 20, hand: true,
    blurb: 'Forty feet of waxed line with a weight on the end. It will not hurt anything. It will '
      + 'keep something exactly where it is for a few seconds, which is often the same thing.',
  },
};

// How long a snared thing stays snared. Here rather than in economy.js because it is combat
// balance, not pacing — it is measured against js/game/foe.js's windup, not against a purse.
export const SNARE_SECONDS = 3.5;

function weaponRow(id) {
  const w = WEAPONS[id];
  return {
    id, name: w.name, kind: 'weapon', stack: 9, hand: false, weapon: id,
    blurb: w.blurb || '',
  };
}

// The whole table, built once. Weapons first so the bag lists gear above consumables.
export const ITEMS = (() => {
  const out = {};
  for (const id of Object.keys(WEAPONS)) {
    // The knife and the fists are never owned: one is Society property and the other is not a
    // thing. js/game/combat.js reaches them through weaponOf(), not through the bag.
    if (id === 'knife' || id === 'fists') continue;
    out[id] = weaponRow(id);
  }
  for (const [id, row] of Object.entries(EXTRA)) out[id] = row;
  return out;
})();

export const itemOf = id => ITEMS[id] || null;
export const nameOf = id => ITEMS[id]?.name || id;

// Is this something that can sit in the hand slot and be used? Weapons cannot: they go in the
// weapon slot, and a weapon in the hand slot would make left-click mean two things at once.
export const usable = id => !!ITEMS[id]?.hand;

// Is it a weapon, and therefore for the other slot?
export const isWeapon = id => ITEMS[id]?.kind === 'weapon';

// What a shop may stock, and for how much. Zero means not for sale — js/game/shop.js drops those
// rows rather than offering something free.
export function stockPrice(id) {
  if (id === MARKS) return 0;
  if (isWeapon(id) && !buyable(id)) return 0;
  return priceOf(id);
}

// ── the bag ─────────────────────────────────────────────────────────────────
// `bag` is `doc.items` — a plain object of id → count. These are the only four things anything
// does to it, so a count can never go negative and a zero can never linger as an empty row.

export const countOf = (bag, id) => Math.max(0, Math.floor(+bag?.[id] || 0));

export function give(bag, id, n = 1) {
  const add = Math.floor(+n || 0);
  if (!id || add <= 0) return 0;
  const now = countOf(bag, id) + add;
  bag[id] = now;
  return now;
}

// Returns whether it could be taken, so a caller cannot half-spend. Never partially removes.
export function take(bag, id, n = 1) {
  const want = Math.floor(+n || 0);
  if (!id || want <= 0) return false;
  const have = countOf(bag, id);
  if (have < want) return false;
  const left = have - want;
  if (left) bag[id] = left; else delete bag[id];
  return true;
}

export const has = (bag, id, n = 1) => countOf(bag, id) >= Math.max(1, Math.floor(+n || 0));

// Every row worth drawing, in a stable order: gear, then things you use, then everything else.
// Marks are left out — they are the purse line at the bottom of the sheet, not a row in the bag.
const ORDER = { weapon: 0, potion: 1, stone: 2, tool: 3, currency: 9 };

export function rows(bag = {}) {
  const out = [];
  for (const [id, n] of Object.entries(bag)) {
    if (id === MARKS) continue;
    const count = countOf(bag, id);
    if (!count) continue;
    const it = itemOf(id);
    // An id the table no longer knows still shows, named after itself. Losing a player's things
    // silently because a build renamed something is worse than one ugly row.
    out.push({ id, count, kind: it?.kind || 'tool', name: it?.name || id, blurb: it?.blurb || '', hand: !!it?.hand });
  }
  out.sort((a, b) => (ORDER[a.kind] ?? 5) - (ORDER[b.kind] ?? 5) || a.name.localeCompare(b.name));
  return out;
}

export const purse = bag => countOf(bag, MARKS);

// ── using what is in the hand ───────────────────────────────────────────────

// What using this would do, or why it would not. `ctx` is what the caller already knows about the
// world: whether a fight is running, whether the player is hurt, and whether every ability is
// already awakened. One shape in, one shape out, and no branching anywhere else.
export function use(id, ctx = {}) {
  const it = itemOf(id);
  if (!it) return { ok: false, why: 'Nothing in hand.' };
  if (!it.hand) return { ok: false, why: `${it.name} is not something you use.` };

  if (it.kind === 'stone') {
    if (ctx.allAwakened) return { ok: false, why: 'There is nothing left in you to wake.' };
    if (!ctx.registered) return { ok: false, why: 'Take your essences first — there is nothing for it to reach.' };
    return { ok: true, kind: 'awaken', spend: 1 };
  }

  if (it.kind === 'potion') {
    if (ctx.hurt === false) return { ok: false, why: 'Nothing to mend.' };
    // A bottle with its own `heal` keeps it; the plain one reads the live tuning, because that is
    // the slider in the Economy panel and the two are meant to be a choice between sizes.
    return { ok: true, kind: 'heal', amount: Math.max(1, Math.round(it.heal ?? tuning().potionHeal)), spend: 1 };
  }

  if (it.kind === 'tool' && id === ROPE) {
    if (!ctx.fighting) return { ok: false, why: 'Nothing to throw it at.' };
    return { ok: true, kind: 'snare', seconds: SNARE_SECONDS, spend: 1 };
  }

  return { ok: false, why: `${it.name} does nothing here.` };
}
