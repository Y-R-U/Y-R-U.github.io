import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlocked, pins, cycle, schoolRows, sheetOf, playedText, outclassed } from './sheet.js';
import { blank } from './save.js';
import { xpToReach } from '../sim/xp.js';

const withXp = (obj) => { const d = blank(1); Object.assign(d.schools, obj); return d; };

test('a fresh character has exactly one school, and it is the one the game opens with', () => {
  assert.deepEqual(unlocked(blank(1)), ['kindle']);
  assert.deepEqual(pins(blank(1)), ['kindle']);
});

test('a school opens the first time it is trained, or when a quest grants it', () => {
  assert.deepEqual(unlocked(withXp({ line: 40 })), ['kindle', 'line']);
  const granted = blank(1);
  granted.flags['school.glamour'] = true;
  assert.ok(unlocked(granted).includes('glamour'));
});

test('the dial pads its three pins out of what is open and drops what is not', () => {
  const d = withXp({ line: 40, cull: 40, ward: 40 });
  d.pins = ['forage', 'cull'];
  assert.deepEqual(pins(d), ['cull', 'kindle', 'ward'], 'forage is not open, so it is dropped');
  assert.equal(cycle(d, 'cull'), 'kindle');
  assert.equal(cycle(d, 'ward'), 'cull', 'the cycle wraps');
});

test('a locked school is marked locked, never shown as level 0', () => {
  const rows = schoolRows(blank(1));
  const glamour = rows.find(r => r.id === 'glamour');
  assert.equal(glamour.locked, true);
  assert.equal(rows.find(r => r.id === 'kindle').locked, false);
});

test('the bar measures progress to the next level, never to the cap', () => {
  const d = withXp({ line: xpToReach(6) });
  const line = schoolRows(d).find(r => r.id === 'line');
  assert.equal(line.level, 6);
  assert.equal(line.frac, 0, 'a level just reached starts the next bar empty');
});

test('the sheet reads Grasp, standing bands and the truth count off the document', () => {
  const d = withXp({ line: xpToReach(6), cull: xpToReach(3) });
  d.standing.light = 26;
  d.truths = [{ id: 'overdraw', day: 2 }];
  const s = sheetOf(d, { truths: { overdraw: {}, cousin: {} } });
  assert.equal(s.grasp, 10 + 5 + 2, 'ten schools at level 1, plus Line 6 and Cull 3');
  assert.equal(s.standing.find(x => x.id === 'light').band, 'trusted');
  assert.deepEqual(s.truths, { known: 1, total: 2 });
  assert.equal(s.town.mark, '( )');
});

test('played time reads as hours and minutes', () => {
  assert.equal(playedText(7382), '2 h 03 m');
  assert.equal(playedText(90), '1 m');
});

test('the telegraph measures the band against Grasp / 10, not against a level', () => {
  const green = withXp({ line: xpToReach(6) });          // Grasp 15 — a yardstick of 1.5
  assert.equal(outclassed(green, 6), false, 'the countryside stays quiet');
  assert.equal(outclassed(green, 12), true);
  const grown = withXp(Object.fromEntries(['kindle', 'ward', 'cull', 'line'].map(s => [s, xpToReach(15)])));
  assert.equal(outclassed(grown, 12), false, 'the same road says nothing once you can walk it');
});
