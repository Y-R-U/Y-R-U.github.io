// ---- procedural WebAudio: crowd, whistle, kicks, cheers ----
import { clamp, rand } from './util.js';

class AudioSys {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.crowdGain = null;
    this.crowdFilter = null;
    this.excite = 0;        // 0 calm .. 1 bedlam
    this._target = 0;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(c.destination);

    // shared noise buffer (2s white)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // crowd bed: looped noise -> lowpass -> slow tremolo
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    this.crowdFilter = c.createBiquadFilter();
    this.crowdFilter.type = 'lowpass';
    this.crowdFilter.frequency.value = 400;
    this.crowdGain = c.createGain();
    this.crowdGain.gain.value = 0;
    const trem = c.createOscillator();
    trem.frequency.value = 0.17;
    const tremG = c.createGain();
    tremG.gain.value = 0.02;
    trem.connect(tremG); tremG.connect(this.crowdGain.gain);
    src.connect(this.crowdFilter); this.crowdFilter.connect(this.crowdGain);
    this.crowdGain.connect(this.master);
    src.start(); trem.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  // crowd bed on/off (matches only)
  setCrowd(on) { this._crowdOn = on; if (!on) this.excite = 0; }

  bump(amount) { this.excite = clamp(this.excite + amount, 0, 1); }

  update(dt) {
    if (!this.ctx || !this.crowdGain) return;
    this.excite = Math.max(this._target, this.excite - dt * 0.18);
    const base = this._crowdOn ? 0.05 + this.excite * 0.22 : 0;
    this.crowdGain.gain.setTargetAtTime(base, this.ctx.currentTime, 0.25);
    this.crowdFilter.frequency.setTargetAtTime(400 + this.excite * 2200, this.ctx.currentTime, 0.3);
  }

  _noise(dur, { freq = 1200, q = 1, type = 'bandpass', gain = 0.4, attack = 0.005, decayTo = 0.001 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = rand(0.9, 1.1);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(decayTo, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  _tone(freq, dur, { type = 'square', gain = 0.15, slide = 0, attack = 0.005 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  click()  { this._tone(880, 0.06, { type: 'triangle', gain: 0.12 }); }
  back()   { this._tone(520, 0.07, { type: 'triangle', gain: 0.1 }); }

  kick(p = 0.5) {
    this._noise(0.09, { freq: 300 + p * 250, type: 'lowpass', gain: 0.5 + p * 0.35, q: 0.5 });
    this._tone(120 + p * 60, 0.08, { type: 'sine', gain: 0.3, slide: -60 });
  }
  bounce() { this._noise(0.05, { freq: 400, type: 'lowpass', gain: 0.18, q: 0.5 }); }
  catchBall() { this._noise(0.08, { freq: 700, type: 'lowpass', gain: 0.25 }); }
  net()  { this._noise(0.25, { freq: 2600, q: 0.7, gain: 0.2 }); }
  post() { this._tone(320, 0.35, { type: 'square', gain: 0.2, slide: -20 }); this.bump(0.5); }
  slide() { this._noise(0.28, { freq: 900, type: 'lowpass', gain: 0.2 }); }

  whistle(blasts = 1, long = false) {
    if (!this.ctx || !this.enabled) return;
    const dur = long ? 0.75 : 0.28;
    for (let i = 0; i < blasts; i++) {
      setTimeout(() => {
        this._tone(2350, dur, { type: 'square', gain: 0.12 });
        this._tone(2093, dur, { type: 'square', gain: 0.1 });
        this._noise(dur, { freq: 2500, q: 6, gain: 0.12 });
      }, i * (dur * 1000 + 140));
    }
  }

  cheer() { // big goal roar
    this._noise(2.2, { freq: 1400, q: 0.4, gain: 0.55, attack: 0.08, decayTo: 0.01 });
    this._noise(1.4, { freq: 500, type: 'lowpass', gain: 0.4, attack: 0.05 });
    this._target = 1; this.excite = 1;
    setTimeout(() => { this._target = 0; }, 2500);
  }
  aww() { this._noise(0.9, { freq: 600, q: 0.6, gain: 0.3, attack: 0.06 }); this.bump(0.35); }
  ooh() { this._noise(0.5, { freq: 900, q: 0.8, gain: 0.28, attack: 0.03 }); this.bump(0.45); }
  boo() { this._noise(1.2, { freq: 300, type: 'lowpass', gain: 0.32, attack: 0.1 }); }
}

export const AUDIO = new AudioSys();
