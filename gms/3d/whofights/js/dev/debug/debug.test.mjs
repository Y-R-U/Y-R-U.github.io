// The pure half of the Debug tab: the ring buffer, the trace filters, the waypoint gather, the
// scene-graph rows and the capture size arithmetic. No DOM, no three, no engine.

import { test, eq, ok, near, throws } from '../../../tools/harness.mjs';
import { Ring, matchTrace, matchLog, brief, traceLine } from './core.js';
import { waypoints, shapeCentre, facing, nearestTo, groupsOf } from './waypoints.js';
import { rows, subtreeTris, trisOf, docEntryAt, label } from './graph.js';
import { fitDpr, MAX_PIXELS, SIZES } from './capture.js';

test('ring keeps the newest entries in order', () => {
  const r = new Ring(3);
  for (const v of [1, 2, 3, 4, 5]) r.push({ v });
  eq(r.list().map(e => e.v), [3, 4, 5]);
  eq(r.dropped, 2);
  eq(r.seq, 5, 'seq counts everything ever pushed, not what survives');
  eq(r.size, 3);
});

test('ring tail and clear', () => {
  const r = new Ring(10);
  for (let i = 0; i < 6; i++) r.push({ v: i });
  eq(r.tail(2).map(e => e.v), [4, 5]);
  eq(r.tail(50).length, 6, 'a tail longer than the buffer is the whole buffer');
  r.clear();
  eq(r.list(), []);
});

test('ring of one', () => {
  const r = new Ring(1);
  r.push({ v: 'a' });
  r.push({ v: 'b' });
  eq(r.list().map(e => e.v), ['b']);
});

test('trace filter matches kind and free text', () => {
  const e = { kind: 'fire', id: 'hs.doorway.hall', text: 'enter → flag, event' };
  ok(matchTrace(e, {}));
  ok(matchTrace(e, { kinds: new Set(['fire']) }));
  ok(!matchTrace(e, { kinds: new Set(['enter']) }));
  ok(matchTrace(e, { text: 'DOORWAY' }), 'search is case-insensitive');
  ok(matchTrace(e, { text: 'flag' }), 'the text of the row is searched too');
  ok(!matchTrace(e, { text: 'greeter' }));
  ok(matchTrace(e, { kinds: new Set(), text: '' }), 'an empty kind set means no kind filter');
});

test('log filter matches level and text', () => {
  const e = { level: 'warn', text: 'level academy: dropped 1' };
  ok(matchLog(e, { levels: new Set(['warn', 'error']) }));
  ok(!matchLog(e, { levels: new Set(['error']) }));
  ok(matchLog(e, { text: 'dropped' }));
});

test('brief renders every kind of argument without throwing', () => {
  eq(brief('hello'), 'hello');
  eq(brief(42), '42');
  eq(brief(null), 'null');
  eq(brief(undefined), 'undefined');
  eq(brief({ a: 1 }), '{"a":1}');
  ok(brief(new Error('boom')).startsWith('Error: boom'), 'an Error carries its stack');
  const cyc = {};
  cyc.self = cyc;
  ok(brief(cyc).length > 0, 'a cycle must not throw');
  ok(brief('x'.repeat(900)).endsWith('…'), 'long values are cut');
  eq(brief('x'.repeat(9), 4), 'xxxx…');
});

test('trace line formats a time offset', () => {
  const l = traceLine({ t: 1500, wall: Date.now(), kind: 'enter', id: 'hs', text: 'x' }, 500);
  eq(l.time, '1.00');
  eq(l.kind, 'enter');
});

const DOC = {
  id: 'academy',
  start: { x: -9, z: 21, yaw: 3.14159 },
  objects: [
    { id: 1, type: 'house', zone: 'light', x: 0, z: -16, ry: 0, p: { w: 36, d: 30, h: 12, hall: 1 } },
    { id: 2, type: 'tower', zone: 'light', x: -20, z: -2, ry: 0, p: { radius: 4.6, height: 26, sides: 12 } },
  ],
  hotspots: [
    { id: 'hs.doorway.hall', name: 'Hall doorway', shape: { k: 'circle', x: 0, z: 2.5, r: 5 }, trigger: 'enter' },
    { id: 'hs.greeter', name: 'Vail', attach: 'greeter', r: 3.5, trigger: 'interact' },
    { id: 'hs.box', name: 'Box', shape: { k: 'rect', x0: -4, z0: -4, x1: 6, z1: 2 }, trigger: 'exit' },
  ],
  shots: [{ id: 'hall', label: 'The hall', zone: 'light', time: 11, pos: [0, 2.6, -3], look: [0, 3.4, -29] }],
};

const CAST = {
  greeter: { name: 'Instructor Vail', place: { level: 'academy', x: 0, z: -20, yaw: 0 } },
  narrator: { name: 'Narrator' },
  elsewhere: { name: 'Somebody', place: { level: 'other', x: 5, z: 5 } },
};

test('shapeCentre handles circles, rects and attachments', () => {
  eq(shapeCentre(DOC.hotspots[0]), { x: 0, z: 2.5, r: 5 });
  eq(shapeCentre(DOC.hotspots[2]), { x: 1, z: -1, r: 5 }, 'a rect reports its longest half-extent as a radius');
  eq(shapeCentre(DOC.hotspots[1]), null, 'an attached hotspot with nobody to attach to has no centre');
  eq(shapeCentre(DOC.hotspots[1], () => ({ x: 3, z: 4 })), { x: 3, z: 4, live: true });
});

test('facing points the right way', () => {
  near(facing(0, 10, 0, 0), Math.PI, 1e-6, 'looking toward −z is yaw π');
  near(facing(0, 0, 0, 10), 0, 1e-6);
  near(facing(0, 0, 10, 0), Math.PI / 2, 1e-6);
});

test('a waypoint you land on top of keeps the player facing', () => {
  const enter = waypoints(DOC, {}).find(w => w.id === 'hs.doorway.hall');
  eq(enter.yaw, null, 'no back-off means no direction to face');
  eq(waypoints(DOC, {}).find(w => w.id === 'start').yaw, DOC.start.yaw);
});

test('waypoints gather every place worth jumping to', () => {
  const list = waypoints(DOC, CAST, id => (id === 'greeter' ? { x: 1, z: -19 } : null));
  eq(groupsOf(list), ['Level', 'Hotspots', 'Characters', 'Camera shots', 'Objects']);
  eq(list.filter(w => w.group === 'Hotspots').length, 3);
  eq(list.filter(w => w.group === 'Characters').map(w => w.id), ['greeter'],
    'a character with no place, or one placed in another level, is not a waypoint here');
  eq(list.find(w => w.id === 'start').x, -9);
  const greeter = list.find(w => w.id === 'greeter');
  eq(greeter.x, 1, 'the live position wins over the authored one');
  eq(list.filter(w => w.group === 'Objects').map(w => w.id), ['obj.1', 'obj.2']);
});

test('an interact waypoint stands back from its own trigger', () => {
  const [hs] = waypoints(DOC, {}, () => ({ x: 0, z: 0 })).filter(w => w.id === 'hs.greeter');
  ok(hs.z > 0, 'standing short of an interact hotspot, not on top of it');
  const enter = waypoints(DOC, {}).find(w => w.id === 'hs.doorway.hall');
  eq(enter.z, 2.5, 'an enter hotspot is landed inside');
});

test('waypoints survive a document with nothing in it', () => {
  eq(waypoints(null), []);
  eq(waypoints({}), []);
  eq(waypoints({ hotspots: [{ id: 'x', trigger: 'enter' }] }).length, 1, 'a shapeless hotspot is still listed');
});

test('nearestTo finds the closest waypoint', () => {
  const list = waypoints(DOC, CAST);
  const n = nearestTo(list, -9, 21);
  eq(n.w.id, 'start');
  eq(nearestTo([], 0, 0), null);
});

const mesh = (name, verts, kids = []) => ({
  uuid: name, name, type: 'Mesh', isMesh: true, visible: true, children: kids,
  geometry: { attributes: { position: { count: verts } } },
});

test('triangle counts, including instances', () => {
  eq(trisOf(mesh('a', 300)), 100);
  eq(trisOf({ geometry: { index: { count: 60 }, attributes: {} } }), 20, 'an indexed geometry counts its indices');
  eq(trisOf({ isInstancedMesh: true, count: 7, geometry: { attributes: { position: { count: 300 } } } }), 700);
  eq(trisOf({}), 0);
});

test('subtree triangles walk the whole tree and stop at the budget', () => {
  const tree = { uuid: 'root', name: 'root', children: [mesh('a', 300), mesh('b', 600, [mesh('c', 30)])] };
  const r = subtreeTris(tree);
  eq(r.tris, 100 + 200 + 10);
  eq(r.nodes, 4);
  ok(!r.capped);
  eq(subtreeTris(tree, 2).capped, true);
});

test('rows only walk what is open', () => {
  const tree = { uuid: 'root', name: 'root', type: 'Scene', children: [mesh('a', 300), mesh('b', 600)] };
  eq(rows(tree, new Set()).length, 1, 'a closed root is one row');
  const open = rows(tree, new Set(['root']));
  eq(open.length, 3);
  eq(open[1].depth, 1);
  eq(open[1].tris, 100);
  ok(open[0].open);
});

test('label names a node the way the tree shows it', () => {
  eq(label({ name: 'terrain', type: 'Group' }), 'terrain · Group');
  eq(label({ type: 'Mesh' }), 'Mesh');
  eq(label({ name: 'grass', type: 'Mesh', isInstancedMesh: true, count: 900 }), 'grass · Mesh ×900');
});

const plan = o => (o.type === 'house' ? [18, 15] : [4.6, 4.6]);

test('docEntryAt finds the object a point stands in', () => {
  eq(docEntryAt(DOC, 0, -16, plan).o.id, 1);
  eq(docEntryAt(DOC, 0, -16, plan).inside, true);
  const near2 = docEntryAt(DOC, 0, 40, plan);
  eq(near2.inside, false);
  ok(near2.dist > 0);
  eq(docEntryAt({ objects: [] }, 0, 0, plan), null);
});

test('docEntryAt respects rotation', () => {
  const doc = { objects: [{ id: 9, type: 'house', x: 0, z: 0, ry: Math.PI / 2, p: {} }] };
  ok(docEntryAt(doc, 0, 17, plan).inside, 'rotated a quarter turn, the long axis is now z');
  ok(!docEntryAt(doc, 17, 0, plan).inside);
});

test('capture clamps a dpr that would blow past the pixel ceiling', () => {
  eq(fitDpr(1280, 720, 2).dpr, 2);
  eq(fitDpr(1280, 720, 2).clamped, false);
  const big = fitDpr(1920, 1080, 4);
  ok(big.clamped, '1920×1080 at dpr 4 is 33 MP');
  ok(big.px <= MAX_PIXELS * 1.001);
  eq(fitDpr(844, 390, 0.1).dpr, 0.5, 'a silly dpr is floored, not honoured');
  eq(fitDpr(844, 390, 9).dpr <= 4, true);
});

test('the shipped capture sizes cover both phone orientations', () => {
  const l = SIZES.find(s => s.id === 'phone-l');
  const p = SIZES.find(s => s.id === 'phone-p');
  eq([l.w, l.h], [844, 390]);
  eq([p.w, p.h], [390, 844]);
});
