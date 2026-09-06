// One arena, many contracts. The promise is that a mission is four rows of data and that the
// document it produces is one an authored level could have been.

import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { BOARDS } from './contracts.js';
import {
  ARENA, RING, OBJECTIVES, missionOf, jobFor, playable, spawnsOf, wavesOf, allSpawns,
  worthOf, briefOf, patchArena, objectiveOf, secondsOf,
} from './missions.js';
import { KIND_IDS, VARIANT_IDS, describe } from './bestiary.js';
import { SURFACES } from './ground.js';
import { normalise } from '../editor/scene.js';

const base = JSON.parse(readFileSync(new URL('../../data/levels/arena.json', import.meta.url)));
const iron = BOARDS['board.iron'].jobs;
const bronze = BOARDS['board.bronze'].jobs;
// Every contract that has been built out, whichever board it hangs on. The rules below are about
// missions, not about iron.
const built = [...iron, ...bronze];

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

test('every iron and bronze contract is walkable', () => {
  for (const j of built) ok(playable(j.id), `${j.id} has no mission`);
  ok(iron.length >= 8, `${iron.length} iron contracts`);
  ok(bronze.length >= 8, `${bronze.length} bronze contracts`);
  // The two boards above are still only wanted. That is the ladder doing its job, and the test
  // says so out loud so nobody reads their silence as an oversight.
  for (const b of ['board.silver', 'board.gold']) {
    for (const j of BOARDS[b].jobs) eq(playable(j.id), false, `${j.id} is playable already`);
  }
});

// The step up has to be a step, and it has to be a step in *kind* and not only in hit points —
// a greater earth elemental is what the variant system already gives you for free.
test('bronze is harder than iron, and not only by being bigger', () => {
  const worth = list => list.map(j => worthOf(missionOf(j.id)));
  const ironAvg = worth(iron).reduce((a, b) => a + b, 0) / iron.length;
  const bronzeAvg = worth(bronze).reduce((a, b) => a + b, 0) / bronze.length;
  ok(bronzeAvg > ironAvg * 2, `iron averages ${ironAvg.toFixed(0)}, bronze ${bronzeAvg.toFixed(0)}`);

  const kindsOn = list => new Set(list.flatMap(j => allSpawns(missionOf(j.id)).map(s => s.kind)));
  const fresh = [...kindsOn(bronze)].filter(k => !kindsOn(iron).has(k));
  ok(fresh.length >= 3, `bronze only reuses iron's monsters (${fresh.join(', ') || 'none new'})`);

  const surviveOn = list => list.filter(j => objectiveOf(missionOf(j.id)) === 'survive').length;
  ok(surviveOn(bronze) / bronze.length > surviveOn(iron) / iron.length,
    'bronze should lean harder on the contracts you have to last out');
});

test('a mission names a kind, a variant and two surfaces the game can actually build', () => {
  for (const j of built) {
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
test('each board is as many different fights as it has contracts', () => {
  for (const list of [iron, bronze]) shapesOf(list);
});

function shapesOf(list) {
  const shapes = new Set();
  const kinds = new Set();
  const surfaces = new Set();
  for (const j of list) {
    const m = missionOf(j.id);
    shapes.add(`${m.zone}|${m.floor}|${m.patch}|${m.spawns.map(s => `${s.kind}:${s.variant}:${s.count || 1}`).join(',')}`);
    for (const s of m.spawns) kinds.add(s.kind);
    surfaces.add(m.floor);
    surfaces.add(m.patch);
  }
  eq(shapes.size, list.length, 'two contracts on one board are the same fight');
  ok(kinds.size >= 4, `only ${kinds.size} kinds across the whole board`);
  ok(surfaces.size >= 3, `only ${surfaces.size} surfaces across the whole board`);
}

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
  for (const j of built) {
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
  for (const j of built) {
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
  for (const j of built) ok(worthOf(missionOf(j.id)) > 0, `${j.id} is worth nothing`);
  ok(worthOf(missionOf('iron.drain')) > worthOf(missionOf('iron.rats')));
  // Not so wide that one contract is the only sensible one to take.
  for (const list of [iron, bronze]) {
    const all = list.map(j => worthOf(missionOf(j.id)));
    ok(Math.max(...all) / Math.min(...all) < 8, `a board spans ${Math.max(...all)}:${Math.min(...all)}`);
  }
});

test('a brief names what is in the room and how many of it', () => {
  const b = briefOf('iron.lamps');
  ok(/\d+ ×/.test(b.foes), `"${b.foes}"`);
  ok(b.foes.includes('Ember'));
  eq(b.job.id, 'iron.lamps');
  ok(b.note.length > 20);
  eq(briefOf('no.such.contract'), null);
  eq(missionOf('gold.ledger'), null, 'the higher boards are still only wanted');
});


// ── objectives and waves ─────────────────────────────────────────────────────────────────────
// Nine contracts that all say "kill everything in the room" is one afternoon nine times, however
// different the monsters are. Half the iron board's own writing is about waiting.

test('every objective is one the runtime knows', () => {
  for (const j of built) ok(OBJECTIVES.includes(objectiveOf(missionOf(j.id))), `${j.id}`);
});

test('a contract with no objective is one you clear, and it counts nothing', () => {
  eq(objectiveOf({}), 'clear');
  eq(objectiveOf({ objective: 'nonsense' }), 'clear');
  eq(secondsOf({ objective: 'clear', seconds: 40 }), 0, 'a clear contract has no clock');
  eq(secondsOf({ objective: 'survive' }), 45, 'and a survive one always has');
  ok(secondsOf({ objective: 'survive', seconds: 1 }) >= 5, 'never a clock nobody could lose to');
});

test('a board asks for more than one thing', () => {
  const kinds = new Set(built.map(j => objectiveOf(missionOf(j.id))));
  eq([...kinds].sort(), ['clear', 'survive'], `only ${[...kinds].join(', ')}`);
  ok(built.filter(j => objectiveOf(missionOf(j.id)) === 'survive').length >= 6, 'and more than once');
  ok(built.filter(j => wavesOf(missionOf(j.id)).length).length >= 10, 'most arrive in waves');
});

test('waves arrive in order, after the gate, and never all at once', () => {
  for (const j of built) {
    const w = wavesOf(missionOf(j.id));
    for (let i = 0; i < w.length; i++) {
      ok(w[i].at > 0, `${j.id}: a wave at ${w[i].at}s is not a wave`);
      if (i) ok(w[i].at > w[i - 1].at, `${j.id}: waves ${i - 1} and ${i} arrive together`);
      ok(w[i].spawns.length, `${j.id}: an empty wave`);
    }
  }
});

test('a survive contract sends its last wave with time left to fight it', () => {
  for (const j of built) {
    const m = missionOf(j.id);
    if (objectiveOf(m) !== 'survive') continue;
    const w = wavesOf(m);
    if (!w.length) continue;
    ok(w[w.length - 1].at < secondsOf(m) - 5,
      `${j.id}: last wave at ${w[w.length - 1].at}s of ${secondsOf(m)}s`);
  }
});

test('a wave is laid out somewhere the first group is not', () => {
  const m = missionOf('iron.lamps');
  const first = spawnsOf(m);
  for (const w of wavesOf(m)) {
    for (const s of w.spawns) {
      ok(Math.hypot(s.x, s.z) <= RING + 0.01, 'inside the ring');
      ok(first.every(f => Math.hypot(f.x - s.x, f.z - s.z) > 0.5),
        'a wave walked out of the first group\'s footprints');
    }
  }
});

test('what a contract is worth counts the waves too', () => {
  const m = missionOf('iron.lamps');
  ok(wavesOf(m).length, 'the example has waves');
  eq(allSpawns(m).length, spawnsOf(m).length + wavesOf(m).reduce((a, w) => a + w.spawns.length, 0));
  ok(worthOf(m) > spawnsOf(m).reduce((a, s) => a + 1, 0), 'and pays for them');
});

test('the brief says what is being asked in one line', () => {
  ok(briefOf('iron.lamps').asks.includes('55'), briefOf('iron.lamps').asks);
  eq(briefOf('iron.well').asks, 'Clear the floor');
});
