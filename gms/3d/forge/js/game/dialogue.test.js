import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseDialogue, MAX_LINE, MAX_CHOICES } from './questdef.js';
import { open, current, advance, skip, visibleChoices, choose, effectsOf, run } from './dialogue.js';

const load = raw => {
  const r = normaliseDialogue(raw, { pack: 't' });
  assert.deepEqual(r.errors, []);
  return r.nodes;
};

test('a third line is structurally unwriteable', () => {
  const r = normaliseDialogue({ n: { lines: [['bel', 'one', 'two', 'three']] } });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /a bubble is two lines/);
  assert.deepEqual(normaliseDialogue({ n: { lines: [['bel', 'one', 'two']] } }).errors, []);
  assert.deepEqual(normaliseDialogue({ n: { lines: [['bel', 'one']] } }).errors, []);
});

test('lines over the bubble width and too many choices are rejected', () => {
  const long = 'x'.repeat(MAX_LINE + 1);
  assert.match(normaliseDialogue({ n: { lines: [['bel', long]] } }).errors[0], new RegExp(`max ${MAX_LINE}`));
  const four = { lines: [['bel', 'hm']], choices: [1, 2, 3, 4].map(i => ({ say: `${i}`, goto: null })) };
  assert.match(normaliseDialogue({ n: four }).errors[0], new RegExp(`max ${MAX_CHOICES}`));
});

test('bubbles walk in order and then finish', () => {
  const pack = load({ n: { lines: [['bel', 'one'], ['player', 'two'], ['bel', 'three']] } });
  let s = open(pack, 'n');
  assert.deepEqual(current(s), ['bel', 'one']);
  s = advance(s);
  assert.deepEqual(current(s), ['player', 'two']);
  s = advance(s); s = advance(s);
  assert.equal(s.done, true);
  assert.equal(current(s), null);
  assert.equal(advance(s), s, 'advancing a finished scene is a no-op');
});

test('skip jumps to the end, and the transcript loses nothing', () => {
  const pack = load({ n: { lines: [['bel', 'one'], ['bel', 'two'], ['bel', 'three']] } });
  const s = skip(open(pack, 'n'));
  assert.equal(s.done, true);
  assert.deepEqual(run(pack, 'n').lines.length, 3);
});

test('choices are filtered by the same evaluator quests use', () => {
  const pack = load({
    price: {
      lines: [['wick_ww', 'Five marks the lot.']],
      choices: [
        { say: 'Five is fine.', goto: 'take' },
        { say: 'Seven.', goto: 'push', if: ['level', 'barter', 4] },
        { say: 'I will come back.', goto: null },
      ],
    },
    take: { lines: [['wick_ww', 'Five it is.']] },
    push: { lines: [['wick_ww', 'Six, then.']] },
  });
  const poor = { schools: { barter: 0 } };
  const rich = { schools: { barter: 900 } };
  assert.deepEqual(visibleChoices(pack.price, poor).map(c => c.say), ['Five is fine.', 'I will come back.']);
  assert.equal(visibleChoices(pack.price, rich).length, 3);

  const s = advance(open(pack, 'price', poor), poor);
  assert.equal(s.choosing, true);
  assert.equal(choose(s, 1, poor).goto, null, 'the second visible choice is the walk-away');
  assert.equal(choose(s, 0, poor).goto, 'take');
});

test('a node marked once will not open twice', () => {
  const pack = load({ n: { once: true, lines: [['bel', 'only now']] } });
  assert.ok(open(pack, 'n', { seen: [] }));
  assert.equal(open(pack, 'n', { seen: ['n'] }), null);
  assert.equal(open(pack, 'missing'), null);
});

test('sets and mark become effects when the node completes', () => {
  const pack = load({ n: { lines: [['bel', 'hm']], sets: [['flag', 'told', true]], mark: 'overdraw' } });
  assert.deepEqual(effectsOf(pack.n), [['flag', 'told', true], ['truth', 'overdraw']]);
});

test('run walks a branching scene and collects both lines and effects', () => {
  const pack = load({
    price: {
      lines: [['wick_ww', 'Five marks the lot.'], ['player', 'The post is from Tuesday.']],
      choices: [{ say: 'Five is fine.', goto: 'take' }, { say: 'Seven.', goto: 'push' }],
    },
    take: { lines: [['wick_ww', 'Five it is.']], sets: [['flag', 'haggled', false]] },
    push: { lines: [['wick_ww', 'Six, then.']], sets: [['flag', 'haggled', true]] },
  });
  const a = run(pack, 'price', {}, [0]);
  assert.deepEqual(a.visited, ['price', 'take']);
  assert.equal(a.lines.length, 3);
  assert.deepEqual(a.effects, [['flag', 'haggled', false]]);

  const b = run(pack, 'price', {}, [1]);
  assert.deepEqual(b.visited, ['price', 'push']);
  assert.deepEqual(b.effects, [['flag', 'haggled', true]]);
});

test('a node with no lines is a pure branch point', () => {
  const pack = load({
    fork: { lines: [['bel', '…']], choices: [{ say: 'left', goto: 'l' }, { say: 'right', goto: 'r' }] },
    l: { lines: [['bel', 'left']] },
    r: { lines: [['bel', 'right']] },
  });
  const s = advance(open(pack, 'fork'));
  assert.equal(s.choosing, true);
  assert.equal(current(s), null);
});
