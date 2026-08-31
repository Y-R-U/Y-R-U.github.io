import { test, eq, ok } from '../../tools/harness.mjs';
import { normaliseCast } from './characters.js';

const cast = characters => normaliseCast({ version: 1, characters });

test('the three bodies of DEV_CONTRACT §7 all survive normalisation', () => {
  const { cast: c } = cast({
    vail: { name: 'Vail', body: 'robed', place: { level: 'academy', x: 1, z: 2, yaw: 0 } },
    crash: { name: 'Crash', body: 'dummy', sex: 'f', skin: 'guard01', place: { level: 'academy', x: 0, z: 0, yaw: 0 } },
    narrator: { name: 'Narrator', body: 'none' },
  });
  eq([c.vail.body, c.crash.body, c.narrator.body], ['robed', 'dummy', 'none']);
  eq([c.crash.sex, c.crash.skin], ['f', 'guard01'], 'the dummy-only fields come through');
  eq(cast({ x: { name: 'X', body: 'wobbly' } }).cast.x.body, 'none', 'an unknown body is still a voice');
});

test('a dummy with nowhere to stand, and one nothing can build, are both said out loud', () => {
  const w = cast({ crash: { name: 'Crash', body: 'dummy' } }).warnings.join(' | ');
  ok(/nowhere to stand/.test(w), 'a placed-nowhere body warns whatever rig it is');
  ok(/not spawned yet/.test(w), 'and a dummy says the world will not build it');
  ok(!cast({ n: { name: 'N', body: 'none' } }).warnings.length, 'a narrator warns about nothing');
});

test('place carries inside and wander', () => {
  const { cast: c } = cast({ g: { name: 'G', body: 'robed',
    place: { level: 'academy', x: 4, z: -18, yaw: 3.14159, inside: 1,
      wander: { x0: -10, x1: 10, z0: -26, z1: -10, speed: 0.85 } } } });
  eq(c.g.place.inside, 1);
  eq(c.g.place.wander, { x0: -10, x1: 10, z0: -26, z1: -10, speed: 0.85 });
  eq(cast({ g: { name: 'G', body: 'robed', place: { level: 'a' } } }).cast.g.place.inside, null,
    'absent inside is null, not 0 — 0 is a real house id everywhere else');
});
