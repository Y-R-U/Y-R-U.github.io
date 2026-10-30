// Puzzle progress in localStorage `gambit.puzzles` (the `gambit.` prefix is what the ui's
// cloud sync mirrors once the key is in its synced list — see docs/notes/puzzles.md).
//
// { v:1,
//   s: { id: stars },      best stars per finished puzzle: 3 clean, 2/1 after mistakes or
//                          hints, 0 = finished by revealing the solution (still unlocks onward)
//   a: { id: attempts },   times the puzzle was finished or failed
//   r: rating, n: rated puzzles, pk: peak rating,
//   h: [last ratings…],    up to 30, for the little trend line
//   last: id, savedAt }
import { RATING_START, eloUpdate } from './logic.js';

export const KEY = 'gambit.puzzles';
let cache = null;
const listeners = new Set();

function blank() { return { v: 1, s: {}, a: {}, r: RATING_START, n: 0, pk: RATING_START, h: [], last: null }; }

export function getProgress() {
  if (cache) return cache;
  let v = null;
  try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { v = null; }
  cache = { ...blank(), ...(v && typeof v === 'object' ? v : {}) };
  if (!cache.s || typeof cache.s !== 'object') cache.s = {};
  if (!cache.a || typeof cache.a !== 'object') cache.a = {};
  if (!Array.isArray(cache.h)) cache.h = [];
  return cache;
}
function save() {
  const p = getProgress();
  p.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: in-memory only */ }
  for (const fn of listeners) { try { fn(p); } catch (e) { console.warn(e); } }
}
export function onProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Another tab / cloud sync rewrote the key. */
export function reloadProgress() { cache = null; return getProgress(); }
if (typeof window !== 'undefined') window.addEventListener('storage', e => { if (e.key === KEY) reloadProgress(); });

export const isDone = id => getProgress().s[id] !== undefined;
export const starsOf = id => getProgress().s[id] ?? null;

/**
 * Record a finished (or failed) puzzle.
 * {stars, clean} — clean = solved with no mistake, hint or reveal (rating score 1).
 * Only the first finish of a puzzle moves the rating. Returns {delta, rating, first, best}.
 */
export function recordResult(puzzle, { stars, clean }) {
  const p = getProgress();
  const first = p.s[puzzle.id] === undefined && !p.a[puzzle.id];
  p.a[puzzle.id] = (p.a[puzzle.id] || 0) + 1;
  const prev = p.s[puzzle.id];
  p.s[puzzle.id] = Math.max(prev ?? -1, stars);
  let delta = 0;
  if (first) {
    const r2 = eloUpdate(p.r, p.n, puzzle.r, clean ? 1 : 0);
    delta = r2 - p.r; p.r = r2; p.n++;
    p.pk = Math.max(p.pk || r2, r2);
    p.h.push(r2); if (p.h.length > 30) p.h.splice(0, p.h.length - 30);
  }
  p.last = puzzle.id;
  save();
  return { delta, rating: p.r, first, best: p.s[puzzle.id], improved: prev === undefined || stars > prev };
}

/** The first wrong move of a first attempt costs rating immediately (no refresh-to-retry). */
export function recordFirstMiss(puzzle) {
  const p = getProgress();
  if (p.s[puzzle.id] !== undefined || p.a[puzzle.id]) return 0;
  const r2 = eloUpdate(p.r, p.n, puzzle.r, 0);
  const d = r2 - p.r; p.r = r2; p.n++;
  p.h.push(r2); if (p.h.length > 30) p.h.splice(0, p.h.length - 30);
  p.a[puzzle.id] = 1;     // marks the rated attempt as used
  save();
  return d;
}

export function setLast(id) { const p = getProgress(); if (p.last !== id) { p.last = id; save(); } }
export function resetProgress() { cache = blank(); save(); }
