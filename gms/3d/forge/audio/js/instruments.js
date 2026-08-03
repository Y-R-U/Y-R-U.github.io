// Synth voices. Every play(eng, o) schedules onto eng.ctx's clock at o.t and never
// touches the wall clock, so the same call renders offline for verification.

import { perc, adsr, biquad, chain, shaper, rnd, freqOf } from './core.js';

const send = (def = 0.25) => ({ min: 0, max: 1, def, step: 0.02, label: 'reverb' });
const lvl = (def = 0.9) => ({ min: 0, max: 1.4, def, step: 0.02, label: 'level' });

export function defaultsOf(inst) {
  const o = {};
  for (const k in inst.params) o[k] = inst.params[k].def;
  return o;
}

export const INSTRUMENTS = {

  kick: {
    name: 'Kick', group: 'Drums', pitched: false, note: 'C2',
    params: {
      tune: { min: 30, max: 90, def: 49, step: 1, unit: 'Hz' },
      punch: { min: 90, max: 700, def: 240, step: 5, unit: 'Hz' },
      sweep: { min: 0.01, max: 0.16, def: 0.05, step: 0.005, unit: 's' },
      decay: { min: 0.1, max: 1.4, def: 0.6, step: 0.02, unit: 's' },
      click: { min: 0, max: 1, def: 0.35, step: 0.02 },
      drive: { min: 0, max: 1, def: 0.45, step: 0.02 },
      level: lvl(1), send: send(0.06),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, v = o.vel ?? 1;
      const out = eng.voice(t, o.decay + 0.2, o.send);
      out.gain.value = o.level * v;
      const sh = shaper(ctx, 1 + o.drive * 7);
      sh.connect(out);

      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(o.punch, t);
      osc.frequency.exponentialRampToValueAtTime(o.tune, t + o.sweep);
      const a = ctx.createGain();
      perc(a.gain, t, 1, 0.004, o.decay);
      chain([osc, a, sh]);
      osc.start(t); osc.stop(t + o.decay + 0.1);

      const sub = ctx.createOscillator(); sub.type = 'sine';
      sub.frequency.value = o.tune * 0.5;
      const sg = ctx.createGain();
      perc(sg.gain, t, 0.32, 0.01, o.decay * 1.3);
      chain([sub, sg, out]);
      sub.start(t); sub.stop(t + o.decay * 1.3 + 0.1);

      if (o.click > 0.01) {
        const n = eng.noiseSrc(t, 0.03);
        const f = biquad(ctx, 'highpass', 1400, 0.7);
        const g = ctx.createGain();
        perc(g.gain, t, o.click * 0.5, 0.001, 0.018);
        chain([n, f, g, sh]);
      }
    },
  },

  snare: {
    name: 'Snare', group: 'Drums', pitched: false, note: 'D2',
    params: {
      tune: { min: 120, max: 320, def: 185, step: 5, unit: 'Hz' },
      body: { min: 0, max: 1, def: 0.5, step: 0.02 },
      snap: { min: 0, max: 1, def: 0.75, step: 0.02 },
      tone: { min: 700, max: 6000, def: 2000, step: 50, unit: 'Hz' },
      decay: { min: 0.06, max: 0.6, def: 0.2, step: 0.01, unit: 's' },
      level: lvl(0.85), send: send(0.3),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.decay + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);

      const n = eng.noiseSrc(t, o.decay + 0.1);
      const bp = biquad(ctx, 'bandpass', o.tone, 0.55);
      const hp = biquad(ctx, 'highpass', 480, 0.7);
      const ng = ctx.createGain();
      perc(ng.gain, t, o.snap * 0.9, 0.001, o.decay);
      chain([n, bp, hp, ng, out]);

      for (const [m, g, d] of [[1, 0.7, 0.9], [1.62, 0.4, 0.6]]) {
        const osc = ctx.createOscillator(); osc.type = 'triangle';
        osc.frequency.setValueAtTime(o.tune * m * 1.25, t);
        osc.frequency.exponentialRampToValueAtTime(o.tune * m, t + 0.03);
        const a = ctx.createGain();
        perc(a.gain, t, o.body * g, 0.002, o.decay * d * 0.55);
        chain([osc, a, out]);
        osc.start(t); osc.stop(t + o.decay + 0.05);
      }
    },
  },

  hat: {
    name: 'Hi-hat', group: 'Drums', pitched: false, note: 'F#2',
    params: {
      open: { min: 0.02, max: 0.7, def: 0.055, step: 0.005, unit: 's' },
      tone: { min: 3000, max: 12000, def: 7200, step: 100, unit: 'Hz' },
      metal: { min: 0, max: 1, def: 0.45, step: 0.02 },
      level: lvl(0.42), send: send(0.14),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.open + 0.2, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const n = eng.noiseSrc(t, o.open + 0.08);
      const hp = biquad(ctx, 'highpass', o.tone, 0.6);
      const pk = biquad(ctx, 'peaking', 10500, 2.2, o.metal * 12);
      const g = ctx.createGain();
      perc(g.gain, t, 0.8, 0.001, o.open);
      chain([n, hp, pk, g, out]);
    },
  },

  clap: {
    name: 'Clap', group: 'Drums', pitched: false, note: 'D#2',
    params: {
      spread: { min: 0.004, max: 0.03, def: 0.011, step: 0.001, unit: 's' },
      tone: { min: 700, max: 3500, def: 1500, step: 50, unit: 'Hz' },
      tail: { min: 0.05, max: 0.5, def: 0.19, step: 0.01, unit: 's' },
      level: lvl(0.7), send: send(0.32),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t;
      const out = eng.voice(t, o.tail + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const bp = biquad(ctx, 'bandpass', o.tone, 0.9);
      bp.connect(out);
      for (let i = 0; i < 3; i++) {
        const st = t + i * o.spread;
        const n = eng.noiseSrc(st, 0.02);
        const g = ctx.createGain();
        perc(g.gain, st, 0.8 - i * 0.14, 0.0008, 0.014);
        chain([n, g, bp]);
      }
      const n = eng.noiseSrc(t + o.spread * 3, o.tail);
      const g = ctx.createGain();
      perc(g.gain, t + o.spread * 3, 0.55, 0.002, o.tail);
      chain([n, g, bp]);
    },
  },

  tom: {
    name: 'Tom', group: 'Drums', pitched: true, note: 'A2',
    params: {
      bend: { min: 1, max: 2.4, def: 1.5, step: 0.05 },
      decay: { min: 0.15, max: 1.2, def: 0.45, step: 0.02, unit: 's' },
      skin: { min: 0, max: 1, def: 0.3, step: 0.02 },
      level: lvl(0.8), send: send(0.28),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq;
      const out = eng.voice(t, o.decay + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(f * o.bend, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + o.decay * 0.5);
      const a = ctx.createGain();
      perc(a.gain, t, 0.9, 0.003, o.decay);
      chain([osc, a, out]);
      osc.start(t); osc.stop(t + o.decay + 0.1);
      if (o.skin > 0.01) {
        const n = eng.noiseSrc(t, 0.06);
        const bp = biquad(ctx, 'bandpass', f * 6, 0.8);
        const g = ctx.createGain();
        perc(g.gain, t, o.skin * 0.4, 0.001, 0.05);
        chain([n, bp, g, out]);
      }
    },
  },

  timpani: {
    name: 'Timpani', group: 'Drums', pitched: true, note: 'D2',
    params: {
      decay: { min: 0.5, max: 4, def: 1.8, step: 0.1, unit: 's' },
      strike: { min: 0, max: 1, def: 0.35, step: 0.02 },
      bend: { min: 1, max: 1.4, def: 1.12, step: 0.01 },
      level: lvl(0.85), send: send(0.5),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq;
      const out = eng.voice(t, o.decay + 0.5, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      // kettle partials are roughly harmonic-ish above the fundamental
      for (const [m, g, d] of [[1, 1, 1], [1.5, 0.3, 0.7], [2.0, 0.16, 0.5], [2.44, 0.09, 0.35]]) {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(f * m * o.bend, t);
        osc.frequency.exponentialRampToValueAtTime(f * m, t + 0.12);
        const a = ctx.createGain();
        perc(a.gain, t, 0.55 * g, 0.004, o.decay * d);
        chain([osc, a, out]);
        osc.start(t); osc.stop(t + o.decay * d + 0.1);
      }
      const n = eng.noiseSrc(t, 0.08);
      const bp = biquad(ctx, 'bandpass', 900, 0.7);
      const g = ctx.createGain();
      perc(g.gain, t, o.strike * 0.5, 0.001, 0.06);
      chain([n, bp, g, out]);
    },
  },

  bassSynth: {
    name: 'Bass (synth)', group: 'Bass', pitched: true, note: 'E1',
    params: {
      cutoff: { min: 200, max: 4000, def: 950, step: 25, unit: 'Hz' },
      reso: { min: 0.5, max: 18, def: 7, step: 0.5, label: 'Q' },
      envAmt: { min: 0, max: 4, def: 2.2, step: 0.1, label: 'filter env' },
      envTime: { min: 0.03, max: 0.6, def: 0.14, step: 0.01, unit: 's', label: 'env time' },
      sub: { min: 0, max: 1, def: 0.45, step: 0.02 },
      drive: { min: 0, max: 1, def: 0.35, step: 0.02 },
      level: lvl(0.6), send: send(0.05),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq, dur = Math.max(0.06, o.dur);
      const rel = 0.09;
      const out = eng.voice(t, dur + rel + 0.2, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const sh = shaper(ctx, 1 + o.drive * 6);
      const lp = biquad(ctx, 'lowpass', o.cutoff, o.reso);
      const amp = ctx.createGain(); amp.gain.value = 0;
      chain([lp, sh, amp, out]);

      const top = Math.min(12000, o.cutoff * (1 + o.envAmt));
      lp.frequency.setValueAtTime(top, t);
      lp.frequency.exponentialRampToValueAtTime(Math.max(60, o.cutoff), t + o.envTime);

      for (const [type, det, g] of [['sawtooth', -7, 0.5], ['square', 7, 0.32]]) {
        const osc = ctx.createOscillator();
        osc.type = type; osc.frequency.value = f; osc.detune.value = det;
        const vg = ctx.createGain(); vg.gain.value = g;
        chain([osc, vg, lp]);
        osc.start(t); osc.stop(t + dur + rel + 0.05);
      }
      if (o.sub > 0.01) {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = f * 0.5;
        const vg = ctx.createGain(); vg.gain.value = o.sub * 0.7;
        chain([osc, vg, amp]);
        osc.start(t); osc.stop(t + dur + rel + 0.05);
      }
      adsr(amp.gain, t, 1, 0.006, 0.09, 0.78, dur, rel);
    },
  },

  bassGuitar: {
    name: 'Bass guitar (KS)', group: 'Bass', pitched: true, note: 'E1',
    params: {
      sustain: { min: 0.4, max: 6, def: 2.6, step: 0.1, unit: 's', label: 'T60' },
      damp: { min: 0.1, max: 0.9, def: 0.36, step: 0.02 },
      pick: { min: 0.05, max: 1, def: 0.5, step: 0.02, label: 'pick tone' },
      body: { min: 300, max: 4000, def: 1500, step: 50, unit: 'Hz', label: 'lowpass' },
      sub: { min: 0, max: 1, def: 0.35, step: 0.02 },
      drive: { min: 0, max: 1, def: 0.3, step: 0.02 },
      level: lvl(0.85), send: send(0.05),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq;
      const len = Math.min(6, Math.max(o.dur + 0.35, 0.5));
      const out = eng.voice(t, len + 0.2, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const buf = eng.ks(f, len, { t60: o.sustain, damp: o.damp, tone: o.pick });
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lp = biquad(ctx, 'lowpass', o.body, 0.8);
      const pk = biquad(ctx, 'peaking', 110, 1.2, 5);
      const sh = shaper(ctx, 1 + o.drive * 5);
      const amp = ctx.createGain(); amp.gain.value = 0;
      chain([src, lp, pk, sh, amp, out]);
      // notes are damped when the next one lands, not left ringing
      adsr(amp.gain, t, 1.4, 0.002, 0.02, 1, Math.max(0.05, o.dur), 0.16);
      src.start(t); src.stop(t + len + 0.05);

      if (o.sub > 0.01) {
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain();
        perc(g.gain, t, o.sub * 0.5, 0.006, Math.min(0.9, o.dur + 0.15));
        chain([osc, g, out]);
        osc.start(t); osc.stop(t + Math.min(0.9, o.dur + 0.15) + 0.05);
      }
    },
  },

  guitar: {
    name: 'Classical guitar', group: 'Plucked', pitched: true, note: 'E3',
    params: {
      sustain: { min: 0.3, max: 5, def: 1.9, step: 0.1, unit: 's', label: 'T60' },
      damp: { min: 0.1, max: 0.9, def: 0.44, step: 0.02 },
      pick: { min: 0.05, max: 1, def: 0.5, step: 0.02, label: 'nail tone' },
      body: { min: 0, max: 14, def: 7, step: 0.5, label: 'body dB' },
      bright: { min: 1500, max: 9000, def: 4600, step: 100, unit: 'Hz' },
      level: lvl(0.85), send: send(0.3),
    },
    play(eng, o) { pluck(eng, o, { r1: 100, r2: 205, r3: 400, hp: 75 }); },
  },

  harp: {
    name: 'Harp', group: 'Plucked', pitched: true, note: 'C4',
    params: {
      sustain: { min: 0.5, max: 7, def: 3.2, step: 0.1, unit: 's', label: 'T60' },
      damp: { min: 0.1, max: 0.9, def: 0.3, step: 0.02 },
      pick: { min: 0.05, max: 1, def: 0.35, step: 0.02, label: 'nail tone' },
      body: { min: 0, max: 14, def: 5, step: 0.5, label: 'body dB' },
      bright: { min: 1500, max: 12000, def: 6500, step: 100, unit: 'Hz' },
      level: lvl(0.8), send: send(0.42),
    },
    play(eng, o) { pluck(eng, o, { r1: 130, r2: 320, r3: 900, hp: 90 }); },
  },

  harpsichord: {
    name: 'Harpsichord', group: 'Plucked', pitched: true, note: 'C4',
    params: {
      sustain: { min: 0.2, max: 3, def: 1, step: 0.05, unit: 's', label: 'T60' },
      damp: { min: 0.1, max: 0.9, def: 0.62, step: 0.02 },
      pick: { min: 0.05, max: 1, def: 0.92, step: 0.02, label: 'quill tone' },
      body: { min: 0, max: 14, def: 4, step: 0.5, label: 'body dB' },
      bright: { min: 1500, max: 12000, def: 8000, step: 100, unit: 'Hz' },
      level: lvl(0.6), send: send(0.3),
    },
    play(eng, o) { pluck(eng, o, { r1: 190, r2: 520, r3: 1600, hp: 120, quill: 0.28 }); },
  },

  pizz: {
    name: 'Pizzicato strings', group: 'Plucked', pitched: true, note: 'G3',
    params: {
      sustain: { min: 0.1, max: 1.5, def: 0.42, step: 0.02, unit: 's', label: 'T60' },
      damp: { min: 0.1, max: 0.9, def: 0.55, step: 0.02 },
      pick: { min: 0.05, max: 1, def: 0.6, step: 0.02, label: 'finger tone' },
      body: { min: 0, max: 14, def: 9, step: 0.5, label: 'body dB' },
      bright: { min: 1500, max: 9000, def: 3800, step: 100, unit: 'Hz' },
      level: lvl(0.9), send: send(0.35),
    },
    play(eng, o) { pluck(eng, o, { r1: 275, r2: 460, r3: 2500, hp: 120 }); },
  },

  violin: {
    name: 'Violin', group: 'Bowed', pitched: true, note: 'A4',
    params: BOWED_PARAMS(0.09, 5.6, 14, 0.3, 0.55, 2600, 6, 0.45),
    play(eng, o) { bowed(eng, o, VIOLIN); },
  },

  cello: {
    name: 'Cello', group: 'Bowed', pitched: true, note: 'C3',
    params: BOWED_PARAMS(0.12, 4.9, 12, 0.35, 0.6, 1700, 6, 0.42),
    play(eng, o) { bowed(eng, o, CELLO); },
  },

  strings: {
    name: 'String section', group: 'Bowed', pitched: true, note: 'D4',
    params: Object.assign(BOWED_PARAMS(0.14, 5.2, 13, 0.4, 0.7, 2400, 9, 0.5), {
      players: { min: 1, max: 4, def: 3, step: 1 },
      octave: { min: 0, max: 1, def: 0.35, step: 0.05, label: 'oct double' },
    }),
    play(eng, o) {
      const n = Math.round(o.players);
      for (let i = 0; i < n; i++) {
        bowed(eng, Object.assign({}, o, {
          t: o.t + (i ? rnd(0.004, 0.03) : 0),
          level: o.level / Math.sqrt(n),
          spread: o.spread + rnd(-3, 3),
          drift: o.drift + rnd(0, 3),
          vibRate: o.vibRate * rnd(0.9, 1.1),
          attack: o.attack * rnd(0.85, 1.2),
        }), VIOLIN);
      }
      if (o.octave > 0.02) {
        bowed(eng, Object.assign({}, o, {
          t: o.t + rnd(0, 0.02), freq: o.freq * 0.5,
          level: o.level * o.octave * 0.8,
        }), CELLO);
      }
    },
  },

  flute: {
    name: 'Flute', group: 'Wind', pitched: true, note: 'D5',
    params: {
      breath: { min: 0, max: 1, def: 0.3, step: 0.02 },
      attack: { min: 0.01, max: 0.3, def: 0.07, step: 0.005, unit: 's' },
      vibDepth: { min: 0, max: 40, def: 13, step: 1, unit: '¢', label: 'vibrato depth' },
      vibRate: { min: 2, max: 8, def: 5, step: 0.1, unit: 'Hz', label: 'vibrato rate' },
      colour: { min: 0, max: 1, def: 0.35, step: 0.02, label: 'harmonics' },
      level: lvl(0.55), send: send(0.35),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq, dur = Math.max(0.08, o.dur), rel = 0.13;
      const out = eng.voice(t, dur + rel + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const amp = ctx.createGain(); amp.gain.value = 0;
      const lp = biquad(ctx, 'lowpass', Math.min(11000, f * 8 + 1200), 0.7);
      chain([lp, amp, out]);

      const lfo = ctx.createOscillator(); lfo.type = 'sine';
      lfo.frequency.value = o.vibRate;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vibDepth, t + Math.min(0.35, dur * 0.7) + 0.001);
      lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + rel + 0.1);

      const parts = [[1, 1], [2, 0.32 * o.colour], [3, 0.13 * o.colour], [4, 0.05 * o.colour]];
      for (const [m, g] of parts) {
        if (g < 0.005) continue;
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = f * m;
        lg.connect(osc.detune);
        const vg = ctx.createGain(); vg.gain.value = g * 0.55;
        chain([osc, vg, lp]);
        osc.start(t); osc.stop(t + dur + rel + 0.05);
      }
      if (o.breath > 0.01) {
        const n = eng.noiseSrc(t, dur + rel);
        const bp = biquad(ctx, 'bandpass', Math.min(9000, f * 3.4), 0.9);
        const g = ctx.createGain();
        adsr(g.gain, t, o.breath * 0.13, o.attack * 0.5, 0.12, 0.5, dur, rel);
        chain([n, bp, g, lp]);
      }
      adsr(amp.gain, t, 1, o.attack, 0.1, 0.86, dur, rel);
    },
  },

  organ: {
    name: 'Pipe organ', group: 'Keys', pitched: true, note: 'C4',
    params: {
      d16: { min: 0, max: 1, def: 0.55, step: 0.02, label: "16'" },
      d8: { min: 0, max: 1, def: 1, step: 0.02, label: "8'" },
      d4: { min: 0, max: 1, def: 0.5, step: 0.02, label: "4'" },
      d223: { min: 0, max: 1, def: 0.3, step: 0.02, label: "2⅔'" },
      d2: { min: 0, max: 1, def: 0.34, step: 0.02, label: "2'" },
      chiff: { min: 0, max: 1, def: 0.3, step: 0.02 },
      level: lvl(0.4), send: send(0.55),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq, dur = Math.max(0.06, o.dur), rel = 0.09;
      const out = eng.voice(t, dur + rel + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const amp = ctx.createGain(); amp.gain.value = 0;
      const lp = biquad(ctx, 'lowpass', 7000, 0.7);
      chain([lp, amp, out]);
      const ranks = [[0.5, o.d16], [1, o.d8], [2, o.d4], [3, o.d223], [4, o.d2]];
      for (const [m, g] of ranks) {
        if (g < 0.02) continue;
        const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.value = f * m;
        osc.detune.value = rnd(-4, 4);
        const vg = ctx.createGain(); vg.gain.value = g * 0.4;
        chain([osc, vg, lp]);
        osc.start(t); osc.stop(t + dur + rel + 0.05);
      }
      if (o.chiff > 0.02) {
        const n = eng.noiseSrc(t, 0.05);
        const bp = biquad(ctx, 'bandpass', Math.min(9000, f * 5), 1.4);
        const g = ctx.createGain();
        perc(g.gain, t, o.chiff * 0.2, 0.002, 0.035);
        chain([n, bp, g, lp]);
      }
      adsr(amp.gain, t, 1, 0.014, 0.04, 0.95, dur, rel);
    },
  },

  bell: {
    name: 'Bell (FM)', group: 'Keys', pitched: true, note: 'C5',
    params: {
      ratio: { min: 1, max: 7, def: 3.46, step: 0.01 },
      index: { min: 0, max: 12, def: 5.5, step: 0.1 },
      idxDecay: { min: 0.05, max: 2, def: 0.4, step: 0.02, unit: 's', label: 'index decay' },
      decay: { min: 0.3, max: 6, def: 2.4, step: 0.1, unit: 's' },
      strike: { min: 0, max: 1, def: 0.25, step: 0.02 },
      level: lvl(0.5), send: send(0.45),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq;
      const out = eng.voice(t, o.decay + 0.3, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
      const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * o.ratio;
      const mg = ctx.createGain();
      perc(mg.gain, t, f * o.index, 0.002, o.idxDecay);
      mod.connect(mg); mg.connect(car.frequency);
      const a = ctx.createGain();
      perc(a.gain, t, 0.75, 0.003, o.decay);
      chain([car, a, out]);
      mod.start(t); mod.stop(t + o.decay + 0.1);
      car.start(t); car.stop(t + o.decay + 0.1);
      if (o.strike > 0.02) {
        const n = eng.noiseSrc(t, 0.02);
        const hp = biquad(ctx, 'highpass', 4000, 0.7);
        const g = ctx.createGain();
        perc(g.gain, t, o.strike * 0.3, 0.001, 0.012);
        chain([n, hp, g, out]);
      }
    },
  },

  choir: {
    name: 'Choir (ah)', group: 'Bowed', pitched: true, note: 'A3',
    params: {
      attack: { min: 0.05, max: 0.8, def: 0.26, step: 0.01, unit: 's' },
      spread: { min: 0, max: 40, def: 15, step: 1, unit: '¢' },
      vibDepth: { min: 0, max: 40, def: 11, step: 1, unit: '¢', label: 'vibrato depth' },
      breath: { min: 0, max: 1, def: 0.28, step: 0.02 },
      f1: { min: 400, max: 1000, def: 720, step: 10, unit: 'Hz', label: 'formant 1' },
      f2: { min: 800, max: 1800, def: 1180, step: 10, unit: 'Hz', label: 'formant 2' },
      level: lvl(0.42), send: send(0.55),
    },
    play(eng, o) {
      const { ctx } = eng, t = o.t, f = o.freq, dur = Math.max(0.12, o.dur), rel = 0.35;
      const out = eng.voice(t, dur + rel + 0.4, o.send);
      out.gain.value = o.level * (o.vel ?? 1);
      const amp = ctx.createGain(); amp.gain.value = 0;
      const mix = ctx.createGain();
      const F1 = biquad(ctx, 'peaking', o.f1, 3, 14);
      const F2 = biquad(ctx, 'peaking', o.f2, 3.5, 11);
      const F3 = biquad(ctx, 'peaking', 2700, 3, 7);
      const lp = biquad(ctx, 'lowpass', 4200, 0.7);
      const hp = biquad(ctx, 'highpass', Math.max(70, f * 0.8), 0.6);
      chain([mix, F1, F2, F3, lp, hp, amp, out]);

      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.1;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.vibDepth, t + Math.min(0.5, dur * 0.8) + 0.001);
      lfo.connect(lg); lfo.start(t); lfo.stop(t + dur + rel + 0.1);

      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = (i - 1) * o.spread + rnd(-4, 4);
        lg.connect(osc.detune);
        const g = ctx.createGain(); g.gain.value = 0.3;
        chain([osc, g, mix]);
        osc.start(t); osc.stop(t + dur + rel + 0.05);
      }
      if (o.breath > 0.02) {
        const n = eng.noiseSrc(t, dur + rel);
        const bp = biquad(ctx, 'bandpass', 2200, 0.8);
        const g = ctx.createGain();
        adsr(g.gain, t, o.breath * 0.1, o.attack, 0.2, 0.7, dur, rel);
        chain([n, bp, g, mix]);
      }
      adsr(amp.gain, t, 1, o.attack, 0.18, 0.88, dur, rel);
    },
  },
};

function pluck(eng, o, cfg) {
  const { ctx } = eng, t = o.t, f = o.freq;
  const len = Math.min(7, Math.max(o.sustain * 1.1, o.dur + 0.3, 0.4));
  const out = eng.voice(t, len + 0.25, o.send);
  out.gain.value = o.level * (o.vel ?? 1);
  const buf = eng.ks(f, len, { t60: o.sustain, damp: o.damp, tone: o.pick });
  const src = ctx.createBufferSource(); src.buffer = buf;
  const b1 = biquad(ctx, 'peaking', cfg.r1, 1.4, o.body);
  const b2 = biquad(ctx, 'peaking', cfg.r2, 2.0, o.body * 0.7);
  const b3 = biquad(ctx, 'peaking', cfg.r3, 1.2, o.body * 0.45);
  const lp = biquad(ctx, 'lowpass', o.bright, 0.8);
  const hp = biquad(ctx, 'highpass', cfg.hp, 0.7);
  const amp = ctx.createGain(); amp.gain.value = 0;
  chain([src, b1, b2, b3, lp, hp, amp, out]);
  const ring = Math.max(0.08, Math.min(len - 0.05, o.dur + 0.45));
  adsr(amp.gain, t, 1.5, 0.002, 0.02, 1, ring, 0.14);
  src.start(t); src.stop(t + len + 0.05);

  if (cfg.quill) {
    const n = eng.noiseSrc(t, 0.02);
    const bp = biquad(ctx, 'bandpass', 3200, 1.1);
    const g = ctx.createGain();
    perc(g.gain, t, cfg.quill * 0.25, 0.0008, 0.012);
    chain([n, bp, g, out]);
  }
}

function BOWED_PARAMS(attack, vibRate, vibDepth, vibDelay, bow, bright, spread, level) {
  return {
    attack: { min: 0.01, max: 0.4, def: attack, step: 0.005, unit: 's', label: 'bow attack' },
    vibRate: { min: 3, max: 8, def: vibRate, step: 0.1, unit: 'Hz', label: 'vibrato rate' },
    vibDepth: { min: 0, max: 45, def: vibDepth, step: 1, unit: '¢', label: 'vibrato depth' },
    vibDelay: { min: 0, max: 1, def: vibDelay, step: 0.02, unit: 's', label: 'vibrato delay' },
    bow: { min: 0, max: 1, def: bow, step: 0.02, label: 'bow noise' },
    bright: { min: 600, max: 9000, def: bright, step: 100, unit: 'Hz' },
    spread: { min: 0, max: 30, def: spread, step: 1, unit: '¢', label: 'detune' },
    drift: { min: 0, max: 20, def: 5, step: 1, unit: '¢' },
    bodyDb: { min: 0, max: 18, def: 9, step: 0.5, label: 'body dB' },
    level: lvl(level), send: send(0.45),
  };
}

const VIOLIN = { r1: 275, r2: 465, r3: 2600, hp: 165, rel: 0.19, gain: 0.55 };
const CELLO = { r1: 100, r2: 195, r3: 1300, hp: 55, rel: 0.26, gain: 0.6 };

// Layered detuned saws + bow-noise transient + body resonances. Closest we get to a
// bowed string without a physical model; see the report for how close that is.
function bowed(eng, o, cfg) {
  const { ctx } = eng, t = o.t;
  const dur = Math.max(0.09, o.dur);
  const rel = cfg.rel;
  const tail = dur + rel + 0.12;
  const out = eng.voice(t, tail + 0.3, o.send);
  out.gain.value = o.level * cfg.gain * (o.vel ?? 1);

  const mix = ctx.createGain();
  const lp = biquad(ctx, 'lowpass', 2000, 0.8);
  const b1 = biquad(ctx, 'peaking', cfg.r1, 1.6, o.bodyDb);
  const b2 = biquad(ctx, 'peaking', cfg.r2, 2.2, o.bodyDb * 0.8);
  const b3 = biquad(ctx, 'peaking', cfg.r3, 1.1, o.bodyDb * 0.55);
  const hp = biquad(ctx, 'highpass', cfg.hp, 0.7);
  const amp = ctx.createGain(); amp.gain.value = 0;
  chain([mix, lp, b1, b2, b3, hp, amp, out]);

  const lfo = ctx.createOscillator(); lfo.type = 'sine';
  lfo.frequency.value = o.vibRate * rnd(0.96, 1.04);
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(o.vibDepth, t + Math.min(o.vibDelay, dur * 0.8) + 0.001);
  lfo.connect(lg);
  lfo.start(t); lfo.stop(t + tail + 0.05);

  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.value = o.freq;
    const d0 = (i - 1) * o.spread + rnd(-o.drift, o.drift);
    // bow start is slightly flat before the string locks on
    osc.detune.setValueAtTime(d0 - 13, t);
    osc.detune.linearRampToValueAtTime(d0, t + 0.045);
    osc.detune.linearRampToValueAtTime(d0 + rnd(-3, 3), t + dur);
    lg.connect(osc.detune);
    const g = ctx.createGain(); g.gain.value = 0.3;
    chain([osc, g, mix]);
    osc.start(t); osc.stop(t + tail + 0.05);
  }

  if (o.bow > 0.01) {
    const n = eng.noiseSrc(t, tail);
    const bf = biquad(ctx, 'bandpass', 2300, 0.75);
    const ng = ctx.createGain();
    const floor = Math.max(0.0006, o.bow * 0.14);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(o.bow * 0.28, t + 0.018);
    ng.gain.exponentialRampToValueAtTime(floor, t + Math.min(0.17, dur * 0.9));
    ng.gain.setValueAtTime(floor, t + dur);
    ng.gain.exponentialRampToValueAtTime(0.0005, t + dur + rel);
    ng.gain.linearRampToValueAtTime(0, t + dur + rel + 0.01);
    chain([n, bf, ng, mix]);
  }

  const cut = Math.min(11000, o.bright + o.freq * 2.2);
  const A = Math.min(o.attack, dur * 0.55);
  const t1 = t + A * 0.35, t2 = t + A;
  const t3 = Math.max(t2 + 0.005, t + Math.min(dur, A + 0.22));
  const t4 = Math.max(t3 + 0.005, t + dur);
  lp.frequency.setValueAtTime(cut * 0.42, t);
  lp.frequency.linearRampToValueAtTime(cut, t2);
  lp.frequency.linearRampToValueAtTime(cut * 0.86, t4);

  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.5, t1);
  amp.gain.linearRampToValueAtTime(1.06, t2);
  amp.gain.linearRampToValueAtTime(0.9, t3);
  amp.gain.setValueAtTime(0.9, t4);
  amp.gain.exponentialRampToValueAtTime(0.0005, t4 + rel);
  amp.gain.linearRampToValueAtTime(0, t4 + rel + 0.012);
}

export function playNote(eng, id, o) {
  const inst = INSTRUMENTS[id];
  if (!inst) return;
  const opts = Object.assign(defaultsOf(inst), o);
  if (opts.freq == null) opts.freq = freqOf(o.note ?? inst.note ?? 'A4');
  if (opts.dur == null) opts.dur = 0.6;
  inst.play(eng, opts);
}

export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS);
