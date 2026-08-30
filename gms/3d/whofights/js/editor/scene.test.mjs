import { test, eq, ok } from '../../tools/harness.mjs';
import { normalise, normaliseHotspot, SCENE_VERSION, TYPES } from './scene.js';
import { readFileSync } from 'node:fs';

const doc = raw => normalise(raw).doc;
const base = { version: 1, name: 'T', districts: [{ zone: 'neutral', cx: 0 }], objects: [] };

test('a non-document is refused, not repaired', () => {
  eq(normalise(null).doc, null);
  eq(normalise({ objects: 'no' }).doc, null);
  ok(normalise({ ...base, version: SCENE_VERSION + 1 }).error.includes('newer'));
});

test('an empty document still gets a district and a start', () => {
  const d = doc(base);
  eq(d.districts.length, 1);
  eq(d.start, { x: 0, z: 0, yaw: Math.PI });
  eq(d.hotspots, []);
  eq(d.objects, []);
});

test('unknown types and zones are dropped and reported', () => {
  const r = normalise({ ...base, objects: [
    { type: 'wibble', zone: 'light', x: 0, z: 0 },
    { type: 'house', zone: 'purple', x: 0, z: 0 },
    { type: 'house', zone: 'light', x: 0, z: 0 },
  ] });
  eq(r.dropped, 2);
  eq(r.doc.objects.length, 1);
  ok(r.warnings.some(w => w.includes('wibble')));
});

test('missing params fall back to the type default', () => {
  const o = doc({ ...base, objects: [{ type: 'tower', zone: 'light', x: 1, z: 2 }] }).objects[0];
  eq(o.p.radius, TYPES.tower.params.find(p => p.key === 'radius').def);
  eq([o.x, o.z, o.ry], [1, 2, 0]);
  ok(o.id > 0, 'an object with no id is given one');
});

test('a string param survives and a non-string falls back', () => {
  const objs = [
    { type: 'sign', zone: 'light', x: 0, z: 0, p: { text: 'Adventurer Academy' } },
    { type: 'sign', zone: 'light', x: 0, z: 0, p: { text: 42 } },
  ];
  const d = doc({ ...base, objects: objs });
  eq(d.objects[0].p.text, 'Adventurer Academy');
  eq(d.objects[1].p.text, TYPES.sign.strings[0].def);
});

test('`inside` marks a board as interior furniture', () => {
  const d = doc({ ...base, objects: [
    { id: 1, type: 'house', zone: 'light', x: 0, z: 0, p: { w: 20, d: 20, h: 12 } },
    { id: 2, type: 'billboard', zone: 'light', x: 0, z: -8, inside: 1, p: { text: 'Iron' } },
    { id: 3, type: 'billboard', zone: 'light', x: 4, z: 0, inside: 0 },
  ] });
  eq(d.objects[1].inside, 1);
  eq(d.objects[2].inside, undefined, 'inside: 0 is not a house id');
});

test('duplicate ids are re-issued rather than colliding', () => {
  const d = doc({ ...base, objects: [
    { id: 5, type: 'mass', zone: 'light', x: 0, z: 0 },
    { id: 5, type: 'mass', zone: 'light', x: 1, z: 0 },
  ] });
  eq(new Set(d.objects.map(o => o.id)).size, 2);
});

test('a hotspot needs a shape it can be inside, or an attach', () => {
  ok(!normaliseHotspot({ id: 'a' }));
  ok(!normaliseHotspot({ id: 'a', shape: { k: 'circle', x: 0, z: 0, r: 0 } }));
  ok(!normaliseHotspot({ id: 'a', shape: { k: 'rect', x0: 1, z0: 1, x1: 1, z1: 4 } }));
  ok(normaliseHotspot({ id: 'a', attach: 'greeter' }));
  ok(normaliseHotspot({ id: 'a', shape: { k: 'circle', x: 0, z: 0, r: 2 } }));
});

test('hotspot defaults match the contract', () => {
  const h = normaliseHotspot({ id: 'a', shape: { k: 'circle', x: 0, z: 0, r: 2 } });
  eq([h.trigger, h.once, h.cooldown, h.if, h.actions], ['enter', false, 0, null, []]);
  eq(normaliseHotspot({ id: 'a', attach: 'g' }).r, 2.5, 'the attached default radius');
  eq(normaliseHotspot({ id: 'a', attach: 'g', trigger: 'wibble' }).trigger, 'enter');
});

test('a rect is normalised to min/max corners', () => {
  const h = normaliseHotspot({ id: 'a', shape: { k: 'rect', x0: 4, z0: 9, x1: -1, z1: 2 } });
  eq(h.shape, { k: 'rect', x0: -1, z0: 2, x1: 4, z1: 9 });
});

test('the shipped academy level normalises with nothing dropped', () => {
  const raw = JSON.parse(readFileSync(new URL('../../data/levels/academy.json', import.meta.url)));
  const r = normalise(raw);
  eq(r.dropped, 0, `dropped: ${r.warnings.join('; ')}`);
  eq(r.warnings, []);
  eq(r.doc.hotspots.length, 2);
  eq(r.doc.shots.length, 4);
  const boards = r.doc.objects.filter(o => o.type === 'billboard');
  eq(boards.map(b => b.p.text).sort(),
    ['Bronze Contracts', 'Gold Contracts', 'Iron Contracts', 'New Adventures']);
  ok(boards.every(b => b.inside === 1), 'every board belongs to the hall');
  eq(r.doc.objects.find(o => o.type === 'sign').p.text, 'Adventurer Academy');
  eq(r.doc.objects.find(o => o.type === 'house').p.hall, 1);
});
