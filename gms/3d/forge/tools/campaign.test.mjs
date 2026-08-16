// Plays the shipped packs with nothing but the events the steps themselves ask for, up the unlock
// ladder on one save. If a quest cannot be reached by a player who only does what the quests say,
// this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blankState, step, offered, finishes } from '../js/game/quest.js';
import { slate } from '../js/game/towns.js';
import { blankSchools, SCHOOLS } from '../js/sim/schools.js';
import { ACTS } from '../js/sim/campaign.js';
import { ENEMIES } from '../js/sim/tables.js';
import { bodied } from '../js/world/bestiary.js';
import { lintAll, travelErrors, failRetryErrors, itemFlowErrors } from './lintQuests.mjs';

const { defs, dialogue, truths, areas } = lintAll();

// Why the running game could never emit this objective's event, or null.
//
// This is the whole promise of the file. For years the harness manufactured a `kill` for every kill
// objective whether or not anything in the world could produce one, and a bestiary row with no rig
// — `sour_crow` — hid sixty-one unfinishable quests and two whole campaigns behind a green suite.
// The other verbs are gated by tests that own the data they need: gathering.test.js for `gather`,
// placement.test.js for `interact` and `talk`, escort.test.js for `escort`, lintQuests for every
// area id. Kill is the one nothing else could see, so it is checked here. A verb added later has to
// be classified — `eventsFor`'s `default` throws on an objective kind this file does not know.
export function whyNoEvent(o, s, can = bodied) {
  if (o.k !== 'kill') return null;
  if (!ENEMIES[o.kind]) return `no bestiary row for ${o.kind}`;
  if (!can(o.kind)) return `no rig in js/main.js can body ${o.kind} (geo: ${ENEMIES[o.kind].geo})`;
  // js/game/spawner.js `planFrom` reads `s.in || o.area` and skips a kill that names neither, so
  // nothing of that kind is ever placed and the step waits on a body that cannot exist.
  const where = s.in || o.area;
  if (!where || !areas[where]) return `nothing plans ${o.kind} anywhere — the step names no area`;
  return null;
}

// One synthetic world event per objective, carrying whatever the step's modifiers demand.
function eventsFor(s, qid = '') {
  return s.objectives.map(o => {
    const why = whyNoEvent(o, s);
    assert.equal(why, null, `${qid}.${s.id}: ${why}`);
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
  const g = { schools: blankSchools(), marks: 0, items: {}, flags: {}, truths: [], acts: [], done: [] };
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
      // The ladder itself: `questrunner.finish()` writes the same list into `campaign.done`, and
      // `towns.slate()` reads it. Mirroring the flags alone proved the packs authored a signal
      // nothing was listening to.
      const fin = finishes(e, current);
      if (fin && !g.done.includes(fin)) g.done.push(fin);
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
      for (const e of eventsFor(s, id)) send(e);
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

// The ladder below only plays the three campaigns; the twenty sandbox jobs are never walked, so
// they need the same question asked of them directly.
test('every objective in the corpus is one the running game can produce an event for', () => {
  const bad = [];
  for (const d of Object.values(defs)) {
    for (const s of d.steps) {
      for (const o of s.objectives) {
        const why = whyNoEvent(o, s);
        if (why) bad.push(`${d.id}.${s.id}: ${why}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// And the counterpart: the check has to be able to see both shapes of the hole. The first is
// light.18 as it shipped for months; the second is light.05's night watch, which asked for two
// mire rats and named no area for them.
test('the check sees an enemy no rig bodies, and a kill with nowhere to be planned', () => {
  const kill = { k: 'kill', kind: 'mire_rat', n: 2 };
  assert.match(whyNoEvent(kill, { id: 'x', in: 'wwa.northgate' }, () => false),
    /no rig in js\/main\.js can body mire_rat/);
  assert.match(whyNoEvent(kill, { id: 'x', in: null }), /nothing plans mire_rat anywhere/);
  assert.equal(whyNoEvent(kill, { id: 'x', in: 'wwa.northgate' }), null);
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
  // The slate is the only thing that reads the ladder, so this is the assertion that matters.
  assert.deepEqual(g.done, ['light']);
  const panels = slate({ campaign: { done: g.done } });
  assert.equal(panels[2].playable, true, 'Blackstone lights');
  assert.equal(panels[1].playable, false, 'and Longacre still has nothing to teach you');
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
  assert.deepEqual(g.done, ['light', 'dark']);
  assert.equal(slate({ campaign: { done: g.done } })[1].playable, true, 'Longacre opens');
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

// Eleven Truths the first two campaigns handed the player are struck by this one — see
// NOTES_CONTENT §8.6b. The list is the assertion, not the count. `cousin` is on it because
// `ansel.you` supersedes both `ansel.nobody` and `ansel.nobody`'s own parent, so the chain closes
// whether or not the player took the two optional quests that hold its middle links.
test('Neutral strikes eleven Truths the first two campaigns left standing', () => {
  const held = new Set([...truthsFrom('light'), ...truthsFrom('dark'), ...truthsFrom('neutral')]);
  const struck = Object.entries(truths)
    .filter(([id, t]) => t.campaign === 'neutral' && held.has(id))
    .flatMap(([, t]) => [].concat(t.supersedes ?? []));
  for (const id of struck) assert.ok(held.has(id), `${id} is struck but was never earned`);
  const earlier = [...new Set(struck)].filter(id => truths[id].campaign !== 'neutral').sort();
  assert.deepEqual(earlier, [
    'ansel.nobody', 'count.never.holds', 'cousin', 'fostered', 'raid.water', 'seam.west',
    'sela.face', 'strike.undone', 'thirty.years', 'wagon.watched', 'walls.wrong.way',
  ]);
});

// The harness above never walks — `clockFor` hands the player any hour they ask for — so a step
// whose window shuts while the player is still crossing the valley passes every other gate in this
// file. light.22 shipped that way and it killed the trilogy.
test('every timed step can be walked to inside its own window', () => {
  assert.deepEqual(travelErrors(defs, areas), []);
});

// The counterpart: the check has to be able to see the bug. This is light.22 as it shipped —
// accepted from the journal on the Blackstone reach, with a three-hour window on the first step.
test('the travel check fails a window that cannot be walked to', () => {
  const broken = {
    'x.01': { ...defs['light.21'], id: 'x.01' },
    'x.02': {
      id: 'x.02', giver: null, town: 'light', prereq: ['quest', 'x.01', 'done'],
      steps: [{
        id: 'night', after: 1, before: 4, within: null, in: null, recover: [],
        objectives: [{ k: 'goto', area: 'wwa.almonry' }],
      }],
    },
  };
  const found = travelErrors(broken, areas);
  assert.equal(found.length, 1);
  assert.match(found[0], /^x\.02\.night: 1001 m from reach\.dark/);
});

// `retry` runs the *first* step's recover and nothing else, so a `fail` predicate reading state
// that recover cannot reach fails again on the first event after the retry. Both of the corpus's
// two `fail` steps shipped that way.
test('every fail predicate can be retried out of', () => {
  assert.deepEqual(failRetryErrors(defs), []);
});

test('the fail-retry check sees both shapes of the soft-lock', () => {
  const step = (id, fail, recover = null) => ({ id, fail, recover, optional: false, objectives: [] });
  const found = failRetryErrors({
    // neutral.06 as it shipped: a flag nothing clears.
    'x.01': { id: 'x.01', steps: [step('brief', null), step('apart', ['flag', 'x.met', true])] },
    // neutral.15 as it shipped: a counter the runtime never resets.
    'x.02': { id: 'x.02', steps: [step('yard', ['damageDealt', '>', 0])] },
    // and the shape that would be safe: the first step's recover is the only one retry runs. It
    // needs a `flag` recover verb, which the world adapter does not have yet.
    'x.03': {
      id: 'x.03',
      steps: [step('brief', null, [['flag', 'x.met', false]]), step('apart', ['flag', 'x.met', true])],
    },
  });
  assert.equal(found.length, 2);
  assert.match(found[0], /^x\.01\.apart: fails on flag x\.met/);
  assert.match(found[1], /^x\.02\.yard: fails on `damageDealt`/);
});

// The harness plays one order and never spends anything, so a quest that gives away what its
// sibling needs finishes here and strands a real player.
test('no quest spends what a sibling quest also needs', () => {
  assert.deepEqual(itemFlowErrors(defs), []);
});

test('the item-flow check sees a double-spend of a shared parent', () => {
  const q = (id, prereq, steps, reward = []) => ({
    id, prereq, steps, board: null, reward: { items: reward, truths: [] }, onDone: [],
  });
  const gather = (kind, n, via = null) => ({ id: 'g', via, onDone: [], objectives: [{ k: 'gather', kind, n }] });
  const deliver = (item, n) => ({ id: 'd', via: 'sell', onDone: [], objectives: [{ k: 'deliver', item, n }] });
  // dark.03 catches eight; dark.04 sells all eight and dark.05 cooks three of the same eight.
  const found = itemFlowErrors({
    'x.03': q('x.03', ['all'], [gather('blackeel', 8)]),
    'x.04': q('x.04', ['quest', 'x.03', 'done'], [deliver('blackeel', 8)]),
    'x.05': q('x.05', ['quest', 'x.03', 'done'], [gather('cooked_blackeel', 3, 'craft')]),
  });
  assert.equal(found.length, 2);
  assert.match(found[0], /^x\.04: spends blackeel, but only 8 are supplied .* against 11 spent between it and x\.05/);
});

test('the ladder plays end to end on one save and ends on the Long Furrow', () => {
  const { g, per, order } = playThrough(['light', 'dark', 'neutral']);
  assert.equal(order.length, Object.values(defs).filter(d => d.campaign !== 'sandbox').length);
  assert.equal(g.flags['neutral.done'], true);
  assert.equal(g.flags['echo.long_furrow'], true);
  assert.equal(g.flags['trilogy.done'], true);
  // Neutral unlocks nothing, so a ladder keyed on `unlock` alone could never close it.
  assert.deepEqual(g.done, ['light', 'dark', 'neutral']);
  assert.ok(slate({ campaign: { done: g.done } })[0].trilogy);
  assert.equal(g.truths.length, 0, 'Truths land in dialogue, never in a turn-in payout');
  assert.equal(per.neutral.order.at(-1), 'neutral.21');
  // 1 mk of rounding across five acts, the same as Light's 889 against 890.
  assert.equal(per.neutral.marks, 4351);
});
