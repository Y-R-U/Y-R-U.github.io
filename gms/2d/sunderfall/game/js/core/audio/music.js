/**
 * Adaptive generative score.
 *
 * Medieval-magical, D natural minor, all synthesis: physically-modelled plucked string
 * (Karplus-Strong rendered in JS, because WebAudio's feedback-delay route detunes short
 * strings by a whole block), bowed low strings from detuned saws, an additive choral
 * pad, a frame drum and a distant bell.
 *
 * Nothing repeats exactly: the melody is generated per bar from the current chord, the
 * ornaments and rests are stochastic, and the pad drifts.
 *
 * State machine: silent -> explore -> tension -> combat -> boss (plus victory).
 * Transitions land **on the bar**, and escalation fires a real transition gesture — a
 * riser, a cymbal-ish swell and a drum entry — rather than crossfading into silence.
 */

import { makeRng, karplus, white, pink, svf, env, softClip, normalize } from './dsp.js';

const A4 = 440;
const hz = (m) => A4 * Math.pow(2, (m - 69) / 12);

// D natural minor. Degrees are semitone offsets from D.
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const D3 = 50, D2 = 38;

/** [rootSemitoneFromD, chordTones(semitones from chord root)] */
const CH = {
  i: [0, [0, 3, 7]],
  III: [3, [0, 4, 7]],
  iv: [5, [0, 3, 7]],
  v: [7, [0, 3, 7]],
  V: [7, [0, 4, 7]],
  VI: [8, [0, 4, 7]],
  VII: [10, [0, 4, 7]],
  bII: [1, [0, 4, 7]],      // phrygian — the boss chord
  isus: [0, [0, 5, 7]],
};

const STATES = {
  silent: { bpm: 64, prog: ['i'], layers: {} },
  explore: {
    bpm: 62, prog: ['i', 'VI', 'III', 'VII'], barsPerChord: 2, gain: 0.82,
    layers: { bass: 0.5, pad: 0.42, pluck: 0.7, bell: 0.3 }, restProb: 0.42, density: 0.5,
  },
  tension: {
    bpm: 74, prog: ['i', 'i', 'VI', 'v'], barsPerChord: 1, gain: 1.0,
    layers: { bass: 0.8, pad: 0.6, pluck: 0.35, trem: 0.5, bell: 0.22, drum: 0.35 }, restProb: 0.5, density: 0.45,
  },
  combat: {
    bpm: 96, prog: ['i', 'i', 'VI', 'VII'], barsPerChord: 1, gain: 1.25,
    layers: { bass: 1.0, pad: 0.45, pulse: 1.0, drum: 1.0, trem: 0.6, pluck: 0.15 }, restProb: 0.55, density: 0.4,
  },
  boss: {
    bpm: 104, prog: ['i', 'bII', 'i', 'VI'], barsPerChord: 1, gain: 1.4,
    layers: { bass: 1.0, pad: 0.5, pulse: 0.95, drum: 1.0, trem: 0.7, choir: 0.7, bell: 0.35 }, restProb: 0.6, density: 0.35,
  },
  victory: {
    bpm: 68, prog: ['VI', 'III', 'VII', 'i'], barsPerChord: 2, gain: 0.95,
    layers: { bass: 0.45, pad: 0.6, pluck: 0.7, bell: 0.5 }, restProb: 0.35, density: 0.55,
  },
  menu: {
    bpm: 56, prog: ['i', 'VI'], barsPerChord: 4, gain: 0.8,
    layers: { bass: 0.4, pad: 0.5, pluck: 0.5, bell: 0.35 }, restProb: 0.55, density: 0.4,
  },
};

const LAYER_NAMES = ['bass', 'pad', 'pluck', 'bell', 'trem', 'pulse', 'drum', 'choir'];

/* ------------------------------------------------------------------ *
 * Instruments
 * ------------------------------------------------------------------ */

function sustained(actx, dest, cfg) {
  const out = actx.createGain();
  out.gain.value = 0.0001;
  const filt = actx.createBiquadFilter();
  filt.type = cfg.filter || 'lowpass';
  filt.frequency.value = cfg.cut;
  filt.Q.value = cfg.q ?? 0.9;
  filt.connect(out);
  out.connect(dest);

  const voices = [];
  for (let i = 0; i < cfg.n; i++) {
    const o = actx.createOscillator();
    o.type = cfg.wave;
    o.frequency.value = 110;
    o.detune.value = (i - (cfg.n - 1) / 2) * (cfg.detune ?? 6);
    const g = actx.createGain();
    g.gain.value = (cfg.mix ? cfg.mix[i % cfg.mix.length] : 1) / cfg.n;
    o.connect(g); g.connect(filt);
    o.start();
    voices.push(o);
  }
  // vibrato / drift, so a held chord is never dead still
  const vib = actx.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = cfg.vib ?? 4.7;
  const vg = actx.createGain();
  vg.gain.value = cfg.vibDepth ?? 4;
  vib.connect(vg);
  for (const v of voices) vg.connect(v.detune);
  vib.start();

  return {
    out, filt, voices,
    setNotes(midis, t, glide = 0.12) {
      for (let i = 0; i < voices.length; i++) {
        const m = midis[i % midis.length] + (i >= midis.length ? 12 : 0);
        voices[i].frequency.setTargetAtTime(hz(m), t, glide);
      }
    },
    level(v, t, tau = 0.35) { out.gain.setTargetAtTime(Math.max(0.0001, v), t, tau); },
    swell(t, peak, len) {
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
      out.gain.linearRampToValueAtTime(Math.max(0.0001, peak), t + len * 0.35);
      out.gain.setTargetAtTime(Math.max(0.0001, peak * 0.62), t + len * 0.4, len * 0.3);
    },
    stop(t) {
      out.gain.setTargetAtTime(0.0001, t, 0.4);
      for (const v of voices) { try { v.stop(t + 3); } catch { /* ignore */ } }
      try { vib.stop(t + 3); } catch { /* ignore */ }
    },
  };
}

export function createMusic(actx, mix, seed = 1337) {
  const rng = makeRng(seed);
  const dest = mix.input('music');

  const root = actx.createGain();
  // headroom: at full boss intensity the score must still leave room for an explosion
  root.gain.value = 0.62;

  // Bus glue. The frame drum has a crest factor of about 5 against the sustained
  // layers; without this the score's peak triples while its loudness barely moves,
  // and every peak of headroom here is headroom an explosion does not get.
  const glue = actx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 8;
  glue.ratio.value = 3.5;
  glue.attack.value = 0.006;
  glue.release.value = 0.22;
  root.connect(glue);
  glue.connect(dest);

  const send = actx.createGain();
  send.gain.value = 0.28;
  send.connect(mix.reverbSend);
  glue.connect(send);

  // per-layer output gains, so a state change is a set of level ramps
  const L = {};
  for (const n of LAYER_NAMES) {
    const g = actx.createGain();
    g.gain.value = 0.0001;
    g.connect(root);
    L[n] = g;
  }

  const bass = sustained(actx, L.bass, { n: 3, wave: 'sawtooth', cut: 320, q: 1.4, detune: 9, vib: 3.1, vibDepth: 3 });
  const pad = sustained(actx, L.pad, { n: 5, wave: 'triangle', cut: 1400, q: 0.7, detune: 5, vib: 4.9, vibDepth: 5, mix: [1, 0.8, 0.65, 0.5, 0.35] });
  const trem = sustained(actx, L.trem, { n: 3, wave: 'sawtooth', cut: 2600, q: 2.0, detune: 12, vib: 6.3, vibDepth: 9 });
  const choir = sustained(actx, L.choir, { n: 4, wave: 'sine', cut: 3200, q: 0.8, detune: 16, vib: 5.7, vibDepth: 11 });
  bass.level(1, actx.currentTime, 0.01);
  pad.level(1, actx.currentTime, 0.01);
  trem.level(0.7, actx.currentTime, 0.01);
  choir.level(0.55, actx.currentTime, 0.01);

  // fast tremolo on the bowed layer — bowed tremolo is the cheapest tension in music
  {
    const t = actx.createOscillator();
    t.type = 'sine';
    t.frequency.value = 11.3;
    const g = actx.createGain();
    g.gain.value = 0.42;
    t.connect(g);
    g.connect(trem.out.gain);
    t.start();
  }

  /* ---- transient instruments ---- */

  const pluckCache = new Map();
  function pluckBuf(midi, bright) {
    const k = midi * 4 + (bright ? 1 : 0);
    let b = pluckCache.get(k);
    if (b) return b;
    const sr = actx.sampleRate;
    const n = Math.ceil(2.2 * sr);
    const data = karplus(n, sr, hz(midi), {
      rng: makeRng(1000 + midi), bright: bright ? 0.55 : 0.33, damp: 0.34, loss: 0.00035, pick: 0.26,
    });
    normalize(data, 0.9);
    b = actx.createBuffer(1, data.length, sr);
    b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
    pluckCache.set(k, b);
    return b;
  }

  function playPluck(midi, t, vel, bright) {
    const s = actx.createBufferSource();
    s.buffer = pluckBuf(midi, bright);
    s.playbackRate.value = 1 + (rng.next() - 0.5) * 0.004;
    const g = actx.createGain();
    g.gain.setValueAtTime(vel, t);
    s.connect(g); g.connect(L.pluck);
    s.start(t);
    s.stop(t + 2.3);
  }

  const bellCache = new Map();
  function bellBuf(midi) {
    let b = bellCache.get(midi);
    if (b) return b;
    const sr = actx.sampleRate;
    const n = Math.ceil(4.5 * sr);
    const data = new Float32Array(n);
    const f = hz(midi);
    const parts = [[0.5, 0.22, 4.0], [1, 0.5, 3.4], [1.19, 0.28, 2.4], [1.56, 0.2, 1.8], [2, 0.14, 1.6], [2.51, 0.08, 1.1], [3.01, 0.05, 0.8]];
    for (const [r, a, d] of parts) {
      const k = Math.exp(-1 / (d * sr));
      const dp = 2 * Math.PI * f * r / sr;
      let ph = rng.next() * 6.283, g = a;
      for (let i = 0; i < n; i++) { data[i] += Math.sin(ph) * g; ph += dp; g *= k; if (g < 1e-6) break; }
    }
    normalize(data, 0.9);
    b = actx.createBuffer(1, n, sr);
    b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
    bellCache.set(midi, b);
    return b;
  }

  function playBell(midi, t, vel) {
    const s = actx.createBufferSource();
    s.buffer = bellBuf(midi);
    const g = actx.createGain();
    g.gain.setValueAtTime(vel, t);
    s.connect(g); g.connect(L.bell);
    s.start(t);
    s.stop(t + 4.6);
  }

  let drumBuf = null, drumHi = null;
  function makeDrums() {
    const sr = actx.sampleRate;
    const n = Math.ceil(0.55 * sr);
    const d = new Float32Array(n);
    const r = makeRng(77);
    // frame drum: a pitch-dropping sine with a skin slap on top
    let ph = 0, g = 1;
    const k = Math.exp(-1 / (0.16 * sr));
    for (let i = 0; i < n; i++) {
      const u = 1 - Math.exp(-i / (0.012 * sr));
      d[i] += Math.sin(ph) * g;
      ph += 2 * Math.PI * (150 - 88 * u) / sr;
      g *= k;
    }
    const skin = new Float32Array(n);
    white(skin, r, 0.8);
    svf(skin, sr, { mode: 'bp', f0: 900, f1: 260, q: 1.1 });
    env(skin, sr, { a: 0.0008, d: 0.09, curve: 3 });
    for (let i = 0; i < n; i++) d[i] += skin[i] * 0.5;
    softClip(d, 1.2);
    normalize(d, 0.92);
    drumBuf = actx.createBuffer(1, n, sr);
    drumBuf.copyToChannel ? drumBuf.copyToChannel(d, 0) : drumBuf.getChannelData(0).set(d);

    const m = Math.ceil(0.3 * sr);
    const h = new Float32Array(m);
    pink(h, makeRng(91), 0.9);
    svf(h, sr, { mode: 'bp', f0: 2600, f1: 1200, q: 0.9 });
    env(h, sr, { a: 0.0006, d: 0.13, curve: 3.4 });
    normalize(h, 0.9);
    drumHi = actx.createBuffer(1, m, sr);
    drumHi.copyToChannel ? drumHi.copyToChannel(h, 0) : drumHi.getChannelData(0).set(h);
  }

  function playDrum(t, vel, high) {
    if (!drumBuf) makeDrums();
    const s = actx.createBufferSource();
    s.buffer = high ? drumHi : drumBuf;
    s.playbackRate.value = 0.94 + rng.next() * 0.12;
    const g = actx.createGain();
    g.gain.setValueAtTime(vel, t);
    s.connect(g); g.connect(L.drum);
    s.start(t);
    s.stop(t + 0.7);
  }

  function playStab(midi, t, vel, len) {
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(midi);
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(420, t + len * 1.2);
    f.Q.value = 3;
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + len * 0.5, len * 0.25);
    o.connect(f); f.connect(g); g.connect(L.pulse);
    o.start(t);
    o.stop(t + len * 2 + 0.2);
  }

  /** The escalation gesture. Without this, "adaptive music" is just a crossfade. */
  function playRiser(t, len, up) {
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    const f = actx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3.5;
    const g = actx.createGain();
    o.connect(f); f.connect(g); g.connect(root);
    if (up) {
      o.frequency.setValueAtTime(hz(D2), t);
      o.frequency.exponentialRampToValueAtTime(hz(D3 + 12), t + len);
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(4200, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + len * 0.92);
      g.gain.setTargetAtTime(0.0001, t + len, 0.12);
    } else {
      o.frequency.setValueAtTime(hz(D3), t);
      o.frequency.exponentialRampToValueAtTime(hz(D2), t + len);
      f.frequency.setValueAtTime(2200, t);
      f.frequency.exponentialRampToValueAtTime(280, t + len);
      g.gain.setValueAtTime(0.09, t);
      g.gain.setTargetAtTime(0.0001, t + len * 0.5, len * 0.3);
    }
    o.start(t);
    o.stop(t + len + 0.5);

    // air: a noise swell that arrives with the downbeat
    if (!drumBuf) makeDrums();
    const s = actx.createBufferSource();
    s.buffer = drumHi;
    s.playbackRate.value = 0.25;
    const sg = actx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(up ? 0.5 : 0.2, t + len * 0.9);
    sg.gain.setTargetAtTime(0.0001, t + len, 0.2);
    s.connect(sg); sg.connect(root);
    s.start(t);
    s.stop(t + len + 0.6);
  }

  /* ---- the sequencer ---- */

  let state = 'silent';
  let pending = null;
  let bpm = 62;
  let beat = 0;
  let nextTime = 0;
  let running = false;
  let chordIdx = 0;
  let curChord = CH.i;
  let heat = 0, heatSmooth = 0;
  let combatHold = 0;
  let bossPhase = 0;
  let lastMelody = 62;
  let locked = false;
  // Auto explore/tension/combat only runs once someone drives setIntensity(). An
  // explicit set('combat') must stick, or a caller that never touches intensity gets
  // silently dragged back to explore on the next bar.
  let auto = false;

  const spb = () => 60 / bpm;

  function chordNotes(ch, base) {
    const [r, tones] = ch;
    const out = [];
    for (const t of tones) out.push(base + r + t);
    return out;
  }

  function applyLayers(t, tau = 0.9) {
    const s = STATES[state];
    const g = (s.gain ?? 1) * 0.5;
    for (const n of LAYER_NAMES) {
      const v = (s.layers[n] || 0) * (n === 'choir' && state === 'boss' ? 0.6 + bossPhase * 0.6 : 1);
      L[n].gain.setTargetAtTime(Math.max(0.0001, v * g), t, tau);
    }
  }

  function enterState(name, t) {
    if (!STATES[name] || name === state) return;
    const from = state;
    const up = rank(name) > rank(from);
    state = name;
    bpm = STATES[name].bpm * (name === 'boss' ? 1 + bossPhase * 0.06 : 1);
    chordIdx = 0;
    applyLayers(t, up ? 0.5 : 1.6);
    if (from !== 'silent' && name !== 'silent') {
      // the riser has to land ON the downbeat, but never schedule into the past
      const rl = spb() * 2;
      playRiser(Math.max(actx.currentTime + 0.01, t - rl), rl, up);
      if (up) {
        playDrum(t, 0.9, false);
        playDrum(t, 0.5, true);
      } else {
        playBell(D3 - 12, t, 0.22);
      }
    }
  }

  function rank(n) { return { silent: 0, menu: 1, explore: 2, victory: 2, tension: 3, combat: 4, boss: 5 }[n] ?? 0; }

  function scheduleBar(bar, t) {
    const s = STATES[state];
    const bpc = s.barsPerChord || 1;
    if (bar % bpc === 0) {
      chordIdx = (chordIdx + 1) % s.prog.length;
    }
    curChord = CH[s.prog[chordIdx]] || CH.i;
    const base = D3;

    const notes = chordNotes(curChord, base);
    pad.setNotes(notes.concat([notes[0] + 12, notes[1] + 12]), t, 0.6);
    pad.swell(t, 0.9, spb() * 4);
    bass.setNotes([base - 12 + curChord[0], base - 12 + curChord[0], base - 5 + curChord[0]], t, 0.25);
    bass.swell(t, 1.0, spb() * 4);
    // the bowed layer climbs a register per state — that, not volume, is what makes
    // tension / combat / boss read as three different pieces rather than three mixes
    const oct = state === 'boss' ? 24 : state === 'combat' ? 12 : 0;
    trem.setNotes([notes[1] + oct, notes[2] + oct, notes[0] + 12 + oct], t, 0.3);
    trem.filt.frequency.setTargetAtTime(state === 'boss' ? 4200 : state === 'combat' ? 2600 : 1000, t, 0.6);
    if (state === 'boss') {
      // a cluster a semitone apart: the Seam does not sing in tune
      choir.setNotes([base + 12 + curChord[0], base + 13 + curChord[0], base + 19 + curChord[0], base + 24 + curChord[0]], t, 0.4);
    }

    if (s.layers.bell && rng.next() < (state === 'boss' ? 0.5 : 0.22)) {
      playBell(base - 12 + curChord[0], t + spb() * rng.int(0, 3), 0.16 + rng.next() * 0.12);
    }
  }

  function scheduleBeat(b, t) {
    const s = STATES[state];
    const inBar = b & 3;
    if (inBar === 0) scheduleBar(b >> 2, t);

    // drum
    if (s.layers.drum) {
      const heavy = state === 'boss';
      if (inBar === 0) playDrum(t, 1.0, false);
      else if (inBar === 2) playDrum(t, heavy ? 0.85 : 0.68, false);
      if (heavy && rng.next() < 0.4) playDrum(t + spb() * 0.5, 0.4, true);
      if (state === 'combat' && rng.next() < 0.3) playDrum(t + spb() * 0.75, 0.3, true);
    }

    // driving ostinato
    if (s.layers.pulse) {
      const r = D3 - 12 + curChord[0];
      playStab(r, t, 0.42, spb() * 0.45);
      playStab(r + 7, t + spb() * 0.5, 0.26, spb() * 0.35);
      if (state === 'boss' && inBar === 3) playStab(r + 12, t + spb() * 0.75, 0.28, spb() * 0.3);
    }

    // the lone plucked instrument: a phrase, not an arpeggio
    if (s.layers.pluck) {
      const steps = rng.next() < s.density ? 2 : 1;
      for (let i = 0; i < steps; i++) {
        if (rng.next() < s.restProb) continue;
        const at = t + spb() * (i / steps);
        lastMelody = nextMelodyNote(lastMelody, curChord);
        playPluck(lastMelody, at, 0.16 + rng.next() * 0.14, rng.next() < 0.25);
        if (rng.next() < 0.12) playPluck(lastMelody + 12, at + spb() * 0.12, 0.06, true);
      }
    }
  }

  /** Weighted random walk that resolves toward chord tones on strong beats. */
  function nextMelodyNote(prev, chord) {
    const rootPc = (D3 + chord[0]) % 12;
    const tones = chord[1].map(t => (rootPc + t) % 12);
    let best = prev, bestScore = -1e9;
    for (let k = 0; k < 7; k++) {
      const step = rng.int(-4, 4);
      const cand = prev + step;
      if (cand < 55 || cand > 84) continue;
      const pc = ((cand % 12) + 12) % 12;
      const inScale = SCALE.includes(((pc - 2) % 12 + 12) % 12);   // D = pitch class 2
      if (!inScale) continue;
      let score = -Math.abs(step) * 0.6 + rng.next() * 2;
      if (tones.includes(pc)) score += 2.2;
      if (cand > 76) score -= (cand - 76) * 0.5;
      if (cand < 60) score -= (60 - cand) * 0.4;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return best;
  }

  const LOOKAHEAD = 0.22;

  function tick(now) {
    if (!running) return;

    // intensity -> state, with dwell so a single kill does not flip the score
    heatSmooth += (heat - heatSmooth) * 0.06;
    if (auto && !locked && state !== 'boss' && state !== 'silent' && state !== 'victory' && state !== 'menu') {
      let want = state;
      if (heatSmooth > 0.5) want = 'combat';
      else if (heatSmooth > 0.18) want = 'tension';
      else want = 'explore';
      if (state === 'combat') { combatHold -= 1 / 40; if (combatHold > 0 && rank(want) < rank('combat')) want = 'combat'; }
      if (want === 'combat') combatHold = 6;
      if (want !== state) pending = want;
    }

    while (nextTime < now + LOOKAHEAD) {
      if (pending && (beat & 3) === 0) {
        enterState(pending, nextTime);
        pending = null;
      }
      scheduleBeat(beat, nextTime);
      nextTime += spb();
      beat++;
    }
  }

  return {
    get state() { return state; },
    get bpm() { return bpm; },
    get intensity() { return heat; },
    get running() { return running; },

    /**
     * @param name  a STATES key, or null/false to stop
     * @param o     { fade, immediate } — immediate skips bar quantisation
     */
    set(name, o = {}) {
      if (!name) return this.stop(o.fade ?? 2);
      if (!STATES[name]) return;
      locked = name === 'boss' || name === 'victory' || name === 'menu';
      auto = !!o.auto;
      if (!running) {
        running = true;
        state = 'silent';
        beat = 0;
        nextTime = actx.currentTime + 0.12;
        applyLayers(actx.currentTime, 0.05);
      }
      if (o.immediate) enterState(name, actx.currentTime + 0.05);
      else pending = name;
    },

    /** 0..1 combat heat. Drives explore/tension/combat automatically. */
    /** Using this hands explore/tension/combat selection to the intensity curve. */
    setIntensity(v, immediate = false) {
      heat = Math.max(0, Math.min(1, v || 0));
      if (immediate) heatSmooth = heat;
      auto = true;
    },

    /** 0..1 — the Seam growing. Adds the choir and pushes the tempo. */
    setBossPhase(v) {
      bossPhase = Math.max(0, Math.min(1, v || 0));
      if (state === 'boss') {
        bpm = STATES.boss.bpm * (1 + bossPhase * 0.06);
        applyLayers(actx.currentTime, 1.2);
      }
    },

    stop(fade = 2) {
      const t = actx.currentTime;
      for (const n of LAYER_NAMES) L[n].gain.setTargetAtTime(0.0001, t, Math.max(0.05, fade * 0.3));
      running = false;
      pending = null;
      state = 'silent';
      locked = false;
    },

    tick,
    states() { return Object.keys(STATES); },
    dispose() {
      const t = actx.currentTime;
      running = false;
      bass.stop(t); pad.stop(t); trem.stop(t); choir.stop(t);
      try { root.disconnect(); } catch { /* ignore */ }
    },
  };
}

export { STATES as MUSIC_STATES };
