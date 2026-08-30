import { test, eq, ok, near } from '../../../tools/harness.mjs';
import { Hotspots } from '../../game/hotspots.js';
import { normaliseHotspot } from '../../editor/scene.js';
import {
  circleFrom, rectFrom, centreOf, radiusOf, moveShape, handlesOf, dragHandle, pickHandle,
  shapeAt, pickHotspot, newHotspotId, newAction, describeAction, summarise, hotspotProblems,
  colourOf, VERB_COLOUR, BROKEN_COLOUR, MIN_SIZE,
} from './hotspot.js';

test('a drag from a to b becomes a circle around a', () => {
  eq(circleFrom({ x: 2, z: 3 }, { x: 5, z: 7 }), { k: 'circle', x: 2, z: 3, r: 5 });
  eq(circleFrom({ x: 0, z: 0 }, { x: 0, z: 0 }).r, MIN_SIZE, 'a tap still makes something you can see');
  eq(circleFrom({ x: 1 / 3, z: 0 }, { x: 1 / 3, z: 4 }), { k: 'circle', x: 0.33, z: 0, r: 4 });
});

test('a drag becomes a rect whichever way it was dragged', () => {
  eq(rectFrom({ x: 5, z: 7 }, { x: 1, z: 2 }), { k: 'rect', x0: 1, z0: 2, x1: 5, z1: 7 });
  eq(rectFrom({ x: 1, z: 2 }, { x: 5, z: 7 }), { k: 'rect', x0: 1, z0: 2, x1: 5, z1: 7 });
  const thin = rectFrom({ x: 0, z: 0 }, { x: 0, z: 9 });
  eq(thin.x1 - thin.x0, MIN_SIZE, 'a zero-width rect is dropped by the loader, so it never gets made');
});

test('centre and radius read both shapes', () => {
  eq(centreOf({ k: 'circle', x: 2, z: 3, r: 5 }), { x: 2, z: 3 });
  eq(centreOf({ k: 'rect', x0: 0, z0: 0, x1: 4, z1: 10 }), { x: 2, z: 5 });
  eq(radiusOf({ k: 'rect', x0: 0, z0: 0, x1: 4, z1: 10 }), 5);
  eq(centreOf(null), { x: 0, z: 0 });
  eq(radiusOf(null), 0);
});

test('the centre handle moves and a size handle resizes', () => {
  const c = { k: 'circle', x: 0, z: 0, r: 3 };
  eq(handlesOf(c).map(h => h.id), ['c', 'r']);
  eq(dragHandle(c, 'c', 10, -4), { k: 'circle', x: 10, z: -4, r: 3 });
  eq(dragHandle(c, 'r', 0, 8), { k: 'circle', x: 0, z: 0, r: 8 });
  eq(dragHandle(c, 'r', 0, 0).r, MIN_SIZE);

  const s = { k: 'rect', x0: 0, z0: 0, x1: 10, z1: 6 };
  eq(handlesOf(s).map(h => h.id), ['c', 'nw', 'ne', 'sw', 'se']);
  eq(dragHandle(s, 'nw', 2, 1), { k: 'rect', x0: 2, z0: 1, x1: 10, z1: 6 }, 'the opposite corner stays pinned');
  eq(dragHandle(s, 'se', 12, 9), { k: 'rect', x0: 0, z0: 0, x1: 12, z1: 9 });
  eq(dragHandle(s, 'ne', -4, -4), { k: 'rect', x0: -4, z0: -4, x1: 0, z1: 6 }, 'dragging past the anchor flips, it does not invert');
  eq(dragHandle(s, 'c', 0, 0), { k: 'rect', x0: -5, z0: -3, x1: 5, z1: 3 });
  eq(moveShape(s, 1, 1), { k: 'rect', x0: 1, z0: 1, x1: 11, z1: 7 });
  eq(dragHandle(s, 'nope', 1, 1), s);
  eq(dragHandle(null, 'c', 1, 1), null);
});

test('a handle is picked by how close the ground point is', () => {
  const s = { k: 'rect', x0: 0, z0: 0, x1: 10, z1: 6 };
  eq(pickHandle(s, 0.2, 0.2)?.id, 'nw');
  eq(pickHandle(s, 5, 3)?.id, 'c');
  eq(pickHandle(s, 40, 40), null, 'a point nowhere near grabs nothing');
  eq(pickHandle({ k: 'circle', x: 0, z: 0, r: 3 }, 3.1, 0)?.id, 'r');
});

test('an attached hotspot borrows the character position, and is inert without one', () => {
  const h = { id: 'a', attach: 'greeter', r: 4, shape: null };
  eq(shapeAt(h, () => ({ x: 3, z: 4 })), { k: 'circle', x: 3, z: 4, r: 4 });
  eq(shapeAt(h, () => null), null);
  eq(shapeAt({ id: 'b', shape: { k: 'circle', x: 1, z: 1, r: 2 } }), { k: 'circle', x: 1, z: 1, r: 2 });
  // The same answer the runtime gives, so a hotspot drawn in the editor is the one that fires.
  const rt = new Hotspots([{ ...h, trigger: 'enter', actions: [] }], { characterAt: () => ({ x: 3, z: 4 }) });
  eq(rt.shapeOf(rt.list[0]), shapeAt(h, () => ({ x: 3, z: 4 })));
});

test('clicking picks the innermost hotspot under the point', () => {
  const big = { id: 'big', shape: { k: 'circle', x: 0, z: 0, r: 10 } };
  const small = { id: 'small', shape: { k: 'circle', x: 1, z: 0, r: 2 } };
  eq(pickHotspot([big, small], 1, 0)?.id, 'small');
  eq(pickHotspot([big, small], 8, 0)?.id, 'big');
  eq(pickHotspot([big, small], 40, 0), null);
  eq(pickHotspot([], 0, 0), null);
});

test('hotspot ids are derived and never collide', () => {
  eq(newHotspotId('Hall doorway', []), 'hs.hall.doorway');
  eq(newHotspotId('Hall doorway', ['hs.hall.doorway']), 'hs.hall.doorway.2');
  eq(newHotspotId('', []), 'hs.level');
});

test('every verb has a template the runtime accepts', () => {
  for (const k of ['say', 'goto', 'music', 'flag', 'bark', 'event']) eq(newAction(k).k, k);
  eq(newAction('goto').at, { x: 0, z: 0, yaw: Math.PI });
  eq(newAction('flag').value, true);
});

test('an action reads back as English', () => {
  const names = { conversations: { 'a.b': 'Greeter — hello' }, characters: { greeter: 'Instructor Vail' } };
  eq(describeAction({ k: 'say', node: 'a.b' }, names), 'say Greeter — hello');
  eq(describeAction({ k: 'say', node: '' }), 'say (nothing)');
  eq(describeAction({ k: 'music', stop: true }), 'stop the music');
  eq(describeAction({ k: 'bark', who: 'greeter', category: 'greet' }, names), 'Instructor Vail barks greet');
  eq(describeAction({ k: 'flag', name: 'seen', value: false }), 'set seen = false');
  eq(describeAction(null), 'not an action');
  eq(summarise({ actions: [] }), 'does nothing');
});

test('problems name the thing that is missing', () => {
  const refs = {
    characters: { greeter: { body: 'robed' }, narrator: { body: 'none' } },
    conversations: { 'academy.greeter.hello': {} },
    levelIds: ['academy'],
    musicSets: ['academy_hall'],
  };
  const good = normaliseHotspot({ id: 'hs.g', attach: 'greeter', trigger: 'interact',
    actions: [{ k: 'say', node: 'academy.greeter.hello' }] });
  eq(hotspotProblems(good, refs), []);

  const bad = normaliseHotspot({ id: 'hs.b', attach: 'nobody', trigger: 'interact',
    actions: [{ k: 'say', node: 'missing.node' }, { k: 'goto', level: 'nowhere' },
      { k: 'music', set: 'nope' }, { k: 'bark', who: 'ghost' }] });
  const out = hotspotProblems(bad, refs);
  ok(out.some(s => s.includes('"nobody"')), out.join(' | '));
  ok(out.some(s => s.includes('no conversation node "missing.node"')));
  ok(out.some(s => s.includes('no level "nowhere"')));
  ok(out.some(s => s.includes('no music set "nope"')));
  ok(out.some(s => s.includes('no character "ghost"')));

  ok(hotspotProblems({ id: 'x', trigger: 'enter', actions: [] }, refs).some(s => s.includes('no actions')));
  ok(hotspotProblems({ id: 'x', trigger: 'enter', shape: { k: 'circle' }, actions: [{ k: 'nope' }] }, refs)
    .some(s => s.includes('unknown action')));
  ok(hotspotProblems({ id: 'x', attach: 'narrator', trigger: 'enter', actions: [{ k: 'flag', name: 'a' }] }, refs)
    .some(s => s.includes('no body')), 'a bodiless character can never be stood next to');
  eq(hotspotProblems(null), ['not an object']);
});

test('colour says what a hotspot does, and red says it is broken', () => {
  eq(colourOf({ actions: [{ k: 'say' }] }), VERB_COLOUR.say);
  eq(colourOf({ actions: [{ k: 'flag' }, { k: 'say' }] }), VERB_COLOUR.flag, 'the first verb is the one you see');
  eq(colourOf({ actions: [] }), BROKEN_COLOUR);
  eq(colourOf({ actions: [{ k: 'say' }] }, ['something is wrong']), BROKEN_COLOUR);
});
