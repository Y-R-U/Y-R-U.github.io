/**
 * SILT — procedural SFX.
 *
 * Everything here is synthesised in Web Audio; there are no sample files. The
 * palette is deliberately granular and watery rather than chiptune: noise
 * grains, resonant sweeps and pitch-glided sines, never a square wave.
 *
 * Every voice takes a normalised magnitude `m` in 0..1. Loud is not the only
 * thing that changes with m — bigger events get more grains, a longer tail, a
 * lower body and a wider spectrum, which is what actually reads as "bigger".
 */

let _noise = null;
function noiseBuffer(ctx) {
  if (_noise && _noise.sampleRate === ctx.sampleRate) return _noise;
  const len = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;      // a touch of brown mixed in
    d[i] = w * 0.85 + last * 3.0;
  }
  _noise = b;
  return b;
}

function noise(ctx, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.playbackRate.value = rate;
  return s;
}

function gain(ctx, v = 0) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function filt(ctx, type, f, q = 1) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/** Exponential-ish decay that never touches zero (exponentialRamp hates it). */
function decay(param, t0, peak, dur, attack = 0.004) {
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(a, b) { return a + Math.random() * (b - a); }

/**
 * A burst of short filtered noise grains — the core "sand" texture.
 * Density falls off across the tail so it scatters rather than fades.
 */
function grains(ctx, out, wet, t0, o) {
  const n = o.count | 0;
  for (let i = 0; i < n; i++) {
    // front-loaded: most grains land in the first third of the tail
    const u = Math.pow(Math.random(), o.skew || 1.7);
    const t = t0 + u * o.dur;
    const life = rnd(o.life0 || 0.010, o.life1 || 0.045);
    const g = gain(ctx);
    const bp = filt(ctx, 'bandpass', Math.exp(lerp(Math.log(o.f0), Math.log(o.f1), Math.random())), rnd(2, 10));
    const s = noise(ctx, rnd(0.7, 1.4));
    s.connect(bp); bp.connect(g); g.connect(out);
    if (wet) g.connect(wet);
    const amp = o.gain * rnd(0.35, 1) * (1 - u * 0.65);
    decay(g.gain, t, amp, life, 0.0015);
    s.start(t, Math.random() * 1.5);
    s.stop(t + life + 0.02);
  }
}

/** A pitch-glided sine — the watery droplet at the heart of most cues. */
function blip(ctx, out, wet, t0, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 1), t0 + o.dur);
  const g = gain(ctx);
  decay(g.gain, t0, o.gain, o.dur * (o.tail || 1.2), o.attack || 0.005);
  osc.connect(g); g.connect(out);
  if (wet) g.connect(wet);
  osc.start(t0); osc.stop(t0 + o.dur * (o.tail || 1.2) + 0.06);
  return osc;
}

/** Noise through a sweeping resonant filter — whooshes and swells. */
function sweep(ctx, out, wet, t0, o) {
  const s = noise(ctx, o.rate || 1);
  const bp = filt(ctx, o.type || 'bandpass', o.f0, o.q0 || 3);
  bp.frequency.setValueAtTime(o.f0, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 20), t0 + o.dur);
  if (o.q1 != null) {
    bp.Q.setValueAtTime(o.q0 || 3, t0);
    bp.Q.linearRampToValueAtTime(o.q1, t0 + o.dur);
  }
  const g = gain(ctx);
  const a = o.attack != null ? o.attack : 0.01;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(o.gain, 0.0002), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + o.dur * (o.tail || 1));
  s.connect(bp); bp.connect(g); g.connect(out);
  if (wet) g.connect(wet);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + a + o.dur * (o.tail || 1) + 0.05);
}

// ---------------------------------------------------------------------------
// The six cues. Each: (ctx, out, wet, t, m) with m normalised 0..1.
// ---------------------------------------------------------------------------

/** A piece hitting the pile and coming apart into grains. */
function land(ctx, out, wet, t, m) {
  // body — a soft dull thud, deeper the bigger the piece
  const f0 = lerp(120, 78, m);
  blip(ctx, out, null, t, {
    type: 'triangle', f0, f1: f0 * 0.45,
    dur: lerp(0.07, 0.13, m), tail: 1.5,
    gain: lerp(0.16, 0.34, m), attack: 0.003,
  });
  // the puff of displaced air/dust
  sweep(ctx, out, wet, t, {
    f0: lerp(900, 1500, m), f1: lerp(180, 110, m),
    q0: 0.9, dur: lerp(0.09, 0.16, m), type: 'lowpass',
    gain: lerp(0.10, 0.20, m), tail: 1.4, attack: 0.004,
  });
  // the scatter — this is the part that sells it
  grains(ctx, out, wet, t + 0.008, {
    count: Math.round(lerp(14, 64, m)),
    dur: lerp(0.16, 0.42, m),
    f0: 900, f1: lerp(4200, 6500, m),
    gain: lerp(0.055, 0.085, m),
    skew: 1.9,
  });
}

/** A chain detected — rising, bright, unmistakably good news. */
function chain(ctx, out, wet, t, m) {
  const dur = lerp(0.26, 0.44, m);
  // resonant rise: the "something is happening" gesture
  sweep(ctx, out, wet, t, {
    f0: lerp(320, 220, m), f1: lerp(3600, 6200, m),
    q0: 5, q1: 14, dur, gain: lerp(0.12, 0.20, m),
    tail: 0.5, attack: dur * 0.55,
  });
  // a pentatonic stack, gliding up a whole tone. More partials when bigger.
  const root = lerp(294, 220, m);                     // D4 down to A3
  const ratios = [1, 1.5, 2, 3, 4, 6];
  const n = Math.round(lerp(2, 6, m));
  for (let i = 0; i < n; i++) {
    const r = ratios[i];
    blip(ctx, out, wet, t + i * 0.022, {
      f0: root * r, f1: root * r * 1.122,             // +2 semitones
      dur: lerp(0.20, 0.34, m), tail: 1.6,
      gain: lerp(0.10, 0.16, m) / (1 + i * 0.55),
      attack: 0.012,
    });
  }
  // droplet accent on top
  blip(ctx, out, wet, t + dur * 0.72, {
    f0: lerp(900, 1250, m), f1: lerp(2200, 3400, m),
    dur: 0.07, tail: 1.8, gain: lerp(0.07, 0.12, m), attack: 0.004,
  });
  grains(ctx, out, wet, t + dur * 0.55, {
    count: Math.round(lerp(8, 30, m)),
    dur: lerp(0.18, 0.34, m),
    f0: 2600, f1: 9000, gain: 0.035, skew: 1.2,
  });
}

/** The chain dissolving away — shimmering, airy, a held breath out. */
function dissolve(ctx, out, wet, t, m) {
  const dur = lerp(0.55, 1.05, m);
  // airy wash that opens then closes
  sweep(ctx, out, wet, t, {
    f0: 1400, f1: lerp(5200, 8000, m), q0: 1.1,
    dur: dur * 0.5, gain: lerp(0.05, 0.085, m),
    tail: 1.6, attack: dur * 0.22, type: 'bandpass',
  });
  // detuned high shimmer, slightly falling — sand running out of a hand
  const base = lerp(1046, 1318, m);
  const n = Math.round(lerp(3, 6, m));
  for (let i = 0; i < n; i++) {
    const det = rnd(-0.02, 0.02);
    blip(ctx, out, wet, t + i * 0.055, {
      f0: base * (1 + det) * (1 + i * 0.25),
      f1: base * (1 + det) * (1 + i * 0.25) * 0.84,
      dur: dur * rnd(0.5, 0.85), tail: 1.3,
      gain: lerp(0.045, 0.07, m) / (1 + i * 0.4),
      attack: 0.06,
    });
  }
  // sparkle grains sprinkled across the whole tail
  grains(ctx, out, wet, t, {
    count: Math.round(lerp(16, 54, m)),
    dur, f0: 3200, f1: 11000,
    gain: lerp(0.022, 0.034, m),
    life0: 0.006, life1: 0.028, skew: 1.0,
  });
}

/** A small dry click. Quiet on purpose — it fires constantly. */
function rotate(ctx, out, wet, t, m) {
  sweep(ctx, out, null, t, {
    f0: 2600, f1: 1400, q0: 6, dur: 0.028,
    gain: 0.075, tail: 1, attack: 0.001,
  });
  blip(ctx, out, null, t, {
    f0: 620, f1: 380, dur: 0.030, tail: 1.1, gain: 0.055, attack: 0.001,
  });
  grains(ctx, out, wet, t + 0.006, {
    count: 5, dur: 0.05, f0: 1800, f1: 5200, gain: 0.03,
    life0: 0.006, life1: 0.016,
  });
}

/** Hard drop — a downward whoosh that lands. */
function drop(ctx, out, wet, t, m) {
  const dur = lerp(0.10, 0.22, m);
  sweep(ctx, out, wet, t, {
    f0: lerp(2400, 3600, m), f1: lerp(320, 170, m),
    q0: 1.6, q1: 5, dur, gain: lerp(0.10, 0.19, m),
    tail: 0.7, attack: 0.012, rate: 1.15,
  });
  blip(ctx, out, null, t + dur * 0.82, {
    type: 'triangle', f0: lerp(150, 105, m), f1: lerp(70, 46, m),
    dur: 0.09, tail: 1.4, gain: lerp(0.12, 0.24, m), attack: 0.002,
  });
  grains(ctx, out, wet, t + dur * 0.85, {
    count: Math.round(lerp(10, 34, m)), dur: lerp(0.12, 0.26, m),
    f0: 800, f1: 5200, gain: 0.05, skew: 2.0,
  });
}

/** Failure — the pile drowns. Muddy, sinking, no fanfare. */
function fail(ctx, out, wet, t, m) {
  for (let i = 0; i < 3; i++) {
    const f = [196, 147, 98][i];
    blip(ctx, out, wet, t + i * 0.06, {
      type: i === 2 ? 'triangle' : 'sine',
      f0: f, f1: f * 0.5, dur: lerp(0.7, 1.1, m), tail: 1.25,
      gain: 0.13 / (1 + i * 0.3), attack: 0.02,
    });
  }
  sweep(ctx, out, wet, t, {
    f0: 1800, f1: 120, q0: 1.2, dur: 0.9, type: 'lowpass',
    gain: 0.11, tail: 1.2, attack: 0.05,
  });
  grains(ctx, out, wet, t + 0.15, {
    count: 40, dur: 1.0, f0: 220, f1: 1600,
    gain: 0.035, life0: 0.02, life1: 0.07, skew: 1.1,
  });
}

export const VOICES = { land, chain, dissolve, rotate, drop, fail };

/**
 * Per-cue magnitude normalisation. Callers pass raw game quantities (cells in a
 * chain, grains in a piece, rows fallen); each cue maps its own range to 0..1.
 */
export const MAG = {
  land:     (v) => norm(v, 40, 500),
  chain:    (v) => norm(v, 150, 2200),
  dissolve: (v) => norm(v, 150, 2200),
  rotate:   () => 0.5,
  drop:     (v) => norm(v, 8, 180),
  fail:     () => 1,
};

function norm(v, lo, hi) {
  if (!Number.isFinite(v)) return 0.4;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

/** Minimum gap between repeats of the same cue, seconds. */
export const THROTTLE = { rotate: 0.035, land: 0.03, drop: 0.05, chain: 0.05, dissolve: 0.08, fail: 0.5 };

/** Rough voice cost, used to shed load when a lot fires at once. */
export const PRIORITY = { fail: 5, chain: 4, dissolve: 3, land: 2, drop: 2, rotate: 1 };

/** A small plate-ish impulse response, generated rather than loaded. */
export function makeIR(ctx, seconds = 1.5, curve = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // brief pre-delay so the dry hit stays punchy
      const pre = i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, curve) * pre * 0.7;
    }
  }
  return buf;
}
