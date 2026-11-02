#!/usr/bin/env node
// Story data + logic checks:  node tools/story_test.mjs
import { CHAPTERS, RANKS } from '../js/story/data/chapters.js';
import { CHARACTERS } from '../js/story/data/characters.js';
import { GOLFERS } from '../js/story/data/golfers.js';
import { COURSES } from '../js/course/holes/index.js';
import { checkGoal, leaderboard, rankOf, eventOpen, ordinal, chapterOpen, currentChapter, rivalOf, grantCosmetic } from '../js/story/career.js';
import { HELPER_BY_ID } from '../js/meta/helpers.js';
import { BALL_BY_ID, TRAIL_BY_ID } from '../js/meta/economy.js';
import { existsSync } from 'node:fs';
import { playField, stubRound } from '../js/story/opponents.js';
import { portraitSVG } from '../js/story/portrait.js';

let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };

const ANY_HOLE = id => Object.values(COURSES).flatMap(c => c.holes).find(h => h.id === id);
console.log('data');
for (const ch of CHAPTERS.filter(c => c.data)) {
  const d = ch.data, course = COURSES[d.course];
  ok(!!course, `${ch.id}: course ${d.course} exists`);
  const ids = new Set();
  for (const ev of d.events) {
    ok(!ids.has(ev.id), `${ev.id}: unique id`); ids.add(ev.id);
    ok(['lesson', 'round', 'rival', 'tournament'].includes(ev.kind), `${ev.id}: kind ${ev.kind}`);
    ok(ev.holes.every(h => ANY_HOLE(h)), `${ev.id}: holes exist (${ev.holes.join(',')})`);   // courses2: any course
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
{ const l3 = ev('muni-l3'), ace = checkGoal(l3, { total: 1, stars: 3, used: {}, rows: [{}] }), two = checkGoal(l3, { total: 2, stars: 3, used: {}, rows: [{}] });
  ok(ace.passed && ace.aceUse, 'Mulligan lesson: an ace passes and is flagged (card explains it)');
  ok(!two.passed && /tap Mulligan to take it back/.test(two.detail) && !two.aceUse, 'Mulligan lesson: 2 strokes without one fails with how-to text');
  ok(!checkGoal(l3, { total: 2, stars: 3, used: { mulligan: 1 }, rows: [{}] }).aceUse, 'using the helper is a normal pass'); }
ok(CHAPTERS.every(c => c.data.events.every(e => (e.tips || []).every(t => !/bottom|top right|bottom left/i.test(t) || /helper column/.test(t)))), 'tips never point at a wrong corner (helper tray is a column)');
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

console.log('chapters 2-6 (story2)');
{
  ok(CHAPTERS.length === 6 && CHAPTERS.every(c => c.data), 'all six tours have data');
  const COS = { ball: BALL_BY_ID, trail: TRAIL_BY_ID };
  let lastRival = 0, lastField = 0;
  for (const [k, ch] of CHAPTERS.entries()) {
    const d = ch.data;
    const themes = [d.theme, ...d.events.map(e => e.theme)].filter(Boolean);
    ok(themes.every(t => existsSync(new URL(`../js/themes/${t}/index.js`, import.meta.url))), `${ch.id}: themes exist (${[...new Set(themes)].join(',') || 'player\'s'})`);
    ok(d.events.filter(e => e.kind === 'rival').length === 1, `${ch.id}: exactly one rival`);
    ok(d.events.some(e => e.kind === 'lesson') && d.events.some(e => e.kind === 'round') && d.events.some(e => e.kind === 'tournament'), `${ch.id}: lessons, rounds and a tournament`);
    for (const ev of d.events) {
      if (ev.goal.use) ok(!!HELPER_BY_ID[ev.goal.use] && (ev.grant?.[ev.goal.use] > 0 || ev.goal.use === 'longSight' || ev.goal.use === 'mulligan'), `${ev.id}: lesson helper ${ev.goal.use} exists and is granted`);
      for (const h of Object.keys({ ...ev.grant, ...ev.reward?.helpers })) ok(!!HELPER_BY_ID[h], `${ev.id}: helper ${h} exists`);
      if (ev.reward?.cosmetic) { const [t, id] = ev.reward.cosmetic.split(':'); ok(!!COS[t]?.[id], `${ev.id}: cosmetic ${ev.reward.cosmetic} exists`); }
      const hs = ev.holes.map(ANY_HOLE);
      if (ev.goal.starsAtLeast) ok(ev.goal.starsAtLeast <= hs.length * 3, `${ev.id}: star target reachable`);
      if (ev.goal.place) ok(ev.goal.place < ev.field.length + 1, `${ev.id}: place target inside the field`);
    }
    const rv = rivalOf(d);
    ok(!!rv.reward?.cosmetic && Object.keys(rv.reward.helpers || {}).length >= 2, `${ch.id}: rival gives a cosmetic + a helper pack`);
    const rs = GOLFERS[rv.rival].skill;
    const tour = d.events.find(e => e.kind === 'tournament');
    const fs = tour.field.map(g => GOLFERS[g].skill), fmean = fs.reduce((a, b) => a + b, 0) / fs.length;
    ok(rs <= 0.9 && fs.every(x => x <= 0.9), `${ch.id}: D14 skills ≤ 0.9 (rival ${rs}, field ${Math.min(...fs).toFixed(2)}–${Math.max(...fs).toFixed(2)})`);
    ok(rs > lastRival && fmean > lastField, `${ch.id}: rival and field stronger than the tour before (${rs} > ${lastRival}, ${fmean.toFixed(2)} > ${lastField.toFixed(2)})`);
    lastRival = rs; lastField = fmean;
  }
  ok(CHAPTERS.slice(0, 3).every(c => GOLFERS[rivalOf(c.data).rival].skill <= 0.6), 'early rivals stay clearly easier (≤ 0.6)');
}

console.log('unlock gating + ranks (story2)');
{
  const st = { name: 'Ace', events: {}, chapters: {}, seen: {} };
  ok(chapterOpen(st, 0) && !chapterOpen(st, 1), 'fresh: only the Muni is open');
  st.events['muni-rival'] = { passed: true };
  ok(chapterOpen(st, 1) && !chapterOpen(st, 2), 'beating Carl opens the Club Tour (Open still to play)');
  ok(currentChapter(st) === 0, 'Mags still points at the unfinished Muni');
  ok(rankOf(st) === 'Nobody', 'no rank until the Muni is finished');
  for (const ev of CHAPTERS[0].data.events) st.events[ev.id] = { passed: true };
  st.chapters.muni = { done: true };
  ok(currentChapter(st) === 1 && rankOf(st) === 'Amateur', 'Muni done → Amateur, current tour = Club');
  for (const k of [1, 2, 3]) { st.events[rivalOf(CHAPTERS[k].data).id] = { passed: true }; st.chapters[CHAPTERS[k].id] = { done: true }; }
  ok(rankOf(st) === 'Pro' && chapterOpen(st, 4) && !chapterOpen(st, 5), 'three more tours → Pro, World Tour open, Legends locked');
  st.chapters.world = { done: true };
  ok(rankOf(st) === 'Pro', 'the World Tour gives a trophy, not a rank');
  ok(chapterOpen(st, 5), 'a finished World Tour opens the Legends');
  st.chapters.legends = { done: true };
  ok(rankOf(st) === 'Legend', 'Legends → Legend');
  // old saves (ch1 only) keep working: unknown events / chapters are simply not there
  const old = { name: 'Old', events: { 'muni-l1': { passed: true, best: 2, tries: 1 } }, chapters: {}, seen: { 'muni:intro': true } };
  ok(rankOf(old) === 'Nobody' && !chapterOpen(old, 1) && eventOpen(old, CHAPTERS[0].data, 1), 'an M3-era save loads unchanged');
  // cosmetic reward: new → owned, already owned → half price in coins
  const store = { data: { coins: 0, cosmetics: { owned: ['ball:classic', 'trail:none'] } }, addCoins(n) { this.data.coins += n; }, save() {} };
  const g1 = grantCosmetic(store, 'ball:polka', { ball: BALL_BY_ID, trail: TRAIL_BY_ID });
  const g2 = grantCosmetic(store, 'ball:polka', { ball: BALL_BY_ID, trail: TRAIL_BY_ID });
  ok(g1.coins === 0 && store.data.cosmetics.owned.includes('ball:polka') && g2.coins === BALL_BY_ID.polka.price / 2 && store.data.coins === g2.coins, 'rival cosmetic: granted once, then coins');
  ok(checkGoal(CHAPTERS[1].data.events.find(e => e.id === 'club-l2'), { total: 3, stars: 3, used: { magnet: 1 } }).passed
    && !checkGoal(CHAPTERS[1].data.events.find(e => e.id === 'club-l2'), { total: 3, stars: 3, used: {} }).detail.includes('undefined'), 'helper lessons (magnet) pass / fail with a readable reason');
}

console.log('opponents');
const holes = muni.events.find(e => e.kind === 'tournament').holes.map(id => COURSES.sky.holes.find(h => h.id === id));
const a = stubRound({ holes, golfer: { id: 'carl', ...GOLFERS.carl }, seed: 42 });
const b = stubRound({ holes, golfer: { id: 'carl', ...GOLFERS.carl }, seed: 42 });
ok(JSON.stringify(a) === JSON.stringify(b), 'stub is deterministic per seed');
const res = await playField(Object.entries(GOLFERS).filter(([id]) => muni.events.find(e => e.kind === 'tournament').field.includes(id) || id === 'pro').map(([id, g]) => ({ id, ...g })), holes, 7);
const par = holes.reduce((s, h) => s + h.par, 0);
console.log('    field over 6 holes (par ' + par + '): ' + res.map(r => `${r.name} ${r.total}`).join(', ') + `  [${res[0].source}]`);
ok(res.every(r => r.scores.length === holes.length && r.scores.every((s, i) => s >= 1 && s <= holes[i].par + 4)), 'scores within the rules');
const pro = res.find(r => r.id === 'pro'), pip = res.find(r => r.id === 'pip');
ok(pro.total < pip.total, 'The Pro beats a beginner');

// --difficulty: per tour, what it takes to win. Rival = real AI (full sims, 4 holes) over several seeds;
// tournament = the score you need for the goal place (quick mode) over several seeds. Compare with
// HUMANISH: holes_test --human=8 (planner + 2.5° aim / 5% power noise), a strong, practised player.
if (process.argv.includes('--difficulty')) {
  const HUMANISH = { sky1: 0.38, sky2: 1.0, sky3: -0.5, sky4: 0, sky5: -0.25, sky6: 0.38, sky7: 1.25, sky8: -0.63, sky9: 1.0,
    sky10: -0.44, sky11: -0.38, sky12: 0.25, sky13: -0.81, sky14: 0, sky15: -0.06, sky16: 0.31, sky17: 1.75, sky18: 1.5 };
  const N = +(process.argv.find(a => a.startsWith('--seeds='))?.split('=')[1] || 6);
  const H = ANY_HOLE;
  const rows = [];
  for (const ch of CHAPTERS) {
    for (const ev of ch.data.events.filter(e => e.kind === 'rival' || e.kind === 'tournament')) {
      const holes = ev.holes.map(H), par = holes.reduce((a, h) => a + h.par, 0);
      const hum = ev.holes.reduce((a, id) => a + HUMANISH[id], 0);
      const need = [];
      for (let k = 0; k < N; k++) {
        const ids = ev.kind === 'rival' ? [ev.rival] : ev.field;
        const f = await playField(ids.map(id => ({ id, ...GOLFERS[id] })), holes, 1000 + k * 7919);
        const tot = f.map(x => x.total).sort((a, b) => a - b);
        need.push(ev.kind === 'rival' ? tot[0] - 1 : tot[ev.goal.place - 1]);   // strictly beat the rival; ties go to you on the board
      }
      need.sort((a, b) => a - b);
      const avg = need.reduce((a, b) => a + b, 0) / N;
      rows.push(`${ev.id.padEnd(12)} ${String(holes.length).padStart(2)} holes par ${String(par).padStart(2)} · need ≤ ${(avg - par >= 0 ? '+' : '') + (avg - par).toFixed(1)} (${need.map(x => x - par).join(' ')}) · humanish ${(hum >= 0 ? '+' : '') + hum.toFixed(1)}`);
      console.log('    ' + rows[rows.length - 1]);
    }
  }
}

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
