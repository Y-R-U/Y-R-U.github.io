// The eighth primitive. The seam is that arrival is judged on the *actor's* position and credited
// through the real reducer — the failure this guards against is a step that ticks over because the
// player walked to the destination and left the thing behind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ESCORT, SPEED, carriedGait, escortActors, escortWants, escortEvent, escortActorOf, newEscort,
  stepEscort,
} from './escort.js';
import { step } from './quest.js';
import { placeAll, anchor } from './placement.js';
import { contains, centreOf } from './areas.js';
import { lintAll } from '../../tools/lintQuests.mjs';

const SHIPPED = lintAll();
const read = f => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const ESCORTS = read('data/escorts.json');
const CAST_AT = read('data/cast_at.json');

// Every escort objective in the shipped packs, and where each one is going.
function corpus() {
  const out = [];
  for (const def of Object.values(SHIPPED.defs)) {
    for (const s of def.steps) {
      for (const o of s.objectives) if (o.k === 'escort') out.push({ ...o, quest: def.id, step: s.id });
    }
  }
  return out;
}

const placed = placeAll(ESCORTS, SHIPPED.areas);
const bodyOf = npc => placed.placed.find(e => e.id === npc)
  || (CAST_AT.some(c => c.id === npc) ? { id: npc, body: 'person' } : null);
// js/world/escorts.js keys the speeds by body kind, and it is the same table this reads.
const speedOf = npc => SPEED[bodyOf(npc).body];

test('every escort the corpus asks for has an actor with a body', () => {
  assert.deepEqual(placed.errors, []);
  const asked = [...new Set(corpus().map(o => o.npc))].sort();
  assert.deepEqual(asked, ['cart', 'fen', 'hen', 'wagon'], 'the corpus changed — check the actors, not this list');
  for (const npc of asked) assert.ok(bodyOf(npc), `${npc} is escorted ${corpus().filter(o => o.npc === npc).length}× and has no body`);
  for (const e of placed.placed) assert.ok(asked.includes(e.id), `${e.id} has a body and nothing escorts it`);
});

// All four, Fen included. His crossing used to end in `reach.neutral` — the whole 300 × 152 m
// Longacre bank, which he stands in the middle of — so it credited after 11.6 m in whatever
// direction the player happened to be, inside two seconds. `lac.mill` is where the step after it
// counts the crates off.
test('every escort destination is a declared area the actor does not already stand in', () => {
  const at = npc => placed.placed.find(e => e.id === npc)
    || CAST_AT.map(c => ({ ...c, ...anchor(SHIPPED.areas[c.area], c.at) })).find(c => c.id === npc);
  for (const o of corpus()) {
    const area = SHIPPED.areas[o.path];
    assert.ok(area, `${o.quest}/${o.step} escorts to ${o.path}, which is not an area`);
    const body = at(o.npc);
    assert.ok(body, `${o.npc} is escorted and stands nowhere`);
    assert.equal(contains(area, body.x, body.z), false,
      `${o.npc} starts inside ${o.path}, so the walk would be over before it began`);
  }
});

test('a body is only ever placed once, and inside the area it is anchored to', () => {
  for (const e of placed.placed) {
    assert.ok(contains(SHIPPED.areas[e.area], e.x, e.z), `${e.id} lands outside ${e.area}`);
    assert.ok(['fowl', 'wagon'].includes(e.body), `${e.id} wants a body kind nothing builds`);
  }
});

// These used to live in js/world/escorts.js, which imports three, so setting the whole table to 0
// — nothing in the world follows you again, ever — left all 480 tests green.
test('every escorted body keeps up with a walk and falls behind a sprint', () => {
  const WALK = 5.0, SPRINT = 8.5;
  for (const [body, mps] of Object.entries(SPEED)) {
    assert.ok(mps > 0, `${body} does not move`);
    assert.ok(mps * ESCORT.hurryMul > WALK, `${body} at ${mps} m/s cannot catch a walking player`);
    assert.ok(mps < SPRINT, `${body} at ${mps} m/s can never be lost, so the grace rule is dead`);
  }
  for (const npc of ['cart', 'fen', 'hen', 'wagon']) {
    assert.ok(speedOf(npc) > 0, `${npc} has a body kind with no speed`);
  }
  // The walk cycle the body plays while it is carried, which is not the speed it is carried at.
  assert.equal(carriedGait('fowl', 0), 0.46);
  assert.equal(carriedGait('person', 1.2), SPEED.person * 0.4);
  assert.equal(carriedGait('person', null), 0, 'a frame the rules did not move it is a frame stood still');
});

// ── which actor is walking, and when ───────────────────────────────────────

const ctx = q => ({ quests: q, flags: {}, truths: [], schools: {}, items: {}, areas: [], hour: 9, day: 1 });

test('an actor gets a body as soon as its quest is in progress, and walks only on its own step', () => {
  const q = { 'light.11': { s: 'active', i: 0, c: {} } };
  assert.deepEqual(escortActors(SHIPPED.defs, q), ['wagon'],
    'the wagon has to be standing at the spur before the step that walks it is the live one');
  assert.deepEqual(escortWants(SHIPPED.defs, q, ctx(q)), [], 'and it is not following yet');

  q['light.11'].i = 2;                                    // the `walk` step
  const wants = escortWants(SHIPPED.defs, q, ctx(q));
  assert.equal(wants.length, 1);
  assert.equal(wants[0].npc, 'wagon');
  assert.equal(wants[0].path, 'road.drove');

  q['light.11'].c = { walk: [1, 0] };                     // escort done, the rat knots are not
  assert.deepEqual(escortWants(SHIPPED.defs, q, ctx(q)), [], 'a finished escort stops following');
});

test('a quest that is over takes its actor off the board', () => {
  assert.deepEqual(escortActors(SHIPPED.defs, { 'light.11': { s: 'done', i: 4, c: {} } }), []);
});

// ── the walk ───────────────────────────────────────────────────────────────

// One actor, one player, ticked at 30 Hz. `walk` moves the player a step each frame.
function drive(st, { from, at = from, walk, frames = 900, path = null, speed = 3.8 }) {
  const p = { ...from };
  const a = { ...at };
  const events = [];
  let state = st;
  for (let i = 0; i < frames; i++) {
    walk(p, i);
    const r = stepEscort(state, 1 / 30, {
      px: p.x, pz: p.z, ax: a.x, az: a.z, speed,
      inPath: path ? contains(path, a.x, a.z) : false,
    });
    state = r.state;
    a.x = r.x; a.z = r.z;
    if (r.event) events.push([r.event, i]);
    if (state.phase === 'done') break;
  }
  return { state, actor: a, player: p, events };
}

const straight = (dx, dz, mps = 4.4) => (p) => { p.x += dx * mps / 30; p.z += dz * mps / 30; };

test('an actor picked up follows, and closes the gap when you stop', () => {
  const st = newEscort('hen', 'lac.henhouse');
  const r = drive(st, { from: { x: 0, z: 0 }, walk: (p, i) => { if (i < 300) straight(0, 1)(p); }, frames: 600 });
  assert.equal(r.state.phase, 'follow');
  const gap = Math.hypot(r.actor.x - r.player.x, r.actor.z - r.player.z);
  assert.ok(gap <= ESCORT.follow + 0.2, `it settled ${gap.toFixed(2)} m behind, not ${ESCORT.follow}`);
});

test('an actor is lost after long enough out of reach, and stops where it was left', () => {
  const st = newEscort('hen', 'lac.henhouse');
  const r = drive(st, { from: { x: 0, z: 0 }, walk: straight(0, 1, 8.5), frames: 900, speed: 3.6 });
  assert.equal(r.state.phase, 'lost');
  const [name, frame] = r.events.find(e => e[0] === 'lost');
  assert.equal(name, 'lost');
  assert.ok(Math.abs(r.actor.z) > 0, 'it never followed at all, so losing it proves nothing');
  assert.ok(frame / 30 > ESCORT.grace, 'it gave up before the grace period was out');
  // Ten more seconds of sprinting away move it no further.
  const on = drive(r.state, {
    from: { x: r.player.x, z: r.player.z }, at: { ...r.actor },
    walk: straight(0, 1, 8.5), frames: 300, speed: 3.6,
  });
  assert.equal(on.state.phase, 'lost');
  assert.deepEqual(on.actor, r.actor, 'a lost actor is still walking after you');
});

test('walking back for a lost actor picks the walk up again', () => {
  const lost = { ...newEscort('hen', 'lac.henhouse'), phase: 'lost', from: { x: 0, z: 0 } };
  const near = stepEscort(lost, 1 / 30, { px: 40, pz: 0, ax: 0, az: 0 });
  assert.equal(near.state.phase, 'lost', 'shouting from forty metres is not coming back for it');
  const back = stepEscort(lost, 1 / 30, { px: ESCORT.pickup - 1, pz: 0, ax: 0, az: 0 });
  assert.equal(back.state.phase, 'follow');
  assert.equal(back.event, 'found');
});

// The one the brief names, in both halves: getting there first credits nothing, and an actor
// abandoned far enough behind stops following and cannot be arrived with at all.
test('an abandoned escort does not silently complete when you arrive without it', () => {
  const defs = { 'sandbox.12': SHIPPED.defs['sandbox.12'] };
  const house = SHIPPED.areas['lac.henhouse'];
  const home = placed.placed.find(e => e.id === 'hen');
  const to = centreOf(house);
  const dx = to.x - home.x, dz = to.z - home.z;
  const d = Math.hypot(dx, dz);

  // Sprint the 63 m from the cotts to the hen house and stand in the doorway.
  const run = drive(newEscort('hen', 'lac.henhouse'), {
    from: { x: home.x, z: home.z }, path: house, speed: speedOf('hen'),
    frames: Math.ceil(d / (8.5 / 30)),
    walk: p => { p.x += dx / d * 8.5 / 30; p.z += dz / d * 8.5 / 30; },
  });
  assert.ok(contains(house, run.player.x, run.player.z), 'the player never got there');
  assert.equal(contains(house, run.actor.x, run.actor.z), false, 'the hen kept up with a sprint');
  assert.deepEqual(run.events, [], 'arriving first is not arriving with it');

  // Now keep going and leave it: the walk is over and standing in the hen house does not end it.
  const gone = drive(run.state, {
    from: { x: run.player.x, z: run.player.z }, at: { ...run.actor }, path: house, speed: speedOf('hen'),
    frames: 900, walk: straight(1, 0, 8.5),
  });
  assert.equal(gone.state.phase, 'lost');

  const back = stepEscort(gone.state, 1 / 30, {
    px: to.x, pz: to.z, ax: gone.actor.x, az: gone.actor.z, inPath: false, speed: speedOf('hen'),
  });
  assert.equal(back.event, null);
  assert.equal(back.state.phase, 'lost', 'the hen is still under the cotts and the step is still open');

  const state = { quests: { 'sandbox.12': { s: 'active', i: 0, c: {} } }, tracked: 'sandbox.12' };
  const out = step(defs, state, { t: 'enter', area: 'lac.henhouse' }, ctx(state.quests));
  assert.equal(out.state.quests['sandbox.12'].s, 'active', 'walking in on your own finished the job');
  assert.deepEqual(out.effects, []);
});

test('walking the hen home completes the step through the real reducer', () => {
  const def = SHIPPED.defs['sandbox.12'];
  const house = SHIPPED.areas['lac.henhouse'];
  const home = placed.placed.find(e => e.id === 'hen');
  const to = centreOf(house);
  const dx = to.x - home.x, dz = to.z - home.z;
  const d = Math.hypot(dx, dz);
  const r = drive(newEscort('hen', 'lac.henhouse'), {
    from: { x: home.x, z: home.z }, path: house, speed: speedOf('hen'), frames: 3000,
    walk: p => { if (Math.hypot(to.x - p.x, to.z - p.z) > 0.5) { p.x += dx / d * 3.0 / 30; p.z += dz / d * 3.0 / 30; } },
  });
  assert.equal(r.state.phase, 'done');
  assert.ok(contains(house, r.actor.x, r.actor.z), 'it stopped short of the hen house');

  const defs = { 'sandbox.12': def };
  let state = { quests: { 'sandbox.12': { s: 'active', i: 0, c: {} } }, tracked: 'sandbox.12' };
  const out = step(defs, state, escortEvent(r.state), ctx(state.quests));
  // A repeatable board job finishes into `cooling`, which pays exactly as `done` does.
  assert.equal(out.state.quests['sandbox.12'].s, 'cooling');
  assert.ok(out.effects.some(e => e[0] === 'quest' && e[2] === 'cooling'));
  assert.ok(out.effects.some(e => e[0] === 'xp'), 'and it paid');

  // …and the same event with the wrong destination on it is refused.
  const wrong = step(defs, state, { t: 'escort', npc: 'hen', path: 'road.drove' }, ctx(state.quests));
  assert.equal(wrong.state.quests['sandbox.12'].s, 'active');
});

// Fen stands 2.6 m from the edge of `lac.mill`, which is what `ESCORT.travel` is for: a step off
// the bridge is not a ferry crossing, and the walk has to be a directed one into the mill yard
// rather than 12 m in whatever direction the player happens to stand.
test('a destination a step away still has to be walked properly into', () => {
  const mill = SHIPPED.areas['lac.mill'];
  const fenAt = anchor(SHIPPED.areas['lac.millbridge'], CAST_AT.find(c => c.id === 'fen').at);
  assert.equal(contains(mill, fenAt.x, fenAt.z), false);
  const gap = Math.min(...[[mill.shape.x0, fenAt.z], [mill.shape.x1, fenAt.z]]
    .map(([x, z]) => Math.hypot(x - fenAt.x, z - fenAt.z)));
  assert.ok(gap < ESCORT.travel, `${gap.toFixed(1)} m — the comment in escort.js says 2.6`);

  const one = stepEscort({ ...newEscort('fen', 'lac.mill'), phase: 'follow', from: { ...fenAt } },
    1 / 30, { px: fenAt.x + 1, pz: fenAt.z, ax: fenAt.x, az: fenAt.z, inPath: true, speed: speedOf('fen') });
  assert.notEqual(one.event, 'arrive', 'standing next to him finished the crossing');

  // The player walks to the crate the next step counts off at, and Fen comes with them.
  const crate = { x: -11, z: 112 };
  const d = Math.hypot(crate.x - fenAt.x, crate.z - fenAt.z);
  const r = drive(newEscort('fen', 'lac.mill'), {
    from: { ...fenAt }, path: mill, speed: speedOf('fen'), frames: 900,
    walk: p => {
      if (Math.hypot(crate.x - p.x, crate.z - p.z) < 0.5) return;
      p.x += (crate.x - fenAt.x) / d * 3.0 / 30;
      p.z += (crate.z - fenAt.z) / d * 3.0 / 30;
    },
  });
  assert.equal(r.state.phase, 'done');
  assert.ok(contains(mill, r.actor.x, r.actor.z), 'he stopped short of the mill');
  const walked = Math.hypot(r.actor.x - fenAt.x, r.actor.z - fenAt.z);
  assert.ok(walked >= ESCORT.travel, `he arrived after ${walked.toFixed(1)} m and the rule is ${ESCORT.travel}`);
});

// ── §9.4 ───────────────────────────────────────────────────────────────────

test('every `arm` the packs ask for names a prop or an escort actor', () => {
  const props = new Set(read('data/props.json').map(p => p.id));
  const actors = new Set([...placed.placed.map(e => e.id), ...CAST_AT.map(c => c.id)]);
  const armed = new Set();
  for (const def of Object.values(SHIPPED.defs)) {
    for (const s of def.steps) for (const r of s.recover || []) if (r[0] === 'arm') armed.add(r[1]);
  }
  assert.ok(armed.has('lac.henhouse.hen'), 'the corpus stopped arming the hen — check this test');
  for (const id of armed) {
    assert.ok(props.has(id) || actors.has(escortActorOf(id)),
      `recover: arm ${id} names nothing the world can put back`);
  }
  assert.equal(escortActorOf('lac.henhouse.hen'), 'hen');
});

// A board job goes straight to `cooling` when it credits, so `escortActors` drops its actor on the
// very next tick — and the player is necessarily inside 30 m, or the escort would have been lost.
// Measured: the hen popped out of existence at the hen house door and Fen snapped 11 m back to
// Millbridge, both while the player was looking at them.
test('a repeatable escort that has just credited does not clear its actor in front of you', async () => {
  const { fakeDom } = await import('./fakedom.js');
  fakeDom();
  const { Session } = await import('./session.js');
  localStorage.clear();

  const home = placed.placed.find(e => e.id === 'hen');
  const bird = { x: -84.4, z: 14.0 };                       // where sandbox.12 leaves it
  const log = [];
  const escort = {
    at: () => bird,
    speed: () => speedOf('hen'),
    show: (npc, on) => log.push(`show ${npc} ${on}`),
    park: npc => { log.push(`park ${npc}`); bird.x = home.x; bird.z = home.z; },
    move: () => true,
  };
  const player = { pos: { x: bird.x + 2, y: 4, z: bird.z, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, camYaw: 0 };
  const s = new Session({ quality: { register() {}, get() {} } }, player, { fresh: true, world: { escort } });
  await s.start();

  s.doc.quests['sandbox.12'] = { s: 'active', i: 0, c: {} };
  s.escortTick(1 / 30);
  assert.deepEqual(log.splice(0), ['show hen true']);

  s.doc.quests['sandbox.12'] = { s: 'cooling', i: 0, c: {} };
  for (let i = 0; i < 60; i++) s.escortTick(1 / 30);
  assert.deepEqual(log.splice(0), [], 'the hen went away while the player was standing over it');
  assert.deepEqual(bird, { x: -84.4, z: 14.0 });

  player.pos.set(bird.x + ESCORT.lose + 1, 4, bird.z);
  s.escortTick(1 / 30);
  assert.deepEqual(log.splice(0), ['park hen', 'show hen false'],
    'park runs first — hiding the hen takes its agent away and leaves park nothing to move');
  assert.deepEqual(bird, { x: home.x, z: home.z });
});

test('the session drives the escort through the pure rules and nothing else', () => {
  const s = readFileSync(new URL('./session.js', import.meta.url), 'utf8');
  assert.match(s, /this\.escortTick\(dt\);/, 'nothing turns the handle');
  assert.match(s, /stepEscort\(st, dt, \{/);
  assert.match(s, /this\.quests\.emit\(escortEvent\(r\.state\)\)/,
    'the escort event is being hand-rolled somewhere instead of coming out of the builder');
  assert.match(s, /inPath: !l\.path \|\| contains\(this\.quests\.areas\[l\.path\], at\.x, at\.z\)/,
    'arrival is being judged on the player rather than on the actor');
});
