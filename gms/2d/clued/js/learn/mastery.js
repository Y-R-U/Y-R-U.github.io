// Mastery math. Pure: tools/l_test.mjs runs it in node.
// Per item: { c: correct, w: wrong, s: score 0..1, t: last day }. Flashcard boxes also count (see effective()).
export const GAIN = 0.34;       // a right answer closes a third of the gap to 1
export const LOSS = 0.5;        // a wrong answer halves the score
export const LEVELS = [0.4, 0.8];   // learning, mastered
export const BOX_SCORE = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1];

export function answer(rec, correct, today, weight = 1) {
  const r = rec ? { ...rec } : { c: 0, w: 0, s: 0 };
  if (correct) { r.c++; r.s = r.s + (1 - r.s) * GAIN * weight; } else { r.w++; r.s = r.s * (1 - LOSS * weight); }
  r.s = Math.round(r.s * 1000) / 1000;
  r.t = today;
  return r;
}

export const effective = (rec, card) => Math.min(rec?.s || 0, card ? BOX_SCORE[Math.min(card.b || 0, BOX_SCORE.length - 1)] : 0);

// 0 unseen, 1 seen, 2 learning, 3 mastered
export function level(rec, card) {
  const e = effective(rec, card);
  if (e >= LEVELS[1]) return 3;
  if (e >= LEVELS[0]) return 2;
  return rec || card ? 1 : 0;
}

// Pack progress over every item ref in the pack: mean effective score, plus counts by level.
export function packProgress(refs, items, cards) {
  const out = { pct: 0, mastered: 0, learning: 0, seen: 0, total: refs.length };
  if (!refs.length) return out;
  let sum = 0;
  for (const r of refs) {
    sum += effective(items[r], cards[r]);
    const lv = level(items[r], cards[r]);
    if (lv === 3) out.mastered++; else if (lv === 2) out.learning++; else if (lv === 1) out.seen++;
  }
  out.pct = Math.round(100 * sum / refs.length);
  return out;
}

// Which refs a finished question teaches: refs[0] is the subject; ordering formats are about every ref.
const ALL_REFS = new Set(['order', 'hilo', 'match', 'sort', 'connect']);
export function subjectRefs(q) {
  const refs = (q?.refs || []).filter(r => typeof r === 'string' && r.includes('/') && !r.includes('/q:'));
  if (!refs.length) return [];
  return ALL_REFS.has(q.format) ? refs : [refs[0]];
}

// Fold a finished game's answers into the item records. Returns { items, missed: [refs] }.
export function applyGame(items, result, today) {
  const next = { ...items };
  const missed = [];
  const qs = result?.questions || [];
  if ((result?.players || []).length > 1 || result?.duel) return { items: next, missed };
  for (const a of result?.answers || []) {
    if (a.skipped) continue;
    const q = qs[a.i] || qs.find(x => x.id === a.qid);
    const refs = subjectRefs(q);
    const w = refs.length > 1 ? 0.5 : 1;
    for (const r of refs) {
      next[r] = answer(next[r], !!a.correct, today, w);
      if (!a.correct && refs.length === 1) missed.push(r);
    }
  }
  return { items: next, missed };
}

// Country mastery for the world map: mean of the country/flag/capital packs that know this ISO3 code.
export function countryScores(isoRefs, items, cards) {
  const out = {};
  for (const [iso, refs] of Object.entries(isoRefs)) {
    if (!refs.length) continue;
    let s = 0, any = false;
    for (const r of refs) { s += effective(items[r], cards[r]); any = any || !!items[r] || !!cards[r]; }
    out[iso] = { score: s / refs.length, seen: any };
  }
  return out;
}

export const mapBand = c => (!c || !c.seen ? 0 : c.score >= LEVELS[1] ? 3 : c.score >= LEVELS[0] ? 2 : 1);
