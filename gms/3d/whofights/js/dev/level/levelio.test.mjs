import { test, eq, ok, near } from '../../../tools/harness.mjs';
import { normalise } from '../../editor/scene.js';
import {
  slugify, uniqueId, deriveId, seedLevel, duplicateLevel, indexEntry, indexUpsert, indexRemove,
  indexMove, exportObjects, sameObjects, sameAsLoaded, textObjects, deleteImpact,
  retargetLevel, yawTowards, yawDegrees,
} from './levelio.js';

test('slugify keeps a level id filename-safe', () => {
  eq(slugify('Adventurer Academy'), 'adventurer-academy');
  eq(slugify('  The Keep!! '), 'the-keep');
  eq(slugify('Café Noir'), 'cafe-noir');
  eq(slugify('...'), 'level', 'nothing usable falls back rather than making an empty filename');
  eq(slugify(''), 'level');
  eq(slugify(null), 'level');
  eq(slugify('A'.repeat(80)).length, 40);
  eq(slugify('__scratch'), '__scratch', 'an underscore is a legal id character and a scratch file leans on it');
});

test('an id never collides with one already taken', () => {
  eq(uniqueId('keep', []), 'keep');
  eq(uniqueId('keep', ['keep']), 'keep-2');
  eq(uniqueId('keep', ['keep', 'keep-2', 'keep-3']), 'keep-4');
  eq(deriveId('The Keep', ['the-keep']), 'the-keep-2');
});

test('a seeded level survives the loader untouched', () => {
  const doc = seedLevel('keep', 'The Keep');
  const r = normalise(doc);
  ok(r.doc, `seeded level did not normalise: ${r.error}`);
  eq(r.dropped, 0);
  eq(r.warnings, []);
  eq(r.doc.id, 'keep');
  eq(r.doc.name, 'The Keep');
  eq(r.doc.version, 1, 'the scene loader refuses a version it does not know');
  eq(r.doc.hotspots, []);
});

test('duplicate is a deep copy under a new id', () => {
  const a = seedLevel('keep', 'The Keep');
  a.hotspots.push({ id: 'hs.x', shape: { k: 'circle', x: 0, z: 0, r: 2 }, actions: [] });
  const b = duplicateLevel(a, 'keep-2', 'The Keep copy');
  b.hotspots[0].id = 'hs.y';
  eq(a.hotspots[0].id, 'hs.x', 'the original must not follow the copy');
  eq(b.id, 'keep-2');
  eq(b.name, 'The Keep copy');
});

test('index entries carry the id, the name and the start', () => {
  const doc = seedLevel('keep', 'The Keep');
  doc.start = { x: -9.00001, z: 21, yaw: 3.14159 };
  eq(indexEntry(doc), { id: 'keep', name: 'The Keep', start: { x: -9, z: 21, yaw: 3.14159 } });
});

test('index upsert adds once and then updates in place', () => {
  let idx = [];
  idx = indexUpsert(idx, { id: 'a', name: 'A' });
  idx = indexUpsert(idx, { id: 'b', name: 'B' });
  idx = indexUpsert(idx, { id: 'a', name: 'A renamed' });
  eq(idx.map(e => e.id), ['a', 'b'], 'a rename must not reorder the index');
  eq(idx[0].name, 'A renamed');
  eq(indexRemove(idx, 'a').map(e => e.id), ['b']);
  eq(indexRemove(idx, 'nope').length, 2);
  eq(indexUpsert(null, { id: 'a' }).length, 1, 'a missing index is an empty one');
});

test('index order is meaningful and moves stay in bounds', () => {
  const idx = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  eq(indexMove(idx, 'c', -1).map(e => e.id), ['a', 'c', 'b']);
  eq(indexMove(idx, 'a', -1).map(e => e.id), ['a', 'b', 'c'], 'the top cannot move up');
  eq(indexMove(idx, 'c', 1).map(e => e.id), ['a', 'b', 'c'], 'the bottom cannot move down');
  eq(indexMove(idx, 'nope', 1).map(e => e.id), ['a', 'b', 'c']);
});

test('exported objects lose the derived fields and keep the authored ones', () => {
  const live = [{ id: 1, dist: 0, zone: 'light', type: 'house', lod: 'full', x: 1, z: 2, ry: 0,
    seed: 7, p: { w: 12, d: 10, h: 9, hall: 1 }, town: 'light', blk: 524800, inside: undefined }];
  const out = exportObjects(live);
  eq(Object.keys(out[0]).sort(), ['dist', 'id', 'lod', 'p', 'ry', 'seed', 'type', 'x', 'z', 'zone']);
  ok(sameObjects(live, out));
  ok(!sameObjects(live, [{ ...live[0], x: 9 }]));
  eq(exportObjects(null), []);
});

test('a raw file and the world built from it do not read as drift', () => {
  const authored = seedLevel('keep', 'The Keep');
  // A hand-written object: no lod, no blk, half its parameters left to their defaults.
  authored.objects.push({ id: 1, dist: 0, zone: 'light', type: 'sign', x: 3, z: 4, seed: 9, p: { text: 'Hi' } });
  const world = normalise(authored).doc.objects;
  ok(!sameObjects(authored.objects, world), 'the raw and loaded forms genuinely differ');
  ok(sameAsLoaded(authored, world), 'but the file is still exactly what the world was built from');
  ok(!sameAsLoaded(authored, world.map(o => ({ ...o, x: o.x + 5 }))), 'a real move is still drift');
});

test('text objects are found for every strings param', () => {
  const doc = { objects: [
    { id: 1, type: 'house', p: { w: 12 } },
    { id: 20, type: 'sign', p: { text: 'Adventurer Academy' } },
    { id: 30, type: 'billboard', p: {}, inside: 1 },
  ] };
  const t = textObjects(doc);
  eq(t.length, 2);
  eq(t[0], { id: 20, type: 'sign', key: 'text', label: 'Text', def: 'Sign', value: 'Adventurer Academy', inside: null });
  eq(t[1].value, 'Billboard', 'a missing string reads as its type default, which is what the world draws');
  eq(t[1].inside, 1);
});

test('deleting a level says what it breaks', () => {
  const refs = {
    index: [{ id: 'academy' }, { id: 'keep' }],
    levels: { keep: { hotspots: [{ actions: [{ k: 'goto', level: 'academy' }, { k: 'say', node: 'x' }] }] } },
    characters: { greeter: { place: { level: 'academy' } }, narrator: {} },
  };
  const out = deleteImpact('academy', refs);
  ok(out.some(s => s.includes('open keep instead')), out.join(' | '));
  ok(out.some(s => s.includes('greeter')));
  ok(out.some(s => s.includes('1 goto action')));
  eq(deleteImpact('keep', { index: [{ id: 'keep' }] }),
    ['it is the only level in the index — the game will not boot until another is added']);
  eq(deleteImpact('keep', refs).length, 0, 'nothing points at the second level');
});

test('facing is derived from two points, not typed', () => {
  near(yawTowards({ x: 0, z: 10 }, { x: 0, z: 0 }), Math.PI, 1e-4, 'looking towards −z is yaw π');
  near(yawTowards({ x: 0, z: 0 }, { x: 0, z: 10 }), 0, 1e-4);
  near(yawTowards({ x: 0, z: 0 }, { x: 10, z: 0 }), Math.PI / 2, 1e-4, '+x is a quarter turn');
  eq(yawDegrees(Math.PI), 180);
  eq(yawDegrees(-Math.PI / 2), 270);
});

const world = () => ({
  index: [{ id: 'academy', name: 'Academy', start: { x: 0, z: 0, yaw: 3 } },
    { id: 'keep', name: 'Keep', start: { x: 1, z: 1, yaw: 0 } }],
  levels: {
    academy: { id: 'academy', name: 'Academy', hotspots: [] },
    keep: { id: 'keep', name: 'Keep', hotspots: [
      { id: 'hs.a', actions: [{ k: 'goto', level: 'academy' }, { k: 'say', node: 'x' }] },
      { id: 'hs.b', actions: [{ k: 'goto', level: 'keep' }] }] },
  },
  characters: { greeter: { place: { level: 'academy', x: 1, z: 2 } },
    other: { place: { level: 'keep' } }, narrator: {} },
});

test('changing a level id rewrites the document, the index, every goto and every place', () => {
  const w = world();
  const r = retargetLevel('academy', 'hall', w);
  eq(r.doc.id, 'hall');
  eq(r.index.map(e => e.id), ['hall', 'keep'], 'index[0] is the level the game boots into');
  eq(r.index[0].name, 'Academy');
  eq(r.gotos.keep.hotspots[0].actions[0].level, 'hall');
  eq(r.gotos.keep.hotspots[1].actions[0].level, 'keep', 'a goto pointing elsewhere is left alone');
  eq(r.characters.greeter.place.level, 'hall');
  eq(r.characters.other.place.level, 'keep');
  eq(r.characters.narrator.place, undefined);
  ok(r.notes.length >= 2, r.notes.join(' / '));
});

test('changing an id does not touch the documents it was given', () => {
  const w = world();
  retargetLevel('academy', 'hall', w);
  eq(w.levels.academy.id, 'academy');
  eq(w.levels.keep.hotspots[0].actions[0].level, 'academy');
  eq(w.characters.greeter.place.level, 'academy');
  eq(w.index.map(e => e.id), ['academy', 'keep']);
});

test('an id change with nothing pointing at the level is a quiet one', () => {
  const r = retargetLevel('keep', 'donjon', world());
  eq(r.gotos, {});
  eq(r.index.map(e => e.id), ['academy', 'donjon']);
  eq(r.characters.other.place.level, 'donjon');
});
