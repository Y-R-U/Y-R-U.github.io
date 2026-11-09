#!/usr/bin/env node
// Story data + logic checks:  node tools/story_test.mjs
import { CHAPTERS, RANKS } from '../js/story/data/chapters.js';
import { CHARACTERS } from '../js/story/data/characters.js';
import { GOLFERS } from '../js/story/data/golfers.js';
import { COURSES } from '../js/course/holes/index.js';
import { checkGoal, leaderboard, rankOf, eventOpen, ordinal, chapterOpen, currentChapter, rivalOf, grantCosmetic, courseLock, gatedCourses, battleOn, modeName, knockedOut } from '../js/story/career.js';
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
    const lines = [...(ev.before || []), ...(ev.after || []), ...(ev.lose || []), ...(ev.battle?.on || []), ...(ev.battle?.off || []), ...(ev.afterKnock || [])];
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
// story7: the HUD hint pill is one line (white-space: nowrap) — at 412 px a 66-char tip lost both ends
{ const long = CHAPTERS.flatMap(c => c.data.events.flatMap(e => [...(e.tips || []), ...(e.tipsClassic || [])])).filter(t => t.length > 54);
  ok(!long.length, `tips fit the one-line hint pill at 412 px (≤ 54 chars)${long.length ? ': ' + long.join(' | ') : ''}`); }
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
  ok(CHAPTERS.length >= 7 && CHAPTERS.every(c => c.data), `all ${CHAPTERS.length} tours have data`);
  const COS = { ball: BALL_BY_ID, trail: TRAIL_BY_ID };
  let lastRival = 0, lastField = 0;
  for (const [k, ch] of CHAPTERS.entries()) {
    const d = ch.data;
    const themes = [d.theme, ...d.events.map(e => e.theme)].filter(Boolean);
    ok(themes.every(t => existsSync(new URL(`../js/themes/${t}/index.js`, import.meta.url))), `${ch.id}: themes exist (${[...new Set(themes)].join(',') || 'player\'s'})`);
    ok(d.events.filter(e => e.kind === 'rival').length === (ch.id === 'grand' ? 3 : 1), `${ch.id}: ${ch.id === 'grand' ? 'three rivals (one per stop)' : 'exactly one rival'}`);
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
    // story7: the Grand Tour's reef / star / jungle holes suit the AI far better per skill point than the sky
    // holes, so its numbers are tuned by measured difficulty (--difficulty) and restart lower; the ramp
    // check runs inside the chapter instead (rivals rise stop by stop, below).
    if (ch.id !== 'grand') ok(rs > lastRival && fmean > lastField, `${ch.id}: rival and field stronger than the tour before (${rs} > ${lastRival}, ${fmean.toFixed(2)} > ${lastField.toFixed(2)})`);
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

console.log('chapter 7 Grand Tour (story7)');
{
  const K = CHAPTERS.findIndex(c => c.id === 'grand'), g = CHAPTERS[K].data;
  ok(K === 6 && CHAPTERS[5].id === 'legends', 'the Grand Tour comes right after the Legends');
  const rv = g.events.filter(e => e.kind === 'rival');
  ok(rv.map(e => e.rival).join() === 'pearl,nova,rocco' && rivalOf(g) === rv[2], 'rivals Pearl → Nova → Rocco; the last one (Rocco) is the gate');
  ok(rv.every((e, i) => !i || GOLFERS[e.rival].skill > GOLFERS[rv[i - 1].rival].skill), 'rival skill rises stop by stop');
  ok(rv.every(e => e.holes.length === 4 && e.goal.beat), 'each rival match: 4 holes, beat their total (ghost replay)');
  const themeOf = e => e.theme || g.theme;
  ok(['reef', 'star', 'jungle'].every(t => g.events.some(e => e.kind === 'rival' && themeOf(e) === t)), 'one rival match on each stop (reef, star, jungle themes)');
  const stopOrder = g.events.map(themeOf).filter((t, i, a) => ['reef', 'star', 'jungle'].includes(t) && a[i - 1] !== t);
  ok(stopOrder.slice(0, 3).join() === 'reef,star,jungle', `the tour travels Reef → Star → Jungle (${stopOrder.join(' → ')})`);
  // gating: the Grand Tour opens only once Mags is beaten, then events in order
  const st = { name: 'Ace', events: {}, chapters: {}, seen: {} };
  for (let k = 0; k < 5; k++) { for (const e of CHAPTERS[k].data.events) st.events[e.id] = { passed: true }; st.chapters[CHAPTERS[k].id] = { done: true }; }
  ok(!chapterOpen(st, K), 'Grand Tour locked before the final against Mags');
  st.events['leg-final'] = { passed: true };
  ok(chapterOpen(st, K) && eventOpen(st, g, 0) && !eventOpen(st, g, 1), 'beating Mags opens the Grand Tour (qualifier first)');
  ok(rankOf({ ...st, chapters: { ...st.chapters, legends: { done: true }, grand: { done: true } } }) === 'Legend', 'the Grand Tour gives a trophy, not a rank (stays Legend)');
  ok(!g.rankOnFinish && !!g.trophy, `trophy: ${g.trophy}`);
  // course locks: play the whole story in order from a fresh save; every hole's course must be open
  // when it is played (the story opens courses only by playing their gate hole, as ch4 → Hollow Woods)
  const un = {}, opens = {};
  let bad = [];
  for (const ch of CHAPTERS) for (const e of ch.data.events) {
    const lock = courseLock(un, e);
    if (lock) bad.push(`${e.id} needs ${lock.id}`);
    const before = gatedCourses(un);
    for (const id of e.holes) un[id] = true;
    for (const c of before.filter(c => !gatedCourses(un).includes(c))) opens[c] = e.id;
  }
  ok(!bad.length, `story order never plays a hole of a locked course${bad.length ? ': ' + bad.join(', ') : ''}`);
  ok(opens.woods === 'nat-r1', `Hollow Woods opens in ch4 (sky9 in ${opens.woods}) before ch5 plays it`);
  ok(opens.sugar === 'gt-qual' && opens.reef === 'gt-qual', 'the qualifier opens Sugar Summit (fest9) and Sunken Reef (sugar9)');
  ok(opens.star === 'gt-reef-rival' && opens.jungle === 'gt-star-rival', 'Pearl’s match (reef9) opens Star Station, Nova’s (star9) opens Jungle Temple');
  const ev = id => g.events.find(e => e.id === id);
  ok(courseLock({}, ev('gt-reef-l1'))?.id === 'reef' && /Sugar Summit/.test(courseLock({}, ev('gt-reef-l1')).lockedBy.note), 'a reef event on a save without sugar9 stays locked (note says how to open it)');
  ok(courseLock({}, ev('gt-qual')) === null && courseLock({ fest9: true }, { holes: ['sugar9'] }) === null && courseLock({}, { holes: ['sugar9'] })?.id === 'sugar', 'qualifier: fest9 earlier in the event opens sugar9');
  ok(courseLock({ sugar9: true }, ev('gt-star-l1'))?.id === 'star' && courseLock({ reef9: true }, ev('gt-star-l1')) === null, 'star lesson needs reef9');
  ok(courseLock({}, ev('world-r2') || CHAPTERS[4].data.events.find(e => e.id === 'world-r2'))?.id === 'woods', 'ch5 Hollow Masters needs sky9 (consistent lock check)');
  // Battle / Classic
  const battles = g.events.filter(e => e.battle);
  ok(battles.some(e => e.kind === 'rival') && battles.some(e => e.kind === 'lesson'), 'a Battle rival match and a knock-out lesson');
  for (const e of battles) {
    ok(e.battle.on.some(([, t]) => /Battle/.test(t)) && e.battle.off.some(([, t]) => /Classic/.test(t) && /Settings/.test(t)), `${e.id}: says which mode is on (Battle / Classic + Settings)`);
    ok(e.battle.on.some(([, t]) => /\+1 to (her|him|the ball’s owner)|owner/.test(t)), `${e.id}: Battle lines teach knocked out = +1 to the owner`);
    ok(e.tipsClassic?.every(t => /Classic/.test(t)) && e.tips.every(t => /Battle/.test(t)), `${e.id}: tips per mode`);
  }
  ok(battleOn({ settings: () => ({ ballHit: true }) }) && !battleOn({ settings: () => ({ ballHit: false }) }) && battleOn({ settings: () => ({}) }), 'mode follows settings.ballHit (default Battle)');
  ok(modeName(true) === 'Battle' && modeName(false) === 'Classic', 'mode names');
  ok(knockedOut({ rows: [{ notes: ['Tika Thorn: knocked out +1'] }] }, 'Tika Thorn') && !knockedOut({ rows: [{}] }, 'Tika Thorn'), 'knock-out detection from the hole notes');
  // the sparring ball parks on the Rope Bridge (fixed seed, first shot only) — if the AI changes, re-pick the seed
  const sp = ev('gt-jungle-l1').sparring, j2 = ANY_HOLE('jungle2');
  const f = await playField([{ id: sp.golfer, ...GOLFERS[sp.golfer] }], [j2], sp.seed);
  const s0 = f[0].shots?.[0]?.[0];
  ok(f[0].source === 'ai' && s0?.state === 'rest' && s0.to[2] < -3.1 && s0.to[2] > -6.1 && Math.abs(s0.to[0]) < 0.3,
    `Tika’s first shot rests out on the bridge (${s0 ? s0.to.map(v => v.toFixed(2)).join(', ') : 'none'})`);
  // rewards: in line with chapters 5-6
  const coins = e => e.reward?.coins || 0;
  ok(g.events.filter(e => e.kind === 'lesson').every(e => coins(e) >= 60 && coins(e) <= 100), 'lesson rewards 60-100 (ch5 60, ch6 80)');
  ok(rv.every(e => coins(e) >= 260 && coins(e) <= 500 && e.reward.cosmetic), 'rival rewards between The Pro (260) and Mags (500), each with a cosmetic');
  ok(coins(g.events.find(e => e.kind === 'tournament')) <= 500, 'final ≤ 500 coins');
  ok(new Set(rv.map(e => e.reward.cosmetic)).size === 3 && rv.every(e => !CHAPTERS.slice(0, K).some(c => c.data.events.some(x => x.reward?.cosmetic === e.reward.cosmetic))), 'Grand Tour cosmetics are new to the story');
  ok(g.events.every(e => (e.tips || []).concat(e.tipsClassic || []).every(t => !/bottom|top right|top left|left side|right side/i.test(t))), 'tips name no screen corner');
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
    sky10: -0.44, sky11: -0.38, sky12: 0.25, sky13: -0.81, sky14: 0, sky15: -0.06, sky16: 0.31, sky17: 1.75, sky18: 1.5,
    // story7: from notes/{reef,star,jungle}.md (holes_test --human=8)
    reef1: 0.13, reef2: 0, reef3: 0, reef4: 0.13, reef5: 0.38, reef6: 0.13, reef7: 0.63, reef8: 0.38, reef9: -0.25,
    star1: 0.13, star2: -0.13, star3: 0.06, star4: 0.38, star5: 0.38, star6: 0.13, star7: -0.25, star8: 0.75, star9: 0.38,
    jungle1: -0.19, jungle2: -0.25, jungle3: -0.13, jungle4: -0.13, jungle5: 0.5, jungle6: 0.63, jungle7: 0.63, jungle8: 0.75, jungle9: 0.38 };
  const ONLY = process.argv.find(a => a.startsWith('--chapters='))?.split('=')[1]?.split(',');
  const N = +(process.argv.find(a => a.startsWith('--seeds='))?.split('=')[1] || 6);
  const H = ANY_HOLE;
  const rows = [];
  for (const ch of CHAPTERS.filter(c => !ONLY || ONLY.includes(c.id))) {
    for (const ev of ch.data.events.filter(e => e.kind === 'rival' || e.kind === 'tournament')) {
      const holes = ev.holes.map(H), par = holes.reduce((a, h) => a + h.par, 0);
      const hum = ev.holes.reduce((a, id) => a + (HUMANISH[id] ?? 0), 0);
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
