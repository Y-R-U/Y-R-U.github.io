import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseQuests } from './questdef.js';
import { blankState, step, offered, progress, rewardFor, boardRoll } from './quest.js';
import { BOARD_ALWAYS } from '../sim/campaign.js';
import { canCast } from '../sim/spells.js';
import { levelFor } from '../sim/xp.js';
import { newGraft, graftBlocked, startGraft, tickGraft, endGraft } from '../sim/faction.js';
import { blank, addItem, itemCount } from './save.js';
import { lintAll } from '../../tools/lintQuests.mjs';

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

  // A `verb` may name a spell instead of a school — the linter accepts both and the Neutral pack
  // authors `"verb": "graft"`. The caster raises the school it dialled and the spell it cast.
  const spell = pack([one('q', ['interact', 'self', 1], { verb: 'graft' })]);
  assert.equal(drive(spell, [{ t: 'accept', id: 'q' }, { t: 'interact', id: 'self', verb: 'glamour' }]).state.quests.q.s, 'active');
  assert.equal(drive(spell, [{ t: 'accept', id: 'q' },
    { t: 'interact', id: 'self', verb: 'glamour', spell: 'graft' }]).state.quests.q.s, 'done');
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

// The fixture is three steps deep on purpose: a one-step quest cannot tell "runs step 0's recover"
// apart from "puts the whole quest back", and that is exactly how the second one went missing.
test('retry restarts a failed quest and puts back every step the player walked through', () => {
  const defs = pack([{
    id: 'q', title: 'T', summary: 's', giver: 'g',
    steps: [
      { id: 'a', do: ['goto', 'ridge'], text: 'go', recover: [['moveTo', 'ridge']] },
      { id: 'b', do: ['gather', 'silverling', 2], text: 'fish', recover: [['grant', 'silverling', 2]] },
      { id: 'c', do: ['goto', 'camp'], text: 'back', unseen: true, recover: [['moveTo', 'camp']] },
      { id: 'd', do: ['goto', 'home'], text: 'home', recover: [['moveTo', 'home']] },
    ],
  }]);
  const { state } = drive(defs, [
    { t: 'accept', id: 'q' },
    { t: 'enter', area: 'ridge' },
    { t: 'gather', kind: 'silverling', n: 2 },
    { t: 'seen', by: 'watch' },
  ]);
  assert.equal(state.quests.q.s, 'failed');
  assert.equal(state.quests.q.i, 2, 'it failed on the third step');

  const r = step(defs, state, { t: 'retry', id: 'q' }, {});
  assert.equal(r.state.quests.q.s, 'active');
  assert.equal(r.state.quests.q.i, 0);
  assert.deepEqual(r.effects.filter(e => e[0] === 'recover'), [
    ['recover', [['moveTo', 'camp']]],
    ['recover', [['grant', 'silverling', 2]]],
    ['recover', [['moveTo', 'ridge']]],
  ], 'deepest first, so step 0\'s move is the one that lands last — and step 3 was never reached');
});

test('retry is a no-op on a quest that has not failed', () => {
  const defs = pack([one('q', ['goto', 'ridge'], { recover: [['moveTo', 'ridge']] })]);
  const { state } = drive(defs, [{ t: 'accept', id: 'q' }]);
  const r = step(defs, state, { t: 'retry', id: 'q' }, {});
  assert.equal(r.state.quests.q.s, 'active');
  assert.deepEqual(r.effects, [], 'no recover, no wipe — the journal button is not the only guard');
  assert.deepEqual(step(defs, state, { t: 'retry', id: 'nope' }, {}).effects, []);
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

test('BOARD_ALWAYS is posted on every board, every day, without being drawn twice', () => {
  const defs = pack([1, 2, 3, 4, 5].map(i => ({
    id: `s${i}`, story: `S0${i}`, title: 'T', summary: 's', board: { school: 'cull' },
    steps: [{ id: 's', do: ['goto', 'x'], text: 't' }],
  })));
  assert.deepEqual(BOARD_ALWAYS, ['S02', 'S04'], 'the fixture is named after the real pair');
  for (const town of ['light', 'neutral', 'dark']) {
    for (let day = 0; day < 24; day++) {
      const board = boardRoll(defs, 7, day, town);
      assert.equal(board.length, 3);
      assert.equal(new Set(board).size, 3, 'an always-posted quest is not also drawn');
      assert.ok(board.includes('s2') && board.includes('s4'), `${town} day ${day}`);
    }
  }
});

test('an always-posted quest that is not on this town board is not forced onto it', () => {
  const defs = pack([
    { id: 'far', story: 'S02', title: 'T', summary: 's', town: 'dark', board: { school: 'cull' },
      steps: [{ id: 's', do: ['goto', 'x'], text: 't' }] },
    { id: 'near', title: 'T', summary: 's', board: { school: 'cull' },
      steps: [{ id: 's', do: ['goto', 'x'], text: 't' }] },
  ]);
  assert.deepEqual(boardRoll(defs, 7, 1, 'light'), ['near']);
  assert.deepEqual(boardRoll(defs, 7, 1, 'dark').sort(), ['far', 'near']);
});

// ── the Graft acceptance run ──────────────────────────────────────────────────
// Plays the real N07 → N08 chain out of the shipped pack, with the disguise driven by the same
// `sim/faction.js` calls `session.js` makes and in the same order. Everything js/game/*.test.js
// cannot reach is the DOM plumbing around them — audio, the charge ring, the two-button card.
function grafter() {
  const { defs, areas } = lintAll();
  const doc = blank(1);
  doc.campaign.current = 'neutral';
  doc.faction = 'neutral';
  let state = blankState();
  let graft = newGraft();
  let here = [];

  const p = {
    doc, defs,
    get worn() { return graft.worn; },
    at(...a) { here = a; return p; },
    send(event) {
      const ctx = { quests: state.quests, flags: doc.flags, truths: [], schools: doc.schools,
        standing: doc.standing, items: Object.fromEntries(doc.items.map(e => [e.id, e.n])),
        marks: 0, campaign: doc.campaign, worn: doc.worn, day: 0, hour: 12, areas: here, seen: [] };
      const r = step(defs, state, event, ctx);
      state = r.state;
      for (const e of r.effects) if (e[0] === 'item') addItem(doc, e[1], e[2]);
      doc.quests = state.quests;
      return r.effects;
    },
    // session.graftGranted()
    granted() {
      const done = Object.entries(state.quests).filter(([, r]) => r.s === 'done')
        .map(([id]) => defs[id]?.story).filter(Boolean);
      if (canCast('graft', { schools: doc.schools, grasp: 0, standingBand: null, questsDone: done })) return true;
      return Object.entries(state.quests).some(([id, rec]) => rec.s === 'active'
        && defs[id]?.steps.filter(s => !s.optional)[rec.i]?.verb === 'graft');
    },
    homeHearth() { return here.some(a => areas[a]?.hearth && areas[a].town === 'neutral'); },
    // session.blocked()
    blocked() {
      return graftBlocked(graft, { granted: p.granted(),
        ash: itemCount(doc, 'hearth_ash') + (p.homeHearth() ? 1 : 0), seen: false });
    },
    // session.graftInto()
    graftInto(f) {
      const why = p.blocked();
      if (why) return why;
      if (!p.homeHearth()) addItem(doc, 'hearth_ash', -1);
      graft = startGraft(graft, f, { glamour: levelFor(doc.schools.glamour) });
      doc.worn = graft.worn;
      p.send({ t: 'interact', id: 'self', verb: 'glamour', spell: 'graft' });
      return null;
    },
    unGraft() { const r = endGraft(graft); graft = r.graft; doc.worn = null; return r.xp; },
    wait(s) { for (let t = 0; t < s; t += 0.5) graft = tickGraft(graft, 0.5, { watchmen: 0 }).graft; return p; },
    on(id) { const r = state.quests[id]; return defs[id].steps.filter(s => !s.optional)[r.i]?.id; },
    quest(id) { return state.quests[id]?.s; },
  };
  return p;
}

test('N07 grants the spell with the step that asks for it, and the barn hearth pays for it', () => {
  const p = grafter();
  p.send({ t: 'accept', id: 'neutral.07', force: true });
  p.at('lac', 'lac.westfield');
  p.send({ t: 'talk', npc: 'sedge', node: 'neutral.07.in' });
  p.send({ t: 'interact', id: 'lac.westfield.thorn', verb: 'forage', n: 2 });
  p.send({ t: 'interact', id: 'lac.westfield.pear', verb: 'forage', n: 2 });
  p.at('lac', 'lac.barn');
  p.send({ t: 'interact', id: 'lac.barn.hearth', verb: 'hearth' });
  assert.equal(p.on('neutral.07'), 'face', 'the fifth step is the first Graft');

  // The bootstrap: N07 is what grants Graft and N07 has not finished, so the grant has to come
  // from the live step. And N07 pays its three ash on completion, so there is none in the bag.
  assert.equal(itemCount(p.doc, 'hearth_ash'), 0);
  assert.equal(p.granted(), true, 'a live step asking for a graft is the lesson that grants it');
  assert.equal(p.blocked(), null, 'STORY §12: ash is free at a Longacre hearth');

  assert.equal(p.graftInto('light'), null);
  assert.equal(p.worn, 'light');
  assert.equal(p.on('neutral.07'), 'out', 'the interact(self) with verb graft credited the step');
  p.send({ t: 'talk', npc: 'sedge', node: 'neutral.07.out' });
  assert.equal(p.quest('neutral.07'), 'done');
  assert.equal(itemCount(p.doc, 'hearth_ash'), 3, 'and the barn charged nothing for the lesson');
});

test('a worn: light step advances because the player grafted, and not because they walked in', () => {
  const p = grafter();
  p.send({ t: 'accept', id: 'neutral.07', force: true });
  p.at('lac', 'lac.westfield');
  p.send({ t: 'talk', npc: 'sedge', node: 'neutral.07.in' });
  p.send({ t: 'interact', id: 'lac.westfield.thorn', verb: 'forage', n: 2 });
  p.send({ t: 'interact', id: 'lac.westfield.pear', verb: 'forage', n: 2 });
  p.at('lac', 'lac.barn');
  p.send({ t: 'interact', id: 'lac.barn.hearth', verb: 'hearth' });
  p.graftInto('light');
  p.send({ t: 'talk', npc: 'sedge', node: 'neutral.07.out' });

  p.send({ t: 'accept', id: 'neutral.08' });
  assert.equal(p.quest('neutral.08'), 'active', 'the prereq is N07 done, and it is');
  p.send({ t: 'talk', npc: 'hana', node: 'neutral.08.in' });
  assert.equal(p.blocked(), 'worn', 'the Whitewall face from N07 is still on');
  p.unGraft();
  assert.equal(p.blocked(), 'cooldown');
  p.wait(21);
  assert.equal(p.blocked(), null);
  assert.equal(p.graftInto('light'), null);
  assert.equal(p.on('neutral.08'), 'yard');

  // The control. Take the face off and Sanctum Yard is just a square you are standing in.
  p.unGraft();
  p.at('wwa', 'wwa.market');
  p.send({ t: 'enter', area: 'wwa.market' });
  assert.equal(p.worn, null);
  assert.equal(p.on('neutral.08'), 'yard', 'no face, no infiltration');

  // Now with one on. Same event, same place, and the step opens.
  p.wait(21);
  p.at('lac', 'lac.barn');
  assert.equal(p.graftInto('light'), null);
  p.at('wwa', 'wwa.market');
  p.send({ t: 'enter', area: 'wwa.market' });
  assert.equal(p.on('neutral.08'), 'trade', 'walked into Sanctum Yard as Ansel');

  // And the two steps behind it are gated the same way.
  p.send({ t: 'interact', id: 'wwa.market.stall', verb: 'barter', n: 2 });
  assert.equal(p.on('neutral.08'), 'kesta');
  p.unGraft();
  p.send({ t: 'talk', npc: 'kesta', node: 'neutral.08.kesta' });
  assert.equal(p.on('neutral.08'), 'kesta', 'Kesta does not talk to a face she has not been told about');
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
