import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { Barks, barkChoices, clipKey, clipFile, ledgerKeys, effectiveBarks } from './barks.js';
import { VERBS, runAction } from './actions.js';

const url = p => new URL(`../../${p}`, import.meta.url);
const barksDoc = JSON.parse(readFileSync(url('data/barks.json')));
const ledger = JSON.parse(readFileSync(url('data/vo.json')));
const cast = JSON.parse(readFileSync(url('data/characters.json'))).characters;

// A voice that records rather than decodes: js/game/voice.js is the real one and needs an
// AudioContext, but the thing under test is which key reaches it.
const spy = () => ({ said: [], say(line) { this.said.push(line); return clipFile(line.vo); } });
const rig = (o = {}) => {
  const voice = spy();
  let t = 0;
  const b = new Barks({ voice, cast, rnd: () => 0, now: () => t, ...o });
  b.setDocs(barksDoc, ledger);
  return { b, voice, tick: n => { t += n; } };
};

test('a key is the character, the category and a 1-based two-digit index', () => {
  eq(clipKey('greeter', 'greet', 0), 'greeter__greet__01');
  eq(clipFile('greeter__greet__01'), 'audio/vo/greeter__greet__01.ogg');
});

test('a character override replaces the shared list, never unions with it', () => {
  const c = { barks: { idle: ['mine'] } };
  eq(effectiveBarks({ shared: { idle: ['a', 'b'] } }, c).idle, ['mine']);
  eq(effectiveBarks({ shared: { idle: ['a', 'b'] } }, {}).idle, ['a', 'b']);
});

test('choices are the lines the ledger has an encoded clip for', () => {
  const doc = { shared: { idle: ['one', 'two', 'three'] } };
  const have = ledgerKeys({ clips: { x__idle__01: { encoded: true }, x__idle__03: { encoded: false } } });
  eq(barkChoices(doc, {}, 'x', 'idle', have).map(c => c.key), ['x__idle__01']);
  eq(barkChoices(doc, {}, 'x', 'idle', null).length, 3, 'no ledger means every line is a candidate');
});

test('the bark verb reaches ctx.bark with the action', () => {
  const seen = [];
  eq(runAction({ k: 'bark', who: 'greeter', category: 'idle' }, { bark: a => seen.push(a) }).ok, true);
  eq(seen.length, 1);
  eq(seen[0].who, 'greeter');
  // The wire this whole file exists for: an unwired ctx must stay a no-op, not a throw.
  eq(VERBS.bark({ k: 'bark', who: 'greeter' }, {}), null);
});

test('a bark plays a clip for the character that owns it', () => {
  const { b, voice } = rig();
  const key = b.say('greeter', 'greet');
  ok(!key.startsWith('-'), `refused: ${key}`);
  eq(voice.said.length, 1);
  eq(voice.said[0], { vo: key, who: 'greeter' });
  ok(ledger.clips[key], `${key} is not in the ledger`);
  ok(existsSync(url(clipFile(key))), `${clipFile(key)} is not on disk`);
});

test('a bark is silent while a conversation is open', () => {
  let talking = true;
  const { b, voice } = rig({ busy: () => talking });
  eq(b.say('greeter', 'greet'), '-busy');
  eq(voice.said.length, 0);
  talking = false;
  ok(!b.say('greeter', 'greet').startsWith('-'));
});

test('a character cannot bark again until its cooldown has run', () => {
  const { b, tick } = rig({ cooldown: 8 });
  ok(!b.say('greeter', 'greet').startsWith('-'));
  tick(7);
  eq(b.say('greeter', 'greet'), '-cooling down');
  tick(2);
  ok(!b.say('greeter', 'greet').startsWith('-'));
});

test('two characters do not chorus, even on their first bark', () => {
  const { b, tick } = rig();
  ok(!b.say('greeter', 'greet').startsWith('-'));
  eq(b.say('player', 'idle'), '-cooling down');
  tick(2);
  ok(!b.say('player', 'idle').startsWith('-'));
});

test('the same line is never picked twice running', () => {
  const { b, tick } = rig({ cooldown: 0, rnd: () => 0 });
  const keys = [];
  for (let i = 0; i < 4; i++) { keys.push(b.say('greeter', 'greet')); tick(2); }
  ok(keys.every(k => !k.startsWith('-')), keys.join(' '));
  for (let i = 1; i < keys.length; i++) ok(keys[i] !== keys[i - 1], `repeated ${keys[i]}`);
});

test('an unloaded, unknown or clipless bark is refused rather than thrown', () => {
  const cold = new Barks({ voice: spy(), cast });
  eq(cold.say('greeter', 'greet'), '-not loaded');
  const { b } = rig();
  eq(b.say('nobody', 'greet'), '-no such character');
  eq(b.say('greeter', 'nonsense'), '-unknown category');
  eq(b.say('narrator', 'greet'), '-nothing to say', 'narrator has no clips generated');
});

test('every bark clip the ledger claims is encoded is really on disk', () => {
  const keys = [...ledgerKeys(ledger)];
  ok(keys.length >= 90, `only ${keys.length} bark clips`);
  for (const k of keys) {
    ok(existsSync(url(clipFile(k))), `no clip at ${clipFile(k)}`);
    ok(statSync(url(clipFile(k))).size > 1000, `${clipFile(k)} is suspiciously small`);
  }
});
