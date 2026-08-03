// One-shot sound effects. Same play(eng, o) contract as instruments.

import { perc, biquad, chain, shaper, rnd } from './core.js';

const lvl = (def = 0.8) => ({ min: 0, max: 1.4, def, step: 0.02, label: 'level' });
const send = (def = 0.2) => ({ min: 0, max: 1, def, step: 0.02, label: 'reverb' });

function noiseHit(eng, out, { t, dur, type = 'lowpass', f0, f1, q = 1, peak = 1, attack = 0.001, rate = 1 }) {
  const { ctx } = eng;
  const n = eng.noiseSrc(t, dur, rate);
  const f = biquad(ctx, type, f0, q);
  if (f1 != null && f1 !== f0) {
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  }
  const g = ctx.createGain();
  perc(g.gain, t, peak, attack, dur);
  chain([n, f, g, out]);
  return g;
}

function tone(eng, out, { t, dur, type = 'sine', f0, f1, peak = 0.5, attack = 0.003, curve = 'exp' }) {
  const { ctx } = eng;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 != null && f1 !== f0) {
    if (curve === 'lin') o.frequency.linearRampToValueAtTime(f1, t + dur);
    else o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  }
  const g = ctx.createGain();
  perc(g.gain, t, peak, attack, dur);
  chain([o, g, out]);
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

export const SFX = {

  explosionBoom: {
    name: 'Explosion — boom', group: 'Explosions', dur: 3.2,
    params: {
      size: { min: 0.3, max: 2.5, def: 1.2, step: 0.05 },
      pitch: { min: 25, max: 140, def: 55, step: 1, unit: 'Hz' },
      grit: { min: 0, max: 1, def: 0.6, step: 0.02 },
      level: lvl(1), send: send(0.5),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.size;
      const out = eng.voice(t, d * 2.4 + 0.6, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const sh = shaper(ctx, 1 + o.grit * 8); sh.connect(out);
      tone(eng, sh, { t, dur: d * 1.5, f0: o.pitch * 4.5, f1: o.pitch * 0.55, peak: 0.85 });
      noiseHit(eng, sh, { t, dur: d * 0.5, type: 'lowpass', f0: 5000, f1: 400, q: 0.9, peak: 0.9 });
      noiseHit(eng, out, { t: t + 0.02, dur: d * 2.2, type: 'lowpass', f0: 900, f1: 90, q: 0.6, peak: 0.55, attack: 0.03 });
      // debris: sparse filtered grains after the blast
      for (let i = 0; i < 14; i++) {
        const st = t + 0.08 + Math.random() * d * 1.4;
        noiseHit(eng, out, { t: st, dur: rnd(0.03, 0.11), type: 'bandpass', f0: rnd(500, 3500), q: 2.5, peak: rnd(0.05, 0.22) * o.grit });
      }
    },
  },

  explosionCrack: {
    name: 'Explosion — crack', group: 'Explosions', dur: 1.4,
    params: {
      snap: { min: 0.2, max: 1, def: 0.7, step: 0.02 },
      tail: { min: 0.1, max: 1.5, def: 0.6, step: 0.05, unit: 's' },
      pitch: { min: 40, max: 250, def: 120, step: 5, unit: 'Hz' },
      level: lvl(0.9), send: send(0.55),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.tail + 0.6, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const sh = shaper(ctx, 6); sh.connect(out);
      noiseHit(eng, sh, { t, dur: 0.05, type: 'highpass', f0: 1800, q: 0.7, peak: o.snap });
      noiseHit(eng, sh, { t, dur: 0.14, type: 'bandpass', f0: 3200, f1: 900, q: 1.1, peak: o.snap * 0.8 });
      tone(eng, sh, { t, dur: 0.2, f0: o.pitch * 3, f1: o.pitch, peak: 0.6 });
      noiseHit(eng, out, { t: t + 0.03, dur: o.tail, type: 'lowpass', f0: 1400, f1: 180, q: 0.7, peak: 0.35, attack: 0.02 });
    },
  },

  explosionDistant: {
    name: 'Explosion — distant', group: 'Explosions', dur: 3.4,
    params: {
      dist: { min: 0.2, max: 1, def: 0.7, step: 0.02, label: 'distance' },
      size: { min: 0.5, max: 3, def: 1.6, step: 0.05 },
      level: lvl(0.9), send: send(0.8),
    },
    play(eng, o) {
      const t = o.t, d = o.size;
      const out = eng.voice(t, d * 2 + 0.8, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const lp = biquad(eng.ctx, 'lowpass', 1600 - o.dist * 1300, 0.6);
      lp.connect(out);
      tone(eng, lp, { t, dur: d * 1.4, f0: 130, f1: 42, peak: 0.7, attack: 0.05 });
      noiseHit(eng, lp, { t, dur: d * 1.8, type: 'lowpass', f0: 700, f1: 70, q: 0.5, peak: 0.6, attack: 0.09 });
    },
  },

  impactMetal: {
    name: 'Impact — metal', group: 'Impacts', dur: 2.2,
    params: {
      pitch: { min: 120, max: 1400, def: 430, step: 10, unit: 'Hz' },
      ring: { min: 0.1, max: 3, def: 1.1, step: 0.05, unit: 's' },
      hard: { min: 0, max: 1, def: 0.65, step: 0.02 },
      level: lvl(0.75), send: send(0.4),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.ring + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      noiseHit(eng, out, { t, dur: 0.02, type: 'highpass', f0: 3000, peak: o.hard * 0.8 });
      // inharmonic partials read as struck metal
      for (const [m, g] of [[1, 0.5], [1.79, 0.32], [2.71, 0.22], [4.13, 0.14], [5.9, 0.08]]) {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = o.pitch * m;
        const a = ctx.createGain();
        perc(a.gain, t, g, 0.001, o.ring / (1 + m * 0.35));
        chain([osc, a, out]);
        osc.start(t); osc.stop(t + o.ring + 0.1);
      }
    },
  },

  impactWood: {
    name: 'Impact — wood', group: 'Impacts', dur: 0.7,
    params: {
      pitch: { min: 80, max: 900, def: 260, step: 5, unit: 'Hz' },
      decay: { min: 0.04, max: 0.6, def: 0.16, step: 0.01, unit: 's' },
      knock: { min: 0, max: 1, def: 0.6, step: 0.02 },
      level: lvl(0.8), send: send(0.3),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.decay + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      noiseHit(eng, out, { t, dur: 0.025, type: 'bandpass', f0: o.pitch * 6, q: 1.2, peak: o.knock });
      for (const [m, g] of [[1, 0.6], [2.4, 0.25], [3.9, 0.12]]) {
        const osc = ctx.createOscillator(); osc.type = 'triangle';
        osc.frequency.setValueAtTime(o.pitch * m * 1.2, t);
        osc.frequency.exponentialRampToValueAtTime(o.pitch * m, t + 0.02);
        const a = ctx.createGain();
        perc(a.gain, t, g, 0.001, o.decay / (1 + m * 0.4));
        chain([osc, a, out]);
        osc.start(t); osc.stop(t + o.decay + 0.1);
      }
    },
  },

  impactThud: {
    name: 'Impact — body thud', group: 'Impacts', dur: 0.9,
    params: {
      weight: { min: 0.3, max: 2, def: 1, step: 0.05 },
      slap: { min: 0, max: 1, def: 0.4, step: 0.02 },
      level: lvl(0.9), send: send(0.2),
    },
    play(eng, o) {
      const t = o.t, w = o.weight;
      const out = eng.voice(t, 0.5 * w + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      tone(eng, out, { t, dur: 0.3 * w, f0: 190 / w, f1: 48 / w, peak: 0.85, attack: 0.004 });
      noiseHit(eng, out, { t, dur: 0.09, type: 'lowpass', f0: 1200, f1: 260, q: 0.8, peak: o.slap * 0.7 });
    },
  },

  whooshFast: {
    name: 'Whoosh — fast', group: 'Movement', dur: 0.8,
    params: {
      speed: { min: 0.1, max: 1.2, def: 0.32, step: 0.01, unit: 's' },
      body: { min: 200, max: 4000, def: 1100, step: 50, unit: 'Hz' },
      focus: { min: 0.4, max: 8, def: 2.4, step: 0.1, label: 'Q' },
      level: lvl(0.7), send: send(0.35),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.speed;
      const out = eng.voice(t, d + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d + 0.1);
      const bp = biquad(ctx, 'bandpass', o.body * 0.35, o.focus);
      bp.frequency.setValueAtTime(o.body * 0.3, t);
      bp.frequency.exponentialRampToValueAtTime(o.body * 2.2, t + d * 0.45);
      bp.frequency.exponentialRampToValueAtTime(o.body * 0.25, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9, t + d * 0.45);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      g.gain.linearRampToValueAtTime(0, t + d + 0.02);
      chain([n, bp, g, out]);
    },
  },

  whooshHeavy: {
    name: 'Whoosh — heavy', group: 'Movement', dur: 1.6,
    params: {
      speed: { min: 0.3, max: 2, def: 0.85, step: 0.02, unit: 's' },
      weight: { min: 0.3, max: 2, def: 1.1, step: 0.05 },
      level: lvl(0.8), send: send(0.5),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.speed;
      const out = eng.voice(t, d + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d + 0.1, 0.6);
      const lp = biquad(ctx, 'lowpass', 300, 1.2);
      lp.frequency.setValueAtTime(180 / o.weight, t);
      lp.frequency.exponentialRampToValueAtTime(1800 / o.weight, t + d * 0.5);
      lp.frequency.exponentialRampToValueAtTime(160 / o.weight, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + d * 0.5);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      g.gain.linearRampToValueAtTime(0, t + d + 0.02);
      chain([n, lp, g, out]);
      tone(eng, out, { t, dur: d, f0: 70 / o.weight, f1: 34 / o.weight, peak: 0.22, attack: d * 0.4 });
    },
  },

  uiBlip: {
    name: 'UI — blip', group: 'Interface', dur: 0.25,
    params: {
      pitch: { min: 300, max: 2500, def: 900, step: 10, unit: 'Hz' },
      decay: { min: 0.02, max: 0.3, def: 0.07, step: 0.005, unit: 's' },
      wave: { min: 0, max: 3, def: 1, step: 1, label: 'wave', enum: ['sine', 'triangle', 'square', 'sawtooth'] },
      level: lvl(0.4), send: send(0.12),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, o.decay + 0.2, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const types = ['sine', 'triangle', 'square', 'sawtooth'];
      tone(eng, out, { t, dur: o.decay, type: types[Math.round(o.wave)] || 'sine', f0: o.pitch, f1: o.pitch, peak: 0.7, attack: 0.002 });
    },
  },

  uiConfirm: {
    name: 'UI — confirm', group: 'Interface', dur: 0.6,
    params: {
      pitch: { min: 300, max: 1400, def: 660, step: 10, unit: 'Hz' },
      lift: { min: 1.05, max: 2.2, def: 1.5, step: 0.01 },
      level: lvl(0.45), send: send(0.22),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      tone(eng, out, { t, dur: 0.1, type: 'triangle', f0: o.pitch, peak: 0.6 });
      tone(eng, out, { t: t + 0.075, dur: 0.24, type: 'triangle', f0: o.pitch * o.lift, peak: 0.6 });
    },
  },

  uiError: {
    name: 'UI — error', group: 'Interface', dur: 0.6,
    params: {
      pitch: { min: 90, max: 500, def: 200, step: 5, unit: 'Hz' },
      buzz: { min: 0, max: 1, def: 0.5, step: 0.02 },
      level: lvl(0.45), send: send(0.15),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const lp = biquad(ctx, 'lowpass', 1400 + o.buzz * 3000, 1.4);
      lp.connect(out);
      tone(eng, lp, { t, dur: 0.14, type: 'square', f0: o.pitch * 1.3, f1: o.pitch * 1.28, peak: 0.5 });
      tone(eng, lp, { t: t + 0.13, dur: 0.28, type: 'square', f0: o.pitch, f1: o.pitch * 0.82, peak: 0.5 });
    },
  },

  pickupCoin: {
    name: 'Pickup — coin', group: 'Interface', dur: 0.7,
    params: {
      pitch: { min: 500, max: 2200, def: 1050, step: 10, unit: 'Hz' },
      ring: { min: 0.1, max: 0.9, def: 0.34, step: 0.02, unit: 's' },
      level: lvl(0.4), send: send(0.35),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, o.ring + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      tone(eng, out, { t, dur: 0.06, type: 'square', f0: o.pitch, peak: 0.4 });
      tone(eng, out, { t: t + 0.05, dur: o.ring, type: 'square', f0: o.pitch * 1.5, peak: 0.4 });
      tone(eng, out, { t: t + 0.05, dur: o.ring * 0.8, type: 'sine', f0: o.pitch * 3, peak: 0.14 });
    },
  },

  powerup: {
    name: 'Pickup — power-up', group: 'Interface', dur: 1.0,
    params: {
      steps: { min: 3, max: 10, def: 6, step: 1 },
      root: { min: 200, max: 900, def: 392, step: 5, unit: 'Hz' },
      rate: { min: 0.03, max: 0.16, def: 0.062, step: 0.002, unit: 's' },
      level: lvl(0.4), send: send(0.4),
    },
    play(eng, o) {
      const t = o.t, n = Math.round(o.steps);
      const out = eng.voice(t, n * o.rate + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      for (let i = 0; i < n; i++) {
        const f = o.root * Math.pow(2, scale[i % scale.length] / 12);
        tone(eng, out, { t: t + i * o.rate, dur: i === n - 1 ? 0.35 : 0.09, type: 'square', f0: f, peak: 0.35 });
      }
    },
  },

  laser: {
    name: 'Laser', group: 'Weapons', dur: 0.6,
    params: {
      pitch: { min: 300, max: 3000, def: 1400, step: 10, unit: 'Hz' },
      sweep: { min: 0.05, max: 1, def: 0.2, step: 0.01 },
      decay: { min: 0.05, max: 0.6, def: 0.22, step: 0.01, unit: 's' },
      level: lvl(0.5), send: send(0.3),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, o.decay + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      tone(eng, out, { t, dur: o.decay, type: 'sawtooth', f0: o.pitch, f1: o.pitch * o.sweep, peak: 0.5 });
      tone(eng, out, { t, dur: o.decay * 0.6, type: 'square', f0: o.pitch * 1.5, f1: o.pitch * o.sweep * 1.5, peak: 0.2 });
      noiseHit(eng, out, { t, dur: 0.03, type: 'highpass', f0: 4000, peak: 0.3 });
    },
  },

  zap: {
    name: 'Electric zap', group: 'Weapons', dur: 0.9,
    params: {
      density: { min: 5, max: 60, def: 26, step: 1 },
      pitch: { min: 200, max: 4000, def: 1600, step: 20, unit: 'Hz' },
      dur2: { min: 0.1, max: 1, def: 0.4, step: 0.02, unit: 's', label: 'length' },
      level: lvl(0.55), send: send(0.4),
    },
    play(eng, o) {
      const t = o.t, n = Math.round(o.density);
      const out = eng.voice(t, o.dur2 + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      for (let i = 0; i < n; i++) {
        const st = t + Math.random() * o.dur2;
        noiseHit(eng, out, { t: st, dur: rnd(0.006, 0.03), type: 'bandpass', f0: o.pitch * rnd(0.4, 2.2), q: 6, peak: rnd(0.15, 0.6) });
      }
      tone(eng, out, { t, dur: o.dur2, type: 'sawtooth', f0: o.pitch * 0.25, f1: o.pitch * 0.12, peak: 0.12 });
    },
  },

  footGrass: {
    name: 'Footstep — grass', group: 'Foley', dur: 0.35,
    params: {
      soft: { min: 0.2, max: 1, def: 0.7, step: 0.02 },
      pitch: { min: 800, max: 6000, def: 2600, step: 50, unit: 'Hz' },
      level: lvl(0.55), send: send(0.15),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      noiseHit(eng, out, { t, dur: 0.07 * o.soft + 0.03, type: 'bandpass', f0: o.pitch, f1: o.pitch * 0.5, q: 0.8, peak: 0.6, attack: 0.006 });
      noiseHit(eng, out, { t, dur: 0.05, type: 'lowpass', f0: 300, q: 0.8, peak: 0.35 * (1 - o.soft) + 0.15 });
    },
  },

  footGravel: {
    name: 'Footstep — gravel', group: 'Foley', dur: 0.4,
    params: {
      grains: { min: 2, max: 14, def: 6, step: 1 },
      pitch: { min: 1000, max: 8000, def: 3600, step: 50, unit: 'Hz' },
      level: lvl(0.55), send: send(0.15),
    },
    play(eng, o) {
      const t = o.t, n = Math.round(o.grains);
      const out = eng.voice(t, 0.35, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      noiseHit(eng, out, { t, dur: 0.06, type: 'lowpass', f0: 500, q: 0.7, peak: 0.4 });
      for (let i = 0; i < n; i++) {
        noiseHit(eng, out, { t: t + Math.random() * 0.09, dur: rnd(0.008, 0.03), type: 'bandpass', f0: o.pitch * rnd(0.6, 1.6), q: 3, peak: rnd(0.1, 0.4) });
      }
    },
  },

  footWood: {
    name: 'Footstep — wood', group: 'Foley', dur: 0.5,
    params: {
      pitch: { min: 80, max: 500, def: 190, step: 5, unit: 'Hz' },
      hollow: { min: 0, max: 1, def: 0.55, step: 0.02 },
      level: lvl(0.6), send: send(0.25),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      noiseHit(eng, out, { t, dur: 0.03, type: 'bandpass', f0: 2200, q: 1.2, peak: 0.45 });
      for (const [m, g] of [[1, 0.55], [2.6, 0.2]]) {
        const osc = ctx.createOscillator(); osc.type = 'triangle';
        osc.frequency.value = o.pitch * m;
        const a = ctx.createGain();
        perc(a.gain, t, g * (0.4 + o.hollow), 0.001, 0.09 + o.hollow * 0.14);
        chain([osc, a, out]);
        osc.start(t); osc.stop(t + 0.3);
      }
    },
  },

  waterSplash: {
    name: 'Water — splash', group: 'Water', dur: 1.6,
    params: {
      size: { min: 0.3, max: 2, def: 1, step: 0.05 },
      drops: { min: 0, max: 14, def: 6, step: 1 },
      level: lvl(0.7), send: send(0.4),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.size;
      const out = eng.voice(t, d + 0.9, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d * 0.55);
      const bp = biquad(ctx, 'bandpass', 900, 0.6);
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.exponentialRampToValueAtTime(4200, t + d * 0.2);
      bp.frequency.exponentialRampToValueAtTime(700, t + d * 0.55);
      const g = ctx.createGain();
      perc(g.gain, t, 0.8, 0.004, d * 0.5);
      chain([n, bp, g, out]);
      for (let i = 0; i < Math.round(o.drops); i++) {
        const st = t + 0.1 + Math.random() * d * 0.8;
        tone(eng, out, { t: st, dur: 0.05, f0: rnd(700, 1600), f1: rnd(1800, 3600), peak: rnd(0.05, 0.16), attack: 0.002 });
      }
    },
  },

  waterDrip: {
    name: 'Water — drip', group: 'Water', dur: 0.6,
    params: {
      pitch: { min: 400, max: 2000, def: 900, step: 10, unit: 'Hz' },
      rise: { min: 1.2, max: 5, def: 2.6, step: 0.05 },
      level: lvl(0.5), send: send(0.6),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      tone(eng, out, { t, dur: 0.09, f0: o.pitch, f1: o.pitch * o.rise, peak: 0.6, attack: 0.002 });
      noiseHit(eng, out, { t, dur: 0.02, type: 'bandpass', f0: o.pitch * 3, q: 4, peak: 0.2 });
    },
  },

  stream: {
    name: 'Water — stream', group: 'Water', dur: 2.6,
    params: {
      flow: { min: 0.2, max: 1, def: 0.6, step: 0.02 },
      bubbles: { min: 0, max: 40, def: 18, step: 1 },
      length: { min: 0.8, max: 4, def: 2.2, step: 0.1, unit: 's' },
      level: lvl(0.55), send: send(0.4),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.length;
      const out = eng.voice(t, d + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d);
      const hp = biquad(ctx, 'highpass', 700 + o.flow * 1400, 0.7);
      const lp = biquad(ctx, 'lowpass', 5500, 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35 * o.flow + 0.1, t + 0.25);
      g.gain.setValueAtTime(0.35 * o.flow + 0.1, t + d - 0.3);
      g.gain.linearRampToValueAtTime(0, t + d);
      chain([n, hp, lp, g, out]);
      for (let i = 0; i < Math.round(o.bubbles); i++) {
        const st = t + 0.1 + Math.random() * (d - 0.3);
        const f = rnd(600, 2200);
        tone(eng, out, { t: st, dur: 0.045, f0: f, f1: f * rnd(1.6, 3), peak: rnd(0.03, 0.11), attack: 0.002 });
      }
    },
  },

  fireCrackle: {
    name: 'Fire — crackle', group: 'Fire', dur: 2.8,
    params: {
      pops: { min: 4, max: 60, def: 26, step: 1 },
      bed: { min: 0, max: 1, def: 0.45, step: 0.02, label: 'roar' },
      length: { min: 0.8, max: 4, def: 2.4, step: 0.1, unit: 's' },
      level: lvl(0.65), send: send(0.35),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.length;
      const out = eng.voice(t, d + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d, 0.7);
      const lp = biquad(ctx, 'lowpass', 700, 0.6);
      const hp = biquad(ctx, 'highpass', 90, 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(o.bed * 0.5, t + 0.3);
      g.gain.setValueAtTime(o.bed * 0.5, t + d - 0.3);
      g.gain.linearRampToValueAtTime(0, t + d);
      chain([n, lp, hp, g, out]);
      for (let i = 0; i < Math.round(o.pops); i++) {
        const st = t + Math.random() * (d - 0.05);
        noiseHit(eng, out, { t: st, dur: rnd(0.005, 0.035), type: 'bandpass', f0: rnd(900, 5000), q: 4, peak: rnd(0.08, 0.45) });
      }
    },
  },

  ignite: {
    name: 'Fire — ignite', group: 'Fire', dur: 1.4,
    params: {
      length: { min: 0.3, max: 2, def: 0.8, step: 0.05, unit: 's' },
      thump: { min: 0, max: 1, def: 0.45, step: 0.02 },
      level: lvl(0.75), send: send(0.35),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.length;
      const out = eng.voice(t, d + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d);
      const bp = biquad(ctx, 'bandpass', 400, 0.7);
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.exponentialRampToValueAtTime(380, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.8, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      g.gain.linearRampToValueAtTime(0, t + d + 0.02);
      chain([n, bp, g, out]);
      if (o.thump > 0.02) tone(eng, out, { t, dur: 0.25, f0: 130, f1: 45, peak: o.thump * 0.6 });
    },
  },

  bird: {
    name: 'Animal — bird chirp', group: 'Animals', dur: 1.2,
    params: {
      syllables: { min: 1, max: 8, def: 4, step: 1 },
      pitch: { min: 1200, max: 5000, def: 2800, step: 50, unit: 'Hz' },
      warble: { min: 0.1, max: 2, def: 0.8, step: 0.05 },
      level: lvl(0.4), send: send(0.5),
    },
    play(eng, o) {
      const t = o.t, n = Math.round(o.syllables);
      const out = eng.voice(t, n * 0.11 + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      for (let i = 0; i < n; i++) {
        const st = t + i * rnd(0.07, 0.13);
        const f = o.pitch * rnd(0.85, 1.2);
        const osc = eng.ctx.createOscillator(); osc.type = 'sine';
        const d = rnd(0.035, 0.075);
        osc.frequency.setValueAtTime(f * 0.7, st);
        osc.frequency.exponentialRampToValueAtTime(f * (1 + o.warble * 0.5), st + d * 0.35);
        osc.frequency.exponentialRampToValueAtTime(f * (1 - o.warble * 0.25), st + d);
        const g = eng.ctx.createGain();
        perc(g.gain, st, 0.5, 0.006, d);
        chain([osc, g, out]);
        osc.start(st); osc.stop(st + d + 0.05);
      }
    },
  },

  growl: {
    name: 'Animal — growl', group: 'Animals', dur: 1.6,
    params: {
      pitch: { min: 40, max: 220, def: 78, step: 2, unit: 'Hz' },
      rasp: { min: 5, max: 60, def: 26, step: 1, unit: 'Hz' },
      length: { min: 0.3, max: 2, def: 1, step: 0.05, unit: 's' },
      level: lvl(0.6), send: send(0.3),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.length;
      const out = eng.voice(t, d + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const F1 = biquad(ctx, 'peaking', 420, 3, 12);
      const F2 = biquad(ctx, 'peaking', 1150, 3, 8);
      const lp = biquad(ctx, 'lowpass', 1500, 0.8);
      const amp = ctx.createGain();
      chain([F1, F2, lp, amp, out]);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(0.7, t + 0.08);
      amp.gain.setValueAtTime(0.7, t + d * 0.7);
      amp.gain.linearRampToValueAtTime(0, t + d);

      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(o.pitch * 1.15, t);
      osc.frequency.linearRampToValueAtTime(o.pitch * 0.85, t + d);
      const am = ctx.createOscillator(); am.type = 'sine'; am.frequency.value = o.rasp;
      const ag = ctx.createGain(); ag.gain.value = 0.45;
      const carrier = ctx.createGain(); carrier.gain.value = 0.55;
      am.connect(ag); ag.connect(carrier.gain);
      chain([osc, carrier, F1]);
      osc.start(t); osc.stop(t + d + 0.05);
      am.start(t); am.stop(t + d + 0.05);

      const n = eng.noiseSrc(t, d);
      const ng = ctx.createGain();
      perc(ng.gain, t, 0.12, 0.06, d);
      chain([n, ng, F1]);
    },
  },

  insect: {
    name: 'Animal — insect chitter', group: 'Animals', dur: 1.4,
    params: {
      rate: { min: 8, max: 60, def: 24, step: 1, unit: 'Hz' },
      pitch: { min: 1500, max: 8000, def: 4200, step: 100, unit: 'Hz' },
      length: { min: 0.2, max: 2, def: 0.9, step: 0.05, unit: 's' },
      level: lvl(0.35), send: send(0.3),
    },
    play(eng, o) {
      const t = o.t, d = o.length, n = Math.max(2, Math.round(d * o.rate));
      const out = eng.voice(t, d + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      for (let i = 0; i < n; i++) {
        const st = t + (i / n) * d;
        const env = Math.sin(Math.PI * (i / n));
        noiseHit(eng, out, { t: st, dur: 0.012, type: 'bandpass', f0: o.pitch * rnd(0.9, 1.1), q: 12, peak: 0.6 * env + 0.08 });
      }
    },
  },

  frog: {
    name: 'Animal — croak', group: 'Animals', dur: 1.4,
    params: {
      pitch: { min: 50, max: 260, def: 110, step: 2, unit: 'Hz' },
      croaks: { min: 1, max: 6, def: 2, step: 1 },
      length: { min: 0.08, max: 0.5, def: 0.19, step: 0.01, unit: 's' },
      level: lvl(0.55), send: send(0.35),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const total = Math.round(o.croaks) * (o.length + 0.09);
      const out = eng.voice(t, total + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      for (let c = 0; c < Math.round(o.croaks); c++) {
        const st = t + c * (o.length + 0.09);
        const osc = ctx.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(o.pitch * 1.1, st);
        osc.frequency.linearRampToValueAtTime(o.pitch * 0.9, st + o.length);
        const bp = biquad(ctx, 'bandpass', 500, 2.2);
        bp.frequency.setValueAtTime(380, st);
        bp.frequency.exponentialRampToValueAtTime(1050, st + o.length * 0.5);
        bp.frequency.exponentialRampToValueAtTime(420, st + o.length);
        const g = ctx.createGain();
        perc(g.gain, st, 0.75, 0.012, o.length);
        chain([osc, bp, g, out]);
        osc.start(st); osc.stop(st + o.length + 0.05);
      }
    },
  },

  thunder: {
    name: 'Thunder', group: 'Weather', dur: 3.6,
    params: {
      crack: { min: 0, max: 1, def: 0.5, step: 0.02 },
      length: { min: 1, max: 4, def: 2.6, step: 0.1, unit: 's' },
      level: lvl(0.9), send: send(0.7),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.length;
      const out = eng.voice(t, d + 0.8, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, d, 0.35);
      const lp = biquad(ctx, 'lowpass', 260, 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.9, t + 0.12);
      // rolling amplitude, so it doesn't read as a flat noise pad
      for (let i = 1; i <= 6; i++) g.gain.linearRampToValueAtTime(rnd(0.25, 0.85) * (1 - i / 7), t + (i / 6) * d);
      g.gain.linearRampToValueAtTime(0, t + d);
      chain([n, lp, g, out]);
      if (o.crack > 0.02) noiseHit(eng, out, { t, dur: 0.2, type: 'bandpass', f0: 2400, f1: 400, q: 0.8, peak: o.crack * 0.7 });
    },
  },

  alarm: {
    name: 'Alarm', group: 'Interface', dur: 1.8,
    params: {
      low: { min: 200, max: 900, def: 480, step: 10, unit: 'Hz' },
      high: { min: 300, max: 1600, def: 720, step: 10, unit: 'Hz' },
      beats: { min: 2, max: 10, def: 4, step: 1 },
      level: lvl(0.4), send: send(0.25),
    },
    play(eng, o) {
      const t = o.t, n = Math.round(o.beats), step = 0.19;
      const out = eng.voice(t, n * step + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const lp = biquad(eng.ctx, 'lowpass', 3000, 0.8);
      lp.connect(out);
      for (let i = 0; i < n; i++) {
        tone(eng, lp, { t: t + i * step, dur: step * 0.85, type: 'square', f0: i % 2 ? o.low : o.high, peak: 0.45, attack: 0.008 });
      }
    },
  },
};

export const SFX_IDS = Object.keys(SFX);

export function fire(eng, id, o = {}) {
  const s = SFX[id];
  if (!s) return;
  const opts = {};
  for (const k in s.params) opts[k] = s.params[k].def;
  Object.assign(opts, o);
  if (opts.t == null) opts.t = eng.ctx.currentTime + 0.02;
  s.play(eng, opts);
}
