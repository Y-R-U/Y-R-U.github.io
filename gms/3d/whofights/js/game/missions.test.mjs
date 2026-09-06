// One arena, many contracts. The promise is that a mission is four rows of data and that the
// document it produces is one an authored level could have been.

import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { BOARDS } from './contracts.js';
import { ARENA, RING, missionOf, jobFor, playable, spawnsOf, worthOf, briefOf, patchArena } from './missions.js';
import { KIND_IDS, VARIANT_IDS, describe } from './bestiary.js';
import { SURFACES } from './ground.js';
import { normalise } from '../editor/scene.js';

const base = JSON.parse(readFileSync(new URL('../../data/levels/arena.json', import.meta.url)));
const iron = BOARDS['board.iron'].jobs;

test('the arena document on disk is the one missions.js patches', () => {
  eq(base.id, ARENA);
  const plots = base.objects.filter(o => o.type === 'plot');
  ok(plots.length >= 2, 'a floor and something laid on it');
  ok(plots.some(o => o.p.w >= 30), 'one big enough to be the floor');
  ok(plots.filter(o => o.p.w < 30).length >= 2, 'and corners to vary');
  eq(base.foes.length, 0, 'it ships empty — the contract fills it');
  ok(base.hotspots.some(h => h.actions.some(a => a.k === 'event' && a.name === 'mission.begin')),
    'and something in it starts the fight');
});

test('every iron contract is walkable', () => {
  for (const j of iron) ok(playable(j.id), `${j.id} has no mission`);
  ok(iron.length >= 8, `${iron.length} iron contracts`);
});

test('a mission names a kind, a variant and two surfaces the game can actually build', () => {
  for (const j of iron) {
    const m = missionOf(j.id);
    ok(['light', 'neutral', 'dark'].includes(m.zone), `${j.id}: zone "${m.zone}"`);
    ok(SURFACES.includes(m.floor), `${j.id}: floor "${m.floor}"`);
    ok(SURFACES.includes(m.patch), `${j.id}: patch "${m.patch}"`);
    ok(m.spawns.length, `${j.id}: nothing in it`);
    for (const s of m.spawns) {
      ok(KIND_IDS.includes(s.kind), `${j.id}: unknown kind "${s.kind}"`);
      ok(VARIANT_IDS.includes(s.variant || 'none'), `${j.id}: unknown variant "${s.variant}"`);
    }
  }
});

// The whole point of the four axes: nine contracts should not be nine of the same afternoon.
test('the iron board is nine different fights, not one nine times', () => {
  const shapes = new Set();
  const kinds = new Set();
  const surfaces = new Set();
  for (const j of iron) {
    const m = missionOf(j.id);
    shapes.add(`${m.zone}|${m.floor}|${m.patch}|${m.spawns.map(s => `${s.kind}:${s.variant}:${s.count || 1}`).join(',')}`);
    for (const s of m.spawns) kinds.add(s.kind);
    surfaces.add(m.floor);
    surfaces.add(m.patch);
  }
  eq(shapes.size, iron.length, 'two contracts are the same fight');
  ok(kinds.size >= 5, `only ${kinds.size} kinds across the whole board`);
  ok(surfaces.size >= 4, `only ${surfaces.size} surfaces across the whole board`);
});

// A monster that mends is only interesting in a room it can mend in, and a mission that spawns
// one on a floor it cannot use has quietly turned it into a weaker monster with a longer name.
// Not every contract has to grant it — but the ones that do are the ones the writing promises.
test('a contract about a thing that mends is fought where it can', () => {
  const must = ['iron.well', 'iron.drain', 'iron.lamps', 'iron.stones'];
  for (const id of must) {
    const m = missionOf(id);
    for (const s of spawnsOf(m)) {
      const d = describe(s);
      ok(d.heals, `${id}: ${d.name} does not mend at all`);
      ok([m.floor, m.patch].includes(d.heals),
        `${id}: ${d.name} mends from ${d.heals}, and the floor is ${m.floor}/${m.patch}`);
    }
  }
});

test('spawns are laid out on the far side of the floor, inside it, and deterministically', () => {
  for (const j of iron) {
    const a = spawnsOf(missionOf(j.id));
    const b = spawnsOf(missionOf(j.id));
    eq(a, b, `${j.id} lays out differently each time`);
    for (const s of a) {
      ok(Math.hypot(s.x, s.z) <= RING + 0.01, `${j.id}: ${s.kind} is outside the ring`);
      ok(Math.abs(s.x) < 19 && Math.abs(s.z) < 19, `${j.id}: ${s.kind} is outside the walls`);
      ok(s.z < 6, `${j.id}: ${s.kind} spawned on top of the gate`);
    }
  }
});

test('a patched arena is a document the level loader would accept from disk', () => {
  for (const j of iron) {
    const raw = patchArena(base, missionOf(j.id), j);
    const out = normalise(raw);
    ok(out.doc, `${j.id}: ${out.error}`);
    eq(out.doc.foes.length, spawnsOf(missionOf(j.id)).length);
    eq(out.doc.name, j.name);
    for (const o of out.doc.objects) eq(o.zone, missionOf(j.id).zone, `${j.id}: ${o.type} is the wrong zone`);
  }
});

test('patching leaves the document on disk alone', () => {
  const before = JSON.stringify(base);
  patchArena(base, missionOf('iron.lamps'), jobFor('iron.lamps'));
  eq(JSON.stringify(base), before, 'the base document was mutated');
});

test('the floor is the big plot and the corners are the small ones, whichever order they are in', () => {
  const m = missionOf('iron.well');
  const doc = patchArena(base, m, jobFor('iron.well'));
  const plots = doc.objects.filter(o => o.type === 'plot');
  eq(plots.find(o => o.p.w >= 30).p.surface, m.floor);
  for (const o of plots.filter(o => o.p.w < 30)) eq(o.p.surface, m.patch);
});

test('what a contract is worth comes off the bestiary, and a harder one is worth more', () => {
  for (const j of iron) ok(worthOf(missionOf(j.id)) > 0, `${j.id} is worth nothing`);
  ok(worthOf(missionOf('iron.drain')) > worthOf(missionOf('iron.rats')));
  // Not so wide that one contract is the only sensible one to take.
  const all = iron.map(j => worthOf(missionOf(j.id)));
  ok(Math.max(...all) / Math.min(...all) < 8, `the board spans ${Math.max(...all)}:${Math.min(...all)}`);
});

test('a brief names what is in the room and how many of it', () => {
  const b = briefOf('iron.lamps');
  ok(b.foes.includes('3 ×'), `"${b.foes}"`);
  ok(b.foes.includes('Ember'));
  eq(b.job.id, 'iron.lamps');
  ok(b.note.length > 20);
  eq(briefOf('no.such.contract'), null);
  eq(missionOf('gold.ledger'), null, 'the higher boards are still only wanted');
});
