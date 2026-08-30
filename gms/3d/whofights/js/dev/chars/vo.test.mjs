import { test, eq, ok, near } from '../../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashLine, clipKey, clipFile, rawFile, pitchRate, synthSpeed, effectiveBarks,
  overriddenCategories, planJobs, applyResults, pruneIndex, validateIndex, validateBarks,
  countBarks, needsEncoding, playableFile, BARK_CATEGORIES } from './vo.js';

const root = new URL('../../../', import.meta.url);
const readDoc = p => JSON.parse(readFileSync(fileURLToPath(new URL(p, root)), 'utf8'));

const cast = () => ({
  vail: { name: 'Vail', body: 'robed', voice: 'bf_emma', voiceSpeed: 0.98, voicePitch: 0,
    barks: { greet: ['You must be the new one.', 'Stand up straight.'] } },
  you: { name: 'You', body: 'none', voice: 'am_echo', voiceSpeed: 1, voicePitch: 0 },
  mute: { name: 'Mute', body: 'none' },
});
const barks = () => ({ shared: { idle: ['Bored now.', 'Hm.'], greet: ['Hello there.'] } });

test('hash moves with every field it is documented to cover', () => {
  const base = hashLine('Bored now.', 'am_echo', 1, 0);
  eq(hashLine('Bored now.', 'am_echo', 1, 0), base, 'stable');
  ok(hashLine('Bored now!', 'am_echo', 1, 0) !== base, 'text');
  ok(hashLine('Bored now.', 'bm_fable', 1, 0) !== base, 'voice');
  ok(hashLine('Bored now.', 'am_echo', 1.05, 0) !== base, 'speed');
  ok(hashLine('Bored now.', 'am_echo', 1, -2) !== base, 'pitch');
  eq(base.length, 8);
});

test('clip names follow §8', () => {
  eq(clipKey('greeter', 'idle', 0), 'greeter__idle__01');
  eq(clipKey('greeter', 'idle', 11), 'greeter__idle__12');
  eq(clipFile('greeter__idle__01'), 'audio/vo/greeter__idle__01.ogg');
  eq(rawFile('greeter__idle__01'), 'audio/vo/raw/greeter__idle__01.wav');
});

test('kokoro writes into raw/, and the shipped clip is the mp3', () => {
  const p = planJobs({ cast: cast(), barks: barks(), index: { clips: {} }, who: ['vail'] });
  eq(p.jobs[0].out, 'raw/vail__idle__01', 'the tts out name lands under audio/vo/raw');
  const { index } = applyResults({ clips: {} }, p.jobs, p.jobs.map(() => ({ ok: true, seconds: 1 })));
  const rec = index.clips.vail__idle__01;
  eq(rec.file, 'audio/vo/vail__idle__01.ogg');
  eq(rec.raw, 'audio/vo/raw/vail__idle__01.wav');
  eq(rec.encoded, false, 'a synthesised take is not an encoded one');
  eq(playableFile(rec, 'vail__idle__01'), rec.raw, 'before encoding, the raw is what plays');
  eq(needsEncoding(index).length, 4);
  const done = { ...index, clips: { ...index.clips,
    vail__idle__01: { ...rec, encoded: true } } };
  eq(playableFile(done.clips.vail__idle__01, 'vail__idle__01'), rec.file);
  eq(needsEncoding(done).length, 3);
  eq(needsEncoding(done, new Set()).length, 4, 'an mp3 missing from disk still needs encoding');
});

test('the synthesis speed and the playback rate cancel, so pitch keeps the duration', () => {
  for (const p of [-4, -2, 0, 1.5, 4]) near(synthSpeed(1, p) * pitchRate(p), 1, 1e-3, `pitch ${p}`);
  near(synthSpeed(1.2, -3) * pitchRate(-3), 1.2, 1e-3);
  near(pitchRate(12), pitchRate(4), 1e-9, 'clamped to the contract range');
});

test('a character category replaces the shared one, it never unions', () => {
  const e = effectiveBarks(barks(), cast().vail);
  eq(e.greet, ['You must be the new one.', 'Stand up straight.']);
  eq(e.idle, ['Bored now.', 'Hm.']);
  eq(e.weather, []);
  eq(overriddenCategories(cast().vail), ['greet']);
  eq(effectiveBarks(barks(), cast().you).greet, ['Hello there.']);
});

test('blank lines never become jobs', () => {
  const e = effectiveBarks({ shared: { idle: ['ok', '', '   ', null] } }, {});
  eq(e.idle, ['ok']);
});

test('planJobs schedules everything the first time', () => {
  const p = planJobs({ cast: cast(), barks: barks(), index: { clips: {} }, who: ['vail'] });
  eq(p.jobs.length, 4, '2 shared idle + 2 own greet');
  eq(p.jobs.map(j => j.key),
    ['vail__idle__01', 'vail__idle__02', 'vail__greet__01', 'vail__greet__02']);
  eq(p.jobs[0].ttsSpeed, 0.98);
  eq(p.skip.length, 0);
});

test('a character with no voice is reported, not silently generated', () => {
  const p = planJobs({ cast: cast(), barks: barks(), index: { clips: {} }, who: ['mute'] });
  eq(p.jobs.length, 0);
  eq(p.noVoice.length, 3);
});

test('generate-all skips only what is genuinely unchanged and on disk', () => {
  const first = planJobs({ cast: cast(), barks: barks(), index: { clips: {} }, who: ['vail'] });
  const results = first.jobs.map(() => ({ ok: true, seconds: 1.2, rms: -25 }));
  const { index } = applyResults({ clips: {} }, first.jobs, results);
  const onDisk = new Set(Object.keys(index.clips));

  const again = planJobs({ cast: cast(), barks: barks(), index, who: ['vail'], onDisk });
  eq(again.jobs.length, 0, 'nothing changed');
  eq(again.skip.length, 4);

  const edited = { ...cast() };
  edited.vail = { ...edited.vail, voice: 'bf_alice' };
  eq(planJobs({ cast: edited, barks: barks(), index, who: ['vail'], onDisk }).jobs.length, 4,
    'a new voice restages every line');

  const slower = { ...cast() };
  slower.vail = { ...slower.vail, voiceSpeed: 1.1 };
  eq(planJobs({ cast: slower, barks: barks(), index, who: ['vail'], onDisk }).jobs.length, 4);

  const pitched = { ...cast() };
  pitched.vail = { ...pitched.vail, voicePitch: -2 };
  const pj = planJobs({ cast: pitched, barks: barks(), index, who: ['vail'], onDisk });
  eq(pj.jobs.length, 4);
  near(pj.jobs[0].ttsSpeed, 0.98 * Math.pow(2, 2 / 12), 1e-3, 'the take is synthesised faster');

  const wording = JSON.parse(JSON.stringify(barks()));
  wording.shared.idle[1] = 'Hm. Odd.';
  const w = planJobs({ cast: cast(), barks: wording, index, who: ['vail'], onDisk });
  eq(w.jobs.map(j => j.key), ['vail__idle__02'], 'only the line that moved');

  const gone = new Set(onDisk);
  gone.delete('vail__greet__01');
  const g = planJobs({ cast: cast(), barks: barks(), index, who: ['vail'], onDisk: gone });
  eq(g.jobs.map(j => j.key), ['vail__greet__01'], 'a deleted wav regenerates');
  eq(g.jobs[0].why, 'file missing');

  eq(planJobs({ cast: cast(), barks: barks(), index, who: ['vail'], onDisk, force: true }).jobs.length, 4);
});

test('a refused take leaves no index entry claiming a file exists', () => {
  const plan = planJobs({ cast: cast(), barks: barks(), index: { clips: {} }, who: ['vail'] });
  const results = plan.jobs.map((j, i) => (i === 1
    ? { ok: false, error: 'bf_emma rendered 0.00s at -inf dBFS — nobody spoke' }
    : { ok: true, seconds: 1.1, rms: -24 }));
  const { index, failed } = applyResults({ clips: {} }, plan.jobs, results);
  eq(failed.length, 1);
  eq(failed[0].key, 'vail__idle__02');
  ok(!index.clips['vail__idle__02'], 'the bad one is absent');
  eq(Object.keys(index.clips).length, 3);
  eq(planJobs({ cast: cast(), barks: barks(), index, who: ['vail'],
    onDisk: new Set(Object.keys(index.clips)) }).jobs.map(j => j.key), ['vail__idle__02']);
});

test('another section of the ledger is never rebuilt away', () => {
  const start = { version: 1, lines: { 'academy.hello#0': { hash: 'abc' } }, clips: {} };
  const plan = planJobs({ cast: cast(), barks: barks(), index: start, who: ['vail'] });
  const { index } = applyResults(start, plan.jobs, plan.jobs.map(() => ({ ok: true, seconds: 1 })));
  eq(index.lines, start.lines, 'the conversation tab keeps its half');
  eq(pruneIndex(index, new Set()).index.lines, start.lines);
});

test('a shortened list leaves orphans, and prune names them', () => {
  const plan = planJobs({ cast: cast(), barks: barks(), index: { clips: {} }, who: ['vail'] });
  const { index } = applyResults({ clips: {} }, plan.jobs, plan.jobs.map(() => ({ ok: true, seconds: 1 })));
  const shorter = { shared: { idle: ['Bored now.'], greet: ['Hello there.'] } };
  const after = planJobs({ cast: cast(), barks: shorter, index, who: ['vail'] });
  const { index: pruned, orphans } = pruneIndex(index, after.live);
  eq(orphans.map(o => o.key), ['vail__idle__02']);
  eq(orphans[0].file, 'audio/vo/vail__idle__02.ogg');
  eq(Object.keys(pruned.clips).length, 3);
});

test('validateIndex catches a record that does not match its key', () => {
  eq(validateIndex({ clips: {} }), []);
  const bad = { clips: { 'vail__idle__01': { who: 'vail', category: 'nope', i: 0, text: '',
    file: 'audio/vo/other.wav' } } };
  const e = validateIndex(bad);
  eq(e.length, 4);
  ok(e.some(m => m.includes('no hash')));
  ok(e.some(m => m.includes('does not match its key')));
});

test('the shipped bark pool is complete and every line is real', () => {
  const doc = readDoc('data/barks.json');
  eq(validateBarks(doc), []);
  eq(Object.keys(doc.categories).sort(), BARK_CATEGORIES.slice().sort());
  for (const c of BARK_CATEGORIES) {
    ok(doc.shared[c].length >= 9, `${c} has only ${doc.shared[c].length} lines`);
    for (const l of doc.shared[c]) ok(l.length <= 90, `${c}: "${l}" is too long for a bark`);
  }
  const all = BARK_CATEGORIES.flatMap(c => doc.shared[c]);
  eq(all.length, new Set(all).size, 'no duplicate lines across the pool');
  ok(all.includes('Bored now.'), "Aaron's own example is in there");
});

test('the shipped cast plans a sane run against the shipped pool', () => {
  const doc = readDoc('data/characters.json');
  const bk = readDoc('data/barks.json');
  const { shared, clips } = countBarks(bk, doc.characters);
  ok(shared > 130, `the shared pool is only ${shared} lines`);
  ok(clips > 80, `only ${clips} clips planned across the cast`);
  const p = planJobs({ cast: doc.characters, barks: bk, index: { clips: {} } });
  eq(p.jobs.length + p.noVoice.length, clips);
  eq(p.jobs.filter(j => j.who === 'narrator').length, 0, 'a narrator does not bark');
  ok(p.jobs.some(j => j.who === 'greeter' && j.text.startsWith('You must be the new one')),
    "Vail's own greeting is in the plan");
  ok(p.jobs.every(j => j.ttsSpeed >= 0.5 && j.ttsSpeed <= 2), 'every speed is inside kokoro range');
});
