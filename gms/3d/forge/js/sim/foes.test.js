import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ACT, ACT_T, AI, STATE, arm, hurt, think, isLive, carry, CHARGES } from './foes.js';
import { ENEMIES } from './tables.js';
import { resolveHit, power, tapsToKill } from './combat.js';

const rat = (x = 0, z = 0) => arm({ x, z, home: [x, z] }, 'grain_rat');
const run = (a, at, dt = 1 / 60, n = 1) => {
  let dealt = 0;
  for (let i = 0; i < n; i++) dealt += think(a, dt, { px: at[0], pz: at[1], run: 1.9 });
  return dealt;
};

test('a creature comes out of the table it is named in', () => {
  const a = rat();
  assert.equal(a.hp, ENEMIES.grain_rat.hp);
  assert.equal(a.maxHp, ENEMIES.grain_rat.hp);
  assert.equal(a.armour, ENEMIES.grain_rat.armour);
  assert.equal(a.bite, ENEMIES.grain_rat.damage);
  assert.equal(a.state, STATE.idle);
  assert.equal(arm({}, 'no_such_thing'), null);
});

test('vermin wait to be provoked and everything with a grudge charges', () => {
  assert.equal(rat().hostile, false);
  assert.equal(arm({ x: 0, z: 0 }, 'blight_boar').hostile, true);
  for (const id of CHARGES) assert.ok(ENEMIES[id], `${id} is not an enemy`);
});

// This test used to walk a *passive* rat from idle to alert at 4 m and call that correct, which is
// the bug it was written over: `hostile` only widened the engage range instead of deciding whether
// there was a fight at all, so eight rats mobbed a level-1 player the moment he was put in the
// granary. See docs/NOTES_SAFE_START.md.
test('a rat you have not touched never starts a fight, at any distance', () => {
  const a = rat(0, 0);
  for (const d of [AI.notice + 2, 4, AI.reach, 0]) {
    assert.equal(run(a, [0, d], 1 / 60, 600), 0, `a passive rat at ${d} m dealt damage`);
    assert.equal(a.state, STATE.idle, `a passive rat at ${d} m left idle`);
  }
  assert.equal(a.hostile, false);
});

// Gating on `hostile` also has to keep the long radius for the things that hunt you, or every
// robed enemy in the game freezes: js/world/robed.js has no wander at all, so an idle one never
// moves, and the spawner drops most of them in the 7–26 m band. Four `survive` steps and the Drove
// Road escort went to zero damage the pass this was missed. See docs/REVIEW_SAFE_START.md.
test('a creature that hunts you closes from `charge`, and a grudge alone does not', () => {
  const boar = arm({ x: 0, z: 0 }, 'blight_boar');
  assert.equal(boar.charges, true);
  run(boar, [0, AI.charge - 0.5], 1 / 60, 1);
  assert.equal(boar.state, STATE.alert, `a boar at ${AI.charge - 0.5} m left idle`);
  run(boar, [0, AI.charge - 0.5], 1 / 60, Math.ceil(AI.alert * 60) + 1);
  assert.equal(boar.state, STATE.chase);
  assert.ok(boar.speed > 0, 'and it comes');

  const far = arm({ x: 0, z: 0 }, 'blight_boar');
  run(far, [0, AI.charge + 1], 1 / 60, 600);
  assert.equal(far.state, STATE.idle, 'a charge is its own radius, not the whole leash');
  assert.ok(AI.charge <= AI.leash, 'a charge past the leash re-engages on the frame it gives up');

  const knot = arm({ x: 0, z: 0 }, 'rat_knot');
  assert.equal(knot.charges, false);
  knot.hostile = true;
  run(knot, [0, AI.notice + 2], 1 / 60, 600);
  assert.equal(knot.state, STATE.idle, 'a rat you hit and outran is not a champion');
});

// Passive is one creature, not a class. L01 stands the player in eight grain rats at 52 HP before
// teaching the tap; nothing else in the game is met that way, and making all vermin unprovokable
// took `light.05`'s two strays and the Drove Road knots with it.
test('the grain is the one nest that waits to be provoked', () => {
  const mire = arm({ x: 0, z: 0 }, 'mire_rat');
  assert.equal(mire.hostile, true);
  run(mire, [0, AI.notice - 1], 1 / 60, 1);
  assert.equal(mire.state, STATE.alert, 'a mire rat you walked up to left idle');

  const far = arm({ x: 0, z: 0 }, 'mire_rat');
  run(far, [0, AI.notice + 2], 1 / 60, 600);
  assert.equal(far.state, STATE.idle, 'but it does not cross the field for you');

  assert.equal(rat().hostile, false, 'and the granary is the exception');
});

test('a rat that has been provoked closes and bites', () => {
  const a = rat(0, 0);
  a.hostile = true;
  a.state = STATE.idle;

  run(a, [0, AI.notice + 2], 1 / 60, 30);
  assert.equal(a.state, STATE.idle, 'out of sight is out of mind');

  run(a, [0, 4], 1 / 60, 1);
  assert.equal(a.state, STATE.alert);
  run(a, [0, 4], 1 / 60, Math.ceil(AI.alert * 60) + 1);
  assert.equal(a.state, STATE.chase);
  assert.ok(a.speed > 0, 'and it runs');

  a.x = 0; a.z = 3.4;
  run(a, [0, 4], 1 / 60, 1);
  assert.equal(a.state, STATE.attack);
  assert.equal(a.act, ACT.attack);

  let dealt = 0;
  for (let i = 0; i < 120 && !dealt; i++) dealt = run(a, [0, 4]);
  assert.equal(dealt, ENEMIES.grain_rat.damage, 'the bite is the table\'s damage, unmitigated');
});

test('backing out of the windup is a miss', () => {
  const a = rat(0, 3.4);
  a.hostile = true;
  for (let i = 0; i < 60 && a.state !== STATE.attack; i++) run(a, [0, 4]);
  assert.equal(a.state, STATE.attack);
  let dealt = 0;
  for (let i = 0; i < 120 && !dealt; i++) dealt = run(a, [0, 40]);
  assert.equal(dealt, 0, 'and the leash has let it go');
  assert.equal(a.state, STATE.idle);
  assert.equal(a.hostile, true, 'but it has not forgiven you');
});

test('a creature that takes its own hit points in damage dies exactly once', () => {
  const a = rat();
  const e = ENEMIES.grain_rat;
  assert.deepEqual(hurt(a, e.hp - 1), { killed: false, hit: true });
  assert.equal(a.state, STATE.chase, 'and it now knows where you are');
  assert.equal(a.hostile, true);

  assert.deepEqual(hurt(a, 1), { killed: true, hit: true });
  assert.equal(a.hp, 0);
  assert.equal(a.act, ACT.die);
  assert.deepEqual(hurt(a, 999), { killed: false, hit: false }, 'a second bolt into a body kills nothing');
  assert.deepEqual(hurt(a, 999), { killed: false, hit: false });
});

test('the death pose is held, and then the body goes', () => {
  const a = rat();
  hurt(a, ENEMIES.grain_rat.hp);
  run(a, [0, 1], 1 / 60, Math.ceil(ACT_T[ACT.die] * 60) + 1);
  assert.equal(a.state, STATE.dying);
  assert.equal(a.at, 1, 'the die pose holds at its end rather than looping');
  assert.equal(isLive(a), false);

  run(a, [0, 1], 1 / 60, Math.ceil(AI.corpse * 60) + 2);
  assert.equal(a.state, STATE.dead);
  assert.equal(run(a, [0, 1]), 0, 'a body bites nothing');
});

test('a level-1 Kindle bolt kills a grain rat in the number of taps the table says', () => {
  const a = rat();
  const taps = tapsToKill(1, 'grain_rat');
  let n = 0;
  while (isLive(a) && n < 20) {
    const r = resolveHit({ power: power(1), coef: 1, armour: a.armour, critChance: 0 });
    hurt(a, r.damage);
    n++;
  }
  assert.equal(n, taps);
  assert.equal(a.state, STATE.dying);
});

// Three rigs had a copy of these four lines and no node test could reach any of them: setting
// `SPEED` to 0, or dropping the position write, left the whole suite green while nothing in the
// world could follow or chase you.
test('a body is carried along the heading and the speed think() gave it', () => {
  const a = { x: 10, z: -4, heading: 0, speed: 3, act: ACT.none };
  const north = carry(a, 0.5);
  assert.deepEqual([+north.x.toFixed(6), +north.z.toFixed(6)], [10, -2.5], 'heading 0 is +z');

  const east = carry({ ...a, heading: Math.PI / 2 }, 0.5);
  assert.deepEqual([+east.x.toFixed(6), +east.z.toFixed(6)], [11.5, -4]);
  assert.equal(Math.hypot(east.x - a.x, east.z - a.z).toFixed(4), (3 * 0.5).toFixed(4));

  assert.equal(carry({ ...a, speed: 0 }, 0.5), null, 'a standing body is not moved');
  assert.equal(carry({ ...a, speed: 0.005 }, 0.5), null, 'and neither is a rounding error');
  assert.equal(carry({ ...a, act: ACT.die }, 0.5), null, 'a body going over does not keep walking');
});
