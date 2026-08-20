import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slate, markOf, NOT_YET } from './towns.js';
import { blank } from './save.js';

const withDone = (...done) => { const d = blank(1); d.campaign.done = done; return d; };
const panel = (d, id) => slate(d).find(p => p.id === id);

// REVIEW §7 and STORY §11: the best foreshadowing in the game is free, and it is only free if
// the panel is a live button on the very first launch.
test('Longacre answers from the first launch and is never disabled', () => {
  const p = panel(blank(1), 'neutral');
  assert.equal(p.playable, false);
  assert.equal(p.reply, NOT_YET);
  assert.equal(p.state, 'dim', 'dim, not locked and not greyed out');
});

test('Blackstone is a silhouette until Whitewall is finished', () => {
  assert.equal(panel(blank(1), 'dark').state, 'shadow');
  assert.equal(panel(blank(1), 'dark').playable, false);
  assert.equal(panel(withDone('light'), 'dark').state, 'lit');
  assert.equal(panel(withDone('light'), 'dark').playable, true);
});

test('Longacre only opens once both other campaigns are done', () => {
  assert.equal(panel(withDone('light'), 'neutral').playable, false);
  assert.equal(panel(withDone('light'), 'neutral').reply, NOT_YET);
  const both = panel(withDone('light', 'dark'), 'neutral');
  assert.equal(both.playable, true);
  assert.equal(both.state, 'lit');
  assert.match(both.line, /Come in anyway/);
});

test('the three marks are the window heads, so the screen works without colour', () => {
  assert.deepEqual(['light', 'neutral', 'dark'].map(markOf), ['( )', '[ ]', '/\\']);
});
