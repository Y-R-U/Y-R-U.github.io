import { test, eq, ok, near } from '../../tools/harness.mjs';
import { MusicPlan, MusicRuntime, pickNext, envAt, fadeOf, volOf, DUCK, HANDOVER_MIN } from './music.js';

const M = {
  version: 1,
  tracks: [
    { id: 'a', title: 'A', file: 'audio/music/a.mp3', kind: 'instrumental', seconds: 10 },
    { id: 'b', title: 'B', file: 'audio/music/b.mp3', kind: 'instrumental', seconds: 10 },
    { id: 'c', title: 'C', file: 'audio/music/c.mp3', kind: 'song', seconds: 10 },
    { id: 'sting', title: 'Sting', file: 'audio/music/s.mp3', kind: 'instrumental', seconds: 2 },
  ],
  sets: [
    { id: 'hall', label: 'Hall', tracks: ['a', 'b', 'c'], shuffle: true, fadeMs: 1000, volume: 0.5 },
    { id: 'one', label: 'One', tracks: ['a'], shuffle: true, fadeMs: 400, volume: 1 },
    { id: 'seq', label: 'Seq', tracks: ['a', 'b'], shuffle: false, fadeMs: 0, volume: 1 },
    { id: 'stings', tracks: ['sting'], shuffle: false, fadeMs: 200, volume: 1 },
    { id: 'empty', tracks: [], fadeMs: 500, volume: 1 },
    { id: 'ghost', tracks: ['nope'], fadeMs: 500, volume: 1 },
  ],
};

// a deterministic stand-in for Math.random
const seq = vals => { let i = 0; return () => vals[i++ % vals.length]; };
const plan = (o = {}) => new MusicPlan({ manifest: M, rnd: seq([0]), ...o });

test('pickNext sequential walks the list and wraps', () => {
  let c = 0, out = [];
  for (let i = 0; i < 5; i++) { const p = pickNext(['a', 'b'], { shuffle: false, cursor: c }); out.push(p.id); c = p.cursor; }
  eq(out, ['a', 'b', 'a', 'b', 'a']);
});

test('pickNext shuffled never repeats the last track', () => {
  for (let i = 0; i < 30; i++) {
    const p = pickNext(['a', 'b', 'c'], { lastId: 'b', rnd: () => i / 30 });
    ok(p.id !== 'b', `picked b again at ${i}`);
  }
});

test('pickNext with one track repeats it rather than going silent', () => {
  eq(pickNext(['a'], { lastId: 'a' }).id, 'a');
});

test('pickNext on an empty set is null, not a throw', () => {
  eq(pickNext([]).id, null);
  eq(pickNext(undefined).id, null);
  eq(pickNext([null, '', 3]).id, null);
});

test('envAt is linear and clamps at both ends', () => {
  const e = { from: 0, to: 1, t0: 100, ms: 1000 };
  near(envAt(e, 100), 0);
  near(envAt(e, 600), 0.5);
  near(envAt(e, 1100), 1);
  near(envAt(e, 9999), 1);
  near(envAt({ from: 0.4, to: 0, t0: 0, ms: 0 }, 0), 0);
});

test('playSet starts one voice and fades it in to the set volume', () => {
  const p = plan();
  const ops = p.playSet('hall', 0);
  eq(ops.length, 1);
  eq(ops[0].op, 'play');
  eq(p.state(0).voices.length, 1);
  near(p.gains(0).get(1), 0);
  near(p.gains(500).get(1), 0.25, 1e-6, 'half way through a 1000ms fade to 0.5');
  near(p.gains(1000).get(1), 0.5);
});

test('playing the set that is already playing does nothing', () => {
  const p = plan();
  p.playSet('hall', 0);
  const again = p.playSet('hall', 5000);
  eq(again, []);
  eq(p.state(5000).voices.length, 1, 'still one voice');
});

test('restart:true replaces the current track anyway', () => {
  const p = plan({ rnd: seq([0, 0.9]) });
  p.playSet('hall', 0);
  const ops = p.playSet('hall', 5000, { restart: true });
  eq(ops.length, 1);
  eq(p.state(5000).voices.length, 2, 'the old one is fading out under the new one');
});

test('a set change cross-fades: old down, new up, both audible mid-fade', () => {
  const p = plan({ rnd: seq([0]) });
  p.playSet('hall', 0);
  near(p.gains(2000).get(1), 0.5, 1e-6, 'first track is up');
  p.playSet('one', 2000);                    // fadeMs 400, volume 1
  const mid = p.gains(2200);
  near(mid.get(1), 0.25, 1e-6, 'old one half way down');
  near(mid.get(2), 0.5, 1e-6, 'new one half way up');
  eq(p.setId, 'one');
});

test('a zero-length fade is a hard cut, not a NaN', () => {
  const p = plan({ rnd: seq([0]) });
  p.playSet('hall', 0);
  p.playSet('seq', 2000);                    // fadeMs 0
  near(p.gains(2000).get(1), 0);
  near(p.gains(2000).get(2), 1);
});

test('a set change honours the NEW set fade length', () => {
  const p = plan();
  p.playSet('one', 0);            // fadeMs 400
  p.playSet('hall', 1000);        // fadeMs 1000 — the outgoing voice uses it too
  const v = p.voices.find(x => x.id === 1);
  eq(v.env.ms, 1000);
  near(p.gains(1500).get(1), 0.5, 1e-6, 'halfway down from 1.0');
});

test('the faded-out voice is stopped once its fade completes', () => {
  const p = plan();
  p.playSet('one', 0);
  p.playSet('hall', 1000);
  eq(p.tick(1500).filter(o => o.op === 'stop').length, 0, 'still fading at 500ms in');
  eq(p.tick(2100).filter(o => o.op === 'stop').map(o => o.voice), [1]);
  eq(p.state(2100).voices.length, 1);
});

test('a track hands over to the next before it ends', () => {
  const p = plan({ rnd: seq([0, 0.5]) });
  p.playSet('hall', 0);                      // 10 s track, 1000 ms fade
  eq(p.tick(5000).length, 0, 'nothing to do half way through');
  const ops = p.tick(9100);                  // inside the last second
  eq(ops.filter(o => o.op === 'play').length, 1);
  const st = p.state(9100);
  eq(st.voices.length, 2);
  ok(st.voices[0].trackId !== st.voices[1].trackId, 'handed over to a different track');
});

test('handover does not fire twice for one track', () => {
  const p = plan({ rnd: seq([0, 0.5, 0.9]) });
  p.playSet('hall', 0);
  p.tick(9100);
  eq(p.tick(9200).filter(o => o.op === 'play').length, 0);
});

test('ended() moves the set on when the manifest length was wrong', () => {
  const p = plan({ rnd: seq([0, 0.5]) });
  p.playSet('hall', 0);
  const ops = p.ended(1, 3000);
  eq(ops.filter(o => o.op === 'stop').map(o => o.voice), [1]);
  eq(ops.filter(o => o.op === 'play').length, 1);
  eq(p.state(3000).voices.length, 1);
});

test('ended() on a voice from an abandoned set does not restart it', () => {
  const p = plan();
  p.playSet('one', 0);
  p.playSet('hall', 1000);
  const ops = p.ended(1, 1200);
  eq(ops.filter(o => o.op === 'play').length, 0);
});

test('stop fades everything and forgets the set', () => {
  const p = plan();
  p.playSet('hall', 0);
  p.stop(2000);
  eq(p.setId, null);
  near(p.gains(2500).get(1), 0.25, 1e-6);
  eq(p.tick(3100).filter(o => o.op === 'stop').length, 1);
  eq(p.state(3100).voices.length, 0);
});

test('stop takes an explicit fade', () => {
  const p = plan();
  p.playSet('hall', 0);
  p.stop(2000, 0);
  near(p.gains(2000).get(1), 0);
});

test('an unknown set is a recorded problem, not a throw or a silence', () => {
  const p = plan();
  p.playSet('hall', 0);
  eq(p.playSet('nope', 100), []);
  eq(p.setId, 'hall', 'the good set is still playing');
  ok(p.problems.some(x => x.includes('nope')));
});

test('an empty set and a set naming a missing track are both survivable', () => {
  const p = plan();
  eq(p.playSet('empty', 0).length, 0);
  eq(p.playSet('ghost', 0).length, 0);
  ok(p.problems.length >= 2);
});

test('a sting ducks the bed instead of replacing it', () => {
  const p = plan();
  p.playSet('hall', 0);
  const gBefore = p.gains(2000).get(1);
  near(gBefore, 0.5);
  p.sting('stings', 2000);
  eq(p.setId, 'hall', 'the bed set is untouched');
  eq(p.state(2000).voices.length, 2);
  near(p.gains(2200).get(1), 0.5 * DUCK, 1e-6, 'bed ducked after the 200ms duck-in');
  near(p.gains(2200).get(2), 1, 1e-6, 'the sting itself is not ducked');
});

test('the bed comes back up after the sting', () => {
  const p = plan();
  p.playSet('hall', 0);
  p.sting('stings', 2000);
  p.tick(3800);                      // 2 s sting, release 300 ms before the end
  near(p.gains(4400).get(1), 0.5, 1e-6);
});

test('volume and mute retarget every live voice', () => {
  const p = plan();
  p.playSet('hall', 0);
  near(p.gains(2000).get(1), 0.5);
  p.setMaster({ volume: 0.5 }, 2000);
  near(p.gains(2120).get(1), 0.25, 1e-6);
  p.setMaster({ mute: true }, 3000);
  near(p.gains(3120).get(1), 0);
  p.setMaster({ mute: false }, 4000);
  near(p.gains(4120).get(1), 0.25, 1e-6);
});

test('fadeOf and volOf fall back rather than yielding NaN', () => {
  eq(fadeOf(null), 1200);
  eq(fadeOf({ fadeMs: 'x' }), 1200);
  eq(fadeOf({ fadeMs: -5 }), 0);
  eq(volOf({ volume: 4 }), 1);
  eq(volOf({}), 0.7);
});

test('load() with junk leaves an empty but usable plan', () => {
  const p = new MusicPlan({});
  p.load(null);
  eq(p.playSet('hall', 0), []);
  eq(p.state(0).voices, []);
});

// The shell, over fake elements — no DOM, no network.
function fakeEl() {
  return {
    src: '', volume: 0, paused: true, currentTime: 0, preload: '',
    play() { this.paused = false; return { then: f => (f(), { catch: () => {} }) }; },
    pause() { this.paused = true; },
    removeAttribute() {}, load() {},
  };
}

test('the runtime opens an element per voice and drives its volume', () => {
  let t = 0;
  const made = [];
  const rt = new MusicRuntime({ make: () => { const e = fakeEl(); made.push(e); return e; }, now: () => t, rnd: () => 0 });
  rt.load(M);
  rt.playSet('hall');
  eq(made.length, 1);
  eq(made[0].src, 'audio/music/a.mp3');
  near(made[0].volume, 0);
  t = 1000;
  rt.tick();
  near(made[0].volume, 0.5);
});

test('the runtime releases an element when the plan stops the voice', () => {
  let t = 0;
  const made = [];
  const rt = new MusicRuntime({ make: () => { const e = fakeEl(); made.push(e); return e; }, now: () => t });
  rt.load(M);
  rt.playSet('hall');
  rt.stop(0);
  t = 100;
  rt.tick();
  eq(made[0].paused, true);
  eq(rt.els.size, 0);
});

test('the runtime reads volume and mute out of the save settings', () => {
  let t = 0;
  let settings = { volume: 1, mute: false };
  const made = [];
  const rt = new MusicRuntime({ make: () => { const e = fakeEl(); made.push(e); return e; }, now: () => t, settings: () => settings, rnd: () => 0 });
  rt.load(M);
  rt.playSet('hall');
  t = 2000; rt.tick();
  near(made[0].volume, 0.5);
  settings = { volume: 1, mute: true };
  t = 2200; rt.tick();
  t = 2400; rt.tick();
  near(made[0].volume, 0);
});

test('action() speaks the contract shapes', () => {
  let t = 0;
  const rt = new MusicRuntime({ make: fakeEl, now: () => t });
  rt.load(M);
  rt.action({ k: 'music', set: 'hall' });
  eq(rt.state().setId, 'hall');
  rt.action({ k: 'music', set: 'stings', sting: true });
  eq(rt.state().setId, 'hall', 'a sting leaves the bed set alone');
  rt.action({ k: 'music', stop: true });
  eq(rt.state().setId, null);
  rt.action(null);
  rt.action({ k: 'music' });
});

// The `music` verb in js/game/actions.js (DEV_CONTRACT §10) — the only part of that shared file
// this agent owns.
test('the music action reaches the runtime through globalThis', async () => {
  const { runAction } = await import('./actions.js');
  let t = 0;
  const rt = new MusicRuntime({ make: fakeEl, now: () => t });
  rt.load(M);
  const prev = globalThis.__wfMusic;
  globalThis.__wfMusic = rt;
  try {
    eq(runAction({ k: 'music', set: 'hall' }), { k: 'music', ok: true });
    eq(rt.state().setId, 'hall');
    eq(runAction({ k: 'music', stop: true }), { k: 'music', ok: true });
    eq(rt.state().setId, null);
    eq(runAction({ k: 'music' }).ok, false, 'no set and no stop is a bad action');
    eq(runAction({ k: 'music', set: 'nope' }), { k: 'music', ok: true }, 'a missing set is a runtime problem, not a bad action');
  } finally { globalThis.__wfMusic = prev; }
});

test('ctx.music still wins, so a test can intercept without a runtime', async () => {
  const { runAction } = await import('./actions.js');
  const seen = [];
  runAction({ k: 'music', set: 'hall' }, { music: a => seen.push(a.set) });
  eq(seen, ['hall']);
});
