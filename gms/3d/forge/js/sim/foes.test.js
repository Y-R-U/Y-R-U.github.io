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

test('a rat ignores you until you are close, then closes and bites', () => {
  const a = rat(0, 0);
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
