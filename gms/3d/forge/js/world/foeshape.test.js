import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FOES, isRobed, shapeOf, silhouette, lampAt, LAMP_STAFF, CAGE } from './foeshape.js';
import { FIGURE } from './figure.js';
import { ZONE_IDS } from './zones.js';
import { ENEMIES } from '../sim/tables.js';

const PEOPLE = Object.keys(ENEMIES).filter(id => ENEMIES[id].geo === 'people');

test('every `geo: people` row in the bestiary has a body', () => {
  assert.ok(PEOPLE.length >= 6, 'the bestiary changed shape — this test needs rewriting');
  for (const id of PEOPLE) assert.ok(isRobed(id), `${id} is geo: 'people' and the rig cannot draw one`);
  for (const id of Object.keys(FOES)) {
    assert.equal(ENEMIES[id]?.geo, 'people', `${id} is a body for a row that is not on this rig`);
  }
});

test('every variant paints out of a zone that exists', () => {
  for (const [id, v] of Object.entries(FOES)) {
    assert.ok(ZONE_IDS.includes(v.zone), `${id} paints out of ${v.zone}`);
    assert.ok(v.run > 0, `${id} has no chase speed`);
    assert.ok(v.scale > 0, `${id} has no size`);
  }
});

// The mantle is the collar the body hangs inside. Widen the robe past it and the chest ring comes
// out through the drape, which is what a hem multiplier applied to the whole profile would do.
test('the mantle stays wider than the shoulders it is draped over', () => {
  for (const id of Object.keys(FOES)) {
    const S = shapeOf(FOES[id]);
    const chest = S.robe[S.robe.length - 1];
    assert.ok(S.hood[0].r > chest.r,
      `${id}: chest ring ${chest.r.toFixed(3)} is wider than its mantle ${S.hood[0].r.toFixed(3)}`);
    assert.ok(S.hood[0].y >= chest.y, `${id}: the mantle sits below the chest ring`);
    assert.ok(S.under < S.hood[0].y, `${id}: the collar hub is not under the collar`);
  }
});

// A variant nobody can tell from another at fifteen metres is not a variant. Height and width are
// the whole of the read at that distance.
test('no two variants have the same silhouette', () => {
  const all = Object.keys(FOES).map(id => [id, silhouette(id)]);
  for (const [id, s] of all) {
    assert.ok(s.height > 0.8 && s.height < 3.2, `${id} is ${s.height.toFixed(2)} m tall`);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a, sa] = all[i], [b, sb] = all[j];
      const dh = Math.abs(sa.height - sb.height) / sa.height;
      const dw = Math.abs(sa.width - sb.width) / sa.width;
      assert.ok(dh > 0.06 || dw > 0.06,
        `${a} and ${b} are the same shape: ${sa.height.toFixed(2)}×${sa.width.toFixed(2)} vs ${sb.height.toFixed(2)}×${sb.width.toFixed(2)}`);
    }
  }
});

test('a Hollow is the blob and a Watchman is the tallest thing in the bestiary', () => {
  const h = silhouette('hollow'), w = silhouette('watchman'), r = silhouette('raider');
  assert.ok(h.height < r.height * 0.8, 'a Hollow is not short');
  assert.ok(h.width > r.width * 1.2, 'a Hollow is not round');
  assert.ok(w.height > r.height, 'the Watch has to read over a raider at distance');
});

test('the Watch lamp sits inside its own cage', () => {
  const v = FOES.watchman;
  const y = lampAt(v)[1];
  assert.ok(y > (LAMP_STAFF + CAGE[0]) * v.tall && y < (LAMP_STAFF + CAGE[1]) * v.tall,
    `the flame is at ${y.toFixed(2)} and the cage runs ${(LAMP_STAFF + CAGE[0]) * v.tall} … ${(LAMP_STAFF + CAGE[1]) * v.tall}`);
});

test('the shared profile is only stretched, never rewritten', () => {
  const S = shapeOf({});
  assert.deepEqual(S.robe.map(r => r.y), FIGURE.robe.map(r => r.y));
  assert.deepEqual(S.hood.map(r => r.r), FIGURE.hood.map(r => r.r));
  assert.equal(S.cavity, FIGURE.cavity);
});
