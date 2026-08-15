// Defect 1 of REVIEW_GATHER: a gather hold that survives the context changing under the thumb.
// A real Session against the real packs and the real data/gather.json, because `channel()` is the
// seam and no pure test constructs one — the review had to build a browser to see this.
//
// The DOM bag is combat.test.js's; the session builds a HUD, a menu and a market out of DOM nodes
// and does nothing with them but append and classList.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildNodes } from './gathering.js';
import { placeAll } from './placement.js';
import { addItem, itemCount } from './save.js';
import { nodeItem, targetList } from '../world/nodestate.js';
import { lintAll } from '../../tools/lintQuests.mjs';

function fakeDom() {
  const node = () => {
    const n = {
      children: [], className: '', id: '', textContent: '', value: '', checked: false, parent: null,
      style: { setProperty() {}, removeProperty() {} }, dataset: {},
      classList: { s: new Set(), add(...c) { c.forEach(x => this.s.add(x)); },
        remove(...c) { c.forEach(x => this.s.delete(x)); },
        toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      append(...k) { for (const c of k) if (c && typeof c === 'object') { c.parent = n; n.children.push(c); } },
      appendChild(c) { n.append(c); return c; },
      prepend(...k) { n.append(...k); },
      remove() { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); },
      addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
      getAttribute: () => null, focus() {}, blur() {}, scrollIntoView() {},
      querySelector: () => null, querySelectorAll: () => [],
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 }),
      get firstChild() { return n.children[0] || null; },
    };
    return n;
  };
  const mem = new Map();
  globalThis.document ??= {
    head: node(), body: node(), documentElement: node(), hidden: false,
    createElement: node, createElementNS: node, createTextNode: t => ({ textContent: t }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.window ??= globalThis;
  globalThis.requestAnimationFrame ??= fn => { fn(0); return 0; };
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.innerWidth ??= 844;
  globalThis.innerHeight ??= 390;
  globalThis.navigator ??= { userAgent: 'node', vibrate() {} };
  globalThis.localStorage ??= {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear(),
  };
  globalThis.fetch = async p => {
    try {
      const text = readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch { return { ok: false, status: 404, json: async () => null }; }
  };
}
fakeDom();
const { Session } = await import('./session.js');

const SHIPPED = lintAll();
const read = f => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'));
const PLACED = placeAll(read('data/gather.json'), SHIPPED.areas).placed;
const NODES = buildNodes(PLACED, SHIPPED.areas).nodes;
const at = id => NODES.find(n => n.id === id);
// The same list js/world/nodes.js hands main.js, built from the same module.
const TARGETS = targetList(PLACED.map(e => nodeItem(e, 0, 'light')));

const app = () => ({ quality: { register() {}, get() {} } });

async function game() {
  localStorage.clear();
  const drawn = new Map();
  const body = { pos: { x: 0, y: 4, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, camYaw: 0 };
  const s = new Session(app(), body, { fresh: true, world: {
    gatherNodes: () => NODES,
    nodeState: (id, state) => drawn.set(id, state),
    targets: () => TARGETS,
  } });
  await s.start();
  s.doc.settings.haptics = false;
  s.drawn = drawn;
  return s;
}

// Stand on a node and hold the button it offers.
function hold(s, id, kind) {
  const n = at(id);
  s.player.pos.set(n.x, 4, n.z);
  s.context = { id, kind, label: kind };
  s.channel('start', kind);
}

// Face A of the review: the cook step finishes under the thumb, the delivery target takes the
// button, the player lets go — and the fire cooked the whole bag with nothing held. Forty
// mudbream in seventy seconds at the shipped limits.
test('a cook hold that is released on some other context stops the fire', async () => {
  const s = await game();
  addItem(s.doc, 'mudbream', 40, Date.now());
  hold(s, 'wwa.kitchen.fire', 'cook');
  assert.equal(s.cooking?.id, 'wwa.kitchen.fire', 'the fire is not lit — this test proves nothing');

  // What sandbox.04 does: the cook step completes and the hand-over target takes the button.
  s.context = { id: 'wwa.kitchen', kind: 'give', label: 'give', give: null };
  s.channel('release', 'give');
  assert.equal(s.cooking, null, 'the fire is still cooking with nothing held');

  const before = itemCount(s.doc, 'mudbream');
  for (let i = 0; i < 70 * 60; i++) s.gatherTick(1 / 60);
  assert.equal(itemCount(s.doc, 'mudbream'), before, 'the bag was eaten with the thumb off the screen');
  assert.equal(itemCount(s.doc, 'cooked_mudbream'), 0);
});

// The same hold, ended the other way: walking out of range sets the context to null, and the HUD
// reports that as `cancel, null` — which is the phone call `workStop`'s comment promises to catch.
test('a cook hold cancelled by the context going null stops the fire', async () => {
  const s = await game();
  addItem(s.doc, 'mudbream', 40, Date.now());
  hold(s, 'wwa.kitchen.fire', 'cook');
  s.context = null;
  s.channel('cancel', null);
  assert.equal(s.cooking, null);
  const before = itemCount(s.doc, 'mudbream');
  for (let i = 0; i < 70 * 60; i++) s.gatherTick(1 / 60);
  assert.equal(itemCount(s.doc, 'mudbream'), before);
});

// Face B: the orphaned line. The spot stays `working` — its pip out and its button reading spent —
// and the run keeps casting and biting from wherever the player has walked to, crediting the
// node's area from the other end of the valley.
test('walking out of range while fishing brings the line in and frees the spot', async () => {
  const s = await game();
  hold(s, 'wwa.fishsteps.spot', 'work');
  assert.equal(s.run?.node, 'wwa.fishsteps.spot');
  assert.equal(s.nodes.get('wwa.fishsteps.spot').state, 'working');

  s.player.pos.set(516, 46, -132);
  s.context = null;
  s.channel('cancel', null);

  assert.equal(s.run, null, 'the run is orphaned and still casting');
  assert.equal(s.nodes.get('wwa.fishsteps.spot').state, 'ready');
  assert.equal(s.drawn.get('wwa.fishsteps.spot'), 'ready', 'and the world was told to light the pip');

  const before = itemCount(s.doc, 'silverling');
  for (let i = 0; i < 60 * 60; i++) s.gatherTick(1 / 60);
  assert.equal(itemCount(s.doc, 'silverling'), before, 'a phantom run is still fishing');
});

// And the fix does not swallow the normal path.
test('a hold released on the node it started on still lands the fish', async () => {
  const s = await game();
  hold(s, 'wwa.fishsteps.spot', 'work');
  for (let i = 0; i < 60 * 60 && s.run.phase !== 'bite'; i++) s.gatherTick(1 / 60);
  assert.equal(s.run.phase, 'bite', 'no bite in a minute of holding');
  s.channel('release', 'work');
  assert.equal(s.run, null);
  assert.ok(s.doc.items.some(e => e.n > 0), `nothing was caught: ${JSON.stringify(s.doc.items)}`);
});

// The one route no cancel covers: two fishing spots offer the same kind and the same label, so
// `hud.setContext` returns early and fires nothing at all when you walk from one to the other.
test('a hold does not follow the player to the next node', async () => {
  const s = await game();
  hold(s, 'wwa.fishsteps.spot', 'work');
  const next = at('stand.low.spot');
  s.player.pos.set(next.x, 4, next.z);
  s.gatherTick(1 / 60);
  assert.equal(s.run, null);
  assert.equal(s.nodes.get('wwa.fishsteps.spot').state, 'ready');
});

// Defect 5, through the real HUD line. The two ways to miss a 0.9 s window are being early and
// being late, and the game reported both as early.
test('holding past the strike window says you were late, not early', async () => {
  const s = await game();
  const said = [];
  s.hud.say = t => said.push(t);
  hold(s, 'wwa.fishsteps.spot', 'work');
  for (let i = 0; i < 60 * 60 && s.run.phase !== 'bite'; i++) s.gatherTick(1 / 60);
  assert.equal(s.run.phase, 'bite');
  for (let i = 0; i < 120 && s.run.phase === 'bite'; i++) s.gatherTick(1 / 60);
  assert.equal(s.run.phase, 'cast', 'the window did not close');
  s.channel('release', 'work');
  assert.match(said.at(-1), /late/i);
  assert.doesNotMatch(said.at(-1), /soon/i);
});

// Defect 2. The hand-over target for an area sits on the player at zero distance, so without
// `yields` it won every tie — over the only Whitewall hearth, three seams and the market stall.
test('an area hand-over yields to the fire it is standing on top of', async () => {
  const s = await game();
  s.doc.quests['sandbox.04'] = { s: 'active', i: 1, c: {} };
  addItem(s.doc, 'cooked_mudbream', 3);
  const fire = at('wwa.kitchen.fire');
  s.player.pos.set(fire.x, 4, fire.z);
  s.quests.update(0.001, s.player.pos);
  assert.ok(s.quests.here.includes('wwa.kitchen'), 'not standing in the kitchen');
  assert.ok(s.giveTargets([]).some(t => t.id === 'wwa.kitchen'), 'the delivery is not being offered at all');

  s.retarget();
  assert.equal(s.context?.id, 'wwa.kitchen.fire');
  assert.equal(s.context?.kind, 'cook');

  // Still the way you hand them over, though — it yields, it is not suppressed.
  s.world.targets = () => [];
  s.retarget();
  assert.equal(s.context?.id, 'wwa.kitchen');
  assert.equal(s.context?.kind, 'give');
});

// The latch must not reach past gathering: a press with nothing being worked is still whatever the
// button says now.
test('a release with nothing being gathered still acts on the context', async () => {
  const s = await game();
  const acted = [];
  s.act = k => acted.push(k);
  s.context = { id: 'marrin', kind: 'talk', label: 'talk' };
  s.channel('start', 'talk');
  s.channel('release', 'talk');
  assert.deepEqual(acted, ['talk']);
  assert.equal(s.run, null);
  assert.equal(s.cooking, null);
});
