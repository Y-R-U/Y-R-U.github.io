import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankState, step, offered, rewardFor } from './quest.js';
import { run } from './dialogue.js';
import { lintAll } from '../../tools/lintQuests.mjs';
import { ACTS, QUESTS } from '../sim/campaign.js';
import { blankSchools } from '../sim/schools.js';
import { grantXp } from '../sim/xp.js';

const { errors, warnings, defs, dialogue, areas, truths } = lintAll();

test('the shipped packs lint clean', () => {
  assert.deepEqual(errors, []);
  assert.ok(Object.keys(defs).length >= 6);
  assert.ok(Object.keys(areas).length > 0);
});

test('every warning is one we have looked at', () => {
  // Story tokens and the notice board are the only things allowed to be unknown.
  for (const w of warnings) assert.match(w, /apprentice_cord|board_ww/, w);
});

test('every dialogue node a quest names exists', () => {
  for (const def of Object.values(defs)) {
    for (const s of def.steps) {
      for (const o of s.objectives) {
        if (o.k === 'talk' && o.node) assert.ok(dialogue[o.node], `${def.id}.${s.id} → ${o.node}`);
      }
    }
  }
  assert.ok(Object.keys(truths).length > 0);
});

// Plays the real Light Act 1 pack through the pure reducer, in order, with no renderer.
function playAct1() {
  const g = { schools: blankSchools(), marks: 0, items: {}, flags: {}, truths: [], quests: {} };
  let state = blankState();
  let hour = 4, day = 0;
  const log = [];

  const send = (event) => {
    const ctx = { quests: state.quests, flags: g.flags, truths: g.truths, schools: g.schools,
      items: g.items, marks: g.marks, hour, day, campaign: { current: 'light', act: 1 } };
    const r = step(defs, state, event, ctx);
    state = r.state;
    for (const e of r.effects) {
      log.push(e);
      if (e[0] === 'xp') g.schools[e[1]] += e[2];
      if (e[0] === 'mk') g.marks += e[1];
      if (e[0] === 'item') g.items[e[1]] = (g.items[e[1]] || 0) + e[2];
      if (e[0] === 'flag') g.flags[e[1]] = e[2];
    }
  };
  const at = (h, d = day) => { hour = h; day = d; };
  const offers = () => offered(defs, state, { quests: state.quests, flags: g.flags, hour, day });

  send({ t: 'accept', id: 'light.01' });
  send({ t: 'kill', kind: 'grain_rat', n: 1, area: 'wwa.granary' });
  send({ t: 'kill', kind: 'grain_rat', n: 7, area: 'wwa.granary' });
  send({ t: 'interact', id: 'wwa.granary.lamp', verb: 'kindle', area: 'wwa.granary' });
  send({ t: 'talk', npc: 'bel', node: 'light.01.out' });

  send({ t: 'accept', id: 'light.02' });
  send({ t: 'talk', npc: 'rell', node: 'light.02.in' });
  send({ t: 'gather', kind: 'silverling', n: 5, area: 'reach.light' });
  send({ t: 'talk', npc: 'rell', node: 'light.02.out' });

  send({ t: 'accept', id: 'light.03' });
  send({ t: 'enter', area: 'wwa.market' });
  send({ t: 'talk', npc: 'wick_ww', node: 'light.03.price' });
  send({ t: 'deliver', item: 'rat_tail', n: 8, to: 'wick_ww', via: 'sell', area: 'wwa.market' });
  send({ t: 'deliver', item: 'silverling', n: 5, to: 'wick_ww', via: 'sell', area: 'wwa.market' });

  send({ t: 'accept', id: 'light.04' });
  send({ t: 'talk', npc: 'marrin', node: 'light.04.in' });
  send({ t: 'gather', kind: 'cooked_silverling', n: 3, via: 'craft', area: 'wwa.kitchen' });
  send({ t: 'interact', id: 'wwa.temple.hand', n: 3 });
  send({ t: 'talk', npc: 'marrin', node: 'light.04.out' });

  send({ t: 'accept', id: 'light.05' });
  send({ t: 'talk', npc: 'kesta', node: 'light.05.in' });
  at(23);
  send({ t: 'tick', dt: 90, areas: ['wwa.northgate'] });
  send({ t: 'kill', kind: 'mire_rat', n: 2, area: 'wwa.northgate' });
  send({ t: 'talk', npc: 'kesta', node: 'light.05.out' });

  at(12.5, 7);
  send({ t: 'accept', id: 'light.06' });
  send({ t: 'enter', area: 'wwa.temple' });
  send({ t: 'talk', npc: 'alder', node: 'light.06.reading' });
  send({ t: 'interact', id: 'wwa.temple.font' });

  return { g, state, log, offers };
}

test('Light Act 1 plays end to end through the pure reducer', () => {
  const { g, state } = playAct1();
  for (const id of ['light.01', 'light.02', 'light.03', 'light.04', 'light.05', 'light.06']) {
    assert.equal(state.quests[id].s, 'done', `${id} did not finish`);
  }
  assert.equal(g.flags['light.act1.done'], true);
  assert.equal(g.items.rat_tail, 8, 'L01 pays the tails the player then sells');
});

test('Act 1 pays exactly the act budget in sim/campaign.js', () => {
  const { g } = playAct1();
  assert.equal(g.marks, ACTS.find(a => a.id === 'L1').mk);
});

// §8.1 publishes the base a quest is worth; what the player banks is that base through SYSTEMS
// §3.3's `grantXp`, which is the affinity row — Whitewall pays +15% on its own schools and −15%
// on the two it is bad at. Rounded per award, not on the total.
const banked = (school, ...bases) => bases.reduce((n, base) =>
  n + grantXp({ base, school, playerLevel: 1, sourceLevel: 1, faction: 'light' }), 0);

test('Act 1 XP matches what STORY §8.1 publishes, through the affinity row', () => {
  const { g } = playAct1();
  // L06 pays every trained school, so the leads carry their own quest plus the finale share.
  assert.equal(g.schools.cull, banked('cull', 157, 110));
  assert.equal(g.schools.line, banked('line', 157, 110));
  assert.equal(g.schools.barter, banked('barter', 78, 40, 110), 'including the optional tails bonus');
  assert.equal(g.schools.hearth, banked('hearth', 78, 110));
  assert.equal(g.schools.ward, banked('ward', 157, 110));
  assert.equal(g.schools.kindle, banked('kindle', 157, 157, 110));
  assert.equal(g.schools.glamour, 0, 'Glamour is not trained in Act 1');

  assert.equal(g.schools.cull, 267, 'Cull is nobody\'s affinity, so it is the published base');
  assert.equal(g.schools.hearth, 216, 'Hearth is Whitewall\'s own: 90 + 126, not 78 + 110');
});

test('the act gates in order — nothing is offered before its prereq', () => {
  const first = offered(defs, blankState(), {});
  assert.deepEqual(first, ['light.01'], 'only the granary is available at 04:00 on day one');
  const { offers } = playAct1();
  assert.ok(!offers().includes('light.01'), 'a finished quest is not re-offered');
});

test('the eighth-day finale cannot be walked into on the wrong day', () => {
  let state = blankState();
  const ctx = (hour, day) => ({ quests: state.quests, hour, day });
  for (const id of ['light.01', 'light.02', 'light.03', 'light.04', 'light.05']) {
    state.quests[id] = { s: 'done', i: 0, c: {} };
  }
  let r = step(defs, state, { t: 'accept', id: 'light.06' }, ctx(12.5, 3));
  state = r.state;
  assert.deepEqual(r.effects.find(e => e[0] === 'wait'), ['wait', 12, 8], 'it asks the clock to move, not the player');
  r = step(defs, state, { t: 'enter', area: 'wwa.temple' }, ctx(12.5, 3));
  assert.equal(r.state.quests['light.06'].i, 0, 'day 3 is not an eighth day');
  r = step(defs, state, { t: 'enter', area: 'wwa.temple' }, ctx(12.5, 15));
  assert.equal(r.state.quests['light.06'].i, 1);
});

test('every quest in the pack is priced by sim/campaign.js', () => {
  const story = new Set(QUESTS.map(q => q.id));
  for (const def of Object.values(defs)) {
    if (!def.story || !story.has(def.story)) continue;
    const r = rewardFor(def, { schools: { cull: 1 } });
    assert.ok(Object.keys(r.xp).length > 0 || r.mk > 0, `${def.id} pays nothing`);
  }
});

// L03 is where haggling is taught, so the push is ungated — the worst case is a smaller sale,
// never a locked branch. RUNTIME §3.1's `["level","barter",1]` would gate on nothing anyway:
// levelFor(0) is 1, so every player passes it.
test('the haggle branch is reachable and writes the flag the market reads', () => {
  const green = { schools: { barter: 0 } };
  assert.equal(dialogue['light.03.price'].choices.length, 3);
  assert.deepEqual(run(dialogue, 'light.03.price', green, [0]).effects, [['flag', 'light.03.haggled', false]]);
  assert.deepEqual(run(dialogue, 'light.03.price', green, [1]).effects, [['flag', 'light.03.haggled', true]]);
  assert.deepEqual(run(dialogue, 'light.03.price', green, [2]).visited, ['light.03.price'], 'walking away closes it');
});
