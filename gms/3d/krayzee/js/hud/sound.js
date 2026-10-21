// Score stingers on AUDIO's sfx bus (js/audio owns the context; nothing here may throw into the frame).
import { getAudio, isUnlocked } from '../audio/index.js';

function bus() {
  try {
    if (!isUnlocked()) return null;
    const s = getAudio();
    return s?.ctx && s.buses?.sfx ? s : null;
  } catch (e) { return null; }
}

function note(S, out, { f, t, dur, type = 'triangle', gain = 0.2, attack = 0.01, detune = 0, glide = 0 }) {
  const c = S.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.setTargetAtTime(gain * 0.6, t + attack, dur * 0.3);
  g.gain.setTargetAtTime(0, t + dur * 0.8, 0.06);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.4);
}

function chain(S, gain = 0.5, cutoff = 4200) {
  const c = S.ctx, lp = c.createBiquadFilter(), g = c.createGain();
  lp.type = 'lowpass'; lp.frequency.value = cutoff; g.gain.value = gain;
  lp.connect(g); g.connect(S.buses.sfx);
  return lp;
}

const M = (n) => 440 * 2 ** ((n - 69) / 12);

// A small bell pair that climbs with the combo step.
export function playPP(step = 0) {
  const S = bus(); if (!S) return;
  try {
    const t = S.ctx.currentTime + 0.01, out = chain(S, 0.32, 6000), base = 76 + Math.min(4, step) * 2;
    for (const [k, n] of [[0, base], [0.075, base + 7]]) {
      note(S, out, { f: M(n), t: t + k, dur: 0.35, type: 'sine', gain: 0.5 });
      note(S, out, { f: M(n + 12), t: t + k, dur: 0.18, type: 'triangle', gain: 0.12 });
    }
  } catch (e) { /* */ }
}

export function playLoss() {
  const S = bus(); if (!S) return;
  try {
    const t = S.ctx.currentTime + 0.01, out = chain(S, 0.3, 2200);
    note(S, out, { f: M(64), t, dur: 0.22, type: 'triangle', gain: 0.4 });
    note(S, out, { f: M(60), t: t + 0.14, dur: 0.4, type: 'triangle', gain: 0.4, glide: 0.94 });
  } catch (e) { /* */ }
}

// Coins tumbling into the treasury.
export function playBanked(amount = 100) {
  const S = bus(); if (!S) return;
  try {
    const t = S.ctx.currentTime + 0.01, out = chain(S, 0.3, 7000);
    const n = Math.min(9, 3 + Math.floor(Math.log10(Math.max(10, amount)) * 1.5));
    for (let i = 0; i < n; i++) {
      const k = t + i * 0.055 + Math.random() * 0.02, f = M(88 + (i % 3) * 3 + Math.random() * 2);
      note(S, out, { f, t: k, dur: 0.16, type: 'sine', gain: 0.35, attack: 0.002 });
      note(S, out, { f: f * 2.76, t: k, dur: 0.08, type: 'sine', gain: 0.08, attack: 0.002 });
    }
    for (const [k, m] of [[0.05, 72], [0.05, 76], [0.05, 79], [0.25, 84]]) note(S, out, { f: M(m), t: t + n * 0.055 + k, dur: 0.6, type: 'triangle', gain: 0.16 });
  } catch (e) { /* */ }
}

// Brass-ish royal fanfare: G C E G — C(long), with a timpani roll underneath.
export function playFanfare() {
  const S = bus(); if (!S) return;
  try {
    const c = S.ctx, t = c.currentTime + 0.03, out = chain(S, 0.42, 2600);
    const seq = [[0, 67, 0.16], [0.18, 72, 0.16], [0.36, 76, 0.16], [0.54, 79, 0.3], [0.9, 76, 0.14], [1.06, 79, 0.14], [1.22, 84, 1.1]];
    for (const [k, n, d] of seq) for (const det of [-7, 0, 6]) note(S, out, { f: M(n), t: t + k, dur: d, type: 'sawtooth', gain: 0.11, attack: 0.03, detune: det });
    for (const [n, d] of [[60, 1.3], [64, 1.3], [67, 1.3]]) note(S, out, { f: M(n), t: t + 1.22, dur: d, type: 'sawtooth', gain: 0.06, attack: 0.05 });
    for (let i = 0; i < 12; i++) note(S, out, { f: M(43), t: t + 0.9 + i * 0.03, dur: 0.1, type: 'sine', gain: 0.25 * (i / 12), attack: 0.003 });
    note(S, out, { f: M(43), t: t + 1.22, dur: 0.8, type: 'sine', gain: 0.5, attack: 0.003, glide: 0.8 });
  } catch (e) { /* */ }
}

// Stop-press: three low minor stabs.
export function playScandal() {
  const S = bus(); if (!S) return;
  try {
    const t = S.ctx.currentTime + 0.02, out = chain(S, 0.4, 1800);
    for (const [k, n, d] of [[0, 50, 0.22], [0.28, 50, 0.22], [0.56, 49, 0.9]]) {
      for (const m of [n, n + 3, n + 7]) note(S, out, { f: M(m), t: t + k, dur: d, type: 'sawtooth', gain: 0.1, attack: 0.01 });
    }
  } catch (e) { /* */ }
}

export function playPrompt() {
  const S = bus(); if (!S) return;
  try {
    const t = S.ctx.currentTime + 0.01, out = chain(S, 0.18, 5000);
    note(S, out, { f: M(83), t, dur: 0.12, type: 'sine', gain: 0.4 });
    note(S, out, { f: M(88), t: t + 0.07, dur: 0.2, type: 'sine', gain: 0.35 });
  } catch (e) { /* */ }
}
