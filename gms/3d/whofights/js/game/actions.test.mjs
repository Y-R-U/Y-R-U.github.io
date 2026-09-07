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

// `screen`, `promote` and `purse` are this project's three additions to §10 — the contract boards
// had no verb that opens a screen; the rank ladder cannot be a `flag` because which rank you go to
// depends on which one you are on; and the registration fee cannot be one because how much it is
// is a pacing number that moves under the debug tab's Economy panel, so a conversation must not be
// the place it is written down. All three are recorded in docs/DEV_CONTRACT.md §10; everything
// else is the contract's own list.
test('every contract verb is registered', () => {
  eq(VERB_IDS.sort(), ['bark', 'event', 'flag', 'goto', 'music', 'promote', 'purse', 'say', 'screen'].sort());
});

test('purse asks the session rather than writing a number itself', () => {
  const calls = [];
  eq(runAction({ k: 'purse' }, { purse: () => { calls.push(1); return true; } }), { k: 'purse', ok: true });
  eq(calls.length, 1);
  eq(runAction({ k: 'purse' }, {}), { k: 'purse', ok: false, why: 'no purse in this context' });
});

test('promote asks the ladder rather than writing a rank itself', () => {
  const calls = [];
  eq(runAction({ k: 'promote' }, { promote: () => { calls.push(1); return { to: 'bronze' }; } }),
    { k: 'promote', ok: true });
  eq(calls.length, 1);
  // Not eligible is a failure the executor reports rather than a silent no-op: a conversation
  // that offers a promotion the player cannot have is a bug in the gating, not in the ladder.
  eq(runAction({ k: 'promote' }, { promote: () => false }).ok, false);
  eq(runAction({ k: 'promote' }, {}).ok, false, 'and a context with no ladder says so');
  eq(validateAction({ k: 'promote' }), []);
});

test('screen needs an id and hands it to the session', () => {
  const seen = [];
  const c = { screen: id => seen.push(id) };
  eq(runAction({ k: 'screen', id: 'board.iron' }, c), { k: 'screen', ok: true });
  eq(seen, ['board.iron']);
  eq(runAction({ k: 'screen' }, c).ok, false);
  eq(validateAction({ k: 'screen' }), ['action: screen needs a "id" string']);
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

// The swallow is deliberate and stays. It is also why nothing downstream may leave state behind
// when it throws: the caller sees a result nobody is obliged to read, not an exception.
test('a sink that throws is reported, not raised', () => {
  const c = { say: () => { throw new TypeError('id.replace is not a function'); } };
  const r = runActions([{ k: 'say', node: 'n1' }, { k: 'flag', name: 'a' }], { ...c, flags: {} });
  eq(r[0], { k: 'say', ok: false, why: 'id.replace is not a function' });
  eq(r[1].ok, true, 'and the rest of the list still runs');
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

// A hotspot firing `say` on a node that will not open drew nothing and reported nothing — the
// exact shape of Aaron's "I can talk to Vail, but the menu of questions no longer shows".
test('a say that opens nothing is reported rather than swallowed', () => {
  const c = ctx();
  c.say = () => false;
  const r = runAction({ k: 'say', node: 'academy.greeter.hello' }, c);
  eq(r.ok, false);
  ok(/academy\.greeter\.hello/.test(r.why), r.why);
  // Everything that does not answer with a hard false is still fine: most contexts return nothing.
  eq(runAction({ k: 'say', node: 'x' }, ctx()).ok, true);
  eq(runAction({ k: 'say', node: 'x' }, {}).ok, true);
});
