import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
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

// data/levels/academy.json authors every locked door as two hotspots on the same circle — the
// `.locked` one first, gated on not-having-the-key, the open one second. A press that only ever
// asks the nearest killed the door outright the moment the player picked the key up.
test('press looks past a nearest hotspot that cannot fire', () => {
  const c = ctx();
  const shape = { k: 'circle', x: 0, z: 0, r: 2.6 };
  const locked = spot({ id: 'locked', trigger: 'interact', shape, if: ['not', ['flag', 'key', true]] });
  const open = spot({ id: 'open', trigger: 'interact', shape, if: ['flag', 'key', true] });
  const h = new Hotspots([locked, open], c);
  eq(h.press({ x: 0, z: 0 }), 'locked');
  c.flags.key = true;
  eq(h.press({ x: 0, z: 0 }), 'open', 'the key is in hand, so the open door answers');
});

test('press falls through a spent `once` to the next in range', () => {
  const one = spot({ id: 'one', trigger: 'interact', once: true, shape: { k: 'circle', x: 0, z: 0, r: 5 } });
  const two = spot({ id: 'two', trigger: 'interact', shape: { k: 'circle', x: 3, z: 0, r: 5 } });
  const h = new Hotspots([one, two], ctx());
  eq(h.press({ x: 0, z: 0 }), 'one');
  eq(h.press({ x: 0, z: 0 }), 'two');
});

test('two hotspots on one circle answer in document order', () => {
  const shape = { k: 'circle', x: 0, z: 0, r: 3 };
  const h = new Hotspots([spot({ id: 'first', trigger: 'interact', shape }),
    spot({ id: 'second', trigger: 'interact', shape })], ctx());
  eq(h.press({ x: 1, z: 1 }), 'first');
});

test('the prompt names what a press would actually answer', () => {
  const c = ctx();
  const shape = { k: 'circle', x: 0, z: 0, r: 2.6 };
  const h = new Hotspots([
    spot({ id: 'locked', name: 'The armoury door (locked)', trigger: 'interact', shape, if: ['not', ['flag', 'key', true]] }),
    spot({ id: 'open', name: 'The armoury door', trigger: 'interact', shape, if: ['flag', 'key', true] }),
  ], c);
  eq(h.prompt({ x: 0, z: 0 }), 'The armoury door (locked)');
  c.flags.key = true;
  eq(h.prompt({ x: 0, z: 0 }), 'The armoury door');
  eq(h.prompt({ x: 9, z: 0 }), null);
});

// The old prompt approximated a rect as a circle of max(w, d) / 2, which for a 10 x 1 m door mat
// reached 4.5 m out into the room.
test('the prompt uses the rect itself, not a circle around it', () => {
  const h = new Hotspots([spot({ id: 'mat', name: 'Mat', trigger: 'interact',
    shape: { k: 'rect', x0: -5, z0: -0.5, x1: 5, z1: 0.5 } })], ctx());
  eq(h.prompt({ x: 0, z: 0 }), 'Mat');
  eq(h.prompt({ x: 0, z: 4 }), null, '4 m off the mat is not standing on it');
});

test('a spent once and a cooling hotspot are not offered', () => {
  const h = new Hotspots([spot({ id: 'a', name: 'A', trigger: 'interact', once: true })], ctx());
  eq(h.prompt({ x: 0, z: 0 }), 'A');
  h.press({ x: 0, z: 0 });
  eq(h.prompt({ x: 0, z: 0 }), null);

  const c = new Hotspots([spot({ id: 'b', name: 'B', trigger: 'interact', cooldown: 1 })], ctx());
  c.press({ x: 0, z: 0 });
  eq(c.prompt({ x: 0, z: 0 }), null);
  c.update(1.1, { x: 0, z: 0 });
  eq(c.prompt({ x: 0, z: 0 }), 'B');
});

// The authored file itself, not a replica of it: this is the pattern MANAGER_STATE.md records
// Aaron signing off. It used to be the academy's locked doors — two hotspots on one circle with
// opposite predicates — and the Society has no locked doors, because a door onto a room that does
// not exist is a promise the building cannot keep. What replaced it is the same shape one axis
// over: five storeys of one room means the contract boards are all the same circle seen from
// above, and only the storey you are standing on may answer.
test('every contract board in society.json answers on its own storey and no other', () => {
  const level = JSON.parse(readFileSync(new URL('../../data/levels/society.json', import.meta.url)));
  const boards = level.hotspots.filter(h => h.id.startsWith('hs.board.') && Number.isFinite(h.shape?.y));
  ok(boards.length >= 4, 'the four contract boards are pinned to storeys');
  for (const b of boards) {
    const c = ctx();
    c.world = () => ({ flags: c.flags });
    const h = new Hotspots(level.hotspots, c);
    const at = { x: b.shape.x, z: b.shape.z, y: b.shape.y };
    eq(h.press(at, ['click']), b.id, `${b.id} did not answer on its own floor`);
    for (const other of boards) {
      if (other === b) continue;
      const away = { x: b.shape.x, z: b.shape.z, y: other.shape.y };
      const g = new Hotspots(level.hotspots, ctx());
      ok(g.press(away, ['click']) !== b.id, `${b.id} answered from ${other.id}'s floor`);
    }
  }
});

// A hotspot with no height is on every floor, which is what everything authored before there were
// floors meant by leaving it out. That has to keep being true.
test('a hotspot with no height still fires at any height', () => {
  const h = new Hotspots([spot({ trigger: 'interact', shape: { k: 'circle', x: 0, z: 0, r: 3 } })], ctx());
  eq(h.press({ x: 0, z: 0, y: 0 }), 'h');
  eq(h.press({ x: 0, z: 0, y: 40 }), 'h', 'a shapeless height locked it to the ground');
});

test('a height band is honoured on rects as well as circles', () => {
  const shape = { k: 'rect', x0: -2, z0: -2, x1: 2, z1: 2, y: 10, yr: 1.5 };
  const h = new Hotspots([spot({ trigger: 'interact', shape })], ctx());
  eq(h.press({ x: 0, z: 0, y: 10 }), 'h');
  eq(h.press({ x: 0, z: 0, y: 13 }), null, 'three metres up is a different storey');
});
