// audio.js — char 23 as sound: a two-oscillator pad + filtered wind,
// crossfaded between worlds. Plus tiny procedural UI sounds. All Web Audio.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('uw-muted') === '1';
    this.pad = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.14;
    this.master.connect(this.ctx.destination);
    // shared noise buffer for wind
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('uw-muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.14, this.ctx.currentTime + 0.3);
    return this.muted;
  }

  // crossfade the ambient bed to a new world's soundscape
  setWorld(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.pad) {
      const old = this.pad;
      old.gain.gain.linearRampToValueAtTime(0, t + 2.5);
      setTimeout(() => { try { old.oscA.stop(); old.oscB.stop(); old.wind.stop(); } catch (e) {} }, 2800);
    }
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(1, t + 3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = s.cutoff;
    filter.Q.value = 0.7;
    const oscA = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = s.root;
    const oscB = this.ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = s.root * 1.5 + s.detune;
    const ogain = this.ctx.createGain();
    ogain.gain.value = 0.16;
    // slow LFO breathing
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = s.lfo;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.07;
    lfo.connect(lfoG); lfoG.connect(ogain.gain);
    oscA.connect(ogain); oscB.connect(ogain);
    ogain.connect(filter);
    // wind
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuf; wind.loop = true;
    const wFilter = this.ctx.createBiquadFilter();
    wFilter.type = 'bandpass';
    wFilter.frequency.value = 300 + s.wind * 500;
    wFilter.Q.value = 0.5;
    const wGain = this.ctx.createGain();
    wGain.gain.value = s.wind * 0.35;
    wind.connect(wFilter); wFilter.connect(wGain);
    wGain.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start(); oscB.start(); lfo.start(); wind.start();
    this.pad = { gain, oscA, oscB, wind };
  }

  _tone(freq, dur, type = 'sine', vol = 0.5, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(t + dur + 0.05);
  }

  blip() { this._tone(880, 0.09, 'square', 0.25); }
  copyBlip() { this._tone(1320, 0.07, 'square', 0.2); this._tone(1760, 0.1, 'square', 0.15); }
  connectSound() {
    this._tone(220, 0.7, 'sawtooth', 0.3, 880);
    this._tone(331, 0.7, 'sawtooth', 0.2, 1320);
  }
  whoosh() { this._tone(160, 1.1, 'sine', 0.4, 40); }
  carStart() { this._tone(70, 0.5, 'sawtooth', 0.4, 140); }
}
