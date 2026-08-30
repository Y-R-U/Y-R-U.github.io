import { test, eq, ok } from '../../tools/harness.mjs';
import { runAction, runActions, validateAction, VERB_IDS } from './actions.js';

const ctx = () => {
  const seen = { said: [], went: [], events: [], music: [], barks: [] };
  return {
    flags: {},
    say: id => seen.said.push(id),
    goto: (l, at) => seen.went.push([l, at]),
    emit: (n, d) => seen.events.push([n, d]),
    music: a => seen.music.push(a),
    bark: a => seen.barks.push(a),
    seen,
  };
};

test('every contract verb is registered', () => {
  eq(VERB_IDS.sort(), ['bark', 'event', 'flag', 'goto', 'music', 'say'].sort());
});

test('flag writes into the context, defaulting to true', () => {
  const c = ctx();
  runAction({ k: 'flag', name: 'a' }, c);
  runAction({ k: 'flag', name: 'b', value: 'five' }, c);
  eq(c.flags, { a: true, b: 'five' });
});

test('say, goto and event reach their sinks', () => {
  const c = ctx();
  runActions([
    { k: 'say', node: 'n1' },
    { k: 'goto', level: 'academy', at: { x: 1, z: 2, yaw: 0 } },
    { k: 'event', name: 'boom', data: { n: 3 } },
  ], c);
  eq(c.seen.said, ['n1']);
  eq(c.seen.went, [['academy', { x: 1, z: 2, yaw: 0 }]]);
  eq(c.seen.events, [['boom', { n: 3 }]]);
});

test('music and bark are accepted and do nothing yet', () => {
  const c = ctx();
  const r = runActions([{ k: 'music', set: 'hall' }, { k: 'bark', who: 'greeter', category: 'idle' }], c);
  eq(r.map(x => x.ok), [true, true]);
  eq(c.seen.music.length, 1);
  eq(c.seen.barks.length, 1);
});

test('a bad action never throws and says why', () => {
  const r = runActions([null, { k: 'nope' }, { k: 'flag' }, { k: 'say' }], ctx());
  eq(r.map(x => x.ok), [false, false, false, false]);
  ok(r[1].why.includes('unknown'));
});

test('a verb whose sink is missing is still a clean no-op', () => {
  eq(runAction({ k: 'say', node: 'n' }, {}), { k: 'say', ok: true });
});

test('validateAction catches what the editor must not save', () => {
  eq(validateAction({ k: 'say', node: 'x' }), []);
  eq(validateAction({ k: 'say' }).length, 1);
  eq(validateAction({ k: 'music' }).length, 1);
  eq(validateAction({ k: 'music', stop: true }), []);
  eq(validateAction({ k: 'wibble' }).length, 1);
});
