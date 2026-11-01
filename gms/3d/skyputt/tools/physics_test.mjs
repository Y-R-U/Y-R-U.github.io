#!/usr/bin/env node
// Headless physics tests:  node tools/physics_test.mjs
// Straight putt, wall bounce, cup capture / lip-out, loop, no tunnelling at max power, determinism.
import { buildHole } from '../js/course/builder.js';
import { World, Ball } from '../js/engine/physics.js';
import { simulateShot } from '../js/engine/sim.js';
import { BALL_R, SHOT_MAX, CUP_R } from '../js/engine/constants.js';

let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ok  ', msg); } else { fails++; console.log('  FAIL', msg); } };

function worldFor(def) {
  const h = buildHole(def);
  const w = new World({ tris: h.colliders.tris, mats: h.colliders.mats, cup: h.cup, kinematics: h.kinematics, killY: h.killY });
  return { h, w };
}
function ballAt(h, x, z) { return new Ball(x, h.tee.y, z); }
const shot = (w, b, ang, sp, opt) => simulateShot(w, b, Math.sin(ang) * sp, -Math.cos(ang) * sp, opt);   // ang 0 = -Z

const straight = { id: 't1', par: 2, pieces: [{ type: 'path', points: [{ x: 0, z: 0.3, y: 0, w: 1.2 }, { x: 0, z: -16 }] }], tee: { s: 0.5 }, cup: { s: -0.6 } };

console.log('straight putt');
{
  const { h, w } = worldFor(straight);
  for (const sp of [1, 2, 3, 4]) {
    const b = ballAt(h, 0, h.tee.z);
    const r = simulateShot(w, b, 0, -sp, { trace: 24 });
    const d = h.tee.z - r.z;
    console.log(`    v=${sp} m/s → rolled ${d.toFixed(2)} m in ${r.time.toFixed(2)} s, x drift ${r.x.toExponential(1)}, y ${r.y.toFixed(4)}`);
    ok(r.state === 'rest', `v=${sp} comes to rest`);
    ok(Math.abs(r.x) < 1e-9 && Math.abs(r.y - h.tee.y) < 1e-3, `v=${sp} stays on line and on the floor`);
    if (sp === 2) ok(d > 2.0 && d < 3.2, `v=2 rolls a sensible 2-3 m (${d.toFixed(2)})`);
  }
  // deceleration is natural: speed decreasing monotonically
  const b = ballAt(h, 0, h.tee.z);
  w.shoot(b, 0, -3); let last = 3, mono = true, n = 0;
  while (b.state === 'moving' && n < 240 * 20) { w.stepBall(b, 0); n++; const s = b.speed(); if (s > last + 1e-9) mono = false; last = s; }
  ok(mono, 'speed decays monotonically on a flat green');
}

console.log('wall bounce');
{
  const { h, w } = worldFor(straight);
  const b = ballAt(h, 0, h.tee.z);
  // 30 deg to the left into the left wall (x = -0.6)
  const ang = -Math.PI / 6;
  w.shoot(b, Math.sin(ang) * 3, -Math.cos(ang) * 3);
  let hit = null, steps = 0;
  while (b.state === 'moving' && steps < 240 * 20) {
    const vx0 = b.vx, vz0 = b.vz;
    w.stepBall(b, 0); steps++;
    for (const e of b.events) if (e.type === 'wall' && !hit) hit = { vx0, vz0, vx1: b.vx, vz1: b.vz, x: b.px };
    b.events.length = 0;
  }
  ok(!!hit, 'ball hits the wall');
  if (hit) {
    console.log(`    in (${hit.vx0.toFixed(3)}, ${hit.vz0.toFixed(3)}) → out (${hit.vx1.toFixed(3)}, ${hit.vz1.toFixed(3)}) at x=${hit.x.toFixed(3)}`);
    ok(hit.vx0 < 0 && hit.vx1 > 0, 'x velocity reverses');
    ok(Math.abs(hit.vx1 / hit.vx0) > 0.55 && Math.abs(hit.vx1 / hit.vx0) < 0.85, `restitution ${(Math.abs(hit.vx1 / hit.vx0)).toFixed(2)} in 0.55..0.85`);
    ok(hit.vz1 < 0 && hit.vz1 / hit.vz0 > 0.8, 'keeps most of its forward speed');
    ok(hit.x > -0.6 + BALL_R - 0.01, 'never inside the wall');
  }
  ok(b.state === 'rest' && Math.abs(b.px) < 0.6, 'comes to rest on the fairway');
}

console.log('cup');
{
  const { h, w } = worldFor(straight);
  const dist = h.tee.z - h.cup.z;
  console.log(`    tee→cup ${dist.toFixed(2)} m`);
  // find the speed that just reaches the cup, then test a range of speeds
  const results = [];
  for (let sp = 2.0; sp <= 6.4; sp += 0.2) {
    const b = ballAt(h, 0, h.tee.z);
    const r = simulateShot(w, b, 0, -sp);
    const rim = r.events.filter(e => e.type === 'rim' || e.type === 'cup-hit').length;
    // speed when crossing the cup front
    results.push({ sp: +sp.toFixed(1), state: r.state, rim });
  }
  console.log('    ' + results.map(r => `${r.sp}:${r.state}${r.rim ? '(' + r.rim + ')' : ''}`).join(' '));
  const ins = results.filter(r => r.state === 'cup');
  ok(ins.length >= 3, 'a range of speeds drops in');
  {
    const b = new Ball(0, h.tee.y, h.cup.z + 1.0);
    const r = simulateShot(w, b, 0, -3.5, { trace: 1 });
    const past = Math.min(...r.path.map(p => p[2])) < h.cup.z - CUP_R;
    ok(past, 'a firm putt (3.5 m/s) skips over the cup instead of dropping');
  }
  // arrival speed for capture limit: shoot from 0.6 m away at various speeds
  const arrive = [];
  for (let sp = 0.4; sp <= 4.01; sp += 0.2) {
    const b = new Ball(0, h.tee.y, h.cup.z + 0.6);
    const r = simulateShot(w, b, 0, -sp);
    arrive.push(`${sp.toFixed(1)}:${r.state}`);
  }
  console.log('    from 0.6 m: ' + arrive.join(' '));
  ok(arrive.filter(a => a.endsWith('cup')).length >= 4 && arrive.includes('3.0:rest'), 'slow drops in (1.0-2.2 m/s), fast rolls past');
  // off-centre: 9 cm left of the line, gentle → still catches the edge or lips
  const b = new Ball(0.09, h.tee.y, h.cup.z + 0.6);
  const r = simulateShot(w, b, 0, -0.9);
  console.log(`    off-centre 9 cm at 0.9 m/s → ${r.state}`);
}

console.log('no tunnelling at max power');
{
  const { h, w } = worldFor(straight);
  let escaped = 0, n = 0;
  for (let a = -80; a <= 80; a += 4) {
    const b = ballAt(h, 0, h.tee.z - 1);
    const r = shot(w, b, a * Math.PI / 180, SHOT_MAX * 1.3);
    n++;
    if (Math.abs(r.x) > 0.6 - BALL_R + 1e-3 || r.state === 'oob' || r.z < h.frames[h.frames.length - 1].p[2] - 0.01) escaped++;
  }
  ok(escaped === 0, `${n} max-power shots at every angle stay inside the walls`);
  // straight into the end wall at the cap
  const b = new Ball(0.3, h.tee.y, -14);
  const r = simulateShot(w, b, 0, -10);
  ok(r.state !== 'oob' && r.z > -16.05, 'a 10 m/s shot into the end wall bounces back');
}

console.log('loop');
{
  const def = {
    id: 'loop', par: 2, tee: { s: 0.4 }, cup: { s: -0.6 },
    pieces: [
      { type: 'path', points: [{ x: 0, z: 0.3, w: 0.5 }, { x: 0, z: -3 }] },
      { type: 'loop', radius: 0.45, shift: 0.8, width: 0.5 },
      { type: 'path', points: [{ x: -0.8, z: -3, w: 0.5 }, { x: -0.8, z: -4.5 }, { x: -0.8, z: -7, w: 1.0 }] },
    ],
  };
  const { h, w } = worldFor(def);
  let minOk = null;
  for (let sp = 3.0; sp <= 6.41; sp += 0.2) {
    const b = ballAt(h, 0, h.tee.z);
    const r = simulateShot(w, b, 0, -sp);
    const through = r.z < -3.4 && r.x < -0.5;
    if (through && minOk === null) minOk = sp;
    if (sp < 3.5 || through === false || Math.abs(sp - 6.4) < 0.01 || sp === minOk)
      console.log(`    v=${sp.toFixed(1)} → ${r.state} at (${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.z.toFixed(2)}) ${through ? 'THROUGH' : ''}`);
  }
  ok(minOk !== null, `loop can be completed (from ${minOk?.toFixed(1)} m/s)`);
  ok(minOk !== null && minOk < SHOT_MAX * 0.85, 'with a comfortable power margin');
  const b = ballAt(h, 0, h.tee.z);
  const r = simulateShot(w, b, 0, -3.0);
  ok(!(r.z < -3.4 && r.x < -0.5), 'a weak shot falls back');
}

console.log('determinism');
{
  const { h, w } = worldFor(straight);
  const run = () => { const b = ballAt(h, 0.1, h.tee.z); const r = shot(w, b, 0.31, 4.7); return [r.x, r.y, r.z, r.steps].join(','); };
  ok(run() === run(), 'same shot → bit-identical result');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
