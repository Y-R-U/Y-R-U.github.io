#!/usr/bin/env node
// Events framework checks:  node tools/events_test.mjs
import { EVENTS, status, featured, dayStart, nowFrom, standings, botPoints, ladderPlayers, freshProgress, applyRound, goalState, rankReward, timeText, endsAt, startsAt, eventHoles, holeDef, bigEvents } from '../js/events/events.js';
import { HELPERS } from '../js/meta/helpers.js';
import { SERIES, run, calendar, eventById, weekend, weekends, easter, LUNAR_NEW_YEAR, bigOn, addDays, overview, nextUp, around } from '../js/events/events.js';
import { THEME_LIST } from '../js/app/menus.js';
import { Store } from '../js/app/store.js';
import { CHESTS } from '../js/meta/economy.js';
import { COURSES } from '../js/course/holes/index.js';

let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const at = ymd => dayStart(ymd) + 12 * 3600e3;
const spooky = EVENTS.find(e => e.id.startsWith('spooky')), frost = EVENTS.find(e => e.id.startsWith('frost'));

console.log('data');
for (const ev of EVENTS) {
  ok(!!COURSES[ev.course] && ev.holes.every(id => holeDef(id, ev.course)) && eventHoles(ev).length === ev.holes.length, `${ev.id}: holes exist (${ev.holes.length})`);
  const crystals = eventHoles(ev).reduce((a, h) => a + (h.features || []).filter(f => f.type === 'pickup').length, 0);
  const curGoals = ev.goals.filter(g => g.kind === 'currency');
  ok(curGoals.every(g => g.target <= crystals), `${ev.id}: currency goals reachable (${curGoals.map(g => g.target).join(',')} of ${crystals} pickups)`);
  ok(new Set(ev.goals.map(g => g.id)).size === ev.goals.length, `${ev.id}: unique goal ids`);
  ok(dayStart(ev.start) < endsAt(ev), `${ev.id}: start before end`);
}

console.log('events2: 2027 events');
const HELPER_IDS = new Set(HELPERS.map(h => h.id));
const rewardOk = r => !!r && Object.keys(r).every(k => ['coins', 'helpers', 'chest'].includes(k)) && (r.coins ?? 0) >= 0
  && Object.entries(r.helpers || {}).every(([k, n]) => HELPER_IDS.has(k) && n > 0) && [].concat(r.chest || []).every(k => CHESTS[k]);
const KINDS = new Set(['currency', 'rounds', 'underPar', 'aces', 'points']);
for (const ev of EVENTS) {
  ok(ev.goals.every(g => KINDS.has(g.kind) && g.target > 0 && rewardOk(g.reward)) && ev.rankRewards.every(t => rewardOk(t.reward)), `${ev.id}: goal kinds, helper ids and chests are valid`);
  ok(ev.rankRewards.every((t, i, a) => !i || t.top > a[i - 1].top) && ev.rankRewards.at(-1).top >= (ev.ladder?.size ?? 29) + 1, `${ev.id}: rank tiers ascend and cover the whole board`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(ev.start) && /^\d{4}-\d{2}-\d{2}$/.test(ev.end) && ev.currency?.icon && ev.currency?.name && ev.theme, `${ev.id}: dates, currency, theme`);
}
ok(new Set(EVENTS.map(e => e.id)).size === EVENTS.length && new Set(EVENTS.map(e => e.ladder.seed)).size === EVENTS.length, 'unique event ids and ladder seeds');
const sorted = [...EVENTS].sort((a, b) => startsAt(a) - startsAt(b));
ok(sorted.every((e, i) => !i || startsAt(e) >= endsAt(sorted[i - 1])), 'no two events overlap: ' + sorted.map(e => `${e.id} ${e.start}→${e.end}`).join(' | '));
const lunar = EVENTS.find(e => e.id.startsWith('lunar')), candy = EVENTS.find(e => e.id.startsWith('candy')),
  eggs = EVENTS.find(e => e.id.startsWith('egg')), games = EVENTS.find(e => e.id.startsWith('sky-games'));
ok(lunar && candy && eggs && games, 'Lunar Lanterns, Candy Carnival, Egg Hunt and Sky Games are in the schedule');
ok(status(lunar, at('2027-02-06')) === 'live' && status(lunar, at('2027-02-20')) === 'live' && status(lunar, at('2027-01-26')) === 'upcoming', 'Lunar Lanterns live on New Year (02-06) and the Lantern Festival (02-20)');
ok(status(candy, at('2027-03-01')) === 'live' && status(candy, at('2027-02-23')) === 'upcoming' && status(candy, dayStart('2027-03-18')) === 'ended', 'Candy Carnival 02-24 → 03-17');
ok(status(eggs, at('2027-03-28')) === 'live' && status(eggs, at('2027-04-05')) === 'live' && status(eggs, dayStart('2027-04-06')) === 'ended', 'Egg Hunt live on Easter Sunday 2027-03-28, ends after 04-05');
ok(status(games, at('2027-07-01')) === 'live' && status(games, at('2027-06-25')) === 'upcoming', 'Sky Games live 2027-07-01');
const BIG = bigEvents(2026, 2028);   // events3: weekend events now sit between, so check the big-event order on its own
ok(featured(at('2027-01-10'), BIG) === lunar && featured(at('2027-02-22'), BIG) === candy && featured(at('2027-03-25'), BIG) === eggs && featured(at('2027-05-01'), BIG) === games, 'featured: next upcoming between events');
ok(['?eventdate=2027-02-06', '?eventdate=2027-03-01', '?eventdate=2027-03-28', '?eventdate=2027-07-01'].map(q => featured(nowFrom(q)).id).join() === [lunar, candy, eggs, games].map(e => e.id).join(), '?eventdate= override picks each new event as live');
ok(candy.theme === 'candy' && candy.themeFallback === 'sky', 'Candy Carnival asks for the candy theme with a sky fallback');
for (const ev of [lunar, candy, eggs, games]) {
  const fest = ev.holes.filter(id => id.startsWith('fest')).length, sky = ev.holes.filter(id => id.startsWith('sky')).length;
  ok(fest >= 3 && sky >= 1, `${ev.id}: mixes ${fest} Festival Isles + ${sky} Sky Isles holes`);
  // a strong player (one round a day, ~3 under par, all currency once) reaches the points goal and a top-10 finish
  const p = freshProgress(), par = eventHoles(ev).reduce((a, h) => a + h.par, 0);
  const pickups = eventHoles(ev).reduce((a, h) => a + h.features.filter(f => f.type === 'pickup').length, 0);
  const days = Math.round((endsAt(ev) - startsAt(ev)) / 864e5);
  for (let d = 0; d < days; d++) applyRound(p, { total: par - 3, par, aces: d % 3 === 0 ? 1 : 0, newCurrency: d ? 0 : pickups });
  const ptsGoal = ev.goals.find(g => g.kind === 'points');
  const rank = standings(ev, endsAt(ev), { name: 'Robin', points: p.points }).find(r => r.you).rank;
  ok(ev.goals.every(g => goalState(p, g).done) && rank <= 10, `${ev.id}: daily player finishes every goal (${p.points} pts vs ${ptsGoal.target}) and ranks ${rank}/30`);
  // a casual player (3 rounds, par) can finish the first goals but not the points goal
  const q = freshProgress();
  for (let d = 0; d < 3; d++) applyRound(q, { total: par, par, aces: 0, newCurrency: 3 });
  ok(goalState(q, ev.goals[0]).done && !goalState(q, ptsGoal).done, `${ev.id}: 3 casual rounds → first goal yes, points goal not yet (${q.points}/${ptsGoal.target})`);
}

console.log('calendar');
ok(status(spooky, at('2026-11-02')) === 'live', 'Spooky Open is live on 2026-11-02');
ok(status(spooky, at('2026-11-08')) === 'live' && status(spooky, dayStart('2026-11-09')) === 'ended', 'end date is inclusive (local)');
ok(status(frost, at('2026-11-02')) === 'upcoming' && status(frost, at('2026-12-25')) === 'live', 'Frost Fair upcoming, then live at Christmas');
ok(featured(at('2026-11-02')) === spooky && featured(at('2026-11-20'), BIG) === frost, 'featured: live first, else next upcoming');
ok(nowFrom('?eventdate=2026-12-03') === at('2026-12-03'), '?eventdate override');
console.log('    ' + timeText(spooky, at('2026-11-02')) + ' / ' + timeText(frost, at('2026-11-02')));

console.log('ladder');
const bots = ladderPlayers(spooky);
ok(bots.length === 29 && new Set(bots.map(b => b.name)).size === 29, '29 uniquely named players');
ok(JSON.stringify(ladderPlayers(spooky)) === JSON.stringify(bots), 'deterministic from the seed');
const days = ['2026-10-20', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-20'];
const mono = bots.every(b => days.map(d => botPoints(b, spooky, at(d))).every((v, i, a) => !i || v >= a[i - 1]));
ok(mono, 'scores only go up as the date advances');
ok(botPoints(bots[0], spooky, at('2026-11-20')) === botPoints(bots[0], spooky, endsAt(spooky)), 'scores freeze after the end');
ok(botPoints(bots[0], spooky, dayStart('2026-10-19')) === 0, 'zero before the start');
const final = standings(spooky, endsAt(spooky), { name: 'Robin', points: 0 });
console.log('    final top 3: ' + final.slice(0, 3).map(r => `${r.name} ${r.points}`).join(', ') + ` · 10th ${final[9].points} · 30th ${final[29].points}`);
ok(final[final.length - 1].you, 'a player with 0 points is last');

console.log('progress + goals');
const p = freshProgress();
const pts = applyRound(p, { total: 17, par: 19, aces: 1, newCurrency: 4 });
ok(pts === 40 + 24 + 25 + 12 && p.points === pts && p.rounds === 1 && p.bestUnder === 2, `round points ${pts}`);
ok(goalState(p, spooky.goals[0]).done && goalState(p, spooky.goals[2]).done && !goalState(p, spooky.goals[1]).done, 'goal states');
ok(rankReward(spooky, 1).top === 1 && rankReward(spooky, 7).top === 10 && rankReward(spooky, 30).top === 30, 'rank reward tiers');
const mid = standings(spooky, at('2026-11-02'), { name: 'Robin', points: 600 });
console.log(`    600 points on 2026-11-02 → rank ${mid.find(r => r.you).rank}/30`);


// ---------------------------------------------------------------- events3
console.log('events3: yearly recurrence');
ok(SERIES.length === 6 && SERIES.every(s => s.recur === 'yearly' && s.series && s.dates && !s.id && !s.start), 'all six events are yearly series (no fixed id / dates in the data)');
// the first runs are exactly the old fixed events: same ids, dates and ladder seeds (old saves + old ladders)
const OLD = { 'spooky-open-2026': ['2026-10-20', '2026-11-08', 1031], 'frost-fair-2026': ['2026-12-01', '2027-01-06', 1224],
  'lunar-lanterns-2027': ['2027-01-27', '2027-02-21', 2027], 'candy-carnival-2027': ['2027-02-24', '2027-03-17', 3141],
  'egg-hunt-2027': ['2027-03-20', '2027-04-05', 328], 'sky-games-2027': ['2027-06-26', '2027-07-18', 707] };
ok(EVENTS.map(e => e.id).join() === Object.keys(OLD).join() && EVENTS.every(e => { const o = OLD[e.id]; return e.start === o[0] && e.end === o[1] && e.ladder.seed === o[2]; }),
  'first runs keep the old ids, dates and ladder seeds');
const EASTER = { 2026: '04-05', 2027: '03-28', 2028: '04-16', 2029: '04-01', 2030: '04-21', 2031: '04-13', 2032: '03-28', 2033: '04-17', 2034: '04-09', 2035: '03-25' };
ok(Object.entries(EASTER).every(([y, md]) => easter(+y) === `${y}-${md}`), 'Easter computus 2026–2035');
const S = id => SERIES.find(s => s.series === id);
const yearsOk = [];
for (let y = 2027; y <= 2035; y++) {
  const sp = run(S('spooky-open'), y), fr = run(S('frost-fair'), y), lu = run(S('lunar-lanterns'), y), ca = run(S('candy-carnival'), y),
    eg = run(S('egg-hunt'), y), ga = run(S('sky-games'), y);
  const e = easter(y), lny = LUNAR_NEW_YEAR[y];
  const good = sp && fr && lu && ca && eg && ga
    && sp.start === `${y}-10-20` && sp.end === `${y}-11-08` && fr.start === `${y}-12-01` && fr.end === `${y + 1}-01-06`
    && ga.start === `${y}-06-26` && ga.end === `${y}-07-18`
    && eg.start <= e && e <= eg.end && status(eg, at(e)) === 'live'
    && lu.start <= lny && addDays(lny, 14) <= lu.end && status(lu, at(lny)) === 'live'
    && ca.start > lu.end && ca.end < eg.start && dayStart(ca.end) - dayStart(ca.start) >= 13 * 864e5 && dayStart(ca.end) - dayStart(ca.start) <= 23 * 864e5
    && [sp, fr, lu, ca, eg, ga].every(r => r.id === `${r.series}-${y}` && r.year === y);
  if (!good) console.log('    bad year', y, [sp, fr, lu, ca, eg, ga].map(r => r && `${r.id} ${r.start}→${r.end}`).join(' | '));
  yearsOk.push(good);
}
ok(yearsOk.every(Boolean), 'every series runs each year 2027–2035: fixed windows, Egg Hunt over Easter, Lunar over New Year + Lantern Festival, Candy (2 weeks – 24 days) between them');
console.log('    2028: ' + bigEvents(2028, 2028).map(e => `${e.series} ${e.start.slice(5)}→${e.end.slice(5)}`).join(', '));
console.log('    2035: ' + bigEvents(2035, 2035).map(e => `${e.series} ${e.start.slice(5)}→${e.end.slice(5)}`).join(', '));
ok(run(S('lunar-lanterns'), 2026) === null && run(S('sky-games'), 2026) === null && run(S('spooky-open'), 2025) === null, 'no runs before a series starts (since)');
ok(run(S('spooky-open'), 2027) === run(S('spooky-open'), 2027) && eventById('spooky-open-2027') === run(S('spooky-open'), 2027), 'runs are cached: one object per id');
const big = bigEvents(2026, 2030);
ok(big.every((e, i) => !i || startsAt(e) >= endsAt(big[i - 1])), `no big events overlap 2026–2030 (${big.length} runs)`);
const big35 = bigEvents(2026, 2040);
ok(big35.every((e, i) => !i || startsAt(e) >= endsAt(big35[i - 1])), `… nor up to 2040 (${big35.length} runs)`);
ok(new Set(big35.map(e => e.ladder.seed)).size === big35.length && new Set(big35.map(e => e.id)).size === big35.length, 'every yearly run has its own id and ladder seed');
ok(ladderPlayers(run(S('spooky-open'), 2027)).map(b => b.name).join() !== ladderPlayers(spooky).map(b => b.name).join(), '2027 Spooky Open ladder has different players from 2026');
// the template's fields read through (name, theme, goals), so data stays in one place
ok(run(S('candy-carnival'), 2031).theme === 'candy' && run(S('candy-carnival'), 2031).goals === S('candy-carnival').goals, 'runs inherit name / theme / goals from the series');

console.log('events3: saves per year, old saves');
{
  const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  // an old save (before events3): progress under the old fixed ids
  mem['skyputt.save.v1'] = JSON.stringify({ v: 1, coins: 10, events: {
    'spooky-open-2026': { currency: 9, rounds: 3, aces: 1, bestUnder: 2, points: 410, claimed: ['g1', 'g2'], rankClaimed: false, pickups: { 'sky2:0': 1 } },
    'frost-fair-2026': { currency: 0, rounds: 0, aces: 0, bestUnder: null, points: 0, claimed: [], rankClaimed: false, pickups: {} } } });
  const st = new Store();
  const old = eventById('spooky-open-2026');
  ok(old === spooky && st.eventProgress(old.id, freshProgress).points === 410 && st.eventProgress(old.id, freshProgress).claimed.length === 2, 'old save: Spooky Open 2026 progress is found under its id');
  ok(eventById('frost-fair-2026') === frost && eventById('frost-fair-2026').end === '2027-01-06', 'old save: Frost Fair 2026 resolves to its original run');
  const p27 = st.eventProgress('spooky-open-2027', freshProgress);
  ok(p27.points === 0 && p27.rounds === 0 && p27.claimed.length === 0 && !Object.keys(p27.pickups).length, 'Spooky Open 2027 starts fresh: own points, goals, pickups');
  applyRound(p27, { total: 15, par: 18, aces: 0, newCurrency: 5 }); p27.claimed.push('g1'); st.save();
  const st2 = new Store();
  ok(st2.data.events['spooky-open-2026'].points === 410 && st2.data.events['spooky-open-2027'].points === p27.points && st2.data.events['spooky-open-2027'].claimed.join() === 'g1',
    'after a 2027 round both years persist separately');
  const rk26 = standings(spooky, endsAt(spooky), { points: 410 }).find(r => r.you).rank;
  ok(rankReward(spooky, rk26) && !st2.data.events['spooky-open-2026'].rankClaimed, `2026 final rank (${rk26}) is still claimable after the 2027 run starts`);
  ok(eventById('nope') === null && eventById('spooky-open-2019') === null && eventById('weekend-aces-2026-11-14') === null, 'unknown / wrong ids resolve to nothing');
  delete globalThis.localStorage;
}

console.log('events3: weekend events');
const W = weekends('2026-11-01', '2030-12-31');
const kinds = ['windmill', 'aces', 'fewest', 'crystals'];
ok(W.length > 100 && W.every(w => w.kind === 'weekend' && kinds.includes(w.weekendKind)), `${W.length} weekend runs 2026-11 → 2030`);
ok(W.every(w => { const n = (dayStart(w.end) - dayStart(w.start)) / 864e5 + 1; const d0 = new Date(dayStart(w.start)).getDay(); return n >= 2 && n <= 3 && [5, 6].includes(d0) && new Date(dayStart(w.end)).getDay() <= 6; }),
  'each lasts 2–3 days over Fri–Sun');
const allDays = []; for (let d = '2026-11-01'; d <= '2030-12-31'; d = addDays(d, 1)) allDays.push(d);
ok(W.every(w => { for (let d = w.start; d <= w.end; d = addDays(d, 1)) if (bigOn(d)) return false; return true; }), 'a weekend event never shares a day with a big event');
const everything = calendar('2026-01-01', '2030-12-31');
ok(everything.every((e, i) => !i || startsAt(e) >= endsAt(everything[i - 1])), `nothing overlaps at all 2026–2030 (${everything.length} runs)`);
// every free weekend gets one: no Saturday is left empty
const sats = allDays.filter(d => new Date(dayStart(d)).getDay() === 6);
ok(sats.every(d => bigOn(d) || W.some(w => w.start <= d && d <= w.end)), `every Saturday has something live (${sats.length} Saturdays)`);
let gap = 0, maxGap = 0; for (const d of allDays) { const live = everything.some(e => e.start <= d && d <= e.end); gap = live ? 0 : gap + 1; maxGap = Math.max(maxGap, gap); }
ok(maxGap <= 6, `longest stretch with nothing live is ${maxGap} days (weekdays between weekend runs)`);
ok(W.every((w, i) => i < 3 || new Set(W.slice(i - 3, i + 1).map(x => x.weekendKind)).size === 4), 'kinds take turns: any 4 runs in a row are all 4 kinds');
const weekOf = W.slice(0, 60);
const usedCourses = new Set(weekOf.flatMap(w => w.holes.map(id => Object.values(COURSES).find(c => c.holes.some(h => h.id === id)).id)));
ok(Object.keys(COURSES).every(c => usedCourses.has(c)), `weekend holes come from every course in COURSES (${[...usedCourses].join(', ')})`);
const themeIdsAll = THEME_LIST.map(t => t.id);
ok(W.every(w => themeIdsAll.includes(w.theme) && w.themeFallback === 'sky') && themeIdsAll.every(t => W.some(w => w.theme === t)), `weekend themes rotate through every theme (${themeIdsAll.join(', ')})`);
ok(W.every(w => w.holes.length === eventHoles(w).length && new Set(w.holes).size === w.holes.length && w.holes.length >= 5), 'weekend holes resolve, no repeats, 5–6 a round');
ok(W.filter(w => w.weekendKind === 'windmill').every(w => eventHoles(w).every(h => h.features.some(f => f.type === 'windmill' || f.type === 'mover')) && eventHoles(w).some(h => h.features.some(f => f.type === 'windmill'))), 'Windmill Weekend: moving obstacles on every hole, a windmill in every card');
ok(W.filter(w => w.weekendKind === 'aces').every(w => eventHoles(w).every(h => h.par <= 3)), 'Ace Hunt: short holes only (par ≤ 3)');
ok(W.every(w => eventById(w.id) === w && weekend(w.id.slice(-10)) === w), 'weekend ids rebuild the same run (save keys)');
ok(new Set(W.map(w => w.ladder.seed)).size === W.length && W.every(w => !big35.some(b => b.ladder.seed === w.ladder.seed)), 'weekend ladder seeds are unique');
for (const w of W.slice(0, 8)) {
  const pick = eventHoles(w).reduce((a, h) => a + h.features.filter(f => f.type === 'pickup').length, 0);
  ok(w.goals.every(g => KINDS.has(g.kind) && rewardOk(g.reward) && (g.kind !== 'currency' || g.target <= pick)) && w.rankRewards.every(t => rewardOk(t.reward)) && w.rankRewards.at(-1).top >= w.ladder.size + 1,
    `${w.id}: ${w.theme}, ${w.start}→${w.end}, ${w.holes.join(' ')} · goals valid, currency ≤ ${pick}`);
}

console.log('events3: reward balance');
const coinsOf = r => (r?.coins || 0);
const maxCoins = ev => ev.goals.reduce((a, g) => a + coinsOf(g.reward), 0) + coinsOf(ev.rankRewards[0].reward);
const chestsOf = ev => [...ev.goals.map(g => g.reward), ev.rankRewards[0].reward].flatMap(r => [].concat(r.chest || []));
const helpersOf = ev => [...ev.goals.map(g => g.reward), ev.rankRewards[0].reward].reduce((a, r) => a + Object.values(r.helpers || {}).reduce((x, y) => x + y, 0), 0);
const wMax = Math.max(...W.map(maxCoins)), bigMin = Math.min(...SERIES.map(maxCoins));
ok(wMax <= 200 && wMax * 4 <= bigMin, `a perfect weekend pays ≤ ${wMax} coins (smallest big event ${bigMin})`);
ok(W.every(w => chestsOf(w).every(c => c === 'wood') && chestsOf(w).length <= 1 && helpersOf(w) <= 2), 'weekend chests: one wooden at most; ≤ 2 helpers');
const perYear = W.filter(w => w.year === 2027);
console.log(`    2027: ${perYear.length} weekends × ≤ ${wMax} coins = ≤ ${perYear.length * wMax} coins a year (≈ ${Math.round(perYear.length * wMax / 75)} rounds of normal income at ~75/round)`);
ok(perYear.length * wMax <= 75 * 100, 'all weekend rewards in a year are ≤ 100 rounds of normal play income');
// ladder: a keen weekend player (2 good rounds a day) makes the top 3 most weekends, one casual round doesn't
const ranks = { keen: [], casual: [] };
for (const w of W.slice(0, 40)) {
  const par = eventHoles(w).reduce((a, h) => a + h.par, 0);
  for (const [k, n, under] of [['keen', 6, 2], ['casual', 1, 0]]) {
    const p = freshProgress(); for (let i = 0; i < n; i++) applyRound(p, { total: par - under, par, aces: 0, newCurrency: i ? 0 : 8 }, w.scoring);
    ranks[k].push(standings(w, endsAt(w), { points: p.points }).find(r => r.you).rank);
    if (k === 'keen') ok.keenGoal = (ok.keenGoal ?? true) && goalState(p, w.goals.find(g => g.kind === 'points')).done;
  }
}
const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
ok(med(ranks.keen) <= 3 && med(ranks.casual) > 3 && ok.keenGoal, `weekend ladder: keen player median rank ${med(ranks.keen)}/15 (reaches the points goal), one casual round ${med(ranks.casual)}/15`);
ok(roundPointsCheck(), 'Ace Hunt scores 50 per ace, Fewest Strokes 18 per stroke under par');
function roundPointsCheck() {
  const a = W.find(w => w.weekendKind === 'aces'), f = W.find(w => w.weekendKind === 'fewest');
  const p = freshProgress(), q = freshProgress();
  return applyRound(p, { total: 15, par: 15, aces: 2, newCurrency: 0 }, a.scoring) === 40 + 100 && applyRound(q, { total: 13, par: 15, aces: 0, newCurrency: 0 }, f.scoring) === 40 + 36;
}

console.log('events3: screen data');
const o3 = overview(at('2026-11-03'));
ok(o3.live.length === 1 && o3.live[0] === spooky && o3.upcoming[0]?.kind === 'weekend' && o3.upcoming[0].start === '2026-11-13' && o3.upcoming.some(e => e === frost), 'Nov 3 2026: Spooky live; coming up: weekend Nov 13, …, Frost Fair');
const o10 = overview(at('2026-11-10'));
ok(!o10.live.length && nextUp(at('2026-11-10')).start === '2026-11-13' && o10.ended[0] === spooky, 'Nov 10: nothing live, next weekend Fri 13th, Spooky in recently ended');
ok(featured(at('2026-11-14')).kind === 'weekend' && status(featured(at('2026-11-14')), at('2026-11-14')) === 'live', 'Nov 14: the weekend event is featured live');
ok(nextUp(at('2026-11-14'), true) === frost, 'next big event after that weekend: Frost Fair');
ok(featured(nowFrom('?eventdate=2031-10-25')).id === 'spooky-open-2031', '?eventdate=2031-10-25 → Spooky Hollow Open 2031');
ok(around(at('2026-11-03')).length > 40, 'around(): a rolling year of runs');
console.log('    next 12 months: ' + calendar('2026-11-03', '2027-11-03').filter(e => e.kind !== 'weekend').map(e => `${e.name} ${e.start}→${e.end}`).join(' · '));

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
