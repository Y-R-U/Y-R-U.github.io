// Procedural sample buffers, generated once per AudioContext.
export const ENGINE_BASE_RPM = 1200;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function noiseBuffer(ctx, seconds = 2, color = 'white', seed = 1) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0), r = rng(seed);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
    } else d[i] = w;
  }
  // crossfade the loop seam
  const f = Math.min(2048, n >> 3);
  for (let i = 0; i < f; i++) { const a = i / f; d[i] = d[i] * a + d[n - f + i] * (1 - a); }
  return buf;
}

// O-320 style flat four: 4 firings per 2 revs, uneven cylinders, damped exhaust-stack resonances.
export function engineExhaustBuffer(ctx, cycles = 48) {
  const sr = ctx.sampleRate, cycleLen = (120 / ENGINE_BASE_RPM) * sr;
  const n = Math.round(cycleLen * cycles);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), r = rng(7);
  const cyl = [1.0, 0.82, 0.93, 0.74];
  const modes = [[62, 0.035, 1], [124, 0.02, 0.55], [205, 0.012, 0.35], [330, 0.007, 0.22], [710, 0.004, 0.12]];
  const pulseLen = Math.round(0.09 * sr);
  let lp = 0;
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < 4; k++) {
      const start = Math.round(c * cycleLen + (k * cycleLen) / 4 + (r() - 0.5) * 0.0015 * sr);
      const amp = cyl[k] * (0.85 + r() * 0.3);
      const ph = modes.map(() => r() * Math.PI * 2);
      for (let i = 0; i < pulseLen; i++) {
        const t = i / sr;
        let v = 0;
        for (let m = 0; m < modes.length; m++) {
          const [f, tau, g] = modes[m];
          v += g * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t + ph[m]);
        }
        lp += 0.35 * ((r() * 2 - 1) - lp);
        v += lp * 1.4 * Math.exp(-t / 0.004);
        const j = (start + i) % n;
        d[j] += v * amp * Math.min(1, i / 12);
      }
    }
  }
  normalize(d, 0.9);
  return buf;
}

// Two-blade prop: broadband "whup" at blade-pass plus a few tonal harmonics; same cycle length as the exhaust loop.
export function propBuffer(ctx, cycles = 48) {
  const sr = ctx.sampleRate, revLen = (60 / ENGINE_BASE_RPM) * sr;
  const n = Math.round(revLen * 2 * cycles);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), r = rng(11);
  const bpf = (ENGINE_BASE_RPM / 60) * 2;
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const ph = (i / revLen) * 2 * Math.PI * 2;
    const env = Math.pow(0.5 + 0.5 * Math.cos(ph), 6);
    const w = r() * 2 - 1;
    a += 0.25 * (w - a); b += 0.05 * (a - b);
    const band = a - b;
    const tone = Math.sin(ph) * 0.5 + Math.sin(2 * ph) * 0.3 + Math.sin(3 * ph + 0.4) * 0.15;
    d[i] = band * (0.25 + env * 1.6) + tone * 0.35 + (bpf ? 0 : 0);
  }
  normalize(d, 0.8);
  return buf;
}

// Random bump train for rolling on grass: sparse thuds, played back at a rate tied to ground speed.
export function bumpBuffer(ctx, seconds = 3) {
  const sr = ctx.sampleRate, n = Math.round(seconds * sr);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), r = rng(23);
  let t = 0;
  while (t < n) {
    const len = Math.round(0.06 * sr), f = 35 + r() * 40, amp = 0.3 + r() * 0.7;
    for (let i = 0; i < len && t + i < n; i++) d[t + i] += amp * Math.sin((2 * Math.PI * f * i) / sr) * Math.exp(-i / (0.018 * sr));
    t += Math.round((0.04 + r() * 0.18) * sr);
  }
  normalize(d, 0.9);
  return buf;
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
}

export function softClipCurve(amount = 3, n = 1024) {
  const c = new Float32Array(n), k = Math.tanh(amount);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / k; }
  return c;
}

// ---------- jet engine buffers (built lazily on the first jet voice) ----------
// Every tone sits on the loop's frequency grid (k / seconds), so loops are seamless without a crossfade.
const snap = (f, L) => Math.max(1, Math.round(f * L)) / L;

// RBJ bandpass run in JS, for band-limited noise baked into a buffer.
function bandNoise(n, sr, f, q, seed) {
  const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
  const out = new Float32Array(n), r = rng(seed);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let pass = 0; pass < 2; pass++) {               // pass 0 warms the filter so the loop start is not a fade-in
    for (let i = 0; i < n; i++) {
      const x = r() * 2 - 1, y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      if (pass) out[i] = y;
    }
  }
  const fl = Math.min(2048, n >> 3);                   // the noise itself is not periodic: crossfade its seam
  for (let i = 0; i < fl; i++) { const a = i / fl; out[i] = out[i] * a + out[n - fl + i] * (1 - a); }
  return out;
}

// Harmonic series of f0 via a one-period wavetable (cheap even for 80 harmonics).
function addHarmonics(d, sr, f0, amps, phases, gain = 1, am = null) {
  const T = 4096, tab = new Float32Array(T + 1);
  for (let k = 0; k < amps.length; k++) {
    if (!amps[k]) continue;
    for (let i = 0; i <= T; i++) tab[i] += amps[k] * Math.sin(2 * Math.PI * (k + 1) * (i / T) + phases[k]);
  }
  const inc = (f0 / sr) * T;
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    const j = p | 0, fr = p - j;
    d[i] += gain * (am ? am(i) : 1) * (tab[j] + (tab[j + 1] - tab[j]) * fr);
    p += inc; if (p >= T) p -= T;
  }
}

function mk(ctx, L) { const sr = ctx.sampleRate, n = Math.round(L * sr); const b = ctx.createBuffer(1, n, sr); return [b, b.getChannelData(0), sr, n]; }

// Turbofan, rendered at JET_BASE_N1 (60 %): fan blade-pass ~1260 Hz with harmonics for four engines a fraction of
// a hertz apart (slow beating), plus broadband fan hiss.
export const JET_BASE_N1 = 60;
export function fanBuffer(ctx) {
  const L = 2, [buf, d, sr, n] = mk(ctx, L), r = rng(31);
  [0, 0.5, -1, 1.5].forEach((det, e) => {
    const f = snap(1260 + det, L), wob = snap(0.5 + e * 0.5, L);
    addHarmonics(d, sr, f, [1, 0.32, 0.1], [r() * 6, r() * 6, r() * 6], 0.5, (i) => 1 + 0.18 * Math.sin((2 * Math.PI * wob * i) / sr + e));
  });
  const nb = bandNoise(n, sr, 1260, 7, 33), hiss = bandNoise(n, sr, 2600, 0.9, 35);
  for (let i = 0; i < n; i++) d[i] += nb[i] * 2.2 + hiss[i] * 0.5;
  normalize(d, 0.85);
  return buf;
}

// "Buzzsaw" (multiple pure tones): shaft-order harmonics of the fan when its tips go supersonic. Irregular amplitudes,
// strongest around order 16, shaft rate 34 Hz at 60 % N1. Two forward engines heard, slightly apart.
export function buzzBuffer(ctx) {
  const L = 2, [buf, d, sr] = mk(ctx, L), r = rng(41);
  [34, 34.5].forEach((f0, e) => {
    const amps = [], ph = [];
    for (let k = 1; k <= 80; k++) {
      const env = Math.exp(-((Math.log(k) - Math.log(16)) ** 2) / (2 * 0.55 * 0.55));
      amps.push(env * (0.25 + r() ** 2 * 1.5)); ph.push(r() * 6.283);
    }
    addHarmonics(d, sr, snap(f0, L), amps, ph, e ? 0.7 : 1);
  });
  normalize(d, 0.85);
  return buf;
}

// Turboprop props at 100 % prop rpm: four-blade pass at 68 Hz (1020 rpm) with a growly harmonic stack, four engines
// 0.25 Hz apart for the Hercules "wow-wow" beat, plus a broadband whup on each blade pass.
export function turbopropBuffer(ctx) {
  const L = 4, [buf, d, sr, n] = mk(ctx, L), r = rng(51);
  const amps = [1, 0.75, 0.55, 0.42, 0.3, 0.22, 0.16, 0.12, 0.09, 0.07, 0.05, 0.04];
  const dets = [0, 0.25, -0.25, 0.5];
  dets.forEach((det, e) => addHarmonics(d, sr, snap(68 + det, L), amps, amps.map(() => r() * 6.283), 0.32));
  const wn = bandNoise(n, sr, 700, 0.6, 53);
  for (let i = 0; i < n; i++) {
    let env = 0;
    for (let e = 0; e < 4; e++) env += Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * snap(68 + dets[e], L) * (i / sr) + e), 5);
    d[i] += wn[i] * (0.4 + env * 0.9);
  }
  normalize(d, 0.85);
  return buf;
}

// Allison T56-ish turbine whine: compressor tone plus its octave and a narrow noise band, four engines apart.
export function turbineWhineBuffer(ctx) {
  const L = 2, [buf, d, sr, n] = mk(ctx, L), r = rng(61);
  [0, 3, -2.5, 5.5].forEach((det) => addHarmonics(d, sr, snap(2600 + det, L), [1, 0, 0.3], [r() * 6, 0, r() * 6], 0.4));
  const nb = bandNoise(n, sr, 2600, 5, 63), lo = bandNoise(n, sr, 950, 2, 65);
  for (let i = 0; i < n; i++) d[i] += nb[i] * 2 + lo[i] * 0.9;
  normalize(d, 0.8);
  return buf;
}

// Fighter idle howl at JET_BASE_N1: an inharmonic moan around 760 Hz with a slow vibrato and a breathy noise band.
export function howlBuffer(ctx) {
  const L = 2, [buf, d, sr, n] = mk(ctx, L), r = rng(71);
  const fm = snap(1.5, L);
  for (const [f, a, dev] of [[760, 1, 6], [1140, 0.55, 9], [1525, 0.3, 12], [2950, 0.22, 20]]) {
    const fs = snap(f, L), ph = r() * 6.283;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      d[i] += a * Math.sin(2 * Math.PI * fs * t + (dev / fm) * Math.sin(2 * Math.PI * fm * t) + ph) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t));
    }
  }
  const nb = bandNoise(n, sr, 1000, 2.5, 73);
  for (let i = 0; i < n; i++) d[i] += nb[i] * 3;
  normalize(d, 0.8);
  return buf;
}

// Afterburner: crackle (sparse, heavy-tailed, positively skewed pops) over a slow booming low swell.
export function afterburnerBuffer(ctx) {
  const L = 3, [buf, d, sr, n] = mk(ctx, L), r = rng(81);
  let t = 0;
  while (t < n) {
    const a = 0.3 + r() ** 3 * 1.5, tau = (0.4 + r() * 1.6) * 0.001 * sr, len = Math.round(tau * 6);
    for (let i = 0; i < len; i++) { const j = (t + i) % n; d[j] += a * (Math.exp(-i / tau) - 0.35 * Math.exp(-i / (tau * 3))); }
    t += Math.round((-Math.log(1 - r() * 0.999) / 420) * sr);
  }
  for (let i = 0; i < n; i++) d[i] = Math.tanh(d[i] * 1.3);   // rounder pops: same skew, less crest, more level per dB of peak
  let lp = 0, lp2 = 0;
  const br = new Float32Array(n), r2 = rng(83);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { lp += 0.01 * ((r2() * 2 - 1) - lp); lp2 += 0.02 * (lp - lp2); if (pass) br[i] = lp2; }
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(br[i]));
  const fl = 4096; for (let i = 0; i < fl; i++) { const a = i / fl; br[i] = br[i] * a + br[n - fl + i] * (1 - a); }
  const sw = snap(0.67, L), mid = bandNoise(n, sr, 350, 0.7, 85);
  for (let i = 0; i < n; i++) d[i] += (br[i] / m) * 0.5 * (0.75 + 0.25 * Math.sin((2 * Math.PI * sw * i) / sr)) + mid[i] * 0.25;
  normalize(d, 0.9);
  return buf;
}

// Sonic boom: the classic double N-wave ("ba-BOOM"), softened, with a rolling low tail.
export function boomBuffer(ctx) {
  const [buf, d, sr, n] = mk(ctx, 2.2), r = rng(91);
  const nwave = (t0, T, a) => {
    const s = Math.round(t0 * sr), len = Math.round(T * sr);
    for (let i = 0; i <= len; i++) d[s + i] += a * (1 - (2 * i) / len);
  };
  nwave(0.02, 0.11, 1); nwave(0.17, 0.11, 0.85);
  let lp = 0, lp2 = 0;
  for (let i = Math.round(0.05 * sr); i < n; i++) {
    lp += 0.008 * ((r() * 2 - 1) - lp); lp2 += 0.01 * (lp - lp2);
    d[i] += lp2 * 60 * Math.exp(-(i / sr - 0.05) / 0.45);
  }
  let y = 0; const k = 1 - Math.exp((-2 * Math.PI * 1800) / sr);
  for (let i = 0; i < n; i++) { y += k * (d[i] - y); d[i] = y; }
  normalize(d, 0.95);
  return buf;
}
