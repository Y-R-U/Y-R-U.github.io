// M5 meta glue: the weekly ladder, coins per hole, chests and the shop, on top of the save store.
// No DOM and no THREE, so tools/meta_test.mjs drives it with a fake store and a fixed clock.
//   createMeta(store, now) → { ladder(), onHole(), onRound(), claim(), addChest(), openChest(), buy(), equip(), ... }
import { freshLadder, settle, holePoints, roundBonus, touchStreak, ymd } from './ladder.js';
import { holeCoins, roundCoins, rollChest, HELPER_PRICES, BALL_BY_ID, TRAIL_BY_ID, STAR_CHEST_EVERY, STAR_CHESTS_PER_DAY } from './economy.js';
import { HELPER_BY_ID } from './helpers.js';

export function createMeta(store, now = () => Date.now()) {
  const d = store.data;
  // the ladder record: created on first use, and settled every time it is read (week rollover)
  function ladder() {
    if (!d.ladder) { d.ladder = freshLadder(now()); store.save(); }
    if (settle(d.ladder, now())) store.save();
    return d.ladder;
  }

  // A finished hole in any mode (course, single hole, story, event). Returns what the card shows.
  function onHole({ id, par, strokes, picked, stars }) {
    const L = ladder();
    const streak = touchStreak(L.streak, ymd(now()));
    const points = holePoints({ id, par, strokes, picked, stars, streak });
    L.points += points; L.holes++;
    const coins = holeCoins({ stars, picked, ace: !picked && strokes === 1 });
    if (coins) d.coins = (d.coins | 0) + coins;
    let chest = null;
    if (stars === 3) {
      const C = d.chests, today = ymd(now());
      if (C.starDay !== today) { C.starDay = today; C.starToday = 0; }
      C.starCount++;
      if (C.starCount >= STAR_CHEST_EVERY && C.starToday < STAR_CHESTS_PER_DAY) { C.starCount = 0; C.starToday++; chest = 'wood'; C.queue.push(chest); }
      else if (C.starCount >= STAR_CHEST_EVERY) C.starCount = STAR_CHEST_EVERY - 1;   // daily cap hit: wait for tomorrow
    }
    store.save();
    return { points, coins, chest, streak, tier: L.tier };
  }
  // A completed multi-hole round (front nine, event round, story round of 6+): a bonus on top.
  function onRound({ holes }) {
    const L = ladder();
    const points = Math.round(roundBonus(holes)), coins = roundCoins(holes);
    L.points += points; L.rounds++;
    if (coins) d.coins = (d.coins | 0) + coins;
    store.save();
    return { points, coins };
  }

  // Grant a reward object { coins, helpers: { id: n }, chest: kind | [kinds] } (ladder, events).
  function grant(r) {
    if (!r) return;
    if (r.coins) d.coins = (d.coins | 0) + r.coins;
    for (const [k, n] of Object.entries(r.helpers || {})) d.helpers[k] = (d.helpers[k] | 0) + n;
    for (const kind of [].concat(r.chest || [])) d.chests.queue.push(kind);
    store.save();
  }
  // Claim a finished week's tier reward (once).
  function claim(i = 0) {
    const res = ladder().results[i];
    if (!res || res.claimed) return null;
    res.claimed = true;
    grant(res.reward);
    return res.reward;
  }
  const unclaimed = () => ladder().results.filter(r => !r.claimed);

  function addChest(kind) { d.chests.queue.push(kind); store.save(); }
  // Open the oldest chest. The serial and the grant are saved before anything is shown, so a reload
  // mid-animation keeps the prize and the next chest is a different roll.
  function openChest() {
    const C = d.chests;
    if (!C.queue.length) return null;
    const kind = C.queue[0], serial = C.serial;
    const res = rollChest(C.seed, serial, kind, d.cosmetics.owned);
    C.queue.shift(); C.serial++;
    if (res.coins) d.coins = (d.coins | 0) + res.coins;
    for (const [k, n] of Object.entries(res.helpers)) d.helpers[k] = (d.helpers[k] | 0) + n;
    if (res.cosmetic) d.cosmetics.owned.push(`${res.cosmetic.type}:${res.cosmetic.id}`);
    store.save();
    return { kind, serial, ...res };
  }

  // ---- shop ----
  const owns = (type, id) => d.cosmetics.owned.includes(`${type}:${id}`);
  function price(type, id) {
    if (type === 'helper') return HELPER_PRICES[id];
    return (type === 'ball' ? BALL_BY_ID : TRAIL_BY_ID)[id]?.price;
  }
  // → { ok, error? }. Helpers stack; a cosmetic is bought once and equipped straight away.
  function buy(type, id) {
    const p = price(type, id);
    if (p === undefined || (type === 'helper' && !HELPER_BY_ID[id])) return { ok: false, error: 'unknown item' };
    if (type !== 'helper' && owns(type, id)) return { ok: false, error: 'owned' };
    if ((d.coins | 0) < p) return { ok: false, error: 'coins' };
    d.coins -= p;
    if (type === 'helper') d.helpers[id] = (d.helpers[id] | 0) + 1;
    else { d.cosmetics.owned.push(`${type}:${id}`); d.cosmetics[type] = id; }
    store.save();
    return { ok: true };
  }
  function equip(type, id) {
    if (!owns(type, id)) return false;
    d.cosmetics[type] = id; store.save(); return true;
  }

  return { ladder, onHole, onRound, grant, claim, unclaimed, addChest, openChest, chests: () => d.chests.queue, buy, equip, owns, price, now };
}
