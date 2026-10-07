// Leitner spaced repetition. Pure: no DOM, no storage, so tools/l_test.mjs can check it in node.
// A card is { b: box 0..MAX_BOX, due: local day number, n: reviews, l: lapses, a: day added, g: 1 if fed by a game miss }.
export const INTERVALS = [0, 1, 2, 4, 8, 16, 32];   // days until due again, indexed by box
export const MAX_BOX = INTERVALS.length - 1;
export const NEW_PER_DAY = 10;
export const CARD_CAP = 4000;

export const dayNumber = (ms = Date.now()) => {
  const d = new Date(ms);
  return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000);
};

export const newCard = (today, fromGame = false) => ({ b: 0, due: today, n: 0, l: 0, a: today, ...(fromGame ? { g: 1 } : {}) });

// grade: 'again' | 'hard' | 'good' | 'easy'. Hard keeps the box (at least 1) and repeats its interval.
export function review(card, grade, today) {
  const c = { ...card, n: (card.n || 0) + 1 };
  if (grade === 'again') {
    if (c.b > 0) c.l = (c.l || 0) + 1;
    c.b = c.b > 1 ? 1 : 0;
    c.due = today;
  } else if (grade === 'hard') {
    c.b = Math.max(1, c.b || 0);
    c.due = today + INTERVALS[c.b];
    delete c.g;
  } else {
    c.b = Math.min(MAX_BOX, (c.b || 0) + (grade === 'easy' ? 2 : 1));
    c.due = today + INTERVALS[c.b];
    delete c.g;
  }
  c.r = today;
  return c;
}

// A game miss: new card due today, or an existing card knocked back to box 1 and due today.
export function missed(card, today) {
  if (!card) return newCard(today, true);
  return { ...card, b: Math.min(card.b || 0, 1), due: Math.min(card.due ?? today, today), l: (card.l || 0) + (card.b > 1 ? 1 : 0), g: 1 };
}

export const isDue = (card, today) => !!card && card.due <= today;

// newSeen = new cards already introduced today; unseen = deck refs with no card yet.
export function dueSummary(cards, deckRefs, today, newSeen = 0) {
  let due = 0, learning = 0, mastered = 0;
  for (const c of Object.values(cards)) {
    if (c.due <= today) due++;
    if (c.b >= 5) mastered++; else if (c.b > 0) learning++;
  }
  const unseen = deckRefs.filter(r => !cards[r]).length;
  const fresh = Math.max(0, Math.min(unseen, NEW_PER_DAY - newSeen));
  return { due, fresh, total: due + fresh, learning, mastered, unseen };
}

// Order for a review session: overdue first (oldest due, lowest box), then up to `fresh` new deck refs in deck order.
export function buildQueue(cards, deckRefs, today, fresh, limit = 50) {
  const due = Object.entries(cards).filter(([, c]) => c.due <= today)
    .sort((a, b) => (a[1].due - b[1].due) || (a[1].b - b[1].b) || (a[0] < b[0] ? -1 : 1)).map(([r]) => r);
  const out = due.slice(0, limit);
  for (const r of deckRefs) {
    if (out.length >= limit || fresh <= 0) break;
    if (!cards[r]) { out.push(r); fresh--; }
  }
  return out;
}

export const packOf = ref => ref.slice(0, ref.indexOf('/'));
const byDue = (a, b) => (a[1].due - b[1].due) || (a[1].b - b[1].b) || (a[0] < b[0] ? -1 : 1);

// Per pack: { due, fresh } where fresh = today's remaining new cards (NEW_PER_DAY per pack). total = item count (or refs list).
export function packCounts(cards, totals, today, newBy = {}) {
  const out = {};
  const have = {};
  for (const [r, c] of Object.entries(cards)) {
    const p = packOf(r);
    const o = out[p] || (out[p] = { due: 0, fresh: 0 });
    have[p] = (have[p] || 0) + 1;
    if (c.due <= today) o.due++;
  }
  for (const [p, total] of Object.entries(totals)) {
    const o = out[p] || (out[p] = { due: 0, fresh: 0 });
    const unseen = Array.isArray(total) ? total.filter(r => !cards[r]).length : Math.max(0, total - (have[p] || 0));
    o.fresh = Math.max(0, Math.min(unseen, NEW_PER_DAY - (newBy[p] || 0)));
  }
  return out;
}

// A study session: due cards (only from `packs` unless it is null = every pack), then new cards round-robin across
// the packs in refsByPack, each capped at its remaining daily allowance.
export function studyQueue(cards, refsByPack, today, { packs = null, newBy = {}, limit = 40, fresh = true } = {}) {
  const sel = packs && new Set(packs);
  const out = Object.entries(cards).filter(([r, c]) => c.due <= today && (!sel || sel.has(packOf(r)))).sort(byDue).map(([r]) => r).slice(0, limit);
  if (!fresh) return out;
  const lists = Object.entries(refsByPack).filter(([p]) => !sel || sel.has(p))
    .map(([p, refs]) => ({ left: Math.max(0, NEW_PER_DAY - (newBy[p] || 0)), refs: refs.filter(r => !cards[r]), i: 0 }));
  for (let any = true; any && out.length < limit;) {
    any = false;
    for (const L of lists) {
      if (out.length >= limit) break;
      if (L.left > 0 && L.i < L.refs.length) { out.push(L.refs[L.i++]); L.left--; any = true; }
    }
  }
  return out;
}

// "Study anyway": go through the packs regardless of schedule, least-known first (unseen, then low boxes, then oldest review).
export function cramQueue(cards, refs, limit = 20, rng = Math.random) {
  const key = r => { const c = cards[r]; return c ? 1 + c.b * 100000 + (c.r || 0) / 1e6 : rng(); };
  return refs.map(r => [r, key(r)]).sort((a, b) => a[1] - b[1]).slice(0, limit).map(x => x[0]);
}

// Keep the synced blob bounded: drop the most-mastered, least-recently reviewed cards first.
export function prune(cards, cap = CARD_CAP) {
  const ids = Object.keys(cards);
  if (ids.length <= cap) return cards;
  ids.sort((a, b) => (cards[a].b - cards[b].b) || ((cards[b].r || 0) - (cards[a].r || 0)));
  const keep = {};
  for (const id of ids.slice(0, cap)) keep[id] = cards[id];
  return keep;
}
