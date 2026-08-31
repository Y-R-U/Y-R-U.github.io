import { test, eq, ok } from '../../tools/harness.mjs';
import { blank, normalise, docView, parseAt, startPos } from './save.js';

// The debug Save panel's slot load is `Object.assign(doc, r.doc)`, and normalise() always mints a
// fresh flags object — so a context that captured the old one wrote flags nothing ever read.
test('the context follows a document whose flags were replaced under it', () => {
  const doc = blank(0);
  const ctx = docView(() => doc);
  doc.flags.before = true;
  Object.assign(doc, normalise({ version: 1, flags: { after: true } }).doc);
  eq(ctx.flags, { after: true }, 'the live flags, not the orphan');
  ctx.flags.written = true;
  eq(doc.flags.written, true, 'a flag written through the context lands in the document');
  eq(ctx.world().flags.written, true, 'and the predicate layer sees it');
});

test('the context reads items and quests off the live document too', () => {
  const doc = blank(0);
  const ctx = docView(() => doc);
  Object.assign(doc, normalise({ version: 1, items: { coin: 3 }, quests: { q: { s: 'active' } } }).doc);
  eq(ctx.world().items, { coin: 3 });
  eq(ctx.world().quests, { q: { s: 'active', n: 0 } });
});

test('?at= parses x,z and an optional yaw', () => {
  eq(parseAt('1,2,3'), { x: 1, z: 2, yaw: 3 });
  eq(parseAt('-4.5,6'), { x: -4.5, z: 6, yaw: 0 });
  eq(parseAt(''), null);
  eq(parseAt('1'), null);
  eq(parseAt('1,2,3,4'), null);
  eq(parseAt('1,here'), null);
  eq(parseAt(null), null);
});

test('an explicit at beats the save, which beats the level start', () => {
  const start = { x: 0, z: 0, yaw: 0 };
  const at = { x: 9, z: 9, yaw: 1 };
  const saved = { level: 'academy', at: { x: 5, z: 5, yaw: 2 } };
  eq(startPos(start, at, saved, 'academy'), at);
  eq(startPos(start, null, saved, 'academy'), saved.at, 'the save resumes where it left off');
  eq(startPos(start, null, saved, 'yard'), start, 'a position from another level is not ours');
  eq(startPos(start, null, { level: 'academy', at: null }, 'academy'), start);
  eq(startPos(start, null, null, 'academy'), start);
});

test('normalise keeps a written position and drops a junk one', () => {
  eq(normalise({ version: 1, at: { x: 2, z: '3' } }).doc.at, { x: 2, z: 3, yaw: 0 });
  eq(normalise({ version: 1, at: 'over there' }).doc.at, null);
  ok(!normalise({ version: 9 }).doc);
});
