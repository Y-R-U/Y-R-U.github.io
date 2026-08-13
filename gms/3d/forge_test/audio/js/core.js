// Audio graph, buses, reverb IR, envelopes, Karplus-Strong renderer.
// Everything takes an engine so the same code renders in an OfflineAudioContext.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiOf(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) return NaN;
  return PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = f => 69 + 12 * Math.log2(f / 440);
export const freqOf = n => typeof n === 'number' ? mtof(n) : mtof(midiOf(n));

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const nameOf = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

function satCurve(k) {
  const n = 2048, c = new Float32Array(n), d = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / d;
  return c;
}

function makeIR(ctx, seconds, decay, damp) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.011);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // one-pole coefficient falls with time, so the tail darkens like a real hall
      const a = Math.max(0.02, damp * Math.pow(1 - t, 1.4));
      const n = i < pre ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      lp += a * (n - lp);
      d[i] = lp;
      if (Math.abs(lp) > peak) peak = Math.abs(lp);
    }
    // sparse early reflections
    for (let k = 0; k < 7; k++) {
      const i = pre + Math.floor(sr * (0.013 + k * 0.0091 + Math.random() * 0.004));
      if (i < len) d[i] += (Math.random() * 2 - 1) * 0.5 * Math.pow(0.72, k);
    }
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak * 3.2;
  }
  return buf;
}

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function createEngine(ctx, opts = {}) {
  const dry = ctx.createGain();
  const verbIn = ctx.createGain();
  const verb = ctx.createConvolver();
  const verbOut = ctx.createGain();
  const bus = ctx.createGain();
  const dcCut = ctx.createBiquadFilter();
  const sat = ctx.createWaveShaper();
  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  const analyser = ctx.createAnalyser();

  verb.buffer = makeIR(ctx, opts.irSeconds ?? 2.6, opts.irDecay ?? 2.4, opts.irDamp ?? 0.6);
  verbOut.gain.value = opts.wet ?? 0.9;
  dcCut.type = 'highpass'; dcCut.frequency.value = 22; dcCut.Q.value = 0.5;
  sat.curve = satCurve(1.6); sat.oversample = '2x';
  comp.threshold.value = -13; comp.knee.value = 22; comp.ratio.value = 3;
  comp.attack.value = 0.005; comp.release.value = 0.2;
  master.gain.value = opts.master ?? 0.72;
  analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.4;

  dry.connect(bus);
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(bus);
  bus.connect(dcCut); dcCut.connect(sat); sat.connect(comp);
  comp.connect(master); master.connect(analyser); analyser.connect(ctx.destination);

  const eng = {
    ctx, dry, verbIn, verbOut, master, analyser, comp,
    noise: makeNoise(ctx, 3),
    live: [],          // {s,e} per voice — a voice that never releases has a non-finite e
    garbage: [],
    ksCache: new Map(),
    now: () => ctx.currentTime,
  };

  eng.track = (startAt, stopAt) => { eng.live.push({ s: startAt, e: stopAt }); };
  eng.activeAt = t => eng.live.reduce((n, v) => n + (v.s <= t && v.e > t ? 1 : 0), 0);

  eng.voice = (t, dur, send = 0) => {
    const g = ctx.createGain();
    g.connect(dry);
    if (send > 0) {
      const s = ctx.createGain(); s.gain.value = send;
      g.connect(s); s.connect(verbIn);
      eng.garbage.push({ n: s, t: t + dur + 4 });
    }
    eng.track(t, t + dur);
    eng.garbage.push({ n: g, t: t + dur + 4 });
    return g;
  };

  eng.reap = () => {
    const t = ctx.currentTime;
    for (let i = eng.garbage.length - 1; i >= 0; i--) {
      if (eng.garbage[i].t < t) { try { eng.garbage[i].n.disconnect(); } catch {} eng.garbage.splice(i, 1); }
    }
    if (eng.live.length > 512) eng.live = eng.live.filter(v => v.e > t - 1);
  };

  eng.noiseSrc = (t, dur, rate = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = eng.noise; s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * 2, dur + 0.05);
    s.stop(t + dur + 0.05);
    return s;
  };

  eng.setWet = v => { verbOut.gain.value = v; };
  eng.setRoom = (seconds, decay, damp) => { verb.buffer = makeIR(ctx, seconds, decay, damp); };

  eng.ks = (freq, dur, p) => {
    const key = `${freq.toFixed(2)}|${dur.toFixed(2)}|${p.t60}|${p.damp}|${p.tone}|${p.body || 0}`;
    let b = eng.ksCache.get(key);
    if (b) return b;
    b = ksBuffer(ctx, freq, dur, p);
    if (eng.ksCache.size > 220) eng.ksCache.clear();
    eng.ksCache.set(key, b);
    return b;
  };

  return eng;
}

// Karplus-Strong: delay line the length of one period, lowpassed feedback.
// Rendered into a buffer in JS because Web Audio has no sample-rate feedback path.
export function ksBuffer(ctx, freq, dur, p) {
  const sr = ctx.sampleRate;
  const n = Math.max(64, Math.round(dur * sr));
  const damp = Math.min(0.95, Math.max(0.05, p.damp));
  // the feedback lowpass adds (1-damp)/damp samples of delay; subtract it or the note plays flat
  const L = Math.max(3, sr / freq - (1 - damp) / damp);
  const D = Math.floor(L), frac = L - D;
  const line = new Float32Array(D);
  const decay = Math.pow(0.001, 1 / (Math.max(0.05, p.t60) * sr));

  let s = 0;
  const tone = Math.min(1, Math.max(0.02, p.tone));
  for (let i = 0; i < D; i++) { s += tone * ((Math.random() * 2 - 1) - s); line[i] = s; }
  let mean = 0; for (let i = 0; i < D; i++) mean += line[i];
  mean /= D;
  let pk = 0;
  for (let i = 0; i < D; i++) { line[i] -= mean; pk = Math.max(pk, Math.abs(line[i])); }
  if (pk > 0) for (let i = 0; i < D; i++) line[i] /= pk;

  const out = ctx.createBuffer(1, n, sr);
  const o = out.getChannelData(0);
  let idx = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const j = idx + 1 === D ? 0 : idx + 1;
    const v = line[idx] * (1 - frac) + line[j] * frac;
    o[i] = v;
    lp += damp * (v - lp);
    line[idx] = lp * decay;
    idx = j;
  }
  const fade = Math.min(Math.floor(sr * 0.02), n);
  for (let i = 0; i < fade; i++) o[n - 1 - i] *= i / fade;
  return out;
}

// ── envelopes ────────────────────────────────────────────────
const EPS = 0.0005;

export function perc(param, t, peak, attack, decay) {
  peak = Math.max(EPS * 2, peak);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
  param.linearRampToValueAtTime(0, t + attack + decay + 0.01);
}

export function adsr(param, t, peak, a, d, sus, hold, r) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(Math.max(EPS, peak * sus), t + a + d);
  const off = t + Math.max(a + d, hold);
  param.setValueAtTime(Math.max(EPS, peak * sus), off);
  param.exponentialRampToValueAtTime(EPS, off + r);
  param.linearRampToValueAtTime(0, off + r + 0.012);
  return off + r + 0.012;
}

export function biquad(ctx, type, freq, Q, gain) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  if (Q != null) f.Q.value = Q;
  if (gain != null) f.gain.value = gain;
  return f;
}

export function chain(nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[0];
}

export function shaper(ctx, k) {
  const w = ctx.createWaveShaper();
  w.curve = satCurve(k); w.oversample = '2x';
  return w;
}

export const rnd = (a, b) => a + Math.random() * (b - a);
