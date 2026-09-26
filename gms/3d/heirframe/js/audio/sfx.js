// Synthesised sound effects and ambient beds. No files. Each SFX schedules nodes into `out`
// starting at time t and returns its length in seconds.

const bufs = new WeakMap();
function noiseBuf(ctx) {
  let b = bufs.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    bufs.set(ctx, b);
  }
  return b;
}
const browns = new WeakMap();
function brownBuf(ctx) {
  let b = browns.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    browns.set(ctx, b);
  }
  return b;
}

// "Little star, the sky is wide / little star, go see outside." [midi, beats]
export const LULLABY = [[76, 0.5], [73, 0.5], [69, 1], [71, 0.5], [73, 0.5], [76, 0.5], [78, 1.5],
  [76, 0.5], [73, 0.5], [69, 1], [71, 0.5], [73, 0.5], [71, 0.5], [69, 1.5]];

const rnd = (a, b) => a + Math.random() * (b - a);
const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz

function envelope(g, t, a, peak, dur, hold = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + dur);
}

function filt(ctx, type, f, q = 0.7, f2, t, dur) {
  const n = ctx.createBiquadFilter();
  n.type = type; n.frequency.value = f; n.Q.value = q;
  if (f2 && t !== undefined) {
    n.frequency.setValueAtTime(f, t);
    n.frequency.exponentialRampToValueAtTime(f2, t + dur);
  }
  return n;
}

// o: {type,f,f2,t,dur,a,peak,lp,hold,detune}
function tone(A, o) {
  const { ctx, out } = A, t = o.t ?? A.t, dur = o.dur ?? 0.2, a = o.a ?? 0.004;
  const s = ctx.createOscillator(), g = ctx.createGain();
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f, t);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t + a + (o.hold || 0) + dur);
  if (o.detune) s.detune.value = o.detune;
  envelope(g, t, a, (o.peak ?? 0.3) * A.v, dur, o.hold);
  let head = s;
  if (o.lp) { const f = filt(ctx, 'lowpass', o.lp, 0.8); s.connect(f); head = f; }
  head.connect(g).connect(out);
  s.start(t); s.stop(t + a + (o.hold || 0) + dur + 0.05);
  return a + dur;
}

// o: {t,dur,type:'bp'|'hp'|'lp',f,f2,q,peak,a,hold,brown}
function burst(A, o) {
  const { ctx, out } = A, t = o.t ?? A.t, dur = o.dur ?? 0.1, a = o.a ?? 0.002;
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = o.brown ? brownBuf(ctx) : noiseBuf(ctx);
  s.loop = true;
  s.playbackRate.value = o.rate || 1;
  const type = { bp: 'bandpass', hp: 'highpass', lp: 'lowpass' }[o.type || 'bp'];
  const f = filt(ctx, type, o.f || 1000, o.q ?? 1, o.f2, t, a + (o.hold || 0) + dur);
  envelope(g, t, a, (o.peak ?? 0.3) * A.v, dur, o.hold);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random()); s.stop(t + a + (o.hold || 0) + dur + 0.05);
  return a + dur;
}

function arp(A, notes, { gap = 0.07, type = 'sine', dur = 0.35, peak = 0.14, harm = true } = {}) {
  notes.forEach((n, i) => {
    const t = A.t + i * gap;
    tone(A, { t, f: N(n), type, dur, peak });
    if (harm) tone(A, { t, f: N(n) * 2.01, dur: dur * 0.6, peak: peak * 0.25 });
  });
  return notes.length * gap + dur;
}

function echo(A, time = 0.22, fb = 0.35, mix = 0.4) {
  const { ctx, out } = A;
  const input = ctx.createGain(), d = ctx.createDelay(1), f = ctx.createGain(), w = ctx.createGain(), lp = filt(ctx, 'lowpass', 3500);
  d.delayTime.value = time; f.gain.value = fb; w.gain.value = mix;
  input.connect(out); input.connect(d); d.connect(lp).connect(f).connect(d); lp.connect(w).connect(out);
  return { ...A, out: input };
}

const loot = (notes, o = {}) => (A) => {
  const len = arp(A, notes, o);
  burst(A, { type: 'hp', f: 6000, dur: 0.12, peak: 0.05 * (o.sparkle || 1) });
  return len;
};

export const SFX = {
  step_rental(A) {
    const p = rnd(0.9, 1.1);
    burst(A, { type: 'lp', f: 900 * p, dur: 0.06, peak: 0.45 });
    tone(A, { type: 'square', f: 70 * p, f2: 45, dur: 0.08, peak: 0.18, lp: 600 });
    tone(A, { type: 'sawtooth', f: 380 * p, f2: 520 * p, t: A.t + 0.02, dur: 0.12, peak: 0.035, lp: 1600 });
    burst(A, { t: A.t + rnd(0.03, 0.06), f: 3200, q: 8, dur: 0.03, peak: 0.14 });
    return 0.2;
  },
  step_elegant(A) {
    const p = rnd(0.95, 1.05);
    burst(A, { type: 'hp', f: 2400, dur: 0.02, peak: 0.12 });
    tone(A, { f: 150 * p, f2: 90, dur: 0.05, peak: 0.14 });
    tone(A, { f: 1100 * p, f2: 1400 * p, t: A.t + 0.01, dur: 0.07, peak: 0.015 });
    return 0.1;
  },
  step_heavy(A) {
    burst(A, { type: 'lp', f: 420, dur: 0.16, peak: 0.7, brown: true });
    tone(A, { f: rnd(52, 60), f2: 34, dur: 0.22, peak: 0.55 });
    tone(A, { type: 'sawtooth', f: 180, f2: 260, t: A.t + 0.03, dur: 0.15, peak: 0.025, lp: 900 });
    return 0.25;
  },
  step_light(A) {
    burst(A, { type: 'hp', f: 3500, dur: 0.015, peak: 0.07 });
    tone(A, { f: 240, f2: 180, dur: 0.03, peak: 0.05 });
    return 0.05;
  },
  swing(A) {
    burst(A, { f: 500, f2: 2600, q: 1.4, dur: 0.18, a: 0.03, peak: 0.3 });
    return 0.22;
  },
  melee_hit(A) {
    tone(A, { type: 'square', f: rnd(170, 200), f2: 60, dur: 0.09, peak: 0.35, lp: 2000 });
    burst(A, { type: 'lp', f: 3000, dur: 0.08, peak: 0.55 });
    tone(A, { f: 1320 * rnd(0.95, 1.05), dur: 0.25, peak: 0.06 });
    tone(A, { f: 1870 * rnd(0.95, 1.05), dur: 0.2, peak: 0.04 });
    return 0.3;
  },
  melee_heavy(A) {
    tone(A, { f: 95, f2: 32, dur: 0.38, peak: 0.85 });
    burst(A, { type: 'lp', f: 1600, f2: 300, dur: 0.3, peak: 0.75, brown: true });
    burst(A, { type: 'lp', f: 4000, dur: 0.06, peak: 0.5 });
    tone(A, { f: 640, dur: 0.45, peak: 0.1 });
    tone(A, { f: 931, dur: 0.35, peak: 0.06 });
    return 0.5;
  },
  gun_energy(A) {
    const p = rnd(0.94, 1.06);
    tone(A, { type: 'square', f: 1500 * p, f2: 200, dur: 0.12, peak: 0.16, lp: 5000 });
    tone(A, { f: 950 * p, f2: 120, dur: 0.15, peak: 0.28 });
    burst(A, { type: 'hp', f: 4000, dur: 0.03, peak: 0.18 });
    return 0.18;
  },
  gun_heavy(A) {
    tone(A, { type: 'sawtooth', f: 620, f2: 55, dur: 0.26, peak: 0.28, lp: 2500 });
    burst(A, { type: 'lp', f: 2200, f2: 400, dur: 0.22, peak: 0.5 });
    tone(A, { f: 85, f2: 38, dur: 0.3, peak: 0.5 });
    return 0.35;
  },
  laser(A) {
    tone(A, { type: 'sawtooth', f: 2800, f2: 900, dur: 0.28, peak: 0.12, lp: 6000 });
    tone(A, { f: 1400, f2: 420, dur: 0.3, peak: 0.2 });
    tone(A, { f: 2100, f2: 700, dur: 0.22, peak: 0.07, detune: 18 });
    return 0.35;
  },
  explosion(A) {
    burst(A, { type: 'lp', f: 1400, f2: 180, dur: 1.3, a: 0.004, peak: 1, brown: true });
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
  shield_hit(A) {
    [880, 1320, 1975].forEach((f, i) => tone(A, { f: f * rnd(0.98, 1.02), f2: f * 0.94, dur: 0.35 - i * 0.07, peak: 0.12 - i * 0.03 }));
    burst(A, { f: 2600, q: 4, dur: 0.12, peak: 0.25 });
    tone(A, { type: 'triangle', f: 220, f2: 330, dur: 0.2, peak: 0.1 });
    return 0.4;
  },
  shield_break(A) {
    [2093, 1760, 1397, 1047, 784].forEach((f, i) => tone(A, { t: A.t + i * 0.045, f, dur: 0.3, peak: 0.1 }));
    burst(A, { type: 'hp', f: 3000, dur: 0.5, peak: 0.35 });
    tone(A, { f: 180, f2: 60, dur: 0.4, peak: 0.3 });
    return 0.6;
  },
  dodge(A) {
    burst(A, { f: 380, f2: 2400, q: 1.6, a: 0.04, dur: 0.24, peak: 0.35 });
    tone(A, { f: 200, f2: 520, dur: 0.2, peak: 0.06 });
    return 0.3;
  },
  hurt(A) {
    tone(A, { type: 'square', f: 230, f2: 110, dur: 0.12, peak: 0.2, lp: 1800 });
    burst(A, { f: 1200, dur: 0.08, peak: 0.3 });
    tone(A, { type: 'square', f: 1760, t: A.t + 0.05, dur: 0.03, peak: 0.04 });
    return 0.18;
  },
  power_down(A) {
    tone(A, { type: 'sawtooth', f: 440, f2: 38, dur: 1.0, peak: 0.22, lp: 1500 });
    burst(A, { type: 'lp', f: 900, dur: 0.3, peak: 0.3 });
    tone(A, { f: 60, dur: 0.5, peak: 0.3 });
    burst(A, { t: A.t + 0.9, f: 4000, q: 6, dur: 0.05, peak: 0.1 });
    return 1.1;
  },
  loot_common: loot([84, 91], { dur: 0.25, peak: 0.1 }),
  loot_uncommon: loot([79, 84, 91], { peak: 0.11 }),
  loot_rare(A) { return loot([76, 83, 88, 95], { type: 'triangle', peak: 0.12, sparkle: 1.5 })(A); },
  loot_epic(A) {
    const len = loot([74, 81, 86, 90, 93], { type: 'triangle', peak: 0.12, sparkle: 2 })(A);
    [62, 69].forEach((n) => tone(A, { type: 'sawtooth', f: N(n), a: 0.1, dur: 0.8, peak: 0.03, lp: 1400, detune: 8 }));
    return Math.max(len, 0.95);
  },
  loot_legendary(A) {
    const E = echo(A, 0.18, 0.3, 0.35);
    arp(E, [72, 79, 84, 88, 91, 96], { gap: 0.06, type: 'triangle', dur: 0.5, peak: 0.12 });
    tone(A, { f: N(48), a: 0.2, dur: 1.2, peak: 0.25 });
    [60, 64, 67].forEach((n) => tone(A, { type: 'sawtooth', f: N(n), a: 0.15, hold: 0.3, dur: 0.9, peak: 0.03, lp: 1800, detune: rnd(-9, 9) }));
    burst(A, { type: 'hp', f: 5000, a: 0.2, dur: 0.8, peak: 0.06 });
    return 1.6;
  },
  // Heirlooms play the first phrase of the family lullaby on bells ("Little star, the sky is wide").
  loot_heirloom(A) {
    const E = echo(A, 0.27, 0.42, 0.45);
    let t = A.t;
    LULLABY.slice(0, 7).forEach(([n, beats]) => {
      tone(E, { t, f: N(n), dur: 1.1, peak: 0.13 });
      tone(E, { t, f: N(n) * 2.76, dur: 0.5, peak: 0.03 });
      tone(E, { t, f: N(n) * 5.4, dur: 0.25, peak: 0.012 });
      t += beats * 0.3;
    });
    tone(A, { f: N(45), a: 0.4, hold: 0.6, dur: 1.4, peak: 0.28 });
    [57, 61, 64, 66].forEach((n) => tone(A, { t: A.t + 1.1, type: 'sawtooth', f: N(n), a: 0.35, hold: 0.5, dur: 1.2, peak: 0.028, lp: 1600, detune: rnd(-7, 7) }));
    burst(A, { t: A.t + 1.1, type: 'hp', f: 6000, a: 0.3, dur: 1.2, peak: 0.05 });
    return 3.4;
  },
  lullaby(A, o = {}) { // music box
    const E = echo(A, 0.3, 0.3, 0.3), beat = o.beat || 0.55;
    let t = A.t;
    LULLABY.forEach(([n, beats]) => {
      tone(E, { t, f: N(n + 12), dur: 1.4, peak: 0.1 });
      tone(E, { t, f: N(n + 12) * 3.01, dur: 0.4, peak: 0.02 });
      t += beats * beat;
    });
    return t - A.t + 1.6;
  },
  lullaby_hum(A, o = {}) { // soft hummed version (HIRA's firmware hiccup, Seraph)
    const { ctx } = A, beat = o.beat || 0.62, notes = LULLABY.slice(0, o.notes || LULLABY.length);
    let t = A.t;
    notes.forEach(([n, beats]) => {
      const len = beats * beat;
      const s = ctx.createOscillator(), v = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain(), f = filt(ctx, 'lowpass', 900, 0.7);
      s.type = 'triangle'; s.frequency.value = N(n - 12);
      v.frequency.value = 5.2; vg.gain.value = 3.5; v.connect(vg).connect(s.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14 * A.v, t + 0.08);
      g.gain.setValueAtTime(0.14 * A.v, t + len * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.05);
      s.connect(f).connect(g).connect(A.out);
      s.start(t); v.start(t); s.stop(t + len + 0.1); v.stop(t + len + 0.1);
      t += len;
    });
    return t - A.t + 0.2;
  },
  ui_click(A) {
    tone(A, { f: 1800, f2: 1200, dur: 0.03, peak: 0.12 });
    burst(A, { type: 'hp', f: 5000, dur: 0.01, peak: 0.06 });
    return 0.05;
  },
  ui_hover(A) { return tone(A, { f: 2400, dur: 0.025, peak: 0.035 }); },
  ui_confirm(A) {
    tone(A, { type: 'triangle', f: 880, dur: 0.08, peak: 0.13 });
    tone(A, { type: 'triangle', t: A.t + 0.07, f: 1320, dur: 0.14, peak: 0.13 });
    return 0.24;
  },
  ui_deny(A) {
    tone(A, { type: 'square', f: 330, dur: 0.08, peak: 0.09, lp: 1500 });
    tone(A, { type: 'square', t: A.t + 0.09, f: 220, dur: 0.14, peak: 0.09, lp: 1500 });
    return 0.25;
  },
  ui_open(A) {
    burst(A, { f: 700, f2: 3200, dur: 0.14, a: 0.02, peak: 0.1 });
    tone(A, { f: 600, f2: 1200, dur: 0.12, peak: 0.06 });
    return 0.18;
  },
  ui_close(A) {
    burst(A, { f: 3200, f2: 700, dur: 0.12, a: 0.01, peak: 0.08 });
    tone(A, { f: 1100, f2: 550, dur: 0.1, peak: 0.05 });
    return 0.15;
  },
  credits(A) {
    burst(A, { type: 'hp', f: 3000, dur: 0.05, peak: 0.18 });
    tone(A, { type: 'square', f: 180, f2: 120, dur: 0.05, peak: 0.06, lp: 1200 });
    [2093, 2637, 3136].forEach((f) => tone(A, { t: A.t + 0.07, f, dur: 0.6, peak: 0.09 }));
    for (let i = 0; i < 5; i++) tone(A, { t: A.t + 0.1 + rnd(0, 0.25), f: rnd(3500, 5200), dur: 0.08, peak: 0.03 });
    return 0.75;
  },
  levelup(A) {
    const E = echo(A, 0.16, 0.25, 0.3);
    [60, 64, 67, 72].forEach((n, i) => {
      tone(E, { t: A.t + i * 0.11, type: 'triangle', f: N(n), dur: 0.2, peak: 0.14 });
      tone(E, { t: A.t + i * 0.11, type: 'square', f: N(n), dur: 0.12, peak: 0.03, lp: 3000 });
    });
    [72, 76, 79, 84].forEach((n) => tone(E, { t: A.t + 0.46, type: 'sawtooth', f: N(n), a: 0.02, hold: 0.35, dur: 0.7, peak: 0.035, lp: 3200, detune: rnd(-6, 6) }));
    tone(A, { t: A.t + 0.46, f: N(48), hold: 0.3, dur: 0.8, peak: 0.25 });
    burst(A, { f: 800, f2: 7000, a: 0.3, dur: 0.2, peak: 0.08 });
    return 1.6;
  },
  contract_accept(A) {
    tone(A, { f: 150, f2: 70, dur: 0.12, peak: 0.35 });
    burst(A, { type: 'lp', f: 2500, dur: 0.05, peak: 0.25 });
    tone(A, { t: A.t + 0.1, type: 'triangle', f: 1047, dur: 0.1, peak: 0.1 });
    tone(A, { t: A.t + 0.18, type: 'triangle', f: 1568, dur: 0.22, peak: 0.1 });
    return 0.45;
  },
  hack_beep(A) {
    return tone(A, { type: 'square', f: [1200, 1600, 2000, 2400][Math.floor(Math.random() * 4)], dur: 0.05, peak: 0.06, lp: 4500 });
  },
  scan(A) {
    tone(A, { f: 400, f2: 2400, a: 0.05, dur: 0.6, peak: 0.08 });
    burst(A, { f: 600, f2: 4000, q: 6, a: 0.1, dur: 0.5, peak: 0.08 });
    for (let i = 0; i < 4; i++) tone(A, { t: A.t + 0.12 * i, type: 'square', f: 3000, dur: 0.02, peak: 0.03, lp: 5000 });
    return 0.7;
  },
  hack_success(A) {
    [1200, 1600, 2400].forEach((f, i) => tone(A, { t: A.t + i * 0.06, type: 'square', f, dur: 0.05, peak: 0.06, lp: 5000 }));
    [76, 83, 88].forEach((n) => tone(A, { t: A.t + 0.2, type: 'triangle', f: N(n), dur: 0.4, peak: 0.07 }));
    return 0.65;
  },
  hack_fail(A) {
    tone(A, { type: 'sawtooth', f: 110, hold: 0.2, dur: 0.15, peak: 0.16, lp: 1200 });
    tone(A, { type: 'sawtooth', f: 116, hold: 0.2, dur: 0.15, peak: 0.12, lp: 1200 });
    return 0.4;
  },
  stealth_alert(A) {
    burst(A, { type: 'hp', f: 2500, dur: 0.08, peak: 0.3 });
    tone(A, { type: 'square', f: 1046, dur: 0.12, peak: 0.12, lp: 5000 });
    tone(A, { type: 'square', f: 1568, dur: 0.12, peak: 0.1, lp: 5000 });
    tone(A, { f: 70, f2: 45, dur: 0.5, peak: 0.6 });
    [61, 62, 68].forEach((n) => tone(A, { t: A.t + 0.08, type: 'sawtooth', f: N(n), a: 0.02, hold: 0.25, dur: 0.6, peak: 0.04, lp: 2600 }));
    return 1.0;
  },
  alarm(A) {
    for (let i = 0; i < 3; i++) {
      tone(A, { t: A.t + i * 0.5, type: 'square', f: 880, hold: 0.2, dur: 0.05, peak: 0.07, lp: 3000 });
      tone(A, { t: A.t + i * 0.5 + 0.25, type: 'square', f: 660, hold: 0.2, dur: 0.05, peak: 0.07, lp: 3000 });
    }
    return 1.5;
  },
  flyby(A, o) {
    const { ctx } = A, t = A.t, dur = o.dur || rnd(2.2, 3.4), dir = o.dir ?? (Math.random() < 0.5 ? -1 : 1);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const B = { ...A, out: pan || A.out };
    if (pan) {
      pan.pan.setValueAtTime(-0.95 * dir, t);
      pan.pan.linearRampToValueAtTime(0.95 * dir, t + dur);
      pan.connect(A.out);
    }
    const f = rnd(90, 150);
    const s = ctx.createOscillator(), g = ctx.createGain(), lp = filt(ctx, 'lowpass', 900, 1);
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(f * 1.12, t);
    s.frequency.linearRampToValueAtTime(f * 1.1, t + dur * 0.45);
    s.frequency.linearRampToValueAtTime(f * 0.86, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * A.v, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp).connect(g).connect(B.out);
    s.start(t); s.stop(t + dur + 0.1);
    burst(B, { t, f: 1200, f2: 700, q: 0.8, a: dur * 0.5, dur: dur * 0.5, peak: 0.12 });
    return dur;
  },
  door(A) {
    burst(A, { type: 'hp', f: 1500, a: 0.02, dur: 0.35, peak: 0.15 });
    tone(A, { f: 200, f2: 120, dur: 0.1, peak: 0.15 });
    tone(A, { t: A.t + 0.3, f: 90, dur: 0.08, peak: 0.2 });
    return 0.45;
  },
  pickup(A) { return tone(A, { type: 'triangle', f: 1200, f2: 1800, dur: 0.07, peak: 0.1 }); },
};

SFX.hit = SFX.melee_hit;
SFX.shoot = SFX.gun_energy;
// DESIGN §6.2 rarity names
SFX.loot_scrap = (A) => { burst(A, { type: 'lp', f: 1200, dur: 0.06, peak: 0.3 }); return tone(A, { type: 'square', f: 140, f2: 90, dur: 0.08, peak: 0.08, lp: 900 }); };
SFX.loot_standard = SFX.loot_common;
SFX.loot_tuned = SFX.loot_uncommon;
SFX.loot_custom = SFX.loot_rare;
SFX.loot_refined = SFX.loot_rare; // ui core.js tier name
SFX.loot_prototype = SFX.loot_epic;
SFX.loot_relic = SFX.loot_legendary;

export function playSfx(ctx, out, name, t, o = {}) {
  let fn = SFX[name];
  if (name === 'step') fn = SFX['step_' + (o.kind || 'rental')] || SFX.step_rental;
  if (name === 'loot') fn = SFX['loot_' + String(o.rarity || 'common').toLowerCase()] || SFX.loot_common;
  if (!fn) return 0;
  return fn({ ctx, out, t, v: 1 }, o);
}

// ---- Looping sources -------------------------------------------------------------------------

function loopNoise(ctx, out, { brown = false, type = 'lowpass', f = 800, q = 0.7, gain = 0.1, rate = 1 }) {
  const s = ctx.createBufferSource(), fl = filt(ctx, type, f, q), g = ctx.createGain();
  s.buffer = brown ? brownBuf(ctx) : noiseBuf(ctx); s.loop = true; s.playbackRate.value = rate;
  g.gain.value = gain;
  s.connect(fl).connect(g).connect(out);
  s.start(ctx.currentTime, Math.random() * 1.5);
  return { src: s, gain: g, filter: fl, stop: (t) => { try { s.stop(t); } catch (e) { /* already */ } } };
}

function lfo(ctx, param, rate, depth) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = rate; g.gain.value = depth;
  o.connect(g).connect(param); o.start();
  return { stop: (t) => { try { o.stop(t); } catch (e) { /* already */ } } };
}

function oscLoop(ctx, out, type, f, gain, lp) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = f; g.gain.value = gain;
  let head = o;
  if (lp) { const fl = filt(ctx, 'lowpass', lp); o.connect(fl); head = fl; }
  head.connect(g).connect(out); o.start();
  return { gain: g, osc: o, stop: (t) => { try { o.stop(t); } catch (e) { /* already */ } } };
}

const LAYERS = {
  traffic(ctx, out, lv) {
    const a = loopNoise(ctx, out, { brown: true, f: 220, gain: 0.5 * lv });
    const b = oscLoop(ctx, out, 'sawtooth', 55, 0.02 * lv, 160);
    const c = oscLoop(ctx, out, 'sawtooth', 55.7, 0.02 * lv, 160);
    const m = lfo(ctx, a.gain.gain, 0.07, 0.15 * lv);
    return [a, b, c, m];
  },
  crowd(ctx, out, lv) {
    const parts = [];
    [[480, 3.1], [820, 4.3], [1350, 5.2], [650, 3.7], [1900, 4.8]].forEach(([f, r]) => {
      const n = loopNoise(ctx, out, { f, type: 'bandpass', q: 6, gain: 0.0 });
      n.gain.gain.value = 0.06 * lv;
      parts.push(n, lfo(ctx, n.gain.gain, r * rnd(0.8, 1.2), 0.055 * lv), lfo(ctx, n.filter.frequency, rnd(0.3, 0.7), f * 0.25));
    });
    return parts;
  },
  fountain(ctx, out, lv) {
    const a = loopNoise(ctx, out, { type: 'bandpass', f: 2500, q: 0.5, gain: 0.12 * lv });
    const b = loopNoise(ctx, out, { type: 'highpass', f: 5000, gain: 0.05 * lv, rate: 0.8 });
    return [a, b, lfo(ctx, a.gain.gain, 1.7, 0.03 * lv), lfo(ctx, b.gain.gain, 3.1, 0.02 * lv)];
  },
  waterfall(ctx, out, lv) {
    const a = loopNoise(ctx, out, { brown: true, type: 'lowpass', f: 900, gain: 0.8 * lv });
    const b = loopNoise(ctx, out, { type: 'bandpass', f: 1800, q: 0.4, gain: 0.14 * lv });
    return [a, b, lfo(ctx, b.gain.gain, 0.4, 0.03 * lv)];
  },
  room(ctx, out, lv) {
    const a = loopNoise(ctx, out, { brown: true, f: 300, gain: 0.25 * lv });
    const b = oscLoop(ctx, out, 'sine', 60, 0.03 * lv);
    const c = oscLoop(ctx, out, 'sine', 120, 0.012 * lv);
    return [a, b, c];
  },
  machine(ctx, out, lv) {
    const a = oscLoop(ctx, out, 'sawtooth', 98, 0.03 * lv, 400);
    const b = loopNoise(ctx, out, { type: 'bandpass', f: 700, q: 3, gain: 0.05 * lv });
    return [a, b, lfo(ctx, a.gain.gain, 2.2, 0.012 * lv)];
  },
  holo(ctx, out, lv) {
    const a = oscLoop(ctx, out, 'square', 120, 0.012 * lv, 2500);
    const b = oscLoop(ctx, out, 'sine', 3900, 0.003 * lv);
    return [a, b, lfo(ctx, a.gain.gain, 7, 0.006 * lv)];
  },
  wind(ctx, out, lv) {
    const a = loopNoise(ctx, out, { type: 'bandpass', f: 500, q: 0.6, gain: 0.12 * lv });
    return [a, lfo(ctx, a.filter.frequency, 0.08, 250), lfo(ctx, a.gain.gain, 0.11, 0.05 * lv)];
  },
};

// Occasional one-shots layered on a bed.
const EVENTS = {
  flyby: (ctx, out) => SFX.flyby({ ctx, out, t: ctx.currentTime + 0.05, v: rnd(0.4, 1) }, {}),
  chime(ctx, out) { // distant civic chime (PA idents / tram bells)
    const A = { ctx, out, t: ctx.currentTime + 0.05, v: 0.35 };
    return arp(A, [[76, 72, 79], [72, 76, 79, 84], [79, 76]][Math.floor(Math.random() * 3)], { gap: 0.28, type: 'sine', dur: 1.0, peak: 0.08 });
  },
  bird(ctx, out) {
    const A = { ctx, out, t: ctx.currentTime + 0.05, v: 0.5 };
    const n = 2 + Math.floor(Math.random() * 4), base = rnd(2600, 4200);
    for (let i = 0; i < n; i++) tone(A, { t: A.t + i * rnd(0.08, 0.14), f: base * rnd(0.9, 1.2), f2: base * rnd(1.1, 1.5), dur: 0.06, peak: 0.05 });
    return 0.8;
  },
  drip(ctx, out) {
    const A = { ctx, out, t: ctx.currentTime + 0.05, v: 0.6 };
    return tone(A, { f: rnd(900, 1500), f2: rnd(1800, 2600), dur: 0.08, peak: 0.08 });
  },
  clank(ctx, out) {
    const A = { ctx, out, t: ctx.currentTime + 0.05, v: 0.25 };
    tone(A, { f: rnd(300, 500), dur: 0.6, peak: 0.08 });
    tone(A, { f: rnd(700, 1100), dur: 0.4, peak: 0.05 });
    return burst(A, { type: 'lp', f: 2000, dur: 0.05, peak: 0.2 });
  },
};

export const BEDS = {
  city: { layers: { traffic: 0.8, crowd: 0.6, fountain: 0.25, wind: 0.3 }, events: { flyby: 9, chime: 45 } },
  plaza: { layers: { traffic: 0.5, crowd: 1, fountain: 0.6 }, events: { flyby: 12, chime: 30 } },
  park: { layers: { traffic: 0.35, crowd: 0.25, fountain: 0.5, wind: 0.6 }, events: { bird: 4, flyby: 20 } },
  boulevard: { layers: { traffic: 1, crowd: 0.45, wind: 0.4 }, events: { flyby: 5 } },
  warehouse: { layers: { room: 0.8, machine: 0.5 }, events: { clank: 14 } },
  interior: { layers: { room: 0.6, holo: 0.4 }, events: {} },
  undercity: { layers: { room: 1, machine: 0.6, wind: 0.4 }, events: { drip: 3, clank: 8 } },
};

export function createBed(ctx, out, name) {
  const def = BEDS[name];
  if (!def) return null;
  const parts = [];
  for (const [k, lv] of Object.entries(def.layers)) parts.push(...LAYERS[k](ctx, out, lv));
  const timers = [];
  let live = true;
  for (const [k, every] of Object.entries(def.events)) {
    const tick = () => {
      if (!live) return;
      if (ctx.state === 'running') EVENTS[k](ctx, out);
      timers.push(setTimeout(tick, every * 1000 * rnd(0.5, 1.5)));
    };
    timers.push(setTimeout(tick, every * 1000 * rnd(0.2, 1)));
  }
  return {
    stop(t) { live = false; timers.forEach(clearTimeout); parts.forEach((p) => p.stop(t)); },
  };
}

export const EMITTERS = ['fountain', 'waterfall', 'machine', 'holo', 'traffic', 'crowd', 'room', 'wind'];

export function createLoop(ctx, out, kind, level = 1) {
  const f = LAYERS[kind];
  if (!f) return null;
  const parts = f(ctx, out, level);
  return { stop(t) { parts.forEach((p) => p.stop(t)); } };
}

export const SFX_NAMES = Object.keys(SFX).concat(['step', 'loot']);
