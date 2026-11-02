#!/usr/bin/env node
// Events framework checks:  node tools/events_test.mjs
import { EVENTS, status, featured, dayStart, nowFrom, standings, botPoints, ladderPlayers, freshProgress, applyRound, goalState, rankReward, timeText, endsAt, startsAt, eventHoles, holeDef } from '../js/events/events.js';
import { HELPERS } from '../js/meta/helpers.js';
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
ok(featured(at('2027-01-10')) === lunar && featured(at('2027-02-22')) === candy && featured(at('2027-03-25')) === eggs && featured(at('2027-05-01')) === games, 'featured: next upcoming between events');
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
ok(featured(at('2026-11-02')) === spooky && featured(at('2026-11-20')) === frost, 'featured: live first, else next upcoming');
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

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
