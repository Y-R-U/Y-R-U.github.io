// Plays the shipped packs from a blank save with nothing but the events the steps themselves ask
// for. If a quest cannot be reached by a player who only does what the quests say, this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankState, step, offered } from '../js/game/quest.js';
import { blankSchools } from '../js/sim/schools.js';
import { ACTS } from '../js/sim/campaign.js';
import { lintAll } from './lintQuests.mjs';

const { defs, dialogue } = lintAll();

// One synthetic world event per objective, carrying whatever the step's modifiers demand.
function eventsFor(s) {
  return s.objectives.map(o => {
    const base = { via: s.via ?? undefined, verb: s.verb ?? undefined, area: s.in ?? undefined };
    switch (o.k) {
      case 'kill': return { ...base, t: 'kill', kind: o.kind, n: o.n };
      case 'gather': return { ...base, t: 'gather', kind: o.kind, n: o.n };
      case 'deliver': return { ...base, t: 'deliver', item: o.item, n: o.n, to: o.to };
      case 'interact': return { ...base, t: 'interact', id: o.id, n: o.n };
      case 'goto': return { t: 'enter', area: o.area };
      case 'escort': return { t: 'escort', npc: o.npc, path: o.path };
      case 'talk': return { t: 'talk', npc: o.npc, node: o.node };
      case 'survive': return { t: 'tick', dt: o.seconds, areas: [o.area, s.in].filter(Boolean) };
      default: throw new Error(`no event for ${o.k}`);
    }
  });
}

// A step may want an hour, a window, or the eighth day. The clock obeys; the player never waits.
function clockFor(s, clock) {
  const day = s.onDay ? s.onDay - 1 + s.onDay * Math.floor(clock.day / s.onDay) : clock.day;
  let hour = clock.hour;
  const lo = s.after ?? 0, hi = s.before ?? 24;
  const inside = lo <= hi ? hour >= lo && hour < hi : hour >= lo || hour < hi;
  if (!inside) hour = lo + 0.5;
  return { day, hour };
}

function playCampaign(campaign) {
  const g = { schools: blankSchools(), marks: 0, items: {}, flags: {}, truths: [], acts: [] };
  const clock = { hour: 4, day: 0 };
  let state = blankState();
  const order = [];

  const ctx = () => ({
    quests: state.quests, flags: g.flags, truths: g.truths, schools: g.schools,
    items: g.items, marks: g.marks, hour: clock.hour, day: clock.day,
    campaign: { current: campaign, act: g.acts.at(-1) || 1 },
  });

  const send = event => {
    const r = step(defs, state, event, ctx());
    state = r.state;
    for (const e of r.effects) {
      if (e[0] === 'xp') g.schools[e[1]] += e[2];
      if (e[0] === 'mk') g.marks += e[1];
      if (e[0] === 'item') g.items[e[1]] = (g.items[e[1]] || 0) + e[2];
      if (e[0] === 'flag') g.flags[e[1]] = e[2] === undefined ? true : e[2];
      if (e[0] === 'unlock') g.flags[`unlocked.${e[1]}`] = true;
      if (e[0] === 'truth') g.truths.push(e[1]);
      if (e[0] === 'act') g.acts.push(e[1]);
    }
  };

  const play = id => {
    send({ t: 'accept', id });
    assert.equal(state.quests[id]?.s, 'active', `${id} was offered but would not start`);
    for (const s of defs[id].steps) {
      Object.assign(clock, clockFor(s, clock));
      for (const e of eventsFor(s)) send(e);
    }
    assert.equal(state.quests[id].s, 'done', `${id} did not finish`);
    order.push(id);
  };

  for (let guard = 0; guard < 200; guard++) {
    const next = offered(defs, state, ctx())
      .filter(id => defs[id].campaign === campaign && !state.quests[id]);
    if (!next.length) break;
    play(next[0]);
  }
  return { g, state, order };
}

test('a blank save is offered exactly one quest, and it is the granary', () => {
  assert.deepEqual(offered(defs, blankState(), {}), ['light.01']);
});

test('every Light quest is reachable by a player who only does what is asked', () => {
  const { order, state } = playCampaign('light');
  const all = Object.values(defs).filter(d => d.campaign === 'light').map(d => d.id);
  const missed = all.filter(id => state.quests[id]?.s !== 'done');
  assert.deepEqual(missed, [], 'unreachable from a fresh save');
  assert.equal(order.length, all.length);
});

test('Light plays through its five acts in order', () => {
  const { g, order } = playCampaign('light');
  assert.deepEqual(g.acts, [2, 3, 4, 5]);
  const acts = order.map(id => defs[id].act);
  for (let i = 1; i < acts.length; i++) {
    assert.ok(acts[i] >= acts[i - 1], `${order[i]} (act ${acts[i]}) came after act ${acts[i - 1]}`);
  }
});

test('the Light campaign pays out its five act budgets and nothing else', () => {
  const { g } = playCampaign('light');
  const budget = ACTS.filter(a => a.campaign === 'light').reduce((n, a) => n + a.mk, 0);
  assert.ok(Math.abs(g.marks - budget) <= 5, `${g.marks} mk against a ${budget} mk budget`);
});

test('finishing Light unlocks Dark and leaves the ledger answered', () => {
  const { g } = playCampaign('light');
  assert.equal(g.flags['light.done'], true);
  assert.equal(g.flags['unlocked.dark'], true);
  assert.equal(g.flags['echo.white_cord'], true);
  assert.equal(g.flags['light.ledger.read'], true);
});

// STORY §8.5 hands the player ten Truths across the Light campaign, all of them in dialogue.
test('every Light Truth is marked by a node the campaign actually plays', () => {
  const played = new Set();
  for (const d of Object.values(defs)) {
    if (d.campaign !== 'light') continue;
    for (const s of d.steps) for (const o of s.objectives) if (o.k === 'talk' && o.node) played.add(o.node);
    for (const e of d.onDone) if (e[0] === 'dialogue') played.add(e[1]);
    for (const s of d.steps) for (const e of s.onDone || []) if (e[0] === 'dialogue') played.add(e[1]);
  }
  const marked = new Set();
  for (const id of played) if (dialogue[id]?.mark) marked.add(dialogue[id].mark);
  const want = ['overdraw', 'wagon.eighth', 'cousin', 'count.never.holds', 'raiders.east',
    'shaft.dry', 'unseen', 'vail.dead', 'thirty.years', 'strike.won'];
  assert.deepEqual(want.filter(t => !marked.has(t)), []);
});
