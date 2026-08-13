import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, AMBIENCE, atten, ids } from './sounds.js';
import { SFX } from '../../audio/js/sfx.js';
import { freshState } from '../../audio/js/triage.js';

const triage = freshState();

// audio/js/triage.js records Aaron's own listening verdicts. The `bad` bucket is a refusal, and
// the game may not quietly overrule it.
test('the game uses nothing from the bench\'s rejected bucket', () => {
  for (const id of ids()) {
    assert.ok(triage[id], `${id} is not a sound the bench has`);
    assert.notEqual(triage[id].bucket, 'bad', `${id} was rejected: ${triage[id].note}`);
  }
});

test('every override names a parameter the sound actually has', () => {
  for (const [event, s] of Object.entries({ ...SOUNDS, ...AMBIENCE })) {
    const params = SFX[s.id].params;
    for (const k of Object.keys(s.p)) {
      assert.ok(params[k], `${event} sets ${k}, which ${s.id} does not have`);
      assert.ok(s.p[k] >= params[k].min && s.p[k] <= params[k].max, `${event}.${k} = ${s.p[k]} is out of range`);
    }
  }
});

test('the bell Aaron liked is the Lantern Spire, and the shift horn is the same voice', () => {
  assert.equal(SOUNDS.bell.id, 'impactMetal');
  assert.equal(SOUNDS.horn.id, 'impactMetal');
  assert.ok(SOUNDS.horn.p.pitch < SOUNDS.bell.p.pitch);
  assert.ok(SOUNDS.horn.p.ring < SOUNDS.bell.p.ring);
});

test('attenuation is level-only, squared, and silent past the range', () => {
  assert.equal(atten(0, 40), 1);
  assert.equal(atten(40, 40), 0);
  assert.equal(atten(80, 40), 0);
  assert.equal(atten(20, 40), 0.25);
});
