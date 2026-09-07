// Which ability sits on which key, what going down costs, and the tour of the square.
//
// The rule worth the most here is the one about holes: an empty slot 7 beside a full slot 8 is an
// arrangement somebody made on purpose, and nothing is allowed to tidy it up behind their back.

import { test, eq, ok } from '../../tools/harness.mjs';
import {
  SLOTS, PAGE, blank, normalise, assign, clear, swap, resolve, filled, indexOf, pageOf, columnOf,
} from './slots.js';
import { slotFor, keyLabel } from '../input.js';
import { LADDER, STARS, XP_FLAG, RANK_FLAG, sheet, award, loseStar, promote } from './progress.js';
import { STOPS, FLAG, DONE, active, visited, left, complete, next, brief } from './tour.js';

const ab = (...ids) => ids.map(id => ({ id, name: id.toUpperCase() }));

// ── the arrangement ─────────────────────────────────────────────────────────

test('twenty slots, and the keyboard reaches every one of them', () => {
  eq(SLOTS, 20);
  eq(PAGE, 10);
  eq(blank().length, SLOTS);
  const reached = new Set();
  for (const shift of [false, true]) {
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) reached.add(slotFor(`Digit${d}`, shift));
  }
  eq(reached.size, SLOTS, 'the number row cannot reach all twenty slots');
  for (let i = 0; i < SLOTS; i++) ok(keyLabel(i), `slot ${i} has no key printed on it`);
});

test('a new ability lands on the first free key by itself', () => {
  const s = normalise(blank(), ['a', 'b', 'c']);
  eq(s.slice(0, 3), ['a', 'b', 'c']);
  eq(s[3], null);
  eq(filled(s), 3);
});

test('an arrangement is never rearranged — only its holes are filled', () => {
  const s = blank();
  s[9] = 'a';
  s[4] = 'b';
  const out = normalise(s, ['a', 'b', 'c']);
  eq(out[9], 'a', 'a slot the player chose was moved');
  eq(out[4], 'b');
  eq(out[0], 'c', 'the new one should take the first hole');
  eq(out[1], null);
});

test('an ability the player no longer holds leaves its slot rather than the save', () => {
  const s = blank();
  s[2] = 'gone';
  s[3] = 'here';
  const out = normalise(s, ['here']);
  eq(out[2], null);
  eq(out[3], 'here');
});

test('the same ability twice in a save takes one slot, not two', () => {
  const s = blank();
  s[0] = 'a';
  s[5] = 'a';
  const out = normalise(s, ['a']);
  eq(out[0], 'a');
  eq(out[5], null);
  eq(filled(out), 1);
});

test('twenty is twenty — a twenty-first ability finds nowhere to go', () => {
  const ids = Array.from({ length: 25 }, (_, i) => `a${i}`);
  const out = normalise(blank(), ids);
  eq(filled(out), SLOTS);
  eq(out.includes('a20'), false);
});

test('nonsense in the slots array is dropped rather than trusted', () => {
  eq(normalise(null, ['a'])[0], 'a');
  eq(normalise('nope', ['a'])[0], 'a');
  eq(normalise([1, {}, 'a'], ['a']).indexOf('a'), 2);
});

// ── moving things about ─────────────────────────────────────────────────────

test('assigning to an occupied slot swaps, it does not delete', () => {
  let s = normalise(blank(), ['a', 'b', 'c']);   // a b c
  s = assign(s, 0, 'c');
  eq(s[0], 'c');
  eq(s[2], 'a', 'the occupant vanished instead of swapping — that is how you lose an ability');
  eq(filled(s), 3);
});

test('assigning something already on the bar to an empty slot moves it', () => {
  let s = normalise(blank(), ['a', 'b']);
  s = assign(s, 7, 'a');
  eq(s[7], 'a');
  eq(s[0], null, 'it should have left where it was');
  eq(filled(s), 2);
});

test('assigning null empties a slot and loses nothing else', () => {
  let s = normalise(blank(), ['a', 'b']);
  s = clear(s, 0);
  eq(s[0], null);
  eq(s[1], 'b');
  eq(filled(s), 1);
});

test('a slot index off either end is refused rather than growing the bar', () => {
  const s = normalise(blank(), ['a']);
  eq(assign(s, -1, 'a').length, SLOTS);
  eq(assign(s, 99, 'a').length, SLOTS);
  eq(assign(s, 1.5, 'a').length, SLOTS);
  eq(assign(s, 99, 'a')[0], 'a', 'a refused assignment moved something anyway');
});

test('swap is symmetrical and safe at the edges', () => {
  const s = normalise(blank(), ['a', 'b']);
  eq(swap(s, 0, 1).slice(0, 2), ['b', 'a']);
  eq(swap(s, 0, 0).slice(0, 2), ['a', 'b']);
  eq(swap(s, 0, 99).slice(0, 2), ['a', 'b']);
});

test('resolve hands back the abilities themselves, in key order', () => {
  const list = ab('a', 'b');
  const bar = resolve(assign(normalise(blank(), ['a', 'b']), 12, 'b'), list);
  eq(bar.length, SLOTS);
  eq(bar[0].id, 'a');
  eq(bar[12].id, 'b');
  eq(bar[1], null);
  eq(indexOf(normalise(blank(), ['a', 'b']), 'b'), 1);
});

test('the two pages are the two halves of the keyboard', () => {
  eq(pageOf(0), 0);
  eq(pageOf(9), 0);
  eq(pageOf(10), 1);
  eq(pageOf(19), 1);
  eq(columnOf(0), 0);
  eq(columnOf(19), 9);
  eq(keyLabel(0), '1');
  eq(keyLabel(10), '⇧1');
});

// ── what going down costs ───────────────────────────────────────────────────

test('a death drops you to the bottom of the star you were on', () => {
  const flags = { [RANK_FLAG]: 'iron', [XP_FLAG]: 250 };
  eq(sheet(flags).stars, 3);
  const r = loseStar(flags);
  eq(r.xp, LADDER.iron[2], 'it should land on the bottom of the star below');
  eq(r.after.stars, 2);
  eq(r.starLost, true);
  eq(r.lost, 250 - LADDER.iron[2]);
});

test('a death at no stars costs nothing, because there is nothing to take', () => {
  const flags = { [RANK_FLAG]: 'iron', [XP_FLAG]: 10 };
  eq(sheet(flags).stars, 0);
  const r = loseStar(flags);
  eq(r.xp, LADDER.iron[0]);
  eq(r.starLost, false);
});

test('you are never demoted — a death at the foot of bronze stays bronze', () => {
  const flags = { [RANK_FLAG]: 'bronze', [XP_FLAG]: LADDER.bronze[0] };
  const r = loseStar(flags);
  eq(r.rank, 'bronze');
  eq(r.xp, LADDER.bronze[0], 'it fell through the floor of its own rank');
  eq(r.after.rank, 'bronze');
});

test('a death at four stars costs the fourth star and the promotion with it', () => {
  const flags = { [RANK_FLAG]: 'iron', [XP_FLAG]: LADDER.iron[STARS] + 40 };
  eq(sheet(flags).stars, STARS);
  ok(promote(flags), 'four stars should be promotable before the fall');
  const r = loseStar(flags);
  eq(r.after.stars, STARS - 1);
  eq(promote({ ...flags, [XP_FLAG]: r.xp }), null, 'still promotable after losing the fourth star');
});

test('an unregistered player cannot lose a star they never had', () => {
  eq(loseStar({}), null);
  eq(loseStar({ [RANK_FLAG]: 'none', [XP_FLAG]: 100 }), null);
});

test('a star lost and re-earned costs exactly one star of work', () => {
  const flags = { [RANK_FLAG]: 'iron', [XP_FLAG]: 250 };
  const down = loseStar(flags);
  const back = award({ ...flags, [XP_FLAG]: down.xp }, 250 - down.xp);
  eq(back.after.stars, 3, 'earning back what was taken did not restore the star');
});

// ── the tour ────────────────────────────────────────────────────────────────

test('the tour is three doors and knows which are left', () => {
  eq(STOPS.length, 3);
  eq(active({}), false);
  const on = { [FLAG]: true };
  eq(active(on), true);
  eq(left(on), 3);
  eq(next(on).id, STOPS[0].id);
  const half = { ...on, [STOPS[0].flag]: true };
  eq(visited(half), 1);
  eq(left(half), 2);
  eq(next(half).id, STOPS[1].id);
  eq(complete(half), false);
});

test('all three walked into is a finished tour', () => {
  const all = { [FLAG]: true };
  for (const s of STOPS) all[s.flag] = true;
  eq(complete(all), true);
  eq(next(all), null);
  eq(brief(all).asks, 'Back to the desk.');
});

test('a finished tour stops being active and does not come back', () => {
  const done = { [FLAG]: true, [DONE]: true };
  eq(active(done), false);
});

test('the tour brief is the shape the contract panel draws', () => {
  const b = brief({ [FLAG]: true });
  ok(b.job.name.length > 4);
  ok(b.asks.length > 4);
  ok(b.note.length > 20);
  ok(b.foes.length > 4, 'the panel needs something to put in the room line');
  eq(b.worth, 0);
  eq(b.job.reward, 0, 'the tour must not look like paid work');
});

test('every stop names a shop the game actually has', async () => {
  const { SHOPS } = await import('./shop.js');
  for (const s of STOPS) {
    ok(SHOPS[s.shop], `${s.id} points at "${s.shop}", which is not a shop`);
    ok(Number.isInteger(s.house), `${s.id} has no building`);
  }
});
