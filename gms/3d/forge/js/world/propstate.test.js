// props.js had no automated coverage at all — it imports three — so deleting its `verb !== 'kindle'`
// guard left the suite fully green and let a Barter tap light the granary lamp. These drive the
// rules against the shipped data/props.json rather than a fixture that agrees with the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LIT_VERB, hasState, findProp, propItem, targetList, useProp, armProp } from './propstate.js';
import { lintAll } from '../../tools/lintQuests.mjs';
import { placeAll } from '../game/placement.js';

const SHIPPED = lintAll();
const ENTRIES = placeAll(
  JSON.parse(readFileSync(new URL('../../data/props.json', import.meta.url), 'utf8')), SHIPPED.areas).placed;

// What Props.build() ends up holding, minus the geometry: the ground sample is the only field the
// renderer contributes.
const items = () => ENTRIES.map(e => propItem(e, 4, e.town));

test('the granary lamp answers Kindle and refuses every other school', () => {
  const list = items();
  const lit = new Set();
  for (const verb of ['barter', 'ward', 'line', 'cull', 'mend', '', null, undefined]) {
    assert.equal(useProp(list, lit, 'wwa.granary.lamp', verb), false, `${verb} lit the lamp`);
  }
  assert.equal(lit.size, 0, 'and nothing is alight after any of them');

  assert.equal(useProp(list, lit, 'wwa.granary.lamp', LIT_VERB), true);
  assert.deepEqual([...lit], ['wwa.granary.lamp']);
  assert.equal(useProp(list, lit, 'wwa.granary.lamp', LIT_VERB), false, 'a second Kindle changes nothing');
});

test('nothing else in the kit has a state a Kindle can change', () => {
  const list = items();
  const lit = new Set();
  const changed = list.filter(i => useProp(list, lit, i.id, LIT_VERB)).map(i => i.kit);
  assert.deepEqual([...new Set(changed)], ['lamp'], 'a Kindle at a crate must do nothing at all');
  assert.equal(lit.size, list.filter(i => hasState(i.kit)).length);
  assert.ok(lit.size >= 3, 'the three shipped lamps');
});

test('arm puts a lamp out, and says so even when there was nothing to undo', () => {
  const list = items();
  const lit = new Set();
  useProp(list, lit, 'wwa.granary.lamp', LIT_VERB);
  assert.equal(armProp(list, lit, 'wwa.granary.lamp'), true);
  assert.equal(lit.size, 0);
  assert.equal(armProp(list, lit, 'wwa.granary.lamp'), true, 'a reset of an unlit lamp still happened');
  assert.equal(armProp(list, lit, 'lac.henhouse.hen'), false, 'an id nothing places is a refusal');
});

// Every id a step arms has to be an id `arm` can find, or `recover` reports a reset it did not do.
test('every object a step arms is one this can act on, or the world says no', () => {
  const list = items();
  const armed = new Set();
  for (const def of Object.values(SHIPPED.defs)) {
    for (const s of def.steps) for (const a of s.recover || []) if (a[0] === 'arm') armed.add(a[1]);
  }
  const refused = [...armed].filter(id => !armProp(list, new Set(), id));
  assert.deepEqual(refused, ['lac.henhouse.hen'], 'the escort hen is the one known gap');
});

test('the context button reads the authored label, and its defaults', () => {
  const list = targetList(items());
  const lamp = list.find(t => t.id === 'wwa.granary.lamp');
  assert.deepEqual(lamp, { id: 'wwa.granary.lamp', kind: 'interact', label: 'light', x: lamp.x, z: lamp.z, range: 3.6 });
  assert.equal(list.find(t => t.id === 'wwa.board').kind, 'talk', 'the Yard post routes to the offer dialogue');
  assert.equal(findProp(items(), 'nothing.at.all'), null);

  const bare = propItem({ id: 'x', kit: 'crate', area: 'a', x: 1, z: 2 }, 3, 'light');
  assert.equal(bare.label, 'use');
  assert.equal(bare.kind, 'interact');
  assert.equal(bare.range, 3.6);
});
