/**
 * The mix bus: four sub-buses, a procedural convolution room, ducking, and a limiter
 * that guarantees the master never clips no matter how much of the level falls over.
 *
 *   voices ->  sfx  ---------\
 *              ui   ---------+->  master -> limiter -> soft clip -> analyser -> out
 *   vo     ->  voice --------+
 *   music  ->  musicDuck ----+
 *   ambience-> ambDuck ------/
 *   (any)  ->  reverbSend -> convolver -> reverbReturn -^
 *
 * `voice` bypasses the duck stage deliberately: duck() exists to pull the score out from
 * under a spoken line, and a voice routed through the thing being ducked ducks itself.
 */

import { makeRng } from './dsp.js';

export const BUSES = ['master', 'sfx', 'music', 'ambience', 'ui', 'voice'];

export const DEFAULT_VOLUMES = { master: 0.85, sfx: 1.0, music: 0.6, ambience: 0.55, ui: 0.8, voice: 1.0 };

/** Rooms are generated, not sampled: exponentially-decaying noise with early reflections. */
const ROOMS = {
  village: { time: 0.7, damp: 0.55, predelay: 0.008, early: 4, width: 0.6, gain: 0.7 },
  forest: { time: 1.25, damp: 0.72, predelay: 0.014, early: 6, width: 0.9, gain: 0.8 },
  glade: { time: 1.9, damp: 0.5, predelay: 0.018, early: 5, width: 0.85, gain: 0.9 },
  ruins: { time: 2.8, damp: 0.3, predelay: 0.022, early: 8, width: 0.75, gain: 1.0 },
  none: { time: 0.25, damp: 0.8, predelay: 0.004, early: 2, width: 0.4, gain: 0.4 },
};

function makeIR(actx, spec, seed = 3) {
  const sr = actx.sampleRate;
  const n = Math.max(64, Math.ceil(spec.time * sr));
  const buf = actx.createBuffer(2, n, sr);
  const rng = makeRng(seed);
  const pre = Math.floor(spec.predelay * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const a = 1 - spec.damp * 0.9;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const decay = Math.pow(1 - t, 2 + spec.time);
      lp += ((rng.next() * 2 - 1) - lp) * a;
      d[i] = lp * decay;
    }
    // early reflections give the room a size; pure noise tails all sound the same
    for (let e = 0; e < spec.early; e++) {
      const at = pre + Math.floor((0.004 + rng.next() * spec.predelay * 4) * sr * (e + 1));
      if (at < n) d[at] += (rng.next() * 2 - 1) * 0.55 / (e + 1);
    }
    // decorrelate the channels for width
    if (ch === 1) {
      const shift = Math.floor(spec.width * 0.004 * sr);
      for (let i = n - 1; i >= shift; i--) d[i] = d[i] * 0.7 + d[i - shift] * 0.5;
    }
  }
  return buf;
}

export function createMix(actx, opts = {}) {
  const store = opts.storage;
  const vol = { ...DEFAULT_VOLUMES, ...(opts.volumes || {}) };
  let muted = !!opts.muted;

  const master = actx.createGain();
  const limiter = actx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 3;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.0015;
  limiter.release.value = 0.14;

  const shaper = actx.createWaveShaper();
  {
    // x / (1 + x^4)^(1/4): unity slope at zero, so it is transparent under about -6 dB,
    // and asymptotic to 1 so nothing can ever leave here clipped. A tanh curve scaled
    // to reach 1 at x=1 has a slope of ~2 at the origin and quietly doubles the mix.
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = x / Math.pow(1 + Math.pow(Math.abs(x), 4), 0.25);
    }
    shaper.curve = c;
    shaper.oversample = '2x';
  }

  let analyser = null;
  try {
    analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
  } catch { analyser = null; }

  master.connect(limiter);
  limiter.connect(shaper);
  if (analyser) { shaper.connect(analyser); analyser.connect(actx.destination); }
  else shaper.connect(actx.destination);

  const gains = {};
  for (const b of ['sfx', 'music', 'ambience', 'ui', 'voice']) {
    gains[b] = actx.createGain();
  }
  // separate duck stage so a duck never fights the user's volume slider
  const musicDuck = actx.createGain();
  const ambDuck = actx.createGain();
  gains.music.connect(musicDuck); musicDuck.connect(master);
  gains.ambience.connect(ambDuck); ambDuck.connect(master);
  gains.sfx.connect(master);
  gains.ui.connect(master);
  gains.voice.connect(master);

  const reverbSend = actx.createGain();
  reverbSend.gain.value = 1;
  const convolver = actx.createConvolver();
  convolver.normalize = true;
  const reverbReturn = actx.createGain();
  reverbReturn.gain.value = 0.8;
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(master);

  const irCache = new Map();
  let roomName = '';
  function setRoom(name, fade = 0.6) {
    const spec = ROOMS[name] || ROOMS.forest;
    if (roomName === name) return;
    roomName = name;
    let ir = irCache.get(name);
    if (!ir) { ir = makeIR(actx, spec, 3 + Object.keys(ROOMS).indexOf(name)); irCache.set(name, ir); }
    const t = actx.currentTime;
    // fade the return out, swap, fade back — a live convolver swap clicks otherwise
    reverbReturn.gain.cancelScheduledValues(t);
    reverbReturn.gain.setTargetAtTime(0.0001, t, fade * 0.15);
    setTimeout(() => {
      try { convolver.buffer = ir; } catch { /* context died */ }
      const t2 = actx.currentTime;
      reverbReturn.gain.cancelScheduledValues(t2);
      reverbReturn.gain.setTargetAtTime(spec.gain * 0.8, t2, fade * 0.3);
    }, Math.max(30, fade * 200));
  }
  setRoom('forest', 0);
  try { convolver.buffer = irCache.get('forest') || makeIR(actx, ROOMS.forest, 4); } catch { /* ignore */ }

  function apply(name) {
    const t = actx.currentTime;
    if (name === 'master' || name === undefined) {
      master.gain.setTargetAtTime(muted ? 0 : vol.master, t, 0.02);
      return;
    }
    const g = gains[name];
    if (g) g.gain.setTargetAtTime(vol[name], t, 0.02);
  }
  for (const b of BUSES) apply(b);

  function save() {
    if (!store) return;
    try { store.setItem('sunderfall.audio', JSON.stringify({ ...vol, muted })); } catch { /* private mode */ }
  }

  let duckUntil = 0;

  return {
    master, gains, reverbSend, analyser, limiter,

    input(bus) { return gains[bus] || gains.sfx; },

    get volumes() { return { ...vol }; },
    get muted() { return muted; },

    setVolume(name, v) {
      if (typeof name === 'number') { v = name; name = 'master'; }
      if (!(name in vol)) return false;
      vol[name] = Math.max(0, Math.min(1, +v || 0));
      apply(name);
      save();
      return true;
    },
    getVolume(name) { return vol[name] ?? 0; },

    setMuted(b) {
      muted = !!b;
      apply('master');
      save();
      return muted;
    },

    /** Big impacts pull the score down for a beat so the impact owns the moment. */
    duck(amount = 0.5, seconds = 0.45) {
      const t = actx.currentTime;
      if (t < duckUntil && amount < 0.7) return;
      duckUntil = t + seconds;
      const lvl = Math.max(0.05, 1 - Math.max(0, Math.min(1, amount)));
      for (const g of [musicDuck, ambDuck]) {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(lvl, t + 0.03);
        g.gain.setTargetAtTime(1, t + seconds * 0.35, seconds * 0.35);
      }
    },

    setRoom,
    get room() { return roomName; },

    /** Peak of the last analyser window, 0..1 — the harness meter. */
    peak() {
      if (!analyser) return 0;
      const n = analyser.fftSize;
      const buf = peakBuf.length === n ? peakBuf : (peakBuf = new Float32Array(n));
      analyser.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < n; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
      return p;
    },

    dispose() {
      try { master.disconnect(); limiter.disconnect(); shaper.disconnect(); } catch { /* ignore */ }
    },
  };
}

let peakBuf = new Float32Array(1024);

export { ROOMS, makeIR };
