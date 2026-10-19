// Synthesised SFX (no files). Each entry schedules WebAudio nodes into A.out from A.t and returns its length in seconds.
// A = {ctx, out, t, v (gain), p (pitch multiplier)}. Adapted from HEIRFRAME's js/audio/sfx.js.

const bufs = new WeakMap();
function noiseBuf(ctx, brown) {
  let m = bufs.get(ctx);
  if (!m) bufs.set(ctx, (m = {}));
  const k = brown ? 'b' : 'w';
  if (!m[k]) {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    m[k] = b;
  }
  return m[k];
}

const rnd = (a, b) => a + Math.random() * (b - a);
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

function envelope(g, t, a, peak, dur, hold = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
  if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + dur);
}

function filt(ctx, type, f, q = 0.7, f2, t, dur) {
  const n = ctx.createBiquadFilter();
  n.type = type; n.frequency.value = f; n.Q.value = q;
  if (f2 && t !== undefined) { n.frequency.setValueAtTime(f, t); n.frequency.exponentialRampToValueAtTime(f2, t + dur); }
  return n;
}

// o: {type,f,f2,t,dur,a,peak,lp,hold,detune,vib:[rate,depth]}
function tone(A, o) {
  const { ctx, out } = A, t = o.t ?? A.t, dur = o.dur ?? 0.2, a = o.a ?? 0.004, p = o.fixed ? 1 : A.p;
  const s = ctx.createOscillator(), g = ctx.createGain(), end = t + a + (o.hold || 0) + dur;
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f * p, t);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2 * p, end);
  if (o.detune) s.detune.value = o.detune;
  if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg).connect(s.frequency); l.start(t); l.stop(end + 0.05); }
  envelope(g, t, a, (o.peak ?? 0.3) * A.v, dur, o.hold);
  let head = s;
  if (o.lp) { const f = filt(ctx, 'lowpass', o.lp, 0.8); s.connect(f); head = f; }
  head.connect(g).connect(out);
  s.start(t); s.stop(end + 0.05);
  return end - A.t;
}

// o: {t,dur,type:'bp'|'hp'|'lp',f,f2,q,peak,a,hold,brown,rate}
function burst(A, o) {
  const { ctx, out } = A, t = o.t ?? A.t, dur = o.dur ?? 0.1, a = o.a ?? 0.002, end = t + a + (o.hold || 0) + dur;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = noiseBuf(ctx, o.brown);
  s.loop = true;
  s.playbackRate.value = o.rate || 1;
  const type = { bp: 'bandpass', hp: 'highpass', lp: 'lowpass' }[o.type || 'bp'];
  const f = filt(ctx, type, (o.f || 1000) * A.p, o.q ?? 1, o.f2 && o.f2 * A.p, t, end - t);
  envelope(g, t, a, (o.peak ?? 0.3) * A.v, dur, o.hold);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random()); s.stop(end + 0.05);
  return end - A.t;
}

function arp(A, notes, { gap = 0.07, type = 'sine', dur = 0.35, peak = 0.14, harm = true, t0 = 0 } = {}) {
  notes.forEach((n, i) => {
    const t = A.t + t0 + i * gap;
    tone(A, { t, f: N(n), type, dur, peak });
    if (harm) tone(A, { t, f: N(n) * 2.01, dur: dur * 0.6, peak: peak * 0.25 });
  });
  return t0 + notes.length * gap + dur;
}

// Crowd: band-passed noise "voices" with slow random swells, plus a few whoops.
function crowd(A, { dur = 2, peak = 0.3, a = 0.3, whoops = 4 } = {}) {
  [[500, 1.2], [900, 1.5], [1500, 2], [2400, 3]].forEach(([f, q], i) => {
    burst(A, { type: 'bp', f: f * rnd(0.9, 1.1), q, a, hold: dur * 0.35, dur: dur * 0.65, peak: peak * (1 - i * 0.18) });
  });
  burst(A, { type: 'lp', f: 400, a, hold: dur * 0.3, dur: dur * 0.7, peak: peak * 0.6, brown: true });
  for (let i = 0; i < whoops; i++) {
    const t = A.t + rnd(0.05, dur * 0.6), f = rnd(500, 900);
    tone(A, { t, type: 'triangle', f, f2: f * rnd(1.3, 1.6), a: 0.08, dur: rnd(0.3, 0.5), peak: peak * 0.05, lp: 1800, vib: [6, 12] });
  }
  return dur + a;
}

export const SFX = {
  // ---- weapons ----
  shot_kinetic(A) {
    const p = rnd(0.92, 1.08);
    burst(A, { type: 'hp', f: 2500 * p, dur: 0.05, peak: 0.45 });
    burst(A, { type: 'lp', f: 2600, f2: 500, dur: 0.12, peak: 0.45 });
    tone(A, { type: 'square', f: 160 * p, f2: 60, dur: 0.08, peak: 0.22, lp: 1200 });
    return 0.16;
  },
  shot_heavy(A) { // cannon / long rifle: deeper crack with a low boom tail
    const p = rnd(0.94, 1.06);
    burst(A, { type: 'hp', f: 1800 * p, dur: 0.06, peak: 0.5 });
    burst(A, { type: 'lp', f: 2000, f2: 200, dur: 0.3, peak: 0.55, brown: true });
    tone(A, { f: 85 * p, f2: 32, dur: 0.32, peak: 0.6 });
    tone(A, { type: 'square', f: 220 * p, f2: 70, dur: 0.1, peak: 0.12, lp: 1400 });
    burst(A, { t: A.t + 0.05, type: 'bp', f: 900, f2: 300, q: 1.2, dur: 0.35, peak: 0.08 }); // echo
    return 0.42;
  },
  shotgun(A) {
    burst(A, { type: 'lp', f: 4000, f2: 400, dur: 0.28, peak: 0.75 });
    burst(A, { type: 'lp', f: 800, f2: 120, dur: 0.35, peak: 0.6, brown: true });
    tone(A, { f: 110, f2: 40, dur: 0.22, peak: 0.6 });
    burst(A, { t: A.t + 0.32, type: 'bp', f: 1800, q: 6, dur: 0.03, peak: 0.18 }); // pump clack
    burst(A, { t: A.t + 0.4, type: 'bp', f: 1300, q: 6, dur: 0.04, peak: 0.16 });
    return 0.45;
  },
  minigun(A) {
    tone(A, { type: 'sawtooth', f: 60, f2: 320, a: 0.02, hold: 0.5, dur: 0.25, peak: 0.07, lp: 1400 }); // spin
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = A.t + 0.12 + i * 0.038;
      burst(A, { t, type: 'hp', f: 2200 * rnd(0.9, 1.1), dur: 0.03, peak: 0.3 });
      tone(A, { t, type: 'square', f: 140 * rnd(0.9, 1.1), f2: 70, dur: 0.035, peak: 0.12, lp: 900 });
    }
    return 0.8;
  },
  shot_rail(A) {
    tone(A, { type: 'sawtooth', f: 300, f2: 3800, a: 0.12, dur: 0.02, peak: 0.06, lp: 6000 }); // charge whine
    burst(A, { t: A.t + 0.13, type: 'hp', f: 3000, dur: 0.18, peak: 0.6 });
    tone(A, { t: A.t + 0.13, type: 'sawtooth', f: 4200, f2: 300, dur: 0.28, peak: 0.2, lp: 9000 });
    tone(A, { t: A.t + 0.13, f: 90, f2: 35, dur: 0.35, peak: 0.55 });
    burst(A, { t: A.t + 0.15, type: 'bp', f: 6000, f2: 1500, q: 3, dur: 0.4, peak: 0.12 });
    return 0.6;
  },
  shot_bolt(A) {
    const p = rnd(0.94, 1.06);
    tone(A, { type: 'square', f: 1500 * p, f2: 200, dur: 0.14, peak: 0.13, lp: 5000 });
    tone(A, { f: 950 * p, f2: 140, dur: 0.18, peak: 0.28 });
    tone(A, { f: 2850 * p, f2: 900, dur: 0.1, peak: 0.05, detune: 20 });
    burst(A, { type: 'hp', f: 4000, dur: 0.03, peak: 0.12 });
    return 0.2;
  },
  beam(A, o = {}) {
    const d = o.dur ?? 0.7;
    tone(A, { type: 'sawtooth', f: 110, a: 0.05, hold: d - 0.2, dur: 0.15, peak: 0.12, lp: 1600, vib: [11, 4] });
    tone(A, { type: 'sawtooth', f: 165.5, a: 0.05, hold: d - 0.2, dur: 0.15, peak: 0.08, lp: 2200, detune: 9 });
    tone(A, { f: 880, f2: 820, a: 0.02, hold: d - 0.2, dur: 0.2, peak: 0.06, vib: [23, 15] });
    burst(A, { type: 'bp', f: 3200, q: 2, a: 0.03, hold: d - 0.2, dur: 0.15, peak: 0.08 });
    return d;
  },
  swing(A) {
    burst(A, { f: 500, f2: 2600, q: 1.4, dur: 0.16, a: 0.04, peak: 0.7 });
    tone(A, { type: 'sawtooth', f: 90, f2: 160, a: 0.05, dur: 0.12, peak: 0.1, lp: 700 }); // servo
    return 0.22;
  },
  swing_heavy(A) { // punches, maul, ram: slow whoosh + hydraulic servo
    burst(A, { f: 260, f2: 1200, q: 1.1, a: 0.06, dur: 0.18, peak: 0.75 });
    burst(A, { type: 'lp', f: 500, f2: 150, a: 0.05, dur: 0.2, peak: 0.35, brown: true });
    tone(A, { type: 'sawtooth', f: 70, f2: 120, a: 0.04, dur: 0.16, peak: 0.12, lp: 600 });
    burst(A, { t: A.t + 0.02, type: 'bp', f: 3200, q: 8, dur: 0.05, peak: 0.08 }); // hiss
    return 0.27;
  },
  shot_arrow(A) {
    const p = rnd(0.95, 1.05);
    tone(A, { type: 'triangle', f: 196 * p, f2: 180 * p, dur: 0.18, peak: 0.2, vib: [30, 6] }); // string twang
    burst(A, { type: 'bp', f: 1500, q: 6, dur: 0.02, peak: 0.25 });
    burst(A, { t: A.t + 0.02, f: 2500, f2: 900, q: 2, a: 0.03, dur: 0.22, peak: 0.25 }); // whoosh
    return 0.3;
  },
  blade_swing(A) {
    burst(A, { f: 700, f2: 3500, q: 1.6, a: 0.04, dur: 0.15, peak: 0.6 });
    tone(A, { t: A.t + 0.03, f: 2637 * rnd(0.97, 1.03), dur: 0.3, peak: 0.04 }); // shing
    tone(A, { t: A.t + 0.03, f: 3951 * rnd(0.97, 1.03), dur: 0.22, peak: 0.025 });
    return 0.34;
  },
  emp(A) {
    tone(A, { type: 'square', f: 2000, f2: 60, dur: 0.45, peak: 0.14, lp: 4000 });
    tone(A, { f: 60, f2: 30, dur: 0.5, peak: 0.6 });
    burst(A, { type: 'bp', f: 600, f2: 4000, q: 2, a: 0.01, dur: 0.5, peak: 0.25 });
    for (let i = 0; i < 6; i++) burst(A, { t: A.t + rnd(0.1, 0.6), type: 'hp', f: rnd(4000, 7000), dur: 0.015, peak: rnd(0.1, 0.25) }); // crackle
    return 0.7;
  },
  // ---- impacts / defence ----
  impact(A) {
    const p = rnd(0.9, 1.1);
    burst(A, { type: 'lp', f: 2400 * p, f2: 500, dur: 0.08, peak: 0.4 });
    tone(A, { type: 'triangle', f: 210 * p, f2: 80, dur: 0.08, peak: 0.22 });
    tone(A, { f: 1650 * p, dur: 0.12, peak: 0.03 }); // metal ping
    return 0.14;
  },
  impact_crit(A) {
    burst(A, { type: 'lp', f: 4000, f2: 400, dur: 0.18, peak: 0.6 });
    tone(A, { f: 120, f2: 40, dur: 0.25, peak: 0.7 });
    tone(A, { f: 1320, dur: 0.3, peak: 0.08 });
    tone(A, { f: 1980, dur: 0.22, peak: 0.05 });
    burst(A, { t: A.t + 0.02, type: 'hp', f: 5000, dur: 0.06, peak: 0.25 });
    return 0.32;
  },
  melee_impact(A) {
    tone(A, { f: 95, f2: 32, dur: 0.3, peak: 0.8 });
    burst(A, { type: 'lp', f: 1600, f2: 300, dur: 0.24, peak: 0.7, brown: true });
    burst(A, { type: 'lp', f: 4000, dur: 0.05, peak: 0.5 });
    tone(A, { f: 640 * rnd(0.95, 1.05), dur: 0.4, peak: 0.08 });
    tone(A, { f: 931 * rnd(0.95, 1.05), dur: 0.3, peak: 0.05 });
    return 0.42;
  },
  shield_hit(A) {
    [880, 1320, 1975].forEach((f, i) => tone(A, { f: f * rnd(0.98, 1.02), f2: f * 0.94, dur: 0.32 - i * 0.07, peak: 0.1 - i * 0.025 }));
    burst(A, { f: 2600, q: 4, dur: 0.1, peak: 0.2 });
    tone(A, { type: 'triangle', f: 220, f2: 330, dur: 0.18, peak: 0.08 });
    return 0.36;
  },
  shield_up(A) {
    tone(A, { type: 'triangle', f: 220, f2: 660, a: 0.15, dur: 0.3, peak: 0.12 });
    tone(A, { f: 1320, f2: 1760, a: 0.15, dur: 0.35, peak: 0.05, vib: [9, 20] });
    burst(A, { f: 1200, f2: 4000, q: 3, a: 0.12, dur: 0.25, peak: 0.08 });
    return 0.5;
  },
  shield_break(A) {
    [2093, 1760, 1397, 1047, 784].forEach((f, i) => tone(A, { t: A.t + i * 0.045, f, dur: 0.28, peak: 0.09 }));
    burst(A, { type: 'hp', f: 3000, dur: 0.45, peak: 0.32 });
    tone(A, { f: 180, f2: 60, dur: 0.35, peak: 0.28 });
    return 0.55;
  },
  heal(A) {
    const len = arp(A, [76, 81, 85, 88], { gap: 0.06, type: 'sine', dur: 0.4, peak: 0.09 });
    tone(A, { f: N(88) * 1.5, a: 0.1, dur: 0.5, peak: 0.025, vib: [6, 8] });
    burst(A, { type: 'hp', f: 7000, a: 0.05, dur: 0.3, peak: 0.03 });
    return len;
  },
  // stealth (Ghost Net & co): a glassy phase-shimmer that drains away (cloak) or blooms back in (decloak)
  cloak(A) {
    tone(A, { f: 1760, f2: 440, a: 0.02, dur: 0.45, peak: 0.06, vib: [14, 30] });
    tone(A, { type: 'triangle', f: 660, f2: 165, a: 0.03, dur: 0.4, peak: 0.07 });
    burst(A, { type: 'bp', f: 5200, f2: 900, q: 2.5, a: 0.04, dur: 0.42, peak: 0.12 });
    return 0.5;
  },
  decloak(A) {
    tone(A, { f: 440, f2: 1760, a: 0.12, dur: 0.22, peak: 0.06, vib: [14, 30] });
    tone(A, { type: 'triangle', f: 165, f2: 660, a: 0.1, dur: 0.2, peak: 0.07 });
    burst(A, { type: 'bp', f: 900, f2: 5200, q: 2.5, a: 0.14, dur: 0.16, peak: 0.12 });
    burst(A, { type: 'hp', f: 6000, t: A.t + 0.26, dur: 0.12, peak: 0.05 });
    return 0.45;
  },
  buff(A) { return arp(A, [67, 74, 79], { gap: 0.05, type: 'triangle', dur: 0.25, peak: 0.08 }); },
  debuff(A) {
    tone(A, { type: 'sawtooth', f: 400, f2: 140, dur: 0.35, peak: 0.08, lp: 1400, vib: [14, 20] });
    tone(A, { type: 'sine', f: 300, f2: 110, dur: 0.35, peak: 0.1 });
    return 0.4;
  },
  explosion(A) {
    burst(A, { type: 'lp', f: 1400, f2: 160, dur: 1.3, a: 0.004, peak: 1, brown: true });
    burst(A, { type: 'lp', f: 5000, f2: 800, dur: 0.35, peak: 0.6 });
    tone(A, { f: 72, f2: 24, dur: 1.0, peak: 0.9 });
    for (let i = 0; i < 7; i++) burst(A, { t: A.t + rnd(0.08, 0.9), type: 'hp', f: rnd(1500, 4000), dur: rnd(0.02, 0.05), peak: rnd(0.08, 0.2) });
    return 1.4;
  },
  explosion_small(A) {
    burst(A, { type: 'lp', f: 2200, f2: 300, dur: 0.5, peak: 0.7, brown: true });
    tone(A, { f: 110, f2: 40, dur: 0.4, peak: 0.5 });
    return 0.55;
  },
  // ---- big moments ----
  overdrive_charge(A, o = {}) {
    const d = o.dur ?? 0.8;
    tone(A, { type: 'sawtooth', f: 80, f2: 640, a: 0.02, dur: d, peak: 0.12, lp: 3000 });
    tone(A, { type: 'sawtooth', f: 81, f2: 648, a: 0.02, dur: d, peak: 0.08, lp: 3000, detune: 14 });
    tone(A, { f: 400, f2: 3200, a: d * 0.8, dur: 0.1, peak: 0.05 });
    burst(A, { type: 'bp', f: 300, f2: 5000, q: 3, a: d * 0.9, dur: 0.1, peak: 0.2 });
    return d + 0.1;
  },
  overdrive_release(A) {
    tone(A, { f: 55, f2: 30, dur: 0.9, peak: 0.9 });
    burst(A, { type: 'lp', f: 6000, f2: 300, dur: 0.8, peak: 0.6 });
    tone(A, { type: 'sawtooth', f: N(52), dur: 0.9, peak: 0.08, lp: 2400 });
    tone(A, { type: 'sawtooth', f: N(59), dur: 0.9, peak: 0.06, lp: 2400, detune: 8 });
    tone(A, { type: 'sawtooth', f: N(64), dur: 0.9, peak: 0.05, lp: 2400, detune: -8 });
    burst(A, { type: 'hp', f: 5000, dur: 0.5, peak: 0.15 });
    return 1;
  },
  overdrive(A, o = {}) {
    const d = o.charge ?? 0.75;
    SFX.overdrive_charge(A, { dur: d });
    return d + SFX.overdrive_release({ ...A, t: A.t + d });
  },
  death(A) {
    tone(A, { type: 'sawtooth', f: 440, f2: 40, dur: 0.9, peak: 0.12, lp: 1800 }); // power-down
    tone(A, { type: 'square', f: 220, f2: 25, dur: 0.8, peak: 0.06, lp: 900 });
    for (let i = 0; i < 4; i++) burst(A, { t: A.t + 0.1 + i * rnd(0.08, 0.14), type: 'hp', f: rnd(3000, 6000), dur: 0.02, peak: 0.15 }); // sparks
    SFX.explosion_small({ ...A, t: A.t + 0.35, v: A.v * 0.8 });
    return 1;
  },
  deploy(A) {
    tone(A, { type: 'sawtooth', f: 900, f2: 120, a: 0.01, dur: 0.18, peak: 0.05, lp: 3000 }); // drop beam
    tone(A, { t: A.t + 0.16, f: 70, f2: 32, dur: 0.35, peak: 0.85 });
    burst(A, { t: A.t + 0.16, type: 'lp', f: 900, f2: 120, dur: 0.35, peak: 0.6, brown: true });
    burst(A, { t: A.t + 0.18, type: 'bp', f: 2400, q: 5, dur: 0.06, peak: 0.12 }); // servo clank
    return 0.55;
  },
  crowd_cheer(A) { return crowd(A, { dur: 2.2, peak: 0.22, a: 0.15, whoops: 6 }); },
  crowd_swell(A) { return crowd(A, { dur: 2.8, peak: 0.16, a: 1.2, whoops: 3 }); },
  wave_start(A) {
    [0, 0.18].forEach((dt) => {
      tone(A, { t: A.t + dt, type: 'sawtooth', f: N(45), a: 0.02, hold: 0.12, dur: 0.25, peak: 0.12, lp: 1600 });
      tone(A, { t: A.t + dt, type: 'sawtooth', f: N(57), a: 0.02, hold: 0.12, dur: 0.25, peak: 0.07, lp: 2400, detune: 7 });
    });
    tone(A, { t: A.t + 0.36, f: 60, f2: 35, dur: 0.6, peak: 0.6 });
    crowd({ ...A, t: A.t + 0.2 }, { dur: 1.6, peak: 0.1, a: 0.4, whoops: 2 });
    return 2;
  },
  wave_clear(A) {
    arp(A, [64, 68, 71, 76], { gap: 0.06, type: 'triangle', dur: 0.3, peak: 0.16 });
    crowd(A, { dur: 1.5, peak: 0.12, a: 0.2, whoops: 3 });
    return 1.7;
  },
  overtime(A) {
    for (let i = 0; i < 3; i++) {
      tone(A, { t: A.t + i * 0.32, type: 'square', f: 880, f2: 660, dur: 0.22, peak: 0.12, lp: 2500 });
      tone(A, { t: A.t + i * 0.32, type: 'sawtooth', f: 110, dur: 0.24, peak: 0.16, lp: 800 });
    }
    return 1;
  },
  victory(A) { // synth fallback when the sting file is missing
    arp(A, [60, 64, 67, 72], { gap: 0.1, type: 'sawtooth', dur: 0.3, peak: 0.06 });
    tone(A, { t: A.t + 0.4, type: 'sawtooth', f: N(72), a: 0.02, hold: 0.5, dur: 0.8, peak: 0.08, lp: 3000, vib: [5, 4] });
    tone(A, { t: A.t + 0.4, type: 'sawtooth', f: N(76), a: 0.02, hold: 0.5, dur: 0.8, peak: 0.06, lp: 3000, detune: 6 });
    tone(A, { t: A.t + 0.4, type: 'sawtooth', f: N(79), a: 0.02, hold: 0.5, dur: 0.8, peak: 0.05, lp: 3000, detune: -6 });
    tone(A, { t: A.t + 0.4, f: 65, f2: 40, dur: 0.6, peak: 0.5 });
    return 1.8;
  },
  defeat(A) {
    [[64, 0], [62, 0.3], [57, 0.6]].forEach(([n, dt]) => tone(A, { t: A.t + dt, type: 'sawtooth', f: N(n), f2: N(n) * 0.97, dur: 0.5, peak: 0.14, lp: 1500 }));
    tone(A, { t: A.t + 0.6, type: 'sawtooth', f: N(45), f2: N(33), dur: 1.4, peak: 0.2, lp: 900 });
    return 2;
  },
  // ---- UI ----
  ui_tap(A) {
    tone(A, { type: 'triangle', f: 1800, f2: 1200, dur: 0.03, peak: 0.1 });
    burst(A, { type: 'hp', f: 6000, dur: 0.012, peak: 0.05 });
    return 0.05;
  },
  ui_confirm(A) {
    tone(A, { type: 'triangle', f: N(76), dur: 0.08, peak: 0.12 });
    tone(A, { t: A.t + 0.06, type: 'triangle', f: N(83), dur: 0.16, peak: 0.12 });
    tone(A, { t: A.t + 0.06, f: N(95), dur: 0.12, peak: 0.03 });
    return 0.24;
  },
  ui_back(A) {
    tone(A, { type: 'triangle', f: N(79), dur: 0.06, peak: 0.1 });
    tone(A, { t: A.t + 0.05, type: 'triangle', f: N(72), dur: 0.1, peak: 0.09 });
    return 0.16;
  },
  ui_deny(A) {
    tone(A, { type: 'square', f: 180, dur: 0.08, peak: 0.07, lp: 1200 });
    tone(A, { t: A.t + 0.09, type: 'square', f: 150, dur: 0.12, peak: 0.07, lp: 1200 });
    return 0.22;
  },
  ui_open(A) { burst(A, { f: 600, f2: 3000, q: 1.5, a: 0.05, dur: 0.12, peak: 0.08 }); return tone(A, { f: 600, f2: 1200, dur: 0.12, peak: 0.04 }); },
  card_flip(A) {
    burst(A, { f: 1200, f2: 4500, q: 1.2, a: 0.03, dur: 0.1, peak: 0.36 });
    burst(A, { t: A.t + 0.12, type: 'bp', f: 2500, q: 3, dur: 0.03, peak: 0.24 });
    return 0.16;
  },
  // o.rarity: common|rare|epic|legendary (climb length grows with rarity)
  rarity_reveal(A, o = {}) {
    const r = { common: 0, rare: 1, epic: 2, legendary: 3 }[String(o.rarity || 'common').toLowerCase()] ?? 0;
    const steps = [[60, 64, 67], [60, 64, 67, 72], [60, 63, 67, 70, 75], [60, 64, 67, 71, 74, 79, 83]][r];
    const gap = 0.11 - r * 0.012;
    tone(A, { type: 'sawtooth', f: 120, f2: 240 * (r + 1), a: 0.02, dur: steps.length * gap, peak: 0.05, lp: 2500 });
    const len = arp(A, steps, { gap, type: 'triangle', dur: 0.3, peak: 0.09 });
    const t = A.t + steps.length * gap;
    const chord = [[72], [72, 79], [72, 75, 79], [72, 76, 79, 84]][r];
    chord.forEach((n, i) => tone(A, { t, type: 'sawtooth', f: N(n), a: 0.01, hold: 0.2 + r * 0.15, dur: 0.6 + r * 0.3, peak: 0.06, lp: 3500, detune: i * 5 }));
    if (r >= 2) { tone(A, { t, f: 60, f2: 35, dur: 0.6, peak: 0.6 }); burst(A, { t, type: 'hp', f: 6000, a: 0.01, dur: 0.6 + r * 0.2, peak: 0.08 }); }
    return Math.max(len, steps.length * gap + 0.8 + r * 0.45);
  },
  level_up(A) {
    const len = arp(A, [67, 71, 74, 79, 83], { gap: 0.07, type: 'square', dur: 0.2, peak: 0.05 });
    tone(A, { t: A.t + 0.35, type: 'triangle', f: N(86), a: 0.01, hold: 0.15, dur: 0.5, peak: 0.1, vib: [7, 6] });
    burst(A, { t: A.t + 0.35, type: 'hp', f: 6500, dur: 0.4, peak: 0.05 });
    return Math.max(len, 1);
  },
  currency_tick(A) {
    const f = 2400 * rnd(0.97, 1.03);
    tone(A, { type: 'square', f, dur: 0.025, peak: 0.035, lp: 6000 });
    tone(A, { f: f * 1.5, dur: 0.06, peak: 0.03 });
    return 0.07;
  },
  reward(A) { return arp(A, [72, 76, 79, 84], { gap: 0.06, type: 'triangle', dur: 0.35, peak: 0.1 }); },
};

export const SFX_NAMES = Object.keys(SFX);

// Fantasy arena bed (battle-7): wind (brown noise, slow swells), leaf rustles and sparse birdsong, all synthesized and quiet so the
// rift music stays on top. Returns { stop(fade) }. Scheduling runs on a 250 ms timer and only queues ~1 s ahead.
export function forestAmbience(ctx, out, { level = 1 } = {}) {
  const bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(out);
  bus.gain.setTargetAtTime(0.9 * level, ctx.currentTime, 1.2);
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuf(ctx, true); wind.loop = true;
  const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 520; wlp.Q.value = 0.5;
  const wg = ctx.createGain(); wg.gain.value = 0.11;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.06; lfo.connect(lg).connect(wg.gain);
  const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = 0.11; lg2.gain.value = 260; lfo2.connect(lg2).connect(wlp.frequency);
  wind.connect(wlp).connect(wg).connect(bus);
  const t0 = ctx.currentTime; wind.start(t0, Math.random()); lfo.start(t0); lfo2.start(t0);
  const A = (t, v = 1, p = 1) => ({ ctx, out: bus, t, v, p });
  let next = { bird: t0 + rnd(1.5, 4), rustle: t0 + rnd(0.5, 2) }, dead = false;
  const bird = (t) => { // a short phrase of 2-5 chirps, one of three voices
    const kind = Math.random(), n = 2 + (Math.random() * 4 | 0), f0 = rnd(2600, 4200);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.09, 0.16);
      if (kind < 0.45) tone(A(tt, 0.5), { f: f0, f2: f0 * rnd(1.25, 1.5), a: 0.005, dur: 0.06, peak: 0.05, fixed: true });
      else if (kind < 0.8) tone(A(tt, 0.5), { f: f0 * 1.2, f2: f0 * 0.8, a: 0.01, dur: 0.09, peak: 0.04, vib: [38, 120], fixed: true });
      else tone(A(tt, 0.45), { f: f0 * 0.55, f2: f0 * 0.5, a: 0.02, dur: 0.16, peak: 0.04, fixed: true });
    }
  };
  const rustle = (t) => burst(A(t, 0.6), { type: 'bp', f: rnd(2500, 5000), q: 0.8, a: rnd(0.08, 0.2), hold: rnd(0.1, 0.4), dur: rnd(0.3, 0.7), peak: 0.05 });
  const timer = setInterval(() => {
    if (dead || ctx.state !== 'running') return;
    const h = ctx.currentTime + 1;
    while (next.bird < h) { bird(next.bird); next.bird += rnd(2.5, 7); }
    while (next.rustle < h) { rustle(next.rustle); next.rustle += rnd(1.2, 4); }
  }, 250);
  return {
    stop(fade = 1) {
      if (dead) return; dead = true; clearInterval(timer);
      const t = ctx.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.0001, t, fade / 3);
      setTimeout(() => { try { wind.stop(); lfo.stop(); lfo2.stop(); } catch { /* already stopped */ } bus.disconnect(); }, fade * 1000 + 300);
    },
  };
}

export function playSfx(ctx, out, name, t, o = {}) {
  const fn = SFX[name];
  if (!fn) return 0;
  return fn({ ctx, out, t, v: 1, p: o.rate || 1 }, o);
}
