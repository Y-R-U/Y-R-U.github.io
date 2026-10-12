// Picture reveal: a 5×5 grid of paper squares over an image. Points uncover squares the
// player chooses; guessing the picture from a short list early pays ink per square
// still covered; a revealed picture unlocks as an arena background.

import { hash32, mulberry32 } from './hash.js';

export const GRID = 5;
export const CELLS = GRID * GRID;
export const CHOICES = 4;

/** `answer` lives here for offline play; online, only the server holds it (docs/EVENTS.md). */
export const PICTURES = {
  heroic: { answer: 'A FLYING KICK', decoys: ['A BIRTHDAY PARTY', 'A TUG OF WAR', 'A FOOTBALL MATCH'] },
  halloween: { answer: 'A SKELETON FIGHTER', decoys: ['A SNOWMAN', 'A HAUNTED SHIP', 'A SCARECROW'] },
  dojo: { answer: 'A PAPER NINJA', decoys: ['A SAMURAI CASTLE', 'A TEA PARTY', 'A SUMO MATCH'] },
};
const POOL = Object.keys(PICTURES);

export const pictureOf = (def, eventId) => def.image || POOL[hash32(`pic|${eventId}`) % POOL.length];

export function choicesFor(eventId, pic) {
  const p = PICTURES[pic];
  const list = [p.answer, ...p.decoys.slice(0, CHOICES - 1)];
  const r = mulberry32(hash32(`choices|${eventId}`));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const fresh = () => ({ open: [], guesses: [], solved: false, bonus: 0, claimed: [] });
export const spent = (def, st) => st.open.length * def.cost;
export const left = (def, st, pts) => pts - spent(def, st);
export const complete = (st) => st.solved || st.open.length >= CELLS;
/** One guess to start, one more for every five squares opened. */
export const guessesLeft = (st) => (st.solved ? 0 : 1 + Math.floor(st.open.length / 5) - st.guesses.length);

/** Rewards owed by a state and not yet claimed. Claim by adding their `id` to `claimed`. */
export function rewardsOwed(def, st, pic) {
  const out = [];
  if (st.solved && st.bonus > 0) out.push({ id: 'bonus', kind: 'ink', amount: st.bonus });
  if (complete(st)) out.push({ id: 'background', kind: 'arenaBackground', picture: pic });
  return out.filter((r) => !st.claimed.includes(r.id));
}

export function uncover(def, st, pts, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return { st, ok: false, why: 'cell' };
  if (complete(st) || st.open.includes(cell)) return { st, ok: false, why: 'open' };
  if (left(def, st, pts) < def.cost) return { st, ok: false, why: 'points' };
  return { st: { ...st, open: [...st.open, cell] }, ok: true };
}

/** `correct` comes from the server online, or from PICTURES offline. */
export function guess(def, st, choice, correct) {
  if (guessesLeft(st) <= 0) return { st, ok: false };
  const g = { ...st, guesses: [...st.guesses, choice] };
  if (!correct) return { st: g, ok: true, right: false };
  const bonus = (CELLS - st.open.length) * def.guessBonus;
  return { st: { ...g, solved: true, bonus }, ok: true, right: true };
}
