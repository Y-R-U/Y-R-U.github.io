/**
 * Generative ambience beds — one per location.
 *
 * Two halves:
 *   1. Continuous layers built as live WebAudio graphs (wind, drone, insects, room
 *      tone). Every layer is modulated by two or three LFOs at mutually irrational
 *      rates, so the bed never lands on the same combination twice. There is no loop
 *      point to hear.
 *   2. A one-shot scheduler firing `amb.*` events (creaks, birds, drips, distant
 *      collapses) at randomised gaps and random stereo positions.
 *
 * The layer builder takes an explicit context and destination so the whole bed can be
 * rendered into an OfflineAudioContext and measured.
 */

import {
  white, pink, brown, lp1, svf, shape, partial, modal, thump, fm,
  reverbTail, loopify,
} from './dsp.js';
import { noiseBody, scatter, creak, rustle } from './sfx-materials.js';

/* ---------- ambient one-shots ------------------------------------------- */

export const AMBIENT_SFX = {
  'amb.creak': {
    dur: 1.6, gain: 0.3, prio: 2, rate: 0.4, max: 2, variants: 3, bus: 'ambience', send: 0.4,
    gen(o, sr, rng) { creak(o, sr, rng, { dur: 1.3, f0: 200 + rng.next() * 260, rise: 1.6, amp: 0.7, rate: 16 }); },
  },
  'amb.branch': {
    dur: 1.2, gain: 0.28, prio: 2, rate: 0.4, max: 2, variants: 3, bus: 'ambience', send: 0.45,
    gen(o, sr, rng) {
      creak(o, sr, rng, { dur: 0.4, f0: 380, rise: 2.4, amp: 0.5, rate: 60 });
      modal(o, sr, 220, [[1, 0.3, 0.08], [2.3, 0.14, 0.05]], { rng, jitter: 0.1, from: (0.35 * sr) | 0 });
      rustle(o, sr, rng, { at: (0.36 * sr) | 0, dur: 0.6, amp: 0.4, density: 70 });
    },
  },
  'amb.bird': {
    dur: 1.0, gain: 0.22, prio: 2, rate: 0.5, max: 2, variants: 4, sr: 44100, bus: 'ambience', send: 0.55,
    gen(o, sr, rng) {
      const f = 1900 + rng.next() * 1400;
      const notes = 2 + rng.int(0, 2);
      for (let i = 0; i < notes; i++) {
        const at = (i * (0.07 + rng.next() * 0.06) * sr) | 0;
        const to = Math.min(o.length, at + ((0.09 * sr) | 0));
        partial(o, sr, f * (0.9 + rng.next() * 0.3), 0.4, 0.03, { from: at, to, bendTo: f * (1.2 + rng.next() * 0.5), bendTau: 0.012 });
      }
    },
  },
  'amb.owl': {
    dur: 2.0, gain: 0.24, prio: 2, rate: 1.0, max: 1, variants: 3, bus: 'ambience', send: 0.6,
    gen(o, sr, rng) {
      for (const t of [0, 0.42]) {
        const at = (t * sr) | 0;
        const to = Math.min(o.length, at + ((0.3 * sr) | 0));
        partial(o, sr, 420, 0.35, 0.11, { from: at, to, bendTo: 388, bendTau: 0.06 });
        partial(o, sr, 840, 0.07, 0.07, { from: at, to });
      }
      lp1(o, 2200, sr);
    },
  },
  'amb.crow': {
    dur: 1.4, gain: 0.26, prio: 2, rate: 1.0, max: 1, variants: 3, bus: 'ambience', send: 0.55,
    gen(o, sr, rng) {
      for (let i = 0; i < 2 + rng.int(0, 1); i++) {
        const at = (i * 0.28 * sr) | 0;
        noiseBody(o, sr, rng, { at, dur: 0.18, f0: 1100, f1: 620, q: 4.5, amp: 0.6, a: 0.008, curve: 2 });
        partial(o, sr, 320, 0.14, 0.1, { from: at, bendTo: 240, bendTau: 0.05 });
      }
    },
  },
  'amb.cricket': {
    dur: 0.6, gain: 0.14, prio: 1, rate: 0.15, max: 3, variants: 4, sr: 44100, bus: 'ambience', send: 0.3,
    gen(o, sr, rng) {
      const f = 4200 + rng.next() * 1800;
      for (let i = 0; i < 5; i++) {
        const at = (i * 0.035 * sr) | 0;
        const to = Math.min(o.length, at + ((0.02 * sr) | 0));
        partial(o, sr, f, 0.4, 0.006, { from: at, to });
        partial(o, sr, f * 2.01, 0.12, 0.004, { from: at, to });
      }
    },
  },
  'amb.drip': {
    dur: 1.2, gain: 0.24, prio: 2, rate: 0.2, max: 3, variants: 4, sr: 44100, bus: 'ambience', send: 0.75,
    gen(o, sr, rng) {
      const f = 700 + rng.next() * 900;
      partial(o, sr, f, 0.5, 0.05, { bendTo: f * 2.3, bendTau: 0.018 });
      noiseBody(o, sr, rng, { dur: 0.012, f0: 5000, f1: 1800, q: 1.4, amp: 0.18, curve: 3.5 });
      reverbTail(o, sr, { mix: 0.4, time: 1.0, damp: 0.25 });
    },
  },
  'amb.settle': {
    dur: 1.0, gain: 0.22, prio: 1, rate: 0.3, max: 3, variants: 4, bus: 'ambience', send: 0.6,
    gen(o, sr, rng) {
      scatter(o, sr, rng, { t0: 0, t1: 0.5, count: 5, fLo: 180, fHi: 1100, decay: 0.04, amp: 0.5, clump: 0.5, noise: 0.9 });
    },
  },
  'amb.distant_boom': {
    dur: 3.0, gain: 0.34, prio: 3, rate: 2.0, max: 1, variants: 3, bus: 'ambience', send: 0.8,
    gen(o, sr, rng) {
      thump(o, sr, 52, 26, 0.5, 0.7, { tauF: 0.15 });
      noiseBody(o, sr, rng, { dur: 2.2, f0: 190, f1: 45, q: 0.7, amp: 0.22, kind: 'brown', mode: 'lp', a: 0.15, curve: 1.3 });
      reverbTail(o, sr, { mix: 0.35, time: 2.6, damp: 0.7 });
      lp1(o, 700, sr);
    },
  },
  'amb.whisper': {
    dur: 2.4, gain: 0.2, prio: 2, rate: 1.0, max: 2, variants: 3, bus: 'ambience', send: 0.8,
    gen(o, sr, rng) {
      // formants drifting through nonsense: the ear insists it is a voice
      const n = o.length;
      const t = new Float32Array(n);
      white(t, rng, 0.6);
      svf(t, sr, { mode: 'bp', f0: 620, f1: 1500, q: 7 });
      const t2 = new Float32Array(n);
      white(t2, rng, 0.4);
      svf(t2, sr, { mode: 'bp', f0: 2400, f1: 1100, q: 9 });
      for (let i = 0; i < n; i++) {
        const u = i / sr;
        const g = (0.4 + 0.6 * Math.abs(Math.sin(u * 3.1))) * (0.5 + 0.5 * Math.sin(u * 1.13 + 2));
        o[i] += (t[i] + t2[i] * 0.6) * g;
      }
      shape(o, sr, [[0, 0], [0.5, 1], [1.6, 0.8], [2.4, 0]]);
    },
  },
  'amb.bell_far': {
    dur: 4.0, gain: 0.24, prio: 3, rate: 3.0, max: 1, variants: 2, bus: 'ambience', send: 0.9,
    gen(o, sr, rng) {
      modal(o, sr, 146.83, [
        [0.5, 0.2, 3.4], [1, 0.5, 3.0], [1.19, 0.28, 2.2], [1.56, 0.2, 1.7],
        [2, 0.14, 1.5], [2.51, 0.09, 1.0], [3.01, 0.05, 0.7],
      ], { rng, jitter: 0.003 });
      lp1(o, 2600, sr);
      reverbTail(o, sr, { mix: 0.4, time: 3.4, damp: 0.4 });
    },
  },
  'amb.gust': {
    dur: 3.4, gain: 0.34, prio: 2, rate: 1.2, max: 2, variants: 3, bus: 'ambience', send: 0.5,
    gen(o, sr, rng) {
      pink(o, rng, 0.9);
      svf(o, sr, { mode: 'bp', f0: 320, f1: 1500, q: 1.1 });
      shape(o, sr, [[0, 0], [1.2, 1], [2.2, 0.5], [3.4, 0]]);
      rustle(o, sr, rng, { at: (0.6 * sr) | 0, dur: 2.0, amp: 0.3, f0: 4600, f1: 2200, density: 60 });
    },
  },
  'amb.void_pulse': {
    dur: 3.6, gain: 0.28, prio: 3, rate: 2.0, max: 1, variants: 3, bus: 'ambience', send: 0.85,
    gen(o, sr, rng) {
      fm(o, sr, { carrier: 58, ratio: 2.73, index: 4, indexDecay: 1.2, decay: 2.4, amp: 0.5 });
      noiseBody(o, sr, rng, { dur: 2.6, f0: 2600, f1: 300, q: 2.2, amp: 0.22, a: 0.7, curve: 1.3 });
      reverbTail(o, sr, { mix: 0.35, time: 3.0, damp: 0.4 });
    },
  },
};

/* ---------- continuous layers -------------------------------------------- */

function noiseBuffer(actx, seconds = 8, kind = 'pink', seed = 11) {
  const sr = actx.sampleRate;
  const n = Math.ceil(seconds * sr);
  const data = new Float32Array(n);
  const rng = { next: mulberry(seed) };
  rng.gauss = () => (rng.next() + rng.next() + rng.next() + rng.next() - 2) * 0.866;
  if (kind === 'brown') brown(data, rng, 1); else if (kind === 'white') white(data, rng, 1); else pink(data, rng, 1);
  const looped = loopify(data, sr, 0.5);
  let p = 0;
  for (let i = 0; i < looped.length; i++) { const a = Math.abs(looped[i]); if (a > p) p = a; }
  if (p > 0) for (let i = 0; i < looped.length; i++) looped[i] *= 0.9 / p;
  const buf = actx.createBuffer(1, looped.length, sr);
  buf.copyToChannel ? buf.copyToChannel(looped, 0) : buf.getChannelData(0).set(looped);
  return buf;
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lfo(actx, rate, depth, target, phaseOffsetSeconds = 0) {
  const o = actx.createOscillator();
  o.type = 'sine';
  o.frequency.value = rate;
  const g = actx.createGain();
  g.gain.value = depth;
  o.connect(g);
  g.connect(target);
  o.start(actx.currentTime + phaseOffsetSeconds);
  return o;
}

/**
 * Build one bed's continuous layers into `dest`.
 * Returns { out, start, stop, setWind, oscs } — `out` starts silent.
 */
export function buildBed(actx, dest, spec, cache) {
  const out = actx.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);
  const sources = [];
  const oscs = [];
  const windGains = [];

  const pinkBuf = cache?.pink || noiseBuffer(actx, 8, 'pink', 11);
  const brownBuf = cache?.brown || noiseBuffer(actx, 8, 'brown', 23);
  if (cache) { cache.pink = pinkBuf; cache.brown = brownBuf; }

  for (const w of spec.wind || []) {
    const src = actx.createBufferSource();
    src.buffer = w.brown ? brownBuf : pinkBuf;
    src.loop = true;
    src.playbackRate.value = w.rate || 1;
    const f = actx.createBiquadFilter();
    f.type = w.type || 'bandpass';
    f.frequency.value = w.f;
    f.Q.value = w.q || 1;
    const g = actx.createGain();
    g.gain.value = w.gain;
    src.connect(f); f.connect(g); g.connect(out);
    // two LFOs at unrelated rates: the bed drifts instead of breathing on a cycle
    oscs.push(lfo(actx, w.mod || 0.037, w.f * (w.modDepth || 0.45), f.frequency));
    oscs.push(lfo(actx, (w.mod || 0.037) * 2.718, w.f * (w.modDepth || 0.45) * 0.35, f.frequency));
    oscs.push(lfo(actx, w.amp || 0.061, w.gain * 0.55, g.gain, 0.3));
    src.start();
    sources.push(src);
    windGains.push(g);
  }

  for (const d of spec.drone || []) {
    const g = actx.createGain();
    g.gain.value = d.gain;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = d.cut || 500;
    f.Q.value = 0.8;
    f.connect(g); g.connect(out);
    for (let i = 0; i < (d.voices || 3); i++) {
      const o = actx.createOscillator();
      o.type = d.wave || 'sawtooth';
      o.frequency.value = d.f * (d.ratios ? d.ratios[i % d.ratios.length] : 1);
      o.detune.value = (i - 1) * (d.detune ?? 7);
      const vg = actx.createGain();
      vg.gain.value = 1 / (d.voices || 3);
      o.connect(vg); vg.connect(f);
      o.start();
      oscs.push(o);
      // slow, prime-ish beating between voices
      oscs.push(lfo(actx, 0.013 + i * 0.0071, (d.detune ?? 7) * 0.8, o.detune, i * 0.7));
    }
    oscs.push(lfo(actx, d.mod || 0.023, (d.cut || 500) * 0.5, f.frequency));
    oscs.push(lfo(actx, 0.0173, d.gain * 0.4, g.gain, 1.1));
  }

  if (spec.insects) {
    const src = actx.createBufferSource();
    src.buffer = pinkBuf;
    src.loop = true;
    src.playbackRate.value = 1.37;
    const f = actx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = spec.insects.f || 5200;
    f.Q.value = spec.insects.q || 9;
    const trem = actx.createGain();
    trem.gain.value = spec.insects.gain * 0.5;
    src.connect(f); f.connect(trem); trem.connect(out);
    oscs.push(lfo(actx, spec.insects.rate || 42, spec.insects.gain * 0.5, trem.gain));
    oscs.push(lfo(actx, 0.041, spec.insects.gain * 0.35, trem.gain, 0.9));
    oscs.push(lfo(actx, 0.019, (spec.insects.f || 5200) * 0.12, f.frequency));
    src.start();
    sources.push(src);
  }

  if (spec.shimmer) {
    const g = actx.createGain();
    g.gain.value = spec.shimmer.gain;
    g.connect(out);
    for (const r of spec.shimmer.partials) {
      const o = actx.createOscillator();
      o.type = 'sine';
      o.frequency.value = spec.shimmer.f * r;
      const vg = actx.createGain();
      vg.gain.value = 0.25 / spec.shimmer.partials.length;
      o.connect(vg); vg.connect(g);
      o.start();
      oscs.push(o);
      oscs.push(lfo(actx, 0.0091 * (1 + r * 0.3), spec.shimmer.f * r * 0.004, o.frequency, r));
    }
  }

  return {
    out, oscs, sources, windGains,
    start(level, fade = 2.0) {
      const t = actx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.setTargetAtTime(level, t, Math.max(0.05, fade * 0.35));
    },
    setLevel(level, fade = 1.0) {
      const t = actx.currentTime;
      out.gain.setTargetAtTime(Math.max(0.0001, level), t, Math.max(0.03, fade * 0.35));
    },
    setWind(mul, fade = 1.5) {
      const t = actx.currentTime;
      for (let i = 0; i < windGains.length; i++) {
        windGains[i].gain.setTargetAtTime((spec.wind[i].gain) * mul, t, fade * 0.35);
      }
    },
    stop(fade = 2.0) {
      const t = actx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.setTargetAtTime(0.0001, t, Math.max(0.05, fade * 0.3));
      const kill = t + fade + 1.5;
      for (const o of oscs) { try { o.stop(kill); } catch { /* already stopped */ } }
      for (const s of sources) { try { s.stop(kill); } catch { /* already stopped */ } }
      setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, (fade + 2) * 1000);
    },
  };
}

/* ---------- location specs ------------------------------------------------ */

export const BEDS = {
  thornmere: {
    room: 'village', level: 1.2,
    wind: [
      { f: 260, q: 0.8, gain: 0.22, rate: 0.87, mod: 0.031, modDepth: 0.5, amp: 0.047 },
      { f: 90, q: 0.7, gain: 0.16, brown: true, rate: 0.6, mod: 0.019, modDepth: 0.4, amp: 0.029 },
    ],
    drone: [{ f: 55, gain: 0.05, cut: 240, voices: 3, ratios: [1, 1.5, 2], detune: 6, wave: 'triangle', mod: 0.017 }],
    insects: { f: 4600, q: 11, gain: 0.05, rate: 34 },
    events: [
      ['amb.cricket', 0.6, 2.4, 0.8],
      ['amb.bird', 6, 22, 0.6],
      ['amb.creak', 8, 26, 0.5],
      ['amb.crow', 18, 60, 0.45],
      ['amb.bell_far', 55, 150, 0.5],
      ['amb.gust', 14, 38, 0.7],
    ],
  },

  sunderwood: {
    room: 'forest', level: 1.3,
    wind: [
      { f: 420, q: 0.7, gain: 0.24, rate: 1.13, mod: 0.043, modDepth: 0.6, amp: 0.053 },
      { f: 1500, q: 0.5, gain: 0.09, rate: 1.61, mod: 0.071, modDepth: 0.5, amp: 0.037 },
      { f: 78, q: 0.7, gain: 0.18, brown: true, rate: 0.53, mod: 0.017, modDepth: 0.45, amp: 0.023 },
    ],
    drone: [{ f: 49, gain: 0.06, cut: 190, voices: 3, ratios: [1, 1.5, 2.99], detune: 9, wave: 'sawtooth', mod: 0.013 }],
    insects: { f: 5600, q: 13, gain: 0.055, rate: 47 },
    events: [
      ['amb.cricket', 0.5, 2.0, 0.9],
      ['amb.owl', 12, 40, 0.6],
      ['amb.branch', 5, 18, 0.7],
      ['amb.creak', 4, 15, 0.6],
      ['amb.gust', 9, 26, 0.9],
      ['amb.whisper', 30, 90, 0.35],
      ['amb.distant_boom', 40, 120, 0.4],
    ],
  },

  ruinreach: {
    room: 'ruins', level: 1.35,
    wind: [
      // wind through broken stonework: high-Q resonances, not open-air hiss
      { f: 190, q: 5.5, gain: 0.2, rate: 0.71, mod: 0.023, modDepth: 0.3, amp: 0.031 },
      { f: 430, q: 7.0, gain: 0.13, rate: 1.07, mod: 0.037, modDepth: 0.28, amp: 0.043 },
      { f: 64, q: 0.7, gain: 0.2, brown: true, rate: 0.47, mod: 0.011, modDepth: 0.5, amp: 0.019 },
    ],
    drone: [{ f: 41, gain: 0.07, cut: 160, voices: 4, ratios: [1, 1.5, 2, 3.02], detune: 11, wave: 'sawtooth', mod: 0.009 }],
    events: [
      ['amb.drip', 1.5, 6, 0.9],
      ['amb.settle', 3, 12, 0.8],
      ['amb.distant_boom', 20, 60, 0.6],
      ['amb.creak', 10, 34, 0.4],
      ['amb.gust', 11, 30, 0.7],
      ['amb.crow', 25, 80, 0.4],
    ],
  },

  glyphglade: {
    room: 'glade', level: 1.4,
    wind: [
      { f: 300, q: 1.2, gain: 0.13, rate: 0.91, mod: 0.029, modDepth: 0.55, amp: 0.041 },
      { f: 58, q: 0.7, gain: 0.24, brown: true, rate: 0.41, mod: 0.007, modDepth: 0.6, amp: 0.013 },
    ],
    // the drone under the Glyphglade: deliberately unstable, three fifths that never settle
    drone: [
      { f: 36.7, gain: 0.13, cut: 150, voices: 4, ratios: [1, 1.498, 2.006, 2.98], detune: 14, wave: 'sawtooth', mod: 0.0061 },
      { f: 110, gain: 0.045, cut: 420, voices: 3, ratios: [1, 1.19, 1.51], detune: 18, wave: 'triangle', mod: 0.0113 },
    ],
    shimmer: { f: 587.33, gain: 0.035, partials: [1, 1.5, 2.01, 3.03, 4.07] },
    events: [
      ['amb.whisper', 8, 26, 0.9],
      ['amb.void_pulse', 10, 30, 0.85],
      ['amb.bell_far', 30, 80, 0.5],
      ['amb.drip', 6, 20, 0.5],
      ['amb.gust', 16, 44, 0.5],
    ],
  },
};

/* ---------- the manager ---------------------------------------------------- */

export function createAmbience(actx, mix, voices, rng) {
  const cache = {};
  let bed = null;
  let bedId = '';
  let level = 1;
  let windMul = 1;
  const timers = [];

  function schedule(now) {
    const spec = BEDS[bedId];
    timers.length = 0;
    if (!spec) return;
    for (const e of spec.events) timers.push({ key: e[0], min: e[1], max: e[2], vol: e[3], at: now + rng.range(0.5, e[2] * 0.7) });
  }

  function tick(now) {
    if (!bedId) return;
    for (let i = 0; i < timers.length; i++) {
      const t = timers[i];
      if (now < t.at) continue;
      t.at = now + rng.range(t.min, t.max);
      voices.play(t.key, {
        pan: rng.range(-0.8, 0.8),
        volume: t.vol * rng.range(0.6, 1.05) * level,
        pitch: rng.range(0.88, 1.14),
      });
    }
  }

  return {
    get current() { return bedId; },

    /** @param id  a BEDS key, or null to fade everything out */
    set(id, fade = 2.5) {
      if (id === bedId) return;
      if (bed) { bed.stop(fade); bed = null; }
      bedId = id && BEDS[id] ? id : '';
      timers.length = 0;
      if (!bedId) return;
      const spec = BEDS[bedId];
      bed = buildBed(actx, mix.input('ambience'), spec, cache);
      bed.start(spec.level * level, fade);
      bed.setWind(windMul, 0.1);
      mix.setRoom(spec.room, fade * 0.4);
      schedule(actx.currentTime);
    },

    setLevel(v, fade = 1) {
      level = Math.max(0, Math.min(2, v));
      if (bed && bedId) bed.setLevel(BEDS[bedId].level * level, fade);
    },

    /** Galewrench, storms, a boss tearing the arena open. */
    setWind(mul, fade = 1.5) {
      windMul = Math.max(0, Math.min(3, mul));
      if (bed) bed.setWind(windMul, fade);
    },

    tick,
    stop(fade = 2) { if (bed) { bed.stop(fade); bed = null; } bedId = ''; timers.length = 0; },
    get beds() { return Object.keys(BEDS); },
  };
}
