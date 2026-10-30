// Learn progress: localStorage `gambit.learn` (synced by the account layer like every gambit.* key).
//   { v:1, l:{lessonId: stars 1..3}, last: lessonId, savedAt }
const KEY = 'gambit.learn';
const listeners = new Set();

export function getProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object' && v.l && typeof v.l === 'object') return { v: 1, last: null, ...v };
  } catch { /* blocked / corrupt */ }
  return { v: 1, l: {}, last: null };
}
function save(p) {
  const { savedAt, ...rest } = p;
  try { localStorage.setItem(KEY, JSON.stringify({ ...rest, savedAt: Date.now() })); } catch { /* private mode */ }
  for (const fn of listeners) { try { fn(p); } catch (e) { console.warn(e); } }
}
/** Record a finished lesson; keeps the best stars. Returns {stars, best, first}. */
export function recordLesson(id, stars) {
  const p = getProgress();
  const prev = p.l[id];
  p.l[id] = Math.max(prev || 0, stars);
  p.last = id;
  save(p);
  return { stars, best: p.l[id], first: prev === undefined };
}
export function setLast(id) { const p = getProgress(); if (p.last !== id) { p.last = id; save(p); } }
export function onProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
