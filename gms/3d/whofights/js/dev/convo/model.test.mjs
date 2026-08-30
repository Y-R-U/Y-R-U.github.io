import { test, eq, ok } from '../../../tools/harness.mjs';
import { blankNode, nodeProblems, newCharacter, promote, placeNearStart, move, uniqueId, voName, flagNames } from './model.js';
import { VOICES } from './voices.js';

const cast = { greeter: { name: 'Vail', body: 'robed' }, narrator: { name: 'Narrator', body: 'none' } };
const doc = { nodes: { here: {}, there: {} } };

test('a blank node is a valid empty node, and says so', () => {
  const n = blankNode('test');
  eq(n.lines, []);
  eq(n.choices, []);
  eq(n.next, null);
  ok(nodeProblems('x', n, doc, cast).some(p => p.includes('nothing happens')));
});

test('a good node has no problems', () => {
  const n = { ...blankNode('ok'), lines: [{ who: 'greeter', text: 'Hello.', vo: 'greeter_01' }] };
  eq(nodeProblems('x', n, doc, cast), []);
});

test('an unknown speaker, empty text and a dangling goto are all caught', () => {
  const n = { ...blankNode(), lines: [{ who: 'nobody', text: '' }], choices: [{ say: 'go', goto: 'gone' }] };
  const p = nodeProblems('x', n, doc, cast);
  ok(p.some(s => s.includes('unknown speaker')));
  ok(p.some(s => s.includes('no text')));
  ok(p.some(s => s.includes('missing node gone')));
});

test('a predicate the evaluator does not know is a problem, not a silent no-op', () => {
  const n = { ...blankNode(), lines: [{ who: 'greeter', text: 'hi' }],
    choices: [{ say: 'a', goto: 'here', if: ['standing', 'guild', 3] }] };
  ok(nodeProblems('x', n, doc, cast).some(s => s.includes('unknown term')));
});

test('a `sets` entry that is not a contract action is a problem', () => {
  const n = { ...blankNode(), lines: [{ who: 'greeter', text: 'hi' }], sets: [{ k: 'teleport', to: 'moon' }] };
  ok(nodeProblems('x', n, doc, cast).some(s => s.includes('unknown action')));
});

test('a cam the dialogue box has no arm for is caught', () => {
  const n = { ...blankNode(), cam: 'crane', lines: [{ who: 'greeter', text: 'hi' }] };
  ok(nodeProblems('x', n, doc, cast).some(s => s.includes('cam')));
});

test('a new simple NPC is an ordinary character with no body', () => {
  const { id, record } = newCharacter({ name: 'Stable hand', voice: 'bf_emma', taken: cast });
  eq(id, 'stable_hand');
  eq(record.body, 'none');
  eq(record.voice, 'bf_emma');
  eq(record.name, 'Stable hand');
  ok(!record.place, 'no body means nowhere to stand');
});

test('a narrator is the same record, not a second type', () => {
  const { record } = newCharacter({ name: 'Narrator', voice: 'bm_fable', taken: {} });
  eq(Object.keys(record).sort(), ['body', 'name', 'voice', 'voiceSpeed']);
});

test('an unknown voice falls back rather than being written into the file', () => {
  const { record } = newCharacter({ name: 'X', voice: 'qq_nope', taken: {} });
  ok(VOICES.includes(record.voice));
});

test('an id collision gets a suffix instead of overwriting somebody', () => {
  const taken = { narrator: {}, narrator_2: {} };
  eq(newCharacter({ name: 'Narrator', taken }).id, 'narrator_3');
  eq(uniqueId('academy.hello', { 'academy.hello': 1 }), 'academy.hello.2');
});

test('promotion is exactly body: robed plus a place', () => {
  const before = { name: 'Narrator', body: 'none', voice: 'bm_fable', voiceSpeed: 1 };
  const after = promote(before, { level: 'academy', x: 1.234, z: -2, yaw: 0 });
  eq(after.body, 'robed');
  eq(after.place, { level: 'academy', x: 1.23, z: -2, yaw: 0 });
  eq(after.voice, before.voice, 'nothing else changes');
  eq(after.name, before.name);
});

test('promotion without a level is refused', () => {
  eq(promote({ name: 'x', body: 'none' }, { x: 0, z: 0 }), null);
});

test('the default place is in front of the level start, facing back at the player', () => {
  const p = placeNearStart('academy', { x: -9, z: 21, yaw: Math.PI });
  eq(p.level, 'academy');
  eq(p.z, 16, 'five metres along the way the player is looking');
  eq(p.x, -9);
  eq(p.yaw, 0, 'turned round to face them');
});

test('moving a line keeps every other line and their order', () => {
  eq(move(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  eq(move(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  eq(move(['a', 'b'], 0, 9), ['a', 'b'], 'an out-of-range move changes nothing');
});

test('a vo basename survives the filename charset', () => {
  eq(voName('academy.greeter.hello', 0), 'academy_greeter_hello_01');
  ok(/^[A-Za-z0-9._-]+$/.test(voName('a b/c', 11)));
});

test('every flag the pack touches is offered to the preview', () => {
  const nodes = {
    a: { lines: [], sets: [{ k: 'flag', name: 'met.vail', value: true }],
      choices: [{ say: 'x', goto: 'a', if: ['not', ['flag', 'knows.vail']], sets: [{ k: 'flag', name: 'brushed', value: true }] }] },
  };
  eq(flagNames(nodes), ['brushed', 'knows.vail', 'met.vail']);
});
