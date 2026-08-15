// The assign() trap. vermin.js re-sorts its pool by camera distance every 1.5 s and slices it to
// the `vermin` knob — which is fine for ambience and would silently delete the creature you are
// fighting. These are the assertions that stop that coming back.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roster, buckets, pinned, seatsLeft, PER_MESH } from './roster.js';
import { STATE, arm } from '../sim/foes.js';

const cam = (x, z) => ({ position: { x, z } });
const wanderer = (x, z, kind = 'rat', zi = 0) => ({ x, z, kind, zi });
const foe = (x, z, kind = 'rat', zi = 0) => arm({ x, z, kind, zi, home: [x, z] }, 'grain_rat');

test('an engaged creature is in the draw list even when the ambience budget is zero', () => {
  const fighting = foe(0, 0);
  const agents = [wanderer(1, 1), fighting, wanderer(2, 2)];
  const list = roster(agents, 0, cam(0, 0), 48);
  assert.deepEqual(list, [fighting]);
});

test('and the 1.5 s re-sort cannot put it behind a wanderer standing nearer the camera', () => {
  const fighting = foe(90, 90);
  const agents = [fighting, ...Array.from({ length: 40 }, (_, i) => wanderer(i * 0.1, 0))];
  for (const c of [cam(0, 0), cam(90, 90), null]) {
    const list = roster(agents, 8, c, 48);
    assert.equal(list.length, 8);
    assert.equal(list[0], fighting, 'the fight is always at the front');
  }
});

test('every engaged creature keeps a seat, however many there are', () => {
  const fights = Array.from({ length: 12 }, (_, i) => foe(200 + i, 200));
  const agents = [...Array.from({ length: 48 }, (_, i) => wanderer(i, 0)), ...fights];
  const list = roster(agents, 4, cam(0, 0), 48);
  assert.equal(list.length, 12, 'the budget rises to hold them rather than cutting them');
  for (const f of fights) assert.ok(list.includes(f));
});

test('a fight never loses its InstancedMesh seat to a wanderer', () => {
  const fights = Array.from({ length: 4 }, (_, i) => foe(50 + i, 0));
  const agents = [...Array.from({ length: 30 }, (_, i) => wanderer(i, 0)), ...fights];
  const list = roster(agents, 30, cam(0, 0), 48);
  const by = buckets(list, 16);
  const seated = by.get('rat:0');
  assert.equal(seated.length, 16, 'the mesh is full');
  for (const f of fights) assert.ok(seated.includes(f), 'and the fight is inside it');
});

test('the pool cap is still the pool cap', () => {
  const agents = Array.from({ length: 90 }, (_, i) => wanderer(i, 0));
  assert.equal(roster(agents, 200, null, 48).length, 48);
});

test('a body stops being pinned once the world has finished with it', () => {
  const a = foe(0, 0);
  assert.equal(pinned(a), true);
  a.state = STATE.dying;
  assert.equal(pinned(a), true, 'a death animation still has to be drawn');
  a.state = STATE.dead;
  assert.equal(pinned(a), false);
  assert.deepEqual(roster([a], 0, null, 48), []);
});

test('an agent that never entered a fight is ordinary ambience', () => {
  assert.equal(pinned(wanderer(0, 0)), false);
});

// Vermin.add() is `if (seatsLeft(...) <= 0) return null` and nothing else, so this is the refusal
// itself. The rig cannot be loaded in node — it imports three — and the stub rig in
// js/game/combat.test.js always says yes, so without these the cap is tested nowhere.
test('a (kind, zone) mesh runs out of seats and the spawner is told no', () => {
  const agents = [];
  for (let i = 0; i < PER_MESH; i++) {
    assert.ok(seatsLeft(agents, 'rat', 0) > 0, `seat ${i} should have been free`);
    agents.push(foe(i, 0));
  }
  assert.equal(seatsLeft(agents, 'rat', 0), 0, 'the 17th rat in one zone is refused');
  assert.equal(seatsLeft(agents, 'rat', 1), PER_MESH, 'the same kind in the next zone is a new mesh');
  assert.equal(seatsLeft(agents, 'boar', 0), PER_MESH, 'and so is another kind in this one');
});

test('a corpse holds its seat and a wanderer never had one', () => {
  const dead = foe(0, 0);
  dead.state = STATE.dead;
  const agents = [dead, ...Array.from({ length: 30 }, (_, i) => wanderer(i, 0))];
  assert.equal(seatsLeft(agents, 'rat', 0), PER_MESH - 1,
    'the body being buried keeps its seat until the spawner removes it');

  // What the cap is protecting: buckets() only ever draws PER_MESH of them.
  const fights = Array.from({ length: PER_MESH }, (_, i) => foe(i, 0));
  assert.equal(buckets(roster(fights, 0, null, 48), PER_MESH).get('rat:0').length, PER_MESH);
});
