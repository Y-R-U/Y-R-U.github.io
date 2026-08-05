// Which real case a tactic shows you this run.
//
// Every tactic has four cases behind it, not one. A run surfaces one of them, chosen so that a
// player who has already read a case gets a different one next time — the point of having four
// is that the second playthrough teaches you something the first did not. The rest stay readable
// from the Dossier at any time.
//
// The choice is deterministic in the run seed, so the same seed always tells the same story and a
// reload mid-run does not swap the case out from under the player.

import content from '../sim/content.js';

const SEEN_KEY = 'monopole.cases.v1';

let seed = 1;
let picked = null;

export function poolFor(tacticId) {
  return content.all('story').filter(s => s.tactic === tacticId);
}

// Reset the run's selection. Called on a new game; safe to call more than once with the same seed.
export function newRun(runSeed = 1) {
  if (picked && seed === runSeed) return picked;
  seed = runSeed;
  picked = {};
  const seen = seenEver();
  const rng = rand(runSeed * 2654435761);
  for (const t of content.all('tactic')) {
    const pool = poolFor(t.id);
    if (!pool.length) continue;
    // unread first. Once they have all been read the whole pool comes back into play, so a long
    // player keeps getting variety instead of being stuck on whichever one was last.
    const fresh = pool.filter(s => !seen.has(s.id));
    const from = fresh.length ? fresh : pool;
    picked[t.id] = from[Math.floor(rng() * from.length) % from.length].id;
  }
  return picked;
}

// The case this run is telling for a tactic, falling back to the tactic's own canonical one.
export function featured(tacticId) {
  if (!picked) newRun(seed);
  return picked[tacticId] || content.get('tactic', tacticId)?.story || null;
}

// The others behind the same tactic — what "more cases like this" offers.
export function alternatives(storyId) {
  const s = content.get('story', storyId);
  if (!s?.tactic) return [];
  return poolFor(s.tactic).filter(o => o.id !== storyId);
}

export function seenEver() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}

export function markSeen(storyId) {
  if (!storyId) return;
  const seen = seenEver();
  if (seen.has(storyId)) return;
  seen.add(storyId);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* private mode */ }
}

const rand = s => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;

export default { poolFor, newRun, featured, alternatives, seenEver, markSeen };
