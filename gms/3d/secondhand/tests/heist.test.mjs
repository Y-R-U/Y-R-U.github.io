import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Heist } from '../heist.js';

function recorded() { const h = new Heist(); h.wind(); h.tick(5); return h; }

test('a winding action occupies the player and records five seconds', () => {
  const h = new Heist();
  assert.equal(h.drop(), false); assert.equal(h.take(), false);
  h.wind(); h.tick(2);
  assert.equal(h.power, true); assert.equal(h.recording, true);
  assert.equal(h.drop(), false);
  h.seek(.5); assert.equal(h.time, 2); assert.equal(h.echo, false);
  h.tick(3); assert.equal(h.recording, false); assert.equal(h.playing, false); assert.equal(h.power, false);
});
test('rewinding frees the player while the recorded action powers the mechanism', () => {
  const h = recorded(); h.seek(.35);
  assert.equal(h.echo, true); assert.equal(h.power, true); assert.equal(h.canDrop, true);
  assert.equal(h.drop(), true); h.tick(3);
  assert.equal(h.open, true); assert.equal(h.take(), true); assert.equal(h.won, true);
});
test('seeking backwards restores intact glass and closed vault', () => {
  const h = recorded(); h.seek(.5); h.drop(); h.tick(3);
  assert.equal(h.open, true); assert.equal(h.impact, true);
  h.seek(.25); assert.equal(h.open, false); assert.equal(h.impact, false); assert.equal(h.canDrop, true);
});
test('counterweight event can be replaced before it has happened', () => {
  const h = recorded(); h.seek(2); h.drop(); h.tick(3);
  h.seek(.5); h.drop(); assert.equal(h.dropAt, .5);
  h.tick(.9); assert.equal(h.impact, true);
});
test('unrecorded future cannot be scrubbed into existence', () => {
  const h = recorded(); h.seek(60); assert.equal(h.time, 5); assert.equal(h.echo, false);
  h.seek(-3); assert.equal(h.time, 0); assert.equal(h.echo, true);
});
test('pause and resume preserve an unfinished recording', () => {
  const h = new Heist(); h.wind(); h.tick(2); h.playing = false; h.tick(4);
  assert.equal(h.time, 2); assert.equal(h.recording, true);
  h.playing = true; h.tick(3); assert.equal(h.time, 5); assert.equal(h.recording, false);
});
test('timeline stops at sixty seconds and can be recovered by rewinding', () => {
  const h = recorded(); h.playing = true; h.tick(90);
  assert.equal(h.time, 60); assert.equal(h.playing, false);
  h.seek(1); assert.equal(h.canDrop, true);
});
test('winning is idempotent and replay preserves all recorded events', () => {
  const h = recorded(); h.seek(.5); h.drop(); h.tick(3); h.take();
  assert.equal(h.take(), false); const takeAt = h.takeAt;
  h.seek(.1); assert.equal(h.drop(), false);
  h.replay(); assert.equal(h.time, 0); assert.equal(h.open, false);
  h.tick(takeAt); assert.equal(h.taken, true);
  h.tick(3); assert.equal(h.playing, false);
});
test('recording does not add an unrecorded sliver of future history', () => {
  const h = new Heist(); h.wind(); h.tick(5.08);
  assert.equal(h.time, 5); assert.equal(h.furthest, 5);
});
test('restart clears all events, playback and progression', () => {
  const h = recorded(); h.seek(.5); h.drop(); h.tick(3); h.take(); h.reset();
  assert.equal(h.time, 0); assert.equal(h.windAt, null); assert.equal(h.dropAt, null);
  assert.equal(h.won, false); assert.equal(h.echo, false); assert.equal(h.playing, false);
});
