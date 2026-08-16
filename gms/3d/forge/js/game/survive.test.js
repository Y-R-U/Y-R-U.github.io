// `survive` is the only primitive whose content is somebody else's job: the step says "hold this
// for 90 seconds" and `planFrom` decides whether anything is there to hold it against. Five of the
// nine shipped holds planned nothing from their own quest, so they stood up only when an unrelated
// quest happened to be active in the same place — and the unlock ladder guarantees the Dark and
// Neutral ones never were.
//
// These drive a real Spawner off the shipped packs with a realistic save: one quest active,
// everything the ladder puts before it done. Asserting on `planFrom` would only re-state the model.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Spawner, rigFor } from './spawner.js';
import { centreOf, contains } from './areas.js';
import { normaliseQuests, normaliseAreas } from './questdef.js';
import { carry } from '../sim/foes.js';
import { FOES } from '../world/foeshape.js';
import { FOWL } from '../world/bestiary.js';
import { seatsLeft } from '../world/roster.js';
import { lintAll, emptyHoldErrors } from '../../tools/lintQuests.mjs';

const SHIPPED = lintAll();
const SEEDS = [7, 41, 613];
const DT = 1 / 30;

// The rig doubles from enemies.test.js, plus the one thing those did not need: js/world/robed.js
// and chicken.js apply `carry` every frame and vermin.js does the same arithmetic inline, so
// without it nothing ever closes and every hold measures zero.
const mover = (accept = () => true) => {
  const r = {
    agents: [],
    add(spec) {
      if (!accept(spec, r)) return null;
      const a = { ...spec, kind: spec.enemy, zi: 0, act: 0, at: 0, speed: 0, heading: 0,
        run: FOES[spec.enemy]?.run ?? FOWL[spec.enemy]?.run ?? 1.9 };
      r.agents.push(a);
      return a;
    },
    remove(a) { const i = r.agents.indexOf(a); if (i >= 0) r.agents.splice(i, 1); return i >= 0; },
    walk(dt) { for (const a of r.agents) { const w = carry(a, dt); if (w) { a.x = w.x; a.z = w.z; } } },
  };
  return r;
};

const rigs = () => ({
  rat: mover(), crab: mover(), boar: mover(),
  chicken: mover(s => !s.enemy || !!FOWL[s.enemy]),
  people: mover((s, r) => !!FOES[s.enemy] && seatsLeft(r.agents, s.enemy, 0) > 0),
});

const LADDER = ['light', 'dark', 'neutral'];

function ancestors(id, into = new Set()) {
  const walk = p => {
    if (!Array.isArray(p)) return;
    if (p[0] === 'quest' && SHIPPED.defs[p[1]] && !into.has(p[1])) { into.add(p[1]); ancestors(p[1], into); }
    if (['all', 'any', 'not'].includes(p[0])) p.slice(1).forEach(walk);
  };
  walk(SHIPPED.defs[id].prereq);
  return into;
}

// CLAUDE.md's unlock ladder as a save document: Light before Dark before Neutral, earlier quests in
// the campaign finished, and nothing else accepted. This is what makes the Dark and Neutral holds
// deterministic — `light.18` is `done` by then, so `replan()` never sees it.
function ladderRecord(id, stepIndex) {
  const def = SHIPPED.defs[id];
  const rank = LADDER.indexOf(def.campaign);
  const rec = {};
  for (const d of Object.values(SHIPPED.defs)) {
    if (d.id === id) continue;
    const r = LADDER.indexOf(d.campaign);
    if (r >= 0 && rank >= 0 && (r < rank || (r === rank && d.id < id))) rec[d.id] = { s: 'done', i: 0, c: {} };
  }
  for (const a of ancestors(id)) rec[a] = { s: 'done', i: 0, c: {} };
  rec[id] = { s: 'active', i: stepIndex, c: {} };
  return rec;
}

function holdOf(id) {
  const req = SHIPPED.defs[id].steps.filter(s => !s.optional);
  for (let i = 0; i < req.length; i++) {
    const o = req[i].objectives.find(x => x.k === 'survive');
    if (o) return { i, step: req[i], area: req[i].in || o.area, seconds: o.seconds };
  }
  return null;
}

// One hold, played out. `engage` is a player who holds the area and closes on whatever is in it,
// which is what "turn the strays back" asks for; without it only the `CHARGES` half of the bestiary
// ever reaches you and a hold against ground-defending vermin measures zero.
function playHold(id, { seed = 7, engage = true } = {}) {
  const h = holdOf(id);
  assert.ok(h, `${id} has no survive step`);
  const rec = ladderRecord(id, h.i);
  const live = Object.values(rec).filter(r => r.s === 'active' || r.s === 'turnin');
  assert.equal(live.length, 1, `${id}: the record must have exactly one live quest`);

  const r = rigs();
  let n = seed;
  const s = new Spawner({
    rig: rigFor(r),
    rng: () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff),
  });
  s.arm(SHIPPED.areas, SHIPPED.defs, () => rec);

  const shape = SHIPPED.areas[h.area];
  const home = centreOf(shape);
  const pos = { x: home.x, z: home.z };
  let damage = 0, blows = 0, inHold = 0;
  const kinds = new Set();

  for (let t = 0; t < h.seconds; t += DT) {
    s.tick(DT, pos);
    for (const rig of Object.values(r)) rig.walk(DT);
    for (const b of s.take()) { damage += b.damage; blows++; }
    const foes = s.foes();
    const here = foes.filter(f => contains(shape, f.x, f.z));
    inHold = Math.max(inHold, here.length);
    for (const f of here) kinds.add(f.enemy);
    if (!engage) continue;
    let best = null, bd = Infinity;
    for (const f of foes) { const d = Math.hypot(f.x - pos.x, f.z - pos.z); if (d < bd) { bd = d; best = f; } }
    const to = best && bd > 1 ? best : home;
    const dx = to.x - pos.x, dz = to.z - pos.z, d = Math.hypot(dx, dz) || 1;
    const stride = Math.min(5 * DT, d);
    const nx = pos.x + dx / d * stride, nz = pos.z + dz / d * stride;
    if (contains(shape, nx, nz)) { pos.x = nx; pos.z = nz; }
  }
  return { area: h.area, seconds: h.seconds, damage: Math.round(damage), blows, inHold, kinds: [...kinds].sort() };
}

// Every survive step in the corpus, and what its own quest is supposed to put in front of it.
const HOLDS = [
  ['light.05', 'wwa.northgate', ['mire_rat']],
  ['light.18', 'reach.east', ['raider', 'sour_crow']],
  ['light.23', 'bst.bailey', ['watchman']],
  ['dark.16', 'reach.east', ['creek_crab']],
  ['dark.21', 'bst.bailey', ['watchman']],
  ['neutral.21', 'lac.millbridge', ['champion_3', 'watchman']],
  ['sandbox.14', 'wwa.northgate', ['mire_rat']],
];
const QUIET = ['neutral.06', 'neutral.14'];

for (const [id, area, want] of HOLDS) {
  test(`${id} stages a fight in ${area} on its own quest alone`, () => {
    for (const seed of SEEDS) {
      const r = playHold(id, { seed });
      assert.equal(r.area, area);
      assert.ok(r.inHold > 0, `${id} seed ${seed}: nothing ever stood in ${area} over ${r.seconds} s`);
      assert.ok(r.damage > 0, `${id} seed ${seed}: ${r.inHold} bodies in ${area} and not one blow landed`);
      for (const k of want) assert.ok(r.kinds.includes(k), `${id} seed ${seed}: no ${k} in ${area}, only ${r.kinds.join(',') || 'nothing'}`);
    }
  });
}

// The five that were empty were empty *standing still*, which is the literal reading of "hold".
// The two bailey sieges are the sharp case: their own switchback pack is 41 m away, inside
// SPAWN_RADIUS, so walking to the north lip of the bailey used to pull a fight that holding the
// bailey itself never saw.
for (const id of ['light.23', 'dark.21']) {
  test(`${id} defends the bailey where the player is standing, not 40 m up the switchback`, () => {
    for (const seed of SEEDS) {
      const r = playHold(id, { seed, engage: false });
      assert.ok(r.inHold >= 4, `${id} seed ${seed}: only ${r.inHold} in the bailey with the player standing in it`);
    }
  });
}

for (const id of QUIET) {
  test(`${id} is a deliberate quiet hold and says so in the pack`, () => {
    const h = holdOf(id);
    assert.equal(h.step.unopposed, true, `${id}.${h.step.id} stages nothing and does not claim to`);
    const r = playHold(id, { seed: 7 });
    assert.equal(r.inHold, 0, `${id} is marked unopposed and something turned up anyway`);
  });
}

test('every survive step in the packs is opposed or opted out, and only two are opted out', () => {
  assert.deepEqual(emptyHoldErrors(SHIPPED.defs, SHIPPED.areas), []);
  const quiet = [];
  for (const def of Object.values(SHIPPED.defs)) {
    for (const s of def.steps) {
      if (s.unopposed && s.objectives.some(o => o.k === 'survive')) quiet.push(def.id);
    }
  }
  assert.deepEqual(quiet.sort(), QUIET);
  assert.equal(HOLDS.length + QUIET.length, 9, 'a survive step was added or removed — measure it here too');
});

test('the empty-hold check sees a hold nobody planned for, and takes `unopposed` for an answer', () => {
  const pack = quest => normaliseQuests([quest], { pack: 'x' }).defs;
  const { areas } = normaliseAreas([
    { id: 'x.yard', town: 'light', shape: { k: 'circle', x: -520, z: -140, r: 10 } },
  ]);
  const base = {
    id: 'x.01', title: 'A Hold', summary: 'Hold it.',
    steps: [{ id: 'hold', do: ['survive', 'x.yard', 60], text: 'Hold the yard' }],
  };
  assert.match(emptyHoldErrors(pack(base), areas)[0] || '', /x\.01\.hold: survive 60s in x\.yard/);

  const opted = { ...base, steps: [{ ...base.steps[0], unopposed: true }] };
  assert.deepEqual(emptyHoldErrors(pack(opted), areas), []);

  const armed = { ...base, steps: [{ ...base.steps[0], all: [['survive', 'x.yard', 60], ['kill', 'mire_rat', 2]], do: undefined, in: 'x.yard' }] };
  assert.deepEqual(emptyHoldErrors(pack(armed), areas), []);

  // A kill in a *different* area is exactly the shape that shipped: planned, but not here.
  const elsewhere = { ...base, steps: [
    { id: 'clear', do: ['kill', 'mire_rat', 2], in: 'wwa.northgate', text: 'Clear the gate' },
    { ...base.steps[0] },
  ] };
  assert.equal(emptyHoldErrors(pack(elsewhere), { ...areas, ...SHIPPED.areas }).length, 1);
});
