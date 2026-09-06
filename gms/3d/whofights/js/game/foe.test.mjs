import { test, eq, ok, near } from '../../tools/harness.mjs';
import { EARTH, STATES, spawn, step, wound, isDead, fraction } from './foe.js';
import { surfaceAt, isDirt, plotLocal, dirtRun, plotsOf } from './ground.js';
import { make, hurt, mend, apply, inSwing, bearing } from './vitals.js';

const DT = 1 / 60;
const at = (x, z) => ({ x, z, alive: true });
const stone = { onDirt: () => false };
const dirt = { onDirt: () => true };

// ── vitals ──────────────────────────────────────────────────────────────────────────────────
test('a health record clamps at both ends and knows when it is spent', () => {
  const v = make(100);
  eq(hurt(v, 30).hp, 70);
  eq(hurt(v, 500).hp, 0);
  ok(hurt(v, 500).dead);
  eq(mend(hurt(v, 30), 500).hp, 100, 'mending stops at full');
  ok(!mend(hurt(v, 500), 50).dead === false, 'the dead do not mend');
  eq(mend(hurt(v, 500), 50).hp, 0);
  eq(apply(v, -10).max, 100, 'the maximum is not eaten by damage');
});

test('a record is never mutated', () => {
  const v = make(100);
  hurt(v, 40);
  eq(v.hp, 100);
});

// The bearing convention is the game's — atan2(x, z) — and mixing it with the maths one puts
// every swing ninety degrees off whatever the player is looking at.
test('bearing is measured in the same yaw the player turns in', () => {
  near(bearing({ x: 0, z: 0 }, 0, { x: 0, z: 5 }), 0, 1e-9, 'dead ahead at yaw 0 is +z');
  near(Math.abs(bearing({ x: 0, z: 0 }, 0, { x: 5, z: 0 })), Math.PI / 2, 1e-9);
  near(bearing({ x: 0, z: 0 }, Math.PI / 2, { x: 5, z: 0 }), 0, 1e-9, 'yaw pi/2 faces +x');
});

test('a swing is a cone, not a sphere', () => {
  const from = { x: 0, z: 0 }, opts = { from, yaw: 0, reach: 2.5, arc: 1.5 };
  ok(inSwing({ ...opts, to: { x: 0, z: 2 } }), 'straight ahead and in reach');
  ok(!inSwing({ ...opts, to: { x: 0, z: 4 } }), 'straight ahead and too far');
  ok(!inSwing({ ...opts, to: { x: 0, z: -2 } }), 'behind you');
  ok(!inSwing({ ...opts, to: { x: 2, z: 0.2 } }), 'past the edge of the arc');
  ok(inSwing({ ...opts, to: { x: 0, z: 3.1 }, radius: 0.85 }), 'a wide body is hit at its edge');
  ok(inSwing({ ...opts, to: { x: 0.1, z: -0.1 } }), 'point blank has no bearing to miss on');
});

// ── the floor ───────────────────────────────────────────────────────────────────────────────
const plot = (x, z, w, d, surface, ry = 0) => ({ type: 'plot', x, z, ry, p: { w, d, surface } });

test('a plot is a rectangle you are either on or off', () => {
  const p = plot(10, 0, 8, 4, 'dirt');
  ok(plotLocal(p, 10, 0));
  ok(plotLocal(p, 13.9, 1.9));
  ok(!plotLocal(p, 14.1, 0), 'past the long edge');
  ok(!plotLocal(p, 10, 2.1), 'past the short edge');
});

test('a rotated plot rotates', () => {
  const p = plot(0, 0, 10, 2, 'dirt', Math.PI / 2);
  ok(plotLocal(p, 0, 4.5), 'the long axis turned onto z');
  ok(!plotLocal(p, 4.5, 0), 'and off x');
});

test('the last plot wins, so a patch laid over another patches it', () => {
  const plots = [plot(0, 0, 40, 40, 'stone'), plot(6, 0, 8, 8, 'dirt')];
  eq(surfaceAt(plots, 0, 0), 'stone');
  eq(surfaceAt(plots, 6, 0), 'dirt');
  eq(surfaceAt(plots, 100, 0), 'grass', 'off every plot is the fallback');
  ok(isDirt(plots, 6, 0));
  ok(!isDirt(plots, 0, 0));
});

test('plotsOf reads a level document and nothing else in it', () => {
  const doc = { objects: [plot(0, 0, 4, 4, 'dirt'), { type: 'house', x: 0, z: 0, p: {} }] };
  eq(plotsOf(doc).length, 1);
  eq(plotsOf(null).length, 0);
});

test('a walk across a boundary is part dirt', () => {
  const plots = [plot(0, 0, 40, 40, 'stone'), plot(10, 0, 20, 40, 'dirt')];
  near(dirtRun(plots, { x: -10, z: 0 }, { x: -5, z: 0 }, 8), 0, 1e-9);
  ok(dirtRun(plots, { x: -10, z: 0 }, { x: 15, z: 0 }, 8) > 0.3);
});

// ── the elemental ───────────────────────────────────────────────────────────────────────────
test('it notices you, closes, winds up, strikes once, and recovers', () => {
  let f = spawn({ x: 0, z: 0 });
  eq(f.state, 'idle');
  const seen = [];
  let strikes = 0;
  for (let i = 0; i < 60 * 12; i++) {
    f = step(f, DT, { player: at(0, 6), ...stone });
    if (seen[seen.length - 1] !== f.state) seen.push(f.state);
    if (f.struck) strikes++;
  }
  ok(seen.includes('chase'), `never chased: ${seen.join(' → ')}`);
  ok(seen.includes('windup'), 'never wound up');
  ok(seen.includes('strike'), 'never struck');
  ok(seen.includes('recover'), 'never recovered');
  ok(strikes >= 2, `threw ${strikes} blows in twelve seconds`);
  for (const s of seen) ok(STATES.includes(s), `unknown state ${s}`);
});

test('one blow is thrown per strike, however long the frame is', () => {
  let f = { ...spawn({ x: 0, z: 5 }), state: 'strike', t: 0 };
  let strikes = 0;
  for (let i = 0; i < 200; i++) {
    f = step(f, 0.5, { player: at(0, 6), ...stone });
    if (f.struck) strikes++;
  }
  // Half-second frames: the whole windup-strike-recover cycle is shorter than one of them, and it
  // still may not throw two blows in a single step.
  ok(strikes > 0 && strikes < 200, `${strikes} blows from 200 half-second frames`);
});

test('it will not close on a player who is down', () => {
  let f = spawn({ x: 0, z: 0 });
  for (let i = 0; i < 600; i++) f = step(f, DT, { player: { x: 0, z: 6, alive: false }, ...stone });
  eq(f.state, 'idle');
  near(f.z, 0, 1e-9, 'it moved toward a corpse');
});

test('it is slower than the player, so the flagstones are always reachable', () => {
  ok(EARTH.speed < 5.0, 'it can outrun a walk');
  let f = spawn({ x: 0, z: 0 });
  const before = f.z;
  for (let i = 0; i < 60; i++) f = step(f, DT, { player: at(0, 40), ...stone });
  ok(f.z - before <= EARTH.speed * 1.02, `covered ${(f.z - before).toFixed(2)} m in a second`);
});

test('a cut interrupts a windup but cannot be chained into a stun-lock', () => {
  let f = spawn({ x: 0, z: 0 });
  while (f.state !== 'windup') f = step(f, DT, { player: at(0, 2), ...stone });
  f = wound(f, 5, 1);
  eq(f.state, 'stagger', 'the blow did not come off it');
  let ticks = 0;
  while (f.state === 'stagger' && ticks < 600) { f = step(f, DT, { player: at(0, 2), ...stone }); ticks++; }
  ok(ticks * DT < 0.5, `staggered for ${(ticks * DT).toFixed(2)} s`);
});

test('one swing lands once, however many frames it is held for', () => {
  let f = spawn({ x: 0, z: 0 });
  const hp = f.hp;
  for (let i = 0; i < 30; i++) f = wound(f, 10, 7);
  eq(f.hp, hp - 10, 'the same swing landed thirty times');
  f = wound(f, 10, 8);
  eq(f.hp, hp - 20, 'a new swing is a new hit');
});

// ── the rule the proving is about ───────────────────────────────────────────────────────────
// Fought on dirt the knife cannot get ahead of it; fought on stone the same knife wins. If these
// two ever agree, the proving room has stopped teaching anything.
const fight = (world, dps, seconds = 60) => {
  let f = spawn({ x: 0, z: 0 });
  let id = 0, acc = 0;
  for (let i = 0; i < 60 * seconds; i++) {
    f = step(f, DT, { player: at(0, 2), ...world });
    acc += dps * DT;
    if (acc >= 9) { acc -= 9; f = wound(f, 9, ++id); }
    if (isDead(f)) return { dead: true, at: i * DT, hp: f.hp };
  }
  return { dead: false, at: seconds, hp: f.hp };
};

test('on flagstone a proving knife kills it', () => {
  const r = fight(stone, 12);
  ok(r.dead, `still up after a minute at ${r.hp.toFixed(1)} hp`);
  ok(r.at < 20, `took ${r.at.toFixed(1)} s`);
});

test('on bare earth the same knife never gets ahead of it', () => {
  const r = fight(dirt, 12);
  ok(!r.dead, `it died on dirt after ${r.at.toFixed(1)} s`);
  ok(fraction({ ...r, max: EARTH.hp }) > 0.8, `dirt let it fall to ${r.hp.toFixed(1)} hp`);
});

// The tuning is only right relative to the weapon it is fought with. Both of these are what make
// the lesson land, and either drifting alone un-teaches it.
test('the mending outpaces the knife over a whole swing cycle, and only just', () => {
  const swing = 0.75, damage = 9;
  const healed = EARTH.regen * (swing - EARTH.regenDelay);
  ok(EARTH.regenDelay < swing, 'the delay outlasts the cooldown, so nothing ever mends');
  ok(healed > damage, `${healed.toFixed(1)} healed against ${damage} dealt — the dirt does nothing`);
  ok(healed < damage * 2, `${healed.toFixed(1)} against ${damage} — the dirt makes it invincible`);
});

test('the mending stops for a moment after every cut, or nothing could ever hurt it', () => {
  let f = spawn({ x: 0, z: 0 });
  f = wound(f, 30, 1);
  const low = f.hp;
  f = step(f, DT, { player: at(0, 40), ...dirt });
  eq(f.mended, 0, 'it mended on the frame it was cut');
  for (let i = 0; i < Math.ceil(EARTH.regenDelay / DT) + 4; i++) {
    f = step(f, DT, { player: at(0, 40), ...dirt });
  }
  ok(f.hp > low, 'it never started mending again');
  ok(f.onDirt, 'it did not notice the soil it is standing in');
});

test('it mends nowhere but on dirt', () => {
  let f = wound(spawn({ x: 0, z: 0 }), 30, 1);
  const low = f.hp;
  for (let i = 0; i < 600; i++) f = step(f, DT, { player: at(0, 40), ...stone });
  eq(f.hp, low, 'flagstone healed it');
});

test('death is final and it stops moving', () => {
  let f = wound(spawn({ x: 0, z: 0 }), 999, 1);
  ok(isDead(f));
  eq(f.state, 'dead');
  const was = { x: f.x, z: f.z };
  for (let i = 0; i < 600; i++) f = step(f, DT, { player: at(0, 6), ...dirt });
  eq(f.state, 'dead', 'it got back up');
  eq(f.hp, 0, 'a corpse standing in soil mended');
  eq({ x: f.x, z: f.z }, was, 'a corpse walked');
});
