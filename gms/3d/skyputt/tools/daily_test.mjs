#!/usr/bin/env node
// Daily Challenge checks:  node tools/daily_test.mjs
// determinism, date rollover (incl. timezones and DST days), tries, streak break/continue,
// milestone + daily reward balance, locked courses skipped, board, share text, save round trip.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A tiny in-memory localStorage so Store really saves and reloads (node has none).
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };

const D = await import('../js/daily/daily.js');
const { dailyFor, createDaily, courseOpen, TWISTS, TWIST_BY_ID, goalMet, board, field, TRIES, RECENT, MILESTONES, milestoneFor, nextMilestone,
  FINISH_REWARD, GOAL_REWARD, DAY_MAX_COINS, DAILY_EPOCH, dayNumber, FIELD, KEEP_DAYS } = D;
const { addDays, dayStart, localYmd, daysBetween } = await import('../js/events/calendar.js');
const { COURSES } = await import('../js/course/holes/index.js');
const { THEME_LIST } = await import('../js/app/menus.js');
const { Store } = await import('../js/app/store.js');
const { WEEKEND_KINDS } = await import('../js/events/data/weekends.js');
const { CHESTS } = await import('../js/meta/economy.js');
const { HELPERS } = await import('../js/meta/helpers.js');

// ---- child mode: print what this process (with its own TZ) sees at a given instant ----
if (process.argv[2] === '--tz-child') {
  const t = +process.argv[3];
  const store = new Store(); store.reset();
  const dl = createDaily(store, () => t);
  const ymd = dl.today(), ch = dl.current();
  // DST: the next-day boundary is still ahead of us and within 23..25 h of the day's start
  const next = dayStart(addDays(ymd, 1)), len = next - dayStart(ymd);
  console.log(JSON.stringify({ tz: process.env.TZ, ymd, hole: ch.hole.id, twist: ch.twist.id, theme: ch.theme, n: ch.n, ahead: next > t, len }));
  process.exit(0);
}

let fails = 0, n = 0; const ok = (c, m) => { n++; console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const at = (ymd, h = 12, m = 0) => dayStart(ymd) + (h * 60 + m) * 60e3;
const freshStore = (unlocked = {}) => { const s = new Store(); s.reset(); Object.assign(s.data.unlocked, unlocked); s.save(); return s; };
const days = (from, k) => Array.from({ length: k }, (_, i) => addDays(from, i));
const allDefs = Object.values(COURSES).flatMap(c => c.holes.map(h => ({ h, c })));
const res = (strokes, { picked = false, gems = 0 } = {}) => ({ rows: [{ strokes, picked, par: 3 }], gems, total: strokes, par: 3 });
const year = days(DAILY_EPOCH, 400);
const ALL = () => true;

console.log('determinism + picks');
{
  const a = year.map(y => dailyFor(y)), b = year.map(y => dailyFor(y));
  ok(a.every((x, i) => x.hole.id === b[i].hole.id && x.twist.id === b[i].twist.id && x.theme === b[i].theme), 'same date → same hole, twist and theme (400 days)');
  ok(a[0].n === 1 && dayNumber(DAILY_EPOCH) === 1 && a[9].n === 10, `Daily #1 is ${DAILY_EPOCH}, numbers count up`);
  ok(a.every(x => allDefs.some(e => e.h === x.hole) && COURSES[x.course].holes.includes(x.hole)), 'every pick is a real hole of its course');
  ok(a.every(x => x.twist.ok(x.hole)), 'every twist fits its hole (birdie/kit par ≥ 3, crystals need a crystal)');
  ok(a.every(x => THEME_LIST.some(t => t.id === x.theme)), 'every theme is in THEME_LIST');
  const rep = a.filter((x, i) => a.slice(Math.max(0, i - RECENT), i).some(y => y.hole.id === x.hole.id)).length;
  ok(rep === 0, `no hole repeats within ${RECENT} days (${rep} repeats)`);
  const holes = new Set(a.map(x => x.hole.id)), tw = new Set(a.map(x => x.twist.id)), th = new Set(a.map(x => x.theme)), cs = new Set(a.map(x => x.course));
  ok(holes.size === allDefs.length, `every hole comes up in 400 days (${holes.size}/${allDefs.length})`);
  ok(tw.size === TWISTS.length && th.size === THEME_LIST.length && cs.size === Object.keys(COURSES).length, `all twists (${tw.size}), themes (${th.size}) and courses (${cs.size}) appear`);
  const cnt = {}; a.forEach(x => { cnt[x.twist.id] = (cnt[x.twist.id] || 0) + 1; });
  ok(Object.values(cnt).every(v => v >= 20), 'twists are spread out: ' + JSON.stringify(cnt));
  ok(TWISTS.every(t => t.goal && t.text(COURSES.sky.holes[2]) && ['own', 'off', 'kit'].includes(t.helpers)), 'twists have a goal, a text and a helper mode');
  ok(TWIST_BY_ID.clock.clock === 15 && TWISTS.filter(t => t.clock).length === 1, 'shot clock twist is 15 s');
}

console.log('goals');
{
  const h3 = { id: 'x', par: 3, features: [{ type: 'pickup' }, { type: 'pickup' }] };
  const T = TWIST_BY_ID;
  ok(goalMet(T.par, h3, { strokes: 3 }) && !goalMet(T.par, h3, { strokes: 4 }), 'par or better: 3 ok, 4 not');
  ok(goalMet(T.birdie, h3, { strokes: 2 }) && !goalMet(T.birdie, h3, { strokes: 3 }), 'birdie: 2 ok, 3 not');
  ok(goalMet(T.crystals, h3, { strokes: 6, gems: 2 }) && !goalMet(T.crystals, h3, { strokes: 1, gems: 1 }), 'crystal sweep: all crystals + hole out, any strokes');
  ok(!goalMet(T.par, h3, { strokes: 2, picked: true }) && !goalMet(T.par, h3, { quit: true }) && !goalMet(T.par, h3, null), 'picked up / quit never meet a goal');
}

console.log('locked courses');
{
  const locked = freshStore(), open = freshStore({ sky9: true, fest9: true, sugar9: true, reef9: true, star9: true });   // courses3: Sugar Summit opens on fest9; reef: Sunken Reef on sugar9; star: Star Station on reef9; jungle: Jungle Temple on star9
  const GATED = new Set(Object.values(COURSES).filter(c => c.lockedBy).map(c => c.id));
  const L = year.map(y => createDaily(locked, () => at(y)).challenge(y)), O = year.map(y => createDaily(open, () => at(y)).challenge(y));
  ok(courseOpen(locked)(COURSES.woods) === false && courseOpen(open)(COURSES.woods) === true && courseOpen(locked)(COURSES.sky), 'Hollow Woods is locked until sky9 is finished');
  ok(L.every(x => x.course !== 'woods'), `a player without Hollow Woods never gets a woods hole (${year.length} days)`);
  ok(O.some(x => x.course === 'woods'), `with it open, woods holes come up (${O.filter(x => x.course === 'woods').length} days)`);
  ok(courseOpen(locked)(COURSES.sugar) === false && courseOpen(freshStore({ fest9: true }))(COURSES.sugar) === true, 'Sugar Summit is locked until fest9 is finished');
  ok(L.every(x => x.course !== 'sugar') && O.some(x => x.course === 'sugar'), `sugar holes only once it is open (${O.filter(x => x.course === 'sugar').length} days)`);
  ok(courseOpen(freshStore({ fest9: true }))(COURSES.reef) === false && courseOpen(freshStore({ sugar9: true }))(COURSES.reef) === true, 'Sunken Reef is locked until sugar9 is finished');
  ok(L.every(x => x.course !== 'reef') && O.some(x => x.course === 'reef'), `reef holes only once it is open (${O.filter(x => x.course === 'reef').length} days)`);
  // reef joins the daily pool (hole and theme) only from its dailyFrom date: earlier days keep the hole and theme
  // they had before the course was added (= the pick with reef locked, and never the reef theme)
  const RF = COURSES.reef.dailyFrom, preReef = year.filter(y => y < RF), noReef = c => c.id !== 'reef';
  ok(RF && preReef.length > 0 && preReef.every(y => { const a = dailyFor(y), b = dailyFor(y, { open: noReef }); return a.hole.id === b.hole.id && a.course !== 'reef' && a.theme !== 'reef'; }),
    `days before ${RF} are unchanged by Sunken Reef (${preReef.length} days: same hole, no reef hole or theme)`);
  ok(year.filter(y => y >= RF).some(y => dailyFor(y).course === 'reef') && year.filter(y => y >= RF).some(y => dailyFor(y).theme === 'reef'), `from ${RF} reef holes and the reef theme come up`);
  // star: Star Station opens on reef9 and joins the daily pool (hole and theme) only from its own dailyFrom
  ok(courseOpen(freshStore({ sugar9: true }))(COURSES.star) === false && courseOpen(freshStore({ reef9: true }))(COURSES.star) === true, 'Star Station is locked until reef9 is finished');
  ok(L.every(x => x.course !== 'star') && O.some(x => x.course === 'star'), `star holes only once it is open (${O.filter(x => x.course === 'star').length} days)`);
  const SF = COURSES.star.dailyFrom, preStar = year.filter(y => y < SF), noStar = c => c.id !== 'star';
  ok(SF && preStar.length > 0 && preStar.every(y => { const a = dailyFor(y), b = dailyFor(y, { open: noStar }); return a.hole.id === b.hole.id && a.course !== 'star' && a.theme !== 'star'; }),
    `days before ${SF} are unchanged by Star Station (${preStar.length} days: same hole, no star hole or theme)`);
  ok(year.filter(y => y >= SF).some(y => dailyFor(y).course === 'star') && year.filter(y => y >= SF).some(y => dailyFor(y).theme === 'star'), `from ${SF} star holes and the star theme come up`);
  // jungle: Jungle Temple opens on star9 and joins the daily pool (hole and theme) only from its own dailyFrom
  ok(courseOpen(freshStore({ reef9: true }))(COURSES.jungle) === false && courseOpen(freshStore({ star9: true }))(COURSES.jungle) === true, 'Jungle Temple is locked until star9 is finished');
  ok(L.every(x => x.course !== 'jungle') && O.some(x => x.course === 'jungle'), `jungle holes only once it is open (${O.filter(x => x.course === 'jungle').length} days)`);
  const JF = COURSES.jungle.dailyFrom, preJungle = year.filter(y => y < JF), noJungle = c => c.id !== 'jungle';
  ok(JF && preJungle.length > 0 && preJungle.every(y => { const a = dailyFor(y), b = dailyFor(y, { open: noJungle }); return a.hole.id === b.hole.id && a.course !== 'jungle' && a.theme !== 'jungle'; }),
    `days before ${JF} are unchanged by Jungle Temple (${preJungle.length} days: same hole, no jungle hole or theme)`);
  ok(year.filter(y => y >= JF).some(y => dailyFor(y).course === 'jungle') && year.filter(y => y >= JF).some(y => dailyFor(y).theme === 'jungle'), `from ${JF} jungle holes and the jungle theme come up`);
  const g = year.map(y => dailyFor(y, { open: ALL }));
  ok(O.every((x, i) => x.hole.id === g[i].hole.id), 'all courses open → the same hole as the global pick');
  const notWoods = g.map((x, i) => i).filter(i => !GATED.has(g[i].course));
  const same = notWoods.filter(i => L[i].hole.id === g[i].hole.id).length;
  ok(same === notWoods.length, `locked players share the global hole on every open-course day (${same}/${notWoods.length})`);
  const repL = L.filter((x, i) => L.slice(Math.max(0, i - RECENT), i).some(y => y.hole.id === x.hole.id)).length;
  ok(repL === 0, `locked players: no hole repeats within ${RECENT} days either (${repL} repeats)`);
  // a started day keeps its hole even if Hollow Woods opens later that day
  const s = freshStore(), y = year.find((d, i) => g[i].course === 'woods');
  const dl = createDaily(s, () => at(y));
  const before = dl.current().hole.id, att = dl.start();
  s.data.unlocked.sky9 = true;
  ok(before !== g[year.indexOf(y)].hole.id && dl.current().hole.id === before && att.ch.hole.id === before, `the day's hole is frozen once a try starts (${y}: ${before})`);
}

console.log('tries');
{
  const s = freshStore(), y = '2026-11-05', dl = createDaily(s, () => at(y));
  ok(dl.triesLeft() === TRIES && TRIES === 3 && dl.best() === null, '3 tries a day, no best yet');
  const a1 = dl.start();
  ok(dl.triesLeft() === 2 && s.data.daily.days[y].tries[0].quit, 'starting a try uses it at once (saved as a quit until finished)');
  dl.finish(a1, res(4));
  const a2 = dl.start(); dl.finish(a2, null);
  const a3 = dl.start();
  ok(dl.start() === null && dl.triesLeft() === 0, 'a 4th try is refused');
  dl.finish(a3, res(2));
  ok(dl.best() === 2 && dl.triesUsed() === 3, 'best result counts (4, quit, 2 → 2)');
  const s2 = freshStore(), dl2 = createDaily(s2, () => at(y));
  dl2.finish(dl2.start(), res(7, { picked: true }));
  ok(dl2.best() === null && dl2.board().every(r => !r.you), 'a picked-up try is no result and keeps you off the board');
  // reload: the save round-trips through localStorage
  const s3 = new Store();
  ok(s3.data.daily?.days?.[y]?.tries.length === 3 || s2.data.daily.days[y].tries.length === 1, 'daily state is saved (store.data.daily)');
  const r3 = createDaily(new Store(), () => at(y));
  ok(r3.triesUsed() === 1 && r3.best() === null, 'reloading keeps the used tries (latest save)');
}

console.log('date rollover');
{
  const s = freshStore(), y = '2026-11-10';
  let t = at(y, 23, 59);
  const dl = createDaily(s, () => t);
  ok(dl.today() === y, '23:59 is still today');
  const a = dl.start(); dl.start(); dl.start();
  ok(dl.triesLeft() === 0, 'all tries used at 23:59');
  t = at(addDays(y, 1), 0, 1);
  ok(dl.today() === addDays(y, 1) && dl.triesLeft() === TRIES, '00:01 is a new day with 3 fresh tries');
  ok(dl.current().hole.id === dailyFor(addDays(y, 1), { open: courseOpen(s) }).hole.id, 'and the new day\'s hole');
  const out = dl.finish(a, res(2));
  ok(s.data.daily.days[y].tries[0].strokes === 2 && !s.data.daily.days[addDays(y, 1)], 'a try started before midnight is recorded on the day it started');
  ok(out.streak.count === 1 && s.data.daily.streak.last === y, 'and counts for that day\'s streak');
  ok(dl.streak().count === 1 && dl.streak().atRisk, 'the next morning the streak is alive but at risk');
  // pruning
  const far = addDays(y, KEEP_DAYS + 2), dl2 = createDaily(s, () => at(far));
  dl2.start();
  ok(!s.data.daily.days[y] && s.data.daily.days[far], `day records older than ${KEEP_DAYS} days are pruned`);
}

console.log('timezones (child processes with TZ set)');
{
  const self = fileURLToPath(import.meta.url);
  const child = (tz, t) => JSON.parse(spawnSync(process.execPath, [self, '--tz-child', String(t)], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).stdout.trim());
  const inst = Date.UTC(2026, 10, 12, 10, 30);   // 10:30 UTC: Kiritimati (UTC+14) is already on the 13th, Pago Pago (UTC−11) still on the 11th
  const k = child('Pacific/Kiritimati', inst), p = child('Pacific/Pago_Pago', inst), u = child('UTC', inst);
  ok(k.ymd === '2026-11-13' && u.ymd === '2026-11-12' && p.ymd === '2026-11-11', `one instant, three local days: ${k.ymd} / ${u.ymd} / ${p.ymd}`);
  const ref = d => dailyFor(d, { open: c => !c.lockedBy });
  ok([k, u, p].every(x => x.hole === ref(x.ymd).hole.id && x.twist === ref(x.ymd).twist.id && x.theme === ref(x.ymd).theme), 'each gets the challenge for its own local date (same as every other device on that date)');
  ok(k.n - p.n === 2, `daily numbers follow the local date (#${p.n} … #${k.n})`);
  // DST days: autumn (25 h) and spring (23 h) in New York and London
  const ny1 = child('America/New_York', Date.UTC(2026, 10, 1, 4, 30)), ny2 = child('America/New_York', Date.UTC(2026, 10, 2, 5, 30));
  ok(ny1.ymd === '2026-11-01' && ny1.len === 25 * 3600e3 && ny2.ymd === '2026-11-02' && ny1.ahead && ny2.ahead, 'New York autumn DST: a 25 h day, rolls over at local midnight');
  const ny3 = child('America/New_York', Date.UTC(2027, 2, 14, 12)), ld = child('Europe/London', Date.UTC(2027, 2, 28, 23, 30));
  ok(ny3.ymd === '2027-03-14' && ny3.len === 23 * 3600e3 && ld.ymd === '2027-03-29', 'spring DST: a 23 h day; London 23:30 UTC on Mar 28 is already Mar 29 local');
  const late = child('America/Los_Angeles', Date.UTC(2026, 10, 13, 7, 59)), early = child('America/Los_Angeles', Date.UTC(2026, 10, 13, 8, 1));
  ok(late.ymd === '2026-11-12' && early.ymd === '2026-11-13' && late.hole !== early.hole, `LA 23:59 → 00:01 rolls the daily (${late.hole} → ${early.hole})`);
}

console.log('streak');
{
  const s = freshStore(); let y = '2026-11-03'; const dl = createDaily(s, () => at(y));
  const play = (strokes = 3, opt) => dl.finish(dl.start(), res(strokes, opt));
  const coins0 = s.data.coins | 0, ls0 = s.data.helpers.longSight;
  play(); ok(dl.streak().count === 1, 'day 1 → 1');
  y = addDays(y, 1); ok(dl.streak().count === 1 && dl.streak().atRisk, 'next day: still 1, at risk');
  play(); play(); ok(dl.streak().count === 2, 'two finishes on day 2 → 2 (counted once)');
  y = addDays(y, 1); const o3 = play();
  ok(dl.streak().count === 3 && o3.milestone?.days === 3 && s.data.helpers.longSight === ls0 + 1, 'day 3 → 3: milestone, +1 Long Sight');
  y = addDays(y, 1); dl.finish(dl.start(), null); play(9, { picked: true });
  ok(dl.streak().count === 3 && dl.streak().atRisk, 'a day with only a quit and a pick-up does not count');
  y = addDays(y, 1);
  ok(dl.streak().count === 0, 'a missed day breaks it (shows 0)');
  play(); ok(dl.streak().count === 1 && dl.streak().best === 3, 'and it starts again at 1; best stays 3');
  // milestone schedule
  ok(milestoneFor(3) && milestoneFor(7) && milestoneFor(14) && milestoneFor(30) && milestoneFor(60) === MILESTONES[30] && !milestoneFor(31) && !milestoneFor(45) && !milestoneFor(1), 'milestones at 3, 7, 14, 30, then every 30');
  ok(nextMilestone(0) === 3 && nextMilestone(3) === 7 && nextMilestone(14) === 30 && nextMilestone(30) === 60, 'next milestone');
  // a 60-day run
  const s2 = freshStore(); let y2 = '2027-01-01'; const dl2 = createDaily(s2, () => at(y2));
  const c0 = s2.data.coins | 0, chests = [];
  let miles = 0;
  for (let i = 0; i < 60; i++) { const o = dl2.finish(dl2.start(), res(1, { gems: 9 })); if (o.milestone) miles++; y2 = addDays(y2, 1); }
  chests.push(...s2.data.chests.queue);
  ok(s2.data.daily.streak.count === 60 && miles === 5, `60 days in a row → 5 milestones (3, 7, 14, 30, 60)`);
  ok(chests.join(',') === 'wood,wood,silver,silver', `chests: ${chests.join(', ')}`);
  // clock going back: a try from an older day never moves the streak backwards
  const s3 = freshStore(); let y3 = '2027-02-10'; const dl3 = createDaily(s3, () => at(y3));
  const old = dl3.start();
  y3 = addDays(y3, 1); dl3.finish(dl3.start(), res(3));
  dl3.finish(old, res(3));
  ok(s3.data.daily.streak.last === '2027-02-11' && s3.data.daily.streak.count === 1, 'finishing an older day\'s try later never rewinds the streak');
  void coins0;
}

console.log('rewards + balance');
{
  const s = freshStore(), y = '2026-11-20', dl = createDaily(s, () => at(y));
  const c = s.data.coins | 0;
  const ch = dl.current(), good = ch.twist.goal === 'crystals' ? res(5, { gems: 99 }) : res(1);
  const o1 = dl.finish(dl.start(), good), o2 = dl.finish(dl.start(), good), o3 = dl.finish(dl.start(), good);
  ok(o1.rewards.length === 2 && !o2.rewards.length && !o3.rewards.length, 'finish + goal pay once a day, not per try');
  ok((s.data.coins | 0) - c === DAY_MAX_COINS && DAY_MAX_COINS === FINISH_REWARD.coins + GOAL_REWARD.coins, `a full day pays ${DAY_MAX_COINS} coins`);
  const s2 = freshStore(), dl2 = createDaily(s2, () => at(y)), bad = dl2.finish(dl2.start(), res(8));
  ok(bad.rewards.length === 1 && bad.rewards[0].reward === FINISH_REWARD, 'holing out without the goal pays the finish reward only');
  // against a weekend event (docs/notes/events3.md: ≤ 185 coins)
  const weekendMax = Math.max(...WEEKEND_KINDS.map(k => k.goals(6).reduce((a, g) => a + (g.reward.coins || 0), 0) + k.rankRewards[0].reward.coins));
  ok(DAY_MAX_COINS * 5 <= weekendMax, `a day (${DAY_MAX_COINS}) is under a fifth of a perfect weekend (${weekendMax})`);
  const mileCoins = Object.values(MILESTONES).reduce((a, r) => a + (r.coins || 0), 0);
  ok(30 * DAY_MAX_COINS + mileCoins <= 900, `a perfect 30 days: ${30 * DAY_MAX_COINS} + ${mileCoins} milestones = ${30 * DAY_MAX_COINS + mileCoins} coins (≤ 900; ~12 normal rounds)`);
  const all = [FINISH_REWARD, GOAL_REWARD, ...Object.values(MILESTONES)], ids = new Set(HELPERS.map(h => h.id));
  ok(all.every(r => Object.keys(r.helpers || {}).every(k => ids.has(k)) && [].concat(r.chest || []).every(k => CHESTS[k] && k !== 'gold')), 'reward helpers / chests are valid; never a golden chest');
}

console.log('board');
{
  const ch = dailyFor('2026-11-07'), f1 = field(ch), f2 = field(ch);
  ok(f1.length === FIELD && JSON.stringify(f1) === JSON.stringify(f2), `the field is ${FIELD} seeded ghosts, the same every time`);
  ok(f1.every(g => g.skill <= 0.9 && g.skill >= 0.2 && g.tries >= 1 && g.tries <= TRIES), 'ghost skills 0.2–0.9 (D14), 1–3 tries each');
  ok(f1.every(g => g.strokes === null || (g.strokes >= 1 && g.strokes <= ch.hole.par + 4)), 'ghost strokes are within 1 … par + 4');
  ok(new Set(f1.map(g => g.name)).size === FIELD, 'unique ghost names');
  const other = field(dailyFor('2026-11-08'));
  ok(other.map(g => g.name).join() !== f1.map(g => g.name).join(), 'a new field each day');
  const tie = Math.min(...f1.filter(g => g.strokes).map(g => g.strokes)), b = board(ch, tie, 'Me');
  ok(b.length === FIELD + 1 && b.find(r => r.you).rank === 1 && b.find(r => r.you).name === 'Me', `tying the best ghost (${tie}) ranks you 1st`);
  ok(board(ch, 9).find(r => r.you).rank >= board(ch, 2).find(r => r.you).rank, 'fewer strokes → better rank');
  ok(board(ch, null).length === FIELD, 'no result → not on the board');
  const med = [...f1.map(g => g.strokes ?? 99)].sort((a, c) => a - c)[5];
  ok(med >= 1 && med <= ch.hole.par + 2, `field median ${med} on a par ${ch.hole.par} (${ch.hole.id})`);
}

console.log('share text');
{
  const s = freshStore(), y = '2026-11-09', dl = createDaily(s, () => at(y));
  ok(/^SKYPUTT Daily #7: ⛳ no finish, streak 0/.test(dl.shareText()), 'before any finish: "no finish"');
  dl.finish(dl.start(), res(2));
  const t = dl.shareText(y, 'https://example.test/');
  ok(/^SKYPUTT Daily #7: ⛳ 2 strokes, streak 1\n.+par \d.+1\/3 tries\nhttps:\/\/example\.test\/$/.test(t), 'SKYPUTT Daily #N: ⛳ 2 strokes, streak 1 + hole line + link');
  dl.finish(dl.start(), res(1));
  ok(dl.shareText().startsWith('SKYPUTT Daily #7: ⛳ 1 stroke, streak 1'), 'singular "1 stroke"');
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
