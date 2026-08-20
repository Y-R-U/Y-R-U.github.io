// The three rules nodes.js used to hold, against the real data/gather.json. The review set every
// node's range to 0 — which makes the whole gather verb unreachable — and the suite stayed 430/430
// green, because nothing in node could import the file they lived in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { NODE_RANGE, nodeUi, nodeLabel, pipped, nodeItem, targetList, findNode } from './nodestate.js';
import { placeAll } from '../game/placement.js';
import { pickContext } from '../game/context.js';
import { KIND } from '../game/gathering.js';
import { lintAll } from '../../tools/lintQuests.mjs';

const SHIPPED = lintAll();
const PLACED = placeAll(
  JSON.parse(readFileSync(new URL('../../data/gather.json', import.meta.url), 'utf8')), SHIPPED.areas).placed;
const ITEMS = PLACED.map(e => nodeItem(e, 0, 'light'));

test('every placed node can be walked up to and offered by the context button', () => {
  assert.ok(ITEMS.length >= 20, 'the pack is not being read');
  const list = targetList(ITEMS);
  for (const it of ITEMS) {
    const picked = pickContext(list, { x: it.x, z: it.z });
    assert.equal(picked?.id, it.id, `standing on ${it.id} offers ${picked?.id || 'nothing'}`);
  }
  // And the reach is the reach it says it is, measured against nothing else in the world.
  const solo = targetList([ITEMS[0]]);
  const away = d => pickContext(solo, { x: ITEMS[0].x + d, z: ITEMS[0].z });
  assert.equal(away(NODE_RANGE - 0.2)?.id, ITEMS[0].id);
  assert.equal(away(NODE_RANGE + 0.2), null);
});

test('a fire fires the cook verb and everything else is worked', () => {
  assert.equal(nodeUi('hearth'), 'cook');
  for (const kind of Object.keys(KIND)) {
    assert.equal(nodeUi(kind), kind === 'hearth' ? 'cook' : 'work');
  }
  const fires = ITEMS.filter(i => i.kind === 'hearth');
  assert.equal(fires.length, 3, 'the three kitchens');
  for (const f of fires) assert.equal(f.ui, 'cook');
});

// Defect 3. `working` is a spot with the line already out; labelling that `spent` renamed the
// button under the thumb the moment the player used it, for the whole 7 s of a Line 1 cast.
test('only a node that has been picked says spent', () => {
  const spot = ITEMS.find(i => i.kind === 'fish');
  assert.equal(nodeLabel({ ...spot, state: 'ready' }), spot.label);
  assert.equal(nodeLabel({ ...spot, state: 'working' }), spot.label);
  assert.equal(nodeLabel({ ...spot, state: 'cooling' }), 'spent');
  const casting = targetList(ITEMS.map(i => (i === spot ? { ...i, state: 'working' } : i)));
  assert.equal(casting.find(t => t.id === spot.id).label, KIND.fish.label);
});

test('a fire wears no ready pip and everything else does', () => {
  for (const it of ITEMS) assert.equal(pipped(it), it.kind !== 'hearth');
  assert.equal(ITEMS.filter(pipped).length, ITEMS.length - 3);
});

test('a kind nothing knows how to work is refused rather than drawn', () => {
  assert.equal(nodeItem({ id: 'x', kind: 'quarry', x: 0, z: 0 }, 0, 'light'), null);
  assert.ok(nodeItem({ id: 'x', kind: 'forage', x: 0, z: 0 }, 0, 'light'));
});

test('a node is found by id', () => {
  assert.equal(findNode(ITEMS, ITEMS[2].id), ITEMS[2]);
  assert.equal(findNode(ITEMS, 'nothing.at.all'), null);
});
