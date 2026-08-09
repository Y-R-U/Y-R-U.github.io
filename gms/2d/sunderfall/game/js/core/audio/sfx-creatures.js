/**
 * Rook and the nine enemies.
 *
 * Enemy sounds are generated from a **voice profile** rather than hand-authored one at a
 * time: a formant-filtered glottal source with a pitch contour, plus a per-creature
 * accent (stone grind, wet gloop, void swell, fire hiss). Five events per creature come
 * out of the same model, which is why every enemy has complete coverage instead of the
 * usual three-sounds-and-a-gap.
 *
 * Keys: `enemy.<id>.spawn|tell|attack|hit|death`, `player.<event>`.
 */

import {
  pink, lp1, svf, env, shape, partial, modal, thump,
  reverbTail, softClip, mixInto, karplus, fm,
} from './dsp.js';
import { transient, noiseBody, scatter, squelch, rustle } from './sfx-materials.js';

/* ---------- the voice model -------------------------------------------- */

/**
 * Glottal source -> formant bank. `growl` adds the subharmonic roughness that makes a
 * throat sound like a throat rather than a synth; `breath` mixes noise into the source.
 */
function vox(o, sr, rng, p = {}) {
  const at = p.at || 0;
  const dur = p.dur ?? 0.4;
  const n = Math.min(o.length - at, Math.ceil(dur * sr));
  if (n <= 32) return o;
  const f0 = p.f0 ?? 150;
  const f1 = p.f1 ?? f0;
  const breath = p.breath ?? 0.4;
  const growl = p.growl ?? 0.4;
  const jit = p.jitter ?? 0.035;
  const growlHz = p.growlHz ?? (28 + f0 * 0.12);

  const src = new Float32Array(n);
  let ph = 0, sub = 0, jn = 0, jt = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (jt-- <= 0) { jn = rng.gauss() * jit; jt = (sr / 90) | 0; }
    const f = f0 * Math.pow(f1 / f0, u) * (1 + jn);
    ph += f / sr; if (ph >= 1) ph -= 1;
    sub += f * 0.5 / sr; if (sub >= 1) sub -= 1;
    const saw = 2 * ph - 1;
    const subv = (2 * sub - 1) * growl * 0.55;
    const am = 1 - growl * 0.45 * (0.5 + 0.5 * Math.sin(i / sr * growlHz * 6.283));
    src[i] = ((saw + subv) * (1 - breath) + (rng.next() * 2 - 1) * breath * 1.4) * am;
  }
  lp1(src, p.srcLp ?? 5200, sr);

  const forms = p.formants || [[600, 1, 6], [1200, 0.5, 8], [2600, 0.2, 11]];
  const body = new Float32Array(n);
  const slide = p.formantSlide ?? 1;
  for (let k = 0; k < forms.length; k++) {
    const [ff, fa, fq] = forms[k];
    const c = new Float32Array(n);
    c.set(src);
    svf(c, sr, { mode: 'bp', f0: ff, f1: ff * slide, q: fq });
    for (let i = 0; i < n; i++) body[i] += c[i] * fa;
  }
  env(body, sr, { a: p.a ?? Math.min(0.06, dur * 0.12), h: p.h ?? dur * 0.15, d: dur * 0.8, curve: p.curve ?? 2 });
  if (p.shape) shape(body, sr, p.shape);
  return mixInto(o, body, p.amp ?? 0.7, at);
}

/* ---------- creature accents ------------------------------------------- */

const ACCENT = {
  stone(o, sr, rng, p, strength) {
    noiseBody(o, sr, rng, { dur: 0.35 * strength, f0: 900, f1: 180, q: 1.4, amp: 0.35 * strength, kind: 'pink' });
    scatter(o, sr, rng, { t0: 0.02, t1: 0.4 * strength, count: 8, fLo: 140, fHi: 800, decay: 0.04, amp: 0.22, clump: 0.5, noise: 0.9 });
  },
  wet(o, sr, rng, p, strength) {
    squelch(o, sr, rng, { dur: 0.22 * strength, f0: 1600, f1: 200, amp: 0.42 * strength, q: 2.6 });
    scatter(o, sr, rng, { t0: 0.05, t1: 0.5 * strength, count: 7, fLo: 180, fHi: 700, decay: 0.03, amp: 0.18, noise: 1.4 });
  },
  fire(o, sr, rng, p, strength) {
    noiseBody(o, sr, rng, { dur: 0.4 * strength, f0: 3000, f1: 900, q: 0.7, amp: 0.3 * strength });
    scatter(o, sr, rng, { t0: 0, t1: 0.45 * strength, count: 14, fLo: 700, fHi: 3400, decay: 0.01, amp: 0.2, noise: 1.2 });
  },
  void(o, sr, rng, p, strength) {
    // inharmonic bell + a swell that arrives before its own transient
    fm(o, sr, { carrier: 96, ratio: 2.73, index: 3.2, indexDecay: 0.25, decay: 0.6 * strength, amp: 0.22 * strength });
    const n = Math.min(o.length, Math.ceil(0.5 * strength * sr));
    const t = new Float32Array(n);
    pink(t, rng, 0.5);
    svf(t, sr, { mode: 'bp', f0: 260, f1: 1800, q: 2.4 });
    shape(t, sr, [[0, 0], [n / sr * 0.85, 1], [n / sr, 0.1]]);
    mixInto(o, t, 0.3 * strength, 0);
  },
  chitin(o, sr, rng, p, strength) {
    scatter(o, sr, rng, { t0: 0, t1: 0.2 * strength, count: 9, fLo: 1800, fHi: 6000, decay: 0.008, amp: 0.24, clump: 0.5 });
  },
  hollow(o, sr, rng, p, strength) {
    partial(o, sr, 178, 0.16 * strength, 0.3 * strength);
    partial(o, sr, 268, 0.1 * strength, 0.22 * strength);
  },
  flesh(o, sr, rng, p, strength) {
    thump(o, sr, 130, 70, 0.3 * strength, 0.1);
    squelch(o, sr, rng, { dur: 0.1 * strength, f0: 1500, f1: 300, amp: 0.3 * strength });
  },
};

/* ---------- the nine ---------------------------------------------------- */

const CREATURES = {
  husk: {
    f0: 118, size: 0.5, accent: 'flesh', accent2: null,
    formants: [[520, 1, 5], [1150, 0.45, 8], [2400, 0.14, 11]], breath: 0.5, growl: 0.55,
  },
  sporeling: {
    f0: 430, size: 0.15, accent: 'chitin', sr: 44100,
    formants: [[1500, 1, 7], [2800, 0.5, 9], [4600, 0.22, 12]], breath: 0.6, growl: 0.3, jitter: 0.08,
  },
  thornhound: {
    f0: 148, size: 0.45, accent: 'flesh',
    formants: [[420, 1, 4], [900, 0.6, 7], [2100, 0.3, 10]], breath: 0.32, growl: 0.9, jitter: 0.06,
  },
  gloamarcher: {
    f0: 236, size: 0.4, accent: 'hollow',
    formants: [[760, 1, 9], [1520, 0.4, 12], [3000, 0.18, 14]], breath: 0.72, growl: 0.18,
  },
  stonewarden: {
    f0: 58, size: 0.95, accent: 'stone',
    formants: [[205, 1, 3], [560, 0.5, 5], [1300, 0.18, 8]], breath: 0.22, growl: 0.72, srcLp: 2400,
  },
  wispmaw: {
    f0: 318, size: 0.3, accent: 'fire', sr: 44100,
    formants: [[1100, 1, 10], [2400, 0.55, 13], [5200, 0.25, 16]], breath: 0.86, growl: 0.1,
  },
  oozelord: {
    f0: 84, size: 0.85, accent: 'wet',
    formants: [[300, 1, 3], [700, 0.55, 4], [1500, 0.18, 6]], breath: 0.5, growl: 0.62, srcLp: 2600,
  },
  sunderwraith: {
    f0: 196, size: 0.6, accent: 'void',
    formants: [[640, 1, 8], [1360, 0.5, 10], [2900, 0.32, 12]], breath: 0.9, growl: 0.25,
  },
  theseam: {
    f0: 42, size: 1.0, accent: 'void', boss: true,
    formants: [[148, 1, 2], [420, 0.6, 3], [980, 0.28, 5]], breath: 0.6, growl: 0.92, srcLp: 3200,
  },
};

const EV = {
  /** Arrival: a swell that resolves into the creature's voice. */
  spawn: (c) => (o, sr, rng) => {
    const d = 0.5 + c.size * 0.6;
    ACCENT[c.accent](o, sr, rng, c, 0.8 + c.size);
    vox(o, sr, rng, {
      ...c, dur: d, f0: c.f0 * 0.62, f1: c.f0 * 1.1, amp: 0.6,
      a: d * 0.35, h: d * 0.1, curve: 1.6,
    });
  },

  /**
   * The 0.35 s telegraph. It must be legible as "something is about to happen", so it
   * rises the whole way and deliberately leaves the peak at the very end.
   */
  tell: (c) => (o, sr, rng) => {
    const d = 0.36;
    vox(o, sr, rng, {
      ...c, dur: d, f0: c.f0 * 0.8, f1: c.f0 * 1.45, amp: 0.5, breath: Math.min(1, c.breath + 0.2),
      a: d * 0.6, h: 0, curve: 1.0, formantSlide: 1.5,
      shape: [[0, 0.05], [d * 0.75, 0.85], [d, 1]],
    });
    // an upward band sweep on top — reads across a noisy mix better than pitch alone
    noiseBody(o, sr, rng, { dur: d, f0: 300 + c.f0, f1: 1600 + c.f0 * 4, q: 3.2, amp: 0.3, a: d * 0.7, curve: 1.0 });
  },

  attack: (c) => (o, sr, rng) => {
    const d = 0.22 + c.size * 0.16;
    noiseBody(o, sr, rng, { dur: d * 0.8, f0: 2600 - c.size * 1500, f1: 400, q: 1.0, amp: 0.5, a: d * 0.2, kind: 'pink' });
    vox(o, sr, rng, {
      ...c, dur: d, f0: c.f0 * 1.35, f1: c.f0 * 0.75, amp: 0.75, a: 0.006, h: d * 0.1, curve: 2.6,
    });
    ACCENT[c.accent](o, sr, rng, c, 0.5 + c.size * 0.5);
    softClip(o, 1.1);
  },

  hit: (c) => (o, sr, rng) => {
    const d = 0.16 + c.size * 0.12;
    ACCENT[c.accent](o, sr, rng, c, 0.6);
    vox(o, sr, rng, {
      ...c, dur: d, f0: c.f0 * 1.5, f1: c.f0 * 1.05, amp: 0.7, a: 0.004, h: d * 0.12, curve: 3,
      jitter: (c.jitter ?? 0.035) * 2,
    });
  },

  death: (c) => (o, sr, rng) => {
    const d = 0.7 + c.size * 0.9;
    vox(o, sr, rng, {
      ...c, dur: d * 0.75, f0: c.f0 * 1.25, f1: c.f0 * 0.45, amp: 0.8,
      a: 0.008, h: d * 0.12, curve: 1.5, growl: Math.min(1, (c.growl ?? 0.4) + 0.25),
    });
    ACCENT[c.accent](o, sr, rng, c, 1.0 + c.size);
    // the body landing
    thump(o, sr, 110 - c.size * 55, 48 - c.size * 22, 0.4 + c.size * 0.4, 0.2 + c.size * 0.2, {
      from: (d * 0.55 * sr) | 0, tauF: 0.03,
    });
    reverbTail(o, sr, { mix: 0.16, time: 0.8, damp: 0.5 });
    softClip(o, 1.1);
  },
};

export const CREATURE_SFX = {};

for (const id in CREATURES) {
  const c = CREATURES[id];
  const big = c.size;
  const base = { sr: c.sr || 32000, variants: 3, send: 0.24 };
  CREATURE_SFX[`enemy.${id}.spawn`] = { ...base, dur: 1.3 + big, gain: 0.42 + big * 0.2, prio: 4, rate: 0.06, max: 3, gen: EV.spawn(c) };
  CREATURE_SFX[`enemy.${id}.tell`] = { ...base, dur: 0.5, gain: 0.42 + big * 0.15, prio: 6, rate: 0.05, max: 4, gen: EV.tell(c) };
  CREATURE_SFX[`enemy.${id}.attack`] = { ...base, dur: 0.6, gain: 0.5 + big * 0.2, prio: 6, rate: 0.03, max: 5, gen: EV.attack(c) };
  CREATURE_SFX[`enemy.${id}.hit`] = { ...base, dur: 0.4, gain: 0.4 + big * 0.15, prio: 5, rate: 0.025, max: 6, variants: 4, gen: EV.hit(c) };
  CREATURE_SFX[`enemy.${id}.death`] = { ...base, dur: 2.1 + big, gain: 0.55 + big * 0.25, prio: 7, rate: 0.04, max: 4, send: 0.3, gen: EV.death(c) };
}

/* ---------- the boss gets bespoke extras -------------------------------- */

const seam = CREATURES.theseam;

CREATURE_SFX['enemy.theseam.roar'] = {
  dur: 3.4, gain: 1.0, prio: 9, rate: 0.5, max: 1, variants: 2, send: 0.45, sr: 32000,
  gen(o, sr, rng) {
    ACCENT.void(o, sr, rng, seam, 2.2);
    vox(o, sr, rng, { ...seam, dur: 2.6, f0: 30, f1: 58, amp: 1.0, a: 0.35, h: 1.1, curve: 1.3, growl: 1 });
    vox(o, sr, rng, { ...seam, dur: 2.2, f0: 121, f1: 88, amp: 0.35, a: 0.5, h: 0.8, curve: 1.4, breath: 0.85 });
    noiseBody(o, sr, rng, { dur: 2.8, f0: 60, f1: 240, q: 1.6, amp: 0.7, kind: 'brown', a: 0.6, curve: 1.2 });
    reverbTail(o, sr, { mix: 0.34, time: 2.6, damp: 0.5 });
    softClip(o, 1.35);
  },
};

CREATURE_SFX['enemy.theseam.tear'] = {
  dur: 1.8, gain: 0.85, prio: 8, rate: 0.15, max: 2, variants: 3, send: 0.4, sr: 44100,
  gen(o, sr, rng) {
    // reality ripping: a bright noise band forced open, with sub under it
    noiseBody(o, sr, rng, { dur: 1.0, f0: 340, f1: 7000, q: 5.5, amp: 0.8, a: 0.06, curve: 1.4 });
    noiseBody(o, sr, rng, { dur: 1.2, f0: 5200, f1: 300, q: 1.2, amp: 0.5, a: 0.35, curve: 1.6 });
    thump(o, sr, 58, 26, 0.7, 0.6, { tauF: 0.12 });
    fm(o, sr, { carrier: 138, ratio: 3.37, index: 6, indexDecay: 0.5, decay: 1.1, amp: 0.3 });
    reverbTail(o, sr, { mix: 0.3, time: 1.8, damp: 0.35 });
    softClip(o, 1.2);
  },
};

CREATURE_SFX['enemy.theseam.phase'] = {
  dur: 1.4, gain: 0.7, prio: 7, rate: 0.1, max: 2, variants: 2, send: 0.42, sr: 32000,
  gen(o, sr, rng) {
    ACCENT.void(o, sr, rng, seam, 1.6);
    fm(o, sr, { carrier: 74, ratio: 2.41, index: 5, indexDecay: 0.4, decay: 0.9, amp: 0.45 });
    noiseBody(o, sr, rng, { dur: 0.9, f0: 4200, f1: 260, q: 1.8, amp: 0.4, a: 0.25, curve: 1.5 });
  },
};

/* ---------- Rook -------------------------------------------------------- */

/** Footstep = a body-weight thud plus the surface's own scuff. */
function step(surface) {
  return (o, sr, rng) => {
    thump(o, sr, 96 + rng.range(-8, 8), 54, 0.45, 0.055, { tauF: 0.008 });
    surface(o, sr, rng);
    lp1(o, 9000, sr);
  };
}

const STEP_SURFACE = {
  stone: (o, sr, rng) => {
    noiseBody(o, sr, rng, { dur: 0.06, f0: 2600, f1: 700, q: 1.1, amp: 0.4, curve: 3.2 });
    scatter(o, sr, rng, { t0: 0.005, t1: 0.07, count: 3, fLo: 700, fHi: 2600, decay: 0.012, amp: 0.14, clump: 0.6 });
  },
  rock: (o, sr, rng) => {
    noiseBody(o, sr, rng, { dur: 0.07, f0: 1800, f1: 450, q: 1.0, amp: 0.42, kind: 'pink', curve: 3 });
    scatter(o, sr, rng, { t0: 0.005, t1: 0.09, count: 4, fLo: 300, fHi: 1400, decay: 0.02, amp: 0.16, clump: 0.5, noise: 0.8 });
  },
  wood: (o, sr, rng) => {
    modal(o, sr, 268, [[1, 0.32, 0.05], [2.2, 0.16, 0.03], [3.5, 0.07, 0.02]], { rng, jitter: 0.08 });
    noiseBody(o, sr, rng, { dur: 0.045, f0: 2000, f1: 600, q: 1.2, amp: 0.26, curve: 3.4 });
  },
  leaf: (o, sr, rng) => { rustle(o, sr, rng, { dur: 0.18, amp: 0.45, f0: 4200, f1: 2400, density: 160 }); },
  glass: (o, sr, rng) => {
    scatter(o, sr, rng, { t0: 0, t1: 0.12, count: 6, fLo: 3200, fHi: 9000, decay: 0.02, amp: 0.3, clump: 0.5 });
  },
  metal: (o, sr, rng) => {
    modal(o, sr, 620, [[1, 0.3, 0.22], [1.72, 0.2, 0.16], [2.31, 0.12, 0.12], [4.07, 0.06, 0.08]], { rng, jitter: 0.03 });
    noiseBody(o, sr, rng, { dur: 0.03, f0: 4200, f1: 1400, q: 1.4, amp: 0.22, curve: 3.6 });
  },
  bone: (o, sr, rng) => {
    scatter(o, sr, rng, { t0: 0, t1: 0.1, count: 5, fLo: 700, fHi: 2400, decay: 0.014, amp: 0.28, clump: 0.5 });
  },
  dirt: (o, sr, rng) => {
    noiseBody(o, sr, rng, { dur: 0.08, f0: 620, f1: 160, q: 0.8, amp: 0.5, kind: 'pink', mode: 'lp', curve: 3 });
  },
  flesh: (o, sr, rng) => { squelch(o, sr, rng, { dur: 0.09, f0: 1200, f1: 260, amp: 0.35 }); },
};

export const PLAYER_SFX = {};

for (const s in STEP_SURFACE) {
  PLAYER_SFX[`player.step.${s}`] = {
    dur: 0.28, gain: 0.3, prio: 2, rate: 0.09, max: 3, variants: 4,
    sr: s === 'glass' || s === 'metal' ? 44100 : 32000, send: 0.16, gen: step(STEP_SURFACE[s]),
  };
}
PLAYER_SFX['player.step'] = PLAYER_SFX['player.step.dirt'];

Object.assign(PLAYER_SFX, {
  'player.jump': {
    dur: 0.4, gain: 0.36, prio: 4, rate: 0.06, max: 2, variants: 3, sr: 44100,
    gen(o, sr, rng) {
      noiseBody(o, sr, rng, { dur: 0.22, f0: 600, f1: 2800, q: 1.6, amp: 0.5, a: 0.02, curve: 2 });
      partial(o, sr, 210, 0.18, 0.09, { bendTo: 460, bendTau: 0.05 });
      // a short exhale, so the jump belongs to a person
      vox(o, sr, rng, { dur: 0.18, f0: 200, f1: 260, amp: 0.22, breath: 0.85, growl: 0.05, formants: [[900, 1, 6], [2100, 0.4, 9]] });
    },
  },
  'player.land': {
    dur: 0.45, gain: 0.45, prio: 4, rate: 0.05, max: 3, variants: 3,
    gen(o, sr, rng) {
      thump(o, sr, 108, 48, 0.8, 0.11, { tauF: 0.01 });
      noiseBody(o, sr, rng, { dur: 0.12, f0: 1400, f1: 300, q: 0.9, amp: 0.45, kind: 'pink', curve: 3 });
      scatter(o, sr, rng, { t0: 0.01, t1: 0.16, count: 5, fLo: 300, fHi: 1600, decay: 0.018, amp: 0.16, clump: 0.6, noise: 0.7 });
    },
  },
  'player.land.hard': {
    dur: 0.9, gain: 0.7, prio: 6, rate: 0.05, max: 2, variants: 3, send: 0.26,
    gen(o, sr, rng) {
      transient(o, sr, rng, { dur: 0.004, f0: 3600, f1: 800, amp: 0.5 });
      thump(o, sr, 86, 34, 1.0, 0.26, { tauF: 0.02 });
      noiseBody(o, sr, rng, { dur: 0.4, f0: 900, f1: 130, q: 0.8, amp: 0.7, kind: 'brown', mode: 'lp', curve: 2 });
      scatter(o, sr, rng, { t0: 0.02, t1: 0.45, count: 10, fLo: 200, fHi: 1200, decay: 0.03, amp: 0.25, clump: 0.6, noise: 0.9 });
      vox(o, sr, rng, { dur: 0.3, f0: 175, f1: 130, amp: 0.28, breath: 0.7, growl: 0.3, formants: [[620, 1, 6], [1400, 0.4, 9]], a: 0.02 });
      softClip(o, 1.1);
    },
  },
  'player.dash': {
    dur: 0.55, gain: 0.42, prio: 5, rate: 0.05, max: 2, variants: 3, sr: 44100, send: 0.24,
    gen(o, sr, rng) {
      // the lifestone doing the work, not the boy: a filtered rush with a magic edge
      noiseBody(o, sr, rng, { dur: 0.34, f0: 5200, f1: 700, q: 1.1, amp: 0.8, a: 0.012, curve: 2.2 });
      partial(o, sr, 880, 0.18, 0.18, { bendTo: 320, bendTau: 0.06 });
      partial(o, sr, 1320, 0.1, 0.12, { bendTo: 480, bendTau: 0.05 });
      fm(o, sr, { carrier: 320, ratio: 1.51, index: 2.4, indexDecay: 0.09, decay: 0.2, amp: 0.16 });
    },
  },
  'player.hurt': {
    dur: 0.6, gain: 0.62, prio: 8, rate: 0.12, max: 2, variants: 4,
    gen(o, sr, rng) {
      thump(o, sr, 128, 62, 0.55, 0.1);
      squelch(o, sr, rng, { dur: 0.12, f0: 1700, f1: 320, amp: 0.35 });
      vox(o, sr, rng, {
        dur: 0.34, f0: 265, f1: 178, amp: 0.75, breath: 0.42, growl: 0.35, jitter: 0.07,
        formants: [[700, 1, 6], [1500, 0.5, 9], [2900, 0.2, 11]], a: 0.006, h: 0.05, curve: 2.2,
      });
    },
  },
  'player.death': {
    dur: 2.6, gain: 0.85, prio: 9, rate: 1.0, max: 1, variants: 2, send: 0.4,
    gen(o, sr, rng) {
      vox(o, sr, rng, {
        dur: 1.1, f0: 250, f1: 96, amp: 0.85, breath: 0.5, growl: 0.5, jitter: 0.06,
        formants: [[660, 1, 6], [1420, 0.5, 9], [2800, 0.2, 12]], a: 0.01, h: 0.16, curve: 1.4,
      });
      thump(o, sr, 80, 34, 0.7, 0.4, { from: (0.55 * sr) | 0, tauF: 0.05 });
      // the lifestone going out
      fm(o, sr, { carrier: 196, ratio: 2.01, index: 4, indexDecay: 0.6, decay: 1.6, amp: 0.3 });
      noiseBody(o, sr, rng, { at: (0.5 * sr) | 0, dur: 1.6, f0: 1800, f1: 90, q: 1.2, amp: 0.4, a: 0.1, curve: 1.3 });
      reverbTail(o, sr, { mix: 0.3, time: 2.0, damp: 0.4 });
    },
  },
  'player.heal': {
    dur: 1.4, gain: 0.5, prio: 5, rate: 0.2, max: 2, variants: 2, sr: 44100, send: 0.36,
    gen(o, sr, rng) {
      const notes = [392, 523.25, 659.25];
      for (let i = 0; i < notes.length; i++) {
        const k = karplus(Math.ceil(0.9 * sr), sr, notes[i], { rng, bright: 0.35, damp: 0.4, loss: 0.0004 });
        mixInto(o, k, 0.22, (i * 0.07 * sr) | 0);
      }
      partial(o, sr, 784, 0.1, 0.6, { bendTo: 792, bendTau: 0.3 });
      reverbTail(o, sr, { mix: 0.3, time: 1.4, damp: 0.3 });
    },
  },
  'player.focus_low': {
    dur: 0.5, gain: 0.3, prio: 3, rate: 0.4, max: 1, variants: 2,
    gen(o, sr, rng) {
      partial(o, sr, 174, 0.4, 0.3, { bendTo: 138, bendTau: 0.12 });
      partial(o, sr, 261, 0.16, 0.2, { bendTo: 207, bendTau: 0.1 });
      noiseBody(o, sr, rng, { dur: 0.25, f0: 900, f1: 220, q: 2, amp: 0.16 });
    },
  },
  'player.cast': {
    dur: 0.5, gain: 0.4, prio: 5, rate: 0.03, max: 4, variants: 3, sr: 44100, send: 0.28,
    gen(o, sr, rng) {
      noiseBody(o, sr, rng, { dur: 0.2, f0: 800, f1: 4200, q: 2.2, amp: 0.45, a: 0.03, curve: 1.6 });
      partial(o, sr, 330, 0.22, 0.18, { bendTo: 660, bendTau: 0.05 });
      fm(o, sr, { carrier: 440, ratio: 1.73, index: 3, indexDecay: 0.06, decay: 0.22, amp: 0.22 });
    },
  },
});

export { vox, ACCENT, CREATURES };
