// Continuous, parameter-driven sources. These are what the sustained layer in core.js exists for.
//
// A def owns timbre only. The pool owns distance, air absorption, pan and doppler, and hands the
// doppler multiplier down as `_pitch` and the distance in world units as `_dist`, so a def that
// wants to darken with range can, and one that does not can ignore it.
//
// Rotary engine numbers, for anyone checking them: a 9-cylinder four-stroke rotary fires 4.5 times
// per revolution, and a Le Rhone 9J turns about 1200 rpm — 20 rev/s, so a firing rate of 90 Hz and
// a two-blade pass at 40 Hz. That 90 Hz blat is the sound, and it is why the engine reads as an
// engine rather than as a filtered buzz.

import { biquad, chain, smoother, clamp, shaper } from './core.js';

const P = (min, max, def, step, extra = {}) => ({ min, max, def, step, ...extra });
const lvl = (def = 1) => P(0, 2, def, 0.02, { label: 'level' });

// harmonics ~1/n^p, with a formant bump, as a PeriodicWave
function blatWave(ctx, n, p, bump, bumpQ) {
  const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const b = 1 + bump * Math.exp(-Math.pow((i - bumpQ) / 2.2, 2));
    imag[i] = (1 / Math.pow(i, p)) * b;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// a hard gate: anything past `thr` returns 1, everything else 0
function gateCurve(thr) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = (i / (n - 1) * 2 - 1) > thr ? 1 : 0;
  return c;
}

function gate(ctx, thr) {
  const w = ctx.createWaveShaper();
  w.curve = gateCurve(thr);
  return w;
}

export const SRC = {

  rotary: {
    name: 'Rotary engine', group: 'Aviation — engine', priority: 4, send: 0.08,
    about: 'Nine-cylinder rotary. mixture is the blip switch: cut it and the firing collapses to a windmilling prop, which is the sound of a stall turn.',
    verify: { sweeps: ['rpm', 'mixture', 'rough', 'load'], doppler: true },
    params: {
      rpm:     P(0, 1, 0.62, 0.01, { label: 'rpm', smooth: 0.10 }),
      load:    P(0, 1, 0.50, 0.02, { label: 'load', smooth: 0.18 }),
      mixture: P(0, 1, 1.00, 0.02, { label: 'mixture / blip', smooth: 0.025 }),
      rough:   P(0, 1, 0.00, 0.02, { label: 'roughness', smooth: 0.25 }),
      level:   lvl(0.9),
    },
    build(eng, out, o, at) {
      const { ctx } = eng;
      let sm = smoother();

      const blat = ctx.createOscillator();
      blat.setPeriodicWave(blatWave(ctx, 22, 0.78, 1.6, 3));
      const half = ctx.createOscillator(); half.type = 'sawtooth';
      const chuff = ctx.createOscillator(); chuff.type = 'triangle';
      const lope = ctx.createOscillator(); lope.type = 'sine';

      const blatG = ctx.createGain(); blatG.gain.value = 0.42;
      const halfG = ctx.createGain(); halfG.gain.value = 0.10;
      const chuffG = ctx.createGain(); chuffG.gain.value = 0.30;
      const lopeG = ctx.createGain(); lopeG.gain.value = 0.22;

      const fireBody = biquad(ctx, 'lowpass', 3200, 0.9);
      const toneG = ctx.createGain(); toneG.gain.value = 1;
      const sat = shaper(ctx, 3);
      // everything the engine makes goes through engG, because a cylinder that does not fire takes
      // the exhaust with it — dipping only the firing tone is a synth artefact, not a misfire
      const engG = ctx.createGain(); engG.gain.value = 1;
      engG.connect(out);

      chain([blat, blatG, fireBody]);
      chain([half, halfG, fireBody]);
      chain([chuff, chuffG, fireBody]);
      chain([lope, lopeG, fireBody]);
      chain([fireBody, toneG, sat, engG]);

      // intake / exhaust roar, and the prop washing air over the wires
      const roar = eng.noiseLoop(at, 1);
      const roarF = biquad(ctx, 'bandpass', 700, 0.55);
      const roarG = ctx.createGain(); roarG.gain.value = 0.2;
      chain([roar, roarF, roarG, engG]);

      const wash = eng.noiseLoop(at, 0.7);
      const washF = biquad(ctx, 'lowpass', 600, 0.7);
      const washG = ctx.createGain(); washG.gain.value = 0.12;
      chain([wash, washF, washG, engG]);

      // misfire: a sample-and-hold gate dipping the firing gain, no per-event scheduling
      const mis = eng.stepSrc(at, 11);
      const misGate = gate(ctx, 0.55);
      const misDepth = ctx.createGain(); misDepth.gain.value = 0;
      chain([mis, misGate, misDepth]);
      misDepth.connect(engG.gain);

      // rough running also wobbles the firing pitch
      const wob = eng.stepSrc(at, 5);
      const wobDepth = ctx.createGain(); wobDepth.gain.value = 0;
      chain([wob, wobDepth]);
      wobDepth.connect(blat.detune);

      for (const n of [blat, half, chuff, lope]) n.start(at);

      const set = (v, t) => {
        const p = v._pitch ?? 1;
        const rev = (6 + 16 * v.rpm) * p;
        const fire = rev * 4.5;
        const mix = Math.pow(clamp(v.mixture, 0, 1), 1.4);
        const running = mix * clamp(v.rpm * 3, 0, 1);

        sm(blat.frequency, fire, t, 0.09);
        sm(half.frequency, fire * 0.5, t, 0.09);
        sm(chuff.frequency, rev * 2, t, 0.09);
        sm(lope.frequency, Math.max(12, rev), t, 0.09);

        const base = 0.25 + 0.75 * running;
        sm(toneG.gain, base, t, 0.05);
        sm(misDepth.gain, -0.92 * v.rough * running, t, 0.2);
        sm(wobDepth.gain, 90 * v.rough, t, 0.2);

        sm(fireBody.frequency, (1400 + 3600 * v.load * running) * p, t, 0.15);
        sm(blatG.gain, 0.42 * (0.6 + 0.4 * v.load), t, 0.15);

        sm(roarF.frequency, (520 + 1100 * v.load) * p, t, 0.15);
        sm(roarG.gain, (0.09 + 0.34 * v.load) * (0.3 + 0.7 * v.rpm), t, 0.12);
        sm(roar.playbackRate, 0.75 + 0.8 * v.rpm * p, t, 0.12);

        sm(washF.frequency, (300 + 1100 * v.rpm) * p, t, 0.12);
        sm(washG.gain, 0.05 + 0.22 * v.rpm, t, 0.12);
        sm(wash.playbackRate, (0.5 + 1.1 * v.rpm) * p, t, 0.12);
      };

      return {
        set, reset() { sm = smoother(); },
        dispose() { for (const n of [blat, half, chuff, lope, roar, wash, mis, wob]) { try { n.stop(); } catch {} } },
      };
    },
  },

  slipstream: {
    name: 'Slipstream', group: 'Aviation — airflow', priority: 3, send: 0.05,
    about: 'Airflow over the airframe, keyed to airspeed. This is the altitude and energy cue as much as the HUD is.',
    verify: { sweeps: ['speed', 'shield'], doppler: true },
    params: {
      speed:  P(0, 1, 0.5, 0.01, { label: 'airspeed', smooth: 0.14 }),
      gust:   P(0, 1, 0.25, 0.02, { label: 'gust', smooth: 0.3 }),
      shield: P(0, 1, 0.35, 0.02, { label: 'windscreen', smooth: 0.3 }),
      level:  lvl(0.8),
    },
    build(eng, out, o, at) {
      const { ctx } = eng;
      let sm = smoother();

      const amp = ctx.createGain(); amp.gain.value = 0.5;
      amp.connect(out);

      const lo = eng.noiseLoop(at, 0.55);
      const loF = biquad(ctx, 'lowpass', 320, 0.7);
      const loG = ctx.createGain(); loG.gain.value = 0.3;
      chain([lo, loF, loG, amp]);

      const hi = eng.noiseLoop(at, 1.5);
      const hiF = biquad(ctx, 'bandpass', 2600, 0.5);
      const hiG = ctx.createGain(); hiG.gain.value = 0.3;
      chain([hi, hiF, hiG, amp]);

      const gustSrc = eng.stepSrc(at, 1.7);
      const gustLp = biquad(ctx, 'lowpass', 3, 0.7);
      const gustDepth = ctx.createGain(); gustDepth.gain.value = 0;
      chain([gustSrc, gustLp, gustDepth]);
      gustDepth.connect(amp.gain);

      const set = (v, t) => {
        const p = v._pitch ?? 1;
        const s = clamp(v.speed, 0, 1);
        sm(loF.frequency, (120 + 520 * s) * p, t, 0.14);
        sm(loG.gain, 0.42 * Math.pow(s, 1.5), t, 0.14);
        sm(hiF.frequency, (850 + 5400 * s) * (1 - 0.55 * v.shield) * p, t, 0.14);
        sm(hiG.gain, 0.55 * Math.pow(s, 2.1) * (1 - 0.45 * v.shield), t, 0.14);
        sm(amp.gain, 0.35 + 0.65 * s, t, 0.14);
        sm(gustDepth.gain, 0.45 * v.gust * s, t, 0.3);
      };
      return {
        set, reset() { sm = smoother(); },
        dispose() { for (const n of [lo, hi, gustSrc]) { try { n.stop(); } catch {} } },
      };
    },
  },

  wireHum: {
    name: 'Wire hum / airframe stress', group: 'Aviation — airflow', priority: 3, send: 0.14,
    about: 'The aeolian tone off the bracing wires, rising with dynamic pressure. Overspeed a dive and this is what tells you before the HUD does.',
    verify: { sweeps: ['q', 'stress'], doppler: true },
    params: {
      q:      P(0, 1, 0.4, 0.01, { label: 'dynamic pressure', smooth: 0.16 }),
      stress: P(0, 1, 0.2, 0.02, { label: 'airframe stress', smooth: 0.25 }),
      level:  lvl(0.7),
    },
    build(eng, out, o, at) {
      const { ctx } = eng;
      let sm = smoother();

      const amp = ctx.createGain(); amp.gain.value = 0.4;
      amp.connect(out);

      const nz = eng.noiseLoop(at, 1.2);
      const r1 = biquad(ctx, 'bandpass', 400, 16);
      const r2 = biquad(ctx, 'bandpass', 600, 12);
      const r1g = ctx.createGain(); r1g.gain.value = 3.2;
      const r2g = ctx.createGain(); r2g.gain.value = 2.0;
      chain([nz, r1, r1g, amp]);
      chain([nz, r2, r2g, amp]);

      const pure = ctx.createOscillator(); pure.type = 'sine';
      const pureG = ctx.createGain(); pureG.gain.value = 0.04;
      chain([pure, pureG, amp]);

      const groan = ctx.createOscillator(); groan.type = 'triangle';
      const groanG = ctx.createGain(); groanG.gain.value = 0;
      const groanF = biquad(ctx, 'lowpass', 300, 1);
      chain([groan, groanG, groanF, amp]);

      // stress bends the resonator, which is what makes it read as a structure and not a whistle
      const creak = eng.stepSrc(at, 3);
      const creakLp = biquad(ctx, 'lowpass', 5, 0.7);
      const creakDepth = ctx.createGain(); creakDepth.gain.value = 0;
      chain([creak, creakLp, creakDepth]);
      creakDepth.connect(r1.detune);

      pure.start(at); groan.start(at);

      const set = (v, t) => {
        const p = v._pitch ?? 1;
        const q = clamp(v.q, 0, 1);
        const f = (190 + 1080 * q) * p;
        sm(r1.frequency, f, t, 0.16);
        sm(r2.frequency, f * 1.51, t, 0.16);
        sm(pure.frequency, f, t, 0.16);
        sm(pureG.gain, 0.05 * q * q, t, 0.16);
        sm(amp.gain, 0.12 + 0.9 * Math.pow(q, 1.8), t, 0.16);
        sm(creakDepth.gain, 260 * v.stress, t, 0.25);
        sm(groan.frequency, (58 + 40 * v.stress) * p, t, 0.2);
        sm(groanG.gain, 0.5 * v.stress * (0.3 + 0.7 * q), t, 0.2);
      };
      return {
        set, reset() { sm = smoother(); },
        dispose() { for (const n of [nz, pure, groan, creak]) { try { n.stop(); } catch {} } },
      };
    },
  },

  stallBuffet: {
    name: 'Stall buffet', group: 'Aviation — airflow', priority: 5, send: 0.1,
    about: 'Separated flow hammering the tail. The warning you feel before anything says it.',
    verify: { sweeps: ['severity', 'speed'], doppler: false },
    params: {
      severity: P(0, 1, 0.5, 0.02, { label: 'severity', smooth: 0.1 }),
      speed:    P(0, 1, 0.4, 0.02, { label: 'airspeed', smooth: 0.15 }),
      level:    lvl(0.9),
    },
    build(eng, out, o, at) {
      const { ctx } = eng;
      let sm = smoother();

      const amp = ctx.createGain(); amp.gain.value = 0.001;
      amp.connect(out);

      const rumble = eng.noiseLoop(at, 0.45);
      const rF = biquad(ctx, 'lowpass', 260, 1.1);
      const rG = ctx.createGain(); rG.gain.value = 1.1;
      chain([rumble, rF, rG, amp]);

      const burble = eng.noiseLoop(at, 1.1);
      const bF = biquad(ctx, 'bandpass', 620, 1.4);
      const bG = ctx.createGain(); bG.gain.value = 0.35;
      chain([burble, bF, bG, amp]);

      // the hammer: a low LFO driving the whole thing, which is what a buffet actually is
      const lfo = ctx.createOscillator(); lfo.type = 'sine';
      const lfoD = ctx.createGain(); lfoD.gain.value = 0;
      chain([lfo, lfoD]);
      lfoD.connect(amp.gain);
      lfo.start(at);

      const set = (v, t) => {
        const s = clamp(v.severity, 0, 1);
        sm(amp.gain, 0.06 + 0.7 * s, t, 0.1);
        sm(lfo.frequency, 8 + 8 * s + 4 * v.speed, t, 0.1);
        sm(lfoD.gain, (0.06 + 0.62 * s) * 0.9, t, 0.1);
        sm(rF.frequency, 170 + 320 * v.speed, t, 0.15);
        sm(bF.frequency, 430 + 900 * v.speed, t, 0.15);
        sm(bG.gain, 0.2 + 0.5 * s, t, 0.15);
      };
      return {
        set, reset() { sm = smoother(); },
        dispose() { for (const n of [rumble, burble, lfo]) { try { n.stop(); } catch {} } },
      };
    },
  },

  zeppelinDrone: {
    name: 'Zeppelin drone', group: 'Aviation — engine', priority: 3, send: 0.35,
    about: 'Several big Maybachs slightly out of step. The beating between them is the whole character; one engine sounds like a lorry.',
    verify: { sweeps: ['rpm', 'engines', 'load'], doppler: true },
    params: {
      engines: P(1, 6, 5, 1, { label: 'engines', smooth: 0.4 }),
      rpm:     P(0, 1, 0.55, 0.01, { label: 'rpm', smooth: 0.25 }),
      load:    P(0, 1, 0.6, 0.02, { label: 'load', smooth: 0.3 }),
      level:   lvl(1),
    },
    build(eng, out, o, at) {
      const { ctx } = eng;
      let sm = smoother();

      const amp = ctx.createGain(); amp.gain.value = 0.35;
      const body = biquad(ctx, 'lowpass', 900, 0.8);
      chain([amp, body, out]);

      const N = 6;
      const oscs = [], gains = [], blades = [], bladeG = [];
      const wave = blatWave(ctx, 14, 0.9, 1.1, 2);
      for (let i = 0; i < N; i++) {
        const osc = ctx.createOscillator();
        osc.setPeriodicWave(wave);
        const g = ctx.createGain(); g.gain.value = 0;
        chain([osc, g, amp]);
        osc.start(at);
        oscs.push(osc); gains.push(g);

        const bl = ctx.createOscillator(); bl.type = 'triangle';
        const bg = ctx.createGain(); bg.gain.value = 0;
        chain([bl, bg, amp]);
        bl.start(at);
        blades.push(bl); bladeG.push(bg);
      }

      const air = eng.noiseLoop(at, 0.4);
      const airF = biquad(ctx, 'lowpass', 240, 0.8);
      const airG = ctx.createGain(); airG.gain.value = 0.18;
      chain([air, airF, airG, amp]);

      const set = (v, t) => {
        const p = v._pitch ?? 1;
        const rev = (10 + 14 * v.rpm) * p;
        const fire = rev * 3;                        // six-cylinder four-stroke
        const n = Math.round(clamp(v.engines, 1, N));
        for (let i = 0; i < N; i++) {
          const on = i < n ? 1 : 0;
          // each engine a little out of step: that is the beat you hear from the ground
          const det = 1 + (i - (N - 1) / 2) * 0.0075;
          sm(oscs[i].frequency, fire * det, t, 0.25);
          sm(gains[i].gain, on * 0.13 * (0.55 + 0.45 * v.load), t, 0.3);
          sm(blades[i].frequency, rev * 2 * det, t, 0.25);
          sm(bladeG[i].gain, on * 0.09, t, 0.3);
        }
        sm(body.frequency, (500 + 900 * v.load) * p, t, 0.3);
        sm(air.playbackRate, p, t, 0.3);
        sm(airF.frequency, 240 * p, t, 0.3);
        sm(airG.gain, 0.1 + 0.22 * v.load, t, 0.3);
        sm(amp.gain, 0.22 + 0.4 * v.load, t, 0.3);
      };
      return {
        set, reset() { sm = smoother(); },
        dispose() { for (const n of [...oscs, ...blades, air]) { try { n.stop(); } catch {} } },
      };
    },
  },

  groundRoll: {
    name: 'Ground roll', group: 'Aviation — ground', priority: 2, send: 0.06,
    about: 'Wheels and skid over grass or gravel. Bumps come from a sample-and-hold gate, so the rate rises with speed without scheduling a single event.',
    verify: { sweeps: ['speed', 'surface'], doppler: false },
    params: {
      speed:   P(0, 1, 0.5, 0.01, { label: 'speed', smooth: 0.12 }),
      surface: P(0, 1, 0.4, 0.02, { label: 'grass … gravel', smooth: 0.3 }),
      level:   lvl(0.8),
    },
    build(eng, out, o, at) {
      const { ctx } = eng;
      let sm = smoother();

      const amp = ctx.createGain(); amp.gain.value = 0.3;
      amp.connect(out);

      const roll = eng.noiseLoop(at, 1);
      const rF = biquad(ctx, 'lowpass', 400, 0.9);
      const rG = ctx.createGain(); rG.gain.value = 0.5;
      chain([roll, rF, rG, amp]);

      const grit = eng.noiseLoop(at, 1.8);
      const gF = biquad(ctx, 'bandpass', 2200, 0.8);
      const gG = ctx.createGain(); gG.gain.value = 0;
      chain([grit, gF, gG, amp]);

      const bump = eng.stepSrc(at, 8);
      const bGate = gate(ctx, 0.62);
      const bDepth = ctx.createGain(); bDepth.gain.value = 0;
      const bF = biquad(ctx, 'lowpass', 90, 1.4);
      chain([bump, bGate, bDepth, bF]);
      const bumpOut = ctx.createGain(); bumpOut.gain.value = 1;
      chain([bF, bumpOut, amp]);

      const set = (v, t) => {
        const s = clamp(v.speed, 0, 1);
        sm(roll.playbackRate, 0.45 + 1.5 * s, t, 0.12);
        sm(rF.frequency, 150 + 950 * s * (0.4 + 0.6 * v.surface), t, 0.12);
        sm(rG.gain, 0.6 * Math.pow(s, 0.8), t, 0.12);
        sm(grit.playbackRate, 0.9 + 1.6 * s, t, 0.12);
        sm(gF.frequency, 1500 + 2600 * v.surface, t, 0.25);
        sm(gG.gain, 0.34 * v.surface * Math.pow(s, 0.9), t, 0.15);
        sm(bDepth.gain, 0.55 * Math.pow(s, 0.7) * (0.3 + 0.7 * v.surface), t, 0.15);
        sm(amp.gain, 0.1 + 0.6 * s, t, 0.12);
      };
      return {
        set, reset() { sm = smoother(); },
        dispose() { for (const n of [roll, grit, bump]) { try { n.stop(); } catch {} } },
      };
    },
  },

};

export const SRC_IDS = Object.keys(SRC);
