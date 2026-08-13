import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankJournal, award, known, truthChains, count, appendLog, logScenes, questList, LOG_MAX } from './journal.js';
import { normaliseQuests } from './questdef.js';
import { blankState, step, progress } from './quest.js';

const CATALOGUE = JSON.parse(readFileSync(new URL('../../data/truths.json', import.meta.url), 'utf8'));

const defs = {
  a: { text: 'A is so.', campaign: 'light' },
  b: { text: 'A was never so.', campaign: 'dark', supersedes: 'a' },
  c: { text: 'Here is what A was.', campaign: 'neutral', supersedes: 'b' },
  x: { text: 'X is so.', campaign: 'light' },
  y: { text: 'Y is so.', campaign: 'dark' },
  z: { text: 'X and Y were one thing.', campaign: 'neutral', supersedes: ['x', 'y'] },
};

const give = (j, ids, defsIn = defs) =>
  ids.reduce((acc, id, i) => award(acc, id, defsIn, { day: (i + 1) * 10 }), j);

test('a Truth is awarded once and carries its stamp', () => {
  let j = award(blankJournal(), 'a', defs, { day: 22, campaign: 'light', quest: 'light.10', scene: 'n1' });
  assert.deepEqual(j.truths, [{ id: 'a', day: 22, campaign: 'light', quest: 'light.10', scene: 'n1' }]);
  assert.equal(known(j, 'a'), true);
  assert.equal(award(j, 'a', defs, { day: 40 }).truths.length, 1, 'awarding twice changes nothing');
});

test('the campaign is taken from the catalogue when the caller does not say', () => {
  const j = award(blankJournal(), 'b', defs, { day: 5 });
  assert.equal(j.truths[0].campaign, 'dark');
});

test('the ring is the Truth s own campaign, not the one it was learned in', () => {
  const j = award(blankJournal(), 'b', defs, { day: 5, campaign: 'light' });
  const row = truthChains(j, defs)[0][0];
  assert.equal(row.campaign, 'dark', 'a Dark Truth reads as Dark wherever it was picked up');
  assert.equal(row.earned, 'light');
});

test('overturning keeps the old Truth and stamps it — it is never deleted', () => {
  const j = give(blankJournal(), ['a', 'b']);
  assert.equal(j.truths.length, 2);
  const old = j.truths.find(t => t.id === 'a');
  assert.deepEqual(old.superseded, { by: 'b', day: 20, campaign: 'dark' });
  assert.equal(old.day, 10, 'the original award day survives');
});

test('a chain renders every earlier line struck through with the live one last', () => {
  const chains = truthChains(give(blankJournal(), ['a', 'b', 'c']), defs);
  assert.equal(chains.length, 1, 'a three-link chain is one block, not three');
  assert.deepEqual(chains[0].map(r => [r.id, r.struck]), [['a', true], ['b', true], ['c', false]]);
  assert.deepEqual(chains[0].map(r => r.text),
    ['A is so.', 'A was never so.', 'Here is what A was.']);
  assert.deepEqual(chains[0].map(r => r.campaign), ['light', 'dark', 'neutral']);
});

test('nothing is struck until the Truth that overturns it is actually known', () => {
  const chains = truthChains(give(blankJournal(), ['a']), defs);
  assert.deepEqual(chains[0].map(r => r.struck), [false]);
});

test('a Truth known out of order still reads as its own line', () => {
  // Awarded b first (a Dark playthrough before the Light one is impossible, but data can be odd).
  const chains = truthChains(give(blankJournal(), ['b']), defs);
  assert.deepEqual(chains.map(c => c.map(r => r.id)), [['b']]);
});

test('one Truth can overturn two', () => {
  const j = give(blankJournal(), ['x', 'y', 'z']);
  const chains = truthChains(j, defs);
  assert.equal(chains.length, 1);
  assert.equal(chains[0].filter(r => r.struck).length, 2);
  assert.equal(chains[0][chains[0].length - 1].id, 'z');
  assert.ok(j.truths.filter(t => t.superseded?.by === 'z').length === 2);
});

test('unknown Truths render as their raw id rather than vanishing', () => {
  const j = award(blankJournal(), 'gone.from.the.build', {}, { day: 3 });
  assert.equal(truthChains(j, {})[0][0].text, 'gone.from.the.build');
});

test('the count is known over the whole catalogue', () => {
  assert.deepEqual(count(give(blankJournal(), ['a', 'b']), defs), { known: 2, total: 6 });
});

test('the shipped catalogue chains cleanly and every link resolves', () => {
  const ids = Object.keys(CATALOGUE);
  assert.equal(ids.length, 34, 'STORY §8.5 awards thirty-four Truths');
  const j = ids.reduce((acc, id, i) => award(acc, id, CATALOGUE, { day: i }), blankJournal());
  const chains = truthChains(j, CATALOGUE);
  const struck = chains.flat().filter(r => r.struck);
  assert.equal(struck.length, 23, 'twenty-three Truths are overturned across the trilogy');
  assert.equal(chains.length, 11, 'STORY §8.5 draws eleven chains');
  for (const c of chains) assert.equal(c[c.length - 1].struck, false, 'a chain always ends live');
  assert.equal(chains.flat().length, ids.length, 'every Truth appears exactly once');

  const vail = chains.find(c => c[0].id === 'vail.dead');
  assert.deepEqual(vail.map(r => r.id), ['vail.dead', 'vail.arrives.dead', 'vail.alive.above']);
  const overdraw = chains.find(c => c[0].id === 'overdraw');
  assert.deepEqual(overdraw.map(r => r.id), ['overdraw', 'thirty.years', 'covenant.wrong']);

  // The widest components: three deep and three wide, with one Truth striking three at once.
  const raids = chains.find(c => c.some(r => r.id === 'prices.raids'));
  assert.equal(raids.length, 6);
  assert.equal(raids[raids.length - 1].id, 'prices.raids');
  const root = chains.find(c => c.some(r => r.id === 'root.longacre'));
  assert.equal(root.length, 5);
  assert.equal(root[root.length - 1].id, 'root.longacre');
});

test('the log keeps the last 200 lines, grouped by scene and day', () => {
  let j = blankJournal();
  j = appendLog(j, { day: 1, scene: 's1', line: ['bel', 'one'] });
  j = appendLog(j, { day: 1, scene: 's1', line: ['bel', 'two'] });
  j = appendLog(j, { day: 2, scene: 's2', line: ['rell', 'three'] });
  assert.deepEqual(logScenes(j).map(s => [s.scene, s.lines.length]), [['s1', 2], ['s2', 1]]);

  for (let i = 0; i < LOG_MAX + 40; i++) j = appendLog(j, { day: 3, scene: 's3', line: ['bel', `${i}`] });
  assert.equal(j.log.length, LOG_MAX);
  assert.equal(j.log[j.log.length - 1].line[1], `${LOG_MAX + 39}`);
});

test('the quest list puts the tracked quest first and finished ones last', () => {
  const { defs: qd } = normaliseQuests([
    { id: 'a', title: 'A', summary: 's', steps: [{ id: 's', do: ['goto', 'x'], text: 'go' }] },
    { id: 'b', title: 'B', summary: 's', steps: [{ id: 's', do: ['goto', 'y'], text: 'go' }] },
    { id: 'c', title: 'C', summary: 's', board: { school: 'cull', weight: 1 },
      steps: [{ id: 's', do: ['goto', 'z'], text: 'go' }] },
  ], { pack: '' });

  let state = blankState();
  for (const e of [{ t: 'accept', id: 'a' }, { t: 'accept', id: 'b' }, { t: 'accept', id: 'c' },
    { t: 'enter', area: 'x' }, { t: 'track', id: 'b' }]) {
    state = step(qd, state, e, {}).state;
  }
  const rows = questList(qd, state, id => progress(qd, state, id));
  assert.equal(rows[0].id, 'b');
  assert.equal(rows[0].tracked, true);
  assert.equal(rows[rows.length - 1].id, 'a', 'the finished one sorts last');
  assert.equal(rows.find(r => r.id === 'c').board, true);
});
