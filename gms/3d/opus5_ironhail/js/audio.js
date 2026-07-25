// Procedural Web Audio — no asset files at all. One-shots take a volume
// multiplier so distant fights sound distant; the engine and weather are
// continuous nodes retuned every frame.

import { profile, markDirty } from './save.js';

export const AudioFX = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: false,
  engine: null,
  weather: null,
  started: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.muted = !!profile.settings.muted;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 1.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbient();
    this.started = true;
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    profile.settings.muted = m;
    markDirty();
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  env(g, peak, dur, t0) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },

  noise(dur, t0) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = dur > 1.4;
    s.start(t0);
    s.stop(t0 + dur);
    return s;
  },

  // ---- beds -------------------------------------------------------------

  startAmbient() {
    const t0 = this.ctx.currentTime;
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 300;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.045;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start(t0);
    lfo.start(t0);

    const dg = this.ctx.createGain();
    dg.gain.value = 0.024;
    dg.connect(this.master);
    [43.6, 65.4].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const l = this.ctx.createOscillator();
      l.frequency.value = 0.05 + i * 0.03;
      const lg = this.ctx.createGain();
      lg.gain.value = 2.4;
      l.connect(lg).connect(o.detune);
      o.connect(dg);
      o.start(t0);
      l.start(t0);
    });
  },

  // Continuous engine note; call setEngine() every frame while driving.
  startEngine() {
    if (!this.ctx || this.engine) return;
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const o1 = this.ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 42;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 21;
    const rumble = this.ctx.createBufferSource();
    rumble.buffer = this.noiseBuf;
    rumble.loop = true;
    const rg = this.ctx.createGain();
    rg.gain.value = 0.35;
    o1.connect(lp); o2.connect(lp); rumble.connect(rg).connect(lp);
    lp.connect(g).connect(this.master);
    o1.start(t0); o2.start(t0); rumble.start(t0);
    this.engine = { g, lp, o1, o2 };
  },

  setEngine(throttle, speedFrac) {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    const rpm = 34 + speedFrac * 58 + throttle * 16;
    e.o1.frequency.setTargetAtTime(rpm, t, 0.12);
    e.o2.frequency.setTargetAtTime(rpm * 0.5, t, 0.12);
    e.lp.frequency.setTargetAtTime(280 + speedFrac * 700, t, 0.15);
    e.g.gain.setTargetAtTime(0.05 + throttle * 0.055 + speedFrac * 0.03, t, 0.2);
  },

  stopEngine() {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.g.gain.setTargetAtTime(0, t, 0.25);
    const e = this.engine;
    this.engine = null;
    setTimeout(() => {
      try { e.o1.stop(); e.o2.stop(); } catch (err) { /* already stopped */ }
    }, 900);
  },

  // Rain / wind bed for the weather presets.
  setWeatherBed(kind) {
    if (!this.ctx) return;
    if (this.weather) {
      const w = this.weather;
      this.weather = null;
      w.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => { try { w.src.stop(); } catch (e) { /* ok */ } }, 1400);
    }
    if (kind !== 'rain' && kind !== 'snow' && kind !== 'dust') return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = kind === 'rain' ? 'highpass' : 'lowpass';
    f.frequency.value = kind === 'rain' ? 900 : 420;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(kind === 'rain' ? 0.085 : 0.045, t0, 1.2);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    this.weather = { src, g };
  },

  // ---- weapons ---------------------------------------------------------

  gun(kind, vol = 1) {
    if (!this.ctx || vol < 0.04) return;
    const t0 = this.ctx.currentTime;
    const cfg = {
      direct: { crack: 1900, body: 150, dur: 0.34, peak: 0.42, sub: 62 },
      burst:  { crack: 2600, body: 260, dur: 0.14, peak: 0.24, sub: 110 },
      arc:    { crack: 900,  body: 96,  dur: 0.5,  peak: 0.5,  sub: 44 },
      salvo:  { crack: 1400, body: 200, dur: 0.4,  peak: 0.3,  sub: 80 },
      rail:   { crack: 3400, body: 420, dur: 0.42, peak: 0.36, sub: 150 },
      cluster:{ crack: 1000, body: 110, dur: 0.46, peak: 0.46, sub: 48 },
    }[kind] || { crack: 1900, body: 150, dur: 0.34, peak: 0.42, sub: 62 };

    const src = this.noise(cfg.dur, t0);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(cfg.crack, t0);
    hp.frequency.exponentialRampToValueAtTime(Math.max(120, cfg.crack * 0.12), t0 + cfg.dur);
    const g = this.ctx.createGain();
    this.env(g, cfg.peak * vol, cfg.dur, t0);
    src.connect(hp).connect(g).connect(this.master);

    const o = this.ctx.createOscillator();
    o.type = kind === 'rail' ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(cfg.body, t0);
    o.frequency.exponentialRampToValueAtTime(cfg.sub * 0.5, t0 + cfg.dur * 0.9);
    const og = this.ctx.createGain();
    this.env(og, cfg.peak * 0.75 * vol, cfg.dur * 1.1, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + cfg.dur * 1.2);

    if (kind === 'rail') {
      const z = this.ctx.createOscillator();
      z.type = 'sine';
      z.frequency.setValueAtTime(2400, t0);
      z.frequency.exponentialRampToValueAtTime(180, t0 + 0.3);
      const zg = this.ctx.createGain();
      this.env(zg, 0.22 * vol, 0.3, t0);
      z.connect(zg).connect(this.master);
      z.start(t0);
      z.stop(t0 + 0.34);
    }
  },

  // Falling-shell whistle — pitch descends as it comes down.
  whistle(vol = 1, dur = 1.1) {
    if (!this.ctx || vol < 0.06) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1500, t0);
    o.frequency.exponentialRampToValueAtTime(320, t0 + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 2.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09 * vol, t0 + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(f).connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  },

  boom(big, vol = 1) {
    if (!this.ctx || vol < 0.04) return;
    const t0 = this.ctx.currentTime;
    const dur = big ? 1.15 : 0.6;
    const src = this.noise(dur, t0);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 1600 : 1000, t0);
    f.frequency.exponentialRampToValueAtTime(55, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, (big ? 0.6 : 0.34) * vol, dur, t0);
    src.connect(f).connect(g).connect(this.master);

    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 120 : 100, t0);
    o.frequency.exponentialRampToValueAtTime(30, t0 + dur * 0.8);
    const og = this.ctx.createGain();
    this.env(og, (big ? 0.55 : 0.3) * vol, dur * 0.85, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur);
  },

  // Metal-on-metal impact.
  clang(vol = 1) {
    if (!this.ctx || vol < 0.04) return;
    const t0 = this.ctx.currentTime;
    [520, 780, 1180].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 0.72, t0 + 0.2);
      const g = this.ctx.createGain();
      this.env(g, (0.16 - i * 0.04) * vol, 0.22, t0);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.25);
    });
    const src = this.noise(0.12, t0);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const g = this.ctx.createGain();
    this.env(g, 0.16 * vol, 0.12, t0);
    src.connect(hp).connect(g).connect(this.master);
  },

  ricochet(vol = 1) {
    if (!this.ctx || vol < 0.04) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2600, t0);
    o.frequency.exponentialRampToValueAtTime(600, t0 + 0.28);
    const g = this.ctx.createGain();
    this.env(g, 0.16 * vol, 0.3, t0);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.34);
  },

  // ---- interface -------------------------------------------------------

  reloadReady() { this.blip(880, 0.1, 0.07); this.blip(1320, 0.1, 0.06, 0.06); },
  lock() { this.blip(1480, 0.06, 0.05); },
  spotPing() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1750, t0);
    const g = this.ctx.createGain();
    this.env(g, 0.07, 0.42, t0);
    const dl = this.ctx.createDelay();
    dl.delayTime.value = 0.14;
    const dg = this.ctx.createGain();
    dg.gain.value = 0.4;
    o.connect(g).connect(this.master);
    g.connect(dl).connect(dg).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.45);
  },

  blip(freq, dur = 0.09, peak = 0.08, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, peak, dur, t0);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  },

  click() { this.blip(320, 0.05, 0.05); },
  tick() { this.blip(520, 0.08, 0.07); },

  horn() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [0, 8].forEach((det) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(120, t0);
      o.frequency.linearRampToValueAtTime(240, t0 + 0.5);
      const g = this.ctx.createGain();
      this.env(g, 0.1, 0.7, t0);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.75);
    });
  },

  fanfare() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [392, 523, 659, 784, 1046].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, 0.1, 0.34, t0 + i * 0.12);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.12);
      o.stop(t0 + i * 0.12 + 0.36);
    });
  },

  dirge() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [294, 233, 175].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, 0.09, 0.6, t0 + i * 0.28);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.28);
      o.stop(t0 + i * 0.28 + 0.65);
    });
  },

  levelUp() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, 0.12, 0.3, t0 + i * 0.08);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.08);
      o.stop(t0 + i * 0.08 + 0.32);
    });
  },

  pickup() {
    this.blip(700, 0.12, 0.1);
    this.blip(1050, 0.14, 0.09, 0.07);
  },

  thunder() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.35;
    const dur = 2.4;
    const src = this.noise(dur, t0);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t0);
    f.frequency.exponentialRampToValueAtTime(70, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
  },

  droneHum(on) {
    if (!this.ctx) return;
    if (on && !this.dh) {
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 190;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 800;
      f.Q.value = 1.4;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.03, t0, 0.3);
      o.connect(f).connect(g).connect(this.master);
      o.start(t0);
      this.dh = { o, g };
    } else if (!on && this.dh) {
      const d = this.dh;
      this.dh = null;
      d.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      setTimeout(() => { try { d.o.stop(); } catch (e) { /* ok */ } }, 700);
    }
  },
};
