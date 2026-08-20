import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootMode, playing, devRow } from './boot.js';

const MAIN = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const q = s => bootMode(new URLSearchParams(s));

test('a shot and the editor are not play, and nothing else is not play', () => {
  assert.equal(q('shot=street_dusk'), 'shot');
  assert.equal(q('editor=1'), 'editor');
  assert.equal(q('preset=high&dpr=1'), 'play');
  assert.equal(q(''), 'play');
  assert.equal(q('shot=x&editor=1'), 'shot', 'a shot wins, so the harness can never be diverted');
});

test('the dev row survives everywhere except play', () => {
  assert.equal(devRow('shot'), true);
  assert.equal(devRow('editor'), true);
  assert.equal(devRow('play'), false);
});

// The structural half of the ?shot= guarantee: there is exactly one construction site for the
// game layer, and it is behind the one boot decision.
test('main.js builds a session in exactly one place, and only when playing', () => {
  assert.equal(MAIN.match(/new Session\(/g).length, 1);
  assert.equal(MAIN.match(/new Slate\(/g).length, 1);
  const guard = MAIN.indexOf('} else if (playing(mode)) {');
  assert.ok(guard > 0, 'the play branch is guarded by playing(mode)');
  assert.ok(MAIN.indexOf('new Session(') > guard, 'the session is constructed after the guard');
  assert.ok(MAIN.indexOf('gameHost()') > guard, 'the #game host and its stylesheet too');
  assert.equal(playing('shot'), false);
});
