/* Everything synthesised: a filtered-noise bed for the water, a hum for the
   filter, a bloop for a bubble and a real splash when a fish goes in. */

import { clamp } from './util.js';

export const Audio = {
  ctx: null, master: null, on: true, started: false, vol: 0.6,

  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { this.on = false; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);

    /* water bed: brown noise through a slowly wandering low-pass */
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 430; lp.Q.value = 0.6;
    const bg = c.createGain(); bg.gain.value = 0.32;
    src.connect(lp); lp.connect(bg); bg.connect(this.master); src.start();
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 140;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    this.bed = lp;

    /* filter hum */
    const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 51;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
    const hg = c.createGain(); hg.gain.value = 0.020;
    hum.connect(hf); hf.connect(hg); hg.connect(this.master); hum.start();
    this.hum = hg;

    /* a very quiet pad that only really shows up at night */
    const pad = c.createGain(); pad.gain.value = 0; pad.connect(this.master);
    [110, 164.81, 220].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.05 / (i + 1);
      const t = c.createOscillator(); t.frequency.value = 0.05 + i * 0.017;
      const tg = c.createGain(); tg.gain.value = 0.6;
      t.connect(tg); tg.connect(o.detune); t.start();
      o.connect(g); g.connect(pad); o.start();
    });
    this.pad = pad;
    this.started = true;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  fadeIn() {
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.on ? this.vol : 0, this.ctx.currentTime + 2.2);
  },
  setVolume(v) {
    this.vol = v; this.on = v > 0.001;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  },
  night(n) {
    if (!this.ctx) return;
    this.bed.frequency.setTargetAtTime(430 - n * 190, this.ctx.currentTime, 1.5);
    this.pad.gain.setTargetAtTime(n * 0.5, this.ctx.currentTime, 2.5);
  },
  flow(f) { if (this.hum) this.hum.gain.setTargetAtTime(0.010 + f * 0.028, this.ctx.currentTime, 1.0); },

  blip(freq = 620, dur = 0.09, type = 'sine', vol = 0.09) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur + 0.02);
  },
  bubble() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    const f0 = 280 + Math.random() * 520;
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 0.5, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.9, c.currentTime + 0.07);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(0.045, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
    o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.12);
  },
  splash() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, len = Math.floor(c.sampleRate * 0.55);
    const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (t < 0.05 ? t / 0.05 : 1);
    }
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(1800, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(380, c.currentTime + 0.45);
    const g = c.createGain(); g.gain.value = 0.45;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    for (let i = 0; i < 5; i++) setTimeout(() => this.bubble(), 90 + i * 70 + Math.random() * 80);
  },
  chime(good = true) {
    if (!this.ctx || !this.on) return;
    const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [392, 329.63, 261.63];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.55, 'triangle', 0.06), i * 90));
  },
  fanfare() {
    if (!this.ctx || !this.on) return;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((n, i) =>
      setTimeout(() => this.blip(n, 0.7, 'triangle', 0.075), i * 110));
  },
  alarm() {
    if (!this.ctx || !this.on) return;
    [0, 1].forEach(i => setTimeout(() => this.blip(233, 0.3, 'square', 0.05), i * 240));
  },
  coin() { this.blip(1320, 0.06, 'triangle', 0.03); },
  click() { this.blip(1200, 0.035, 'sine', 0.032); },
};
