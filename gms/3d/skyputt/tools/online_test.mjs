#!/usr/bin/env node
// Online (M6) client checks, headless:
//  1. js/net/rooms.js: hole sets, course lookup, helper inventories per mode
//  2. replay determinism: a shot played the way the game plays it (Round's fixed-step loop on its
//     own World, ball state carried between shots, helpers, shared obstacle clock) is reproduced
//     exactly by js/net/replay.js from the relayed input — on every hole
//  3. js/net/net.js against a running server (tools/server_run.sh, :8098; skipped if it's down):
//     create / join / start / shot relay / result / mulligan / scoreboard / AI seats
//   node tools/online_test.mjs [--server=http://127.0.0.1:8098/gms/3d/skyputt]
import { COURSES } from '../js/course/holes/index.js';
import { buildHole, makeWorld } from '../js/course/builder.js';
import { Ball } from '../js/engine/physics.js';
import { DT, shotSpeed } from '../js/engine/constants.js';
import { ballState } from '../js/ai/round.js';
import { Replayer, modsFor } from '../js/net/replay.js';
import { STEADY_CLOCK } from '../js/meta/helpers.js';
import { holeSets, holesFor, courseForRoom, defaultOpts, quickOpts, wireOpts, makeInventory, rankForSkill, AI_RANKS } from '../js/net/rooms.js';
import { SkyputtNet } from '../js/net/net.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('  FAIL', msg); } };
const section = s => console.log('\n' + s);

// ---------------------------------------------------------------- 1. rooms
section('rooms.js');
const sky = COURSES.sky;
const sets = holeSets('sky');
ok(sets.some(s => s.id === 'r3') && sets.some(s => s.id === '0-3'), 'hole sets include runs of 3 and random');
ok(holesFor('sky', '3-3').map(h => h.id).join() === sky.holes.slice(3, 6).map(h => h.id).join(), 'holes 4-6');
const r3 = holesFor('sky', 'r3', (() => { let i = 0; return () => [0.1, 0.5, 0.9][i++ % 3]; })());
ok(r3.length === 3 && new Set(r3.map(h => h.id)).size === 3, 'random 3 are distinct');
ok(holesFor('sky', '0-9').length === Math.min(9, sky.holes.length), 'nine holes');
const c = courseForRoom({ course: 'sky', holes: [{ id: sky.holes[2].id, par: 3 }, { id: sky.holes[0].id, par: 2 }] });
ok(c && c.holes[0] === sky.holes[2] && c.holes[1] === sky.holes[0], 'courseForRoom keeps room order');
ok(courseForRoom({ course: 'sky', holes: [{ id: 'nope99', par: 3 }] }) === null, 'unknown hole → null (update the game)');
const d = defaultOpts({ theme: 'spooky' });
ok(d.theme === 'spooky' && d.holes.length === 3 && !('holeSet' in wireOpts(d)), 'default opts / wire form');
ok(quickOpts().public === true && quickOpts().ai.count === 3, 'quick opts');
const fixed = makeInventory({ mode: 'fixed', n: 2 }, { magnet: 1, mulligan: 2 });
ok(fixed.helpers().magnet === 1 && fixed.helpers().mulligan === 0 && fixed.helpers().ghost === 2, 'fixed inventory minus rejoin uses');
ok(fixed.useHelper('magnet') && !fixed.useHelper('magnet'), 'fixed inventory runs out');
const off = makeInventory({ mode: 'off' });
ok(Object.values(off.helpers()).every(v => v === 0) && !off.useHelper('longSight'), 'off inventory is empty');
const fakeStore = { helpers: () => ({}), useHelper: () => true, giveHelper() {} };
ok(makeInventory({ mode: 'own' }, {}, fakeStore) === fakeStore, 'own inventory = the save');
ok(rankForSkill(0.9).name === 'Legend' && AI_RANKS.every(r => r.skill <= 0.9), 'ranks capped at 0.9 (D14)');

// ---------------------------------------------------------------- 2. replay determinism
section('replay determinism (every hole)');
// Play the way Round does: one World for the hole, world.time advanced by DT*clock each step,
// the same Ball object kept between shots; OOB → place at the last rest spot.
function playLikeRound(world, ball, vx, vz, { mods = null, steady = false } = {}) {
  ball.mods = mods; world.clock = steady ? STEADY_CLOCK : 1;
  world.shoot(ball, vx, vz);
  let steps = 0;
  while (ball.state === 'moving' && steps < 240 * 40) { world.stepBall(ball, world.time); ball.events.length = 0; world.time += DT * world.clock; steps++; }
  world.clock = 1; ball.mods = null;
  const st = ball.state;
  if (st === 'oob') { const r = ball.rest; ball.place(r.x, r.y, r.z); }
  return { state: st === 'cup' || st === 'oob' ? st : 'rest', to: [ball.px, ball.py, ball.pz] };
}
let shots = 0, exact = 0, worst = 0;
for (const def of sky.holes) {
  const hole = buildHole(def), world = makeWorld(hole), rep = new Replayer(hole);
  const ball = new Ball(hole.tee.x, hole.tee.y, hole.tee.z);
  world.time = 1.7;   // shared hole clock (s since the hole started)
  const cup = hole.cup;
  for (let k = 0; k < 6; k++) {
    // aim roughly at the cup with a spread, varied power; some shots with helpers
    const aim = Math.atan2(cup.x - ball.px, -(cup.z - ball.pz)) + (k - 2.5) * 0.18;
    const power = 0.35 + 0.1 * (k % 4), v = shotSpeed(power);
    const vx = Math.sin(aim) * v, vz = -Math.cos(aim) * v;
    const m = k === 2 ? { magnet: true } : k === 3 ? { steady: true, sticky: true } : k === 4 ? { guard: true, ghost: true } : {};
    const msg = { vx, vz, t0: world.time, mods: m, ball: ballState(ball) };
    const live = playLikeRound(world, ball, vx, vz, { mods: modsFor(m), steady: !!m.steady });
    const r = rep.shot(JSON.parse(JSON.stringify(msg)));   // through JSON like the wire
    const err = Math.hypot(r.to[0] - live.to[0], r.to[1] - live.to[1], r.to[2] - live.to[2]);
    shots++; if (err === 0 && r.state === live.state) exact++;
    worst = Math.max(worst, err);
    if (live.state === 'cup') { ball.place(hole.tee.x, hole.tee.y, hole.tee.z); }
    world.time += 1.3;   // think time on the shared clock
  }
}
console.log(`  ${exact}/${shots} shots replayed exactly (worst error ${worst.toExponential(2)} m)`);
ok(exact === shots, 'every relayed shot replays bit-exactly');

// ---------------------------------------------------------------- 3. net.js vs a server
section('net.js against the local server');
const BASE = args.server || 'http://127.0.0.1:8098/gms/3d/skyputt';
let up = false;
try { up = (await (await fetch(BASE + '/api/health')).json()).devAuth === true; } catch { /* down */ }
if (!up) console.log('  (skipped: no dev server at ' + BASE + ' — run tools/server_run.sh --bg)');
else {
  const stamp = Date.now().toString(36);
  const A = new SkyputtNet(), B = new SkyputtNet();
  const wa = await A.connect({ base: BASE, devUser: { uid: 'ta' + stamp, name: 'Tess' }, name: 'Tess' });
  await B.connect({ base: BASE, devUser: { uid: 'tb' + stamp, name: 'Basil' }, name: 'Basil' });
  ok(wa.you && wa.you.name === 'Tess' && A.state === 'open', 'connect + welcome');
  const opts = wireOpts({ ...defaultOpts(), helpers: { mode: 'fixed', n: 1 }, ai: { count: 1, personality: 'carl', skill: 0.3 } });
  const room = await A.createRoom(opts);
  ok(/^[A-Z2-9]{6}$/.test(room.code) && room.host === 0, 'room created with a code');
  const evs = { A: [], B: [] };
  for (const [k, n] of [['A', A], ['B', B]]) for (const t of ['room', 'shot', 'result', 'mulligan']) n.on(t, m => evs[k].push({ t, m }));
  const jr = await B.joinRoom(room.code.toLowerCase());
  ok(jr.you === 1 && jr.seats.length === 2, 'join by code');
  const wait = async (k, f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const i = evs[k].findIndex(f); if (i >= 0) return evs[k].splice(i, 1)[0].m; await new Promise(r => setTimeout(r, 20)); } throw new Error('timeout ' + k); };
  await A.start();
  const hs = await wait('B', e => e.t === 'room' && e.m.ev === 'holeStart');
  ok(hs.room.seats.length === 3 && hs.room.seats[2].kind === 'ai' && hs.room.seats[2].ai.personality === 'carl', 'start fills a ghost AI seat');
  const ball = { x: 0, y: 0.05, z: 0, sup: true, n: [0, 1, 0], surf: 0 };
  await A.shot({ hole: 0, n: 0, vx: 0.4, vz: -2.1, t0: 2.5, aim: 0.19, power: 0.4, mods: { magnet: true }, ball });
  const sh = await wait('B', e => e.t === 'shot');
  ok(sh.seat === 0 && sh.vz === -2.1 && sh.mods.magnet === true && sh.ball.sup === true, 'shot relayed with helpers + ball state');
  let err = null;
  try { await A.shot({ hole: 0, n: 1, vx: 0.4, vz: -2, t0: 3, aim: 0, power: 0.4, mods: { magnet: true }, ball }); } catch (e) { err = e; }
  ok(err?.code === 'in_flight', 'one ball at a time');
  const rr = await A.result({ hole: 0, n: 0, state: 'oob', to: [0, 0.05, 0] });
  ok(rr.strokes === 2 && !rr.done, 'oob counted +1 by the server');
  const rs = await wait('B', e => e.t === 'result');
  ok(rs.seat === 0 && rs.state === 'oob' && rs.strokes === 2, 'result relayed');
  const mu = await A.mulligan({ hole: 0 });
  ok(mu.strokes === 0, 'mulligan reverts');
  try { await A.mulligan({ hole: 0 }); } catch (e) { err = e; }
  ok(err?.code === 'not_now' || err?.code === 'no_helpers_left', 'one mulligan');
  // B can't drive the AI seat; A (host) can
  try { await B.shot({ seat: 2, hole: 0, n: 0, vx: 1, vz: -1, t0: 3, aim: 0, power: 0.5, mods: {}, ball }); err = null; } catch (e) { err = e; }
  ok(err?.code === 'not_your_seat', 'only the host drives AI seats');
  for (const [n, seat] of [[A, undefined], [B, undefined], [A, 2]]) {
    const cur = seat == null ? (n === A ? 1 : 0) : 0;
    await n.shot({ seat, hole: 0, n: cur, vx: 0.4, vz: -2, t0: 4, aim: 0.2, power: 0.4, mods: {}, ball });
    await n.result({ seat, hole: 0, n: cur, state: 'cup', to: [0, 0, 0] });
  }
  const he = await wait('A', e => e.t === 'room' && e.m.ev === 'holeEnd');
  ok(he.room.phase === 'board' && he.room.seats.map(s => s.scores[0]).join() === '1,1,1', 'scoreboard after the hole');
  await A.next(); await B.next();
  const h2 = await wait('A', e => e.t === 'room' && e.m.ev === 'holeStart' && e.m.room.hole === 1);
  ok(h2.room.hole === 1, 'next hole when everyone taps Next');
  // reconnect keeps the room
  B.close();
  const B2 = new SkyputtNet();
  const wb = await B2.connect({ base: BASE, devUser: { uid: 'tb' + stamp, name: 'Basil' }, name: 'Basil' });
  ok(wb.room && wb.room.code === room.code && wb.room.you === 1 && wb.room.hole === 1, 'rejoin after reconnect');
  await A.leaveRoom(); await B2.leaveRoom();
  A.close(); B2.close();
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
