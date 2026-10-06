// Procedural cartoon SFX. Each entry: (ctx, out, t, rate) → length in seconds.
const R = (a, b) => a + Math.random() * (b - a);
let noiseBuf = null, pinkBuf = null;

function noise(ctx) {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function pink(ctx) {
  if (pinkBuf && pinkBuf.sampleRate === ctx.sampleRate) return pinkBuf;
  const n = ctx.sampleRate * 3;
  pinkBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = pinkBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
    d[i] = (b0 + b1 + b2) * 2.2;
  }
  return pinkBuf;
}

function env(ctx, t, a, peak, d, curve = 'exp') {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  else g.gain.linearRampToValueAtTime(0, t + a + d);
  return g;
}

// Oscillator with a pitch glide f0→f1 over dur.
function tone(ctx, out, t, { type = 'sine', f0, f1 = f0, dur, a = 0.005, vol = 0.5, glide = dur, lin = false }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) lin ? o.frequency.linearRampToValueAtTime(f1, t + glide) : o.frequency.exponentialRampToValueAtTime(f1, t + glide);
  const g = env(ctx, t, a, vol, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}

// Filtered noise burst; freq can sweep f→f1.
function hiss(ctx, out, t, { type = 'bandpass', f = 1000, f1 = f, q = 1, dur = 0.2, a = 0.004, vol = 0.5, pinkish = false, curve = 'exp' }) {
  const s = ctx.createBufferSource(); s.buffer = pinkish ? pink(ctx) : noise(ctx);
  s.playbackRate.value = R(0.9, 1.1);
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
  const g = env(ctx, t, a, vol, dur, curve);
  s.connect(fl); fl.connect(g); g.connect(out);
  s.start(t, R(0, 1)); s.stop(t + a + dur + 0.05);
  return { s, fl, g };
}

// A short "plink" with a couple of inharmonic partials: ceramic, glass, bells.
function ping(ctx, out, t, f, dur, vol, partials = [1, 2.76, 5.4]) {
  partials.forEach((m, i) => tone(ctx, out, t, { f0: f * m, dur: dur / (1 + i * 0.7), a: 0.001, vol: vol / (1 + i * 1.3) }));
}

// Formant voice for cat sounds: sawtooth through two moving bandpass formants.
function catVoice(ctx, out, t, { pitch, dur, vol = 0.4, vib = 0, shape }) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const pts = shape.pitch;
  o.frequency.setValueAtTime(pitch * pts[0], t);
  pts.forEach((p, i) => i && o.frequency.linearRampToValueAtTime(pitch * p, t + dur * (i / (pts.length - 1))));
  if (vib) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = 6.5; lg.gain.value = pitch * vib;
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1);
  }
  const mix = ctx.createGain(); mix.gain.value = 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.05);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  for (const [fa, fb, q, gv] of shape.formants) {
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fa, t); f.frequency.linearRampToValueAtTime(fb, t + dur);
    const fg = ctx.createGain(); fg.gain.value = gv;
    o.connect(f); f.connect(fg); fg.connect(mix);
  }
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
  mix.connect(lp); lp.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.1);
}

export const SFX = {
  step(ctx, out, t, r) {
    hiss(ctx, out, t, { type: 'lowpass', f: R(380, 560) * r, q: 0.8, dur: 0.07, vol: 0.35, pinkish: true });
    tone(ctx, out, t, { f0: R(95, 120) * r, f1: 60, dur: 0.06, vol: 0.18 });
    return 0.12;
  },
  jump(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 220 * r, f1: 520 * r, dur: 0.16, glide: 0.12, vol: 0.22, type: 'triangle' });
    hiss(ctx, out, t, { f: 700, f1: 2400, q: 0.9, dur: 0.16, vol: 0.18 });
    return 0.25;
  },
  land(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 150 * r, f1: 48, dur: 0.18, vol: 0.55 });
    hiss(ctx, out, t, { type: 'lowpass', f: 900, f1: 200, dur: 0.14, vol: 0.4, pinkish: true });
    return 0.3;
  },
  swipe(ctx, out, t, r) {
    hiss(ctx, out, t, { f: 900 * r, f1: 5200 * r, q: 2.2, dur: 0.16, a: 0.03, vol: 0.5 });
    hiss(ctx, out, t + 0.02, { type: 'highpass', f: 5000, dur: 0.07, vol: 0.12 });
    return 0.25;
  },
  hit(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 210 * r, f1: 70, dur: 0.16, vol: 0.6 });
    hiss(ctx, out, t, { f: 1800, f1: 600, q: 0.8, dur: 0.08, vol: 0.4 });
    tone(ctx, out, t + 0.01, { type: 'square', f0: 900 * r, f1: 500, dur: 0.04, vol: 0.06 });
    return 0.25;
  },
  thud(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 110 * r, f1: 40, dur: 0.3, vol: 0.7 });
    hiss(ctx, out, t, { type: 'lowpass', f: 500, f1: 150, dur: 0.22, vol: 0.5, pinkish: true });
    return 0.4;
  },
  crash(ctx, out, t, r) {
    SFX.thud(ctx, out, t, r * 0.8);
    hiss(ctx, out, t, { type: 'lowpass', f: 4000, f1: 300, q: 0.5, dur: 0.9, vol: 0.45 });
    for (let i = 0; i < 7; i++) {
      const tt = t + 0.04 + i * R(0.05, 0.11);
      tone(ctx, out, tt, { type: 'triangle', f0: R(300, 900) * r, f1: R(200, 600), dur: R(0.06, 0.15), vol: 0.12 });
      hiss(ctx, out, tt, { f: R(1500, 4000), q: 4, dur: 0.05, vol: 0.12 });
    }
    return 1.1;
  },
  shatter(ctx, out, t, r) {
    hiss(ctx, out, t, { type: 'highpass', f: 2500, q: 0.7, dur: 0.35, vol: 0.5 });
    tone(ctx, out, t, { f0: 160, f1: 60, dur: 0.12, vol: 0.4 });
    for (let i = 0; i < 16; i++) ping(ctx, out, t + R(0, 0.45) * (i / 16 + 0.2), R(1800, 5200) * r, R(0.08, 0.3), R(0.05, 0.14));
    return 0.8;
  },
  rip(ctx, out, t, r) {
    const dur = R(0.32, 0.45);
    const { g } = hiss(ctx, out, t, { f: 1600 * r, f1: 2600 * r, q: 1.6, dur, a: 0.01, vol: 0.55, curve: 'lin' });
    // Granular crackle: chop the gain to make it sound like fibres tearing.
    for (let x = 0; x < dur; x += R(0.012, 0.03)) g.gain.setValueAtTime(R(0.1, 0.6), t + x);
    g.gain.setValueAtTime(0, t + dur);
    return dur + 0.1;
  },
  chomp(ctx, out, t, r) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.13;
      hiss(ctx, out, tt, { f: R(1100, 1600) * r, q: 1.4, dur: 0.07, vol: 0.5 });
      tone(ctx, out, tt, { f0: 180 * r, f1: 90, dur: 0.07, vol: 0.3 });
    }
    return 0.35;
  },
  gulp(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 420 * r, f1: 140 * r, dur: 0.22, glide: 0.18, vol: 0.45 });
    hiss(ctx, out, t + 0.03, { f: 600, f1: 250, q: 6, dur: 0.18, vol: 0.25 });
    tone(ctx, out, t + 0.16, { f0: 260 * r, f1: 520 * r, dur: 0.06, vol: 0.12 });
    return 0.35;
  },
  spit(ctx, out, t, r) {
    hiss(ctx, out, t, { f: 2600 * r, f1: 1200, q: 1.2, dur: 0.12, vol: 0.6 });
    tone(ctx, out, t + 0.02, { type: 'triangle', f0: 380 * r, f1: 140, dur: 0.14, vol: 0.25 });
    for (let i = 0; i < 4; i++) hiss(ctx, out, t + 0.15 + i * R(0.04, 0.08), { f: R(2000, 3500), q: 5, dur: 0.03, vol: 0.12 });
    return 0.45;
  },
  whack(ctx, out, t, r) {
    hiss(ctx, out, t, { type: 'highpass', f: 1200 * r, q: 0.7, dur: 0.1, a: 0.002, vol: 0.9 });
    hiss(ctx, out, t, { f: 600, q: 1, dur: 0.06, vol: 0.5 });
    tone(ctx, out, t, { f0: 160, f1: 70, dur: 0.12, vol: 0.5 });
    return 0.25;
  },
  boing(ctx, out, t, r) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const dur = 0.6;
    o.frequency.setValueAtTime(140 * r, t);
    o.frequency.exponentialRampToValueAtTime(420 * r, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(260 * r, t + dur);
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.setValueAtTime(18, t); l.frequency.linearRampToValueAtTime(9, t + dur);
    lg.gain.setValueAtTime(90 * r, t); lg.gain.exponentialRampToValueAtTime(4, t + dur);
    l.connect(lg); lg.connect(o.frequency);
    const g = env(ctx, t, 0.005, 0.45, dur);
    o.connect(g); g.connect(out);
    o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
    return dur + 0.1;
  },
  creak(ctx, out, t, r) {
    const dur = R(0.5, 0.8);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(R(70, 95) * r, t);
    for (let x = 0.05; x < dur; x += 0.05) o.frequency.linearRampToValueAtTime(R(60, 130) * r, t + x);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1500, t + dur);
    const g = env(ctx, t, 0.08, 0.35, dur, 'lin');
    o.connect(f); f.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.1);
    return dur + 0.1;
  },
  crack(ctx, out, t, r) {
    hiss(ctx, out, t, { type: 'highpass', f: 1500 * r, dur: 0.05, a: 0.001, vol: 0.9 });
    for (let i = 0; i < 3; i++) hiss(ctx, out, t + 0.03 + i * R(0.02, 0.05), { f: R(1500, 3000), q: 3, dur: 0.04, vol: 0.4 });
    tone(ctx, out, t, { type: 'triangle', f0: 260 * r, f1: 90, dur: 0.12, vol: 0.4 });
    return 0.3;
  },
  door(ctx, out, t, r) {
    SFX.creak(ctx, out, t, r * 1.2);
    tone(ctx, out, t + 0.45, { f0: 90 * r, f1: 45, dur: 0.25, vol: 0.7 });
    hiss(ctx, out, t + 0.45, { type: 'lowpass', f: 700, dur: 0.15, vol: 0.5, pinkish: true });
    ping(ctx, out, t + 0.52, 1900, 0.06, 0.12, [1, 1.6]);
    return 0.9;
  },
  fridge(ctx, out, t, r) {
    // Seal pop, light buzz, hum.
    hiss(ctx, out, t, { f: 400, f1: 1500, q: 1, dur: 0.12, vol: 0.4 });
    tone(ctx, out, t, { f0: 300, f1: 120, dur: 0.1, vol: 0.2 });
    tone(ctx, out, t + 0.08, { type: 'sawtooth', f0: 60 * r, dur: 1.4, a: 0.2, vol: 0.06 });
    tone(ctx, out, t + 0.08, { f0: 120 * r, dur: 1.4, a: 0.2, vol: 0.08 });
    return 1.7;
  },
  fridge_close(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 120 * r, f1: 55, dur: 0.18, vol: 0.6 });
    hiss(ctx, out, t, { type: 'lowpass', f: 600, dur: 0.1, vol: 0.4 });
    hiss(ctx, out, t + 0.03, { f: 1400, f1: 500, q: 1, dur: 0.12, vol: 0.2 });
    return 0.3;
  },
  wind(ctx, out, t, r) {
    const dur = 2.6;
    const { fl, g } = hiss(ctx, out, t, { f: 400 * r, q: 2.5, dur, a: 0.6, vol: 0.45, pinkish: true, curve: 'lin' });
    for (let x = 0.3; x < dur; x += 0.3) fl.frequency.linearRampToValueAtTime(R(300, 1100) * r, t + x);
    g.gain.setValueAtTime(0.45, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    hiss(ctx, out, t + 0.2, { f: 1800, f1: 2600, q: 8, dur: 1.6, a: 0.5, vol: 0.06, curve: 'lin' });
    return dur + 0.1;
  },
  unlock(ctx, out, t, r) {
    [523, 659, 784, 1047].forEach((f, i) => ping(ctx, out, t + i * 0.09, f * r, 0.9, 0.16, [1, 2, 3.01]));
    hiss(ctx, out, t + 0.3, { type: 'highpass', f: 6000, dur: 0.6, a: 0.1, vol: 0.05 });
    return 1.3;
  },
  click(ctx, out, t, r) {
    tone(ctx, out, t, { type: 'triangle', f0: 1500 * r, f1: 900, dur: 0.03, a: 0.001, vol: 0.25 });
    hiss(ctx, out, t, { f: 3000, q: 2, dur: 0.02, vol: 0.12 });
    return 0.08;
  },
  pop(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 700 * r, f1: 220 * r, dur: 0.09, glide: 0.06, vol: 0.4 });
    hiss(ctx, out, t, { f: 2000, q: 2, dur: 0.02, vol: 0.15 });
    return 0.15;
  },
  purr(ctx, out, t, r) {
    const dur = 1.8;
    const s = ctx.createBufferSource(); s.buffer = pink(ctx);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const am = ctx.createGain(); am.gain.value = 0;
    const l = ctx.createOscillator(); l.type = 'triangle'; l.frequency.value = 24 * r;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    l.connect(lg); lg.connect(am.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // Breathing in/out swell.
    g.gain.linearRampToValueAtTime(0.7, t + 0.35); g.gain.linearRampToValueAtTime(0.35, t + 0.85);
    g.gain.linearRampToValueAtTime(0.75, t + 1.25); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(am); am.connect(g); g.connect(out);
    s.start(t); l.start(t); s.stop(t + dur); l.stop(t + dur);
    return dur;
  },
  meow(ctx, out, t, r) {
    catVoice(ctx, out, t, { pitch: R(480, 560) * r, dur: 0.55, vol: 0.35, vib: 0.02,
      shape: { pitch: [0.85, 1.15, 1.1, 0.8], formants: [[900, 700, 5, 1], [2600, 1300, 6, 0.6], [400, 600, 3, 0.4]] } });
    return 0.65;
  },
  yowl(ctx, out, t, r) {
    catVoice(ctx, out, t, { pitch: R(560, 640) * r, dur: 0.9, vol: 0.4, vib: 0.05,
      shape: { pitch: [0.8, 1.3, 1.35, 1.2, 0.7], formants: [[800, 1100, 4, 1], [2300, 1500, 6, 0.6], [500, 450, 3, 0.4]] } });
    return 1.0;
  },
  rattle(ctx, out, t, r) {
    for (let i = 0; i < 9; i++) ping(ctx, out, t + i * R(0.03, 0.06), R(1300, 2400) * r, R(0.06, 0.14), R(0.05, 0.1), [1, 2.4]);
    hiss(ctx, out, t, { type: 'lowpass', f: 400, dur: 0.12, vol: 0.3, pinkish: true });
    return 0.6;
  },
  splat(ctx, out, t, r) {
    hiss(ctx, out, t, { type: 'lowpass', f: 1800 * r, f1: 250, q: 2, dur: 0.22, vol: 0.7 });
    tone(ctx, out, t, { f0: 200 * r, f1: 60, dur: 0.15, vol: 0.45 });
    for (let i = 0; i < 4; i++) hiss(ctx, out, t + 0.08 + i * R(0.03, 0.07), { f: R(700, 1400), q: 4, dur: 0.05, vol: 0.18 });
    return 0.45;
  },
  slip(ctx, out, t, r) {
    tone(ctx, out, t, { type: 'square', f0: 900 * r, f1: 2100 * r, dur: 0.18, glide: 0.16, vol: 0.06 });
    tone(ctx, out, t, { f0: 600 * r, f1: 1500 * r, dur: 0.2, glide: 0.18, vol: 0.18 });
    hiss(ctx, out, t + 0.05, { f: 600, f1: 3000, q: 1, dur: 0.35, a: 0.05, vol: 0.3 });
    return 0.5;
  },
  whoosh(ctx, out, t, r) {
    hiss(ctx, out, t, { f: 300 * r, f1: 1600 * r, q: 1.3, dur: 0.35, a: 0.12, vol: 0.4, curve: 'lin' });
    return 0.5;
  },
  paper(ctx, out, t, r) {
    for (let i = 0; i < 6; i++) hiss(ctx, out, t + i * R(0.04, 0.07), { f: R(2500, 4500) * r, q: 1.5, dur: R(0.03, 0.06), vol: R(0.15, 0.3) });
    return 0.45;
  },
  squeak(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 1400 * r, f1: 2200 * r, dur: 0.1, vol: 0.18 });
    tone(ctx, out, t + 0.1, { f0: 2000 * r, f1: 1500 * r, dur: 0.08, vol: 0.12 });
    return 0.25;
  },
  ding(ctx, out, t, r) { ping(ctx, out, t, 1046 * r, 1.0, 0.2, [1, 2.0, 3.0]); return 1.1; },
  sparkle(ctx, out, t, r) {
    for (let i = 0; i < 6; i++) ping(ctx, out, t + i * 0.06, [1568, 2093, 2637, 3136][i % 4] * r, 0.4, 0.07, [1, 2]);
    return 0.8;
  },
  stars(ctx, out, t, r) {
    // Dizzy tweety twirl.
    for (let i = 0; i < 5; i++) tone(ctx, out, t + i * 0.12, { f0: 1800 * r, f1: 2400 * r, dur: 0.08, vol: 0.08, lin: true });
    return 0.8;
  },
  belly(ctx, out, t, r) {
    tone(ctx, out, t, { f0: 90 * r, f1: 55, dur: 0.25, vol: 0.6 });
    SFX.boing(ctx, out, t + 0.02, r * 0.6);
    return 0.65;
  },
  knock(ctx, out, t, r) {
    for (let i = 0; i < 3; i++) { tone(ctx, out, t + i * 0.18, { f0: 140 * r, f1: 70, dur: 0.12, vol: 0.6 }); hiss(ctx, out, t + i * 0.18, { type: 'lowpass', f: 900, dur: 0.06, vol: 0.4 }); }
    return 0.7;
  },
};

// Loudness trims so every effect lands at a similar perceived level (measured offline peaks/RMS).
export const LEVEL = {
  creak: 3, stars: 2.5, whoosh: 2.5, paper: 2.5, swipe: 2, spit: 1.8, meow: 2.2, yowl: 1.7, slip: 2, squeak: 2,
  sparkle: 2, fridge: 1.8, jump: 1.8, rattle: 1.8, chomp: 1.4, rip: 1.6, unlock: 1.5, ding: 1.4,
  crash: 0.6, whack: 0.65, door: 0.65, thud: 0.8, land: 0.7, step: 0.9,
};
