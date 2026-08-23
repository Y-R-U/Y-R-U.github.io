// Aviation one-shots. Same play(eng, o) contract as the ported lab set.
//
// The gun is the one to get right and the easiest to get wrong. A synchronised Vickers .303 fires
// about 500 rounds a minute — 8 a second — so you hear individual reports, not a modern buzzsaw,
// and what carries is the mechanical clatter of the gear and breech as much as the crack. Slow it
// down, keep the bass thin, put a hard clack after every round, and it stops sounding like 1944.

import { perc, biquad, chain, shaper, rnd } from './core.js';
import { noiseHit, tone } from './sfx.js';

const lvl = (def = 0.8) => ({ min: 0, max: 1.4, def, step: 0.02, label: 'level' });
const send = (def = 0.2) => ({ min: 0, max: 1, def, step: 0.02, label: 'reverb' });
const dist = (def = 0.15) => ({ min: 0, max: 1, def, step: 0.02, label: 'distance' });

// distance costs you the top end and the transient before it costs you the level
function far(eng, out, d) {
  const f = biquad(eng.ctx, 'lowpass', 20000 * Math.exp(-d * 2.4) + 500, 0.7);
  f.connect(out);
  return f;
}

function round(eng, out, { t, crack, body, thump, clack, bright }) {
  noiseHit(eng, out, { t, dur: 0.016, type: 'highpass', f0: 2600 * bright, q: 0.7, peak: crack });
  noiseHit(eng, out, { t: t + 0.002, dur: 0.07, type: 'bandpass', f0: 1100 * bright, f1: 380, q: 0.9, peak: body });
  tone(eng, out, { t, dur: 0.06, type: 'triangle', f0: 210, f1: 78, peak: thump });
  // the gear and the breech: this is the half that makes it period
  noiseHit(eng, out, { t: t + 0.014, dur: 0.02, type: 'bandpass', f0: rnd(2600, 4200), q: 3.5, peak: clack });
  noiseHit(eng, out, { t: t + 0.03, dur: 0.035, type: 'bandpass', f0: rnd(700, 1500), q: 2.2, peak: clack * 0.5 });
}

function gun(defaults) {
  return {
    group: 'Aviation — guns', dur: 2.2,
    params: {
      rounds: { min: 1, max: 40, def: defaults.rounds, step: 1 },
      rate:   { min: 250, max: 800, def: defaults.rate, step: 10, unit: 'rpm' },
      bright: { min: 0.5, max: 1.6, def: defaults.bright, step: 0.02 },
      twin:   { min: 0, max: 1, def: defaults.twin, step: 0.02, label: 'second gun' },
      dist:   dist(0.12),
      level:  lvl(defaults.level), send: send(0.28),
    },
    play(eng, o) {
      const t = o.t, n = Math.round(o.rounds), gap = 60 / o.rate;
      const total = n * gap + 0.5;
      const out = eng.voice(t, total, o.send * (0.4 + o.dist));
      out.gain.value = o.level * (o.vel ?? 1);
      const bus = far(eng, out, o.dist);
      const sh = shaper(eng.ctx, 2.4); sh.connect(bus);
      const near = 1 - 0.55 * o.dist;
      for (let i = 0; i < n; i++) {
        // the interrupter gear is not a metronome; the jitter is why a burst reads as mechanical
        const st = t + i * gap + rnd(-0.004, 0.004);
        round(eng, sh, { t: st, crack: 0.85 * near, body: 0.5 * near, thump: 0.30 * near, clack: 0.42, bright: o.bright });
        if (o.twin > 0.02) {
          round(eng, sh, { t: st + 0.009 + rnd(0, 0.005), crack: 0.7 * near * o.twin, body: 0.4 * near * o.twin,
            thump: 0.22 * near * o.twin, clack: 0.36 * o.twin, bright: o.bright * 0.96 });
        }
      }
    },
  };
}

export const AVIATION = {

  vickers: Object.assign(gun({ rounds: 9, rate: 500, bright: 1, twin: 0.8, level: 0.85 }),
    { name: 'Vickers .303 — synchronised' }),

  spandau: Object.assign(gun({ rounds: 11, rate: 450, bright: 0.86, twin: 0.9, level: 0.85 }),
    { name: 'Spandau LMG 08/15' }),

  ricochet: {
    name: 'Ricochet', group: 'Aviation — guns', dur: 1.4,
    params: {
      count: { min: 1, max: 6, def: 2, step: 1 },
      pitch: { min: 400, max: 3000, def: 1500, step: 20, unit: 'Hz' },
      whine: { min: 0, max: 1, def: 0.7, step: 0.02 },
      level: lvl(0.7), send: send(0.5),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, 1.1, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      for (let i = 0, n = Math.round(o.count); i < n; i++) {
        const st = t + i * rnd(0.02, 0.09);
        noiseHit(eng, out, { t: st, dur: 0.02, type: 'highpass', f0: 3000, q: 0.8, peak: 0.6 });
        // the zing is a sine falling away with vibrato on it
        const osc = ctx.createOscillator(); osc.type = 'sine';
        const f0 = o.pitch * rnd(0.7, 1.4);
        osc.frequency.setValueAtTime(f0, st);
        osc.frequency.exponentialRampToValueAtTime(Math.max(60, f0 * 0.22), st + 0.55);
        const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = rnd(18, 34);
        const vg = ctx.createGain(); vg.gain.value = 45 * o.whine;
        chain([vib, vg]); vg.connect(osc.detune);
        const g = ctx.createGain();
        perc(g.gain, st, 0.42 * o.whine, 0.006, 0.5);
        chain([osc, g, out]);
        osc.start(st); osc.stop(st + 0.62);
        vib.start(st); vib.stop(st + 0.62);
      }
    },
  },

  flakCrump: {
    name: 'Flak — crump', group: 'Aviation — flak', dur: 3.4,
    params: {
      dist:     { min: 0, max: 1, def: 0.35, step: 0.02, label: 'distance' },
      size:     { min: 0.4, max: 2, def: 1, step: 0.05 },
      shrapnel: { min: 0, max: 1, def: 0.6, step: 0.02 },
      whistle:  { min: 0, max: 1, def: 0.4, step: 0.02, label: 'incoming' },
      level:    lvl(1), send: send(0.6),
    },
    play(eng, o) {
      const { ctx } = eng, d = o.size;
      const lead = o.whistle > 0.03 ? 0.45 + 0.5 * o.whistle : 0;
      const t = o.t + lead;
      const out = eng.voice(o.t, lead + d * 2 + 1.2, o.send * (0.35 + 0.65 * o.dist));
      out.gain.value = o.level * (o.vel ?? 1);
      const bus = far(eng, out, o.dist * 0.8);

      if (lead > 0) {
        tone(eng, out, { t: o.t, dur: lead, type: 'sine', f0: 1500, f1: 420, peak: 0.10 * o.whistle, attack: 0.15 });
      }

      // a crump is not a crack: the leading edge is smeared, the body is woolly, and what is sharp
      // about it is the shell casing rather than the charge
      noiseHit(eng, bus, { t, dur: 0.10, type: 'bandpass', f0: 900, f1: 260, q: 0.8, peak: 0.55, attack: 0.012 });
      noiseHit(eng, bus, { t: t + 0.01, dur: d * 0.9, type: 'lowpass', f0: 420, f1: 70, q: 0.7, peak: 0.85, attack: 0.03 });
      tone(eng, bus, { t, dur: d * 1.1, type: 'sine', f0: 130, f1: 38, peak: 0.75, attack: 0.02 });
      tone(eng, bus, { t: t + 0.006, dur: d * 0.5, type: 'triangle', f0: 240, f1: 62, peak: 0.3, attack: 0.01 });

      // black smoke sitting in the air after it — the reason flak reads as flak
      noiseHit(eng, out, { t: t + 0.05, dur: d * 1.8, type: 'lowpass', f0: 240, f1: 60, q: 0.5, peak: 0.16, attack: 0.12 });

      const n = Math.round(6 + 22 * o.shrapnel);
      for (let i = 0; i < n; i++) {
        const st = t + 0.03 + Math.random() * (0.5 + d * 0.6);
        noiseHit(eng, out, { t: st, dur: rnd(0.012, 0.05), type: 'bandpass',
          f0: rnd(1400, 5200), q: 4, peak: rnd(0.03, 0.16) * o.shrapnel * (1 - 0.6 * o.dist) });
      }
      // one or two pieces that actually hit something
      for (let i = 0; i < 2 && o.shrapnel > 0.4; i++) {
        const st = t + rnd(0.08, 0.5);
        tone(eng, out, { t: st, dur: 0.22, type: 'sine', f0: rnd(1800, 3200), f1: 500, peak: 0.10 * o.shrapnel });
      }
    },
  },

  canopySnap: {
    name: 'Canopy — deploy snap', group: 'Aviation — crates', dur: 2.4,
    params: {
      size:  { min: 0.5, max: 1.8, def: 1, step: 0.05 },
      crack: { min: 0, max: 1, def: 0.7, step: 0.02 },
      level: lvl(0.9), send: send(0.4),
    },
    play(eng, o) {
      const t = o.t, d = o.size;
      const out = eng.voice(t, d * 1.6 + 0.6, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      // silk going taut all at once, then the canopy holding air
      noiseHit(eng, out, { t, dur: 0.05, type: 'bandpass', f0: 1800, f1: 700, q: 1.1, peak: o.crack });
      noiseHit(eng, out, { t: t + 0.004, dur: 0.13, type: 'highpass', f0: 2400, q: 0.6, peak: o.crack * 0.5 });
      tone(eng, out, { t, dur: 0.16, type: 'triangle', f0: 150, f1: 55, peak: 0.32 });
      noiseHit(eng, out, { t: t + 0.02, dur: d * 0.9, type: 'lowpass', f0: 700, f1: 170, q: 0.6, peak: 0.4, attack: 0.09 });
      for (let i = 0; i < 7; i++) {
        noiseHit(eng, out, { t: t + 0.06 + Math.random() * d * 0.8, dur: rnd(0.03, 0.09),
          type: 'bandpass', f0: rnd(900, 3600), q: 1.8, peak: rnd(0.04, 0.13) });
      }
    },
  },

  crateCatch: {
    name: 'Crate — caught', group: 'Aviation — crates', dur: 1.8,
    params: {
      weight: { min: 0.4, max: 1.8, def: 1, step: 0.05 },
      rope:   { min: 0, max: 1, def: 0.6, step: 0.02, label: 'rigging twang' },
      level:  lvl(0.9), send: send(0.3),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, w = o.weight;
      const out = eng.voice(t, 1.2, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      tone(eng, out, { t, dur: 0.14 * w, type: 'sine', f0: 190 / w, f1: 60 / w, peak: 0.7 });
      noiseHit(eng, out, { t, dur: 0.09, type: 'lowpass', f0: 900, f1: 200, q: 0.9, peak: 0.5 });
      noiseHit(eng, out, { t: t + 0.03, dur: 0.05, type: 'bandpass', f0: 2200, q: 3, peak: 0.22 });
      if (o.rope > 0.03) {
        const b = eng.ks(170 * (1 / w), 0.7, { t60: 0.35, damp: 0.42, tone: 0.5 });
        const s = ctx.createBufferSource(); s.buffer = b;
        const g = ctx.createGain(); g.gain.value = 0.5 * o.rope;
        chain([s, g, out]); s.start(t + 0.02);
      }
      // strap and slat rattle settling
      for (let i = 0; i < 5; i++) {
        noiseHit(eng, out, { t: t + 0.05 + Math.random() * 0.35, dur: rnd(0.01, 0.03),
          type: 'bandpass', f0: rnd(700, 2600), q: 4, peak: rnd(0.03, 0.1) });
      }
    },
  },

  wingShear: {
    name: 'Wing shear', group: 'Aviation — damage', dur: 2.8,
    params: {
      size:  { min: 0.5, max: 1.8, def: 1, step: 0.05 },
      tear:  { min: 0, max: 1, def: 0.7, step: 0.02, label: 'fabric tear' },
      wire:  { min: 0, max: 1, def: 0.8, step: 0.02, label: 'wire part' },
      level: lvl(1), send: send(0.45),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, d = o.size;
      const out = eng.voice(t, d * 1.6 + 0.8, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const sh = shaper(ctx, 4); sh.connect(out);

      // spruce spar going: several hard splinters, not one crack
      for (let i = 0; i < 6; i++) {
        const st = t + i * rnd(0.01, 0.06);
        noiseHit(eng, sh, { t: st, dur: rnd(0.02, 0.06), type: 'bandpass',
          f0: rnd(700, 2600), q: 2.4, peak: rnd(0.3, 0.75) });
      }
      tone(eng, sh, { t, dur: 0.3 * d, type: 'triangle', f0: 120, f1: 42, peak: 0.55 });
      // doped linen letting go
      noiseHit(eng, out, { t: t + 0.05, dur: 0.45 * d, type: 'bandpass', f0: 3400, f1: 800, q: 0.9, peak: 0.5 * o.tear, attack: 0.01 });
      if (o.wire > 0.03) {
        const b = eng.ks(rnd(360, 620), 0.9, { t60: 0.5, damp: 0.28, tone: 0.75 });
        const s = ctx.createBufferSource(); s.buffer = b;
        const g = ctx.createGain(); g.gain.value = 0.55 * o.wire;
        chain([s, g, out]); s.start(t + rnd(0.02, 0.12));
      }
      // the rest of it flapping and going away
      noiseHit(eng, out, { t: t + 0.12, dur: d * 1.2, type: 'lowpass', f0: 1200, f1: 260, q: 0.6, peak: 0.24, attack: 0.1 });
    },
  },

  wireSnap: {
    name: 'Bracing wire — parts', group: 'Aviation — damage', dur: 1.6,
    params: {
      pitch: { min: 200, max: 1200, def: 520, step: 10, unit: 'Hz' },
      ring:  { min: 0.1, max: 1.2, def: 0.6, step: 0.02, unit: 's' },
      level: lvl(0.8), send: send(0.45),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.ring + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      noiseHit(eng, out, { t, dur: 0.014, type: 'highpass', f0: 3200, q: 0.7, peak: 0.5 });
      const b = eng.ks(o.pitch, o.ring + 0.3, { t60: o.ring, damp: 0.22, tone: 0.85 });
      const s = ctx.createBufferSource(); s.buffer = b;
      const f = biquad(ctx, 'highpass', 220, 0.7);
      const g = ctx.createGain(); g.gain.value = 0.85;
      chain([s, f, g, out]); s.start(t);
    },
  },

  gearTouchdown: {
    name: 'Gear — touchdown', group: 'Aviation — ground', dur: 1.6,
    params: {
      speed:   { min: 0, max: 1, def: 0.5, step: 0.02 },
      surface: { min: 0, max: 1, def: 0.4, step: 0.02, label: 'grass … gravel' },
      level:   lvl(0.85), send: send(0.25),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, 1.0, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      // strut taking the weight, then the tyre biting
      tone(eng, out, { t, dur: 0.16, type: 'sine', f0: 130, f1: 45, peak: 0.6 });
      noiseHit(eng, out, { t, dur: 0.10 + 0.14 * o.speed, type: 'bandpass',
        f0: 900 + 900 * o.surface, f1: 300, q: 1.1, peak: 0.35 + 0.35 * o.speed });
      noiseHit(eng, out, { t: t + 0.03, dur: 0.35, type: 'lowpass', f0: 500, f1: 140, q: 0.7, peak: 0.3, attack: 0.03 });
      for (let i = 0; i < 6; i++) {
        noiseHit(eng, out, { t: t + 0.04 + Math.random() * 0.4, dur: rnd(0.012, 0.04),
          type: 'bandpass', f0: rnd(600, 2400), q: 3, peak: rnd(0.03, 0.12) * (0.3 + o.surface) });
      }
    },
  },

  propStop: {
    name: 'Prop — stopping', group: 'Aviation — engine', dur: 3.6,
    params: {
      from:  { min: 4, max: 26, def: 15, step: 0.5, unit: 'rev/s' },
      drag:  { min: 0.3, max: 2, def: 1, step: 0.05 },
      strike: { min: 0, max: 1, def: 0.5, step: 0.02, label: 'blade strike' },
      level: lvl(0.9), send: send(0.35),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, 3.0, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      // blade passes spacing out as the prop loses it, which is the whole sound
      let at = t, rev = o.from, i = 0;
      while (rev > 0.5 && at < t + 2.6 && i < 200) {
        const amp = Math.min(1, rev / o.from) * 0.5;
        noiseHit(eng, out, { t: at, dur: 0.05, type: 'bandpass', f0: 220 + rev * 22, q: 1.4, peak: amp });
        tone(eng, out, { t: at, dur: 0.06, type: 'sine', f0: 90 + rev * 5, f1: 55, peak: amp * 0.5 });
        at += 1 / (rev * 2);
        rev *= Math.pow(0.86, o.drag);
        i++;
      }
      if (o.strike > 0.03) {
        noiseHit(eng, out, { t: at, dur: 0.05, type: 'bandpass', f0: 1500, f1: 500, q: 1.6, peak: 0.7 * o.strike });
        tone(eng, out, { t: at, dur: 0.18, type: 'triangle', f0: 190, f1: 60, peak: 0.5 * o.strike });
      }
    },
  },

  engineCough: {
    name: 'Engine — cough', group: 'Aviation — engine', dur: 2.2,
    params: {
      rev:   { min: 4, max: 24, def: 13, step: 0.5, unit: 'rev/s' },
      fires: { min: 1, max: 8, def: 3, step: 1, label: 'catches' },
      level: lvl(0.9), send: send(0.2),
    },
    play(eng, o) {
      const t = o.t;
      const out = eng.voice(t, 1.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const fire = o.rev * 4.5;
      let at = t;
      for (let i = 0, n = Math.round(o.fires); i < n; i++) {
        const amp = 0.55 * (1 - i / (n + 1));
        tone(eng, out, { t: at, dur: 0.07, type: 'sawtooth', f0: fire * rnd(0.85, 1.1), f1: fire * 0.5, peak: amp });
        noiseHit(eng, out, { t: at, dur: 0.12, type: 'lowpass', f0: 1300, f1: 260, q: 0.8, peak: amp * 0.8 });
        at += rnd(0.09, 0.3);
      }
      // unburnt mixture going out of the exhaust
      noiseHit(eng, out, { t: t + 0.05, dur: 0.6, type: 'lowpass', f0: 500, f1: 120, q: 0.6, peak: 0.16, attack: 0.06 });
    },
  },

  engineRestart: {
    name: 'Engine — restart', group: 'Aviation — engine', dur: 3.4,
    params: {
      windmill: { min: 0, max: 1, def: 0.6, step: 0.02 },
      catchAt:  { min: 0.2, max: 1.6, def: 0.7, step: 0.05, unit: 's' },
      rev:      { min: 8, max: 24, def: 18, step: 0.5, unit: 'rev/s' },
      level:    lvl(0.95), send: send(0.15),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, 2.8, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      // prop windmilling, then the mixture catching, then it settles into the sustained rotary
      noiseHit(eng, out, { t, dur: o.catchAt + 0.2, type: 'lowpass', f0: 500, f1: 1200, q: 0.7, peak: 0.3 * o.windmill, attack: 0.1 });
      let at = t + o.catchAt * rnd(0.5, 0.8);
      for (let i = 0; i < 3; i++) {
        tone(eng, out, { t: at, dur: 0.06, type: 'sawtooth', f0: o.rev * 2.6, f1: o.rev * 1.6, peak: 0.4 });
        noiseHit(eng, out, { t: at, dur: 0.1, type: 'lowpass', f0: 1200, f1: 240, q: 0.8, peak: 0.4 });
        at += rnd(0.07, 0.16);
      }
      const st = t + o.catchAt;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(o.rev * 2.2, st);
      osc.frequency.exponentialRampToValueAtTime(o.rev * 4.5, st + 0.9);
      const f = biquad(ctx, 'lowpass', 2400, 1.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.5, st + 0.25);
      g.gain.setValueAtTime(0.5, st + 1.1);
      g.gain.linearRampToValueAtTime(0.0001, st + 1.6);
      const sh = shaper(ctx, 3);
      chain([osc, f, sh, g, out]);
      osc.start(st); osc.stop(st + 1.7);
      noiseHit(eng, out, { t: st, dur: 1.5, type: 'bandpass', f0: 700, f1: 900, q: 0.6, peak: 0.28, attack: 0.15 });
    },
  },

};

export const AVIATION_IDS = Object.keys(AVIATION);
