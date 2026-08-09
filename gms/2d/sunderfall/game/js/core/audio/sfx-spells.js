/**
 * The 18 spells, three events each (`cast` / `travel` / `impact`), plus a sustained
 * `loop` for the ones that persist.
 *
 * Sounds are generated from a **school voice** parameterised by size and pitch, with a
 * handful of bespoke variants (galewrench is wind, thornsurge is roots through stone,
 * gravewake is a choir with bones in it). The point of the school voice is coverage: an
 * unknown spell id still gets a school-correct sound instead of silence — see keys.js.
 *
 * Key convention:  spell.<id>.<event>          e.g. spell.emberbolt.impact
 * School generic:  spell.@<school>.<event>     e.g. spell.@fire.impact
 */

import {
  white, pink, brown, svf, env, shape, partial, modal, thump, fm,
  reverbTail, softClip, mixInto, loopify, karplus,
} from './dsp.js';
import { transient, noiseBody, scatter, squelch, rustle, creak } from './sfx-materials.js';

const reverse = (x) => { const n = x.length; for (let i = 0; i < n >> 1; i++) { const t = x[i]; x[i] = x[n - 1 - i]; x[n - 1 - i] = t; } return x; };

/** Amplitude swell that arrives *at* the transient — the universal "magic" tell. */
function swell(o, sr, rng, { at = 0, dur = 0.35, f0 = 300, f1 = 2600, q = 2.4, amp = 0.5 } = {}) {
  const n = Math.min(o.length - at, Math.ceil(dur * sr));
  if (n <= 16) return o;
  const t = new Float32Array(n);
  pink(t, rng, amp);
  svf(t, sr, { mode: 'bp', f0, f1, q });
  shape(t, sr, [[0, 0], [dur * 0.8, 0.75], [dur, 1]]);
  return mixInto(o, t, 1, at);
}

/* ---------- schools ------------------------------------------------------ */

const SCHOOL = {

  fire: {
    root: 210,
    cast(o, sr, rng, p) {
      const d = 0.22 + p.size * 0.22;
      swell(o, sr, rng, { dur: d * 0.8, f0: 500 * p.pitch, f1: 3200 * p.pitch, amp: 0.35 });
      noiseBody(o, sr, rng, { dur: d, f0: 900 * p.pitch, f1: 3400 * p.pitch, q: 1.3, amp: 0.7, a: d * 0.25, curve: 1.8, kind: 'pink' });
      thump(o, sr, 180 * p.pitch, 70 * p.pitch, 0.4 * p.size, 0.14 + p.size * 0.1, { tauF: 0.03 });
      scatter(o, sr, rng, { t0: d * 0.4, t1: d * 1.6, count: 8 + p.size * 10, fLo: 600, fHi: 2800, decay: 0.012, amp: 0.28, clump: 0.4, noise: 1.1 });
      softClip(o, 1.1);
    },
    travel(o, sr, rng, p) {
      pink(o, rng, 0.55);
      svf(o, sr, { mode: 'bp', f0: 620 * p.pitch, q: 0.7 });
      for (let i = 0; i < o.length; i++) o[i] *= 0.6 + 0.4 * Math.sin(i / sr * 7.3);
      scatter(o, sr, rng, { t0: 0, t1: o.length / sr - 0.04, count: 30, fLo: 700, fHi: 3000, decay: 0.01, amp: 0.35, noise: 1.2 });
      return loopify(o, sr, 0.14);
    },
    impact(o, sr, rng, p) {
      transient(o, sr, rng, { dur: 0.005, f0: 7000, f1: 1200, amp: 0.55 + p.size * 0.4 });
      thump(o, sr, 150 * p.pitch, 34, 0.6 + p.size * 0.5, 0.22 + p.size * 0.3, { tauF: 0.03 });
      noiseBody(o, sr, rng, { dur: 0.35 + p.size * 0.5, f0: 3200 * p.pitch, f1: 190, q: 0.7, amp: 0.8, curve: 2.0, kind: 'pink' });
      noiseBody(o, sr, rng, { dur: 0.6 + p.size * 0.8, f0: 240, f1: 60, q: 0.7, amp: 0.5 + p.size * 0.4, kind: 'brown', mode: 'lp', curve: 1.6 });
      scatter(o, sr, rng, { t0: 0.05, t1: 0.9 + p.size, count: 16 + p.size * 22, fLo: 500, fHi: 3000, decay: 0.012, amp: 0.3, clump: 0.35, noise: 1.1 });
      reverbTail(o, sr, { mix: 0.2 + p.size * 0.08, time: 0.9 + p.size, damp: 0.5 });
      softClip(o, 1.2 + p.size * 0.2);
    },
  },

  storm: {
    root: 330,
    cast(o, sr, rng, p) {
      const d = 0.2 + p.size * 0.18;
      // charge: an FM buzz climbing, plus static gathering
      fm(o, sr, { carrier: 140 * p.pitch, ratio: 6.7, index: 1.2, indexDecay: 0.4, decay: d, amp: 0.3 });
      const n = Math.ceil(d * sr);
      const t = new Float32Array(Math.min(o.length, n));
      white(t, rng, 0.5);
      svf(t, sr, { mode: 'bp', f0: 1400 * p.pitch, f1: 6000 * p.pitch, q: 2.6 });
      shape(t, sr, [[0, 0], [d * 0.85, 0.8], [d, 1]]);
      mixInto(o, t, 0.6, 0);
      partial(o, sr, 620 * p.pitch, 0.16, d * 0.9, { bendTo: 1500 * p.pitch, bendTau: d * 0.5 });
    },
    travel(o, sr, rng, p) {
      white(o, rng, 0.18);
      svf(o, sr, { mode: 'bp', f0: 3200 * p.pitch, q: 0.8 });
      scatter(o, sr, rng, { t0: 0, t1: o.length / sr - 0.03, count: 70, fLo: 1800, fHi: 9000, decay: 0.004, amp: 0.5, noise: 1.4 });
      partial(o, sr, 118, 0.06, 4);
      return loopify(o, sr, 0.1);
    },
    impact(o, sr, rng, p) {
      // The crack must be the loudest and fastest thing in the sound — a lightning
      // strike that peaks 30 ms in reads as a firework, not a strike. The offline
      // attack-time check exists to keep it that way.
      transient(o, sr, rng, { dur: 0.0012, f0: 14000, f1: 2500, amp: 3.4, q: 0.7 });
      transient(o, sr, rng, { dur: 0.0028, f0: 6000, f1: 900, amp: 2.4, q: 0.6 });
      noiseBody(o, sr, rng, { dur: 0.06, f0: 9000, f1: 1400, q: 0.8, amp: 1.6, a: 0.0002, curve: 3.4 });
      // thunder body, arriving just behind the crack.
      // NOTE brown() is ~5x hotter than white() for the same `amp` — see dsp.js.
      thump(o, sr, 110 * p.pitch, 38, 0.3 + p.size * 0.3, 0.3 + p.size * 0.4, { from: (0.012 * sr) | 0, tauF: 0.04 });
      noiseBody(o, sr, rng, { at: (0.014 * sr) | 0, dur: 0.7 + p.size, f0: 420, f1: 70, q: 0.65, amp: 0.06 + p.size * 0.05, kind: 'brown', mode: 'lp', a: 0.012, curve: 1.5 });
      // arcing residue
      scatter(o, sr, rng, { t0: 0.01, t1: 0.5 + p.size * 0.4, count: 26, fLo: 2200, fHi: 11000, decay: 0.005, amp: 0.22, clump: 0.7, noise: 1.5 });
      reverbTail(o, sr, { mix: 0.18, time: 1.2 + p.size, damp: 0.45 });
      softClip(o, 1.25);
    },
  },

  earth: {
    root: 98,
    cast(o, sr, rng, p) {
      const d = 0.28 + p.size * 0.3;
      noiseBody(o, sr, rng, { dur: d, f0: 90, f1: 520 * p.pitch, q: 2.0, amp: 0.7, kind: 'brown', a: d * 0.5, curve: 1.3 });
      creak(o, sr, rng, { dur: d * 0.8, f0: 220 * p.pitch, rise: 2.0, amp: 0.22, rate: 30 });
      partial(o, sr, 62 * p.pitch, 0.35 * p.size, d, { bendTo: 96 * p.pitch, bendTau: d * 0.5 });
      scatter(o, sr, rng, { t0: d * 0.3, t1: d * 1.4, count: 8, fLo: 150, fHi: 800, decay: 0.03, amp: 0.2, clump: 0.3, noise: 0.9 });
    },
    travel(o, sr, rng, p) {
      brown(o, rng, 0.7);
      svf(o, sr, { mode: 'lp', f0: 340 * p.pitch, q: 1.2 });
      for (let i = 0; i < o.length; i++) o[i] *= 0.7 + 0.3 * Math.sin(i / sr * 4.1);
      return loopify(o, sr, 0.12);
    },
    impact(o, sr, rng, p) {
      transient(o, sr, rng, { dur: 0.008, f0: 3200, f1: 500, amp: 0.6 });
      thump(o, sr, 92 * p.pitch, 26, 0.8 + p.size * 0.4, 0.35 + p.size * 0.45, { tauF: 0.05 });
      noiseBody(o, sr, rng, { dur: 1.0 + p.size * 0.9, f0: 380, f1: 60, q: 0.7, amp: 0.9, kind: 'brown', mode: 'lp', curve: 1.4 });
      noiseBody(o, sr, rng, { dur: 0.3, f0: 1600, f1: 300, q: 0.9, amp: 0.5, kind: 'pink', curve: 2.6 });
      modal(o, sr, 108, [[1, 0.3, 0.18], [1.55, 0.18, 0.13], [2.3, 0.1, 0.09]], { rng, jitter: 0.08 });
      scatter(o, sr, rng, { t0: 0.04, t1: 1.1 + p.size, count: 22 + p.size * 16, fLo: 130, fHi: 1200, decay: 0.05, amp: 0.4, clump: 0.55, noise: 0.9 });
      reverbTail(o, sr, { mix: 0.26, time: 1.4 + p.size, damp: 0.55 });
      softClip(o, 1.1);
    },
  },

  decay: {
    root: 156,
    cast(o, sr, rng, p) {
      const d = 0.3 + p.size * 0.2;
      // two partials a semitone apart: the beating is the "wrongness"
      partial(o, sr, 152 * p.pitch, 0.3, d * 1.4);
      partial(o, sr, 161 * p.pitch, 0.28, d * 1.4);
      partial(o, sr, 304 * p.pitch, 0.12, d);
      noiseBody(o, sr, rng, { dur: d, f0: 2600, f1: 700, q: 1.0, amp: 0.4, a: d * 0.3, curve: 1.8 });
      scatter(o, sr, rng, { t0: 0, t1: d * 1.5, count: 12, fLo: 250, fHi: 1200, decay: 0.02, amp: 0.2, noise: 1.4 });
    },
    travel(o, sr, rng, p) {
      white(o, rng, 0.12);
      svf(o, sr, { mode: 'bp', f0: 1800, q: 0.7 });
      for (let i = 0; i < 18; i++) {
        squelch(o, sr, rng, { at: ((i / 18) * (o.length / sr - 0.15) * sr) | 0, dur: 0.1, f0: 700 + rng.next() * 900, f1: 190, amp: 0.25 });
      }
      return loopify(o, sr, 0.14);
    },
    impact(o, sr, rng, p) {
      squelch(o, sr, rng, { dur: 0.3 + p.size * 0.2, f0: 2600, f1: 190, amp: 0.8, q: 2.2 });
      thump(o, sr, 120 * p.pitch, 48, 0.5 + p.size * 0.3, 0.2 + p.size * 0.2);
      // the eating: a long fizz that outlives the hit
      noiseBody(o, sr, rng, { dur: 1.1 + p.size * 0.8, f0: 3400, f1: 1200, q: 0.8, amp: 0.42, a: 0.02, curve: 1.4 });
      scatter(o, sr, rng, { t0: 0.02, t1: 1.4 + p.size, count: 34, fLo: 300, fHi: 2400, decay: 0.02, amp: 0.28, clump: 0.3, noise: 1.5 });
      partial(o, sr, 148 * p.pitch, 0.16, 0.9);
      partial(o, sr, 157 * p.pitch, 0.14, 0.9);
      reverbTail(o, sr, { mix: 0.2, time: 1.1, damp: 0.5 });
      softClip(o, 1.15);
    },
  },

  void: {
    root: 130,
    cast(o, sr, rng, p) {
      const d = 0.35 + p.size * 0.25;
      // built forwards then reversed: the sound arrives before it happens
      const n = Math.min(o.length, Math.ceil(d * sr));
      const t = new Float32Array(n);
      pink(t, rng, 0.55);
      svf(t, sr, { mode: 'bp', f0: 2400 * p.pitch, f1: 300, q: 1.8 });
      env(t, sr, { a: 0.004, d: d * 0.9, curve: 2.4 });
      partial(t, sr, 220 * p.pitch, 0.22, d * 0.7);
      reverse(t);
      mixInto(o, t, 1, 0);
      fm(o, sr, { carrier: 88 * p.pitch, ratio: 2.73, index: 3.5, indexDecay: 0.2, decay: 0.4, amp: 0.28 });
      thump(o, sr, 140 * p.pitch, 48, 0.3, 0.18, { from: (d * 0.85 * sr) | 0 });
    },
    travel(o, sr, rng, p) {
      brown(o, rng, 0.4);
      svf(o, sr, { mode: 'lp', f0: 520, q: 1.6 });
      fm(o, sr, { carrier: 74, ratio: 2.41, index: 2.2, indexDecay: 999, decay: 999, amp: 0.14 });
      for (let i = 0; i < o.length; i++) o[i] *= 0.65 + 0.35 * Math.sin(i / sr * 2.7);
      return loopify(o, sr, 0.16);
    },
    impact(o, sr, rng, p) {
      // the "suck": band collapsing inward, then the detonation
      const n = Math.min(o.length, Math.ceil(0.28 * sr));
      const t = new Float32Array(n);
      pink(t, rng, 0.7);
      svf(t, sr, { mode: 'bp', f0: 4200, f1: 260, q: 2.2 });
      shape(t, sr, [[0, 0.05], [0.24, 0.9], [0.28, 1]]);
      mixInto(o, t, 0.7, 0);
      const at = (0.26 * sr) | 0;
      transient(o, sr, rng, { at, dur: 0.006, f0: 6000, f1: 900, amp: 0.8 });
      thump(o, sr, 92 * p.pitch, 20, 0.9 + p.size * 0.4, 0.5 + p.size * 0.5, { from: at, tauF: 0.06 });
      fm(o, sr, { carrier: 118 * p.pitch, ratio: 3.37, index: 5, indexDecay: 0.4, decay: 1.2 + p.size, amp: 0.35, from: at });
      noiseBody(o, sr, rng, { at, dur: 0.9 + p.size * 0.6, f0: 900, f1: 90, q: 1.1, amp: 0.5, curve: 1.5, kind: 'pink' });
      reverbTail(o, sr, { mix: 0.3, time: 1.8 + p.size, damp: 0.35 });
      softClip(o, 1.15);
    },
  },

  life: {
    root: 392,
    cast(o, sr, rng, p) {
      const notes = [261.63, 392, 523.25].map(f => f * p.pitch);
      for (let i = 0; i < notes.length; i++) {
        const k = karplus(Math.ceil(0.7 * sr), sr, notes[i], { rng, bright: 0.3, damp: 0.45, loss: 0.0005 });
        mixInto(o, k, 0.18, (i * 0.045 * sr) | 0);
      }
      noiseBody(o, sr, rng, { dur: 0.3, f0: 1600, f1: 5200, q: 1.4, amp: 0.2, a: 0.1, curve: 1.6 });
      reverbTail(o, sr, { mix: 0.26, time: 1.2, damp: 0.3 });
    },
    travel(o, sr, rng, p) {
      white(o, rng, 0.08);
      svf(o, sr, { mode: 'bp', f0: 4200, q: 0.9 });
      partial(o, sr, 784 * p.pitch, 0.05, 999);
      partial(o, sr, 1176 * p.pitch, 0.03, 999);
      for (let i = 0; i < o.length; i++) o[i] *= 0.7 + 0.3 * Math.sin(i / sr * 5.3);
      return loopify(o, sr, 0.16);
    },
    impact(o, sr, rng, p) {
      const f = 196 * p.pitch;
      modal(o, sr, f, [[1, 0.4, 1.4], [2, 0.24, 1.1], [3, 0.14, 0.8], [4.2, 0.08, 0.6], [5.9, 0.05, 0.4]], { rng, jitter: 0.01 });
      const k = karplus(Math.ceil(1.2 * sr), sr, f * 3, { rng, bright: 0.45, damp: 0.3, loss: 0.0003 });
      mixInto(o, k, 0.2, 0);
      noiseBody(o, sr, rng, { dur: 0.5, f0: 900, f1: 6000, q: 1.2, amp: 0.25, a: 0.06, curve: 1.5 });
      reverbTail(o, sr, { mix: 0.32, time: 2.0, damp: 0.25 });
    },
  },
};

/* ---------- bespoke variants -------------------------------------------- */

const VARIANT = {
  wind: {
    cast(o, sr, rng, p) {
      noiseBody(o, sr, rng, { dur: 0.34, f0: 260, f1: 1900, q: 1.4, amp: 0.7, kind: 'pink', a: 0.18, curve: 1.4 });
    },
    impact(o, sr, rng, p) {
      // a shove, not a bang: broadband air with almost no transient
      noiseBody(o, sr, rng, { dur: 0.7, f0: 2600, f1: 320, q: 0.6, amp: 1.0, kind: 'pink', a: 0.03, curve: 1.7 });
      noiseBody(o, sr, rng, { dur: 1.0, f0: 200, f1: 70, q: 0.7, amp: 0.5, kind: 'brown', mode: 'lp', a: 0.05, curve: 1.4 });
      rustle(o, sr, rng, { at: (0.05 * sr) | 0, dur: 0.8, amp: 0.4, f0: 5200, f1: 1800, density: 140 });
      thump(o, sr, 70, 40, 0.25, 0.3, { tauF: 0.1 });
    },
  },
  roots: {
    impact(o, sr, rng, p) {
      SCHOOL.earth.impact(o, sr, rng, { ...p, size: p.size * 0.7 });
      // fibrous tearing on top of the stone
      creak(o, sr, rng, { dur: 0.5, f0: 380, rise: 2.6, amp: 0.5, rate: 70 });
      scatter(o, sr, rng, { t0: 0.02, t1: 0.8, count: 18, fLo: 600, fHi: 2800, decay: 0.02, amp: 0.28, clump: 0.4 });
      for (let i = 0; i < 5; i++) {
        const at = ((0.02 + i * 0.06) * sr) | 0;
        transient(o, sr, rng, { at, dur: 0.005, f0: 4200, f1: 900, amp: 0.35 });
      }
    },
  },
  raise: {
    impact(o, sr, rng, p) {
      // terrain coming UP: rumble that rises, then a slab locking into place
      noiseBody(o, sr, rng, { dur: 0.55, f0: 70, f1: 420, q: 1.8, amp: 0.9, kind: 'brown', a: 0.3, curve: 1.2 });
      scatter(o, sr, rng, { t0: 0.05, t1: 0.6, count: 16, fLo: 160, fHi: 900, decay: 0.035, amp: 0.28, clump: 0.2, noise: 0.9 });
      const at = (0.5 * sr) | 0;
      transient(o, sr, rng, { at, dur: 0.007, f0: 3400, f1: 600, amp: 0.7 });
      thump(o, sr, 96, 40, 0.9, 0.3, { from: at, tauF: 0.03 });
      modal(o, sr, 96, [[1, 0.28, 0.2], [1.6, 0.16, 0.14]], { rng, jitter: 0.06, from: at });
      reverbTail(o, sr, { mix: 0.22, time: 1.2, damp: 0.55 });
      softClip(o, 1.1);
    },
  },
  leech: {
    impact(o, sr, rng, p) {
      SCHOOL.decay.impact(o, sr, rng, { ...p, size: p.size * 0.6 });
      // the tithe coming back to Rook: a rising consonant fifth over the rot
      partial(o, sr, 196, 0.16, 0.7, { bendTo: 294, bendTau: 0.3 });
      partial(o, sr, 294, 0.1, 0.6);
    },
  },
  raise_dead: {
    cast(o, sr, rng, p) {
      SCHOOL.life.cast(o, sr, rng, { ...p, pitch: p.pitch * 0.5 });
      scatter(o, sr, rng, { t0: 0.1, t1: 0.7, count: 8, fLo: 620, fHi: 2400, decay: 0.02, amp: 0.24, clump: 0.3 });
    },
    impact(o, sr, rng, p) {
      // a choir that should not be singing, over bones getting up
      const f = 98;
      modal(o, sr, f, [[1, 0.34, 1.8], [1.5, 0.2, 1.5], [2, 0.16, 1.3], [3, 0.09, 0.9], [4.5, 0.05, 0.7]], { rng, jitter: 0.02 });
      partial(o, sr, f * 1.19, 0.1, 1.4);   // the minor third, deliberately sour
      scatter(o, sr, rng, { t0: 0.05, t1: 1.4, count: 20, fLo: 600, fHi: 2400, decay: 0.02, amp: 0.34, clump: 0.3 });
      noiseBody(o, sr, rng, { dur: 0.7, f0: 500, f1: 130, q: 0.8, amp: 0.4, kind: 'brown', mode: 'lp', a: 0.1, curve: 1.5 });
      reverbTail(o, sr, { mix: 0.34, time: 2.2, damp: 0.4 });
    },
  },
};

/* ---------- the roster --------------------------------------------------- */

export const SPELL_SCHOOL = {
  emberbolt: 'fire', cinderwake: 'fire', emberstorm: 'fire', pyreveil: 'fire',
  sparklash: 'storm', stormcall: 'storm', galewrench: 'storm',
  stonepin: 'earth', sunderquake: 'earth', thornsurge: 'earth', bulwark: 'earth',
  acidrain: 'decay', blightbloom: 'decay', bloodtithe: 'decay',
  voidlash: 'void', mirrorstep: 'void', nullring: 'void',
  gravewake: 'life',
};

const SPELL_P = {
  emberbolt: { size: 0.35, pitch: 1.35 },
  cinderwake: { size: 0.4, pitch: 1.15, loop: true },
  emberstorm: { size: 1.5, pitch: 0.7 },
  pyreveil: { size: 0.8, pitch: 0.95, loop: true },
  sparklash: { size: 0.5, pitch: 1.3 },
  stormcall: { size: 1.1, pitch: 0.85, loop: true },
  galewrench: { size: 0.9, pitch: 0.9, variant: 'wind' },
  stonepin: { size: 0.7, pitch: 1.15 },
  sunderquake: { size: 1.5, pitch: 0.62 },
  thornsurge: { size: 0.8, pitch: 1.0, variant: 'roots' },
  bulwark: { size: 1.0, pitch: 0.9, variant: 'raise' },
  acidrain: { size: 1.0, pitch: 0.9, loop: true },
  blightbloom: { size: 0.7, pitch: 1.1 },
  bloodtithe: { size: 0.5, pitch: 1.2, variant: 'leech' },
  voidlash: { size: 0.7, pitch: 1.1 },
  mirrorstep: { size: 0.8, pitch: 1.0 },
  nullring: { size: 1.0, pitch: 0.85, loop: true },
  gravewake: { size: 1.0, pitch: 0.8, variant: 'raise_dead' },
};

const EVENTS = ['cast', 'travel', 'impact'];

function makeGen(schoolId, ev, p) {
  const v = p.variant && VARIANT[p.variant] && VARIANT[p.variant][ev];
  const base = SCHOOL[schoolId][ev];
  const fn = v || base;
  return (o, sr, rng) => fn(o, sr, rng, p);
}

function recipeFor(schoolId, ev, p) {
  const size = p.size ?? 0.7;
  const bright = schoolId === 'storm' || schoolId === 'life';
  const common = { sr: bright ? 44100 : 32000, variants: 3, send: 0.3 };
  if (ev === 'cast') {
    return { ...common, dur: 0.85 + size * 0.5, gain: 0.42 + size * 0.14, prio: 5, rate: 0.02, max: 5, gen: makeGen(schoolId, ev, p) };
  }
  if (ev === 'travel') {
    return {
      ...common, dur: 1.4, gain: 0.26 + size * 0.1, prio: 3, rate: 0.03, max: 4,
      loop: true, trim: false, norm: 0.7, variants: 2, gen: makeGen(schoolId, ev, p),
    };
  }
  return {
    ...common, dur: 1.5 + size * 1.6, gain: 0.55 + size * 0.25,
    prio: 6 + Math.round(size), rate: 0.03, max: 4, send: 0.34, gen: makeGen(schoolId, ev, p),
  };
}

export const SPELL_SFX = {};

for (const id in SPELL_P) {
  const school = SPELL_SCHOOL[id];
  const p = { ...SPELL_P[id], school, root: SCHOOL[school].root };
  for (const ev of EVENTS) SPELL_SFX[`spell.${id}.${ev}`] = recipeFor(school, ev, p);
  if (p.loop) SPELL_SFX[`spell.${id}.loop`] = { ...SPELL_SFX[`spell.${id}.travel`], gain: 0.3 + p.size * 0.14 };
}

// School generics — the fallback target for any spell id nobody told me about.
for (const school in SCHOOL) {
  const p = { size: 0.7, pitch: 1, school, root: SCHOOL[school].root };
  for (const ev of EVENTS) SPELL_SFX[`spell.@${school}.${ev}`] = recipeFor(school, ev, p);
  SPELL_SFX[`spell.@${school}.loop`] = SPELL_SFX[`spell.@${school}.travel`];
}
// Last resort when even the school is unknown.
{
  const p = { size: 0.6, pitch: 1.05, school: 'void', root: 130 };
  for (const ev of EVENTS) SPELL_SFX[`spell.@arcane.${ev}`] = recipeFor('void', ev, p);
  SPELL_SFX['spell.@arcane.loop'] = SPELL_SFX['spell.@arcane.travel'];
}

export { SCHOOL, VARIANT, swell };
