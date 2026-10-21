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
