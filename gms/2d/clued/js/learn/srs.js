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

// grade: 'again' | 'good' | 'easy'
export function review(card, grade, today) {
  const c = { ...card, n: (card.n || 0) + 1 };
  if (grade === 'again') {
    if (c.b > 0) c.l = (c.l || 0) + 1;
    c.b = c.b > 1 ? 1 : 0;
    c.due = today;
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

// Keep the synced blob bounded: drop the most-mastered, least-recently reviewed cards first.
export function prune(cards, cap = CARD_CAP) {
  const ids = Object.keys(cards);
  if (ids.length <= cap) return cards;
  ids.sort((a, b) => (cards[a].b - cards[b].b) || ((cards[b].r || 0) - (cards[a].r || 0)));
  const keep = {};
  for (const id of ids.slice(0, cap)) keep[id] = cards[id];
  return keep;
}
