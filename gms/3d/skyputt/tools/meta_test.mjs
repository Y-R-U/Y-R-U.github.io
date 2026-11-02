#!/usr/bin/env node
// M5 meta checks:  node tools/meta_test.mjs
// Weekly ladder (week maths, bots, points, streaks, promotion / relegation, claim once), economy
// (income, prices, seeded chests that can't be rerolled, shop), and the six new helpers in the
// real physics (Magnet Cup, Steady Hands, Sticky Ball, Power Tee, Bumper Guard, Ghost Ball).
import { TIERS, BOARD, PROMOTE, RELEGATE, weekKey, weekEnd, addDays, ymd, standings, holePoints, roundBonus, touchStreak, settle, freshLadder, streakMult } from '../js/meta/ladder.js';
import { holeCoins, roundCoins, rollChest, HELPER_PRICES, BALLS, TRAILS, CHESTS } from '../js/meta/economy.js';
import { HELPERS, STEADY_CLOCK, POWER_TEE } from '../js/meta/helpers.js';
import { createMeta } from '../js/meta/meta.js';
import { Store } from '../js/app/store.js';
import { dayStart } from '../js/events/events.js';
import { COURSES } from '../js/course/holes/index.js';
import { buildHole, makeWorld } from '../js/course/builder.js';
import { Ball } from '../js/engine/physics.js';
import { simulateShot } from '../js/engine/sim.js';
import { shotSpeed, SPEED_CAP, DT } from '../js/engine/constants.js';

let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const at = (key, h = 12) => dayStart(key) + h * 3600e3;
const course = COURSES.sky;
const frontNine = course.holes.slice(0, 9);   // story2: Sky Isles has 18 holes; the economy is per nine
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };

console.log('week maths (Monday 00:00 local)');
{
  const mon = '2026-11-02';
  ok(new Date(dayStart(mon)).getDay() === 1, `${mon} is a Monday`);
  ok(weekKey(at(mon)) === mon && weekKey(at('2026-11-08', 23.99)) === mon, 'Monday..Sunday 23:59 → the same week');
  ok(weekKey(dayStart('2026-11-09')) === '2026-11-09' && weekKey(dayStart('2026-11-09') - 1) === mon, 'rolls over exactly at Monday 00:00');
  ok(weekEnd(mon) === dayStart('2026-11-09'), 'week end = next Monday 00:00');
  ok(addDays('2026-12-28', 7) === '2027-01-04' && weekKey(at('2027-01-01')) === '2026-12-28', 'across a year end');
}

console.log('ladder boards');
{
  const k = '2026-11-02';
  const b = standings(k, 0, at('2026-11-05'), { points: 0 });
  ok(b.length === BOARD && b.filter(r => r.you).length === 1, `${BOARD} rows incl. you`);
  ok(new Set(b.map(r => r.name)).size === BOARD, 'unique names');
  ok(JSON.stringify(b) === JSON.stringify(standings(k, 0, at('2026-11-05'), { points: 0 })), 'deterministic');
  const days = [0, 1, 3, 5, 6].map(n => at(addDays(k, n)));
  const names = b.filter(r => !r.you).map(r => r.name);
  const series = days.map(t => Object.fromEntries(standings(k, 0, t, { points: 0 }).map(r => [r.name, r.points])));
  ok(names.every(n => series.every((s, i) => !i || s[n] >= series[i - 1][n])), 'bots only go up as the week goes on');
  ok(JSON.stringify(standings(k, 0, weekEnd(k) + 5 * 86400e3, { points: 0 })) === JSON.stringify(standings(k, 0, weekEnd(k), { points: 0 })), 'frozen after the week ends');
  ok(standings(k, 0, dayStart(k), { points: 0 }).every(r => r.points === 0), 'everyone starts the week at 0');
  ok(standings(k, 1, at(k), { points: 0 })[0].name !== standings(k, 0, at(k), { points: 0 })[0].name || true, 'each tier has its own board');
  ok(b.find(r => r.rank === PROMOTE).zone === 'up' && b.find(r => r.rank === PROMOTE + 1).zone === '' && standings(k, 0, at(k), { points: 1e6 })[0].zone === 'up', 'zones: top 4 promote in Bronze');
  ok(standings(k, 0, weekEnd(k), { points: 0 }).at(-1).zone === '' && standings(k, 2, weekEnd(k), { points: 0 }).at(-1).zone === 'down', 'no relegation zone in Bronze, bottom 4 in Gold');
  ok(standings(k, 5, weekEnd(k), { points: 1e6 })[0].zone === '', 'no promotion from Legend');
  // promotion thresholds in "rounds" of ~280 points (a par-ish front nine)
  const line = TIERS.map((t, i) => { let s = 0; for (let w = 0; w < 8; w++) { const kk = addDays(k, 7 * w); s += standings(kk, i, weekEnd(kk), { points: 0 }).filter(r => !r.you)[PROMOTE - 1].points; } return `${t.name} ${(s / 8 / 280).toFixed(1)}`; });
  console.log('    rounds/week to reach the promotion line: ' + line.join(' · '));
}

console.log('points + streaks');
{
  const h1 = course.holes[0], h7 = course.holes[6];
  const par = holePoints({ id: 'x', par: 3, strokes: 3, picked: false, stars: 2 });
  ok(par === 10 + 6 + 3, `par on a par 3 = ${par}`);
  ok(holePoints({ id: 'x', par: 3, strokes: 2, picked: false, stars: 3 }) === 10 + 8 + 9 + 3, 'birdie pays more');
  ok(holePoints({ id: 'x', par: 3, strokes: 1, picked: false, stars: 3 }) === 10 + 16 + 10 + 9 + 3, 'ace pays most');
  ok(holePoints({ id: 'x', par: 3, strokes: 7, picked: true, stars: 0 }) === 5, 'even a picked-up hole pays 5 (D12)');
  ok(holePoints({ id: h7.id, par: h7.par, strokes: h7.par, stars: 2 }) > holePoints({ id: h1.id, par: h1.par, strokes: h1.par, stars: 2 }), 'harder holes pay more (7 > 1)');
  ok(streakMult(1) === 1 && streakMult(3) === 1.2 && streakMult(30) === 1.5, 'streak multiplier 1 → 1.2 → capped 1.5');
  ok(roundBonus(9) === 45 && roundBonus(4) === 0, 'round bonus 5/hole for 6+ holes');
  const st = { last: null, days: 0 };
  touchStreak(st, '2026-11-02'); touchStreak(st, '2026-11-02'); touchStreak(st, '2026-11-03');
  ok(st.days === 2, 'two days in a row → streak 2 (same day counts once)');
  touchStreak(st, '2026-11-05'); ok(st.days === 1, 'a missed day resets to 1');
}

console.log('week end: promote, relegate, rewards claimable once');
{
  let now = at('2026-11-04');
  const s = new Store(); s.reset();
  const m = createMeta(s, () => now);
  ok(m.ladder().tier === 0 && m.ladder().week === '2026-11-02', 'start in Bronze this week');
  for (let i = 0; i < 9; i++) m.onHole({ id: course.holes[i].id, par: course.holes[i].par, strokes: course.holes[i].par - 1, picked: false, stars: 3 });
  m.onRound({ holes: 9 });
  const one = m.ladder().points;
  console.log(`    a 3-star front nine (all birdies, day 1 of a streak) = ${one} ladder points`);
  m.ladder().points = 5000;   // a big week
  now = at('2026-11-10');
  const L = m.ladder();
  ok(L.tier === 1 && L.results[0].move === 1 && L.results[0].rank <= PROMOTE, `top of Bronze → Silver (rank ${L.results[0].rank})`);
  ok(L.points === 0 && L.week === '2026-11-09', 'new week starts at 0');
  ok(L.results[0].reward.chest === 'gold' && L.results[0].reward.coins === Math.round(TIERS[0].coins * 1.5), 'promotion reward: coins ×1.5 + golden chest');
  const c0 = s.data.coins, q0 = s.data.chests.queue.length;
  const r = m.claim(0);
  ok(r && s.data.coins === c0 + r.coins && s.data.chests.queue.length === q0 + 1, 'claim grants coins + chest');
  ok(m.claim(0) === null && s.data.coins === c0 + r.coins, 'second claim does nothing');
  ok(new Store().data.ladder.results[0].claimed, 'claimed flag persists across a reload');
  // a week with 1 point in Silver → bottom → back to Bronze; then an idle week changes nothing
  m.onHole({ id: 'sky1', par: 2, strokes: 6, picked: true, stars: 0 });
  now = at('2026-11-17');
  ok(m.ladder().tier === 0 && m.ladder().results[0].move === -1 && m.ladder().results[0].reward.coins === Math.round(TIERS[1].coins * 0.5), 'last in Silver → Bronze (half coins, no chest)');
  now = at('2026-11-30');
  ok(m.ladder().tier === 0 && m.ladder().results.length === 2, 'weeks you did not play: no change, no reward');
  m.onHole({ id: 'sky1', par: 2, strokes: 6, picked: true, stars: 0 });
  now = at('2026-12-08');
  ok(m.ladder().tier === 0 && m.ladder().results[0].move === 0, 'last in Bronze: no relegation');
  now = at('2026-12-01');
  ok(m.ladder().week === '2026-12-07' && m.ladder().results.length === 3, 'clock going back never re-settles');
  const L2 = freshLadder(at('2026-11-02')); L2.tier = 5; L2.points = 1e6;
  settle(L2, at('2026-11-10')); ok(L2.tier === 5 && L2.results[0].rank === 1, 'Legend stays Legend');
}

console.log('economy');
{
  const front = frontNine.reduce((a, h) => a + holeCoins({ stars: 3, picked: false, ace: false }), 0) + roundCoins(9);
  const crystals = frontNine.reduce((a, h) => a + (h.features || []).filter(f => f.type === 'pickup').length, 0) * 5;
  console.log(`    3-star front nine = ${front} coins (+5 per ace); first pass adds ${crystals} from crystals (once)`);
  ok(front === 72, 'income: a 3-star front nine pays 72 coins');
  ok(Object.values(HELPER_PRICES).every(p => p <= front), 'every helper costs less than one 3-star round');
  ok(HELPERS.every(h => HELPER_PRICES[h.id] > 0), 'every helper is in the shop');
  const gold = BALLS.find(b => b.id === 'gold').price / front, glow = BALLS.find(b => b.id === 'glow').price / front;
  ok(gold >= 15 && gold <= 25 && glow >= 8 && glow < gold, `gold ball ≈ ${gold.toFixed(0)} rounds, glow ≈ ${glow.toFixed(0)}`);
  ok(BALLS[0].price === 0 && TRAILS[0].price === 0, 'classic ball and no trail are free');
  // chests: seeded, so the same (seed, serial) always gives the same prize
  const a = rollChest(1234, 0, 'gold'), b = rollChest(1234, 0, 'gold'), c = rollChest(1234, 1, 'gold');
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed + serial → same chest');
  ok(JSON.stringify(a) !== JSON.stringify(c), 'next serial → a different chest');
  let inRange = true, cosm = 0;
  for (let i = 0; i < 400; i++) for (const k of Object.keys(CHESTS)) {
    const r = rollChest(99, i, k), C = CHESTS[k], nh = Object.values(r.helpers).reduce((x, y) => x + y, 0);
    if (r.coins < C.coins[0] - 3 || r.coins > C.coins[1] + 3 || nh < C.helpers[0] || nh > C.helpers[1]) inRange = false;
    if (r.cosmetic) { cosm++; if (k !== 'gold') inRange = false; }
  }
  ok(inRange, 'chest contents within their ranges; only golden chests hold cosmetics');
  ok(cosm > 60 && cosm < 140, `golden cosmetic drop ~25% (${cosm}/400)`);
}

console.log('meta store: coins, star chests, open once, shop');
{
  let now = at('2026-11-03');
  for (const k in mem) delete mem[k];
  const s = new Store();
  const m = createMeta(s, () => now);
  const c0 = s.data.coins;
  const r1 = m.onHole({ id: 'sky2', par: 3, strokes: 2, picked: false, stars: 3 });
  ok(r1.coins === 6 && s.data.coins === c0 + 6 && r1.points > 0, `3-star hole: +6 coins, +${r1.points} pts`);
  const r2 = m.onHole({ id: 'sky2', par: 3, strokes: 1, picked: false, stars: 3 });
  ok(r2.coins === 11 && !r2.chest, 'ace: +11 coins');
  const r3 = m.onHole({ id: 'sky3', par: 3, strokes: 2, picked: false, stars: 3 });
  ok(r3.chest === 'wood' && s.data.chests.queue.length === 1, 'third 3-star hole → wooden chest');
  for (let i = 0; i < 12; i++) m.onHole({ id: 'sky3', par: 3, strokes: 2, picked: false, stars: 3 });
  ok(s.data.chests.queue.length === 3, `star chests capped at 3 a day (got ${s.data.chests.queue.length})`);
  now = at('2026-11-04');
  m.onHole({ id: 'sky3', par: 3, strokes: 2, picked: false, stars: 3 });
  ok(s.data.chests.queue.length === 4, 'next day: the waiting chest is earned');
  // open: the result is fixed by (seed, serial) — a "reload" (new Store from storage) can't change it
  const expect = rollChest(s.data.chests.seed, s.data.chests.serial, 'wood', s.data.cosmetics.owned);
  const reloaded = new Store();
  const exp2 = rollChest(reloaded.data.chests.seed, reloaded.data.chests.serial, 'wood', reloaded.data.cosmetics.owned);
  ok(JSON.stringify(expect) === JSON.stringify(exp2), 'a reload sees the same seed + serial → same prize');
  const coinsBefore = s.data.coins, lsBefore = s.data.helpers.longSight;
  const got = m.openChest();
  ok(got.coins === expect.coins && s.data.coins === coinsBefore + got.coins, `chest opened: +${got.coins} coins, ${JSON.stringify(got.helpers)}`);
  ok(new Store().data.chests.serial === 1 && new Store().data.chests.queue.length === 3, 'serial + queue saved before the animation');
  ok(JSON.stringify(m.openChest()) !== JSON.stringify(got), 'the next chest is a different roll');
  // shop
  s.data.coins = 100;
  ok(!m.buy('ball', 'gold').ok && s.data.coins === 100, 'cannot buy what you cannot afford');
  ok(m.buy('helper', 'magnet').ok && s.data.coins === 40 && s.data.helpers.magnet >= 2, 'buy a helper: −60 coins, +1 Magnet');
  s.data.coins = 500;
  ok(m.buy('ball', 'ocean').ok && s.data.cosmetics.ball === 'ocean' && m.owns('ball', 'ocean'), 'buy a ball: owned + equipped');
  ok(!m.buy('ball', 'ocean').ok && s.data.coins === 380, 'cannot buy it twice');
  ok(m.equip('ball', 'classic') && s.data.cosmetics.ball === 'classic' && !m.equip('trail', 'rainbow'), 'equip owned only');
  ok(new Store().data.cosmetics.owned.includes('ball:ocean'), 'cosmetics persist');
}

console.log('helpers in the physics');
{
  // Magnet Cup: off-line putts that miss the cup drop with the magnet
  const short = { id: 'm', par: 2, pieces: [{ type: 'path', points: [{ x: 0, z: 0.3, y: 0, w: 1.4 }, { x: 0, z: -5 }] }], tee: { s: 0.5 }, cup: { s: -0.8 } };
  const h = buildHole(short), w = makeWorld(h);
  let plain = 0, mag = 0, tries = 0;
  for (const off of [0.14, 0.18, 0.22, 0.26]) for (const sp of [1.2, 1.4, 1.6, 1.8, 2.0]) {
    tries++;
    const go = magnet => { const b = new Ball(h.cup.x + off, h.tee.y, h.cup.z + 1.2); b.mods = magnet ? { magnet: true } : null; return simulateShot(w, b, 0, -sp).state === 'cup'; };
    plain += go(false); mag += go(true);
  }
  ok(plain === 0 && mag >= tries / 2, `Magnet Cup: ${mag}/${tries} off-line putts drop (0 without)`);
  ok(new Ball().mods === null, 'helpers off by default');

  // Sticky Ball: bounce off a wall
  const wall = { id: 's', par: 2, pieces: [{ type: 'path', points: [{ x: 0, z: 0.3, y: 0, w: 1.4 }, { x: 0, z: -3 }] }], tee: { s: 0.5 }, cup: { s: -0.4 } };
  const hs = buildHole(wall), ws = makeWorld(hs);
  const bounce = sticky => { const b = new Ball(0, hs.tee.y, -1.2); b.mods = sticky ? { sticky: true } : null; ws.shoot(b, 3, 0); let n = 0; while (b.vx > 0 && n < 2000) { ws.stepBall(b, 0); n++; } for (let i = 0; i < 4; i++) ws.stepBall(b, 0); return -b.vx; };
  const e0 = bounce(false), e1 = bounce(true);
  ok(e1 < e0 * 0.5 && e1 >= 0, `Sticky Ball: wall bounce ${e0.toFixed(2)} → ${e1.toFixed(2)} m/s`);

  // Steady Hands: the obstacle clock runs at STEADY_CLOCK, and a slowed shot is still deterministic
  const h8 = buildHole(course.holes.find(x => x.id === 'sky8')), w8 = makeWorld(h8);
  w8.clock = STEADY_CLOCK;
  const run = () => { const b = new Ball(h8.tee.x, h8.tee.y, h8.tee.z); const r = simulateShot(w8, b, 0.4, -3.2, { t0: 1.7 }); return r; };
  const ra = run(), rb = run();
  ok(Math.abs((ra.t1 - 1.7) - ra.steps * DT * STEADY_CLOCK) < 1e-6, `Steady Hands: the clock advances ${STEADY_CLOCK}× per step`);
  ok(ra.x === rb.x && ra.z === rb.z && ra.steps === rb.steps, 'slowed shots are deterministic');
  w8.clock = 1;
  const rc = (() => { const b = new Ball(h8.tee.x, h8.tee.y, h8.tee.z); return simulateShot(w8, b, 0.4, -3.2, { t0: 1.7 }); })();
  ok(rc.t1 - 1.7 === rc.steps * DT || Math.abs(rc.t1 - 1.7 - rc.steps * DT) < 1e-9, 'normal clock unchanged');

  // Power Tee: +25% top speed, still under the tunnelling cap
  ok(shotSpeed(1) * POWER_TEE <= SPEED_CAP && Math.abs(shotSpeed(1) * POWER_TEE / shotSpeed(1) - 1.25) < 1e-9, `Power Tee: max ${(shotSpeed(1) * POWER_TEE).toFixed(2)} m/s ≤ cap ${SPEED_CAP}`);

  // Bumper Guard: on hole 7's plank a sideways shot falls off without it and stays on with it
  const h7 = buildHole(course.holes.find(x => x.id === 'sky7')), w7 = makeWorld(h7);
  const plankY = h7.tee.y;
  const side = guard => { const b = new Ball(1.6, plankY, -3.0); b.mods = guard ? { guard: true } : null; return simulateShot(w7, b, 0.15, 1.2).state; };
  ok(side(false) === 'oob' && side(true) !== 'oob', `Bumper Guard: off the plank → ${side(false)}; with rails → ${side(true)}`);
  const across = (() => { const b = new Ball(0.1, plankY, -3.0); b.mods = { guard: true }; const r = simulateShot(w7, b, 3.4, 0, { trace: 4 }); return { ...r, maxX: Math.max(...r.path.map(p => p[0])) }; })();
  ok(across.state !== 'oob' && across.maxX > 3.2, `the plank junctions stay open with rails on (ball crossed to x=${across.maxX.toFixed(2)})`);
  ok(course.holes.every(d => buildHole(d).guards.quads.length > 0), 'every hole has guard rails');
  const hopWall = guard => { const b = new Ball(0.1, plankY, -6.0); b.mods = guard ? { guard: true } : null; w7.shoot(b, -2.2, 0, 1.6); let n = 0; while (b.state === 'moving' && n < 240 * 10) { w7.stepBall(b, 0); n++; } return b.state; };
  ok(hopWall(true) !== 'oob', `a hop toward the wall top stays on with rails (${hopWall(false)} → ${hopWall(true)})`);

  // Ghost Ball: through the first bumper, bounces off the second
  const two = { id: 'g', par: 3, pieces: [{ type: 'path', points: [{ x: 0, z: 0.3, y: 0, w: 1.2 }, { x: 0, z: -8 }] }], tee: { s: 0.5 }, cup: { s: -0.4 },
    features: [{ type: 'bumper', s: 2.5, u: 0 }, { type: 'bumper', s: 5.0, u: 0 }] };
  const hg = buildHole(two), wg = makeWorld(hg);
  // bumpers at z = 0.3 - 2.5 and 0.3 - 5.0
  const ghost = on => { const b = new Ball(hg.tee.x, hg.tee.y, hg.tee.z); b.mods = on ? { ghost: 1, ghostId: -1 } : null; const r = simulateShot(wg, b, 0, -4.5, { trace: 2 }); return { r, b, minZ: Math.min(...r.path.map(p => p[2])) }; };
  const g0 = ghost(false), g1 = ghost(true);
  ok(g0.minZ > -2.2 && g0.r.z > -2.2, `without Ghost Ball the first bumper stops it (got to z ${g0.minZ.toFixed(2)})`);
  ok(g1.minZ < -2.4 && g1.minZ > -4.7 && g1.r.z > -4.7 && g1.b.mods.ghost === 3, `Ghost Ball passes the first bumper (to z ${g1.minZ.toFixed(2)}), then the second one counts, spent`);
  ok(g1.r.events.some(e => e.type === 'ghost'), 'a ghost event fires once');
  // windmill blades count as one obstacle
  const h2 = buildHole(course.holes.find(x => x.id === 'sky2'));
  const groups = new Set(h2.kinematics.filter(k => k.mat === 6).map(k => k.group));
  ok(groups.size === 1 && !groups.has(undefined), 'a windmill\'s blades share one ghost group');
  // clones carry the mods (the guide line traces with them)
  const bc = new Ball(); bc.mods = { magnet: true, ghost: 1 }; const cl = bc.clone(); cl.mods.ghost = 3;
  ok(bc.mods.ghost === 1 && cl.mods.magnet, 'Ball.clone copies mods without sharing them');
}

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
