// The seam between the pure reducer and the world: accepting a quest through the dialogue box,
// the `recover` verbs, and the effects `apply()` carries out. A green `quest.test.js` proved none
// of this, which is how four dead verbs and an unreachable offer path survived.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { normaliseQuests, normaliseDialogue } from './questdef.js';
import { QuestRunner, briefOf, offerNode, offerId } from './questrunner.js';
import { DialogueBox } from './dialoguebox.js';
import { JournalScreen } from './journalscreen.js';
import { centreOf } from './areas.js';
import { slate } from './towns.js';
import { install as installFailure, fail, watchBoot } from './failure.js';
import { blank, addItem, itemCount } from './save.js';
import { lintAll, ROOT } from '../../tools/lintQuests.mjs';


// node has no DOM and the game UI only ever calls createElement, so this is the whole of it.
class Stub {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; }
  get firstChild() { return this.children[0] || null; }
  append(...kids) {
    for (const k of kids) {
      const n = k instanceof Stub ? k : { text: String(k), remove() { this.parent?.drop(this); } };
      n.parent = this;
      this.children.push(n);
    }
  }
  drop(n) { const i = this.children.indexOf(n); if (i >= 0) this.children.splice(i, 1); }
  remove() { this.parent?.drop(this); this.parent = null; }
  addEventListener() {}
  setAttribute() {}
  get classList() { return { toggle: () => {}, add: () => {}, remove: () => {} }; }
  get textContent() { return this.children.map(c => (c instanceof Stub ? c.textContent : c.text)).join(''); }
  set textContent(v) { this.children = []; if (v !== undefined) this.append(v); }
}

export function installDom() {
  if (globalThis.document) return;
  globalThis.document = { createElement: tag => new Stub(tag), head: new Stub('head'), body: new Stub('body'),
    getElementById: () => null };
}
installDom();

// `audio.js` reads `window.AudioContext` at module scope, which is the only thing standing between
// node and the real session module.
globalThis.window ??= globalThis;
const { Session, questWorld } = await import('./session.js');

const QUESTS = [
  {
    id: 'q.01', title: 'The Granary', summary: 'Something is in the grain.', giver: 'bel',
    steps: [
      { id: 'brief', do: ['talk', 'bel', 'q.01.in'], text: 'Speak to Bel' },
      { id: 'cull', do: ['kill', 'grain_rat', 2], in: 'wwa.granary', text: 'Cull the rodents',
        recover: [['moveTo', 'wwa.granary'], ['respawn', 'grain_rat', 2]] },
      { id: 'lamp', do: ['interact', 'wwa.granary.lamp', 1], text: 'Relight the lamp',
        recover: [['arm', 'wwa.granary.lamp'], ['grant', 'rat_tail', 3], ['sound', 'uiBlip']] },
    ],
  },
  {
    id: 'q.02', title: 'Line and Water', summary: 'Five silverling.', giver: 'rell',
    prereq: ['quest', 'q.01', 'done'],
    steps: [{ id: 'catch', do: ['gather', 'silverling', 5], text: 'Catch five' }],
  },
  {
    id: 'q.03', title: 'Vermin Contract', summary: 'A standing bounty.', giver: 'board_ww',
    board: { weight: 1 },
    steps: [{ id: 'cull', do: ['kill', 'grain_rat', 4], text: 'Cull four' }],
  },
];

const DIALOGUE = {
  'q.01.in': { lines: [['bel', 'There is something in the grain.', 'Eight of them, at a guess.']] },
};

function runner({ world = {}, doc = blank(1) } = {}) {
  const q = new QuestRunner({ doc, world });
  q.defs = normaliseQuests(QUESTS, { pack: '' }).defs;
  q.dialoguePack = normaliseDialogue(DIALOGUE, { pack: '' }).nodes;
  q.buildOffers();
  return q;
}

// The shipped packs and areas, so "a new game starts in the granary" is asserted against the real
// content rather than a fixture that agrees with the code.
const SHIPPED = lintAll();

function shipped() {
  const q = new QuestRunner({ doc: blank(1), world: { groundAt: () => 4 } });
  q.defs = SHIPPED.defs;
  q.areas = SHIPPED.areas;
  q.buildOffers();
  return q;
}

// Enough of a session to call the placement methods on: the constructor wants a renderer, an
// AudioContext and a window, and none of that is what is under test here.
function session(quests, at = { x: 1, y: 8, z: 22 }) {
  const s = Object.create(Session.prototype);
  s.doc = quests.doc;
  s.quests = quests;
  s.world = { groundAt: () => 4 };
  s.gaps = [];
  s.player = { pos: { ...at, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
  return s;
}

test('a new game starts inside its first quest, not in whichever town the mesh defaults to', () => {
  const q = shipped();
  const s = session(q);
  assert.equal(s.reachable(centreOf(q.areas['wwa.granary'])), false,
    'the 400 m gate refuses the granary from where a cold start leaves the player');
  assert.equal(s.beginCampaign(), 'light.01');
  assert.equal(q.doc.quests['light.01'].s, 'active', 'and it is already accepted');
  assert.equal(q.doc.tracked, 'light.01');

  const granary = centreOf(q.areas['wwa.granary']);
  assert.equal(s.player.pos.x, granary.x);
  assert.equal(s.player.pos.z, granary.z);
});

test('a placement refuses ground it cannot sample, and the hearth is the campaign\'s own', () => {
  const q = shipped();
  const s = session(q);
  s.world = { groundAt: () => NaN };
  assert.equal(s.placeAtArea('wwa.granary', { far: true }), false);
  assert.equal(s.player.pos.x, 1, 'and leaves the player where he was');

  s.world = { groundAt: () => 4 };
  s.doc.campaign.current = 'dark';
  s.spawnAtHearth(null);
  const kitchen = centreOf(q.areas['bst.kitchen']);
  assert.notEqual(s.player.pos.x, kitchen.x, 'still gated: a hearth 600 m away is not reachable');
  s.player.pos.set(kitchen.x + 20, 4, kitchen.z);
  s.spawnAtHearth(null);
  assert.equal(s.player.pos.x, kitchen.x, 'Blackstone wakes at Blackstone\'s hearth');
});

test('finishing a campaign lights the next panel on the slate', () => {
  const q = runner();
  assert.equal(slate(q.doc)[2].playable, false, 'Blackstone is shut to a fresh save');

  q.apply(['unlock', 'q.02']);
  assert.deepEqual(q.doc.campaign.done, [], 'unlocking a quest is not finishing a campaign');

  q.apply(['flag', 'light.done', true]);
  assert.deepEqual(q.doc.campaign.done, ['light']);
  assert.equal(slate(q.doc)[2].playable, true, 'Blackstone lights');
  assert.equal(slate(q.doc)[1].playable, false, 'Longacre does not, yet');

  q.doc.campaign.current = 'dark';
  q.apply(['unlock', 'neutral']);
  assert.deepEqual(q.doc.campaign.done, ['light', 'dark'], 'the other side of the same signal');
  assert.equal(slate(q.doc)[1].playable, true);

  q.doc.campaign.current = 'neutral';
  q.apply(['flag', 'neutral.done', true]);
  assert.ok(slate(q.doc)[0].trilogy);

  q.apply(['flag', 'light.done', true]);
  q.apply(['flag', 'light.act1.done', true]);
  q.doc.campaign.current = 'light';
  q.apply(['flag', 'dark.done', false]);
  assert.deepEqual(q.doc.campaign.done, ['light', 'dark', 'neutral'],
    'no doubles, no act flags, and clearing a flag does not finish anything');
});

// Drives the shipped `light.01` to its turn-in through the runner, which is the only way to see
// what a quest actually pays a player.
function playGranary(worn = null) {
  const q = shipped();
  q.doc.worn = worn;
  q.here = ['wwa.granary', 'wwa'];
  q.accept('light.01');
  q.emit({ t: 'kill', kind: 'grain_rat', n: 1 });
  q.emit({ t: 'kill', kind: 'grain_rat', n: 7 });
  q.emit({ t: 'interact', id: 'wwa.granary.lamp', verb: 'kindle' });
  q.emit({ t: 'talk', npc: 'bel', node: 'light.01.out' });
  assert.equal(q.doc.quests['light.01'].s, 'done');
  return q.doc;
}

test('a turn-in pays through the affinity row, so the face you wear changes what you bank', () => {
  const own = playGranary();
  assert.equal(own.schools.kindle, 157, 'Kindle is nobody\'s affinity in Whitewall: the published base');
  assert.equal(own.schools.cull, 157);

  const grafted = playGranary('dark');
  assert.equal(grafted.schools.kindle, 181, 'Kindle is Blackstone\'s own — 157 × 1.15 while wearing it');
  assert.equal(grafted.schools.cull, 181);
});

test('finishing a job raises that town\'s Standing and costs you a little with its opposite', () => {
  const doc = playGranary();
  assert.equal(doc.standing.light, 8, 'SYSTEMS §7.1 pays 8 a quest');
  assert.equal(doc.standing.dark, -3.2, 'and bleeds 0.4 of it off the opposite town');
  assert.equal(doc.standing.neutral, 0, 'Longacre is nobody\'s opposite');
});

// `store.load()` runs before the packs do, so `normalise` is handed no `defs` and neither
// definition-dependent check can fire. This is the pass that actually happens.
test('the session re-checks the save against the packs once they have loaded', () => {
  const q = shipped();
  const s = session(q);
  s.doc.quests = {
    'light.01': { s: 'active', i: 12, c: {} },
    'cut.99': { s: 'active', i: 0, c: {} },
  };
  s.doc.tracked = 'cut.99';
  s.notices = [];
  const warn = console.warn;
  console.warn = () => {};
  try { s.reconcile(); } finally { console.warn = warn; }

  assert.equal(s.doc.quests['cut.99'], undefined, 'a quest this build no longer has is dropped');
  assert.equal(s.doc.quests['light.01'].i, 3, 'and a step index past the end comes back to the last step');
  assert.equal(s.doc.tracked, null);
  assert.equal(s.notices.length, 2, 'both are reported, not swallowed');
});

test('a failure says so on the page instead of leaving a dead screen', async () => {
  const handlers = {};
  globalThis.addEventListener = (t, f) => { handlers[t] = f; };
  const err = console.error;
  console.error = () => {};
  try {
    installFailure();
    handlers.error({ message: 'boom' });
    const bar = document.body.children.at(-1);
    assert.match(bar.textContent, /boom/);
    assert.match(bar.textContent, /Reload/, 'and says what to do about it');

    handlers.unhandledrejection({ reason: new Error('a promise nobody caught') });
    assert.match(document.body.children.at(-1).textContent, /nobody caught/, 'one bar, reused');

    bar.children[1].onclick();
    assert.equal(document.body.children.includes(bar), false, 'dismissible: it is not a modal');

    watchBoot(() => false, 0);
    await new Promise(r => setTimeout(r, 5));
    assert.match(document.body.children.at(-1).textContent, /taking too long/);
    document.body.children.at(-1).children[1].onclick();

    const quiet = document.body.children.length;
    watchBoot(() => true, 0);
    await new Promise(r => setTimeout(r, 5));
    assert.equal(document.body.children.length, quiet, 'a world that came up says nothing');
  } finally {
    console.error = err;
    delete globalThis.addEventListener;
  }
});

test('the journal is the way out of a stuck quest, and it takes two taps', () => {
  const q = runner();
  q.accept('q.01');
  const screen = new JournalScreen({
    host: new Stub('div'), quests: q, journal: () => ({ truths: [], log: [] }), clock: null,
  });
  screen.show('quests');
  assert.equal(screen.selected, 'q.01');

  assert.equal(screen.abandonSelected(), false, 'the first tap only arms it');
  assert.equal(q.doc.quests['q.01'].s, 'active');

  screen.selected = 'q.01';
  assert.equal(screen.abandonSelected(), true);
  assert.equal(q.doc.quests['q.01'], undefined, 'gone, not failed');
  assert.equal(q.doc.tracked, null);
  assert.equal(q.offerFrom('bel'), 'q.01', 'and Bel will offer it again');
});

// Every branch of `apply()`. It had no test at all, which is why four dead `recover` verbs and an
// orphaned `grantXp` sat in the middle of the effect list unnoticed.
test('apply carries out every effect the reducer can emit', () => {
  const world = { calls: [] };
  for (const verb of ['moveTo', 'grant', 'sound']) world[verb] = (...a) => world.calls.push([verb, ...a]);
  const q = runner({ world });
  q.truths = { 'the.draw': { text: 'The draw is a levy.' } };
  q.clock = { day: 3, hour: 6, t: 78, advanceTo(h) { this.went = h; return 1; }, waitUntil(t) { this.until = t; return 1; } };
  const played = [];
  q.dialogue = { play: id => played.push(id), seen: [] };

  const cases = [
    [['accept', 'q.01'], d => assert.equal(d.quests['q.01'].s, 'active')],
    [['xp', 'cull', 40], d => assert.ok(d.schools.cull > 0, 'the school was paid')],
    [['mk', 7], d => assert.equal(d.purse.marks, 7)],
    [['item', 'rat_tail', 8], d => assert.equal(itemCount(d, 'rat_tail'), 8)],
    [['truth', 'the.draw'], d => assert.equal(d.truths[0].id, 'the.draw')],
    [['flag', 'sold.once'], d => assert.equal(d.flags['sold.once'], true)],
    [['flag', 'haggled', false], d => assert.equal(d.flags.haggled, false)],
    [['unlock', 'q.02'], d => assert.equal(d.flags['unlocked.q.02'], true)],
    [['act', 2], d => assert.equal(d.campaign.act, 2)],
    [['merge', 'the_clerk', 'ansel'], d => assert.equal(d.campaign.merged.the_clerk, 'ansel')],
    [['dialogue', 'q.01.in'], () => assert.deepEqual(played, ['q.01.in'])],
    [['wait', 18, null], () => assert.equal(q.clock.went, 18)],
    [['sound', 'uiBlip'], () => assert.deepEqual(world.calls.at(-1), ['sound', 'uiBlip'])],
    [['recover', [['moveTo', 'wwa.granary'], ['grant', 'rat_tail', 3]]],
      () => assert.deepEqual(world.calls.slice(-2), [['moveTo', 'wwa.granary'], ['grant', 'rat_tail', 3]])],
    [['nonsense', 1], d => assert.ok(d), 'an effect this build does not know must not throw'],
  ];
  for (const [effect, check] of cases) {
    q.apply(effect);
    check(q.doc, effect);
  }
});

// `tools/lintQuests.mjs` does not export its RECOVER table and is not this pass's file to change,
// so the contract is read out of its source: whatever the linter validates must be callable.
function recoverVerbs() {
  const src = readFileSync(`${ROOT}/tools/lintQuests.mjs`, 'utf8');
  const m = src.match(/const RECOVER = \{([^}]*)\}/);
  assert.ok(m, 'lintQuests no longer declares a RECOVER table');
  const verbs = [...m[1].matchAll(/(\w+)\s*:/g)].map(x => x[1]);
  assert.ok(verbs.length >= 5, `only found ${verbs}`);
  return verbs;
}

test('every recover verb the linter validates is callable on the world the session builds', () => {
  const calls = [];
  const hooks = {
    sound: id => calls.push(['sound', id]),
    uiBusy: () => false,
    grant: (item, n) => calls.push(['grant', item, n]),
    moveTo: area => calls.push(['moveTo', area]),
    flag: (key, value) => calls.push(['flag', key, value]),
    missing: (verb, ...a) => calls.push(['missing', verb, ...a]),
  };
  const world = questWorld({ rev: () => 0 }, hooks);
  for (const verb of recoverVerbs()) {
    assert.equal(typeof world[verb], 'function', `recover verb \`${verb}\` has no handler`);
  }

  world.moveTo('wwa.granary');
  world.grant('silverling', 5);
  world.flag('neutral.06.met', false);
  world.respawn('grain_rat', 7);
  world.arm('wwa.granary.lamp');
  world.sound('uiBlip');
  assert.deepEqual(calls, [
    ['moveTo', 'wwa.granary'],
    ['grant', 'silverling', 5],
    ['flag', 'neutral.06.met', false],
    ['missing', 'respawn', 'grain_rat', 7],
    ['missing', 'arm', 'wwa.granary.lamp'],
    ['sound', 'uiBlip'],
  ], 'the two verbs with no world hook are recorded, not dropped');

  const grown = [];
  const later = questWorld({ respawn: (k, n) => grown.push(['respawn', k, n]), arm: id => grown.push(['arm', id]) }, hooks);
  later.respawn('grain_rat', 7);
  later.arm('lamp');
  assert.deepEqual(grown, [['respawn', 'grain_rat', 7], ['arm', 'lamp']], 'and a world that grows them wins');

  // Having an `arm` is not the same as having the object. Nothing places `lac.henhouse.hen`, and a
  // reset that quietly does nothing is the failure §9.4 exists to prevent.
  calls.length = 0;
  questWorld({ arm: () => false }, hooks).arm('lac.henhouse.hen');
  assert.deepEqual(calls, [['missing', 'arm', 'lac.henhouse.hen']]);
});

test('`recover` runs the whole action list through the world', () => {
  const calls = [];
  const q = runner({ world: { moveTo: a => calls.push(['moveTo', a]), grant: (i, n) => calls.push(['grant', i, n]) } });
  q.apply(['recover', [['moveTo', 'wwa.granary'], ['grant', 'rat_tail', 3], ['respawn', 'grain_rat', 2]]]);
  assert.deepEqual(calls, [['moveTo', 'wwa.granary'], ['grant', 'rat_tail', 3]]);
});

test('`grant` tops the stack up to what the step needs and never mints', () => {
  const s = session(shipped());
  s.regrant('silverling', 5);
  assert.equal(itemCount(s.doc, 'silverling'), 5);
  s.regrant('silverling', 5);
  assert.equal(itemCount(s.doc, 'silverling'), 5, 'resetting a step twice is not free fish');
  addItem(s.doc, 'silverling', 3);
  s.regrant('silverling', 5);
  assert.equal(itemCount(s.doc, 'silverling'), 8, 'and it never takes anything away');
});

test('a recover verb the world cannot do yet is recorded, said out loud and logged', () => {
  const s = session(shipped());
  const said = [];
  s.hud = { say: t => said.push(t) };
  const warn = console.warn;
  const logged = [];
  console.warn = m => logged.push(m);
  try {
    assert.equal(s.noHook('respawn', ['grain_rat', 7]), false);
    assert.equal(s.recoverTo('nowhere.at.all'), false, 'an area this world has no anchor for');
  } finally { console.warn = warn; }
  assert.deepEqual(s.gaps, [['respawn', 'grain_rat', 7], ['moveTo', 'nowhere.at.all']]);
  assert.equal(said.length, 2);
  assert.equal(logged.length, 2);
});

test('the board is the board of the town the player is standing in', () => {
  const q = shipped();
  assert.equal(q.boardTown(), 'light', 'out in the countryside, the campaign\'s own town');

  q.here = ['bst.lower', 'bst'];
  assert.equal(q.boardTown(), 'dark');
  const dark = q.rollBoard();
  for (const id of dark) assert.ok(!q.defs[id].town || q.defs[id].town === 'dark', `${id} is not posted in Blackstone`);

  q.here = ['wwa'];
  const light = q.rollBoard();
  assert.notDeepEqual(light, dark, 'the same day at a different board is a different board');

  q.here = ['bst'];
  assert.deepEqual(q.rollBoard(), dark, 'and walking back is deterministic, not a re-roll');
});

test('the offer node hands off to the giver\'s brief and carries the accept', () => {
  const defs = normaliseQuests(QUESTS, { pack: '' }).defs;
  assert.equal(briefOf(defs['q.01']), 'q.01.in');
  assert.equal(briefOf(defs['q.02']), null, 'no talk step means no brief to hand off to');

  const node = offerNode(defs['q.01']);
  assert.equal(node.lines.length, 0, 'a pure branch point: choices, no bubble');
  assert.deepEqual(node.choices[0].sets, [['accept', 'q.01']]);
  assert.equal(node.choices[0].goto, 'q.01.in');
  assert.equal(node.choices[1].goto, null);
  for (const c of node.choices) assert.ok(c.say.length <= 46, `${c.say} is over the bubble width`);
});

test('a giver only offers what is actually on the table', () => {
  const q = runner();
  assert.equal(q.offerFrom('bel'), 'q.01');
  assert.equal(q.offerFrom('rell'), null, 'q.02 is gated behind q.01');
  assert.equal(q.offerFrom('nobody'), null);
  assert.equal(q.offerFrom('board_ww'), null, 'a board template is only offered when posted');

  q.doc.board = { day: 0, town: 'light', ids: ['q.03'] };
  assert.equal(q.offerFrom('board_ww'), 'q.03');

  q.accept('q.01');
  assert.equal(q.offerFrom('bel'), null, 'an accepted quest is not offered again');
});

test('talking to a giver accepts the quest and plays the brief, and the brief credits step 0', () => {
  const q = runner();
  const box = new DialogueBox({
    host: new Stub('div'),
    ctx: () => q.ctx(),
    effects: e => q.apply(e),
    done: ({ node, nodes, npc }) => q.emit({ t: 'talk', npc, node, nodes }),
  });
  box.load(q.dialoguePack);
  q.dialogue = box;

  assert.equal(q.sceneFor('bel'), null, 'nothing active, so no live scene');
  const scene = q.offerSceneFor('bel');
  assert.equal(scene, offerId('q.01'));
  assert.ok(box.play(scene));
  assert.ok(box.scene.choosing, 'the offer opens straight on its choices');

  box.pick(0);
  assert.equal(q.doc.quests['q.01'].s, 'active', 'taking it on accepts the quest');
  assert.equal(q.doc.tracked, 'q.01');
  assert.equal(box.scene.id, 'q.01.in', 'and hands off to the brief');

  box.next();
  assert.equal(box.active, false);
  assert.equal(q.doc.quests['q.01'].i, 1, 'the brief satisfied the talk step');
});

test('declining leaves the quest on the table', () => {
  const q = runner();
  const box = new DialogueBox({
    host: new Stub('div'), ctx: () => q.ctx(), effects: e => q.apply(e),
    done: ({ node, nodes, npc }) => q.emit({ t: 'talk', npc, node, nodes }),
  });
  box.load(q.dialoguePack);
  q.dialogue = box;

  box.play(q.offerSceneFor('bel'));
  box.pick(1);
  assert.equal(q.doc.quests['q.01'], undefined);
  assert.equal(q.offerFrom('bel'), 'q.01', 'and it can be taken next time');
});

