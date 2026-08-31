import { test, eq, ok } from '../tools/harness.mjs';
import { fakeDom } from './game/fakedom.js';

fakeDom();
const { Input } = await import('./input.js');

const held = () => {
  const i = new Input();
  i.keys.add('KeyW');
  i.look.x = 40;
  i.look.y = -12;
  i.attackEdge = true;
  return i;
};

test('unlocked, a held stick and a drag both come through', () => {
  const r = held().read();
  eq([r.my, r.lx, r.ly, r.attack], [1, 40, -12, true]);
});

test('locked, nothing comes through', () => {
  const i = held();
  i.lock(true);
  const r = i.read();
  eq([r.mx, r.my, r.lx, r.ly, r.attack, r.sprint], [0, 0, 0, 0, false, false]);
});

// The whole point of draining rather than ignoring: a drag made behind the lock must not be
// waiting to be applied as one whip on the frame control comes back.
test('a locked read still drains the look and the attack edge', () => {
  const i = held();
  i.lock(true);
  i.read();
  i.lock(false);
  const r = i.read();
  eq([r.lx, r.ly, r.attack], [0, 0, false]);
});

test('a held stick is live, not stale, when the lock lifts', () => {
  const i = held();
  i.lock(true);
  i.read();
  i.lock(false);
  eq(i.read().my, 1, 'still holding W');
  i.keys.delete('KeyW');
  eq(i.read().my, 0, 'let go');
});

test('lock takes anything truthy and is never latched by read', () => {
  const i = held();
  i.lock(1);
  ok(i.locked === true);
  i.read();
  ok(i.locked === true, 'read must not clear it');
  i.lock(undefined);
  ok(i.locked === false);
});
