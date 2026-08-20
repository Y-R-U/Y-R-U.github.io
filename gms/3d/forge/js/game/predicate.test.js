import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalPred, validatePred, findLevelTerms, inWindow, TERMS } from './predicate.js';
import { xpToReach } from '../sim/xp.js';

const ctx = {
  quests: { 'light.01': { s: 'done' }, 'light.02': { s: 'active' } },
  flags: { 'sold.once': true, 'price.taken': 'five' },
  truths: ['overdraw'],
  schools: { cull: xpToReach(4), barter: 0 },
  standing: { light: 26, dark: -12 },
  items: { silverling: 4 },
  marks: 218,
  campaign: { current: 'light', act: 2, done: [] },
  worn: null,
  day: 23,
  hour: 22.5,
  damageDealt: 0,
};

test('quest, flag and truth terms', () => {
  assert.equal(evalPred(['quest', 'light.01', 'done'], ctx), true);
  assert.equal(evalPred(['quest', 'light.02', 'done'], ctx), false);
  assert.equal(evalPred(['quest', 'light.09', 'hidden'], ctx), true, 'an unstarted quest is hidden');
  assert.equal(evalPred(['flag', 'sold.once'], ctx), true);
  assert.equal(evalPred(['flag', 'price.taken', 'five'], ctx), true);
  assert.equal(evalPred(['flag', 'price.taken', 'seven'], ctx), false);
  assert.equal(evalPred(['flag', 'never.set'], ctx), false);
  assert.equal(evalPred(['truth', 'overdraw'], ctx), true);
  assert.equal(evalPred(['truth', 'wagon.eighth'], ctx), false);
});

test('level, standing, item and marks', () => {
  assert.equal(evalPred(['level', 'cull', 4], ctx), true);
  assert.equal(evalPred(['level', 'cull', 5], ctx), false);
  assert.equal(evalPred(['level', 'barter', 1], ctx), true, 'level 1 is the floor, not a gate');
  assert.equal(evalPred(['standing', 'light', 25], ctx), true);
  assert.equal(evalPred(['standing', 'dark', 0], ctx), false);
  assert.equal(evalPred(['item', 'silverling', 4], ctx), true);
  assert.equal(evalPred(['item', 'silverling', 5], ctx), false);
  assert.equal(evalPred(['mk', 200], ctx), true);
});

test('all, any and not compose', () => {
  assert.equal(evalPred(['all'], ctx), true, 'an empty all is always true');
  assert.equal(evalPred(['any'], ctx), false);
  assert.equal(evalPred(['not', ['worn', 'dark']], ctx), true);
  assert.equal(evalPred(['all',
    ['quest', 'light.01', 'done'],
    ['any', ['flag', 'read.ledger'], ['truth', 'overdraw']],
    ['not', ['worn', 'dark']]], ctx), true);
});

test('the eighth-day test and the hour window', () => {
  assert.equal(evalPred(['day', '%', 8], { day: 7 }), true);
  assert.equal(evalPred(['day', '%', 8], { day: 15 }), true);
  assert.equal(evalPred(['day', '%', 8], { day: 8 }), false);
  assert.equal(evalPred(['day', '>=', 20], ctx), true);
  assert.equal(inWindow(22.5, 21, 5), true, 'the night watch window wraps midnight');
  assert.equal(inWindow(6, 21, 5), false);
  assert.equal(evalPred(['hour', 21, 5], ctx), true);
  assert.equal(evalPred(['hour', 12, 14], ctx), false);
});

test('junk is false, never a throw', () => {
  for (const junk of [null, undefined, 0, 'flag', {}, [], ['nope'], ['level']]) {
    assert.doesNotThrow(() => evalPred(junk, ctx));
  }
  assert.equal(evalPred(['nope', 1], ctx), false);
  assert.equal(evalPred(undefined, ctx), true, 'an absent predicate means no condition');
});

test('validatePred catches arity, unknown terms and bad enums', () => {
  assert.deepEqual(validatePred(['quest', 'light.01', 'done']), []);
  assert.match(validatePred(['quest', 'light.01'])[0], /takes 2 args/);
  assert.match(validatePred(['nope'])[0], /unknown term/);
  assert.match(validatePred(['quest', 'light.01', 'finished'])[0], /must be one of/);
  assert.match(validatePred(['level', 'cooking', 3])[0], /must be one of/);
  assert.match(validatePred(['all', ['nope']])[0], /unknown term/);
  assert.match(validatePred('flag')[0], /must be an array/);
});

test('a quest prereq may never reference how strong the player is', () => {
  assert.deepEqual(findLevelTerms(['quest', 'light.01', 'done']), []);
  assert.match(findLevelTerms(['level', 'cull', 3])[0], /may not appear in a quest prereq/);
  assert.match(findLevelTerms(['all', ['quest', 'light.01', 'done'], ['attunement', 40]])[0], /attunement/);
  assert.equal(Object.values(TERMS).filter(t => t.level).length, 2, 'level and attunement are the two');
});
