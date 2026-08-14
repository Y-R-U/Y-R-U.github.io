import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS, next, settle } from './onboard.js';

test('the whole script is nine short lines or fewer', () => {
  assert.ok(PROMPTS.length <= 9, `${PROMPTS.length} prompts`);
  for (const p of PROMPTS) {
    const words = p.text.split(' ').length;
    assert.ok(words >= 3 && words <= 6, `"${p.text}" is ${words} words`);
  }
});

test('the first ninety seconds arrive in the taught order', () => {
  const ctx = { target: true };
  assert.equal(next(ctx, {}).id, 'look');
  ctx.looked = true;
  assert.equal(next(ctx, {}).id, 'move');
  ctx.moved = true;
  assert.equal(next(ctx, {}).id, 'cast');
  ctx.cast = true;
  ctx.cleared = true;
  assert.equal(next(ctx, {}).id, 'door');
});

test('a player who only walks is still taught the stick', () => {
  // The whole script used to stall here: `move` was gated behind `cast`, which was gated behind
  // an NPC standing within 4 m, so a cold start with nobody in range taught nothing but `look`.
  const alone = { looked: true };
  assert.equal(next(alone, {}).id, 'move');
  assert.equal(next({ looked: true, moved: true }, {}), null, 'no target, no cast prompt');
  assert.equal(next({ looked: true, cast: true, moved: true }, {}), null, 'the room is not clear yet');
});

test('the left-handed offer rides on the move prompt, which is the only moment it matters', () => {
  assert.equal(PROMPTS.find(p => p.side).id, 'move');
});

test('a gesture already performed is retired without ever being shown', () => {
  const done = settle({ looked: true, cast: true, moved: true }, {});
  assert.deepEqual(done, { look: true, cast: true, move: true });
  assert.equal(next({ looked: true, cast: true, moved: true, cleared: true }, done).id, 'door');
});

test('a flag from a previous save suppresses the prompt forever', () => {
  assert.equal(next({}, { look: true }).id, 'move', 'look is gone, the next one is not');
  assert.equal(next({}, { look: true, move: true }), null, 'nothing else is armed yet');
});
