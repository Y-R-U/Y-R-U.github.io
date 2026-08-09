/**
 * UI and reward sounds.
 *
 * All of them are tuned to D natural minor — the same key the score runs in — so a
 * level-up landing over the music is consonant instead of a clash. UI plays on its own
 * bus: no distance attenuation, no panning, no ducking.
 */

import {
  env, partial, modal, thump, fm, reverbTail, softClip, mixInto, karplus,
} from './dsp.js';
import { noiseBody, scatter } from './sfx-materials.js';

const N = { D2: 73.42, A2: 110, D3: 146.83, F3: 174.61, G3: 196, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, C5: 523.25, D5: 587.33, F5: 698.46, A5: 880, D6: 1174.66 };

function pluck(o, sr, rng, freq, amp, at = 0, o2 = {}) {
  const len = Math.min(o.length - at, Math.ceil((o2.len ?? 0.7) * sr));
  if (len <= 32) return o;
  const k = karplus(len, sr, freq, { rng, bright: o2.bright ?? 0.35, damp: o2.damp ?? 0.45, loss: o2.loss ?? 0.0006 });
  if (o2.mute) env(k, sr, { a: 0.001, d: o2.mute, curve: 2.2 });
  return mixInto(o, k, amp, at);
}

/** Inharmonic struck bell. Distant, church-ish, and it survives being quiet. */
function bell(o, sr, rng, f, amp, decay = 2.0, at = 0) {
  return modal(o, sr, f, [
    [0.5, 0.22, decay * 1.2], [1, 0.5, decay], [1.19, 0.3, decay * 0.7],
    [1.56, 0.22, decay * 0.55], [2, 0.18, decay * 0.5], [2.51, 0.12, decay * 0.35],
    [2.66, 0.09, decay * 0.3], [3.01, 0.07, decay * 0.25], [4.07, 0.04, decay * 0.16],
  ], { rng, jitter: 0.004, gain: amp, from: at });
}

const shimmer = (o, sr, rng, at, dur, amp) =>
  scatter(o, sr, rng, { t0: at, t1: at + dur, count: 22, fLo: 2600, fHi: 10000, decay: 0.022, amp, clump: 0.3 });

export const UI_SFX = {
  'ui.click': {
    dur: 0.22, gain: 0.3, prio: 6, rate: 0.02, max: 3, variants: 3, sr: 44100, bus: 'ui', send: 0.1,
    gen(o, sr, rng) {
      pluck(o, sr, rng, N.A4, 0.5, 0, { len: 0.2, bright: 0.6, damp: 0.9, mute: 0.09 });
      noiseBody(o, sr, rng, { dur: 0.012, f0: 3800, f1: 1400, q: 1.4, amp: 0.22, curve: 3.5 });
    },
  },
  'ui.hover': {
    dur: 0.12, gain: 0.14, prio: 3, rate: 0.05, max: 2, variants: 3, sr: 44100, bus: 'ui', send: 0.08,
    gen(o, sr, rng) {
      partial(o, sr, N.D6, 0.4, 0.035);
      partial(o, sr, N.A5, 0.2, 0.05);
    },
  },
  'ui.select': {
    dur: 0.5, gain: 0.3, prio: 6, rate: 0.03, max: 2, variants: 2, sr: 44100, bus: 'ui', send: 0.2,
    gen(o, sr, rng) {
      pluck(o, sr, rng, N.A4, 0.4, 0, { len: 0.3, bright: 0.55, mute: 0.16 });
      pluck(o, sr, rng, N.D5, 0.35, (0.06 * sr) | 0, { len: 0.35, bright: 0.6, mute: 0.2 });
    },
  },
  'ui.confirm': {
    dur: 0.9, gain: 0.36, prio: 6, rate: 0.05, max: 2, variants: 2, sr: 44100, bus: 'ui', send: 0.26,
    gen(o, sr, rng) {
      pluck(o, sr, rng, N.A4, 0.4, 0, { len: 0.5, bright: 0.5 });
      pluck(o, sr, rng, N.D5, 0.4, (0.075 * sr) | 0, { len: 0.6, bright: 0.55 });
      bell(o, sr, rng, N.D5, 0.1, 0.9, (0.075 * sr) | 0);
      reverbTail(o, sr, { mix: 0.2, time: 0.9, damp: 0.3 });
    },
  },
  'ui.back': {
    dur: 0.6, gain: 0.3, prio: 6, rate: 0.05, max: 2, variants: 2, sr: 44100, bus: 'ui', send: 0.2,
    gen(o, sr, rng) {
      pluck(o, sr, rng, N.D5, 0.35, 0, { len: 0.35, bright: 0.45, mute: 0.22 });
      pluck(o, sr, rng, N.A4, 0.35, (0.07 * sr) | 0, { len: 0.45, bright: 0.4, mute: 0.3 });
    },
  },
  'ui.deny': {
    dur: 0.4, gain: 0.32, prio: 6, rate: 0.06, max: 2, variants: 2, bus: 'ui', send: 0.12,
    gen(o, sr, rng) {
      // minor second, damped — reads as "no" without a buzzer
      partial(o, sr, N.F3, 0.4, 0.18);
      partial(o, sr, N.F3 * 1.06, 0.36, 0.16);
      noiseBody(o, sr, rng, { dur: 0.05, f0: 900, f1: 300, q: 1.6, amp: 0.18, curve: 3 });
    },
  },
  'ui.error': {
    dur: 0.6, gain: 0.36, prio: 7, rate: 0.1, max: 2, variants: 2, bus: 'ui', send: 0.16,
    gen(o, sr, rng) {
      partial(o, sr, N.D3, 0.45, 0.3, { bendTo: N.D3 * 0.94, bendTau: 0.12 });
      partial(o, sr, N.D3 * 1.07, 0.3, 0.26);
      thump(o, sr, 120, 70, 0.2, 0.08);
    },
  },
  'ui.tick': {
    dur: 0.08, gain: 0.12, prio: 2, rate: 0.02, max: 4, variants: 3, sr: 44100, bus: 'ui', send: 0,
    gen(o, sr, rng) { partial(o, sr, N.A5, 0.4, 0.02); },
  },
  'ui.xp': {
    dur: 0.2, gain: 0.16, prio: 2, rate: 0.03, max: 4, variants: 4, sr: 44100, bus: 'ui', send: 0.14,
    gen(o, sr, rng) {
      const f = [N.A4, N.C5, N.D5, N.F5][rng.int(0, 3)];
      partial(o, sr, f, 0.4, 0.06);
      partial(o, sr, f * 2, 0.14, 0.035);
    },
  },

  'ui.pickup': {
    dur: 0.7, gain: 0.34, prio: 6, rate: 0.03, max: 3, variants: 3, sr: 44100, bus: 'ui', send: 0.26,
    gen(o, sr, rng) {
      partial(o, sr, N.D5, 0.4, 0.18);
      partial(o, sr, N.A5, 0.3, 0.14, { bendTo: N.A5 * 1.005, bendTau: 0.1 });
      partial(o, sr, N.D6, 0.14, 0.1);
      shimmer(o, sr, rng, 0.01, 0.28, 0.1);
      reverbTail(o, sr, { mix: 0.2, time: 0.7, damp: 0.25 });
    },
  },
  'ui.pickup_shard': {
    dur: 1.6, gain: 0.45, prio: 7, rate: 0.06, max: 2, variants: 3, sr: 44100, bus: 'ui', send: 0.36,
    gen(o, sr, rng) {
      bell(o, sr, rng, N.D5, 0.32, 1.3);
      partial(o, sr, N.A5, 0.18, 0.7);
      shimmer(o, sr, rng, 0.0, 0.9, 0.16);
      noiseBody(o, sr, rng, { dur: 0.3, f0: 2200, f1: 9000, q: 1.4, amp: 0.16, a: 0.09, curve: 1.5 });
      reverbTail(o, sr, { mix: 0.3, time: 1.6, damp: 0.2 });
    },
  },
  'ui.pickup_focus': {
    dur: 0.6, gain: 0.28, prio: 4, rate: 0.03, max: 3, variants: 3, sr: 44100, bus: 'ui', send: 0.22,
    gen(o, sr, rng) {
      partial(o, sr, N.G4, 0.4, 0.14, { bendTo: N.D5, bendTau: 0.06 });
      partial(o, sr, N.D5, 0.2, 0.2);
      shimmer(o, sr, rng, 0.01, 0.2, 0.07);
    },
  },

  'ui.circle_ready': {
    dur: 0.9, gain: 0.24, prio: 4, rate: 0.08, max: 2, variants: 3, sr: 44100, bus: 'ui', send: 0.3,
    gen(o, sr, rng) {
      // heard constantly in play, so: soft, short, no transient to fatigue on
      partial(o, sr, N.A5, 0.3, 0.28, { bendTo: N.A5, bendTau: 0.1 });
      partial(o, sr, N.D6, 0.12, 0.2);
      partial(o, sr, N.D5, 0.1, 0.35);
      reverbTail(o, sr, { mix: 0.24, time: 0.9, damp: 0.25 });
    },
  },

  'ui.levelup': {
    dur: 2.6, gain: 0.6, prio: 9, rate: 0.5, max: 1, variants: 2, sr: 44100, bus: 'ui', send: 0.4,
    gen(o, sr, rng) {
      // D minor arpeggio blooming into a bell — a reward, not a fanfare
      const seq = [[N.D4, 0], [N.F4, 0.075], [N.A4, 0.15], [N.D5, 0.225], [N.F5, 0.3]];
      for (const [f, t] of seq) pluck(o, sr, rng, f, 0.28, (t * sr) | 0, { len: 1.4, bright: 0.45, loss: 0.0004 });
      bell(o, sr, rng, N.D4, 0.3, 2.0, (0.3 * sr) | 0);
      partial(o, sr, N.D3, 0.18, 1.8);
      partial(o, sr, N.A3, 0.1, 1.6);
      shimmer(o, sr, rng, 0.25, 1.4, 0.12);
      noiseBody(o, sr, rng, { dur: 0.5, f0: 1400, f1: 8000, q: 1.2, amp: 0.16, a: 0.2, curve: 1.4 });
      reverbTail(o, sr, { mix: 0.3, time: 2.2, damp: 0.22 });
      softClip(o, 1.05);
    },
  },
  'ui.spell_learn': {
    dur: 3.0, gain: 0.6, prio: 9, rate: 0.5, max: 1, variants: 2, sr: 44100, bus: 'ui', send: 0.45,
    gen(o, sr, rng) {
      // a swell that resolves — the spell arriving rather than being announced
      noiseBody(o, sr, rng, { dur: 0.8, f0: 300, f1: 5200, q: 1.8, amp: 0.35, a: 0.6, curve: 1.2 });
      const at = (0.7 * sr) | 0;
      bell(o, sr, rng, N.A3, 0.34, 2.4, at);
      for (const [f, t] of [[N.D5, 0.7], [N.A4, 0.79], [N.F5, 0.88], [N.D6, 0.97]]) {
        pluck(o, sr, rng, f, 0.2, (t * sr) | 0, { len: 1.6, bright: 0.5, loss: 0.0003 });
      }
      partial(o, sr, N.D2, 0.2, 2.2, { from: at });
      fm(o, sr, { carrier: N.D3, ratio: 2.01, index: 2.2, indexDecay: 0.6, decay: 1.8, amp: 0.12 });
      shimmer(o, sr, rng, 0.7, 1.6, 0.13);
      reverbTail(o, sr, { mix: 0.34, time: 2.6, damp: 0.2 });
      softClip(o, 1.05);
    },
  },
  'ui.spell_levelup': {
    dur: 1.8, gain: 0.5, prio: 8, rate: 0.3, max: 1, variants: 2, sr: 44100, bus: 'ui', send: 0.38,
    gen(o, sr, rng) {
      for (const [f, t] of [[N.A4, 0], [N.D5, 0.06], [N.A5, 0.12]]) {
        pluck(o, sr, rng, f, 0.26, (t * sr) | 0, { len: 1.0, bright: 0.55 });
      }
      bell(o, sr, rng, N.D5, 0.18, 1.2, (0.12 * sr) | 0);
      shimmer(o, sr, rng, 0.05, 0.8, 0.11);
      reverbTail(o, sr, { mix: 0.28, time: 1.4, damp: 0.24 });
    },
  },

  'ui.pause': {
    dur: 1.0, gain: 0.34, prio: 8, rate: 0.2, max: 1, variants: 2, bus: 'ui', send: 0.3,
    gen(o, sr, rng) {
      partial(o, sr, N.D4, 0.35, 0.6, { bendTo: N.A3, bendTau: 0.22 });
      partial(o, sr, N.A3, 0.2, 0.7);
      noiseBody(o, sr, rng, { dur: 0.4, f0: 4200, f1: 400, q: 1.2, amp: 0.22, curve: 1.8 });
    },
  },
  'ui.unpause': {
    dur: 0.8, gain: 0.34, prio: 8, rate: 0.2, max: 1, variants: 2, bus: 'ui', send: 0.26,
    gen(o, sr, rng) {
      partial(o, sr, N.A3, 0.3, 0.5, { bendTo: N.D4, bendTau: 0.18 });
      noiseBody(o, sr, rng, { dur: 0.35, f0: 400, f1: 4200, q: 1.2, amp: 0.22, a: 0.12, curve: 1.6 });
    },
  },
  'ui.menu_open': {
    dur: 0.7, gain: 0.28, prio: 6, rate: 0.1, max: 2, variants: 2, sr: 44100, bus: 'ui', send: 0.24,
    gen(o, sr, rng) {
      noiseBody(o, sr, rng, { dur: 0.3, f0: 600, f1: 3600, q: 1.1, amp: 0.4, a: 0.1, curve: 1.7 });
      pluck(o, sr, rng, N.D5, 0.2, (0.12 * sr) | 0, { len: 0.4, bright: 0.5, mute: 0.25 });
    },
  },
  'ui.menu_close': {
    dur: 0.6, gain: 0.26, prio: 6, rate: 0.1, max: 2, variants: 2, sr: 44100, bus: 'ui', send: 0.2,
    gen(o, sr, rng) {
      noiseBody(o, sr, rng, { dur: 0.28, f0: 3600, f1: 500, q: 1.1, amp: 0.4, a: 0.03, curve: 2.2 });
      pluck(o, sr, rng, N.A4, 0.18, 0, { len: 0.3, bright: 0.4, mute: 0.2 });
    },
  },
  'ui.gameover': {
    dur: 4.0, gain: 0.7, prio: 9, rate: 2, max: 1, variants: 1, bus: 'ui', send: 0.5,
    gen(o, sr, rng) {
      bell(o, sr, rng, N.D3, 0.36, 3.2);
      partial(o, sr, N.D2, 0.26, 3.4);
      partial(o, sr, N.A2, 0.16, 2.8);
      partial(o, sr, N.F3, 0.12, 2.2, { from: (0.9 * sr) | 0 });
      noiseBody(o, sr, rng, { dur: 2.6, f0: 900, f1: 120, q: 0.9, amp: 0.2, a: 0.4, curve: 1.3, kind: 'pink' });
      reverbTail(o, sr, { mix: 0.4, time: 3.4, damp: 0.3 });
    },
  },
};

export { pluck, bell, N as NOTE };
