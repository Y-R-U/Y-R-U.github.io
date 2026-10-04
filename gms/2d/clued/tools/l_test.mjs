// Lane L: SRS scheduling and mastery math. `node tools/l_test.mjs`
import * as S from '../js/learn/srs.js';
import * as M from '../js/learn/mastery.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

/* ---------- SRS ---------- */
const T = 20000;
let c = S.newCard(T);
eq([c.b, c.due], [0, T], 'new card box 0 due today');
ok(S.isDue(c, T), 'new card is due');
c = S.review(c, 'good', T);
eq([c.b, c.due, c.n], [1, T + 1, 1], 'good from 0 → box 1, due tomorrow');
ok(!S.isDue(c, T), 'not due today after good');
ok(S.isDue(c, T + 1), 'due tomorrow');
c = S.review(c, 'good', T + 1);
eq([c.b, c.due], [2, T + 3], 'box 2 → +2 days');
c = S.review(c, 'easy', T + 3);
eq([c.b, c.due], [4, T + 11], 'easy skips a box (+8 days)');
// intervals strictly grow with box
for (let b = 1; b < S.INTERVALS.length; b++) ok(S.INTERVALS[b] > S.INTERVALS[b - 1], `interval grows at box ${b}`);
// climb to the top and stay there
let top = S.newCard(T);
for (let i = 0; i < 12; i++) top = S.review(top, 'good', T);
eq(top.b, S.MAX_BOX, 'box caps at MAX_BOX');
eq(top.due, T + S.INTERVALS[S.MAX_BOX], 'top box interval');
// again: lapse back to box 1, due today, lapse counted
let lap = S.review(top, 'again', T + 40);
eq([lap.b, lap.due, lap.l], [1, T + 40, 1], 'again from top → box 1 today, 1 lapse');
let lap0 = S.review(S.newCard(T), 'again', T);
eq([lap0.b, lap0.l], [0, 0], 'again on a new card stays box 0 with no lapse');
// game miss
const gm = S.missed(null, T);
eq([gm.b, gm.due, gm.g], [0, T, 1], 'game miss makes a due card flagged g');
const gm2 = S.missed({ b: 4, due: T + 9, n: 3, l: 0, a: T - 10 }, T);
eq([gm2.b, gm2.due, gm2.l], [1, T, 1], 'game miss knocks box 4 back to 1 and due today');
ok(!('g' in S.review(gm, 'good', T)), 'a correct review clears the game flag');
// summary + queue
const cards = { 'p/a': { b: 1, due: T - 2 }, 'p/b': { b: 3, due: T }, 'p/c': { b: 5, due: T + 5 }, 'q/x': { b: 0, due: T - 5 } };
const deck = ['p/a', 'p/b', 'p/c', 'p/d', 'p/e', 'p/f'];
const sum = S.dueSummary(cards, deck, T, 0);
eq([sum.due, sum.unseen, sum.fresh, sum.total, sum.mastered], [3, 3, 3, 6, 1], 'summary counts');
eq(S.dueSummary(cards, deck, T, S.NEW_PER_DAY - 1).fresh, 1, 'new allowance shrinks with newSeen');
eq(S.dueSummary(cards, deck, T, S.NEW_PER_DAY + 5).fresh, 0, 'never negative fresh');
eq(S.buildQueue(cards, deck, T, 2), ['q/x', 'p/a', 'p/b', 'p/d', 'p/e'], 'queue: oldest due first, then new in deck order');
eq(S.buildQueue(cards, deck, T, 9, 2), ['q/x', 'p/a'], 'queue respects limit');
// day numbers are local days
ok(S.dayNumber(Date.UTC(2026, 9, 5, 12)) + 1 === S.dayNumber(Date.UTC(2026, 9, 6, 12)), 'dayNumber increments per day');
// prune keeps low boxes
const many = {};
for (let i = 0; i < 10; i++) many['p/' + i] = { b: i % 7, due: T, r: i };
const pr = S.prune(many, 5);
ok(Object.keys(pr).length === 5 && Object.values(pr).every(x => x.b <= 2), 'prune drops the most-mastered cards');

/* ---------- mastery ---------- */
let r = M.answer(null, true, T);
ok(Math.abs(r.s - M.GAIN) < 1e-9 && r.c === 1 && r.w === 0, 'first right answer = GAIN');
r = M.answer(r, true, T);
ok(Math.abs(r.s - (M.GAIN + (1 - M.GAIN) * M.GAIN)) < 0.002, 'second right closes the gap');
const before = r.s;
r = M.answer(r, false, T);
ok(Math.abs(r.s - before * (1 - M.LOSS)) < 0.002 && r.w === 1, 'wrong answer halves');
let streak = null, n = 0;
while (M.level(streak) < 3) { streak = M.answer(streak, true, T); n++; }
eq(n, 4, 'four right answers in a row reach mastered');
ok(M.answer(null, true, T, 0.5).s < M.answer(null, true, T).s, 'half weight gains less');
eq(M.level(null, null), 0, 'unseen level 0');
eq(M.level({ s: 0.1, c: 0, w: 1 }), 1, 'seen level 1');
eq(M.level({ s: 0.5 }), 2, 'learning level 2');
eq(M.level(null, { b: 4 }), 3, 'box 4 card counts as learned');
eq(M.effective({ s: 0.3 }, { b: 3 }), 0.6, 'effective = max(score, box score)');
const prog = M.packProgress(['p/a', 'p/b', 'p/c', 'p/d'], { 'p/a': { s: 1 }, 'p/b': { s: 0.5 } }, { 'p/c': { b: 2 } });
eq([prog.pct, prog.mastered, prog.learning, prog.seen, prog.total], [48, 1, 2, 0, 4], 'pack progress');
eq(M.packProgress([], {}, {}).pct, 0, 'empty pack is 0%');
// subjects from a question
eq(M.subjectRefs({ format: 'mc', refs: ['p/a', 'p/b', 'p/c'] }), ['p/a'], 'mc: only the target is the subject');
eq(M.subjectRefs({ format: 'order', refs: ['p/a', 'p/b'] }), ['p/a', 'p/b'], 'order: every ref');
eq(M.subjectRefs({ format: 'mc', refs: ['p/q:1'] }), [], 'question refs are not items');
// applying a game
const result = {
  questions: [{ id: 'q0', format: 'mc', refs: ['p/a', 'p/x'] }, { id: 'q1', format: 'tf', refs: ['p/b'] }, { id: 'q2', format: 'order', refs: ['p/c', 'p/d'] }, { id: 'q3', format: 'mc', refs: ['p/e'] }],
  answers: [{ i: 0, qid: 'q0', correct: true }, { i: 1, qid: 'q1', correct: false }, { i: 2, qid: 'q2', correct: false }, { i: 3, qid: 'q3', correct: false, skipped: true }],
  players: [{ name: 'me' }],
};
const g = M.applyGame({}, result, T);
ok(g.items['p/a']?.c === 1 && !g.items['p/x'], 'right answer credits only the subject');
ok(g.items['p/b']?.w === 1, 'wrong answer recorded');
eq(g.missed, ['p/b'], 'single-subject misses feed flashcards; order misses and skips do not');
ok(g.items['p/c'] && g.items['p/c'].s === 0 && g.items['p/c'].w === 1, 'order wrong hits every ref');
ok(!g.items['p/e'], 'skipped questions ignored');
const party = M.applyGame({}, { ...result, players: [{}, {}] }, T);
eq([Object.keys(party.items).length, party.missed.length], [0, 0], 'party games do not touch the profile');
// country scores and map bands
const cs = M.countryScores({ FRA: ['countries/france', 'flags/france'], ESP: ['countries/spain'], DEU: ['countries/germany'] },
  { 'countries/france': { s: 1 }, 'flags/france': { s: 0.8 }, 'countries/spain': { s: 0.2 } }, {});
ok(Math.abs(cs.FRA.score - 0.9) < 1e-9, 'country score is the mean over its packs');
eq([M.mapBand(cs.FRA), M.mapBand(cs.ESP), M.mapBand(cs.DEU)], [3, 1, 0], 'map bands');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
