// The assign() trap. vermin.js re-sorts its pool by camera distance every 1.5 s and slices it to
// the `vermin` knob — which is fine for ambience and would silently delete the creature you are
// fighting. These are the assertions that stop that coming back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { roster, buckets, pinned, seatsLeft, PER_MESH,
  crowdSeats, crowdSeatsLeft, PER_CROWD_MESH } from './roster.js';
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

// The people rig. `crowd()` on its own only promises a named body is at the front of `active`,
// which is not a seat: the review forced 45 named NPCs into one bucket and 13 came out targetable
// and drawn by nothing, Bel first, because place() unshifts.

const MESHES = 6;
const named = (id, zi = 0, vi = 0) => ({ npc: id, kind: 'idle', x: 0, z: 0, zi, vi });
const idler = (i, zi = 0, vi = 0) => ({ kind: 'stroll', x: i, z: 0, zi, vi });

test('the crowd knob resizes the wanderers and never unseats a named body', () => {
  const cast = Array.from({ length: 18 }, (_, i) => named(`n${i}`, i % 3, i & 1));
  const agents = [...cast, ...Array.from({ length: 100 }, (_, i) => idler(i, i % 3, i & 1))];

  for (const n of [0, 4, 36, 120, 400]) {
    const { active, lists } = crowdSeats(agents, n, 120, MESHES, PER_CROWD_MESH);
    for (const a of cast) {
      assert.ok(active.includes(a), `${a.npc} is out of the world at crowd = ${n}`);
      assert.ok(lists[a.zi * 2 + a.vi].includes(a), `${a.npc} is in active and drawn by nothing at crowd = ${n}`);
    }
  }
  assert.equal(crowdSeats(agents, 0, 120, MESHES).active.length, 18, 'crowd = 0 is the cast and nobody else');
  assert.equal(crowdSeats(agents, 12, 120, MESHES).active.length, 30);
  assert.equal(crowdSeats(agents, 400, 120, MESHES).active.length, 118, 'and the pool cap is still the pool cap');
});

test('a bucket runs out of seats and the named body is refused rather than left invisible', () => {
  const agents = [];
  for (let i = 0; i < PER_CROWD_MESH; i++) {
    assert.ok(crowdSeatsLeft(agents, 0, 0) > 0, `seat ${i} should have been free`);
    agents.unshift(named(`n${i}`));
  }
  assert.equal(crowdSeatsLeft(agents, 0, 0), 0, 'the 33rd named body in one bucket has nowhere to go');
  assert.equal(crowdSeatsLeft(agents, 0, 1), PER_CROWD_MESH, 'the other variant is another mesh');
  assert.equal(crowdSeatsLeft(agents, 1, 0), PER_CROWD_MESH, 'and so is the next zone');

  // What refusing protects: the oldest body is the one the overflow would have taken the seat off.
  const first = agents[agents.length - 1];
  const { lists } = crowdSeats([named('late'), ...agents], 0, 120, MESHES);
  assert.equal(lists[0].includes(first), false, 'unseated, exactly as the review showed');

  const wanderers = Array.from({ length: 40 }, (_, i) => idler(i));
  assert.equal(crowdSeatsLeft([...agents.slice(0, 4), ...wanderers], 0, 0), PER_CROWD_MESH - 4,
    'a wanderer never held a named body\'s seat');
});

// people.js imports three, so this is the only way to pin that the rig actually uses the two
// functions above. Reverting setCrowd to its own `agents.slice()` left the suite green while
// `crowd = 0` deleted all eighteen named bodies from the world.
test('the people rig seats its crowd through this file rather than by hand', () => {
  const src = readFileSync(new URL('./people.js', import.meta.url), 'utf8');
  const body = name => {
    const i = src.indexOf(`\n  ${name}(`);
    assert.ok(i > 0, `people.js no longer has ${name}() — this test needs rewriting`);
    return src.slice(i, src.indexOf('\n  }', i));
  };
  assert.match(body('setCrowd'), /crowdSeats\(/);
  assert.doesNotMatch(body('setCrowd'), /\.slice\(|\bcrowd\(/, 'setCrowd is doing its own slicing again');
  assert.match(body('place'), /crowdSeatsLeft\(/, 'place() places named bodies it has no seat for');
});
