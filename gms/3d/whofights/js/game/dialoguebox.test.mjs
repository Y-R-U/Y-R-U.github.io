import { test, eq, ok, near, throws } from '../../tools/harness.mjs';
import { DialogueBox } from './dialoguebox.js';
import { runActions } from './actions.js';

// Enough document for the box to build its nodes. Installed and removed per test — §11: a global
// assigned at module scope leaks into whatever tools/test.mjs imports next.
const node = () => {
  const n = {
    children: [], className: '', textContent: '', parent: null,
    style: { setProperty() {}, removeProperty() {} },
    classList: { s: new Set(), add() {}, remove() {}, toggle() {}, contains() { return false; } },
    append(...k) { for (const c of k) if (c && typeof c === 'object') { c.parent = n; n.children.push(c); } },
    remove() { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); n.parent = null; },
    get firstChild() { return n.children[0] || null; },
  };
  return n;
};

function withDom(fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const prev = globalThis.document;
  globalThis.document = { createElement: node, getElementById: () => null };
  try { return fn(); } finally { had ? (globalThis.document = prev) : delete globalThis.document; }
}

const pack = () => ({
  hello: { id: 'hello', cam: 'two', lines: [{ who: 'vail', text: 'one' }, { who: 'vail', text: 'two' }],
    choices: [{ say: 'and you are?', goto: 'who' }], next: null },
  who: { id: 'who', cam: 'close', lines: [{ who: 'vail', text: 'three' }],
    choices: [{ say: 'thanks', goto: 'bye' }], next: null },
  bye: { id: 'bye', cam: 'none', lines: [{ who: 'vail', text: 'four' }], choices: [], next: null },
  // DEV_CONTRACT §6 allows a node that is nothing but a branch point.
  branch: { id: 'branch', cam: 'two', lines: [],
    choices: [{ say: 'left', goto: null }, { say: 'right', goto: null }], next: null },
  // `who` is a character id; a non-string one makes nameOf() throw inside draw().
  badwho: { id: 'badwho', cam: 'two', lines: [{ who: 7, text: 'boom' }], choices: [], next: null },
});

const make = (player, opts = {}) => {
  const d = new DialogueBox({ host: node(), player, ...opts });
  d.load(pack());
  return d;
};

const ticks = (d, n = 240) => { for (let i = 0; i < n; i++) d.tick(1 / 60); };
const CLAMP = Math.PI * 50 / 180;

// The whole conversation: hello → (choice) → who → (choice) → bye → end. Every arm in CAM is
// smaller than the 7.2 the player walks around on, so a step that is not handed back is visible.
const walk = (d, p) => {
  d.play('hello');
  ticks(d); d.next(); d.next();
  d.pick(0);
  ticks(d); d.next();
  d.pick(0);
  ticks(d); d.next();
};

test('the camera arm is handed back at the value the conversation found it at', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  d.play('hello');
  ticks(d);
  ok(p.dist < 5, `the scene should pull the arm in, got ${p.dist}`);
  d.next(); d.next();
  d.pick(0);
  ticks(d);
  d.next();
  d.pick(0);
  ticks(d);
  d.next();
  eq(d.scene, null, 'the conversation is over');
  near(p.dist, 7.2, 1e-9, 'the arm goes back to 7.2, not to whatever the last node pulled it to');
}));

test('three conversations in a row leave the arm where they found it', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  for (let i = 0; i < 3; i++) { walk(d, p); near(p.dist, 7.2, 1e-9, `after conversation ${i + 1}`); }
}));

test('the look clamp keeps the centre it opened on across a goto', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  d.play('hello');
  eq(d.frameYaw, 0);
  p.camYaw = 0.8;             // the player turns, inside the clamp
  d.next(); d.next();
  d.pick(0);                  // → who, a fresh node in the same conversation
  eq(d.frameYaw, 0, 'the clamp centre is captured once, not re-based on every node');
}));

test('the node list handed to onDone is every node the conversation visited', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  let got = null;
  const d = make(p, { done: r => { got = r; } });
  walk(d, p);
  eq(got.nodes, ['hello', 'who', 'bye']);
}));

test('a branch node with choices and no lines draws its choices', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  ok(d.play('branch'), 'the node opens');
  ok(d.shown, 'something reached the screen');
  eq(d.root.children.length, 1, 'the choice box is in the overlay');
  eq(d.root.children[0].children.map(b => b.textContent), ['left', 'right']);
}));

test('a scene with nothing on screen is torn down rather than holding the camera', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  d.play('hello');
  d.shown = false;            // however it happened, the overlay is blank
  p.camYaw = 3;
  d.tick(1 / 60);
  eq(d.scene, null, 'the stranded scene is closed');
  near(p.camYaw, 3, 1e-9, 'and the look is not clamped to it');
  near(p.dist, 7.2, 1e-9, 'and the arm is handed back');
}));

test('the clamp still holds while a scene really is on screen', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  d.play('hello');
  p.camYaw = 3;
  d.tick(1 / 60);
  near(p.camYaw, CLAMP, 1e-9, 'look cannot turn away from the scene');
  p.camYaw = -3;
  d.tick(1 / 60);
  near(p.camYaw, -CLAMP, 1e-9);
}));

// runActions swallows this on purpose (a bad action must not take the frame down), so play() has
// to be the one that leaves nothing behind — otherwise the look stays clamped behind a blank
// overlay until a refresh.
test('a throw out of draw() closes the scene instead of stranding it', () => withDom(() => {
  const p = { camYaw: 0, dist: 7.2 };
  const d = make(p);
  throws(() => d.play('badwho'), 'the throw reaches the caller');
  eq(d.scene, null, 'nothing is left open');
  eq(d.saved, null);
  near(p.dist, 7.2, 1e-9, 'the arm is handed back');
  p.camYaw = 3;
  d.tick(1 / 60);
  near(p.camYaw, 3, 1e-9, 'and the look is free again');
}));

// The sink is session.js's `sets => runActions(sets, ctx)`, and runActions iterates arrays and
// silently returns [] for anything else. Emitting one action at a time therefore ran none of them
// and reported nothing — every authored effect in the game was dead. Wired to the real runActions
// so the shape cannot drift apart again behind a stub that accepts either.
test('a node\'s authored effects actually run', () => withDom(() => {
  const ctx = { flags: {} };
  const d = make({ camYaw: 0, dist: 7.2 }, { effects: sets => runActions(sets, ctx) });
  d.load({ hi: { id: 'hi', cam: 'two', lines: [{ who: 'vail', text: 'hello' }], choices: [],
    sets: [{ k: 'flag', name: 'academy.met.vail' }], next: null } });
  d.play('hi');
  d.next();
  eq(ctx.flags['academy.met.vail'], true, 'the flag the node sets is set');
}));
