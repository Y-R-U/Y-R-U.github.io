#!/usr/bin/env node
// Story data + logic checks:  node tools/story_test.mjs
import { CHAPTERS, RANKS } from '../js/story/data/chapters.js';
import { CHARACTERS } from '../js/story/data/characters.js';
import { GOLFERS } from '../js/story/data/golfers.js';
import { COURSES } from '../js/course/holes/index.js';
import { checkGoal, leaderboard, rankOf, eventOpen, ordinal } from '../js/story/career.js';
import { playField, stubRound } from '../js/story/opponents.js';
import { portraitSVG } from '../js/story/portrait.js';

let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };

console.log('data');
for (const ch of CHAPTERS.filter(c => c.data)) {
  const d = ch.data, course = COURSES[d.course];
  ok(!!course, `${ch.id}: course ${d.course} exists`);
  const ids = new Set();
  for (const ev of d.events) {
    ok(!ids.has(ev.id), `${ev.id}: unique id`); ids.add(ev.id);
    ok(['lesson', 'round', 'rival', 'tournament'].includes(ev.kind), `${ev.id}: kind ${ev.kind}`);
    ok(ev.holes.every(h => course.holes.some(x => x.id === h)), `${ev.id}: holes exist (${ev.holes.join(',')})`);
    const lines = [...(ev.before || []), ...(ev.after || []), ...(ev.lose || [])];
    ok(lines.every(([w]) => CHARACTERS[w]), `${ev.id}: every speaker is a character`);
    if (ev.kind === 'rival') ok(!!GOLFERS[ev.rival], `${ev.id}: rival ${ev.rival} exists`);
    if (ev.kind === 'tournament') ok(ev.field.every(g => GOLFERS[g]), `${ev.id}: field exists (${ev.field.length})`);
    ok(!!ev.goalText && !!ev.goal, `${ev.id}: has a goal`);
  }
  ok([...d.intro, ...d.outro].every(([w]) => CHARACTERS[w]), `${ch.id}: intro/outro speakers exist`);
}
ok(RANKS[0] === 'Nobody', 'ranks start at Nobody');
ok(Object.values(CHARACTERS).every(c => portraitSVG(c.portrait).startsWith('<svg')), 'every portrait renders');

console.log('goals');
const muni = CHAPTERS[0].data, ev = id => muni.events.find(e => e.id === id);
ok(checkGoal(ev('muni-l1'), { total: 3, stars: 1, used: {} }).passed, 'lesson 1: 3 strokes passes');
ok(!checkGoal(ev('muni-l1'), { total: 4, stars: 1, used: {} }).passed, 'lesson 1: 4 strokes fails');
ok(!checkGoal(ev('muni-l2'), { total: 3, stars: 3, used: { longSight: 0 } }).passed, 'lesson 2 needs Long Sight');
ok(checkGoal(ev('muni-l2'), { total: 3, stars: 3, used: { longSight: 1 } }).passed, 'lesson 2 with Long Sight passes');
ok(checkGoal(ev('muni-r1'), { total: 7, stars: 6, used: {} }).passed && !checkGoal(ev('muni-r1'), { total: 9, stars: 5, used: {} }).passed, 'round star target');
const carl = [{ name: 'Carl', total: 12 }];
ok(checkGoal(ev('muni-rival'), { total: 11, stars: 8, used: {} }, carl).passed, 'beat rival by one');
ok(!checkGoal(ev('muni-rival'), { total: 12, stars: 8, used: {} }, carl).passed, 'a tie does not beat the rival');
const field = [14, 15, 16, 17, 18, 19, 20].map((t, i) => ({ name: 'G' + i, total: t }));
ok(checkGoal(ev('muni-open'), { total: 15, stars: 10, used: {} }, field).place === 2, 'tournament place (ties go to you)');
ok(!checkGoal(ev('muni-open'), { total: 17, stars: 10, used: {} }, field).passed, '4th misses top 3');
ok(leaderboard({ total: 15 }, field)[1].you, 'leaderboard order');
ok(ordinal(1) === '1st' && ordinal(2) === '2nd' && ordinal(3) === '3rd' && ordinal(11) === '11th' && ordinal(22) === '22nd', 'ordinals');

console.log('progress');
const st = { name: 'Ace', events: {}, chapters: {}, seen: {} };
ok(rankOf(st) === 'Nobody' && eventOpen(st, muni, 0) && !eventOpen(st, muni, 1), 'fresh career: Nobody, first event open only');
st.events['muni-l1'] = { passed: true };
ok(eventOpen(st, muni, 1), 'passing an event opens the next');
st.chapters.muni = { done: true };
ok(rankOf(st) === 'Amateur', 'finishing the Muni → Amateur');

console.log('opponents');
const holes = muni.events.find(e => e.kind === 'tournament').holes.map(id => COURSES.sky.holes.find(h => h.id === id));
const a = stubRound({ holes, golfer: { id: 'carl', ...GOLFERS.carl }, seed: 42 });
const b = stubRound({ holes, golfer: { id: 'carl', ...GOLFERS.carl }, seed: 42 });
ok(JSON.stringify(a) === JSON.stringify(b), 'stub is deterministic per seed');
const res = await playField(Object.entries(GOLFERS).map(([id, g]) => ({ id, ...g })), holes, 7);
const par = holes.reduce((s, h) => s + h.par, 0);
console.log('    field over 6 holes (par ' + par + '): ' + res.map(r => `${r.name} ${r.total}`).join(', ') + `  [${res[0].source}]`);
ok(res.every(r => r.scores.length === holes.length && r.scores.every((s, i) => s >= 1 && s <= holes[i].par + 4)), 'scores within the rules');
const pro = res.find(r => r.id === 'pro'), pip = res.find(r => r.id === 'pip');
ok(pro.total < pip.total, 'The Pro beats a beginner');

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
