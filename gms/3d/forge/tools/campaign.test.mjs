// Plays the shipped packs with nothing but the events the steps themselves ask for, up the unlock
// ladder on one save. If a quest cannot be reached by a player who only does what the quests say,
// this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankState, step, offered } from '../js/game/quest.js';
import { blankSchools, SCHOOLS } from '../js/sim/schools.js';
import { ACTS } from '../js/sim/campaign.js';
import { lintAll } from './lintQuests.mjs';

const { defs, dialogue, truths } = lintAll();

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

// One save played straight through the ladder: Light, then Dark on the character Light left
// behind. Dark is unreachable from a blank save by design, so its test has to walk in the door.
function playThrough(campaigns) {
  const g = { schools: blankSchools(), marks: 0, items: {}, flags: {}, truths: [], acts: [] };
  const clock = { hour: 4, day: 0 };
  let state = blankState();
  const order = [];
  const per = {};
  let current = campaigns[0];
  // Neutral's infiltration steps carry `worn`. The player Grafts; the harness just wears whatever
  // the step it is playing asks for, the same way `clockFor` supplies the hour.
  let worn;

  const ctx = () => ({
    quests: state.quests, flags: g.flags, truths: g.truths, schools: g.schools,
    items: g.items, marks: g.marks, hour: clock.hour, day: clock.day, worn,
    campaign: { current, act: g.acts.at(-1) || 1 },
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
      worn = s.worn;
      for (const e of eventsFor(s)) send(e);
    }
    worn = undefined;
    assert.equal(state.quests[id].s, 'done', `${id} did not finish`);
    order.push(id);
  };

  for (const campaign of campaigns) {
    current = campaign;
    const from = { marks: g.marks, acts: g.acts.length, order: order.length, schools: { ...g.schools } };
    for (let guard = 0; guard < 200; guard++) {
      const next = offered(defs, state, ctx())
        .filter(id => defs[id].campaign === campaign && !state.quests[id]);
      if (!next.length) break;
      play(next[0]);
    }
    per[campaign] = {
      marks: g.marks - from.marks,
      acts: g.acts.slice(from.acts),
      order: order.slice(from.order),
      before: from.schools,
    };
  }
  return { g, state, order, per };
}

const playCampaign = campaign => playThrough([campaign]);

// Truths land in dialogue, and this harness sends `talk` events rather than walking scenes, so
// what a campaign hands the player is read off the nodes its own quests open.
function truthsFrom(campaign) {
  const out = new Set();
  const walk = id => {
    const n = dialogue[id];
    if (!n || out.has(`@${id}`)) return;
    out.add(`@${id}`);
    if (n.mark) out.add(n.mark);
    for (const c of n.choices || []) if (c.goto) walk(c.goto);
    if (n.next) walk(n.next);
  };
  for (const d of Object.values(defs)) {
    if (d.campaign !== campaign) continue;
    for (const e of d.onDone) if (e[0] === 'dialogue') walk(e[1]);
    for (const s of d.steps) {
      for (const e of s.onDone || []) if (e[0] === 'dialogue') walk(e[1]);
      for (const o of s.objectives) if (o.k === 'talk' && o.node) walk(o.node);
    }
  }
  return [...out].filter(id => !id.startsWith('@'));
}

// The shape every campaign has to hold: reachable, act-ordered, on budget, and every Truth it
// owns marked by a node the pack actually plays.
function assertCampaign(campaign, want) {
  const { state, per } = playThrough(want.after ? [...want.after, campaign] : [campaign]);
  const mine = per[campaign];
  const all = Object.values(defs).filter(d => d.campaign === campaign).map(d => d.id);

  assert.deepEqual(all.filter(id => state.quests[id]?.s !== 'done'), [],
    `unreachable by a player who only does what is asked`);
  assert.equal(mine.order.length, all.length);
  assert.deepEqual(mine.acts, [2, 3, 4, 5]);

  const acts = mine.order.map(id => defs[id].act);
  for (let i = 1; i < acts.length; i++) {
    assert.ok(acts[i] >= acts[i - 1], `${mine.order[i]} (act ${acts[i]}) came after act ${acts[i - 1]}`);
  }

  const budget = ACTS.filter(a => a.campaign === campaign).reduce((n, a) => n + a.mk, 0);
  assert.ok(Math.abs(mine.marks - budget) <= 5, `${mine.marks} mk against a ${budget} mk budget`);

  const marked = new Set(truthsFrom(campaign));
  const owed = Object.entries(truths).filter(([, t]) => t.campaign === campaign).map(([id]) => id);
  assert.equal(owed.length, want.truths, `STORY §8.5 gives ${campaign} ${want.truths} Truths`);
  assert.deepEqual(owed.filter(t => !marked.has(t)), [], 'Truths nothing plays');
}

test('a blank save is offered exactly one quest, and it is the granary', () => {
  assert.deepEqual(offered(defs, blankState(), {}), ['light.01']);
});

// Reachable · act-ordered · on budget · ten Truths, all of them in dialogue (STORY §8.5).
test('Light plays end to end from a blank save and pays its five act budgets', () => {
  assertCampaign('light', { truths: 10 });
});

test('finishing Light unlocks Dark and leaves the ledger answered', () => {
  const { g } = playCampaign('light');
  assert.equal(g.flags['light.done'], true);
  assert.equal(g.flags['unlocked.dark'], true);
  assert.equal(g.flags['echo.white_cord'], true);
  assert.equal(g.flags['light.ledger.read'], true);
});

// Dark is not playable from a blank save and must not be: it opens on the character Light left.
test('Dark plays end to end from a save that finished Light, and pays its budgets', () => {
  assertCampaign('dark', { after: ['light'], truths: 12 });
});

test('Dark offers nothing to a save that has not finished Light', () => {
  const { state } = playThrough([]);
  const open = offered(defs, state, { quests: state.quests }).filter(id => defs[id].campaign === 'dark');
  assert.deepEqual(open, [], 'the posting is a posting — you have to be posted');
});

test('Dark opens on a trained character, not a fresh one', () => {
  const { g, per } = playThrough(['light', 'dark']);
  assert.ok(g.schools.cull > 0 && g.schools.line > 0 && g.schools.hearth > 0,
    'the Light campaign carries in, so Act 1 is adult work');
  assert.equal(per.dark.order[0], 'dark.01');
  assert.equal(defs['dark.01'].prereq[1], 'light.24');
});

test('finishing Dark unlocks Neutral and grants the Short Rope', () => {
  const { g } = playThrough(['light', 'dark']);
  assert.equal(g.flags['dark.done'], true);
  assert.equal(g.flags['unlocked.neutral'], true);
  assert.equal(g.flags['echo.short_rope'], true);
});

// §8.5's whole argument for the three-play ladder: Dark strikes seven Truths the player earned
// as Light. If a chain link is authored but never marked, that is a scene with nothing in it.
test('Dark strikes seven of the Truths Light left the player holding', () => {
  const held = new Set([...truthsFrom('light'), ...truthsFrom('dark')]);
  const struck = Object.entries(truths)
    .filter(([id, t]) => t.campaign === 'dark' && held.has(id))
    .flatMap(([, t]) => [].concat(t.supersedes ?? []));
  for (const id of struck) assert.ok(held.has(id), `${id} is struck but was never earned`);
  const fromLight = [...new Set(struck)].filter(id => truths[id].campaign === 'light').sort();
  assert.deepEqual(fromLight, [
    'cousin', 'raiders.east', 'shaft.dry', 'strike.won', 'unseen', 'vail.dead', 'wagon.eighth',
  ]);
});

// Reachable · act-ordered · on budget · twelve Truths, all of them in dialogue (STORY §8.5).
test('Neutral plays end to end on a save that finished both, and pays its budgets', () => {
  assertCampaign('neutral', { after: ['light', 'dark'], truths: 12 });
});

// The third rung of a fixed ladder: Longacre has nothing to teach you until it does.
test('Neutral offers nothing until Light and Dark are both finished', () => {
  const open = (r) => offered(defs, r.state, { quests: r.state.quests, flags: r.g.flags })
    .filter(id => defs[id].campaign === 'neutral');

  assert.deepEqual(open(playThrough([])), [], 'not from a blank save');
  assert.deepEqual(open(playThrough(['light'])), [], 'not on the White Cord alone');
  assert.deepEqual(open(playThrough(['light', 'dark'])), ['neutral.01'], 'and then only the walk home');
  assert.deepEqual(defs['neutral.01'].prereq, ['quest', 'dark.22', 'done']);
});

// STORY §11: one character, full carry. Neutral Act 1 is written for a returning master, so the
// harness has to prove the master actually arrives.
test('Neutral opens on the character Light and Dark trained, not a beginner', () => {
  const { per } = playThrough(['light', 'dark', 'neutral']);
  for (const s of SCHOOLS) {
    assert.ok(per.neutral.before[s] > 0, `${s} carried nothing into Longacre`);
    assert.ok(per.neutral.before[s] >= per.dark.before[s], `${s} went backwards between campaigns`);
  }
  assert.ok(per.neutral.before.glamour > 0, 'Graft is granted to hands that have already worked');
  assert.equal(per.neutral.order[0], 'neutral.01');
});

// Graft is the campaign. Every step that stands in another town's face is behind N07, and a step
// that wants a face does not advance without one.
test('Graft gates every step that wears another town', () => {
  const wornSteps = [];
  for (const d of Object.values(defs)) {
    for (const s of d.steps) if (s.worn !== undefined) wornSteps.push([d.id, s]);
  }
  assert.ok(wornSteps.length >= 12, `${wornSteps.length} disguise steps is not a campaign`);

  const { per } = playThrough(['light', 'dark', 'neutral']);
  const grafted = per.neutral.order.indexOf('neutral.07');
  assert.ok(grafted >= 0);
  for (const [id] of wornSteps) {
    assert.equal(defs[id].campaign, 'neutral', `${id} wears a face outside Longacre's campaign`);
    assert.ok(per.neutral.order.indexOf(id) > grafted, `${id} wears a face before N07 grants Graft`);
  }
});

test('a step that needs a face does not advance without one', () => {
  const def = defs['neutral.08'];
  const i = def.steps.findIndex(s => s.worn === 'light');
  const at = () => ({ quests: { 'neutral.08': { s: 'active', i, c: {} } }, tracked: null });
  const event = { t: 'enter', area: 'wwa.market' };

  const bare = step(defs, at(), event, { quests: at().quests });
  assert.equal(bare.state.quests['neutral.08'].i, i, 'Sanctum Yard is not open to your own face');

  const worn = step(defs, at(), event, { quests: at().quests, worn: 'light' });
  assert.equal(worn.state.quests['neutral.08'].i, i + 1, 'and it is open to Ansel');
});

// §8.5's Neutral row says seven. Ten Truths the first two campaigns handed the player are struck
// by this one — see NOTES_CONTENT §8.6b. The list is the assertion, not the count.
test('Neutral strikes ten Truths the first two campaigns left standing', () => {
  const held = new Set([...truthsFrom('light'), ...truthsFrom('dark'), ...truthsFrom('neutral')]);
  const struck = Object.entries(truths)
    .filter(([id, t]) => t.campaign === 'neutral' && held.has(id))
    .flatMap(([, t]) => [].concat(t.supersedes ?? []));
  for (const id of struck) assert.ok(held.has(id), `${id} is struck but was never earned`);
  const earlier = [...new Set(struck)].filter(id => truths[id].campaign !== 'neutral').sort();
  assert.deepEqual(earlier, [
    'ansel.nobody', 'count.never.holds', 'fostered', 'raid.water', 'seam.west', 'sela.face',
    'strike.undone', 'thirty.years', 'wagon.watched', 'walls.wrong.way',
  ]);
});

test('the ladder plays end to end on one save and ends on the Long Furrow', () => {
  const { g, per, order } = playThrough(['light', 'dark', 'neutral']);
  assert.equal(order.length, Object.values(defs).filter(d => d.campaign !== 'sandbox').length);
  assert.equal(g.flags['neutral.done'], true);
  assert.equal(g.flags['echo.long_furrow'], true);
  assert.equal(g.flags['trilogy.done'], true);
  assert.equal(g.truths.length, 0, 'Truths land in dialogue, never in a turn-in payout');
  assert.equal(per.neutral.order.at(-1), 'neutral.21');
  // 1 mk of rounding across five acts, the same as Light's 889 against 890.
  assert.equal(per.neutral.marks, 4351);
});
