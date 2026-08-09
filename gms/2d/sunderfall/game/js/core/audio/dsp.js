/**
 * Pure-JS DSP kit. Everything here runs on plain Float32Arrays with no AudioContext,
 * which is why the whole sound set can be rendered and measured offline in node-less
 * headless Chrome — and why a "silent" or "clipped" sound is a testable bug.
 *
 * All buffers are mono. Stereo placement is a panner node at playback time; baking
 * stereo would double the memory for no gain when every source is a point in the world.
 */

export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * Random
 * ------------------------------------------------------------------ */

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const r = {
    next() {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    },
    range(a, b) { return a + (b - a) * r.next(); },
    int(a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
    sign() { return r.next() < 0.5 ? -1 : 1; },
    bool(p = 0.5) { return r.next() < p; },
    pick(arr) { return arr[Math.min(arr.length - 1, (r.next() * arr.length) | 0)]; },
    // sum-of-4 is close enough to gaussian for texture and costs no log/sqrt
    gauss() { return (r.next() + r.next() + r.next() + r.next() - 2) * 0.866; },
  };
  return r;
}

/* ------------------------------------------------------------------ *
 * Noise sources
 * ------------------------------------------------------------------ */

export function white(out, rng, gain = 1, from = 0, to = out.length) {
  for (let i = from; i < to; i++) out[i] += (rng.next() * 2 - 1) * gain;
  return out;
}

/** Paul Kellet's economy pink filter. Cheap, and the tilt is what makes noise sound like air. */
export function pink(out, rng, gain = 1, from = 0, to = out.length) {
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = from; i < to; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    out[i] += (b0 + b1 + b2 + w * 0.1848) * 0.22 * gain;
  }
  return out;
}

/** Brown/red noise — the rumble bed under anything heavy. */
export function brown(out, rng, gain = 1, from = 0, to = out.length) {
  let v = 0;
  for (let i = from; i < to; i++) {
    v = (v + (rng.next() * 2 - 1) * 0.06) * 0.998;
    out[i] += v * 8 * gain;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Filters (in place)
 * ------------------------------------------------------------------ */

export function lp1(out, hz, sr, from = 0, to = out.length) {
  const a = 1 - Math.exp(-TAU * Math.max(1, hz) / sr);
  let z = 0;
  for (let i = from; i < to; i++) { z += (out[i] - z) * a; out[i] = z; }
  return out;
}

export function hp1(out, hz, sr, from = 0, to = out.length) {
  const a = 1 - Math.exp(-TAU * Math.max(1, hz) / sr);
  let z = 0;
  for (let i = from; i < to; i++) { z += (out[i] - z) * a; out[i] -= z; }
  return out;
}

/**
 * Topology-preserving-transform state variable filter, with an optional exponential
 * cutoff sweep. The sweep is the single most useful gesture in this whole file: a
 * bandpass dropping from 4 kHz to 200 Hz over 200 ms *is* a rock impact.
 *
 * TPT rather than the classic Chamberlin form because Chamberlin goes unstable once
 * `2*pi*fc/sr` approaches `2 - 1/Q` — which is exactly where the bright material sounds
 * live (a 13 kHz bandpass at 44.1 kHz). It blew a glass shatter up to 1e38 before this
 * was fixed, and the offline peak check is how that was caught.
 */
export function svf(out, sr, o = {}) {
  const mode = o.mode || 'lp';
  const q = Math.max(0.4, o.q ?? 0.9);
  const k = 1 / q;
  const f0 = Math.max(10, o.f0 ?? 1000);
  const f1 = Math.max(10, o.f1 ?? f0);
  const from = o.from || 0;
  const to = o.to ?? out.length;
  const n = Math.max(1, to - from);
  const nyq = sr * 0.49;
  const sweep = f1 !== f0;
  const ratio = sweep ? Math.log(f1 / f0) : 0;
  const passes = o.passes || 1;
  const STEP = 16;   // recompute tan() every 16 samples; the ear cannot hear the stair

  for (let p = 0; p < passes; p++) {
    let ic1 = 0, ic2 = 0;
    let a1 = 0, a2 = 0, a3 = 0, next = from;
    for (let i = from; i < to; i++) {
      if (i >= next) {
        next = i + STEP;
        const t = (i - from) / n;
        const fc = Math.min(nyq, sweep ? f0 * Math.exp(ratio * t) : f0);
        const g = Math.tan(Math.PI * fc / sr);
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
      }
      const x = out[i];
      const v3 = x - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      out[i] = mode === 'lp' ? v2 : mode === 'hp' ? (x - k * v1 - v2) : mode === 'notch' ? (x - k * v1) : v1;
    }
  }
  return out;
}

/** tanh-ish saturation. Adds the odd harmonics that make a synth impact read as "physical". */
export function softClip(out, drive = 1, from = 0, to = out.length) {
  for (let i = from; i < to; i++) {
    const x = out[i] * drive;
    out[i] = x / (1 + Math.abs(x));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Envelopes (multiply in place)
 * ------------------------------------------------------------------ */

/**
 * @param o.a attack seconds  @param o.h hold  @param o.d decay  @param o.curve decay shape
 * (1 = linear-ish, 4 = snappy percussive)
 */
export function env(out, sr, o = {}) {
  const from = o.from || 0;
  const to = o.to ?? out.length;
  const a = Math.max(1, (o.a ?? 0.002) * sr) | 0;
  const h = Math.max(0, (o.h ?? 0) * sr) | 0;
  const d = Math.max(1, (o.d ?? ((to - from) / sr - (o.a ?? 0) - (o.h ?? 0))) * sr) | 0;
  const curve = o.curve ?? 3;
  const sus = o.sustain ?? 0;
  for (let i = from; i < to; i++) {
    const k = i - from;
    let g;
    if (k < a) g = k / a;
    else if (k < a + h) g = 1;
    else {
      const t = Math.min(1, (k - a - h) / d);
      g = Math.pow(1 - t, curve) * (1 - sus) + sus * (1 - t);
    }
    out[i] *= g;
  }
  return out;
}

/** Piecewise gain curve: points = [[tSeconds, gain], ...]. For anything with a shape. */
export function shape(out, sr, points, from = 0, to = out.length) {
  let pi = 0;
  for (let i = from; i < to; i++) {
    const t = (i - from) / sr;
    while (pi < points.length - 2 && t >= points[pi + 1][0]) pi++;
    const [t0, g0] = points[pi];
    const [t1, g1] = points[Math.min(points.length - 1, pi + 1)];
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    out[i] *= g0 + (g1 - g0) * u;
  }
  return out;
}

export function fadeEdges(out, sr, inSec = 0.002, outSec = 0.01) {
  const n = out.length;
  const ai = Math.max(1, (inSec * sr) | 0);
  const ao = Math.max(1, (outSec * sr) | 0);
  for (let i = 0; i < ai && i < n; i++) out[i] *= i / ai;
  for (let i = 0; i < ao && i < n; i++) out[n - 1 - i] *= i / ao;
  return out;
}

/* ------------------------------------------------------------------ *
 * Tonal generators (additive into the buffer)
 * ------------------------------------------------------------------ */

/** One exponentially-decaying sine partial. The atom of every ring, clack and bell. */
export function partial(out, sr, freq, amp, decay, o = {}) {
  const from = o.from || 0;
  const to = o.to ?? out.length;
  const k = decay > 0 ? Math.exp(-1 / (decay * sr)) : 0;
  const dp = TAU * freq / sr;
  const bendTo = o.bendTo;
  const bendTau = (o.bendTau ?? decay * 0.35) * sr;
  let ph = o.phase ?? 0;
  let g = amp;
  for (let i = from; i < to; i++) {
    out[i] += Math.sin(ph) * g;
    let f = freq;
    if (bendTo !== undefined) {
      const u = 1 - Math.exp(-(i - from) / Math.max(1, bendTau));
      f = freq + (bendTo - freq) * u;
    }
    ph += TAU * f / sr;
    g *= k;
    if (g < 1e-6) break;
  }
  return out;
}

/** partials = [[freqMul, amp, decaySec], ...] against a fundamental. */
export function modal(out, sr, f0, partials, o = {}) {
  const jitter = o.jitter ?? 0;
  const rng = o.rng;
  const gain = o.gain ?? 1;
  for (let i = 0; i < partials.length; i++) {
    const p = partials[i];
    const j = jitter && rng ? 1 + rng.gauss() * jitter : 1;
    partial(out, sr, f0 * p[0] * j, p[1] * gain, p[2], {
      from: o.from || 0, to: o.to, phase: rng ? rng.next() * TAU : 0,
    });
  }
  return out;
}

/** Pitch-dropping sine — the "thump". f0 -> f1 over tauF, amplitude decays over d. */
export function thump(out, sr, f0, f1, amp, d, o = {}) {
  const from = o.from || 0;
  const to = Math.min(out.length, o.to ?? out.length);
  const tauF = (o.tauF ?? d * 0.25) * sr;
  const k = Math.exp(-1 / (d * sr));
  let ph = 0, g = amp;
  for (let i = from; i < to; i++) {
    out[i] += Math.sin(ph) * g;
    const u = 1 - Math.exp(-(i - from) / Math.max(1, tauF));
    ph += TAU * (f0 + (f1 - f0) * u) / sr;
    g *= k;
    if (g < 1e-6) break;
  }
  return out;
}

/** 2-op FM. Cheap route to bell, gong and "unnatural" magic timbres. */
export function fm(out, sr, o = {}) {
  const from = o.from || 0;
  const to = Math.min(out.length, o.to ?? out.length);
  const carrier = o.carrier ?? 220;
  const ratio = o.ratio ?? 1.41;
  const index = o.index ?? 4;
  const iDecay = (o.indexDecay ?? 0.15) * sr;
  const aDecay = Math.exp(-1 / ((o.decay ?? 0.4) * sr));
  const amp = o.amp ?? 0.5;
  let cp = 0, mp = 0, g = amp;
  for (let i = from; i < to; i++) {
    const k = Math.exp(-(i - from) / Math.max(1, iDecay));
    const m = Math.sin(mp) * index * k * carrier;
    out[i] += Math.sin(cp) * g;
    cp += TAU * (carrier + m) / sr;
    mp += TAU * carrier * ratio / sr;
    g *= aDecay;
  }
  return out;
}

/**
 * Karplus-Strong plucked string, generated sample-exact in JS.
 * WebAudio's native feedback-delay route cannot do this: the graph inserts a
 * 128-sample block delay in any loop, which drops a 300 Hz string most of an octave.
 */
export function karplus(n, sr, freq, o = {}) {
  const rng = o.rng || makeRng(7);
  const N = Math.max(2, Math.round(sr / Math.max(20, freq)));
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = rng.next() * 2 - 1;
  // Excitation brightness = how hard the string was struck.
  const bright = o.bright ?? 0.5;
  let z = 0;
  const ea = 0.06 + 0.92 * bright;
  for (let i = 0; i < N; i++) { z += (line[i] - z) * ea; line[i] = z; }
  // Pick position comb — a plucked string never contains every harmonic.
  const pp = Math.max(1, Math.round(N * (o.pick ?? 0.28)));
  for (let i = N - 1; i >= pp; i--) line[i] -= line[i - pp] * 0.7;

  const out = new Float32Array(n);
  const loss = 1 - (o.loss ?? 0.0007) - (o.damp ?? 0.3) * 0.004;
  const s = o.stretch ?? 0.55;
  let idx = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    out[i] = cur;
    const filt = (cur + prev) * 0.5 * s + cur * (1 - s);
    prev = cur;
    line[idx] = filt * loss;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Composition helpers
 * ------------------------------------------------------------------ */

export function mixInto(dst, src, gain = 1, offset = 0) {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) dst[i + offset] += src[i] * gain;
  return dst;
}

/**
 * Scatter `count` short events across a window. This is how gravel, tinkle,
 * clatter and rain are made — one grain generator, many characters.
 */
export function grains(out, sr, o) {
  const rng = o.rng;
  const t0 = o.t0 ?? 0;
  const t1 = o.t1 ?? out.length / sr;
  const count = o.count ?? 12;
  const clump = o.clump ?? 0;   // 0 = even, 1 = front-loaded (a collapse, not a drizzle)
  for (let i = 0; i < count; i++) {
    let u = rng.next();
    if (clump) u = u * (1 - clump) + Math.pow(u, 2.6) * clump;
    const at = Math.round((t0 + (t1 - t0) * u) * sr);
    if (at >= out.length) continue;
    o.grain(out, at, i, rng, u);
  }
  return out;
}

/** A tiny click/tick — the grain primitive for debris, tinkle and clatter. */
export function tick(out, sr, at, freq, amp, decay, rng) {
  const to = Math.min(out.length, at + Math.ceil(decay * 5 * sr) + 8);
  partial(out, sr, freq, amp, decay, { from: at, to, phase: rng ? rng.next() * TAU : 0 });
  return out;
}

/**
 * Schroeder reverb tail baked into the sound. Used sparingly — the live convolver
 * handles room sound; this is for tails that belong to the *object* (glass sparkle,
 * a bell), so they survive even with the room send at zero.
 */
export function reverbTail(out, sr, o = {}) {
  const mix = o.mix ?? 0.3;
  const time = o.time ?? 1.0;
  const damp = o.damp ?? 0.35;
  const combs = [0.0297, 0.0371, 0.0411, 0.0437];
  const wet = new Float32Array(out.length);
  for (let c = 0; c < combs.length; c++) {
    const d = Math.max(2, Math.round(combs[c] * sr));
    const g = Math.pow(0.001, d / (time * sr));
    const line = new Float32Array(d);
    let idx = 0, z = 0;
    for (let i = 0; i < out.length; i++) {
      const y = line[idx];
      wet[i] += y * 0.25;
      z += (y - z) * (1 - damp);
      line[idx] = out[i] + z * g;
      idx = idx + 1 === d ? 0 : idx + 1;
    }
  }
  // two allpasses to smear the comb ringing into something diffuse
  for (const ap of [0.005, 0.0017]) {
    const d = Math.max(2, Math.round(ap * sr));
    const line = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < wet.length; i++) {
      const bufOut = line[idx];
      const y = -wet[i] * 0.6 + bufOut;
      line[idx] = wet[i] + bufOut * 0.6;
      wet[i] = y;
      idx = idx + 1 === d ? 0 : idx + 1;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += wet[i] * mix;
  return out;
}

/** Make a buffer loop seamlessly by crossfading its tail over its head. */
export function loopify(out, sr, fade = 0.25) {
  const n = out.length;
  const f = Math.min((fade * sr) | 0, (n / 2) | 0);
  if (f < 2) return out;
  const head = out.slice(0, f);
  const body = new Float32Array(n - f);
  for (let i = 0; i < n - f; i++) body[i] = out[i + f];
  for (let i = 0; i < f; i++) {
    const u = i / f;
    body[body.length - f + i] = body[body.length - f + i] * (1 - u) + head[i] * u;
  }
  return body;
}

export function normalize(out, target = 0.95) {
  let p = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > p) p = a; }
  if (p > 1e-9) { const g = target / p; for (let i = 0; i < out.length; i++) out[i] *= g; }
  return p;
}

export function trimTail(out, thresh = 1e-4) {
  let end = out.length;
  while (end > 1 && Math.abs(out[end - 1]) < thresh) end--;
  return end === out.length ? out : out.subarray(0, Math.max(8, end));
}

/* ------------------------------------------------------------------ *
 * Analysis — the verification backbone
 * ------------------------------------------------------------------ */

function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/**
 * Peak / RMS / spectral centroid / rolloff / clipping / silence.
 * Centroid in Hz is the number that proves "glass is brighter than stone".
 */
export function analyse(x, sr) {
  const n = x.length;
  let peak = 0, sum = 0, clipped = 0, zc = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += v * v;
    if ((v >= 0) !== (prev >= 0)) zc++;
    prev = v;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));

  // Welch-ish average of a few windows so a transient does not dominate the spectrum
  const N = 2048;
  const mag = new Float64Array(N / 2);
  let frames = 0;
  for (let off = 0; off + N <= n; off += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    let e = 0;
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos(TAU * i / (N - 1));
      re[i] = x[off + i] * w;
      e += re[i] * re[i];
    }
    if (e < 1e-12) continue;
    fftMag(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  let centroid = 0, rolloff = 0, hi = 0, lo = 0;
  if (frames) {
    let ms = 0, mws = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N;
      ms += mag[k];
      mws += mag[k] * f;
      if (f > 4000) hi += mag[k]; else if (f < 400) lo += mag[k];
    }
    centroid = ms > 0 ? mws / ms : 0;
    let acc = 0;
    for (let k = 1; k < N / 2; k++) { acc += mag[k]; if (acc >= ms * 0.85) { rolloff = k * sr / N; break; } }
  }

  // attack = samples to reach 90% of peak
  let atk = 0;
  for (let i = 0; i < n; i++) { if (Math.abs(x[i]) >= peak * 0.9) { atk = i; break; } }

  return {
    n, sr, dur: n / sr,
    peak, rms,
    dbPeak: 20 * Math.log10(Math.max(1e-9, peak)),
    dbRms: 20 * Math.log10(Math.max(1e-9, rms)),
    centroid, rolloff85: rolloff,
    hiRatio: hi + lo > 0 ? hi / (hi + lo) : 0,
    zcr: zc / Math.max(1, n / sr),
    clipped, attackMs: atk / sr * 1000,
    silent: rms < 1e-5,
  };
}
