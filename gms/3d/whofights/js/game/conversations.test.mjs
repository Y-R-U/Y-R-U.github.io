import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { run, open, visibleChoices } from './dialogue.js';
import { validateAction } from './actions.js';
import { normaliseCast } from './characters.js';

const pack = JSON.parse(readFileSync(new URL('../../data/conversations.json', import.meta.url))).nodes;
const cast = normaliseCast(JSON.parse(readFileSync(new URL('../../data/characters.json', import.meta.url)))).cast;
const ids = Object.keys(pack);

test('every line speaks as a character that exists', () => {
  for (const [id, n] of Object.entries(pack)) {
    for (const l of n.lines) ok(cast[l.who], `${id}: unknown speaker "${l.who}"`);
  }
});

test('every goto and every `next` lands on a real node', () => {
  for (const [id, n] of Object.entries(pack)) {
    if (n.next) ok(pack[n.next], `${id}: next → missing ${n.next}`);
    for (const c of n.choices || []) {
      if (c.goto) ok(pack[c.goto], `${id}: choice → missing ${c.goto}`);
    }
  }
});

test('every `sets` effect is a valid action', () => {
  for (const [id, n] of Object.entries(pack)) {
    for (const a of n.sets || []) eq(validateAction(a, id), []);
    for (const c of n.choices || []) for (const a of c.sets || []) eq(validateAction(a, id), []);
  }
});

test('the greeter conversation is a worked example, not a stub', () => {
  const root = pack['academy.greeter.hello'];
  ok(root, 'the hotspot in academy.json says this node');
  ok(root.lines.length > 1, 'more than one line');
  ok(root.choices.length >= 2, 'it branches');
  ok(root.choices.some(c => (c.sets || []).length), 'a choice has an effect');
  ok(root.lines.some(l => l.who === 'narrator'), 'the narrator is used');
  ok(ids.length >= 4, 'there is somewhere for the branches to go');
});

test('taking the first choice every time walks to an end', () => {
  const r = run(pack, 'academy.greeter.hello', {}, [0, 0, 0, 0, 0]);
  ok(r.lines.length >= 4, `walked ${r.lines.length} lines`);
  ok(r.effects.some(a => a.k === 'flag'), 'flags were set on the way through');
});

test('a choice gated on a flag only appears once that flag is set', () => {
  const n = pack['academy.greeter.newadventures'];
  const gated = n.choices.find(c => c.if);
  ok(gated, 'the example keeps one gated choice');
  const before = visibleChoices(n, { flags: {} }).length;
  const after = visibleChoices(n, { flags: { 'academy.knows.vail': true } }).length;
  eq(after, before - 1, 'the gate closes once the player already knows');
});

test('a `once` node will not reopen', () => {
  ok(open(pack, 'academy.greeter.hello', { seen: [] }));
  eq(open(pack, 'academy.greeter.hello', { seen: ['academy.greeter.hello'] }), null);
});
