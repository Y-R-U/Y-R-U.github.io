// The seam the last wave could not reach: a `geo: 'people'` row of the bestiary standing in the
// world, and the Watch-detection half of the Graft actually running. `combat.test.js` planted a
// watchman by hand to assert the shape of `watch()`; nothing proved the spawner could place one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Spawner, rigFor, planFrom, WATCHERS } from './spawner.js';
import { centreOf, contains } from './areas.js';
import { ENEMIES } from '../sim/tables.js';
import { STATE, isLive, AI } from '../sim/foes.js';
import { FOES } from '../world/foeshape.js';
import { seatsLeft, PER_MESH } from '../world/roster.js';
import { SUSPICION, WATCH_WEIGHT, GRAFT, startGraft } from '../sim/faction.js';
import { Cast } from '../world/cast.js';
import { lintAll } from '../../tools/lintQuests.mjs';
import { fakeDom } from './fakedom.js';

fakeDom();
const { Session } = await import('./session.js');

const SHIPPED = lintAll();
const PEOPLE = Object.keys(ENEMIES).filter(id => ENEMIES[id].geo === 'people');
const src = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// js/world/robed.js imports three and cannot be loaded here, so this is its `add()` with the
// geometry taken out: the same `FOES` table and the same `roster.js` seat count, refusing the same
// way. The source assertions below hold robed.js to that shape; the live run in NOTES_ENEMIES.md
// is what proves the real one.
function robedRig() {
  const r = {
    agents: [],
    add(spec) {
      if (!FOES[spec.enemy]) return null;
      if (seatsLeft(r.agents, spec.enemy, 0) <= 0) return null;
      const a = { ...spec, kind: spec.enemy, zi: 0, run: FOES[spec.enemy].run, act: 0, at: 0, speed: 0, heading: 0 };
      r.agents.push(a);
      return a;
    },
    remove(a) {
      const i = r.agents.indexOf(a);
      if (i >= 0) r.agents.splice(i, 1);
      return i >= 0;
    },
  };
  return r;
}

const verminRig = () => {
  const r = { agents: [], add(spec) { const a = { ...spec, kind: 'rat', zi: 0, run: 1.9, act: 0, at: 0, speed: 0, heading: 0 }; r.agents.push(a); return a; }, remove(a) { const i = r.agents.indexOf(a); if (i >= 0) r.agents.splice(i, 1); return i >= 0; } };
  return r;
};

function world(defs, rigs) {
  let n = 1;
  const s = new Spawner({
    rig: rigFor(rigs),
    rng: () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff),
  });
  return s.arm(SHIPPED.areas, Object.fromEntries(defs.map(id => [id, SHIPPED.defs[id]])));
}

const rigs = () => ({ rat: verminRig(), crab: verminRig(), boar: verminRig(), people: robedRig() });

test('rigFor sends a row to the rig its `geo` names, and refuses one nobody handed over', () => {
  const r = rigs();
  const rig = rigFor(r);
  assert.ok(rig.add({ enemy: 'watchman', x: 0, z: 0 }), 'a Watchman goes to the people rig');
  assert.equal(r.people.agents.length, 1);
  assert.ok(rig.add({ enemy: 'grain_rat', x: 0, z: 0 }));
  assert.equal(r.rat.agents.length, 1);
  assert.equal(rig.add({ enemy: 'sour_crow', x: 0, z: 0 }), null, 'no chicken rig was handed over');
  assert.equal(rig.add({ enemy: 'no_such_thing', x: 0, z: 0 }), null);
});

// The gap this wave exists to close. Every one of the six, through the real Spawner.place().
test('the spawner places every `geo: people` row in the bestiary', () => {
  const where = 'lac.millbridge';
  const at = centreOf(SHIPPED.areas[where]);
  for (const id of PEOPLE) {
    const r = rigs();
    const s = new Spawner({ rig: rigFor(r), rng: () => 0.5 });
    s.arm(SHIPPED.areas, {});
    const f = s.place(where, id, at);
    assert.ok(f, `${id} is geo: 'people' and the spawner placed nothing`);
    assert.equal(f.enemy, id);
    assert.equal(f.hp, ENEMIES[id].hp, 'and it was armed off its own bestiary row');
    assert.ok(contains(SHIPPED.areas[where], f.x, f.z));
    assert.equal(r.people.agents.length, 1, `${id} did not go to the people rig`);
  }
});

test('the corpus asks for four of them by name, and gets them where it asked', () => {
  const plan = planFrom(SHIPPED.defs, SHIPPED.areas);
  const asked = new Map();
  for (const [area, row] of plan) for (const [enemy] of row) if (FOES[enemy]) asked.set(enemy, area);
  for (const id of ['raider', 'hollow', 'watchman', 'champion_3']) {
    assert.ok(asked.has(id), `nothing in the packs kills a ${id} any more — check this test, not the rig`);
  }

  const s = world(['neutral.21'], rigs());
  const at = centreOf(SHIPPED.areas['lac.millbridge']);
  s.tick(0.001, at);
  const live = s.foes();
  assert.equal(live.filter(f => f.enemy === 'watchman').length, 8, 'ten asked for, eight is PER_AREA');
  assert.equal(live.filter(f => f.enemy === 'champion_3').length, 1);
  for (const f of live) assert.ok(contains(SHIPPED.areas['lac.millbridge'], f.x, f.z));
});

test('a mesh full of Watchmen refuses the ninth rather than drawing nothing', () => {
  const r = rigs();
  const s = new Spawner({ rig: rigFor(r), rng: () => 0.5, cap: 99 });
  s.arm(SHIPPED.areas, {});
  const at = centreOf(SHIPPED.areas['lac.millbridge']);
  let placed = 0;
  for (let i = 0; i < PER_MESH + 4; i++) if (s.place('lac.millbridge', 'watchman', at)) placed++;
  assert.equal(placed, PER_MESH, 'the rig has the last word on how many bodies exist');
  assert.equal(r.people.agents.length, PER_MESH);
});

// The whole point of the wave. `watch()` filtered live foes against WATCHERS and the spawner could
// not place the only id in it, so this returned [] in every real configuration.
test('world.watch() answers with real Watchmen in a real configuration', () => {
  const s = world(['neutral.21'], rigs());
  const at = centreOf(SHIPPED.areas['lac.millbridge']);
  s.tick(0.001, at);

  const seen = s.watch();
  assert.equal(seen.length, 8, 'eight Watchmen stand on the bridge and eight are being watched by');
  for (const w of seen) {
    assert.equal(w.kind, 'watch');
    assert.equal(w.weight, WATCH_WEIGHT.watch);
    assert.ok(Number.isFinite(w.x) && Number.isFinite(w.z));
  }
  assert.deepEqual([...WATCHERS], ['watchman'], 'WATCHERS changed — the counts above are stale');

  // A body is not a watcher: only what the Watch class covers.
  const rats = world(['light.01'], rigs());
  rats.tick(0.001, centreOf(SHIPPED.areas['wwa.granary']));
  assert.deepEqual(rats.watch(), []);
});

test('a dead Watchman stops watching', () => {
  const s = world(['neutral.21'], rigs());
  const at = centreOf(SHIPPED.areas['lac.millbridge']);
  s.tick(0.001, at);
  const before = s.watch().length;
  for (const f of s.foes().filter(f => f.enemy === 'watchman')) s.hit(f, 9999);
  assert.equal(s.watch().length, 0, `${before} were watching and a corpse is still one of them`);
});

// SYSTEMS §8.3 prices Kesta at 2.0 and Warden Alder at 0.6 and nothing read those numbers.
test('the named cast carries the other half of the Watch', () => {
  const people = { agents: [], place(a) { people.agents.unshift(a); return a; } };
  const entries = [
    { id: 'kesta', x: -520, z: -60 }, { id: 'alder', x: -519, z: -59 }, { id: 'bel', x: -518, z: -58 },
  ];
  const cast = new Cast(people, entries);
  const seen = cast.watch();
  assert.deepEqual(seen.map(w => w.id).sort(), ['alder', 'kesta']);
  assert.equal(seen.find(w => w.id === 'kesta').weight, 2.0);
  assert.equal(seen.find(w => w.id === 'alder').weight, 0.6);
  for (const w of seen) assert.equal(w.kind, 'watch');
  // And a watcher is not something the context button can be pressed at.
  assert.equal(cast.targets().some(t => t.kind === 'watch'), false);
  assert.equal(cast.targets().length, 3, 'they are all still people you can talk to');
});

test('js/main.js hands the spawner a people rig and merges the cast into world.watch()', () => {
  const main = src('main.js');
  assert.match(main, /rigFor\(\{[^}]*people:\s*robed/, 'the spawner is back on the vermin rig alone');
  assert.match(main, /watch: \(\) => spawner\.watch\(\)\.concat\(cast\.watch\(\)\)/);
  assert.match(main, /freeze: v => \{ vermin\.frozen = v; robed\.frozen = v; \}/, 'a pause has to stop both rigs');
  const robed = src('world/robed.js');
  assert.match(robed, /if \(!FOES\[spec\.enemy\]\) return null;/, 'the rig no longer refuses a row it has no body for');
  assert.match(robed, /seatsLeft\(this\.agents, spec\.enemy, 0\) <= 0\) return null/);
});

// ── the Graft, end to end ──────────────────────────────────────────────────

const app = () => ({ quality: { register() {}, get() {} } });
const body = () => ({ pos: { x: 0, y: 4, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, camYaw: 0 });

async function onTheBridge(watchers) {
  localStorage.clear();
  let aggroed = null;
  const s = new Session(app(), body(), {
    fresh: true,
    world: { watch: () => watchers(), aggro: (r, p) => { aggroed = r; } },
  });
  await s.start();
  s.doc.quests['neutral.07'] = { s: 'done', i: 0, c: {} };   // N07 is what grants the spell
  const at = centreOf(s.quests.areas['lac.millbridge']);
  s.player.pos.set(at.x, 4, at.z);
  s.quests.here = ['lac.millbridge', 'lac'];
  return { s, at, seen: () => aggroed };
}

test('a Watchman on the bridge is seen, and seeing you stops a Graft being cast', async () => {
  const spawn = world(['neutral.21'], rigs());
  const { s, at } = await onTheBridge(() => spawn.watch());
  spawn.tick(0.001, at);

  const near = s.watch();
  assert.ok(near.n > 0, 'session.watch() is the merge of world.watch() and the targets — it saw nobody');
  assert.equal(near.seen, true);
  assert.equal(near.weight, WATCH_WEIGHT.watch);

  s.doc.items = [{ id: 'hearth_ash', n: 3 }];
  assert.equal(s.blocked(), 'seen', 'you cannot put a face on in front of the Watch');

  // Walk out past the line-of-sight radius — plus the 12 m circle they are scattered over — and
  // it is castable again.
  s.player.pos.set(at.x + GRAFT.losRadius + 30, 4, at.z);
  assert.equal(s.watch().seen, false);
  assert.equal(s.blocked(), null);
});

test('wearing a face in front of the Watch runs suspicion up to a Break', async () => {
  const spawn = world(['neutral.21'], rigs());
  const { s, at, seen } = await onTheBridge(() => spawn.watch());
  spawn.tick(0.001, at);
  for (const f of spawn.foes()) { f.x = at.x + 2; f.z = at.z; }   // inside SUSPICION.radius

  s.doc.standing.light = 40;
  s.graft = startGraft(s.graft, 'light', { glamour: 0 });
  s.doc.worn = 'light';

  const ticks = [];
  for (let i = 0; i < 2400 && s.graft.worn === 'light'; i++) {
    s.graftTick(1 / 30);
    ticks.push(s.graft.susp);
  }
  assert.ok(ticks.some(v => v > SUSPICION.showAbove), 'suspicion never moved off zero');
  assert.equal(s.graft.worn, 'dark', '§8.3 hands the other face back for twenty seconds after a Break');
  assert.equal(s.graft.free, true);
  assert.equal(s.doc.standing.light, 15, 'a Break costs 25 Standing with the town you were wearing');
  assert.equal(seen(), 30, 'and the Break wakes everything inside 30 m');
});

test('with nobody watching, the same graft runs its course instead', async () => {
  const { s } = await onTheBridge(() => []);
  s.graft = startGraft(s.graft, 'light', { glamour: 0 });
  s.doc.worn = 'light';
  for (let i = 0; i < 2400 && s.graft.worn === 'light'; i++) s.graftTick(1 / 30);
  assert.equal(s.graft.susp, 0, 'suspicion decays when the street is empty');
  assert.equal(s.doc.standing.light, 0, 'and nothing was taken off Standing');
});

test('a Watchman is a body that fights, not only one that looks', () => {
  const s = world(['neutral.21'], rigs());
  const at = centreOf(SHIPPED.areas['lac.millbridge']);
  s.tick(0.001, at);
  const w = s.foes().find(f => f.enemy === 'watchman');
  assert.equal(w.hostile, true, 'the Watch charges — js/sim/foes.js CHARGES says so');

  w.x = at.x + 0.4; w.z = at.z;
  let dealt = 0;
  for (let i = 0; i < 400 && !dealt; i++) {
    s.tick(1 / 30, at);
    dealt = s.take().reduce((n, b) => n + b.damage, 0);
  }
  assert.ok(dealt >= ENEMIES.watchman.damage - 1e-6, 'a Watchman standing on you never landed a blow');
  assert.ok(isLive(w) && w.state !== STATE.idle);
  assert.ok(w.run > AI.chase, 'and it closes faster than a rat');
});
