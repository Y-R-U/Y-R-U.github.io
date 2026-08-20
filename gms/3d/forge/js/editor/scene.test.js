import test from 'node:test';
import assert from 'node:assert/strict';
import { normalise, SCENE_VERSION, TYPES, TYPE_IDS, blockOf, BLK, HOUSE_MIN_W } from './scene.js';

const v2 = () => ({
  version: 2,
  name: 'Old',
  districts: [
    { zone: 'light', cx: -520, seed: 7, dressSeed: 9, road: [[0, 0], [0, 10]], roadWidth: 3.6, kerbs: [], bridge: { x: -286, z: 38, halfSpan: 12 } },
    { zone: 'neutral', cx: 0, seed: 8, dressSeed: 10 },
  ],
  objects: [
    { id: 1, dist: 0, zone: 'light', type: 'house', x: -520, z: -60, ry: 0, seed: 11, p: { w: 12, d: 10.5, h: 9 } },
    { id: 2, dist: 1, zone: 'neutral', type: 'mass', x: 130, z: 40, ry: 0.2, seed: 12, p: { w: 8, d: 7, h: 5 } },
  ],
});

test('a v2 document migrates to v3 and keeps every object', () => {
  const { doc, error, dropped, warnings } = normalise(v2());
  assert.equal(error, undefined);
  assert.equal(dropped, 0);
  assert.equal(doc.version, SCENE_VERSION);
  assert.equal(doc.objects.length, 2);
  assert.ok(warnings.some(w => w.includes('v2 → v3')));
});

test('the migration adds blk, lod and town, and blk follows position', () => {
  const { doc } = normalise(v2());
  const [a, b] = doc.objects;
  assert.equal(a.lod, 'auto');
  assert.equal(b.lod, 'auto');
  assert.equal(a.town, 'light');
  assert.equal(b.town, 'neutral');
  assert.equal(a.blk, blockOf(-520, -60));
  assert.notEqual(a.blk, b.blk);
  // computed, not authored: two objects in the same 60 m cell share a block
  assert.equal(blockOf(10, 10), blockOf(10 + BLK - 11, 10));
  assert.notEqual(blockOf(10, 10), blockOf(10 + BLK, 10));
});

test('an authored lod is kept and junk falls back to auto', () => {
  const raw = v2();
  raw.objects[0].lod = 'proxy';
  raw.objects[1].lod = 'nonsense';
  const { doc } = normalise(raw);
  assert.equal(doc.objects[0].lod, 'proxy');
  assert.equal(doc.objects[1].lod, 'auto');
});

test('a v1 document still migrates all the way to v3', () => {
  const raw = v2();
  raw.version = 1;
  delete raw.objects[0].seed;
  const { doc, warnings } = normalise(raw);
  assert.equal(doc.version, 3);
  assert.equal(warnings.length, 2);
  assert.ok(doc.objects[0].seed > 0);
});

test('the six new v3 types round-trip through normalise with their defaults', () => {
  const added = ['mill', 'barn', 'pen', 'cross', 'arcade', 'retaining'];
  for (const t of added) assert.ok(TYPES[t], `${t} is a type`);
  const raw = v2();
  raw.objects = added.map((type, i) => ({ id: i + 1, dist: 0, zone: 'light', type, x: i * 20, z: 0, ry: 0, seed: i + 1, p: {} }));
  const { doc, dropped } = normalise(raw);
  assert.equal(dropped, 0);
  assert.equal(doc.objects.length, added.length);
  for (const o of doc.objects) {
    for (const s of TYPES[o.type].params) assert.equal(o.p[s.key], s.def, `${o.type}.${s.key}`);
    const [hw, hd] = TYPES[o.type].plan(o.p);
    assert.ok(hw > 0 && hd > 0, `${o.type} has a plan`);
    assert.ok(TYPES[o.type].tall(o.p) > 0, `${o.type} has a height`);
  }
});

test('every type declares params, plan and tall', () => {
  for (const id of TYPE_IDS) {
    const t = TYPES[id];
    assert.ok(Array.isArray(t.params) && t.params.length, `${id} params`);
    const p = Object.fromEntries(t.params.map(s => [s.key, s.def]));
    for (const s of t.params) {
      assert.ok(s.def >= s.min && s.def <= s.max, `${id}.${s.key} default in range`);
    }
    assert.equal(t.plan(p).length, 2);
    assert.ok(Number.isFinite(t.tall(p)));
  }
});

test('normalise still rejects junk', () => {
  assert.equal(normalise(null).doc, null);
  assert.equal(normalise({}).doc, null);
  assert.equal(normalise({ objects: 'no' }).doc, null);
  assert.ok(normalise({ version: 99, objects: [] }).error.includes('newer build'));

  const raw = v2();
  raw.objects.push(
    { id: 3, dist: 0, zone: 'light', type: 'wormhole', x: 0, z: 0, p: {} },
    { id: 4, dist: 0, zone: 'chartreuse', type: 'house', x: 0, z: 0, p: {} },
    null,
  );
  const { doc, dropped, warnings } = normalise(raw);
  assert.equal(dropped, 3);
  assert.equal(doc.objects.length, 2);
  assert.ok(warnings.some(w => w.includes('wormhole')));
  assert.ok(warnings.some(w => w.includes('chartreuse')));
});

test('normalise repairs bad numbers rather than throwing', () => {
  const raw = v2();
  raw.objects[0].x = 'over there';
  raw.objects[0].p.w = NaN;
  raw.objects[1].dist = 99;
  raw.objects[1].id = -4;
  const { doc } = normalise(raw);
  assert.equal(doc.objects[0].x, 0);
  assert.equal(doc.objects[0].p.w, TYPES.house.params.find(s => s.key === 'w').def);
  assert.equal(doc.objects[1].dist, doc.districts.length - 1);
  assert.ok(doc.objects[1].id > 0);
});

test('a house under the camera minimum is kept but warned about', () => {
  const raw = v2();
  raw.objects[0].p.w = HOUSE_MIN_W - 2;
  const { doc, warnings } = normalise(raw);
  assert.equal(doc.objects.length, 2);
  assert.ok(warnings.some(w => w.includes(String(HOUSE_MIN_W))));
});

test('a v3 document re-normalises to itself', () => {
  const once = normalise(v2()).doc;
  const twice = normalise(JSON.parse(JSON.stringify(once))).doc;
  assert.deepEqual(twice, once);
});

test('the bridge record carries its rotation and deck height', () => {
  const raw = v2();
  raw.districts[0].bridge.ry = 0.7;
  raw.districts[0].bridge.deck = 14;
  const { doc } = normalise(raw);
  assert.equal(doc.districts[0].bridge.ry, 0.7);
  assert.equal(doc.districts[0].bridge.deck, 14);
  // and defaults to flat and standard when absent
  assert.equal(normalise(v2()).doc.districts[0].bridge.ry, 0);
  assert.equal(normalise(v2()).doc.districts[0].bridge.deck, 0);
});
