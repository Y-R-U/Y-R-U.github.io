/**
 * The nine materials x four events, plus the generic world impacts.
 *
 * Key names are the flat strings already baked into `sim/materials.js`
 * (`stone_crack`, `glass_break`, ...). Do not rename them — the sim passes them
 * straight through from `MAT[m].sfx`.
 *
 * Design rule per material: pick the *mechanism*, not an adjective.
 *   masonry = mortar failing (dry, mid, granular)   rock = mass fracturing (sub + gravel)
 *   timber  = fibres tearing (stick-slip creak)     foliage = many small dry surfaces
 *   glass   = high inharmonic modes + long sparkle  metal = long ringing modal bank
 *   bone    = short hard modes in a hollow tube     earth = no highs at all
 *   flesh   = a lowpassed thump with a wet squelch
 */

import {
  white, pink, brown, lp1, hp1, svf, env, shape, partial, modal, thump,
  grains, tick, reverbTail, softClip, mixInto, loopify,
} from './dsp.js';

/* ---------- shared gestures ------------------------------------------ */

/** Broadband transient: the 3-8 ms crack that tells the ear something failed. */
function transient(o, sr, rng, { at = 0, dur = 0.006, f0 = 6000, f1 = 900, amp = 1, q = 1.1 } = {}) {
  const n = Math.min(o.length - at, Math.ceil(dur * 4 * sr));
  if (n <= 8) return o;
  const t = new Float32Array(n);
  white(t, rng, amp);
  svf(t, sr, { mode: 'bp', f0, f1, q });
  env(t, sr, { a: 0.0004, d: dur, curve: 2.5 });
  return mixInto(o, t, 1, at);
}

/** Filtered noise body with an arbitrary band sweep. The workhorse. */
function noiseBody(o, sr, rng, { at = 0, dur = 0.2, f0 = 2000, f1 = 400, q = 1.0, amp = 1, a = 0.001, curve = 3, kind = 'white', mode = 'bp' } = {}) {
  const n = Math.min(o.length - at, Math.ceil(dur * 1.6 * sr));
  if (n <= 8) return o;
  const t = new Float32Array(n);
  if (kind === 'pink') pink(t, rng, amp);
  else if (kind === 'brown') brown(t, rng, amp);
  else white(t, rng, amp);
  svf(t, sr, { mode, f0, f1, q });
  env(t, sr, { a, d: dur, curve });
  return mixInto(o, t, 1, at);
}

/** Gravel/chip/tinkle scatter. `tone` picks the grain's own timbre. */
function scatter(o, sr, rng, { t0 = 0, t1 = 0.5, count = 10, fLo = 400, fHi = 1600, decay = 0.035, amp = 0.5, clump = 0.4, spread = 1, noise = 0 } = {}) {
  return grains(o, sr, {
    rng, t0, t1, count, clump,
    grain(buf, at, i, r, u) {
      const f = fLo * Math.pow(fHi / fLo, r.next());
      const g = amp * (0.35 + 0.65 * r.next()) * (1 - u * 0.55 * spread);
      const d = decay * (0.5 + r.next());
      if (noise > 0) {
        const n = Math.min(buf.length - at, Math.ceil(d * 4 * sr));
        if (n > 8) {
          const t = new Float32Array(n);
          white(t, r, g * noise);
          svf(t, sr, { mode: 'bp', f0: f * 1.6, f1: f * 0.7, q: 1.4 });
          env(t, sr, { a: 0.0004, d, curve: 3 });
          mixInto(buf, t, 1, at);
        }
      }
      tick(buf, sr, at, f, g, d, r);
      tick(buf, sr, at, f * 1.9 + r.range(-30, 30), g * 0.45, d * 0.6, r);
    },
  });
}

/* ---------- MASONRY ---------------------------------------------------- */

const stone_crack = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.005, f0: 5200, f1: 1100, amp: 0.9 });
  // dry mortar: a short granular rasp, not a ring
  noiseBody(o, sr, rng, { dur: 0.09, f0: 2600, f1: 700, q: 1.3, amp: 0.75, curve: 3.4 });
  modal(o, sr, 210, [[1, 0.28, 0.055], [1.87, 0.16, 0.04], [2.9, 0.09, 0.03]], { rng, jitter: 0.05 });
  scatter(o, sr, rng, { t0: 0.02, t1: 0.2, count: 5, fLo: 700, fHi: 2600, decay: 0.02, amp: 0.16, clump: 0.6 });
  softClip(o, 1.2);
};

const stone_break = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.008, f0: 4200, f1: 700, amp: 1.0 });
  thump(o, sr, 96, 44, 0.85, 0.22, { tauF: 0.03 });
  noiseBody(o, sr, rng, { dur: 0.42, f0: 1400, f1: 220, q: 0.85, amp: 0.9, curve: 2.4, kind: 'pink' });
  noiseBody(o, sr, rng, { dur: 0.75, f0: 260, f1: 90, q: 0.7, amp: 0.7, kind: 'brown', mode: 'lp', curve: 1.8 });
  modal(o, sr, 175, [[1, 0.3, 0.1], [1.63, 0.2, 0.08], [2.4, 0.12, 0.06], [3.7, 0.06, 0.04]], { rng, jitter: 0.07 });
  // the tumble: chunks landing, front-loaded, thinning out
  scatter(o, sr, rng, { t0: 0.05, t1: 0.85, count: 22, fLo: 190, fHi: 1500, decay: 0.045, amp: 0.4, clump: 0.55, noise: 0.5 });
  reverbTail(o, sr, { mix: 0.22, time: 0.9, damp: 0.5 });
  softClip(o, 1.1);
};

const stone_debris = (o, sr, rng) => {
  scatter(o, sr, rng, { t0: 0.0, t1: 0.03, count: 2, fLo: 260, fHi: 1200, decay: 0.04, amp: 0.8, noise: 0.6 });
  noiseBody(o, sr, rng, { dur: 0.045, f0: 1800, f1: 500, q: 1.2, amp: 0.4, curve: 3.6 });
};

/* ---------- ROCK ------------------------------------------------------- */

const rock_crack = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.004, f0: 3600, f1: 800, amp: 0.75 });
  noiseBody(o, sr, rng, { dur: 0.12, f0: 1500, f1: 320, q: 1.1, amp: 0.8, curve: 3, kind: 'pink' });
  modal(o, sr, 132, [[1, 0.35, 0.1], [1.71, 0.18, 0.07], [2.63, 0.1, 0.05]], { rng, jitter: 0.06 });
  thump(o, sr, 150, 78, 0.3, 0.09);
  softClip(o, 1.15);
};

const rock_break = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.01, f0: 3000, f1: 520, amp: 0.85 });
  thump(o, sr, 78, 33, 1.0, 0.34, { tauF: 0.05 });
  noiseBody(o, sr, rng, { dur: 1.05, f0: 300, f1: 70, q: 0.7, amp: 1.0, kind: 'brown', mode: 'lp', curve: 1.6 });
  noiseBody(o, sr, rng, { dur: 0.3, f0: 1100, f1: 250, q: 0.9, amp: 0.6, kind: 'pink', curve: 2.6 });
  modal(o, sr, 118, [[1, 0.34, 0.16], [1.55, 0.2, 0.12], [2.28, 0.1, 0.08]], { rng, jitter: 0.08 });
  scatter(o, sr, rng, { t0: 0.06, t1: 1.0, count: 26, fLo: 130, fHi: 900, decay: 0.06, amp: 0.42, clump: 0.5, noise: 0.7 });
  reverbTail(o, sr, { mix: 0.24, time: 1.2, damp: 0.55 });
  softClip(o, 1.05);
};

const rock_debris = (o, sr, rng) => {
  scatter(o, sr, rng, { t0: 0, t1: 0.035, count: 2, fLo: 150, fHi: 700, decay: 0.055, amp: 0.85, noise: 0.7 });
  noiseBody(o, sr, rng, { dur: 0.06, f0: 900, f1: 230, q: 1.0, amp: 0.45, curve: 3.2 });
};

/* ---------- TIMBER ----------------------------------------------------- */

/** Stick-slip: fibres letting go one at a time. This is the whole sound of wood. */
function creak(o, sr, rng, { at = 0, dur = 0.35, f0 = 420, rise = 1.9, amp = 0.5, rate = 55 } = {}) {
  const n = Math.min(o.length - at, Math.ceil(dur * sr));
  if (n <= 16) return o;
  const t = new Float32Array(n);
  let phase = 0, nextAt = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i >= nextAt) {
      // irregular slip events, accelerating as the fibre gives
      const r = rate * (1 + u * 2.2) * (0.55 + rng.next() * 0.9);
      nextAt = i + Math.max(2, (sr / r) | 0);
      phase = 0; k = 0.6 + rng.next() * 0.8;
    }
    phase += 1;
    t[i] = Math.exp(-phase / (sr * 0.0025)) * k * (rng.next() * 2 - 1);
  }
  svf(t, sr, { mode: 'bp', f0, f1: f0 * rise, q: 3.5 });
  env(t, sr, { a: 0.02, d: dur * 0.9, curve: 1.6 });
  return mixInto(o, t, amp, at);
}

const wood_crack = (o, sr, rng) => {
  creak(o, sr, rng, { dur: 0.3, f0: 430, rise: 2.2, amp: 0.62, rate: 48 });
  transient(o, sr, rng, { at: (0.24 * sr) | 0, dur: 0.005, f0: 4200, f1: 900, amp: 0.55 });
  modal(o, sr, 360, [[1, 0.22, 0.05], [2.13, 0.12, 0.035]], { rng, jitter: 0.06, from: (0.24 * sr) | 0 });
  softClip(o, 1.1);
};

const wood_break = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.007, f0: 5000, f1: 1200, amp: 0.95 });
  // the tear: bright splinter noise falling away
  noiseBody(o, sr, rng, { dur: 0.28, f0: 3400, f1: 700, q: 1.0, amp: 0.85, curve: 2.6 });
  modal(o, sr, 196, [[1, 0.4, 0.14], [2.31, 0.24, 0.1], [3.9, 0.13, 0.06], [5.4, 0.07, 0.04]], { rng, jitter: 0.08 });
  thump(o, sr, 130, 62, 0.5, 0.16);
  creak(o, sr, rng, { at: (0.02 * sr) | 0, dur: 0.22, f0: 520, rise: 2.6, amp: 0.4, rate: 90 });
  // splinters raining
  scatter(o, sr, rng, { t0: 0.08, t1: 0.7, count: 16, fLo: 700, fHi: 3200, decay: 0.022, amp: 0.3, clump: 0.5 });
  reverbTail(o, sr, { mix: 0.14, time: 0.6, damp: 0.6 });
  softClip(o, 1.1);
};

const wood_debris = (o, sr, rng) => {
  modal(o, sr, 330, [[1, 0.6, 0.055], [2.2, 0.3, 0.032], [3.6, 0.12, 0.02]], { rng, jitter: 0.1 });
  noiseBody(o, sr, rng, { dur: 0.04, f0: 2200, f1: 600, q: 1.2, amp: 0.4, curve: 3.4 });
};

const wood_burn = (o, sr, rng) => {
  pink(o, rng, 0.42);
  svf(o, sr, { mode: 'bp', f0: 720, q: 0.75 });
  // slow breathing of the flame
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    o[i] *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.9)) * (0.6 + 0.4 * Math.sin(t * 0.53 + 1.1));
  }
  scatter(o, sr, rng, { t0: 0.02, t1: o.length / sr - 0.05, count: 34, fLo: 500, fHi: 2600, decay: 0.012, amp: 0.42, clump: 0, noise: 1.1 });
  return loopify(o, sr, 0.3);
};

/* ---------- FOLIAGE ---------------------------------------------------- */

/** Many small dry surfaces: broadband hiss chopped by a fast noisy envelope. */
function rustle(o, sr, rng, { at = 0, dur = 0.45, amp = 0.6, f0 = 3600, f1 = 2200, density = 90, q = 0.8 } = {}) {
  const n = Math.min(o.length - at, Math.ceil(dur * sr));
  if (n <= 16) return o;
  const t = new Float32Array(n);
  white(t, rng, amp);
  svf(t, sr, { mode: 'bp', f0, f1, q });
  // granulate: without this it is just hiss, and hiss is not leaves
  let g = 0, target = 0, hold = 0;
  for (let i = 0; i < n; i++) {
    if (hold-- <= 0) { target = Math.pow(rng.next(), 1.6); hold = Math.max(2, (sr / density) * (0.4 + rng.next())) | 0; }
    g += (target - g) * 0.02;
    t[i] *= g;
  }
  env(t, sr, { a: dur * 0.12, d: dur * 0.9, curve: 1.5 });
  return mixInto(o, t, 1, at);
}

const leaf_rustle = (o, sr, rng) => { rustle(o, sr, rng, { dur: 0.42, amp: 0.7, density: 110 }); };

const leaf_burst = (o, sr, rng) => {
  rustle(o, sr, rng, { dur: 0.55, amp: 1.0, f0: 5200, f1: 1500, density: 200, q: 0.6 });
  noiseBody(o, sr, rng, { dur: 0.16, f0: 900, f1: 260, q: 0.8, amp: 0.4, kind: 'pink', mode: 'lp' });
  thump(o, sr, 120, 70, 0.16, 0.1);
  scatter(o, sr, rng, { t0: 0.05, t1: 0.6, count: 10, fLo: 1600, fHi: 5200, decay: 0.012, amp: 0.16, clump: 0.5 });
};

const leaf_fall = (o, sr, rng) => {
  rustle(o, sr, rng, { dur: 0.5, amp: 0.4, f0: 4200, f1: 2600, density: 45 });
  scatter(o, sr, rng, { t0: 0.05, t1: 0.55, count: 5, fLo: 1400, fHi: 3800, decay: 0.01, amp: 0.14, clump: 0.2 });
};

const leaf_burn = (o, sr, rng) => {
  white(o, rng, 0.3);
  svf(o, sr, { mode: 'bp', f0: 2800, q: 0.6 });
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    o[i] *= 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.7 + 0.4));
  }
  scatter(o, sr, rng, { t0: 0.02, t1: o.length / sr - 0.05, count: 70, fLo: 1400, fHi: 6000, decay: 0.006, amp: 0.4, clump: 0, noise: 1.3 });
  return loopify(o, sr, 0.3);
};

/* ---------- GLASS ------------------------------------------------------ */

const GLASS_MODES = [
  [1, 0.5, 0.28], [1.41, 0.42, 0.24], [1.93, 0.36, 0.3], [2.57, 0.3, 0.2],
  [3.19, 0.24, 0.26], [4.11, 0.2, 0.16], [5.37, 0.15, 0.19], [6.9, 0.1, 0.12],
];

const glass_crack = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.003, f0: 11000, f1: 3000, amp: 0.7 });
  modal(o, sr, 2450, GLASS_MODES.map(m => [m[0], m[1] * 0.5, m[2] * 0.22]), { rng, jitter: 0.03 });
  scatter(o, sr, rng, { t0: 0.005, t1: 0.12, count: 5, fLo: 3200, fHi: 9500, decay: 0.012, amp: 0.25, clump: 0.7 });
};

const glass_break = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.005, f0: 13000, f1: 2600, amp: 1.0, q: 0.8 });
  noiseBody(o, sr, rng, { dur: 0.09, f0: 9000, f1: 2200, q: 0.7, amp: 0.7, curve: 3 });
  modal(o, sr, 2180, GLASS_MODES, { rng, jitter: 0.04, gain: 0.85 });
  modal(o, sr, 3870, GLASS_MODES, { rng, jitter: 0.05, gain: 0.5 });
  // the sparkle tail: this is what separates glass from a bright noise burst
  scatter(o, sr, rng, { t0: 0.01, t1: 1.15, count: 64, fLo: 2600, fHi: 11000, decay: 0.02, amp: 0.34, clump: 0.55 });
  scatter(o, sr, rng, { t0: 0.25, t1: 1.35, count: 26, fLo: 4000, fHi: 12000, decay: 0.03, amp: 0.16, clump: 0.1 });
  reverbTail(o, sr, { mix: 0.3, time: 1.5, damp: 0.18 });
  hp1(o, 260, sr);
};

const glass_tinkle = (o, sr, rng) => {
  scatter(o, sr, rng, { t0: 0, t1: 0.35, count: 7, fLo: 3000, fHi: 11000, decay: 0.028, amp: 0.6, clump: 0.4 });
  reverbTail(o, sr, { mix: 0.2, time: 0.7, damp: 0.2 });
  hp1(o, 400, sr);
};

/* ---------- METAL ------------------------------------------------------ */

const METAL_MODES = [
  [1, 0.5, 1.5], [1.72, 0.42, 1.25], [2.31, 0.34, 1.0], [3.14, 0.28, 0.85],
  [4.07, 0.2, 0.62], [5.63, 0.15, 0.45], [7.21, 0.1, 0.32], [9.4, 0.06, 0.2],
];

const metal_dent = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.004, f0: 7000, f1: 1600, amp: 0.6 });
  modal(o, sr, 372, METAL_MODES.map(m => [m[0], m[1], m[2] * 0.7]), { rng, jitter: 0.02 });
  thump(o, sr, 160, 92, 0.3, 0.08);
  softClip(o, 1.05);
};

const metal_break = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.008, f0: 9000, f1: 1400, amp: 0.95 });
  // the tear: a shriek sweeping UP is what says "metal failing" rather than "metal struck"
  noiseBody(o, sr, rng, { dur: 0.3, f0: 900, f1: 4200, q: 4.5, amp: 0.55, a: 0.01, curve: 2.2 });
  modal(o, sr, 268, METAL_MODES, { rng, jitter: 0.03 });
  modal(o, sr, 631, METAL_MODES.map(m => [m[0], m[1] * 0.55, m[2] * 0.6]), { rng, jitter: 0.04 });
  thump(o, sr, 120, 58, 0.5, 0.2);
  scatter(o, sr, rng, { t0: 0.25, t1: 1.5, count: 14, fLo: 600, fHi: 3400, decay: 0.32, amp: 0.18, clump: 0.4 });
  softClip(o, 1.1);
};

const metal_clang = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.003, f0: 8000, f1: 2000, amp: 0.7 });
  modal(o, sr, 528, METAL_MODES.map(m => [m[0], m[1], m[2] * 0.55]), { rng, jitter: 0.03 });
  softClip(o, 1.05);
};

/* ---------- BONE ------------------------------------------------------- */

const BONE_MODES = [[1, 0.5, 0.045], [1.94, 0.35, 0.03], [2.87, 0.24, 0.022], [4.3, 0.14, 0.015]];

const bone_crack = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.0035, f0: 6000, f1: 1500, amp: 0.7 });
  modal(o, sr, 880, BONE_MODES, { rng, jitter: 0.05 });
  partial(o, sr, 232, 0.28, 0.09);            // the hollow marrow tube
  noiseBody(o, sr, rng, { dur: 0.05, f0: 2600, f1: 900, q: 1.6, amp: 0.35, curve: 3.5 });
};

const bone_break = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.006, f0: 5200, f1: 1100, amp: 0.85 });
  // crunch = dense fast grains, not one snap
  scatter(o, sr, rng, { t0: 0, t1: 0.12, count: 20, fLo: 500, fHi: 2800, decay: 0.012, amp: 0.42, clump: 0.7, noise: 0.8 });
  modal(o, sr, 640, BONE_MODES.map(m => [m[0], m[1], m[2] * 1.6]), { rng, jitter: 0.07 });
  partial(o, sr, 178, 0.4, 0.15);
  scatter(o, sr, rng, { t0: 0.1, t1: 0.75, count: 10, fLo: 600, fHi: 2400, decay: 0.02, amp: 0.24, clump: 0.4 });
};

const bone_clatter = (o, sr, rng) => {
  scatter(o, sr, rng, { t0: 0, t1: 0.6, count: 11, fLo: 620, fHi: 2400, decay: 0.02, amp: 0.5, clump: 0.35 });
  partial(o, sr, 210, 0.14, 0.12);
};

/* ---------- EARTH ------------------------------------------------------ */

const dirt_crack = (o, sr, rng) => {
  noiseBody(o, sr, rng, { dur: 0.11, f0: 700, f1: 180, q: 0.8, amp: 0.8, kind: 'pink', mode: 'lp', curve: 3 });
  thump(o, sr, 120, 62, 0.4, 0.07);
};

const dirt_break = (o, sr, rng) => {
  thump(o, sr, 88, 42, 0.9, 0.16, { tauF: 0.02 });
  noiseBody(o, sr, rng, { dur: 0.34, f0: 520, f1: 110, q: 0.7, amp: 0.9, kind: 'brown', mode: 'lp', curve: 2.2 });
  scatter(o, sr, rng, { t0: 0.03, t1: 0.5, count: 12, fLo: 110, fHi: 420, decay: 0.03, amp: 0.24, clump: 0.6, noise: 1.1 });
  lp1(o, 2200, sr);
};

const dirt_fall = (o, sr, rng) => {
  noiseBody(o, sr, rng, { dur: 0.18, f0: 420, f1: 130, q: 0.7, amp: 0.6, kind: 'pink', mode: 'lp', curve: 2.6 });
  scatter(o, sr, rng, { t0: 0, t1: 0.22, count: 5, fLo: 120, fHi: 380, decay: 0.022, amp: 0.3, noise: 1.2 });
  lp1(o, 1600, sr);
};

/* ---------- FLESH ------------------------------------------------------ */

/** Wet = a resonance sliding *down* fast. The ear reads a falling formant as liquid. */
function squelch(o, sr, rng, { at = 0, dur = 0.14, f0 = 1500, f1 = 260, amp = 0.5, q = 3.2 } = {}) {
  return noiseBody(o, sr, rng, { at, dur, f0, f1, q, amp, curve: 2.2, kind: 'pink' });
}

const flesh_hit = (o, sr, rng) => {
  thump(o, sr, 132, 68, 0.8, 0.1, { tauF: 0.012 });
  squelch(o, sr, rng, { dur: 0.11, f0: 1700, f1: 300, amp: 0.5 });
  noiseBody(o, sr, rng, { dur: 0.025, f0: 3200, f1: 1200, q: 1.2, amp: 0.3, curve: 3.5 });
  lp1(o, 5200, sr);
};

const flesh_burst = (o, sr, rng) => {
  thump(o, sr, 108, 48, 1.0, 0.18, { tauF: 0.02 });
  squelch(o, sr, rng, { dur: 0.26, f0: 2400, f1: 220, amp: 0.85, q: 2.4 });
  scatter(o, sr, rng, { t0: 0.04, t1: 0.55, count: 14, fLo: 180, fHi: 900, decay: 0.03, amp: 0.3, clump: 0.55, noise: 1.4 });
  lp1(o, 4200, sr);
  softClip(o, 1.15);
};

const gib = (o, sr, rng) => {
  thump(o, sr, 150, 78, 0.5, 0.06);
  squelch(o, sr, rng, { dur: 0.1, f0: 1300, f1: 240, amp: 0.6 });
  lp1(o, 3600, sr);
};

const flesh_burn = (o, sr, rng) => {
  white(o, rng, 0.22);
  svf(o, sr, { mode: 'bp', f0: 3100, q: 0.5 });
  for (let i = 0; i < o.length; i++) o[i] *= 0.55 + 0.45 * Math.sin(i / sr * 3.1);
  scatter(o, sr, rng, { t0: 0, t1: o.length / sr - 0.05, count: 46, fLo: 300, fHi: 1400, decay: 0.02, amp: 0.3, clump: 0, noise: 1.6 });
  return loopify(o, sr, 0.3);
};

/* ---------- generic world ---------------------------------------------- */

const impact_soft = (o, sr, rng) => {
  thump(o, sr, 150, 80, 0.6, 0.09);
  noiseBody(o, sr, rng, { dur: 0.08, f0: 1400, f1: 400, q: 0.9, amp: 0.4, kind: 'pink' });
};

const impact_hard = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.005, f0: 5000, f1: 900, amp: 0.7 });
  thump(o, sr, 110, 52, 0.9, 0.16, { tauF: 0.015 });
  noiseBody(o, sr, rng, { dur: 0.16, f0: 2000, f1: 300, q: 0.85, amp: 0.6, kind: 'pink' });
  softClip(o, 1.15);
};

const impact_heavy = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.009, f0: 3800, f1: 600, amp: 0.8 });
  thump(o, sr, 74, 33, 1.0, 0.34, { tauF: 0.04 });
  noiseBody(o, sr, rng, { dur: 0.6, f0: 400, f1: 80, q: 0.7, amp: 0.85, kind: 'brown', mode: 'lp', curve: 1.8 });
  scatter(o, sr, rng, { t0: 0.04, t1: 0.7, count: 14, fLo: 140, fHi: 800, decay: 0.05, amp: 0.3, clump: 0.6, noise: 0.8 });
  reverbTail(o, sr, { mix: 0.2, time: 1.0, damp: 0.55 });
  softClip(o, 1.05);
};

const explosion_small = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.006, f0: 8000, f1: 1200, amp: 0.9 });
  thump(o, sr, 130, 38, 1.0, 0.3, { tauF: 0.03 });
  noiseBody(o, sr, rng, { dur: 0.5, f0: 2600, f1: 150, q: 0.6, amp: 1.0, kind: 'pink', curve: 2.2 });
  noiseBody(o, sr, rng, { dur: 0.8, f0: 220, f1: 55, q: 0.7, amp: 0.8, kind: 'brown', mode: 'lp', curve: 1.7 });
  reverbTail(o, sr, { mix: 0.24, time: 1.1, damp: 0.5 });
  softClip(o, 1.3);
};

const explosion_big = (o, sr, rng) => {
  transient(o, sr, rng, { dur: 0.01, f0: 9000, f1: 900, amp: 1.0 });
  thump(o, sr, 105, 24, 1.0, 0.65, { tauF: 0.07 });
  noiseBody(o, sr, rng, { dur: 1.0, f0: 3200, f1: 110, q: 0.55, amp: 1.0, kind: 'pink', curve: 1.9 });
  noiseBody(o, sr, rng, { dur: 1.8, f0: 180, f1: 40, q: 0.7, amp: 1.0, kind: 'brown', mode: 'lp', curve: 1.4 });
  scatter(o, sr, rng, { t0: 0.15, t1: 1.9, count: 26, fLo: 140, fHi: 1400, decay: 0.06, amp: 0.26, clump: 0.5, noise: 0.9 });
  reverbTail(o, sr, { mix: 0.3, time: 2.0, damp: 0.6 });
  softClip(o, 1.4);
};

const collapse_start = (o, sr, rng) => {
  // the groan before the fall — a rising, grinding rumble
  noiseBody(o, sr, rng, { dur: 1.1, f0: 90, f1: 320, q: 2.2, amp: 1.0, kind: 'brown', a: 0.25, curve: 1.3 });
  creak(o, sr, rng, { dur: 1.0, f0: 260, rise: 2.4, amp: 0.45, rate: 22 });
  scatter(o, sr, rng, { t0: 0.2, t1: 1.2, count: 9, fLo: 180, fHi: 900, decay: 0.04, amp: 0.2, clump: 0.1, noise: 0.8 });
  lp1(o, 3000, sr);
};

const collapse_land = (o, sr, rng) => {
  thump(o, sr, 62, 28, 1.0, 0.5, { tauF: 0.06 });
  noiseBody(o, sr, rng, { dur: 1.3, f0: 340, f1: 65, q: 0.7, amp: 1.0, kind: 'brown', mode: 'lp', curve: 1.5 });
  scatter(o, sr, rng, { t0: 0.0, t1: 1.6, count: 34, fLo: 130, fHi: 1100, decay: 0.055, amp: 0.42, clump: 0.65, noise: 0.85 });
  reverbTail(o, sr, { mix: 0.26, time: 1.6, damp: 0.55 });
  softClip(o, 1.15);
};

function whoosh(dur, f0, f1, q) {
  return (o, sr, rng) => {
    noiseBody(o, sr, rng, { dur, f0, f1, q, amp: 1.0, kind: 'pink', a: dur * 0.3, curve: 2.0 });
    shape(o, sr, [[0, 0], [dur * 0.45, 1], [dur * 1.05, 0]]);
  };
}

const wind_gust = (o, sr, rng) => {
  pink(o, rng, 0.9);
  svf(o, sr, { mode: 'bp', f0: 420, f1: 1400, q: 1.4 });
  shape(o, sr, [[0, 0], [0.9, 1], [1.6, 0.35], [2.2, 0]]);
  return o;
};

const acid_loop = (o, sr, rng) => {
  white(o, rng, 0.18);
  svf(o, sr, { mode: 'bp', f0: 2400, q: 0.7 });
  scatter(o, sr, rng, { t0: 0, t1: o.length / sr - 0.05, count: 54, fLo: 220, fHi: 1500, decay: 0.03, amp: 0.3, clump: 0, noise: 1.0 });
  return loopify(o, sr, 0.35);
};

const slime_loop = (o, sr, rng) => {
  pink(o, rng, 0.3);
  svf(o, sr, { mode: 'lp', f0: 700, q: 0.8 });
  for (let i = 0; i < 14; i++) {
    const at = ((i / 14) * (o.length / sr - 0.2) * sr) | 0;
    squelch(o, sr, rng, { at, dur: 0.12, f0: 900 + rng.next() * 700, f1: 180, amp: 0.28 });
  }
  return loopify(o, sr, 0.35);
};

const fire_loop = (o, sr, rng) => {
  pink(o, rng, 0.5);
  svf(o, sr, { mode: 'bp', f0: 480, q: 0.6 });
  for (let i = 0; i < o.length; i++) {
    const t = i / sr;
    o[i] *= 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.3)) * (0.7 + 0.3 * Math.sin(t * 3.7 + 2));
  }
  scatter(o, sr, rng, { t0: 0, t1: o.length / sr - 0.05, count: 40, fLo: 400, fHi: 2200, decay: 0.014, amp: 0.4, clump: 0, noise: 1.2 });
  return loopify(o, sr, 0.3);
};

/* ---------- registration ------------------------------------------------ */

const BRIGHT = 44100;

export const MATERIAL_SFX = {
  stone_crack: { dur: 0.3, gain: 0.5, prio: 3, rate: 0.02, max: 6, variants: 3, gen: stone_crack },
  stone_break: { dur: 1.3, gain: 0.85, prio: 7, rate: 0.05, max: 4, variants: 3, send: 0.34, gen: stone_break },
  stone_debris: { dur: 0.2, gain: 0.3, prio: 1, rate: 0.028, max: 5, variants: 4, send: 0.16, gen: stone_debris },

  rock_crack: { dur: 0.34, gain: 0.52, prio: 3, rate: 0.02, max: 6, variants: 3, gen: rock_crack },
  rock_break: { dur: 1.6, gain: 0.9, prio: 7, rate: 0.05, max: 4, variants: 3, send: 0.36, gen: rock_break },
  rock_debris: { dur: 0.24, gain: 0.32, prio: 1, rate: 0.028, max: 5, variants: 4, send: 0.16, gen: rock_debris },

  wood_crack: { dur: 0.45, gain: 0.48, prio: 3, rate: 0.025, max: 5, variants: 3, gen: wood_crack },
  wood_break: { dur: 1.1, gain: 0.8, prio: 7, rate: 0.05, max: 4, variants: 3, send: 0.28, gen: wood_break },
  wood_debris: { dur: 0.18, gain: 0.3, prio: 1, rate: 0.028, max: 5, variants: 4, send: 0.14, gen: wood_debris },
  wood_burn: { dur: 2.6, gain: 0.5, prio: 5, loop: true, trim: false, norm: 0.7, send: 0.15, variants: 2, gen: wood_burn },

  leaf_rustle: { dur: 0.5, gain: 0.34, prio: 2, rate: 0.03, max: 6, variants: 3, sr: BRIGHT, gen: leaf_rustle },
  leaf_burst: { dur: 0.75, gain: 0.6, prio: 5, rate: 0.04, max: 4, variants: 3, sr: BRIGHT, send: 0.22, gen: leaf_burst },
  leaf_fall: { dur: 0.6, gain: 0.26, prio: 1, rate: 0.03, max: 5, variants: 3, sr: BRIGHT, gen: leaf_fall },
  leaf_burn: { dur: 2.6, gain: 0.42, prio: 5, loop: true, trim: false, norm: 0.7, sr: BRIGHT, send: 0.14, variants: 2, gen: leaf_burn },

  glass_crack: { dur: 0.4, gain: 0.42, prio: 3, rate: 0.02, max: 6, variants: 3, sr: BRIGHT, send: 0.3, gen: glass_crack },
  glass_break: { dur: 1.7, gain: 0.8, prio: 7, rate: 0.045, max: 4, variants: 3, sr: BRIGHT, send: 0.4, gen: glass_break },
  glass_tinkle: { dur: 0.9, gain: 0.34, prio: 1, rate: 0.025, max: 6, variants: 4, sr: BRIGHT, send: 0.35, gen: glass_tinkle },

  metal_dent: { dur: 1.8, gain: 0.5, prio: 4, rate: 0.03, max: 4, variants: 3, sr: BRIGHT, send: 0.3, gen: metal_dent },
  metal_break: { dur: 2.4, gain: 0.82, prio: 7, rate: 0.05, max: 3, variants: 3, sr: BRIGHT, send: 0.38, gen: metal_break },
  metal_clang: { dur: 1.2, gain: 0.42, prio: 2, rate: 0.03, max: 5, variants: 4, sr: BRIGHT, send: 0.3, gen: metal_clang },

  bone_crack: { dur: 0.28, gain: 0.44, prio: 3, rate: 0.022, max: 6, variants: 3, gen: bone_crack },
  bone_break: { dur: 0.9, gain: 0.7, prio: 6, rate: 0.045, max: 4, variants: 3, send: 0.26, gen: bone_break },
  bone_clatter: { dur: 0.8, gain: 0.36, prio: 1, rate: 0.03, max: 5, variants: 4, send: 0.22, gen: bone_clatter },

  dirt_crack: { dur: 0.22, gain: 0.4, prio: 2, rate: 0.022, max: 6, variants: 3, sr: 22050, gen: dirt_crack },
  dirt_break: { dur: 0.7, gain: 0.62, prio: 5, rate: 0.04, max: 4, variants: 3, sr: 22050, send: 0.2, gen: dirt_break },
  dirt_fall: { dur: 0.35, gain: 0.28, prio: 1, rate: 0.026, max: 5, variants: 4, sr: 22050, gen: dirt_fall },

  flesh_hit: { dur: 0.3, gain: 0.55, prio: 4, rate: 0.02, max: 6, variants: 3, sr: 22050, gen: flesh_hit },
  flesh_burst: { dur: 0.8, gain: 0.75, prio: 6, rate: 0.04, max: 4, variants: 3, sr: 22050, send: 0.22, gen: flesh_burst },
  gib: { dur: 0.3, gain: 0.4, prio: 1, rate: 0.025, max: 5, variants: 4, sr: 22050, gen: gib },
  flesh_burn: { dur: 2.6, gain: 0.4, prio: 5, loop: true, trim: false, norm: 0.7, send: 0.14, variants: 2, gen: flesh_burn },
};

export const WORLD_SFX = {
  'impact.soft': { dur: 0.3, gain: 0.45, prio: 3, rate: 0.02, max: 6, variants: 3, gen: impact_soft },
  'impact.hard': { dur: 0.5, gain: 0.65, prio: 5, rate: 0.025, max: 5, variants: 3, send: 0.22, gen: impact_hard },
  'impact.heavy': { dur: 1.2, gain: 0.85, prio: 7, rate: 0.04, max: 3, variants: 3, send: 0.3, gen: impact_heavy },
  'explosion.small': { dur: 1.4, gain: 0.9, prio: 8, rate: 0.05, max: 3, variants: 3, send: 0.34, gen: explosion_small },
  'explosion.big': { dur: 2.6, gain: 1.0, prio: 9, rate: 0.08, max: 2, variants: 2, send: 0.4, gen: explosion_big },
  'collapse.start': { dur: 1.5, gain: 0.7, prio: 7, rate: 0.1, max: 3, variants: 2, send: 0.3, gen: collapse_start },
  'collapse.land': { dur: 2.2, gain: 0.95, prio: 8, rate: 0.06, max: 3, variants: 2, send: 0.36, gen: collapse_land },
  'whoosh.small': { dur: 0.34, gain: 0.34, prio: 2, rate: 0.02, max: 6, variants: 3, sr: BRIGHT, gen: whoosh(0.3, 2600, 600, 1.1) },
  'whoosh.big': { dur: 0.7, gain: 0.5, prio: 4, rate: 0.03, max: 4, variants: 3, sr: BRIGHT, gen: whoosh(0.62, 1800, 260, 0.9) },
  'wind.gust': { dur: 2.4, gain: 0.4, prio: 2, rate: 0.5, max: 2, variants: 3, send: 0.2, gen: wind_gust },
  'fire.loop': { dur: 2.8, gain: 0.5, prio: 5, loop: true, trim: false, norm: 0.7, send: 0.15, variants: 2, gen: fire_loop },
  'acid.loop': { dur: 2.8, gain: 0.4, prio: 5, loop: true, trim: false, norm: 0.7, send: 0.14, variants: 2, gen: acid_loop },
  'slime.loop': { dur: 2.8, gain: 0.35, prio: 4, loop: true, trim: false, norm: 0.7, send: 0.14, variants: 2, sr: 22050, gen: slime_loop },
};

export { transient, noiseBody, scatter, creak, rustle, squelch, whoosh };
