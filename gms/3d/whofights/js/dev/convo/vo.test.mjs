import { test, eq, ok } from '../../../tools/harness.mjs';
import { voHash, lineHash, ttsJob, makeCache, clipState } from './vo.js';
import { voiceGroups, voiceInfo, VOICES } from './voices.js';

const fakeStore = () => {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
};

test('the hash covers text, voice, speed and pitch — and nothing else', () => {
  const base = voHash('Hello.', 'am_echo', 1, 0);
  eq(voHash('Hello.', 'am_echo', 1, 0), base);
  ok(voHash('Hello!', 'am_echo', 1, 0) !== base);
  ok(voHash('Hello.', 'bm_fable', 1, 0) !== base);
  ok(voHash('Hello.', 'am_echo', 1.1, 0) !== base);
  ok(voHash('Hello.', 'am_echo', 1, 2) !== base);
});

test('a line hashes with its speaker defaults', () => {
  eq(lineHash({ text: 'Hi' }, { voice: 'am_echo' }), voHash('Hi', 'am_echo', 1, 0));
});

test('a tts job carries the speaker voice and speed', () => {
  eq(ttsJob({ text: 'Hi' }, { voice: 'bf_emma', voiceSpeed: 0.98 }, 'out_01'),
    { voice: 'bf_emma', text: 'Hi', speed: 0.98, out: 'out_01' });
});

test('a pitched voice is synthesised as a speed change, the way the character tab does it', () => {
  const job = ttsJob({ text: 'Hi' }, { voice: 'bm_fable', voiceSpeed: 1, voicePitch: -2 }, 'out_01');
  ok(job.speed > 1, `pitch down means synthesising faster, got ${job.speed}`);
  eq(ttsJob({ text: 'Hi' }, { voice: 'bm_fable', voiceSpeed: 1, voicePitch: 0 }, 'o').speed, 1);
});

test('the hash agrees with the one the character tab writes into data/vo.json', () => {
  eq(lineHash({ text: 'Well. That is a lot of teeth.' }, { voice: 'am_echo', voiceSpeed: 1, voicePitch: 0 }),
    '932e5b2c', 'the recorded hash of player__spot__01');
});

test('there is no job for a speaker with no voice, or a line with no words', () => {
  eq(ttsJob({ text: 'Hi' }, { name: 'mute' }, 'x'), null);
  eq(ttsJob({ text: '   ' }, { voice: 'am_echo' }, 'x'), null);
});

test('a clip is only fresh when the words that made it are the words on screen', () => {
  const cache = makeCache(fakeStore());
  const who = { voice: 'am_echo' };
  const line = { text: 'Hello.', vo: 'a_01' };
  const onDisk = new Set(['a_01']);
  eq(clipState({ line, character: who, cache, onDisk }), 'unknown');
  cache.set('a_01', lineHash(line, who));
  eq(clipState({ line, character: who, cache, onDisk }), 'fresh');
  eq(clipState({ line: { ...line, text: 'Hello!' }, character: who, cache, onDisk }), 'stale');
  eq(clipState({ line, character: who, cache, onDisk: new Set() }), 'missing');
  eq(clipState({ line: { text: 'x' }, character: who, cache, onDisk }), 'unnamed');
});

test('the clip ledger teaches the cache what is already on disk', () => {
  const cache = makeCache(fakeStore());
  cache.merge({ 'greeter__idle__01': { file: 'audio/vo/greeter__idle__01.wav', hash: 'deadbeef' } });
  eq(cache.get('greeter__idle__01'), 'deadbeef');
});

test('the voice list is the 54 on this machine, English first', () => {
  eq(VOICES.length, 54);
  const g = voiceGroups();
  eq(g.english.map(([l]) => l), ['English (US)', 'English (GB)']);
  eq(g.english[0][1].length + g.english[1][1].length, 28);
  ok(g.other.length >= 6);
  ok(g.english[0][1].includes('am_echo'), 'the player voice Aaron named');
});

test('a voice id decodes to a language and a gender', () => {
  eq(voiceInfo('bm_fable').lang, 'English (GB)');
  eq(voiceInfo('bm_fable').gender, 'm');
  eq(voiceInfo('af_heart').lang, 'English (US)');
  eq(voiceInfo('zf_xiaoni').english, false);
});
