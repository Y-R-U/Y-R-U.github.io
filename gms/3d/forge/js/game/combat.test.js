// The seam between the combat rules and the world. `combat.test.js` in js/sim proves the maths and
// `quest.test.js` proves the reducer; neither could see that no line of code emitted a `kill`.
// Everything here goes through the real spawner, the real quest packs and the real data/areas.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';

import { Spawner, planFrom, WATCHERS, PER_AREA } from './spawner.js';
import { contains, centreOf } from './areas.js';
import { QuestRunner } from './questrunner.js';
import { blank, itemCount } from './save.js';
import { STATE, AI, isLive } from '../sim/foes.js';
import { limits } from './vitals.js';
import { ENEMIES, DESPAWN_RADIUS } from '../sim/tables.js';
import { lintAll } from '../../tools/lintQuests.mjs';
import { fakeDom } from './fakedom.js';

fakeDom();
const { Session } = await import('./session.js');

const SHIPPED = lintAll();
const GRANARY = SHIPPED.areas['wwa.granary'];

// A rig that records what it was asked to draw. The real one is js/world/vermin.js, which needs
// three; every field the spawner touches is here and nothing else is.
function rig() {
  const r = {
    agents: [],
    add(spec) {
      if (r.refuse) return null;
      const a = { ...spec, kind: 'rat', zi: 0, run: 1.9, act: 0, at: 0, speed: 0, heading: 0 };
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

// Armed with light.01 alone, which is the quest the player is on when the granary matters.
const spawner = (defs = ['light.01'], opts = {}) => {
  let n = 1;
  const s = new Spawner({ rig: rig(), rng: () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff), ...opts });
  return s.arm(SHIPPED.areas, Object.fromEntries(defs.map(id => [id, SHIPPED.defs[id]])));
};

const runner = () => {
  const q = new QuestRunner({ doc: blank(1), world: {} });
  q.defs = SHIPPED.defs;
  q.areas = SHIPPED.areas;
  q.buildOffers();
  return q;
};

// Enough Session to drive the two methods under test. The constructor wants a renderer, a DOM and
// an AudioContext, none of which is the seam.
function session(q, world) {
  const s = Object.create(Session.prototype);
  s.doc = q.doc;
  s.quests = q;
  s.world = world;
  s.school = 'kindle';
  s.limits = limits(q.doc.schools);
  s.vitals = { hp: s.limits.hp, focus: s.limits.focus, since: 3, guttered: 0 };
  s.audio = { play: () => {} };
  s.hud = { say: () => {} };
  s.autosave = { mark() {}, flush() {} };
  s.player = { pos: { x: 0, y: 4, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, camYaw: 0 };
  s.doc.settings.haptics = false;
  return s;
}

test('the plan comes out of the quest packs, and it puts grain rats in the granary', () => {
  const plan = planFrom(SHIPPED.defs, SHIPPED.areas);
  const granary = plan.get('wwa.granary');
  assert.ok(granary, 'light.01 says `kill grain_rat in wwa.granary` and nothing was planned for it');
  assert.equal(granary.get('grain_rat'), 8, 'one rat then seven is the eight Bel says are in the grain');
  for (const [id, row] of plan) {
    assert.ok(SHIPPED.areas[id], `${id} is not a declared area`);
    for (const [enemy, n] of row) {
      assert.ok(ENEMIES[enemy], `${enemy} is not in the bestiary`);
      assert.ok(n > 0 && n <= PER_AREA, `${id} plans ${n} ${enemy}`);
    }
  }
});

test('the spawner puts the right creature inside the right area shape', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);

  const rats = s.foes().filter(f => f.enemy === 'grain_rat');
  assert.equal(rats.length, 8);
  for (const f of rats) {
    assert.ok(contains(GRANARY, f.x, f.z),
      `a grain rat at ${f.x.toFixed(1)}, ${f.z.toFixed(1)} is outside the granary`);
    assert.equal(f.area, 'wwa.granary');
    assert.equal(f.hp, ENEMIES.grain_rat.hp);
  }
  assert.equal(s.rig.agents.length, 8, 'and the rig was asked to draw every one of them');
});

test('a nest that is walked away from goes, and is there again on the way back', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  assert.equal(s.foes().length, 8);

  s.tick(1.1, { x: at.x + DESPAWN_RADIUS + 10, z: at.z });
  assert.equal(s.foes().length, 0);
  assert.equal(s.rig.agents.length, 0, 'and nothing is left being drawn');

  s.tick(1.1, at);
  assert.equal(s.foes().length, 8, 'the slot freed at once, so walking back finds the nest');
});

test('walking away from a nest does not hand back the rat you killed', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  s.hit(s.foes()[0], 9999);
  s.tick(4.4, at);                             // the death animation, then the corpse is taken away
  const slot = s.slot('wwa.granary', 'grain_rat');
  assert.equal(slot.owed, 1, 'the body is the nest owing one rat');
  assert.ok(slot.readyAt > s.now, 'and it is on the respawn clock');

  s.tick(1.1, { x: at.x + DESPAWN_RADIUS + 10, z: at.z });
  assert.equal(s.foes().length, 0, 'the survivors are culled out of range');
  assert.equal(s.slot('wwa.granary', 'grain_rat').owed, 1, 'which owes the nest nothing');

  s.tick(1.1, at);
  assert.equal(s.foes().length, 7, 'walking back finds the seven, not a free eighth');
  s.now = slot.readyAt;
  s.due = 0;
  s.tick(1 / 60, at);
  assert.equal(s.foes().length, 8, 'the eighth comes back on its own clock');
});

test('pausing the game stops the rig, which the frame loop does not', () => {
  localStorage.clear();
  let frozen = null;
  const s = new Session(app(), body(), { fresh: true, world: { freeze: v => { frozen = v; } } });
  s.pause('menu');
  assert.equal(frozen, true, 'session.paused alone leaves Vermin.update integrating chase speed');
  s.pause('hidden');
  s.resume('menu');
  assert.equal(frozen, true, 'still paused for another reason');
  s.resume('hidden');
  assert.equal(frozen, false);
});

test('a creature behind a wall is not hit, and the cast takes one it can see', () => {
  const q = runner();
  const hidden = { enemy: 'grain_rat', x: 0, z: 10, armour: 0, area: 'wwa' };
  const open = { enemy: 'grain_rat', x: 3, z: 9, armour: 0, area: 'wwa' };
  const bolt = { coef: 1, cone: Math.PI / 2, range: 26 };

  const g = session(q, {
    foes: () => [hidden, open],
    sight: (from, f) => f !== hidden,
    hit: () => ({ killed: false, hit: true }),
  });
  assert.equal(g.strike(bolt).target, open, 'the nearest rat is through a wall, so it is not the one');

  const blind = session(q, {
    foes: () => [hidden],
    sight: () => false,
    hit: () => { throw new Error('damage resolved through a wall'); },
  });
  assert.equal(blind.strike(bolt), null);
});

// The granary is inside Whitewall and both are planned, so a rat placed for the town can land in
// the grain, fill the granary's quota and double-credit two quests at once.
test('a rat planned for the town does not stand in the granary inside it', () => {
  const s = spawner(['light.01', 'sandbox.01']);   // granary ×8 and town ×6, the overlapping pair
  assert.ok(s.plan.get('wwa')?.get('grain_rat'), 'the town contract is in the plan');

  const at = centreOf(GRANARY);
  let placed = 0;
  for (let i = 0; i < 200; i++) {
    const f = s.place('wwa', 'grain_rat', at);     // every candidate is within SPAWN_RADIUS of it
    if (!f) continue;
    placed++;
    assert.equal(contains(GRANARY, f.x, f.z), false,
      `a \`wwa\` rat at ${f.x.toFixed(1)}, ${f.z.toFixed(1)} is standing in the granary`);
  }
  assert.ok(placed > 100, `only ${placed} of 200 town rats were placed at all`);
});

test('a kill is credited to the corpse, not to where the player is standing', () => {
  const q = runner();
  q.accept('light.01');
  q.emit({ t: 'talk', npc: 'bel', node: 'light.01.first' });
  q.here = ['wwa.granary', 'wwa'];               // the player is in the grain
  const g = session(q, {});

  g.kill({ enemy: 'grain_rat', area: 'wwa' });
  assert.equal(q.doc.quests['light.01'].i, 0, 'a town rat does not tick a granary step');

  g.kill({ enemy: 'grain_rat', area: 'wwa.granary' });
  assert.equal(q.doc.quests['light.01'].i, 1, 'a granary rat does');
});

test('and a kill in the granary still pays a step that asks for the whole town', () => {
  const q = runner();
  q.accept('sandbox.01', true);                  // kill grain_rat ×6 `in: wwa`
  q.here = ['reach'];                            // deliberately nowhere near it
  const g = session(q, {});
  g.kill({ enemy: 'grain_rat', area: 'wwa.granary' });
  assert.deepEqual(q.doc.quests['sandbox.01'].c.cull, [1],
    'the granary is inside `wwa`, so the town step counts it');
});

test('a kill is worth one kill event, whatever else is in flight', () => {
  const q = runner();
  q.here = ['wwa.granary', 'wwa'];
  q.accept('light.01');
  q.emit({ t: 'talk', npc: 'bel', node: 'light.01.first' });

  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  const g = session(q, { foes: () => s.foes(), hit: (f, d) => s.hit(f, d), strikes: () => s.take() });
  g.player.pos.set(at.x, 4, at.z);

  const target = s.foes()[0];
  const kills = [];
  const emit = q.emit.bind(q);
  q.emit = e => { if (e.t === 'kill') kills.push(e); return emit(e); };

  g.kill(target);
  assert.equal(kills.length, 1);
  assert.equal(kills[0].kind, 'grain_rat');
  assert.equal(kills[0].area, 'wwa.granary');
  assert.ok(q.doc.schools.cull > 0, 'and the kill paid Cull');
  assert.ok(q.doc.schools.kindle > 0);
  assert.equal(itemCount(q.doc, 'rat_tail'), 1, 'and dropped a tail');
  assert.equal(q.doc.purse.marks, ENEMIES.grain_rat.mk);
});

test('bolting a rat until it dies ticks the step over exactly once', () => {
  const q = runner();
  q.here = ['wwa.granary', 'wwa'];
  q.accept('light.01');
  q.emit({ t: 'talk', npc: 'bel', node: 'light.01.first' });
  assert.equal(q.doc.quests['light.01'].i, 0, 'step 0 is the first cull');

  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  const g = session(q, { foes: () => s.foes(), hit: (f, d) => s.hit(f, d), strikes: () => s.take() });
  g.player.pos.set(at.x, 4, at.z);

  const bolt = { coef: 1, cone: Math.PI, range: 40 };
  const before = s.foes().length;
  let shots = 0;
  while (s.foes().length === before && shots < 20) { g.strike(bolt); shots++; }

  assert.ok(shots < 20, 'the bolt found something to hit');
  assert.equal(s.foes().length, before - 1, 'exactly one rat died');
  assert.equal(q.doc.quests['light.01'].i, 1, 'and the step ticked over');

  // Keep firing at the corpse: it is out of `foes()`, so the bolt takes the next rat, not a
  // second kill off the same body.
  const dead = s.live.find(f => !isLive(f));
  assert.ok(dead, 'the body is still there to look at');
  assert.equal(s.hit(dead, 999).killed, false);
});

test('eight rats is eight kills and a finished step', () => {
  const q = runner();
  q.here = ['wwa.granary', 'wwa'];
  q.accept('light.01');
  q.emit({ t: 'talk', npc: 'bel', node: 'light.01.first' });

  const s = spawner();
  const at = centreOf(GRANARY);
  const g = session(q, { foes: () => s.foes(), hit: (f, d) => s.hit(f, d), strikes: () => s.take() });
  g.player.pos.set(at.x, 4, at.z);
  const bolt = { coef: 1, cone: Math.PI, range: 60 };

  let kills = 0;
  for (let frame = 0; frame < 4000 && kills < 8; frame++) {
    s.tick(1 / 60, g.player.pos);
    const r = g.strike(bolt);
    if (r?.killed) kills++;
  }
  assert.equal(kills, 8, 'the nest respawned enough to finish the quota');
  assert.equal(q.doc.quests['light.01'].i, 2, 'both cull steps are done and the lamp is next');
});

test('bites go through Ward, and the one that empties the bar gutters', () => {
  const q = runner();
  q.doc.schools.ward = 400;
  const blows = [];
  const g = session(q, { strikes: () => blows.splice(0) });
  const hearth = [];
  g.spawnAtHearth = a => hearth.push(a);

  const bite = { enemy: 'grain_rat', damage: ENEMIES.grain_rat.damage, x: 0, z: 0 };
  const full = g.limits.hp;
  blows.push(bite);
  g.combat();
  assert.ok(g.vitals.hp < full);
  assert.ok(g.vitals.hp > full - bite.damage, 'Ward took something off it');

  let n = 1;
  while (g.vitals.hp > 0 && !hearth.length && n < 100) { blows.push(bite); g.combat(); n++; }
  assert.equal(hearth.length, 1, 'the gutter fired once');
  assert.equal(g.vitals.hp, full, 'and you wake up whole');
  assert.equal(g.vitals.focus, 0, 'with the staff out');
});

test('the gutter costs marks and half the fish, and nothing else', () => {
  const q = runner();
  const g = session(q, {});
  g.spawnAtHearth = () => {};
  g.doc.purse.marks = 200;
  g.doc.schools.cull = 5000;
  g.doc.items = [{ id: 'silverling', n: 7 }, { id: 'rat_tail', n: 4 }];

  g.gutter();
  assert.equal(g.doc.purse.marks, 184, '8% of 200');
  assert.equal(itemCount(g.doc, 'silverling'), 3, 'half the unbanked perishables, rounded down');
  assert.equal(itemCount(g.doc, 'rat_tail'), 4, 'a rat tail is not a perishable');
  assert.equal(g.doc.schools.cull, 5000, 'no XP loss — §9.4 calls it a lesson');
});

test('`respawn` is the recover verb the packs already ask for', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  for (const f of s.foes().slice()) s.hit(f, 9999);
  s.tick(1 / 60, at);
  assert.equal(s.foes().length, 0, 'the whole nest is down');
  assert.equal(s.live.length, 8, 'and the bodies are still lying in it');

  assert.equal(s.respawn('grain_rat', 7), true);
  s.tick(1 / 60, at);
  assert.equal(s.foes().length, 8, 'a reset step gets its rats back without waiting');
  assert.equal(s.respawn('no_such_thing'), false);
});

test('aggro flips hostility inside the radius and not outside it', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  const all = s.foes();
  for (const f of all) { f.hostile = false; f.x = at.x; f.z = at.z; }
  all[0].x = at.x + 30;
  all[1].x = at.x + 4;

  const n = s.aggro(10, at);
  assert.equal(n, all.length - 1, 'everything but the far one');
  assert.equal(all[0].hostile, false, 'a rat 30 m away heard nothing');
  assert.equal(all[1].hostile, true);
  assert.equal(s.aggro(10, at), 0, 'and it is not counted twice');
  assert.equal(s.aggro(10, null), 0);
});

test('hitting one rat wakes the nest and nothing further off', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  const all = s.foes();
  for (const f of all) { f.hostile = false; f.x = at.x + 40; f.z = at.z; }
  all[0].x = at.x; all[0].z = at.z;
  all[1].x = at.x + AI.alarm * 0.5; all[1].z = at.z;

  s.hit(all[0], 1);
  assert.equal(all[0].hostile, true);
  assert.equal(all[1].hostile, true, 'the one beside it heard');
  assert.equal(all[2].hostile, false, 'the one across the floor did not');
});

test('watch() answers the Graft with the Watch and with nobody else', () => {
  const s = spawner();
  const at = centreOf(GRANARY);
  s.tick(0.001, at);
  assert.deepEqual(s.watch(), [], 'a granary full of rats is not being watched');

  const [w] = WATCHERS;
  const planted = s.rig.add({ enemy: w, x: 1, z: 2, area: 'wwa.granary' });
  Object.assign(planted, { enemy: w, area: 'wwa.granary', state: STATE.idle, hp: 1, maxHp: 1 });
  s.live.push(planted);

  const seen = s.watch();
  assert.equal(seen.length, 1);
  // The shape session.watch() merges with targets(): a kind, a position and a weight.
  assert.equal(seen[0].kind, 'watch');
  assert.equal(seen[0].x, 1);
  assert.equal(seen[0].z, 2);
  assert.equal(seen[0].weight, 1);
});

test('a plan the rig refuses places nothing rather than something invisible', () => {
  const s = spawner();
  s.rig.refuse = true;
  s.tick(0.001, centreOf(GRANARY));
  assert.equal(s.foes().length, 0);
  assert.equal(s.rig.agents.length, 0);
});

test('only the quests you are on populate the world', () => {
  const q = runner();
  const s = new Spawner({ rig: rig(), rng: () => 0.5 });
  s.arm(SHIPPED.areas, SHIPPED.defs, () => q.doc.quests);
  const at = centreOf(GRANARY);

  s.tick(0.001, at);
  assert.equal(s.foes().length, 0, 'a granary nobody has been sent to is empty');

  q.accept('light.01');
  s.due = 0;
  s.tick(0.001, at);
  assert.equal(s.foes().length, 8);
  assert.ok(s.foes().every(f => f.enemy === 'grain_rat'));

  q.doc.quests['light.01'].s = 'done';
  s.due = 0;
  s.tick(0.001, at);
  assert.equal(s.plan.size, 0, 'and the plan lets go when the quest does');
});

// A whole Session, its real start() and the real frame loop turning under it while start() awaits
// the packs. The previous version of this test built a bare prototype, ran the fix by hand and
// asserted on that, so moving the fix back out of the constructor left it green.
const app = () => ({ quality: { register() {}, get() {} } });
const body = () => ({ pos: { x: 0, y: 4, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, camYaw: 0 });

// The reason a play-test found no rats at all: the session is already in the frame loop while
// `start()` is still fetching the packs, so `doc.played` was non-zero by the time `start()` asked
// whether this was a save in progress — and light.01 was never accepted.
test('frames burned loading the packs do not make a new game look like a save in progress', async () => {
  localStorage.clear();
  const s = new Session(app(), body(), { fresh: true, world: {} });
  const loading = s.start();
  for (let i = 0; i < 84; i++) s.update(1 / 60);      // the frames app.start() runs meanwhile
  await loading;

  assert.ok(s.doc.played > 1, 'the frames really did run — otherwise this proves nothing');
  assert.equal(s.doc.quests['light.01']?.s, 'active', 'a new game still opens on its first quest');
  assert.equal(s.doc.tracked, 'light.01');
});

test('and a save in progress is not started over', async () => {
  localStorage.clear();
  const first = new Session(app(), body(), { fresh: true, world: {} });
  await first.start();
  first.quests.emit({ t: 'talk', npc: 'bel', node: 'light.01.first' });
  first.doc.played = 240;
  first.autosave.flush();

  const back = new Session(app(), body(), { fresh: false, world: {} });
  let began = false;
  back.beginCampaign = () => { began = true; };
  await back.start();
  assert.equal(began, false, 'the campaign is not begun again on a resume');
  assert.equal(back.doc.played, 240, 'and it is the save that was written');
});

// js/main.js cannot be imported here — it wants three and a canvas — so this reads it. On a resume
// `play()` reaches `new Session` with no await before it, which puts the session in app.systems
// before app.start() runs its first frame *synchronously*: a hook closing over a `const` declared
// below that call is still in its temporal dead zone when that frame calls world.tick, and the
// ReferenceError aborts the rest of main.js. Every load of an existing save, no boot at all.
test('nothing the world hooks close over is declared after the frame loop starts', () => {
  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const starts = src.search(/^app\.start\(\);/m);
  const opens = src.indexOf('world: {');
  assert.ok(starts > 0 && opens > 0, 'main.js changed shape — this test needs rewriting');

  const hooks = src.slice(opens, src.indexOf('\n    },', opens));
  assert.ok(hooks.includes('spawner.tick'), 'the spawner is no longer ticked from the world hooks');

  // `function` is hoisted and initialised, so naming one is safe — but its body is not, and two
  // hooks are bare function references. Bodies run to the first `}` in column 1, which is what a
  // top-level declaration in this file ends with.
  const bodies = new Map();
  for (const m of src.matchAll(/^(?:async )?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) {
    bodies.set(m[1], src.slice(m.index + m[0].length, src.indexOf('\n}', m.index)));
  }
  for (const fn of ['targets', 'sight']) {
    assert.ok(bodies.has(fn) && hooks.includes(fn), `main.js no longer hands over \`${fn}\` — rewrite this test`);
  }

  // `const|let|class` are the three with a dead zone.
  const at = new Map();
  for (const m of src.matchAll(/^(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) at.set(m[1], m.index);
  const seen = new Set();
  for (const queue = [hooks]; queue.length;) {
    for (const m of queue.pop().matchAll(/[A-Za-z_$][\w$]*/g)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      if (bodies.has(m[0])) queue.push(bodies.get(m[0]));
      const where = at.get(m[0]);
      if (where === undefined) continue;
      assert.ok(where < starts, `main.js hands the session \`${m[0]}\`, which it declares after app.start()`);
    }
  }
  assert.ok(seen.has('EYE'), 'the scan stopped at the hook names instead of reading sight()');
});

test('a spell with nothing to aim hits nothing', () => {
  const q = runner();
  const g = session(q, { foes: () => [{ x: 0, z: 1, armour: 0, enemy: 'grain_rat' }], hit: () => ({ killed: true }) });
  assert.equal(g.strike({ coef: 0, cone: 1, range: 9 }), null, 'a Line cast is not a bolt');
  assert.equal(g.strike({ coef: 1 }), null, 'and a spell with no cone must not hit the whole world');
  assert.ok(g.strike({ coef: 1, cone: Math.PI, range: 9 }), 'a bolt does');
});

// Measured over 3000 real place() calls against the live colliders: 632 rats landed inside a walk
// box and 624 of those had no standable point with a clear line to them at any distance out to
// 26 m. `place()` refused a point inside a nested planned area and never asked the colliders.
test('a rat is never left somewhere the player cannot get a line to it', () => {
  const wall = { x0: -556, z0: -34, x1: -548, z1: -14 };
  const inside = (x, z) => x > wall.x0 && x < wall.x1 && z > wall.z0 && z < wall.z1;

  const loose = spawner();
  loose.tick(0.001, centreOf(GRANARY));
  assert.ok(loose.foes().some(f => inside(f.x, f.z)), 'this rng really does put rats in that corner');

  const s = spawner(['light.01'], { blocked: inside });
  s.tick(0.001, centreOf(GRANARY));
  assert.equal(s.foes().length, 8, 'and the nest still fills — the retry loop finds open ground');
  for (const f of s.foes()) {
    assert.equal(inside(f.x, f.z), false, `a rat at ${f.x.toFixed(1)}, ${f.z.toFixed(1)} is inside the massing`);
    assert.ok(contains(GRANARY, f.x, f.z));
  }

  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(src, /new Spawner\(\{[\s\S]*?blocked:/, 'the game builds a spawner that never asks');
});

test('the live cap is honoured however many nests are in reach', () => {
  const s = spawner(['light.01'], { cap: 3 });
  s.tick(0.001, centreOf(GRANARY));
  assert.equal(s.foes().length, 3);
});
