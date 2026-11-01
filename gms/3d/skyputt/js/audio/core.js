// SKYPUTT audio — shared helpers. Procedural Web Audio only (no audio files).
// Everything here works on any BaseAudioContext, so the same recipes render live and offline.

export const EPS = 0.0001;                        // exponential ramps cannot reach 0
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[(Math.random() * a.length) | 0];
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Freeze an AudioParam at its current value so a new ramp starts from there (no jumps).
export function holdParam(p, t) {
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
  else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
}

// Per-context cache for generated buffers (noise, impulse, harp plucks, applause).
const caches = new WeakMap();
export function shared(ctx) {
  let s = caches.get(ctx);
  if (!s) caches.set(ctx, (s = {}));
  return s;
}

// Seamlessly looping noise: generate n + fade samples and crossfade the overlap into the head.
export function noiseBuffer(ctx, kind = 'white', seconds = 2) {
  const s = shared(ctx), key = 'noise_' + kind;
  if (s[key]) return s[key];
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), f = Math.floor(sr * 0.05);
  const g = new Float32Array(n + f);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n + f; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {                         // Paul Kellett's pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      g[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02; g[i] = last * 3.5;
    } else g[i] = w;
  }
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = i < f ? g[i] * (i / f) + g[n + i] * (1 - i / f) : g[i];
  return (s[key] = b);
}

// Stereo reverb impulse: pre-delay, a few early reflections, then decorrelated noise that
// decays exponentially and darkens over time (a one-pole lowpass whose cutoff falls).
export function impulseBuffer(ctx, seconds = 2.0) {
  const s = shared(ctx);
  if (s.impulse) return s.impulse;
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), pre = Math.floor(sr * 0.012);
  const b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const a = 0.06 + 0.75 * Math.exp(-t * 4);
      lp += a * ((Math.random() * 2 - 1) - lp);
      const fadeIn = Math.min(1, (i - pre) / (sr * 0.004));
      d[i] = lp * Math.exp(-t * 6.2) * fadeIn * (1.2 - a * 0.4);
    }
    for (let k = 0; k < 9; k++) {
      const idx = pre + Math.floor(rnd(0.004, 0.075) * sr);
      d[idx] += rnd(-0.5, 0.5) * (1 - k / 11);
    }
  }
  return (s.impulse = b);
}

// ---- voices --------------------------------------------------------------------------------
// A voice is a small output stage (gain -> optional pan -> bus dry + reverb send) that
// disconnects itself when every source started into it has ended.

export function voice(E, { gain = 1, pan = 0, verb = 0.12, bus = 'sfx' } = {}) {
  const ctx = E.ctx, b = E[bus];
  const g = ctx.createGain(); g.gain.value = gain;
  const v = { ctx, E, in: g, nodes: [g], pending: 0, pan: null };
  let node = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    g.connect(p); node = p; v.pan = p; v.nodes.push(p);
  }
  node.connect(b.dry);
  if (verb > 0) {
    const s = ctx.createGain(); s.gain.value = verb;
    node.connect(s); s.connect(b.wet); v.nodes.push(s);
  }
  return v;
}

export function track(v, src) {
  v.pending++;
  src.onended = () => {
    try { src.disconnect(); } catch { /* already gone */ }
    if (--v.pending === 0) for (const n of v.nodes) { try { n.disconnect(); } catch { /* */ } }
  };
}

// attack/decay envelope: 0 -> peak (linear) -> EPS (exponential). Click-free at both ends.
export function envAD(p, t, att, peak, dur, hold = 0) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + att);
  if (hold > 0) p.setValueAtTime(peak, t + att + hold);
  p.exponentialRampToValueAtTime(EPS, t + att + hold + dur);
}

// glide: [[freq, atTimeOffset], ...] exponential pitch moves after t.
export function osc(v, t, { type = 'sine', f = 440, glide = null, gain = 0.3, att = 0.003, dur = 0.3,
  hold = 0, detune = 0, dest = null, wave = null } = {}) {
  const ctx = v.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  if (wave) o.setPeriodicWave(wave); else o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (glide) for (const [ff, dt] of glide) o.frequency.exponentialRampToValueAtTime(ff, t + dt);
  if (detune) o.detune.value = detune;
  envAD(g.gain, t, att, gain, dur, hold);
  o.connect(g); g.connect(dest || v.in);
  o.start(t); o.stop(t + att + hold + dur + 0.03);
  track(v, o);
  return { o, g };
}

// Filtered noise burst. f2 = filter end frequency (exponential sweep over the whole burst).
export function noise(v, t, { kind = 'white', type = 'bandpass', f = 1000, f2 = 0, q = 1, gain = 0.3,
  att = 0.002, dur = 0.2, hold = 0, dest = null, sweep = 0 } = {}) {
  const ctx = v.ctx, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuffer(ctx, kind); src.loop = true;
  flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + (sweep || att + hold + dur));
  envAD(g.gain, t, att, gain, dur, hold);
  src.connect(flt); flt.connect(g); g.connect(dest || v.in);
  src.start(t, Math.random() * 1.5); src.stop(t + att + hold + dur + 0.03);
  track(v, src);
  return { src, flt, g };
}

// Modal impact: a sum of decaying sine partials [[freq, amp, decaySeconds], ...].
export function modal(v, t, partials, { gain = 1, att = 0.0008, dest = null } = {}) {
  for (const [f, a, d] of partials) osc(v, t, { f, gain: a * gain, att, dur: d, dest });
}

// Two-operator FM bell. ratio 3.5 = glassy bell, 2 = coin-like, 1.4 = soft celesta.
export function bell(v, t, { f = 880, gain = 0.2, dur = 1.2, ratio = 3.5, index = 1.2, att = 0.002, dest = null } = {}) {
  const ctx = v.ctx, c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  c.frequency.value = f; m.frequency.value = f * ratio;
  mg.gain.setValueAtTime(index * f, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, index * f * 0.04), t + dur * 0.6);
  envAD(g.gain, t, att, gain, dur);
  m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(dest || v.in);
  const end = t + att + dur + 0.03;
  c.start(t); m.start(t); c.stop(end); m.stop(end);
  track(v, c); track(v, m);
  return g;
}

// A helper filter node inside a voice (gets disconnected with the voice).
export function filter(v, type, f, q = 1, dest = null) {
  const n = v.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q;
  n.connect(dest || v.in); v.nodes.push(n);
  return n;
}
