import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rows, quote, unitOf, pipsOf, barsOf, itemName } from './sale.js';
import { blank, addItem } from './save.js';
import { sellPrice, glut } from '../sim/economy.js';

function stall(items = [['silverling', 5], ['rat_tail', 8]], sold = {}) {
  const d = blank(1);
  for (const [id, n] of items) addItem(d, id, n);
  d.ledger.sold = sold;
  return d;
}

test('only things with a value are sellable, richest first', () => {
  const d = stall([['silverling', 5], ['rat_tail', 8], ['hearth_ash', 2]]);
  assert.deepEqual(rows(d).map(r => r.id), ['silverling', 'rat_tail']);
  assert.equal(itemName('rat_tail'), 'Rat tail');
});

test('freshness is pips on perishables and nothing at all on the rest', () => {
  const now = 1e12;
  const d = stall();
  d.items.find(e => e.id === 'silverling').caught = now - 10 * 60000;
  const list = rows(d, { now });
  assert.equal(list.find(r => r.id === 'silverling').pips, 3, 'ten minutes old is halfway down');
  assert.equal(list.find(r => r.id === 'rat_tail').pips, null);
});

test('pips never read as zero, and the sparkline rises as the stall fills', () => {
  assert.equal(pipsOf(1), 5);
  assert.equal(pipsOf(0.5), 1);
  const empty = barsOf(0, 1);
  assert.equal(empty[0], 0);
  assert.deepEqual(empty, [...empty].sort((a, b) => a - b), 'never falls left to right');
  assert.ok(barsOf(24, 1)[0] > empty[4], 'a stall already loaded reads fuller than an empty one');
});

// §6.5: the price has to move while the player is ticking rows, or the sale reads as a cheat.
test('the unit price falls across a stack as the glut ledger fills', () => {
  const d = stall();
  const list = rows(d);
  const q = quote(list, ['rat_tail'], d);
  const line = q.lines[0];
  assert.equal(line.units.length, 8);
  assert.ok(line.units[7].price <= line.units[0].price);
  assert.equal(line.units[0].price, sellPrice(3, 1, 1, glut(0, 1)));
  assert.equal(line.units[7].price, sellPrice(3, 1, 1, glut(7, 1)));
});

test('glut is cumulative across ticked rows and is never written back until the sale', () => {
  const d = stall();
  const before = JSON.stringify(d.ledger);
  const q = quote(rows(d), ['silverling', 'rat_tail'], d);
  assert.equal(q.items, 13);
  assert.equal(q.ledger.sold['light:rat_tail'], 8);
  assert.equal(JSON.stringify(d.ledger), before, 'the document is untouched');
});

test('a stall that already sold today pays less for the same fish', () => {
  const fresh = quote(rows(stall()), ['silverling'], stall()).marks;
  const tired = stall([['silverling', 5]], { 'light:silverling': 20 });
  assert.ok(quote(rows(tired), ['silverling'], tired).marks < fresh);
});

test('the row price shown is what that row fetches given everything above it', () => {
  const d = stall();
  const list = rows(d);
  assert.equal(unitOf(list, [], d, {}, 'silverling'), sellPrice(12, 1, 1, glut(0, 1)));
});

test('a haggle adds SYSTEMS §7\'s twelve per cent and nothing else', () => {
  const d = stall();
  const plain = quote(rows(d), ['silverling'], d);
  const haggled = quote(rows(d), ['silverling'], d, { haggle: true });
  assert.equal(haggled.bonus, Math.round(plain.marks * 0.12));
  assert.equal(haggled.marks, plain.marks + haggled.bonus);
});
