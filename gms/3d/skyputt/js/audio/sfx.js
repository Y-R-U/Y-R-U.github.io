// SKYPUTT audio — one-shot sound recipes. Each recipe is (E, t, params) => endTime, where E is
// the graph from graph.js and t is the start time on E.ctx. No audio files: modal sine partials
// for impacts, filtered noise for air/water/grit, FM bells for chimes, filtered saws for brass.
import { clamp, rnd, pick, mtof, shared, voice, osc, noise, modal, bell, filter, track, envAD } from './core.js';

// ---- impacts --------------------------------------------------------------------------------
// partials: [freq, amp, decay]; click: the contact transient (bandpassed noise).
const WALL = {
  stone: { modes: [[360, 0.30, 0.05], [940, 0.16, 0.035], [2150, 0.06, 0.02]], click: [1300, 0.7, 0.55, 0.022], thump: 0.24, verb: 0.08 },
  wood:  { modes: [[470, 0.34, 0.09], [1230, 0.18, 0.05], [2650, 0.07, 0.025]], click: [2100, 1, 0.42, 0.012], thump: 0.16, verb: 0.1 },
  metal: { modes: [[1210, 0.15, 0.45], [1890, 0.11, 0.33], [2730, 0.08, 0.25], [3970, 0.05, 0.18], [5400, 0.03, 0.12]], click: [4500, 1, 0.3, 0.008], thump: 0.06, verb: 0.2 },
  glass: { modes: [[2350, 0.13, 0.38], [3810, 0.08, 0.3], [5960, 0.05, 0.2], [8100, 0.025, 0.14]], click: [6200, 1.2, 0.22, 0.006], thump: 0, verb: 0.25 },
};

function impact(E, t, m, s, pan, verbScale = 1) {
  const v = voice(E, { gain: 0.1 + 0.9 * Math.pow(s, 0.8), pan, verb: m.verb * verbScale });
  const [cf, cq, cg, cd] = m.click;
  noise(v, t, { type: 'bandpass', f: cf * (0.75 + 0.5 * s), q: cq, gain: cg, att: 0.0005, dur: cd });
  const d = rnd(0.96, 1.04);
  modal(v, t, m.modes.map(([f, a, dc]) => [f * d, a, dc * (0.6 + 0.4 * s)]));
  if (m.thump) osc(v, t, { f: 150 * d, glide: [[70, 0.05]], gain: m.thump * s, att: 0.001, dur: 0.06 });
  return t + 0.6;
}

// ---- crowd + fanfare helpers -----------------------------------------------------------------
function applauseBuffer(ctx) {
  const s = shared(ctx);
  if (s.applause) return s.applause;
  const sr = ctx.sampleRate, dur = 3.4, n = Math.floor(sr * dur), b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let k = 0; k < 260; k++) {
      const tc = k < 70 ? rnd(0.04, 0.45) : 0.15 + 3.0 * Math.pow(Math.random(), 1.7);
      const i0 = Math.floor(tc * sr), len = Math.floor(rnd(0.004, 0.012) * sr);
      const amp = rnd(0.25, 1) * Math.max(0, 1 - tc / dur), a = rnd(0.25, 0.85);
      let lp = 0;
      for (let j = 0; j < len * 3 && i0 + j < n; j++) {
        lp += a * ((Math.random() * 2 - 1) - lp);
        d[i0 + j] += lp * amp * Math.exp(-j / (len * 0.35));
      }
    }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] *= 0.9 / (pk || 1);
  }
  return (s.applause = b);
}

function crowd(E, t, level = 1) {
  const ctx = E.ctx, v = voice(E, { gain: level, verb: 0.35 });
  // applause
  const src = ctx.createBufferSource(); src.buffer = applauseBuffer(ctx);
  const hp = filter(v, 'highpass', 450, 0.7), pk = ctx.createBiquadFilter();
  pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 4; pk.connect(hp); v.nodes.push(pk);
  const ag = ctx.createGain(); ag.gain.value = 0.32; ag.connect(pk); v.nodes.push(ag);
  src.connect(ag); src.start(t); track(v, src);
  // broad crowd roar
  noise(v, t, { kind: 'pink', type: 'bandpass', f: 900, q: 0.6, gain: 0.22, att: 0.35, hold: 0.4, dur: 2.2 });
  // "woo!" voices: saws through shared vowel formants
  const vox = ctx.createGain(); vox.gain.value = 1; v.nodes.push(vox);
  for (const [f, q, a] of [[730, 6, 1], [1090, 7, 0.55], [2440, 8, 0.3]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = a;
    vox.connect(bp); bp.connect(g); g.connect(v.in); v.nodes.push(bp, g);
  }
  for (let k = 0; k < 9; k++) {
    const f0 = Math.random() < 0.5 ? rnd(115, 170) : rnd(210, 320), tk = t + rnd(0, 0.35), d = rnd(1.0, 1.9);
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, tk);
    o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.25, 1.55), tk + rnd(0.15, 0.35));
    o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.0, 1.15), tk + d);
    lfo.frequency.value = rnd(5, 7); lg.gain.value = f0 * 0.025;
    lfo.connect(lg); lg.connect(o.frequency);
    envAD(g.gain, tk, 0.09, 0.05, d);
    o.connect(g); g.connect(vox);
    o.start(tk); lfo.start(tk); o.stop(tk + d + 0.12); lfo.stop(tk + d + 0.12);
    track(v, o); track(v, lfo); v.nodes.push(g, lg);
  }
  return t + 3.5;
}

function brass(v, t, midi, dur, gain) {
  const ctx = v.ctx, f = mtof(midi), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  lp.type = 'lowpass'; lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(350, t);
  lp.frequency.linearRampToValueAtTime(Math.min(f * 7, 5200), t + 0.05);
  lp.frequency.exponentialRampToValueAtTime(Math.min(f * 3.5, 3500), t + 0.35);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.03);
  g.gain.linearRampToValueAtTime(gain * 0.72, t + Math.min(0.25, dur));
  g.gain.setValueAtTime(gain * 0.72, t + Math.max(dur, 0.25));
  g.gain.setTargetAtTime(0, t + Math.max(dur, 0.25), 0.09);
  lp.connect(g); g.connect(v.in); v.nodes.push(lp, g);
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 5.4;
  lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(10, t + Math.min(dur, 0.45));
  lfo.connect(lg); v.nodes.push(lg);
  const end = t + dur + 0.6;
  for (const dt of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
    lg.connect(o.detune); o.connect(lp); o.start(t); o.stop(end); track(v, o);
  }
  lfo.start(t); lfo.stop(end); track(v, lfo);
}

function sparkle(v, t, n, pool, gain, spread = 0.4) {
  for (let i = 0; i < n; i++) bell(v, t + rnd(0, spread), { f: mtof(pick(pool)), gain: gain * rnd(0.5, 1), dur: rnd(0.35, 0.7), ratio: 3.5, index: 0.8 });
}

// soft pad chord for stingers (triangles through a lowpass)
function softChord(v, t, notes, dur, gain) {
  const lp = filter(v, 'lowpass', 1600, 0.5);
  for (const m of notes) osc(v, t, { type: 'triangle', f: mtof(m), gain, att: 0.04, hold: dur * 0.3, dur: dur * 0.7, dest: lp });
}

// D major pentatonic for pickup combos
const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98];

// ---- recipes --------------------------------------------------------------------------------
export const SFX = {
  putt(E, t, p) {
    const pw = clamp(p.power ?? 0.6);
    const v = voice(E, { gain: 0.3 + 0.7 * pw, pan: p.pan, verb: 0.07 });
    noise(v, t, { type: 'bandpass', f: 2400 + 3200 * pw, q: 0.9, gain: 0.55, att: 0.0005, dur: 0.012 });
    const d = rnd(0.98, 1.02) * (1 + 0.04 * pw);
    modal(v, t, [[1180 * d, 0.26, 0.05], [2650 * d, 0.11, 0.03], [4100 * d, 0.05, 0.018], [640 * d, 0.16, 0.075]]);
    osc(v, t, { f: 170 + 70 * pw, glide: [[85, 0.06]], gain: 0.05 + 0.24 * pw, att: 0.001, dur: 0.08 });
    return t + 0.3;
  },

  wall(E, t, p) {
    const s = clamp((p.speed ?? 2) / 5);
    return impact(E, t, WALL[p.material] || WALL.stone, s, p.pan);
  },

  windmillHit(E, t, p) {
    const s = clamp((p.speed ?? 3) / 5, 0.3, 1);
    const v = voice(E, { gain: 0.4 + 0.6 * s, pan: p.pan, verb: 0.12 });
    noise(v, t, { type: 'bandpass', f: 1800, q: 0.8, gain: 0.5, att: 0.0006, dur: 0.03 });
    const d = rnd(0.95, 1.05);
    modal(v, t, [[190 * d, 0.3, 0.18], [470 * d, 0.22, 0.1], [1050 * d, 0.1, 0.06], [2100 * d, 0.05, 0.03]]);
    osc(v, t, { f: 115, glide: [[55, 0.09]], gain: 0.3, att: 0.001, dur: 0.1 });
    // a faint creak of the sail frame after the hit
    noise(v, t + 0.05, { type: 'bandpass', f: 700, f2: 520, q: 9, gain: 0.08, att: 0.03, dur: 0.18 });
    return t + 0.5;
  },

  bumper(E, t, p) {
    const s = clamp((p.speed ?? 3) / 5, 0.15, 1);
    const v = voice(E, { gain: 0.35 + 0.65 * s, pan: p.pan, verb: 0.14 });
    const ctx = E.ctx, f = 150 + 70 * s, lp = filter(v, 'lowpass', 1900, 0.8);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 12;
    lg.gain.setValueAtTime(f * 0.22, t); lg.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.5);
    lfo.connect(lg); v.nodes.push(lg);
    for (const [mul, type, g] of [[1, 'triangle', 0.42], [2.01, 'sine', 0.12]]) {
      const { o } = osc(v, t, { type, f: f * mul * 0.7, glide: [[f * mul * 1.3, 0.025], [f * mul, 0.12]], gain: g, att: 0.003, dur: 0.55, dest: lp });
      lg.connect(o.frequency);
    }
    lfo.start(t); lfo.stop(t + 0.62); track(v, lfo);
    osc(v, t, { f: 95, glide: [[60, 0.05]], gain: 0.22, att: 0.001, dur: 0.07 });
    noise(v, t, { type: 'bandpass', f: 1200, q: 1, gain: 0.25, att: 0.0005, dur: 0.012 });
    return t + 0.7;
  },

  cupRattle(E, t, p) {
    const v = voice(E, { gain: 0.85, pan: p.pan, verb: 0.06 });
    let tt = t, gap = rnd(0.075, 0.095), amp = 1;
    const n = 5 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const d = rnd(0.94, 1.06);
      noise(v, tt, { type: 'bandpass', f: 3300 * d, q: 1.4, gain: 0.28 * amp, att: 0.0005, dur: 0.008 });
      modal(v, tt, [[1720 * d, 0.2 * amp, 0.06], [2980 * d, 0.11 * amp, 0.04], [4350 * d, 0.045 * amp, 0.025]]);
      tt += gap; gap *= rnd(0.7, 0.82); amp *= rnd(0.72, 0.9);
    }
    noise(v, t, { type: 'bandpass', f: 1500, f2: 2500, q: 3, gain: 0.07, att: 0.04, dur: Math.max(0.1, tt - t) });
    return tt + 0.15;
  },

  cupDrop(E, t, p) {
    const v = voice(E, { gain: 0.9, pan: p.pan, verb: 0.12 });
    const hit = (tt, a, d) => {
      noise(v, tt, { type: 'lowpass', f: 900 * d, q: 0.7, gain: 0.45 * a, att: 0.001, dur: 0.05 });
      noise(v, tt, { type: 'bandpass', f: 430 * d, q: 9, gain: 1.6 * a, att: 0.002, dur: 0.22 });
      modal(v, tt, [[310 * d, 0.28 * a, 0.3], [655 * d, 0.14 * a, 0.15], [1290 * d, 0.06 * a, 0.07], [2140 * d, 0.035 * a, 0.03]]);
    };
    osc(v, t, { f: 140, glide: [[75, 0.09]], gain: 0.28, att: 0.001, dur: 0.12 });
    hit(t, 1, 1); hit(t + 0.12, 0.36, 1.04); hit(t + 0.2, 0.14, 1.07); hit(t + 0.25, 0.06, 1.1);
    return t + 0.7;
  },

  lipOut(E, t, p) {
    const v = voice(E, { gain: 0.85, pan: p.pan, verb: 0.1 });
    // the ball spinning round the rim: a scrape whose level wobbles faster and faster
    const ctx = E.ctx, am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    am.gain.value = 0.5; am.connect(v.in); lg.gain.value = 0.5;
    lfo.frequency.setValueAtTime(14, t); lfo.frequency.linearRampToValueAtTime(22, t + 0.35);
    lfo.connect(lg); lg.connect(am.gain); lfo.start(t); lfo.stop(t + 0.45); track(v, lfo); v.nodes.push(am, lg);
    noise(v, t, { type: 'bandpass', f: 900, f2: 1700, q: 4, gain: 0.12, att: 0.03, dur: 0.36, dest: am });
    for (const [dt, a] of [[0.06, 0.6], [0.19, 0.8], [0.31, 1]]) {
      const d = rnd(0.95, 1.05);
      modal(v, t + dt, [[1720 * d, 0.16 * a, 0.05], [2980 * d, 0.08 * a, 0.03]]);
    }
    noise(v, t + 0.36, { type: 'lowpass', f: 1100, q: 0.7, gain: 0.3, att: 0.001, dur: 0.05 });
    // a soft "aww": two falling notes, very quiet
    const lp = filter(v, 'lowpass', 1400, 0.5);
    osc(v, t + 0.45, { type: 'triangle', f: mtof(69), gain: 0.07, att: 0.02, dur: 0.22, dest: lp });
    osc(v, t + 0.62, { type: 'triangle', f: mtof(65), glide: [[mtof(64), 0.4]], gain: 0.07, att: 0.02, dur: 0.5, dest: lp });
    return t + 1.3;
  },

  splash(E, t, p) {
    const v = voice(E, { gain: 0.9, pan: p.pan, verb: 0.2 });
    noise(v, t, { type: 'lowpass', f: 6000, f2: 700, q: 0.6, gain: 0.5, att: 0.006, dur: 0.4, sweep: 0.35 });
    noise(v, t + 0.01, { kind: 'pink', type: 'bandpass', f: 600, q: 0.8, gain: 0.4, att: 0.02, dur: 0.6 });
    for (let i = 0; i < 9; i++) {
      const tt = t + rnd(0.06, 0.65), f = rnd(450, 1300);
      osc(v, tt, { f, glide: [[f * 1.7, 0.04]], gain: rnd(0.04, 0.09), att: 0.003, dur: 0.06 });
    }
    for (let i = 0; i < 6; i++) noise(v, t + rnd(0.12, 0.7), { type: 'bandpass', f: rnd(2500, 4500), q: 3, gain: rnd(0.04, 0.09), att: 0.001, dur: 0.02 });
    return t + 1.1;
  },

  fall(E, t, p) {
    const v = voice(E, { gain: 0.9, pan: p.pan, verb: 0.15 });
    noise(v, t, { kind: 'pink', type: 'bandpass', f: 2200, f2: 260, q: 2, gain: 0.55, att: 0.35, hold: 0.2, dur: 0.95, sweep: 1.4 });
    noise(v, t, { kind: 'brown', type: 'lowpass', f: 400, f2: 150, q: 0.7, gain: 0.25, att: 0.4, dur: 1.0, sweep: 1.3 });
    osc(v, t + 0.05, { f: 1100, glide: [[280, 1.2]], gain: 0.035, att: 0.2, dur: 1.0 });
    if (v.pan) { v.pan.pan.setValueAtTime(-0.3, t); v.pan.pan.linearRampToValueAtTime(0.3, t + 1.4); }
    return t + 1.7;
  },

  boost(E, t, p) {
    const v = voice(E, { gain: 1.4, pan: p.pan, verb: 0.15 });
    noise(v, t, { type: 'bandpass', f: 500, f2: 5000, q: 4, gain: 0.5, att: 0.05, dur: 0.45, sweep: 0.4 });
    const lp = E.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    lp.connect(v.in); v.nodes.push(lp);
    osc(v, t, { type: 'sawtooth', f: 110, glide: [[440, 0.35]], gain: 0.12, att: 0.03, dur: 0.4, dest: lp });
    osc(v, t, { type: 'sawtooth', f: 165, glide: [[660, 0.35]], gain: 0.06, att: 0.03, dur: 0.4, dest: lp });
    sparkle(v, t + 0.3, 3, [93, 97, 100], 0.05, 0.15);
    return t + 1.0;
  },

  loop(E, t, p) {
    const v = voice(E, { gain: 1.5, verb: 0.2 });
    const n = noise(v, t, { kind: 'pink', type: 'bandpass', f: 400, q: 1.6, gain: 0.55, att: 0.4, dur: 0.6 });
    n.flt.frequency.cancelScheduledValues(t);
    n.flt.frequency.setValueAtTime(400, t);
    n.flt.frequency.exponentialRampToValueAtTime(1900, t + 0.45);
    n.flt.frequency.exponentialRampToValueAtTime(450, t + 1.0);
    if (v.pan) { v.pan.pan.setValueAtTime(-0.8, t); v.pan.pan.linearRampToValueAtTime(0.8, t + 1.0); }
    return t + 1.2;
  },

  pickup(E, t, p) {
    const st = E.state, now = t;
    st.pickN = (st.pickT !== undefined && now - st.pickT < 2) ? Math.min((st.pickN || 0) + 1, PENTA.length - 1) : 0;
    st.pickT = now;
    const i = p.combo ?? st.pickN, m = PENTA[Math.min(i, PENTA.length - 1)];
    const v = voice(E, { gain: 0.9, pan: p.pan, verb: 0.3 });
    bell(v, t, { f: mtof(m), gain: 0.2, dur: 0.9, ratio: 3.5, index: 1.0 });
    osc(v, t, { f: mtof(m + 12), gain: 0.07, att: 0.002, dur: 0.35 });
    bell(v, t + 0.055, { f: mtof(m + 7), gain: 0.09, dur: 0.7, ratio: 3.5, index: 0.7 });
    noise(v, t, { type: 'highpass', f: 7000, q: 0.7, gain: 0.05, att: 0.001, dur: 0.05 });
    return t + 1.1;
  },

  holeInOne(E, t) {
    const v = voice(E, { gain: 0.9, verb: 0.28 });
    for (const [m, dt, d] of [[62, 0, 0.12], [66, 0.13, 0.12], [69, 0.26, 0.12], [74, 0.39, 0.38]]) brass(v, t + dt, m, d, 0.11);
    for (const m of [50, 62, 66, 69, 74]) brass(v, t + 0.85, m, 1.5, m === 50 ? 0.09 : 0.065);
    noise(v, t + 0.85, { type: 'highpass', f: 7000, q: 0.7, gain: 0.07, att: 0.02, dur: 1.8 });
    [86, 90, 93, 98].forEach((m, i) => bell(v, t + 0.85 + i * 0.07, { f: mtof(m), gain: 0.07, dur: 1.2, ratio: 3.5, index: 0.8 }));
    osc(v, t + 0.85, { f: mtof(38), gain: 0.18, att: 0.01, dur: 0.9 });
    crowd(E, t + 0.45, 0.9);
    return t + 4.1;
  },

  birdie(E, t) {
    const v = voice(E, { gain: 0.9, verb: 0.3 });
    [74, 78, 81, 86].forEach((m, i) => bell(v, t + i * 0.09, { f: mtof(m), gain: i === 3 ? 0.17 : 0.13, dur: i === 3 ? 1.3 : 0.6, ratio: 3.5, index: 1 }));
    softChord(v, t + 0.27, [62, 66, 69, 74], 1.1, 0.045);
    sparkle(v, t + 0.3, 4, [93, 98, 102], 0.04, 0.4);
    return t + 1.8;
  },

  par(E, t) {
    const v = voice(E, { gain: 0.9, verb: 0.25 });
    bell(v, t, { f: mtof(74), gain: 0.14, dur: 0.6, ratio: 3.5, index: 0.9 });
    bell(v, t + 0.14, { f: mtof(81), gain: 0.15, dur: 1.0, ratio: 3.5, index: 0.9 });
    softChord(v, t + 0.14, [62, 69, 74], 0.9, 0.04);
    return t + 1.4;
  },

  bogey(E, t) {
    const v = voice(E, { gain: 0.9, verb: 0.2 });
    const lp = filter(v, 'lowpass', 1300, 0.6);
    osc(v, t, { type: 'triangle', f: mtof(69), gain: 0.16, att: 0.015, hold: 0.1, dur: 0.12, dest: lp });
    osc(v, t + 0.2, { type: 'triangle', f: mtof(68), gain: 0.16, att: 0.015, hold: 0.1, dur: 0.12, dest: lp });
    const { o } = osc(v, t + 0.42, { type: 'triangle', f: mtof(64), gain: 0.17, att: 0.02, hold: 0.25, dur: 0.45, dest: lp });
    const lfo = E.ctx.createOscillator(), lg = E.ctx.createGain();
    lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t + 0.42); lg.gain.linearRampToValueAtTime(14, t + 0.8);
    lfo.connect(lg); lg.connect(o.detune); lfo.start(t + 0.42); lfo.stop(t + 1.2); track(v, lfo); v.nodes.push(lg);
    osc(v, t + 0.42, { type: 'sine', f: mtof(52), gain: 0.08, att: 0.02, hold: 0.2, dur: 0.45 });
    return t + 1.4;
  },

  // ---- UI ----
  click(E, t) {
    const v = voice(E, { gain: 0.7, verb: 0.02 });
    osc(v, t, { f: 1500, glide: [[1000, 0.025]], gain: 0.16, att: 0.001, dur: 0.035 });
    noise(v, t, { type: 'highpass', f: 3000, q: 0.7, gain: 0.08, att: 0.0005, dur: 0.006 });
    return t + 0.1;
  },

  back(E, t) {
    const v = voice(E, { gain: 0.7, verb: 0.02 });
    osc(v, t, { f: 950, glide: [[700, 0.03]], gain: 0.13, att: 0.001, dur: 0.04 });
    osc(v, t + 0.055, { f: 700, glide: [[480, 0.04]], gain: 0.13, att: 0.001, dur: 0.06 });
    return t + 0.2;
  },

  star(E, t, p) {
    const n = clamp(Math.round(p.n ?? 1), 1, 3), m = [81, 85, 88][n - 1];
    const v = voice(E, { gain: 0.85, verb: 0.3 });
    bell(v, t, { f: mtof(m), gain: 0.18, dur: 1.0 + 0.2 * n, ratio: 3.5, index: 1.1 });
    bell(v, t + 0.04, { f: mtof(m + 7), gain: 0.07, dur: 0.8, ratio: 3.5, index: 0.7 });
    osc(v, t, { f: mtof(m - 12), gain: 0.06, att: 0.005, dur: 0.5 });
    sparkle(v, t + 0.06, 2 + n, [93, 97, 100, 105], 0.035, 0.3 + 0.1 * n);
    return t + 1.6;
  },

  coin(E, t) {
    const v = voice(E, { gain: 0.8, verb: 0.15 });
    bell(v, t, { f: mtof(83), gain: 0.13, dur: 0.12, ratio: 2, index: 0.8 });
    bell(v, t + 0.07, { f: mtof(88), gain: 0.15, dur: 0.55, ratio: 2, index: 0.8 });
    osc(v, t + 0.07, { f: mtof(100), gain: 0.03, att: 0.002, dur: 0.2 });
    return t + 0.8;
  },

  aimTick(E, t, p) {
    const pw = clamp(p.power ?? 0.5);
    const v = voice(E, { gain: 0.6, verb: 0 });
    noise(v, t, { type: 'bandpass', f: 2600 + 3000 * pw, q: 2, gain: 0.12, att: 0.0005, dur: 0.01 });
    osc(v, t, { f: 1900 + 1400 * pw, gain: 0.035, att: 0.001, dur: 0.018 });
    return t + 0.05;
  },
};

// min seconds between two plays of the same sound (stops machine-gun stacking)
export const THROTTLE = { wall: 0.035, windmillHit: 0.08, bumper: 0.06, aimTick: 0.035, click: 0.03, back: 0.03,
  cupRattle: 0.3, cupDrop: 0.3, lipOut: 0.3, splash: 0.3, fall: 0.5, holeInOne: 1, birdie: 0.5, par: 0.5, bogey: 0.5,
  loop: 0.3, boost: 0.15, pickup: 0.03, coin: 0.04, star: 0.12, putt: 0.08 };

// seconds to auto-duck the music under celebratory stingers
export const AUTODUCK = { holeInOne: 4.2, birdie: 1.8, par: 1.2, bogey: 1.2 };

export const SFX_NAMES = Object.keys(SFX);
