import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseQuests } from './questdef.js';
import { blankState, step, offered, progress, rewardFor, boardRoll } from './quest.js';

const pack = raw => {
  const r = normaliseQuests(raw, { pack: '' });
  assert.deepEqual(r.errors, [], 'fixture should normalise cleanly');
  return r.defs;
};

// Feeds a list of events through the reducer and hands back the final state and every effect.
function drive(defs, events, ctx = {}, state = blankState()) {
  const effects = [];
  for (const e of events) {
    const r = step(defs, state, e, typeof ctx === 'function' ? ctx(state) : ctx);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}

const one = (id, doo, extra = {}) => ({
  id, title: 'T', summary: 's', giver: 'g',
  steps: [{ id: 'a', do: doo, text: 'do it', ...extra }],
});

test('all eight primitives credit their own event and nothing else', () => {
  const cases = [
    [['kill', 'grain_rat', 2], [{ t: 'kill', kind: 'grain_rat' }, { t: 'kill', kind: 'mire_rat' }, { t: 'kill', kind: 'grain_rat' }]],
    [['gather', 'silverling', 3], [{ t: 'gather', kind: 'silverling', n: 3 }]],
    [['deliver', 'rat_tail', 2, 'wick'], [{ t: 'deliver', item: 'rat_tail', n: 1, to: 'wick' }, { t: 'deliver', item: 'rat_tail', n: 5, to: 'other' }, { t: 'deliver', item: 'rat_tail', n: 1, to: 'wick' }]],
    [['interact', 'lamp', 2], [{ t: 'interact', id: 'lamp' }, { t: 'interact', id: 'font' }, { t: 'interact', id: 'lamp' }]],
    [['goto', 'wwa'], [{ t: 'enter', area: 'elsewhere' }, { t: 'enter', area: 'wwa' }]],
    [['escort', 'hen', 'henhouse'], [{ t: 'escort', npc: 'hen', path: 'henhouse' }]],
    [['talk', 'bel', 'n1'], [{ t: 'talk', npc: 'bel', node: 'other' }, { t: 'talk', npc: 'bel', node: 'n1' }]],
    [['survive', 'gate', 3], [{ t: 'tick', dt: 2, areas: ['gate'] }, { t: 'tick', dt: 2, areas: ['gate'] }]],
  ];
  for (const [doo, events] of cases) {
    const defs = pack([one('q', doo)]);
    const { state } = drive(defs, [{ t: 'accept', id: 'q' }, ...events], { areas: ['gate'] });
    assert.equal(state.quests.q.s, 'done', `${doo[0]} did not complete`);
  }
});

test('`in` confines a primitive to one area', () => {
  const defs = pack([one('q', ['kill', 'grain_rat', 1], { in: 'wwa.granary' })]);
  const outside = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat', area: 'wwa.market' }]);
  assert.equal(outside.state.quests.q.s, 'active');
  const inside = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat', area: 'wwa.granary' }]);
  assert.equal(inside.state.quests.q.s, 'done');
  const byPosition = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat' }], { areas: ['wwa.granary', 'wwa'] });
  assert.equal(byPosition.state.quests.q.s, 'done', 'the player standing in the area counts');
});

test('`via` and `verb` are what make sell, craft and cast dress down onto the eight', () => {
  const sell = pack([one('q', ['deliver', 'silverling', 1, 'wick'], { via: 'sell' })]);
  assert.equal(drive(sell, [{ t: 'accept', id: 'q' }, { t: 'deliver', item: 'silverling', to: 'wick' }]).state.quests.q.s, 'active');
  assert.equal(drive(sell, [{ t: 'accept', id: 'q' }, { t: 'deliver', item: 'silverling', to: 'wick', via: 'sell' }]).state.quests.q.s, 'done');

  const cast = pack([one('q', ['interact', 'lamp', 1], { verb: 'kindle' })]);
  assert.equal(drive(cast, [{ t: 'accept', id: 'q' }, { t: 'interact', id: 'lamp' }]).state.quests.q.s, 'active');
  assert.equal(drive(cast, [{ t: 'accept', id: 'q' }, { t: 'interact', id: 'lamp', verb: 'kindle' }]).state.quests.q.s, 'done');
});

test('a step with `all` holds parallel objectives', () => {
  const defs = pack([{
    id: 'q', title: 'T', summary: 's',
    steps: [{ id: 'chores', text: 'three chores', all: [['interact', 'leat', 4], ['deliver', 'crate', 1, 'fen'], ['escort', 'hen', 'henhouse']] }],
  }]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' },
    { t: 'interact', id: 'leat', n: 4 }, { t: 'escort', npc: 'hen', path: 'henhouse' }]);
  assert.equal(state.quests.q.s, 'active');
  assert.equal(progress(defs, state, 'q').parts, 3);
  ({ state } = drive(defs, [{ t: 'deliver', item: 'crate', to: 'fen' }], {}, state));
  assert.equal(state.quests.q.s, 'done');
});

test('survive resets when the player leaves the area', () => {
  const defs = pack([one('q', ['survive', 'gate', 10])]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'tick', dt: 8, areas: ['gate'] }], { areas: ['gate'] });
  assert.equal(progress(defs, state, 'q').have, 8);
  ({ state } = drive(defs, [{ t: 'leave', area: 'gate' }], {}, state));
  assert.equal(progress(defs, state, 'q').have, 0);
});

test('within, unseen and a fail predicate all fail the step', () => {
  const timed = pack([one('q', ['interact', 'lamp', 9], { within: 5 })]);
  let r = drive(timed, [{ t: 'accept', id: 'q' }, { t: 'tick', dt: 3 }, { t: 'tick', dt: 3 }]);
  assert.equal(r.state.quests.q.s, 'failed');
  assert.equal(r.state.quests.q.why, 'expired');

  const scout = pack([one('q', ['goto', 'ridge'], { unseen: true })]);
  r = drive(scout, [{ t: 'accept', id: 'q' }, { t: 'seen', by: 'watch' }]);
  assert.equal(r.state.quests.q.s, 'failed');

  const clean = pack([one('q', ['goto', 'out'], { fail: ['damageDealt', '>', 0] })]);
  r = drive(clean, [{ t: 'accept', id: 'q' }, { t: 'damage', dealt: 4 }], { damageDealt: 4 });
  assert.equal(r.state.quests.q.s, 'failed');
});

test('retry restarts a failed quest and runs its recover list', () => {
  const defs = pack([one('q', ['goto', 'ridge'], { unseen: true, recover: [['moveTo', 'ridge']] })]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'seen', by: 'watch' }]);
  const r = step(defs, state, { t: 'retry', id: 'q' }, {});
  assert.equal(r.state.quests.q.s, 'active');
  assert.deepEqual(r.effects.find(e => e[0] === 'recover'), ['recover', [['moveTo', 'ridge']]]);
});

test('reset clears the current step counts and runs recover', () => {
  const defs = pack([one('q', ['kill', 'grain_rat', 8], { recover: [['respawn', 'grain_rat', 8]] })]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat', n: 5 }]);
  assert.equal(progress(defs, state, 'q').have, 5);
  const r = step(defs, state, { t: 'reset', id: 'q' }, {});
  assert.equal(progress(defs, r.state, 'q').have, 0);
  assert.ok(r.effects.some(e => e[0] === 'recover'));
});

test('a windowed step blocks progress and asks the adapter to wait', () => {
  const defs = pack([one('q', ['survive', 'gate', 5], { after: 21, before: 5 })]);
  const r = step(defs, blankState(), { t: 'accept', id: 'q' }, { hour: 10 });
  assert.deepEqual(r.effects.find(e => e[0] === 'wait'), ['wait', 21, null]);
  const day = drive(defs, [{ t: 'tick', dt: 9, areas: ['gate'] }], { hour: 10, areas: ['gate'] }, r.state);
  assert.equal(progress(defs, day.state, 'q').have, 0, 'daylight does not count toward the night watch');
  const night = drive(defs, [{ t: 'tick', dt: 9, areas: ['gate'] }], { hour: 23, areas: ['gate'] }, r.state);
  assert.equal(night.state.quests.q.s, 'done');
});

test('onDay is the eighth-day gate and it is a fade, not a wait', () => {
  const defs = pack([one('q', ['goto', 'temple'], { after: 12, before: 14, onDay: 8 })]);
  const r = step(defs, blankState(), { t: 'accept', id: 'q' }, { hour: 12.5, day: 3 });
  assert.deepEqual(r.effects.find(e => e[0] === 'wait'), ['wait', 12, 8]);
  const wrong = drive(defs, [{ t: 'enter', area: 'temple' }], { hour: 12.5, day: 3 }, r.state);
  assert.equal(wrong.state.quests.q.s, 'active');
  const right = drive(defs, [{ t: 'enter', area: 'temple' }], { hour: 12.5, day: 7 }, r.state);
  assert.equal(right.state.quests.q.s, 'done');
});

test('optional steps never block and pay the bonus only when done', () => {
  const defs = pack([{
    id: 'q', story: 'L03', title: 'T', summary: 's',
    steps: [
      { id: 'sell', do: ['deliver', 'silverling', 1, 'wick'], text: 'sell' },
      { id: 'tails', do: ['deliver', 'rat_tail', 1, 'wick'], text: 'tails', optional: true },
    ],
    reward: { bonus: { xp: { barter: 40 } } },
  }]);
  const without = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'deliver', item: 'silverling', to: 'wick' }]);
  assert.equal(without.state.quests.q.s, 'done');
  assert.equal(without.effects.filter(e => e[0] === 'xp' && e[2] === 40).length, 0);

  const withIt = drive(defs, [{ t: 'accept', id: 'q' },
    { t: 'deliver', item: 'rat_tail', to: 'wick' },
    { t: 'deliver', item: 'silverling', to: 'wick' }]);
  assert.equal(withIt.state.quests.q.s, 'done');
  assert.deepEqual(withIt.effects.filter(e => e[0] === 'xp' && e[2] === 40), [['xp', 'barter', 40]]);
});

test('prereqs decide what is offered, and nothing else can be accepted', () => {
  const defs = pack([
    { id: 'a', title: 'A', summary: 's', steps: [{ id: 's', do: ['goto', 'x'], text: 't' }], onDone: [['unlock', 'b']] },
    { id: 'b', title: 'B', summary: 's', prereq: ['quest', 'a', 'done'], steps: [{ id: 's', do: ['goto', 'y'], text: 't' }] },
  ]);
  assert.deepEqual(offered(defs, blankState(), {}), ['a']);
  const blocked = step(defs, blankState(), { t: 'accept', id: 'b' }, {});
  assert.deepEqual(blocked.state.quests, {}, 'a locked quest cannot be accepted');

  let { state } = drive(defs, [{ t: 'accept', id: 'a' }, { t: 'enter', area: 'x' }]);
  assert.deepEqual(offered(defs, state, { quests: state.quests }), ['b']);
});

test('rewards are generated from sim/campaign.js and reproduce STORY §8.1', () => {
  const defs = pack([{ id: 'light.01', story: 'L01', title: 'The Granary', summary: 's',
    steps: [{ id: 's', do: ['kill', 'grain_rat', 1], text: 't' }] }]);
  const r = rewardFor(defs['light.01'], {});
  assert.deepEqual(r.xp, { cull: 157, kindle: 157 });
  assert.equal(r.mk, 7);
});

test('an every-trained-school quest pays only the schools the player has trained', () => {
  const defs = pack([{ id: 'light.06', story: 'L06', title: 'The Even Hand', summary: 's',
    steps: [{ id: 's', do: ['talk', 'alder', 'n'], text: 't' }] }]);
  const r = rewardFor(defs['light.06'], { schools: { cull: 400, kindle: 0, line: 90 } });
  assert.deepEqual(Object.keys(r.xp), ['cull', 'line']);
  assert.equal(new Set(Object.values(r.xp)).size, 1);
});

test('a repeatable goes cooling and comes back on its day', () => {
  const defs = pack([{ id: 'q', title: 'T', summary: 's', board: { school: 'cull', weight: 1 },
    repeat: { every: 1 }, steps: [{ id: 's', do: ['kill', 'grain_rat', 1], text: 't' }] }]);
  const { state } = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat' }], { day: 4 });
  assert.equal(state.quests.q.s, 'cooling');
  assert.equal(state.quests.q.readyOn, 5);
  assert.deepEqual(offered(defs, state, { day: 4 }), []);
  assert.deepEqual(offered(defs, state, { day: 5 }), ['q']);
});

test('a quest with a turnin npc waits to be handed in', () => {
  const defs = pack([{ id: 'q', title: 'T', summary: 's', turnin: 'bel',
    steps: [{ id: 's', do: ['kill', 'grain_rat', 1], text: 't' }] }]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat' }]);
  assert.equal(state.quests.q.s, 'turnin');
  ({ state } = drive(defs, [{ t: 'talk', npc: 'rell' }], {}, state));
  assert.equal(state.quests.q.s, 'turnin');
  ({ state } = drive(defs, [{ t: 'talk', npc: 'bel' }], {}, state));
  assert.equal(state.quests.q.s, 'done');
});

test('the tracker reads the first incomplete objective', () => {
  const defs = pack([{ id: 'q', title: 'The Granary', summary: 's', steps: [
    { id: 'a', do: ['kill', 'grain_rat', 8], text: 'Cull the rodents' },
    { id: 'b', do: ['talk', 'bel', 'n'], text: 'Speak to Bel outside' },
  ] }]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' }, { t: 'kill', kind: 'grain_rat', n: 5 }]);
  assert.deepEqual(progress(defs, state, 'q'), {
    id: 'q', title: 'The Granary', text: 'Cull the rodents', hint: null, state: 'active',
    have: 5, need: 8, parts: 1, index: 0, total: 2, area: null,
  });
  ({ state } = drive(defs, [{ t: 'kill', kind: 'grain_rat', n: 3 }], {}, state));
  assert.equal(progress(defs, state, 'q').text, 'Speak to Bel outside');
});

test('tracking moves on when the tracked quest finishes', () => {
  const defs = pack([
    { id: 'a', title: 'A', summary: 's', steps: [{ id: 's', do: ['goto', 'x'], text: 't' }], onDone: [['unlock', 'b']] },
    { id: 'b', title: 'B', summary: 's', steps: [{ id: 's', do: ['goto', 'y'], text: 't' }] },
  ]);
  let { state } = drive(defs, [{ t: 'accept', id: 'a' }, { t: 'accept', id: 'b' }]);
  assert.equal(state.tracked, 'a');
  ({ state } = drive(defs, [{ t: 'enter', area: 'x' }], {}, state));
  assert.equal(state.tracked, 'b');
});

test('the board is a pure function of seed, day and town', () => {
  const defs = pack([1, 2, 3, 4, 5].map(i => ({
    id: `s${i}`, title: 'T', summary: 's', board: { school: 'cull', weight: i },
    steps: [{ id: 's', do: ['goto', 'x'], text: 't' }],
  })));
  const a = boardRoll(defs, 99, 12, 'light');
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3, 'no quest is posted twice');
  assert.deepEqual(boardRoll(defs, 99, 12, 'light'), a, 'same seed and day, same board');
  assert.notDeepEqual(boardRoll(defs, 99, 13, 'light'), a);
});

test('the reducer never mutates the state it was given', () => {
  const defs = pack([one('q', ['kill', 'grain_rat', 2])]);
  const s0 = blankState();
  const s1 = step(defs, s0, { t: 'accept', id: 'q' }, {}).state;
  const snapshot = JSON.stringify(s1);
  step(defs, s1, { t: 'kill', kind: 'grain_rat' }, {});
  assert.equal(JSON.stringify(s1), snapshot);
});

// The bug this guards: a step opens a branching node, the player picks a branch, and
// dialoguebox reports the node the conversation *ended* on — so the step never advanced.
test('a talk step is credited by any node the conversation visited, not just the last', () => {
  const defs = pack([one('q', ['talk', 'bel', 'ask'])]);
  let { state } = drive(defs, [{ t: 'accept', id: 'q' }]);
  ({ state } = drive(defs, [{ t: 'talk', npc: 'bel', node: 'take', nodes: ['ask', 'take'] }], {}, state));
  assert.equal(state.quests.q.s, 'done', 'the branch the player picked still credits the node the step named');

  let other = drive(defs, [{ t: 'accept', id: 'q' }]).state;
  ({ state: other } = drive(defs, [{ t: 'talk', npc: 'bel', node: 'take', nodes: ['greet', 'take'] }], {}, other));
  assert.notEqual(other.quests.q.s, 'done', 'a conversation that never opened the node must not credit it');
});
