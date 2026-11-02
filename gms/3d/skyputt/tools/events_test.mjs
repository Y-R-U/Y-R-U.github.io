#!/usr/bin/env node
// Events framework checks:  node tools/events_test.mjs
import { EVENTS, status, featured, dayStart, nowFrom, standings, botPoints, ladderPlayers, freshProgress, applyRound, goalState, rankReward, timeText, endsAt } from '../js/events/events.js';
import { COURSES } from '../js/course/holes/index.js';

let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const at = ymd => dayStart(ymd) + 12 * 3600e3;
const spooky = EVENTS.find(e => e.id.startsWith('spooky')), frost = EVENTS.find(e => e.id.startsWith('frost'));

console.log('data');
for (const ev of EVENTS) {
  const course = COURSES[ev.course];
  ok(ev.holes.every(id => course.holes.some(h => h.id === id)), `${ev.id}: holes exist`);
  const crystals = ev.holes.reduce((a, id) => a + (course.holes.find(h => h.id === id).features || []).filter(f => f.type === 'pickup').length, 0);
  const curGoals = ev.goals.filter(g => g.kind === 'currency');
  ok(curGoals.every(g => g.target <= crystals), `${ev.id}: currency goals reachable (${curGoals.map(g => g.target).join(',')} of ${crystals} pickups)`);
  ok(new Set(ev.goals.map(g => g.id)).size === ev.goals.length, `${ev.id}: unique goal ids`);
  ok(dayStart(ev.start) < endsAt(ev), `${ev.id}: start before end`);
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
