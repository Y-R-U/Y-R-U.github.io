#!/usr/bin/env node
// Ball-vs-ball collision tests:  node tools/ballhit_test.mjs
// Head-on transfer, glancing hit, a struck ball into the cup, a struck ball out of bounds (back to its
// spot), toggle off = pass-through, determinism, the live Round-style loop == simulateShotWith, and
// an online relay (js/net/replay.js with `balls`) replaying the shooter's knocks bit-exactly.
import { buildHole, makeWorld } from '../js/course/builder.js';
import { Ball, restingBall, collideBalls } from '../js/engine/physics.js';
import { simulateShotWith, stepBalls, anyMoving } from '../js/engine/sim.js';
import { BALL_R, DT } from '../js/engine/constants.js';
import { Replayer, targetBalls } from '../js/net/replay.js';
import { ballState } from '../js/ai/round.js';
import { COURSES } from '../js/course/holes/index.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { fails++; console.log('  FAIL', msg); } };
const f3 = v => v.toFixed(3);

// a long straight green (tee at z≈0, heading -Z), and a short one that ends in a drop
const straight = { id: 'bh1', par: 2, pieces: [{ type: 'path', points: [{ x: 0, z: 0.3, y: 0, w: 1.2, walls: 'LR' }, { x: 0, z: -16 }] }], tee: { s: 0.5 }, cup: { s: -0.6 } };
const open = { id: 'bh2', par: 2, pieces: [{ type: 'path', points: [{ x: 0, z: 0.3, y: 0, w: 1.2, walls: '' }, { x: 0, z: -8 }] }], tee: { s: 0.5 }, cup: { s: -0.6 } };
const make = def => { const h = buildHole(def); return { h, w: makeWorld(h) }; };
const rest = (h, x, z) => restingBall(x, h.tee.y, z);

console.log('head-on');
{
  const { h, w } = make(straight);
  const a = new Ball(0, h.tee.y, h.tee.z), b = rest(h, 0, h.tee.z - 1.0);
  // capture velocities right after the impact
  w.shoot(a, 0, -3);
  const balls = [a, b];
  let hit = null, t = 0;
  for (let i = 0; i < 240 * 10 && anyMoving(balls); i++) {
    const va = a.vz;
    stepBalls(w, balls, t, true); t += DT;
    if (!hit && b.events.some(e => e.type === 'knocked')) hit = { va, a: a.vz, b: b.vz };
    a.events.length = 0; b.events.length = 0;
  }
  ok(!!hit, 'the moving ball strikes the resting one');
  if (hit) {
    console.log(`    before ${f3(hit.va)} → striker ${f3(hit.a)}, struck ${f3(hit.b)} m/s`);
    ok(hit.b < 0 && Math.abs(hit.b) > 0.6 * Math.abs(hit.va), 'struck ball takes most of the speed forward');
    ok(Math.abs(hit.a) < 0.4 * Math.abs(hit.va) && hit.a <= 0, 'striker keeps a little follow, never bounces back');
    ok(Math.abs(hit.a) + Math.abs(hit.b) <= Math.abs(hit.va) * 1.0001, 'no speed created by the impact');
  }
  ok(a.state === 'rest' && b.state === 'rest', 'both settle');
  ok(b.pz < a.pz - 2 * BALL_R + 1e-6, `struck ball ends ahead (${f3(a.pz)} vs ${f3(b.pz)})`);
  ok(Math.abs(b.px) < 1e-9 && Math.abs(a.px) < 1e-9, 'head-on stays on the line');
}

console.log('glancing');
{
  const { h, w } = make(straight);
  const a = new Ball(0, h.tee.y, h.tee.z), b = rest(h, BALL_R * 1.2, h.tee.z - 1.0);   // half-ball hit, to the right
  const r = simulateShotWith(w, a, 0, -3, [b], { trace: 8 });
  const o = r.others[0];
  ok(o.moved, 'struck');
  const dbx = o.x - o.from[0], dbz = o.z - o.from[2];
  console.log(`    struck ball moved (${f3(dbx)}, ${f3(dbz)}), striker ended at x ${f3(r.x)}`);
  ok(dbx > 0.05 && dbz < 0, 'struck ball goes forward-right (along the line of centres)');
  ok(r.x < 0, 'striker is deflected the other way (left)');
}

console.log('struck ball into the cup');
{
  const { h, w } = make(straight);
  const c = h.cup;
  // B sits 0.35 m short of the cup on the line; A taps it from 0.8 m behind
  const b = rest(h, c.x, c.z + 0.35), a = new Ball(c.x, h.tee.y, c.z + 1.15);
  let res = null;
  for (const sp of [0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]) {
    const a2 = new Ball(a.px, a.py, a.pz), b2 = rest(h, b.px, b.pz);
    const r = simulateShotWith(w, a2, 0, -sp, [b2]);
    if (r.others[0].state === 'cup') { res = { sp, r }; break; }
  }
  ok(!!res, `a struck ball can drop in the cup${res ? ` (tap at ${res.sp} m/s)` : ''}`);
  if (res) console.log(`    striker ends ${res.r.state}`);
}

console.log('struck ball out of bounds');
{
  const { h, w } = make(open);
  // B near the open right edge, A hits it sideways-ish toward the edge
  const b = rest(h, 0.4, h.tee.z - 1.0), a = new Ball(0.1, h.tee.y, h.tee.z - 0.6);
  const r = simulateShotWith(w, a, 2.4, -3.2, [b]);
  const o = r.others[0];
  console.log(`    struck: ${o.state}, rest spot (${f3(o.rest.x)}, ${f3(o.rest.z)}) vs start (${f3(o.from[0])}, ${f3(o.from[2])})`);
  ok(o.moved && o.state === 'oob', 'knocked off the open edge');
  ok(o.rest.x === o.from[0] && o.rest.z === o.from[2], 'its rest spot is where it was knocked from (put back there; its owner takes +1)');
  // a chain: A hits B, B hits C off the open edge — C is the one knocked out (its owner +1, reported as such)
  let chain = null;
  for (let cx = 0.25; cx <= 0.5 && !chain; cx += 0.05) for (let ang = 0; ang <= 0.5 && !chain; ang += 0.05) {
    const A = new Ball(0, h.tee.y, h.tee.z - 0.3), B = rest(h, 0.1, h.tee.z - 1.0), C = rest(h, cx, h.tee.z - 1.4);
    const r = simulateShotWith(w, A, Math.sin(ang) * 3.5, -Math.cos(ang) * 3.5, [B, C]);
    const byB = r.others[1].events.some(e => e.type === 'knocked' && e.by === 1);
    if (byB && r.others[1].state === 'oob' && !r.others[1].events.some(e => e.type === 'knocked' && e.by === 0)) chain = { cx, ang, r };
  }
  ok(!!chain, `chain A→B→C: B (not A) knocks C out${chain ? ` (C at x ${chain.cx.toFixed(2)}, aim ${chain.ang.toFixed(2)})` : ''}`);
  if (chain) ok(chain.r.others[1].rest.x === chain.r.others[1].from[0], 'C goes back to its own spot (its owner takes the +1)');
}

console.log('toggle off = pass-through');
{
  const { h, w } = make(straight);
  const a = new Ball(0, h.tee.y, h.tee.z), b = rest(h, 0, h.tee.z - 1.0);
  const a0 = new Ball(0, h.tee.y, h.tee.z);
  const r = simulateShotWith(w, a, 0, -3, [b], { collide: false });
  const solo = simulateShotWith(w, a0, 0, -3, []);
  ok(!r.others[0].moved && b.state === 'rest' && b.pz === h.tee.z - 1.0, 'resting ball untouched');
  ok(r.x === solo.x && r.z === solo.z && r.steps === solo.steps, 'shot identical to a solo shot');
}

console.log('determinism');
{
  const { h, w } = make(straight);
  const run = () => {
    const a = new Ball(0.02, h.tee.y, h.tee.z);
    const others = [rest(h, 0.05, h.tee.z - 0.8), rest(h, -0.06, h.tee.z - 1.4), rest(h, 0.1, h.tee.z - 2.2)];
    const r = simulateShotWith(w, a, 0.15, -4.2, others, { trace: 8 });
    return JSON.stringify([r.x, r.y, r.z, r.steps, r.others.map(o => [o.state, o.x, o.y, o.z, o.path])]);
  };
  const s1 = run(), s2 = run();
  ok(s1 === s2, 'same inputs → identical outputs (3-ball chain)');
  const n = JSON.parse(s1)[4].filter(o => o[0] === 'rest').length;
  ok(n === 3, 'chain reaction settles every ball');
}

console.log('collideBalls guards');
{
  const a = new Ball(0, 0, 0), b = new Ball(0, 0, 0);   // both resting, overlapping: untouched
  ok(collideBalls([a, b]) === 0 && a.state === 'rest' && b.state === 'rest', 'two resting balls never push each other');
  const c = new Ball(0, 0, 0), d = new Ball(0.08, 0, 0); c.state = 'cup'; d.state = 'moving'; d.vx = -1;
  ok(collideBalls([c, d]) === 0, 'a ball in the cup takes no part');
}

// The live loop (Round.update: step every frame-step, events after) == simulateShotWith
console.log('live loop == headless sim, and online replay == shooter');
{
  let exact = 0, total = 0, knocked = 0;
  const holes = [...COURSES.sky.holes.slice(0, 9)];
  for (const def of holes) {
    const hole = buildHole(def), world = makeWorld(hole), rep = new Replayer(hole);
    const t = hole.tee;
    for (let k = 0; k < 3; k++) {
      // a peer resting ~1.2 m down the fairway from the tee, the shooter aims straight at it
      const f = hole.frames.find(q => q.s >= hole.teeFrame.s + 1.0 + 0.3 * k) || hole.frames[hole.frames.length - 1];
      const peer = { seat: 1, n: 2, x: f.p[0], y: f.p[1] + BALL_R, z: f.p[2] };
      // settle the peer onto the floor first (as a real ball would be)
      const pb = new Ball(peer.x, peer.y + 0.01, peer.z); world.shoot(pb, 0, 0);
      for (let i = 0; i < 240 * 3 && pb.state === 'moving'; i++) world.stepBall(pb, 0);
      if (pb.state !== 'rest') continue;
      peer.x = pb.px; peer.y = pb.py; peer.z = pb.pz;
      const sp = 2.2 + 0.6 * k, dx = peer.x - t.x, dz = peer.z - t.z, L = Math.hypot(dx, dz);
      const vx = dx / L * sp, vz = dz / L * sp, t0 = 1.5 + k;
      // shooter's live loop
      const me = new Ball(t.x, t.y, t.z), others = targetBalls([peer]).map(o => o.ball);
      world.time = t0; world.shoot(me, vx, vz);
      const all = [me, ...others];
      let steps = 0;
      while (anyMoving(all) && steps < 240 * 40) { stepBalls(world, all, world.time, true); for (const b of all) b.events.length = 0; world.time += DT * world.clock; steps++; }
      // headless + relayed replay
      const m = { vx, vz, t0, mods: {}, ball: ballState(new Ball(t.x, t.y, t.z)), balls: [peer] };
      const r = rep.shot(m);
      total++;
      const kn = r.knocks[0];
      if (kn) knocked++;
      const same = r.to[0] === (me.state === 'oob' ? t.x : me.px) && r.state === (me.state === 'moving' ? 'rest' : me.state === 'oob' ? 'oob' : me.state === 'cup' ? 'cup' : 'rest')
        && (!kn || (kn.state === (others[0].state === 'rest' ? 'rest' : others[0].state) && (kn.state === 'oob' || kn.to[2] === others[0].pz)));
      if (same) exact++;
    }
  }
  console.log(`    ${exact}/${total} shots identical, ${knocked} knocked the peer`);
  ok(total > 10 && exact === total, 'live loop and relayed replay agree exactly');
  ok(knocked >= total * 0.6, 'most aimed shots really hit the peer');
}

// Ghosts (story rival etc.): a recorded ghost is a kinematic ball while undisturbed (exact replay),
// knocked off its line it becomes a simulated ball and plays on with the AI planner (js/ai/ghostsim.js).
console.log('ghosts');
{
  const { GhostSim, finishSync } = await import('../js/ai/ghostsim.js');
  const AI = await import('../js/ai/index.js');
  const def = COURSES.sky.holes[0], hole = buildHole(def), world = makeWorld(hole);
  const golfer = () => AI.golferFor({ id: 'carl', name: 'Careful Carl', personality: 'careful', skill: 0.36 }, 7);
  const rec = AI.playHoleSync({ hole, golfer: golfer(), trace: true, budgetScale: 0.5 });
  console.log(`    recorded ghost: ${rec.strokes} strokes, shots at t0 ${rec.shots.map(x => x.t0.toFixed(2)).join(', ')}`);
  const pl = new AI.Planner(hole);
  const syncPlan = g => (st, t) => { const r = AI.takeShot(pl, g, st, t, g.ticket(), { trace: false, budgetScale: 0.5 }); return { aim: r.shot.aim, power: r.shot.power, t0: r.t0 }; };
  const tEnd = rec.shots.at(-1).t0 + rec.shots.at(-1).path.length / 3 / 30 + 0.5;
  // Round-style loop: pose the ghost, step [me, ghost], let the ghost read its events. hook(t, me, g) may shoot me.
  function run({ me, collide = true, hook = null, maxT = 90 }) {
    const g0 = golfer(), g = new GhostSim({ shots: rec.shots, maxStrokes: def.par + 4, golfer: g0, tee: hole.tee, plan: syncPlan(g0) });
    const trace = [];
    let t = 0, meKnocked = false;
    for (let i = 0; t < maxT; i++) {
      g.pose(t);
      hook?.(t, me, g);
      stepBalls(world, [me, g.ball], t, collide);
      g.after(t);
      if (me.events.some(e => e.type === 'knocked')) meKnocked = true;
      if (me.state === 'oob') me.place(me.rest.x, me.rest.y, me.rest.z);
      me.events.length = 0;
      if (i % 24 === 0) trace.push([g.ball.px, g.ball.py, g.ball.pz]);
      t += DT;
      if (g.done && me.state !== 'moving' && t > tEnd) break;
    }
    return { g, me, trace, meKnocked, t };
  }
  // the recorded path, sampled the same way with nothing to hit
  const far = () => { const b = new Ball(hole.tee.x + 50, hole.tee.y, hole.tee.z); return b; };   // off the course: never touches
  const ref = run({ me: far() });
  ok(ref.g.mode === 'replay' && ref.g.done && ref.g.result().strokes === rec.strokes, `undisturbed ghost = its record (${ref.g.result().strokes} strokes)`);
  let exact = true;
  for (let k = 0; k < rec.shots.length; k++) { const s = rec.shots[k]; const g = new GhostSim({ shots: rec.shots, maxStrokes: def.par + 4, tee: hole.tee }); g.pose(s.t0 + s.path.length / 90 + 0.01); const to = rec.shots[k + 1]?.from || s.to; if (s.state !== 'cup' && (g.ball.px !== to[0] || g.ball.pz !== to[2])) exact = false; }
  ok(exact, 'undisturbed ghost rests exactly on its recorded spots');

  // my ball resting where the ghost's first putt rolls (halfway along it): the ghost knocks it
  const s0 = rec.shots[0], mid = Math.floor(s0.path.length / 3 * 0.5) * 3;
  const meOnLine = () => { const b = restingBall(s0.path[mid], s0.path[mid + 1], s0.path[mid + 2]); return b; };
  const hit = run({ me: meOnLine() });
  ok(hit.meKnocked, 'a ghost knocks my resting ball');
  ok(hit.g.mode === 'live', 'and is knocked off its own line (now simulated)');
  ok(hit.g.done && hit.g.result().strokes <= def.par + 4, `the AI finishes its hole: ${hit.g.result().strokes} strokes (${hit.g.holed ? 'holed' : 'picked up'})`);
  const off = run({ me: meOnLine(), collide: false });
  ok(!off.meKnocked && off.g.mode === 'replay' && JSON.stringify(off.trace) === JSON.stringify(ref.trace), 'ball hits off: passes through, exact replay');

  // I putt at the ghost while it rests after its first shot
  const at = rec.shots[1]?.from || s0.to;
  const shootAtGhost = () => {
    let shot = false;
    return (t, me, g) => {
      if (shot || t < s0.t0 + s0.path.length / 90 + 0.2 || (rec.shots[1] && t > rec.shots[1].t0 - 0.05)) return;
      shot = true;
      const dx = at[0] - me.px, dz = at[2] - me.pz, L = Math.hypot(dx, dz);
      world.shoot(me, dx / L * 3, dz / L * 3);
    };
  };
  const startNear = () => { const f = hole.frames.find(q => q.s >= hole.teeFrame.s + 0.6); return restingBall(f.p[0], f.p[1] + BALL_R, f.p[2]); };
  if (rec.shots.length >= 2 && rec.shots[1].t0 - (s0.t0 + s0.path.length / 90) > 0.4) {
    const kn = run({ me: startNear(), hook: shootAtGhost() });
    ok(kn.g.mode === 'live', 'my putt knocks the resting ghost off its line');
    ok(kn.g.done && kn.g.result().diverged, `knocked ghost plays on with the AI: ${kn.g.result().strokes} strokes vs ${rec.strokes} recorded`);
    const kn2 = run({ me: startNear(), hook: shootAtGhost() });
    ok(JSON.stringify(kn.trace) === JSON.stringify(kn2.trace) && kn.g.result().strokes === kn2.g.result().strokes, 'deterministic: same knock → same ghost path and score');
    // finishing headlessly (the hole ends for me while the knocked ghost is still out)
    const g0 = golfer(), g = new GhostSim({ shots: rec.shots, maxStrokes: def.par + 4, golfer: g0, tee: hole.tee, plan: null });
    const me = startNear(); const hk = shootAtGhost();
    let t = 0;
    for (; t < 30 && g.mode === 'replay'; t += DT) { g.pose(t); hk(t, me, g); stepBalls(world, [me, g.ball], t, true); g.after(t); me.events.length = 0; }
    const r = finishSync(g, world, syncPlan(g0), t);
    ok(g.done && r.diverged && r.strokes >= 1 && r.strokes <= def.par + 4, `finishSync plays a knocked ghost out headlessly (${r.strokes})`);
  } else console.log('    (record has no gap after shot 1: knock-the-ghost case skipped)');
  // knocked out of bounds: no penalty
  {
    const g = new GhostSim({ shots: rec.shots, maxStrokes: 9, tee: hole.tee });
    g._diverge(true); g.strokes = 2; g.motion = 'knock';
    g.ball.state = 'moving'; g.ball.rest = { x: 1, y: 2, z: 3 };
    g.ball.events.push({ type: 'oob' }); g.after(0);
    ok(g.strokes === 3 && g.ball.px === 1 && g.ball.state === 'rest', 'a ghost knocked out of bounds goes back to where it was hit, +1');
    g.motion = 'shot'; g.ball.state = 'moving'; g.ball.events.push({ type: 'oob' }); g.after(0);
    ok(g.strokes === 4, 'its own putt out of bounds: +1');
  }
}

// The protocol against the local dev server: balls relayed, knocks applied + pushed, replay agrees.
console.log('net.js against the local server (ball hits)');
{
  const { SkyputtNet } = await import('../js/net/net.js');
  const { defaultOpts, wireOpts } = await import('../js/net/rooms.js');
  const BASE = process.argv.find(a => a.startsWith('--server='))?.slice(9) || 'http://127.0.0.1:8098/gms/3d/skyputt';
  let up = false;
  try { up = (await (await fetch(BASE + '/api/health')).json()).devAuth === true; } catch { /* down */ }
  if (!up) console.log('  (skipped: no dev server at ' + BASE + ' — run tools/server_run.sh --bg)');
  else {
    const stamp = Date.now().toString(36);
    const A = new SkyputtNet(), B = new SkyputtNet();
    await A.connect({ base: BASE, devUser: { uid: 'ka' + stamp, name: 'Kit' }, name: 'Kit' });
    await B.connect({ base: BASE, devUser: { uid: 'kb' + stamp, name: 'Bo' }, name: 'Bo' });
    const room = await A.createRoom(wireOpts({ ...defaultOpts({ collide: true }), ai: { count: 0, personality: 'any', skill: 0.3 }, holes: [{ id: 'sky1', par: 2 }] }));
    ok(room.opts.collide === true, 'room keeps the ball-hits rule');
    const evs = { A: [], B: [] };
    for (const [k, n] of [['A', A], ['B', B]]) for (const t of ['room', 'shot', 'result', 'knock']) n.on(t, m => evs[k].push({ t, m }));
    await B.joinRoom(room.code);
    const wait = async (k, f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const i = evs[k].findIndex(f); if (i >= 0) return evs[k].splice(i, 1)[0].m; await new Promise(r => setTimeout(r, 20)); } throw new Error('timeout ' + k); };
    await A.start();
    await wait('B', e => e.t === 'room' && e.m.ev === 'holeStart');
    const def = COURSES.sky.holes[0], hole = buildHole(def), rep = new Replayer(hole), t = hole.tee;
    const tee = ballState(new Ball(t.x, t.y, t.z));
    // Bo putts gently down the fairway and rests
    const bShot = { hole: 0, n: 0, vx: 0, vz: -1.4, t0: 2, aim: 0, power: 0.3, mods: {}, ball: tee };
    const rb = rep.shot(bShot);
    await B.shot(bShot); await B.result({ hole: 0, n: 0, state: rb.state, to: rb.to });
    await wait('A', e => e.t === 'result');
    // Kit aims straight at Bo's ball
    const [bx, by, bz] = rb.to, dx = bx - t.x, dz = bz - t.z, L = Math.hypot(dx, dz);
    const balls = [{ seat: 1, n: 1, x: bx, y: by, z: bz }];
    const aShot = { hole: 0, n: 0, vx: dx / L * 3, vz: dz / L * 3, t0: 3, aim: 0, power: 0.5, mods: {}, ball: tee, balls };
    const ra = rep.shot(aShot);
    ok(ra.knocks.length === 1, `Kit's putt knocks Bo's ball (${ra.knocks[0]?.state})`);
    await A.shot(aShot);
    const sh = await wait('B', e => e.t === 'shot');
    const rb2 = new Replayer(hole).shot(sh);
    ok(rb2.knocks.length === 1 && rb2.knocks[0].to.join() === ra.knocks[0].to.join() && rb2.to.join() === ra.to.join(), 'Bo replays the relayed shot and its knock bit-exactly');
    const reply = await A.result({ hole: 0, n: 0, state: ra.state, to: ra.to, knocks: ra.knocks.map(k => ({ seat: k.seat, state: k.state, to: k.to })) });
    ok(reply.knocks?.length === 1, 'the server takes the knock');
    const kn = await wait('B', e => e.t === 'knock');
    ok(kn.seat === 1 && kn.by === 0 && kn.n === 2 && (kn.state === 'cup' || kn.to.join() === ra.knocks[0].to.join()), 'Bo hears where his ball went (new shot number)');
    await wait('A', e => e.t === 'knock');
    let err = null;
    try { await B.shot({ ...bShot, n: 1 }); } catch (e) { err = e; }
    ok(err?.code === 'stale_shot', 'a putt from the old spot is refused');
    await A.leaveRoom(); await B.leaveRoom();
    A.close(); B.close();
  }
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
