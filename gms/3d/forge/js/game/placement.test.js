// The seam between the quest corpus and the world's props and cast. Everything here reads the real
// data/quests/*.json, the real data/areas.json and the real placement files — nothing carries a
// second copy of the id list, because a hand-copied list is what would let a prop go missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { placeAll, propIds, anchor, loadPlacements } from './placement.js';
import { contains } from './areas.js';
import { step, blankState } from './quest.js';
import { lintAll } from '../../tools/lintQuests.mjs';
import { crowd } from '../world/roster.js';
import { Cast } from '../world/cast.js';

const read = f => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const SHIPPED = lintAll();
const AREAS = SHIPPED.areas;
const PROPS = placeAll(read('data/props.json'), AREAS);
const AT = placeAll(read('data/cast_at.json'), AREAS);

// Ids the corpus asks for that this pass deliberately does not place. Empty, and the test below is
// what keeps it honest: an id added to a pack and not to props.json fails rather than going quiet.
const GAPS = [];

// `self` is the player's own face — session.selfTarget() answers it, not a prop.
const wanted = () => [...propIds(SHIPPED.defs).values()].filter(p => p.id !== 'self');

test('data/props.json places every prop id the packs reference', () => {
  const have = new Set(PROPS.placed.map(p => p.id));
  const missing = wanted().map(p => p.id).filter(id => !have.has(id) && !GAPS.includes(id));
  assert.deepEqual(missing, [], 'these ids have an objective and no prop');
  assert.deepEqual(PROPS.errors, []);
});

test('every prop stands inside every area a step looks for it in', () => {
  const bad = [];
  for (const want of wanted()) {
    const p = PROPS.placed.find(x => x.id === want.id);
    if (!p) continue;
    for (const area of want.in) {
      if (!contains(AREAS[area], p.x, p.z)) bad.push(`${p.id} is not inside ${area}`);
    }
    if (!contains(AREAS[p.area], p.x, p.z)) bad.push(`${p.id} is not inside its own anchor ${p.area}`);
  }
  assert.deepEqual(bad, []);
});

test('an `at` outside the anchor is refused rather than clamped', () => {
  const rect = { id: 'r', shape: { k: 'rect', x0: 0, z0: 0, x1: 10, z1: 10 } };
  const circle = { id: 'c', shape: { k: 'circle', x: 0, z: 0, r: 5 } };
  assert.deepEqual(anchor(rect, [1, -1]), { x: 10, z: 0 });
  assert.equal(anchor(rect, [1.2, 0]), null);
  assert.equal(anchor(circle, [0.8, 0.8]), null, 'a corner of the unit square is outside the disc');
  assert.deepEqual(anchor(circle, [0, -1]), { x: 0, z: -5 });
  const r = placeAll([{ id: 'x', area: 'r', at: [3, 0] }], { r: rect });
  assert.equal(r.placed.length, 0);
  assert.match(r.errors[0], /outside/);
});

test('every named NPC the packs talk to has a body', () => {
  const named = new Set();
  for (const def of Object.values(SHIPPED.defs)) {
    if (def.giver) named.add(def.giver);
    if (def.turnin) named.add(def.turnin);
    for (const s of def.steps) for (const o of s.objectives) if (o.k === 'talk') named.add(o.npc);
  }
  // The Yard post gives board work and is a prop, not a person.
  const people = [...named].filter(id => !PROPS.placed.some(p => p.id === id));
  const missing = people.filter(id => !AT.placed.some(a => a.id === id));
  assert.deepEqual(missing, []);
  assert.deepEqual(AT.errors, []);
});

test('a named NPC is one fixed body, not whoever is nearest', () => {
  const people = { agents: [], place(a) { this.agents.unshift(a); return a; } };
  for (let i = 0; i < 40; i++) people.agents.push({ kind: 'walk', x: i, z: 0 });
  const cast = new Cast(people, AT.placed);

  const bel = cast.at('bel');
  const before = cast.targets().find(t => t.id === 'bel');
  // The rig moves what it owns; a fixed body's x never changes, and the target reads the body.
  for (const a of people.agents) if (!a.npc) a.x += 7;
  const after = cast.targets().find(t => t.id === 'bel');
  assert.equal(cast.at('bel'), bel, 'the same object answers to the name');
  assert.deepEqual([after.x, after.z], [before.x, before.z]);
  assert.equal(after.x, AT.placed.find(a => a.id === 'bel').x);

  // The crowd knob sizes the wanderers; it can never drop a body a quest points at.
  assert.equal(crowd(people.agents, 0).length, AT.placed.length);
  assert.ok(crowd(people.agents, 0).every(a => a.npc));
  assert.equal(crowd(people.agents, 12).length, AT.placed.length + 12);
});

test('the granary lamp answers Kindle and the step it belongs to', () => {
  const lamp = PROPS.placed.find(p => p.id === 'wwa.granary.lamp');
  assert.ok(lamp && contains(AREAS['wwa.granary'], lamp.x, lamp.z));

  const defs = { 'light.01': SHIPPED.defs['light.01'] };
  let state = { quests: { 'light.01': { s: 'active', i: 2, c: {}, t: 0, e: 0 } }, tracked: 'light.01' };
  const ctx = { areas: ['wwa.granary', 'wwa'], schools: {}, quests: state.quests, flags: {}, truths: [], items: {} };

  const wrong = step(defs, state, { t: 'interact', id: lamp.id, verb: 'barter' }, ctx);
  assert.equal(wrong.state.quests['light.01'].i, 2, 'the wrong school pays nothing');

  const right = step(defs, state, { t: 'interact', id: lamp.id, verb: 'kindle' }, ctx);
  assert.equal(right.state.quests['light.01'].i, 3, 'and the right one advances the step');
});

// The whole of light.01 through the real reducer, driven by the ids `targets()` really produces —
// which is the thing that was broken: the rules were fine and there was nothing to aim them at.
test('light.01 runs end to end on the ids targets() produces', () => {
  const targets = new Map([
    ...PROPS.placed.map(p => [p.id, { id: p.id, kind: p.kind || 'interact', x: p.x, z: p.z }]),
    ...AT.placed.map(a => [a.id, { id: a.id, kind: 'talk', x: a.x, z: a.z }]),
  ]);
  const defs = { 'light.01': SHIPPED.defs['light.01'] };
  let state = blankState();
  const ctx = () => ({ areas: ['wwa.granary', 'wwa'], quests: state.quests, flags: {}, truths: [], schools: { kindle: 200, cull: 200 }, items: {}, standing: {}, campaign: { current: 'light', done: [] }, day: 0, hour: 9 });
  const fire = e => { const r = step(defs, state, e, ctx()); state = r.state; return r.effects; };

  fire({ t: 'accept', id: 'light.01', force: true });
  for (let i = 0; i < 8; i++) fire({ t: 'kill', kind: 'grain_rat', area: 'wwa.granary', areas: ['wwa.granary', 'wwa'] });
  assert.equal(state.quests['light.01'].i, 2, 'both cull steps are done');

  const lamp = targets.get('wwa.granary.lamp');
  assert.ok(lamp && lamp.kind === 'interact', 'the lamp is an interact target');
  fire({ t: 'interact', id: lamp.id, verb: 'kindle' });
  assert.equal(state.quests['light.01'].i, 3, 'the lamp step ticked');

  const bel = targets.get('bel');
  assert.ok(bel && bel.kind === 'talk', 'Bel is a talk target');
  const fx = fire({ t: 'talk', npc: bel.id, node: 'light.01.out' });
  assert.equal(state.quests['light.01'].s, 'done');
  assert.ok(fx.some(e => e[0] === 'item' && e[1] === 'rat_tail' && e[2] === 8), 'and it paid');
  assert.ok(fx.some(e => e[0] === 'flag' && e[1] === 'wwa.granary.clear'));
});

test('every object a step arms is a prop, or it is on the record as a gap', () => {
  const armed = new Set();
  for (const def of Object.values(SHIPPED.defs)) {
    for (const s of def.steps) for (const a of s.recover || []) if (a[0] === 'arm') armed.add(a[1]);
  }
  const have = new Set(PROPS.placed.map(p => p.id));
  // The hen is an escort target. Nothing places it, and `world.arm` says so out loud rather than
  // reporting a reset it did not do.
  assert.deepEqual([...armed].filter(id => !have.has(id)), ['lac.henhouse.hen']);
});

test('main.js hands the session the placed props and the placed cast', () => {
  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const i = src.indexOf('function targets()');
  assert.ok(i > 0, 'main.js changed shape — this test needs rewriting');
  const fn = src.slice(i, src.indexOf('\n}', i));
  assert.match(fn, /props\.targets\(\)/);
  assert.match(fn, /cast\.targets\(\)/);
  for (const id of AT.placed.map(a => a.id)) {
    assert.ok(!src.includes(`'${id}'`), `main.js names ${id} — the wandering stand-in is back`);
  }
});

test('Bel is close enough to the granary to be found from it', () => {
  const bel = AT.placed.find(a => a.id === 'bel');
  const g = AREAS['wwa.granary'];
  const c = { x: (g.shape.x0 + g.shape.x1) / 2, z: (g.shape.z0 + g.shape.z1) / 2 };
  assert.ok(Math.hypot(bel.x - c.x, bel.z - c.z) < 20, 'the opening quest cannot end in a search');
});

// Moving data/props.json aside used to take data/cast_at.json and all eighteen named NPCs with it:
// three awaits in series behind one rejection, and one console warning naming only the first file.
test('losing one placement file does not take the others down with it', async () => {
  const realFetch = globalThis.fetch, realWarn = console.warn;
  const said = [];
  const serve = miss => async url => {
    const name = String(url).split('/').pop();
    if (name === miss) return { ok: false, status: 404 };
    return { ok: true, json: async () => read(`data/${name}`) };
  };
  console.warn = m => said.push(m);
  try {
    globalThis.fetch = serve('props.json');
    const noProps = await loadPlacements();
    assert.equal(noProps.props.length, 0);
    assert.equal(noProps.cast.length, AT.placed.length, 'the named cast is still placed');
    assert.ok(said.some(m => m.includes('props.json')), `nothing said which file: ${said}`);

    globalThis.fetch = serve('cast_at.json');
    const noCast = await loadPlacements();
    assert.equal(noCast.props.length, PROPS.placed.length, 'and the props are still placed');
    assert.equal(noCast.cast.length, 0);

    globalThis.fetch = serve('areas.json');
    const noAreas = await loadPlacements();
    assert.deepEqual([noAreas.props.length, noAreas.cast.length], [0, 0], 'nothing has an anchor');
    assert.equal(noAreas.errors.length, 1, 'and it says so once rather than sixty-six times');
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
});
