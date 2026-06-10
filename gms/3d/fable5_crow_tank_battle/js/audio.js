// Procedural Web Audio — no asset files. One-shots take a volume multiplier
// so distant fights sound distant. Ambience is dusk wind + a low drone;
// the murder gets a raspy crow caw.

import { MUTE_KEY } from './config.js';

export const AudioFX = {
  ctx: null,
  master: null,
  noiseBuf: null,
  muted: localStorage.getItem(MUTE_KEY) === '1',

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbient();
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMuted(m) {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  env(gainNode, peak, dur, t0) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },

  // Dusk wind through a slow-wandering lowpass + a low two-note drone.
  startAmbient() {
    const t0 = this.ctx.currentTime;

    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const wf = this.ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 320;
    const wg = this.ctx.createGain();
    wg.gain.value = 0.05;
    const wLfo = this.ctx.createOscillator();
    wLfo.frequency.value = 0.09;
    const wLfoG = this.ctx.createGain();
    wLfoG.gain.value = 130;
    wLfo.connect(wLfoG).connect(wf.frequency);
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start(t0);
    wLfo.start(t0);

    const dg = this.ctx.createGain();
    dg.gain.value = 0.03;
    dg.connect(this.master);
    [49, 73.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.04;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = 2.0;
      lfo.connect(lfoG).connect(o.detune);
      o.connect(dg);
      o.start(t0);
      lfo.start(t0);
    });
  },

  // Cannon crack + low thump.
  pew(vol = 1) {
    if (!this.ctx || vol < 0.05) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1100;
    const g = this.ctx.createGain();
    this.env(g, 0.09 * vol, 0.08, t0);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.1);

    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(55, t0 + 0.08);
    const og = this.ctx.createGain();
    this.env(og, 0.07 * vol, 0.09, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.11);
  },

  boom(big, vol = 1) {
    if (!this.ctx || vol < 0.05) return;
    const t0 = this.ctx.currentTime;
    const dur = big ? 0.9 : 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 1400 : 900, t0);
    f.frequency.exponentialRampToValueAtTime(60, t0 + dur);
    const g = this.ctx.createGain();
    this.env(g, (big ? 0.55 : 0.3) * vol, dur, t0);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);

    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 130 : 110, t0);
    o.frequency.exponentialRampToValueAtTime(35, t0 + dur * 0.8);
    const og = this.ctx.createGain();
    this.env(og, (big ? 0.5 : 0.28) * vol, dur * 0.8, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur);
  },

  hit(vol = 1) {
    if (!this.ctx || vol < 0.05) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    this.env(g, 0.2 * vol, 0.09, t0);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + 0.1);

    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 64;
    const og = this.ctx.createGain();
    this.env(og, 0.26 * vol, 0.13, t0);
    o.connect(og).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.15);
  },

  // Crow caw: raspy descending squawk — the voice of the murder.
  caw(pitch = 1, vol = 1) {
    if (!this.ctx || vol < 0.05) return;
    const t0 = this.ctx.currentTime;
    const dur = 0.26 / Math.sqrt(pitch);
    [0, 11].forEach((det) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(640 * pitch, t0);
      o.frequency.linearRampToValueAtTime(820 * pitch, t0 + dur * 0.25);
      o.frequency.exponentialRampToValueAtTime(310 * pitch, t0 + dur);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100 * pitch;
      f.Q.value = 1.6;
      const g = this.ctx.createGain();
      this.env(g, 0.14 * vol, dur, t0);
      o.connect(f).connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    });
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1600 * pitch;
    nf.Q.value = 1.2;
    const ng = this.ctx.createGain();
    this.env(ng, 0.06 * vol, dur, t0);
    src.connect(nf).connect(ng).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  },

  pickup() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [660, 990].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, 0.12, 0.18, t0 + i * 0.07);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.07);
      o.stop(t0 + i * 0.07 + 0.2);
    });
  },

  tick() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 440;
    const g = this.ctx.createGain();
    this.env(g, 0.08, 0.09, t0);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.1);
  },

  horn() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [0, 9].forEach((det) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(140, t0);
      o.frequency.linearRampToValueAtTime(280, t0 + 0.45);
      const g = this.ctx.createGain();
      this.env(g, 0.1, 0.6, t0);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
  },

  fanfare() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, 0.1, 0.3, t0 + i * 0.13);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.13);
      o.stop(t0 + i * 0.13 + 0.32);
    });
  },

  dirge() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [330, 262, 196].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      this.env(g, 0.08, 0.5, t0 + i * 0.25);
      o.connect(g).connect(this.master);
      o.start(t0 + i * 0.25);
      o.stop(t0 + i * 0.25 + 0.55);
    });
  },
};
