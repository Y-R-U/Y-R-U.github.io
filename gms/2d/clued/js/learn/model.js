// Learn state in localStorage (synced keys clued.cards and clued.mastery, see CONTRACT.md).
import { read, write, KEYS } from '../core/store.js?v=202610071336';
import * as srs from './srs.js?v=202610071336';
import * as M from './mastery.js?v=202610071336';

export const today = () => srs.dayNumber();

export function getCards() {
  const d = read(KEYS.cards) || {};
  const t = today();
  const out = { v: 1, cards: d.cards || {}, decks: d.decks || [], mode: d.mode || 'auto', newDay: d.newDay || 0, newSeen: d.newSeen || 0, starDay: d.starDay || 0, stars: d.stars || 0 };
  if (out.newDay !== t) { out.newDay = t; out.newSeen = 0; }
  if (out.starDay !== t) { out.starDay = t; out.stars = 0; }
  return out;
}
export function saveCards(d) { d.cards = srs.prune(d.cards); write(KEYS.cards, d); return d; }
export function updateCards(fn) { const d = getCards(); fn(d); return saveCards(d); }

export function getMastery() {
  const d = read(KEYS.mastery) || {};
  return { v: 1, items: d.items || {} };
}
export function updateMastery(fn) { const d = getMastery(); fn(d); write(KEYS.mastery, d); return d; }

export function gradeCard(ref, grade) {
  const t = today();
  let card;
  updateCards(d => {
    const old = d.cards[ref];
    if (!old) d.newSeen++;
    card = d.cards[ref] = srs.review(old || srs.newCard(t), grade, t);
  });
  // A flashcard counts toward mastery at half the weight of a game answer.
  updateMastery(m => { m.items[ref] = M.answer(m.items[ref], grade !== 'again', t, 0.5); });
  return card;
}

export function addCards(refs, fromGame = false) {
  const t = today();
  return updateCards(d => { for (const r of refs) d.cards[r] = fromGame ? srs.missed(d.cards[r], t) : (d.cards[r] || srs.newCard(t)); });
}

export function removeCard(ref) { return updateCards(d => { delete d.cards[ref]; }); }

// Called with a finished game's result (answers + questions).
export function recordGame(result) {
  const t = today();
  let missed = [];
  updateMastery(m => { const r = M.applyGame(m.items, result, t); m.items = r.items; missed = r.missed; });
  if (missed.length) addCards([...new Set(missed)], true);
  return missed;
}

// Pack progress from stored records alone (no pack load): unseen refs count as 0.
export function packPct(packId, total, m = getMastery(), c = getCards()) {
  if (!total) return 0;
  const pre = packId + '/';
  const refs = new Set();
  for (const r of Object.keys(m.items)) if (r.startsWith(pre)) refs.add(r);
  for (const r of Object.keys(c.cards)) if (r.startsWith(pre)) refs.add(r);
  let sum = 0;
  for (const r of refs) sum += M.effective(m.items[r], c.cards[r]);
  return Math.min(100, Math.round(100 * sum / total));
}

export const itemLevel = (ref, m = getMastery(), c = getCards()) => M.level(m.items[ref], c.cards[ref]);

// deckRefs come from the chosen packs (loaded lazily by the caller).
export function summary(deckRefs = []) {
  const d = getCards();
  return srs.dueSummary(d.cards, deckRefs, today(), d.newSeen);
}

// Quick badge count without loading packs: due cards plus today's remaining new allowance if decks exist.
export function badgeCount(index) {
  const d = getCards();
  const t = today();
  let due = 0;
  const per = {};
  for (const [r, c] of Object.entries(d.cards)) {
    if (c.due <= t) due++;
    const p = r.slice(0, r.indexOf('/'));
    per[p] = (per[p] || 0) + 1;
  }
  let unseen = 0;
  for (const p of d.decks) unseen += Math.max(0, (index?.packs?.[p]?.items || 0) - (per[p] || 0));
  return due + Math.max(0, Math.min(unseen, srs.NEW_PER_DAY - d.newSeen));
}
