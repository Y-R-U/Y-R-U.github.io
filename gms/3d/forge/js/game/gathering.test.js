// The seam between the quest corpus and the things you can actually catch, pick, cut and cook.
// Everything here reads the real data/quests/*.json, the real data/areas.json and the real
// data/gather.json, and drives the real reducer with the same event builders session.js uses —
// a test that manufactures its own events proves only that the reducer works.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KIND, REGION, buildNodes, gatherIds, sourceOf, produces, regionOf, recipeLevel,
  newRun, tickRun, strike, harvest, cookChoice, cookOne, eat, handovers, gatherWants,
  gatherEvent, cookEvent, deliverEvent, NodeSet, cookedOf,
} from './gathering.js';
import { placeAll } from './placement.js';
import { contains } from './areas.js';
import { pickContext } from './context.js';
import { step, blankState } from './quest.js';
import { lintAll } from '../../tools/lintQuests.mjs';
import { streamFor } from '../sim/rng.js';
import { CATCH, FORAGE, ROCK, RESPAWN } from '../sim/tables.js';
import { cookedValue, burnChance } from '../sim/gather.js';
import { xpToReach } from '../sim/xp.js';
import { blank, addItem } from './save.js';
import { rows, quote } from './sale.js';
import { heightAt, waterY, creekZ, creekHalf } from '../world/field.js';

const read = f => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const SHIPPED = lintAll();
const AREAS = SHIPPED.areas;
const PLACED = placeAll(read('data/gather.json'), AREAS);
const BUILT = buildNodes(PLACED.placed, AREAS);
const NODES = BUILT.nodes;

const wanted = () => [...gatherIds(SHIPPED.defs).values()];
const rawWanted = () => wanted().filter(w => sourceOf(w.id)?.kind !== 'cook');

test('every gather node in data/gather.json is placed and built', () => {
  assert.deepEqual(PLACED.errors, []);
  assert.deepEqual(BUILT.errors, []);
  assert.equal(NODES.length, read('data/gather.json').length);
});

test('something in the world produces every item the packs ask to be gathered', () => {
  const missing = [];
  for (const want of wanted()) {
    const src = sourceOf(want.id);
    if (!src) { missing.push(`${want.id}: no table has it`); continue; }
    if (src.kind === 'cook') {
      if (!NODES.some(n => n.kind === 'hearth')) missing.push(`${want.id}: no hearth`);
      if (!sourceOf(src.raw)) missing.push(`${want.id}: ${src.raw} comes from nowhere`);
      if (!NODES.some(n => produces(n, sourceOf(src.raw)))) missing.push(`${want.id}: nothing produces ${src.raw}`);
      continue;
    }
    if (!NODES.some(n => produces(n, src))) missing.push(`${want.id}: no ${src.kind} node in ${src.region || src.rock}`);
  }
  assert.deepEqual(missing, [], 'these ids have an objective and no source');
});

// Level, not existence: goldenscale is real and needs Line 13, which is a grind and not a gap. The
// cap is 20, so anything above it would be a genuinely unfinishable step.
test('nothing the packs ask for is above the level cap', () => {
  const over = wanted()
    .map(w => [w.id, sourceOf(w.id)])
    .filter(([, s]) => s && s.level > 20)
    .map(([id, s]) => `${id} needs ${s.level}`);
  assert.deepEqual(over, []);
});

test('a node stands inside every area a gather step scopes it to', () => {
  const bad = [];
  for (const want of rawWanted()) {
    const src = sourceOf(want.id);
    for (const area of want.in) {
      const a = AREAS[area];
      assert.ok(a, `${want.id} is scoped to unknown area ${area}`);
      if (!NODES.some(n => produces(n, src) && contains(a, n.x, n.z))) {
        bad.push(`${want.id} has no source inside ${area}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// A cook step is scoped to a kitchen, so the fire has to be in one. `hearth: true` in areas.json is
// the authority on which those are — not a list here.
test('every cook step has a fire inside the area it names, and every hearth area has one', () => {
  const bad = [];
  for (const want of wanted()) {
    if (sourceOf(want.id)?.kind !== 'cook') continue;
    for (const area of want.in) {
      if (!NODES.some(n => n.kind === 'hearth' && contains(AREAS[area], n.x, n.z))) {
        bad.push(`${want.id} is cooked in ${area} and there is no fire there`);
      }
    }
  }
  const flagged = Object.values(AREAS).filter(a => a.hearth).map(a => a.id);
  const unlit = flagged.filter(id => !NODES.some(n => n.kind === 'hearth' && contains(AREAS[id], n.x, n.z)));
  assert.deepEqual(bad, []);
  assert.deepEqual(unlit, [], 'an area marked hearth: true with nothing to cook on');
  assert.ok(flagged.length >= 3);
  for (const n of NODES.filter(x => x.kind === 'hearth')) {
    assert.ok(AREAS[n.area]?.hearth, `${n.id} is a fire in ${n.area}, which is not a hearth area`);
  }
});

// `heath` and `fields` belong to no town, and the tables are keyed by reach. Guessing would put
// Longacre wheat on the Blackstone heath, so a node with no town has to name its region.
test('a node in a townless area is refused unless it names its region', () => {
  assert.equal(regionOf(AREAS, 'stand.chalk'), 'whitewall');
  assert.equal(regionOf(AREAS, 'wwa.fishsteps'), 'whitewall');
  assert.equal(regionOf(AREAS, 'stand.quiet'), 'longacre');
  assert.equal(regionOf(AREAS, 'stand.dry'), 'blackstone');
  assert.equal(regionOf(AREAS, 'heath.stones'), null);
  assert.equal(regionOf(AREAS, 'heath.stones', 'blackstone'), 'blackstone');

  const r = buildNodes(placeAll([{ id: 'x', kind: 'forage', area: 'heath.stones', at: [0, 0] }], AREAS).placed, AREAS);
  assert.deepEqual(r.nodes, []);
  assert.match(r.errors[0], /needs a `region`/);
});

test('a fish spot draws on the reach it stands in', () => {
  for (const n of NODES.filter(x => x.kind === 'fish')) {
    assert.ok(CATCH[n.region], `${n.id} has no catch table`);
    assert.ok(n.areas.includes(n.area), `${n.id} does not sit in its own anchor`);
  }
  const chalk = NODES.find(n => n.id === 'stand.chalk.spot');
  assert.equal(chalk.region, 'whitewall');
  assert.ok(CATCH.whitewall.some(e => e.id === 'silverling'));
  // The Hollow Ford is on the heath and fishes Longacre water — the override, not the area's town.
  assert.equal(NODES.find(n => n.id === 'heath.ford.spot').region, 'longacre');
});

test('the strike window is the tables\', and only a release inside it lands anything', () => {
  const node = NODES.find(n => n.id === 'wwa.fishsteps.spot');
  const rng = streamFor(7, 'strike');
  const run = newRun(node, 1, { touch: true });
  assert.equal(run.window, 0.9);
  assert.equal(newRun(node, 1, { touch: false }).window, 0.6);

  // Released before the bite: nothing, and no item.
  assert.equal(strike(run, rng).caught, null);
  assert.equal(strike(run, rng).why, 'early');

  const bite = { ...run, phase: 'bite', t: 0 };
  const inside = strike(bite, streamFor(7, 'a'));
  assert.ok(inside.caught, 'a release on the bite lands a fish');
  assert.ok(CATCH.whitewall.some(e => e.id === inside.caught.item));

  // Held past the window: the run goes back to casting, and a release then pays nothing.
  const late = tickRun(bite, 0.91, () => 0);
  assert.equal(late.event, 'lost');
  assert.equal(late.run.phase, 'cast');
  assert.equal(strike(late.run, streamFor(7, 'a')).caught, null);

  // And still inside it at 0.89 s.
  const held = tickRun(bite, 0.89, () => 0);
  assert.equal(held.event, null);
  assert.ok(strike(held.run, streamFor(7, 'a')).caught);
});

// `secondsPerCatch = castTime / biteChance` only describes the hold if a cast that draws nothing
// casts again by itself. If it did not, one hold would be one roll of the dice.
test('a cast that draws no bite casts again on its own', () => {
  const node = NODES.find(n => n.id === 'wwa.fishsteps.spot');
  let run = newRun(node, 1, { touch: true });
  const first = run.wait;
  const miss = tickRun(run, first + 0.01, () => 0.99);
  assert.equal(miss.event, 'recast');
  assert.equal(miss.run.phase, 'cast');
  assert.equal(miss.run.casts, 1);
  const hit = tickRun(miss.run, first + 0.01, () => 0);
  assert.equal(hit.event, 'bite');
});

test('the second fish needs the Line 7 milestone', () => {
  const node = NODES.find(n => n.id === 'wwa.fishsteps.spot');
  const always = () => 0;
  assert.equal(strike({ ...newRun(node, 6, {}), phase: 'bite' }, always).caught.n, 1);
  assert.equal(strike({ ...newRun(node, 7, {}), phase: 'bite' }, always).caught.n, 2);
});

test('a picked patch goes cooling and comes back on the table\'s own delay', () => {
  const set = new NodeSet(NODES);
  const patch = NODES.find(n => n.kind === 'forage');
  set.begin(patch.id, 100);
  assert.equal(set.get(patch.id).state, 'working');
  const done = set.finish(patch.id, 100, () => 0.5, 1);
  assert.equal(done.state, 'cooling');
  assert.equal(done.t, 100 + RESPAWN.common * 0.8);
  assert.deepEqual(set.tick(done.t - 0.1), []);
  assert.deepEqual(set.tick(done.t), [patch.id]);
  assert.equal(set.get(patch.id).state, 'ready');

  // A fishing spot is not used up: the line coming in puts it straight back.
  const spot = NODES.find(n => n.kind === 'fish');
  set.begin(spot.id, 200);
  assert.equal(set.release(spot.id).state, 'ready');
});

test('a seam yields its own rock and a patch its own region\'s herbs', () => {
  const seam = NODES.find(n => n.id === 'bst.levels.face');
  assert.equal(harvest(seam, () => 0.5, { setting: 1 }).item, ROCK.obsidian.item);
  assert.equal(harvest(seam, () => 0.5, { setting: 3 }).n, 2, 'Setting 3 doubles the yield');
  const patch = NODES.find(n => n.id === 'heath.stones.patch');
  const got = harvest(patch, () => 0.5, { forage: 8 });
  assert.ok(FORAGE.blackstone.some(e => e.id === got.item), `${got.item} is not a Blackstone herb`);
});

test('what goes over the fire is what the live step is waiting for', () => {
  const held = { silverling: 2, snowbarb: 1, weed: 4 };
  // Snowbarb is worth more, and over a Hearth 1 fire it burns 84 times in 100, so the fallback
  // leaves it alone until the fire can cook it — or until a step asks for it.
  assert.equal(cookChoice([], held), 'silverling');
  assert.equal(cookChoice([], held, 20), 'snowbarb', 'a Hearth 20 fire takes the dearer one');
  assert.equal(cookChoice(['cooked_snowbarb'], held), 'snowbarb', 'a live step is worth the risk');
  assert.equal(cookChoice(['cooked_silverling'], held), 'silverling');
  assert.equal(cookChoice(['cooked_silverling'], { snowbarb: 1 }), 'snowbarb');
  assert.equal(cookChoice([], { weed: 4 }), null, 'junk is not food');
  assert.equal(cookChoice([], {}), null);
});

// Defect 6. `recipeLevel` comes off the same value ladder ITEM_VALUE does, so "the dearest raw in
// the bag" and "the raw most certain to burn" were the same item, and burnChance is not clamped:
// a goldenscale over a Hearth 1 fire burned 200 times out of 200.
test('the fallback does not put the rarest fish over a fire that will destroy it', () => {
  const bag = { silverling: 5, goldenscale: 1, wheatglass: 4 };
  assert.ok(burnChance(1, recipeLevel('goldenscale')) > 1, 'goldenscale is no longer the certain burn');
  assert.equal(cookChoice([], bag, 1), 'silverling');
  assert.equal(cookChoice([], bag, 20), 'goldenscale', 'a Hearth 20 fire is welcome to it');
  assert.equal(cookChoice([], { goldenscale: 1 }, 1), 'goldenscale', 'when it is all there is, it cooks');
  assert.equal(cookChoice(['cooked_goldenscale'], bag, 1), 'goldenscale', 'a step asking for it is consent');
});

// Defect 5. `why` was `early` for any release that was not on a bite, including one after the
// window had already closed — so the game told a late player to be slower.
test('the two ways to miss the strike window are told apart', () => {
  const run = newRun(NODES.find(n => n.id === 'wwa.fishsteps.spot'), 1, { touch: true });
  assert.equal(strike(run, () => 0.5).why, 'early');

  const bit = tickRun({ ...run, t: run.wait }, 0.001, () => 0).run;
  assert.equal(bit.phase, 'bite');
  const gone = tickRun(bit, bit.window + 0.01, () => 1);
  assert.equal(gone.event, 'lost');
  assert.equal(strike(gone.run, () => 0.5).why, 'late');

  const recast = tickRun({ ...gone.run, t: gone.run.wait }, 0.001, () => 1);
  assert.equal(recast.event, 'recast');
  assert.equal(strike(recast.run, () => 0.5).why, 'early', 'the miss is remembered past its own cast');
  assert.equal(strike(bit, () => 0.5).why, null, 'and a release on the bite still lands');
});

test('a burn eats the raw, pays the lower XP and mints nothing', () => {
  const burnt = cookOne(() => 0, 'silverling', 1);
  assert.equal(burnt.burnt, true);
  assert.equal(burnt.item, null);
  const good = cookOne(() => 0.99, 'silverling', 1);
  assert.equal(good.item, 'cooked_silverling');
  assert.ok(good.xp > burnt.xp);
  assert.equal(recipeLevel('silverling'), 1);
  assert.equal(recipeLevel('snowbarb'), 9);
});

test('a cooked meal heals and carries its dish family', () => {
  const low = eat('cooked_silverling', 1);
  assert.equal(low.heal, 24);
  assert.equal(low.buff, null, 'the buff opens at Hearth 3');
  const mid = eat('cooked_silverling', 3);
  assert.equal(mid.buff.family, 'focus');
  assert.equal(mid.buff.seconds, 180);
  assert.equal(eat('cooked_wheatglass', 3).buff.family, 'hp');
  assert.equal(eat('cooked_gravecap', 3).buff.family, 'kindle');
  assert.equal(eat('rat_tail', 3), null);
});

// The two events the runtime emits, checked for the fields `credit()` refuses without. §credit
// tests `s.via` and `s.in`, and both are carried by the event rather than by where the player is.
test('a gather event names the node\'s area and a cook event says it was craft', () => {
  const spot = NODES.find(n => n.id === 'stand.chalk.spot');
  const e = gatherEvent(spot, { item: 'weed', n: 1 });
  assert.equal(e.area, 'stand.chalk');
  assert.ok(e.areas.includes('reach.light'), 'the parent reach comes with it');
  assert.equal(e.verb, KIND.fish.school);
  assert.equal(e.via, undefined);

  const fire = NODES.find(n => n.kind === 'hearth' && n.area === 'wwa.kitchen');
  const c = cookEvent(fire, 'cooked_silverling');
  assert.equal(c.via, 'craft');
  assert.equal(c.verb, 'hearth');
  assert.equal(c.area, 'wwa.kitchen');
});

test('the reducer refuses a cook that does not say it was craft', () => {
  const def = SHIPPED.defs['light.26'];
  const fire = NODES.find(n => n.kind === 'hearth' && n.area === 'wwa.kitchen');
  const defs = { 'light.26': def };
  const state = { quests: { 'light.26': { s: 'active', i: 2, c: {}, t: 0, e: 0 } }, tracked: 'light.26' };
  const ctx = { areas: ['wwa.kitchen', 'wwa'], schools: {}, quests: state.quests, flags: {}, truths: [], items: {} };

  const bare = { ...cookEvent(fire, 'cooked_silverling'), via: undefined };
  assert.deepEqual(step(defs, state, bare, ctx).state.quests['light.26'].c, {});
  const real = step(defs, state, cookEvent(fire, 'cooked_silverling'), ctx);
  assert.deepEqual(real.state.quests['light.26'].c.cook, [1]);
});

test('a hand-over is offered only where the step scopes it and only when carrying', () => {
  const defs = { 'light.26': SHIPPED.defs['light.26'] };
  const quests = { 'light.26': { s: 'active', i: 3, c: {}, t: 0, e: 0 } };
  const ctx = { quests, flags: {}, truths: [], schools: {}, items: {}, day: 0, hour: 9 };
  const ask = (held, here) => handovers(defs, quests, ctx, { held, here });

  assert.deepEqual(ask({ cooked_silverling: 3 }, ['wwa.market']), [], 'not in the right place');
  assert.deepEqual(ask({}, ['reach.east', 'stand.east']), [], 'nothing to hand over');
  const one = ask({ cooked_silverling: 2 }, ['reach.east', 'stand.east']);
  assert.equal(one.length, 1);
  assert.deepEqual([one[0].to, one[0].item, one[0].n], ['reach.east', 'cooked_silverling', 2]);
  assert.deepEqual(deliverEvent(one[0]), { t: 'deliver', item: 'cooked_silverling', n: 2, to: 'reach.east' });

  // The market owns the `via: sell` deliveries and this must not offer a second route to them.
  const sellDefs = { 'light.03': SHIPPED.defs['light.03'] };
  const sellQuests = { 'light.03': { s: 'active', i: 2, c: {}, t: 0, e: 0 } };
  assert.deepEqual(
    handovers(sellDefs, sellQuests, { ...ctx, quests: sellQuests },
      { held: { silverling: 5 }, here: ['wwa.market', 'wwa'] }),
    [],
  );
});

// The whole chain, on the real nodes, through the real reducer, with the real event builders and a
// seeded rng: catch three silverling off a spot the step's own area contains, cook them at the
// kitchen fire, carry them to the picket. Nothing here is hand-written except the clock.
test('light.26 runs gather → cook → deliver end to end', () => {
  const defs = { 'light.26': SHIPPED.defs['light.26'] };
  let state = blankState();
  let here = ['reach.light', 'downs'];
  const bag = {};
  const ctx = () => ({
    areas: here, quests: state.quests, flags: {}, truths: [], items: { ...bag },
    schools: { line: xpToReach(6), hearth: xpToReach(6) }, standing: {},
    campaign: { current: 'light', done: [] }, day: 0, hour: 10,
  });
  const fire = e => { const r = step(defs, state, e, ctx()); state = r.state; return r.effects; };
  const rec = () => state.quests['light.26'];

  fire({ t: 'accept', id: 'light.26', force: true });
  fire({ t: 'talk', npc: 'kesta', node: 'light.26.in' });
  assert.equal(rec().i, 1, 'the brief is done');

  const spot = NODES.find(n => n.kind === 'fish' && contains(AREAS['reach.light'], n.x, n.z));
  assert.ok(spot, 'reach.light has no fishing spot');
  const rng = streamFor(11, 'light.26');
  let run = newRun(spot, 6, { touch: true });
  let casts = 0;
  while (rec().i === 1 && casts < 400) {
    const t = tickRun(run, run.phase === 'bite' ? 0.3 : run.wait + 0.01, rng);
    run = t.run;
    if (t.event !== 'bite') { casts++; continue; }
    const s = strike(run, rng);
    run = s.run;
    casts++;
    if (!s.caught) continue;
    bag[s.caught.item] = (bag[s.caught.item] || 0) + s.caught.n;
    fire(gatherEvent(spot, s.caught));
  }
  assert.equal(rec().i, 2, `three silverling in ${casts} casts`);
  assert.ok(bag.silverling >= 3, 'and they are in the bag');

  here = ['wwa.kitchen', 'wwa'];
  const hearth = NODES.find(n => n.kind === 'hearth' && contains(AREAS['wwa.kitchen'], n.x, n.z));
  assert.ok(hearth, 'wwa.kitchen has no fire');
  let cooks = 0;
  while (rec().i === 2 && cooks < 60) {
    const raw = cookChoice(gatherWants(defs, state.quests, ctx()), bag);
    assert.equal(raw, 'silverling', 'the live step chooses what goes on the fire');
    const r = cookOne(rng, raw, 6);
    bag[raw]--;
    cooks++;
    if (r.burnt) continue;
    bag[r.item] = (bag[r.item] || 0) + 1;
    fire(cookEvent(hearth, r.item));
  }
  assert.equal(rec().i, 3, `three meals in ${cooks} cooks`);

  here = ['reach.east', 'march.west'];
  const give = handovers(defs, state.quests, ctx(), { held: bag, here });
  assert.equal(give.length, 1);
  fire(deliverEvent(give[0]));
  assert.equal(rec().i, 4, 'the picket is fed');

  const fx = fire({ t: 'talk', npc: 'kesta', node: 'light.26.out' });
  assert.equal(rec().s, 'done');
  assert.ok(fx.some(e => e[0] === 'unlock' && e[1] === 'light.21'));
});

test('main.js hands the session the gather nodes and the world draws them', () => {
  const src = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const i = src.indexOf('function targets()');
  assert.ok(i > 0, 'main.js changed shape — this test needs rewriting');
  assert.match(src.slice(i, src.indexOf('\n}', i)), /nodes\.targets\(\)/);
  assert.match(src, /gatherNodes:\s*\(\)\s*=>\s*gather\.nodes/);
  assert.match(src, /nodeState:\s*\(id, state\)\s*=>\s*nodes\.setState\(id, state\)/);
});

// The event builders are the seam. A session that stopped using them would leave every test above
// green while the game emitted something the reducer refuses.
test('session.js emits through the shared event builders', () => {
  const src = readFileSync(new URL('./session.js', import.meta.url), 'utf8');
  for (const call of ['emit(gatherEvent(', 'emit(cookEvent(', 'emit(deliverEvent(']) {
    assert.ok(src.includes(call), `session.js no longer calls ${call}`);
  }
  assert.ok(!/t: 'gather'/.test(src), 'session.js builds a gather event by hand somewhere');
});

// The chain does not end at the bag: a cooked fish that the market cannot price is wealth the
// player cannot spend, and `cookedValue` was the only thing that knew what one was worth.
test('a cooked fish can be carried, priced and sold', () => {
  const doc = blank(1);
  addItem(doc, 'cooked_silverling', 3);
  addItem(doc, 'silverling', 2, Date.now());
  const list = rows(doc, { district: 'light', now: Date.now() });
  const cooked = list.find(r => r.id === 'cooked_silverling');
  assert.ok(cooked, 'the market cannot see it');
  assert.equal(cooked.value, cookedValue('silverling'));
  assert.equal(cooked.perishable, false, 'cooking resets freshness permanently');
  assert.ok(cooked.value > list.find(r => r.id === 'silverling').value);
  assert.ok(quote(list, ['cooked_silverling'], doc, { district: 'light' }).marks > 0);
});

// Fishing is the one gather kind that could cost fill rate. Nothing is drawn on the water: every
// spot stands on the bank, out of the channel and above the line.
test('every fishing spot stands on the bank, not in the river', () => {
  const bad = [];
  for (const n of NODES.filter(x => x.kind === 'fish')) {
    const above = heightAt(n.x, n.z) - waterY(n.x);
    const out = Math.abs(n.z - creekZ(n.x)) - creekHalf(n.x);
    if (above < 0.5) bad.push(`${n.id} is ${above.toFixed(2)} m above the water`);
    if (out < 0.5) bad.push(`${n.id} is ${out.toFixed(2)} m from the channel centre band`);
    if (out > 9) bad.push(`${n.id} is ${out.toFixed(1)} m from the water — nobody would call it a fishing spot`);
  }
  assert.deepEqual(bad, []);
});

// The eat target sits on the player at zero distance. Left to the nearest-wins rule it would win
// every tie, so dialling Hearth beside a fire would offer a meal instead of the cooking.
test('a target on the player yields to anything else in reach', () => {
  const p = { x: 0, z: 0 };
  const meal = { id: 'self', kind: 'eat', x: 0, z: 0, range: 1, yields: true };
  const fire = { id: 'wwa.kitchen.fire', kind: 'cook', x: 2, z: 0, range: 3.6 };
  const far = { id: 'far', kind: 'work', x: 40, z: 0, range: 3.6 };

  assert.equal(pickContext([meal, fire], p).id, 'wwa.kitchen.fire');
  assert.equal(pickContext([fire, meal], p).id, 'wwa.kitchen.fire');
  assert.equal(pickContext([meal, far], p).id, 'self', 'out of range does not count as company');
  assert.equal(pickContext([meal], p).id, 'self');
  assert.equal(pickContext([far], p), null);
  // The graft target does not yield — that behaviour is unchanged.
  const graft = { id: 'self', kind: 'graft', x: 0, z: 0, range: 1 };
  assert.equal(pickContext([graft, fire], p).kind, 'graft');
});

test('the region map is the three towns and nothing else', () => {
  assert.deepEqual(Object.keys(REGION).sort(), ['dark', 'light', 'neutral']);
  assert.deepEqual(Object.values(REGION).sort(), Object.keys(CATCH).sort());
  assert.deepEqual(Object.values(REGION).sort(), Object.keys(FORAGE).sort());
});

test('cooked ids are the raw ids with a prefix, which is what the packs assume', () => {
  for (const w of wanted()) {
    const src = sourceOf(w.id);
    if (src?.kind !== 'cook') continue;
    assert.equal(cookedOf(src.raw), w.id);
  }
});
