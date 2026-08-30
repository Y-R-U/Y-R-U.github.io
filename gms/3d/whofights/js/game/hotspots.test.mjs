import { test, eq, ok } from '../../tools/harness.mjs';
import { Hotspots, inShape } from './hotspots.js';

const spot = o => ({ id: 'h', name: 'H', attach: null, r: 0, shape: { k: 'circle', x: 0, z: 0, r: 3 },
  trigger: 'enter', once: false, cooldown: 0, if: null, actions: [{ k: 'flag', name: 'hit' }], ...o });

const ctx = () => ({ flags: {}, log: [] });

test('circle and rect containment', () => {
  ok(inShape({ k: 'circle', x: 0, z: 0, r: 3 }, 2, 2));
  ok(!inShape({ k: 'circle', x: 0, z: 0, r: 3 }, 3, 3));
  ok(inShape({ k: 'rect', x0: -1, z0: -1, x1: 4, z1: 2 }, 0, 0));
  ok(!inShape({ k: 'rect', x0: -1, z0: -1, x1: 4, z1: 2 }, 5, 0));
  ok(!inShape(null, 0, 0));
});

test('enter fires on the crossing, not every frame inside', () => {
  const c = ctx();
  const h = new Hotspots([spot()], c);
  eq(h.update(0.1, { x: 10, z: 0 }), []);
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
  eq(h.update(0.1, { x: 1, z: 0 }), []);
  eq(h.update(0.1, { x: 10, z: 0 }), []);
  eq(h.update(0.1, { x: 0, z: 0 }), ['h'], 're-entry fires again');
});

test('exit fires on the way out', () => {
  const h = new Hotspots([spot({ trigger: 'exit' })], ctx());
  eq(h.update(0.1, { x: 0, z: 0 }), []);
  eq(h.update(0.1, { x: 9, z: 0 }), ['h']);
});

test('always fires every frame inside', () => {
  const h = new Hotspots([spot({ trigger: 'always' })], ctx());
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
});

test('once fires exactly once, ever', () => {
  const h = new Hotspots([spot({ once: true })], ctx());
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
  h.update(0.1, { x: 9, z: 0 });
  eq(h.update(0.1, { x: 0, z: 0 }), []);
});

test('cooldown holds a repeatable hotspot shut for its own seconds', () => {
  const h = new Hotspots([spot({ trigger: 'always', cooldown: 1 })], ctx());
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
  eq(h.update(0.5, { x: 0, z: 0 }), []);
  eq(h.update(0.6, { x: 0, z: 0 }), ['h'], 'the cooldown has run out');
});

test('a false `if` blocks the fire and does not burn a once', () => {
  const c = ctx();
  const h = new Hotspots([spot({ once: true, if: ['flag', 'open'] })], c);
  eq(h.update(0.1, { x: 0, z: 0 }), []);
  c.flags.open = true;
  h.update(0.1, { x: 9, z: 0 });
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
});

test('actions run against the shared context', () => {
  const c = ctx();
  const h = new Hotspots([spot()], c);
  h.update(0.1, { x: 0, z: 0 });
  eq(c.flags, { hit: true });
});

test('an attached hotspot follows its character and is inert without one', () => {
  let at = null;
  const c = { flags: {}, characterAt: () => at };
  const h = new Hotspots([spot({ attach: 'greeter', r: 2, shape: null, trigger: 'interact' })], c);
  eq(h.press({ x: 0, z: 0 }), null, 'nobody there yet');
  at = { x: 0, z: 0 };
  eq(h.press({ x: 1, z: 0 }), 'h');
  eq(h.press({ x: 5, z: 0 }), null, 'out of range');
});

test('press picks the nearest of several in range', () => {
  const near = spot({ id: 'near', trigger: 'interact', shape: { k: 'circle', x: 1, z: 0, r: 5 } });
  const far = spot({ id: 'far', trigger: 'interact', shape: { k: 'circle', x: 4, z: 0, r: 5 } });
  const h = new Hotspots([far, near], ctx());
  eq(h.press({ x: 0, z: 0 }), 'near');
});

test('a broken action is logged, not thrown', () => {
  const h = new Hotspots([spot({ actions: [{ k: 'nope' }] })], ctx());
  eq(h.update(0.1, { x: 0, z: 0 }), ['h']);
  eq(h.log.length, 1);
});
